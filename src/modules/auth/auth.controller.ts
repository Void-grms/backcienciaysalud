import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import type { Env } from '@config/env.validation';
import { Public } from '@shared/decorators/public.decorator';
import { CurrentUser } from '@shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '@shared/guards/jwt-auth.guard';
import type { AuthUser } from '@shared/auth/auth-user';

import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const REFRESH_COOKIE = 'refreshToken';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  // Limite agresivo para login: 5 intentos/minuto por IP. El lockout a nivel
  // de cuenta (tras N fallos consecutivos) vive en AuthService como segunda
  // capa de defensa.
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login con email/documento y contrasena' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto.identifier, dto.password, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renueva el access token usando la cookie refresh' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string | undefined>;
    const raw = cookies[REFRESH_COOKIE];
    if (!raw) {
      res.clearCookie(REFRESH_COOKIE);
    }
    const result = await this.auth.refresh(raw ?? '', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    this.setRefreshCookie(res, result.refreshToken, result.refreshTokenExpiresAt);
    return {
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = req.cookies as Record<string, string | undefined>;
    await this.auth.logout(cookies[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, this.cookieClearOptions());
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Solicita el envio de un correo con token de reseteo',
    description: 'Por seguridad siempre responde 204, independientemente de si el email existe.',
  })
  async forgot(@Body() dto: ForgotPasswordDto) {
    const token = await this.auth.forgotPassword(dto.email);
    if (token && this.config.get('NODE_ENV', { infer: true }) !== 'production') {
      this.logger.warn(`[DEV] Token de reseteo para ${dto.email}: ${token}`);
    }
  }

  @Public()
  // 3/min: el reset-password recibe un token aleatorio largo, pero limitamos
  // por si alguien intenta enumerar tokens contra una IP especifica.
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async reset(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async change(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto) {
    await this.auth.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @Get('me')
  @ApiOkResponse({ description: 'Usuario autenticado.' })
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getCurrentUser(user.sub);
  }

  private setRefreshCookie(res: Response, token: string, expiresAt: Date): void {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    res.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/api/v1/auth',
      expires: expiresAt,
    });
  }

  private cookieClearOptions() {
    const isProd = this.config.get('NODE_ENV', { infer: true }) === 'production';
    return {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
    };
  }
}
