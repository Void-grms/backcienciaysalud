import { ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { Prisma, UserStatus } from '@prisma/client';
import type { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import type { Env } from '@config/env.validation';
import { AppEvents, PasswordResetRequestedEvent } from '@shared/events/app-events';
import { PrismaService } from '@shared/prisma/prisma.service';

interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  expiresIn: number;
  user: {
    id: string;
    role: string;
    email: string | null;
    documentNumber: string | null;
    fullName: string | null;
    mustChangePassword: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly events: EventEmitter2,
  ) {}

  async login(identifier: string, password: string, meta: SessionMeta): Promise<LoginResult> {
    const user = await this.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    this.assertNotLocked(user);

    if (user.status === UserStatus.blocked) {
      throw new ForbiddenException('Usuario bloqueado');
    }

    const passwordOk = await bcrypt.compare(password, user.passwordHash);
    if (!passwordOk) {
      await this.registerFailedAttempt(user);
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueTokens(user, meta);
  }

  async refresh(rawToken: string, meta: SessionMeta): Promise<LoginResult> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalido');
    }
    if (!record.user || record.user.deletedAt || record.user.status !== UserStatus.active) {
      throw new UnauthorizedException('Usuario no valido');
    }

    // Idle timeout: si la ultima actividad supera el limite, invalidamos.
    const idleMs = this.config.get('IDLE_TIMEOUT_MINUTES', { infer: true }) * 60_000;
    const idleSince = Date.now() - record.lastActivityAt.getTime();
    if (idleSince > idleMs) {
      await this.prisma.refreshToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      this.emitIdleLogout(record.userId, record.user.role, Math.round(idleSince / 60_000));
      throw new UnauthorizedException('Sesion expirada por inactividad');
    }

    // Cambio de IP: auditamos pero NO invalidamos (decision de UX para usuarios moviles).
    this.maybeAuditIpChange(record, meta.ip);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { revokedAt: new Date() },
    });

    return this.issueTokens(record.user, meta);
  }

  // Heartbeat de actividad: el frontend lo llama mientras el usuario interactua
  // (clics, teclado, etc.) para refrescar lastActivityAt sin emitir un access
  // token nuevo. Usa la cookie refresh para identificar la sesion: si la cookie
  // no es valida, la respuesta es 401 (el frontend reacciona haciendo logout).
  async heartbeat(rawToken: string | undefined, meta: SessionMeta): Promise<void> {
    if (!rawToken) {
      throw new UnauthorizedException('Refresh token ausente');
    }
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        ip: true,
        lastIp: true,
        revokedAt: true,
        expiresAt: true,
        lastActivityAt: true,
        user: { select: { role: true } },
      },
    });

    if (!record || record.revokedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token invalido');
    }

    // Si ya esta idle expirado, devolvemos 401 sin actualizar.
    const idleMs = this.config.get('IDLE_TIMEOUT_MINUTES', { infer: true }) * 60_000;
    if (Date.now() - record.lastActivityAt.getTime() > idleMs) {
      throw new UnauthorizedException('Sesion expirada por inactividad');
    }

    this.maybeAuditIpChange(record, meta.ip);

    await this.prisma.refreshToken.update({
      where: { id: record.id },
      data: { lastActivityAt: new Date(), lastIp: meta.ip ?? record.lastIp },
    });
  }

  private maybeAuditIpChange(
    record: { id: string; userId: string; ip: string | null; lastIp: string | null; user: { role: string } },
    currentIp: string | undefined,
  ): void {
    if (!currentIp) return;
    const previous = record.lastIp ?? record.ip;
    if (!previous || previous === currentIp) return;
    this.events.emit(AppEvents.AuditEvent, {
      action: 'session.ip_changed',
      entityType: 'user',
      entityId: record.userId,
      actorUserId: record.userId,
      actorRole: record.user.role,
      summary: `IP de sesion cambio de ${previous} a ${currentIp}`,
      metadata: { previousIp: previous, currentIp, tokenId: record.id },
    });
  }

  private emitIdleLogout(userId: string, role: string, idleMinutes: number): void {
    this.events.emit(AppEvents.AuditEvent, {
      action: 'session.idle_logout',
      entityType: 'user',
      entityId: userId,
      actorUserId: userId,
      actorRole: role,
      summary: `Sesion cerrada por inactividad (${idleMinutes} min)`,
      metadata: { idleMinutes },
    });
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const tokenHash = this.hashToken(rawToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(email: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt || user.status === UserStatus.blocked) {
      return null;
    }

    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    if (user.email) {
      const payload: PasswordResetRequestedEvent = {
        userId: user.id,
        email: user.email,
        token: rawToken,
      };
      this.events.emit(AppEvents.PasswordResetRequested, payload);
    }

    return rawToken;
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Token de reseteo invalido o expirado');
    }

    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const passwordHash = await bcrypt.hash(newPassword, cost);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          mustChangePassword: false,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Contrasena actual incorrecta');
    }
    const cost = this.config.get('PASSWORD_BCRYPT_COST', { infer: true });
    const passwordHash = await bcrypt.hash(newPassword, cost);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
  }

  async getCurrentUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        documentNumber: true,
        role: true,
        status: true,
        fullName: true,
        mustChangePassword: true,
        lastLoginAt: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }
    return user;
  }

  getRefreshCookieMaxAge(): number {
    return this.parseDurationMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  private async findByIdentifier(identifier: string): Promise<User | null> {
    const filter: Prisma.UserWhereInput = identifier.includes('@')
      ? { email: identifier }
      : { documentNumber: identifier };
    return this.prisma.user.findFirst({
      where: { ...filter, deletedAt: null },
    });
  }

  private assertNotLocked(user: User): void {
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        `Cuenta bloqueada hasta ${user.lockedUntil.toISOString()} por intentos fallidos`,
      );
    }
  }

  private async registerFailedAttempt(user: User): Promise<void> {
    const attempts = user.failedLoginAttempts + 1;
    const data: Prisma.UserUpdateInput = { failedLoginAttempts: attempts };
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      data.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
      data.failedLoginAttempts = 0;
    }
    await this.prisma.user.update({ where: { id: user.id }, data });
  }

  private async issueTokens(user: User, meta: SessionMeta): Promise<LoginResult> {
    const accessTtl = this.parseDurationSeconds(this.config.get('JWT_ACCESS_TTL', { infer: true }));
    const refreshTtlMs = this.parseDurationMs(this.config.get('JWT_REFRESH_TTL', { infer: true }));

    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: accessTtl, secret: this.config.get('JWT_SECRET', { infer: true }) },
    );

    const refreshToken = crypto.randomBytes(48).toString('base64url');
    const refreshTokenExpiresAt = new Date(Date.now() + refreshTtlMs);
    const tokenHash = this.hashToken(refreshToken);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        jti: crypto.randomUUID(),
        tokenHash,
        expiresAt: refreshTokenExpiresAt,
        userAgent: meta.userAgent?.slice(0, 500),
        ip: meta.ip?.slice(0, 64),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      expiresIn: accessTtl,
      user: {
        id: user.id,
        role: user.role,
        email: user.email,
        documentNumber: user.documentNumber,
        fullName: user.fullName,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private parseDurationSeconds(value: string): number {
    return Math.floor(this.parseDurationMs(value) / 1000);
  }

  private parseDurationMs(value: string): number {
    const match = /^(\d+)\s*(ms|s|m|h|d)?$/.exec(value.trim());
    if (!match) {
      throw new Error(`Duracion invalida: ${value}`);
    }
    const n = Number(match[1]);
    const unit = match[2] ?? 's';
    const mult: Record<string, number> = {
      ms: 1,
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return n * (mult[unit] ?? 1000);
  }
}
