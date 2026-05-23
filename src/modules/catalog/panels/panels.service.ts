import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CatalogStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { AddPanelTestDto } from './dto/add-panel-test.dto';
import { CreatePanelDto, PanelTestEntryDto } from './dto/create-panel.dto';
import { ListPanelsDto } from './dto/list-panels.dto';
import { UpdatePanelDto } from './dto/update-panel.dto';

@Injectable()
export class PanelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListPanelsDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.PanelWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.panel.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: { _count: { select: { panelTests: true } } },
      }),
      this.prisma.panel.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const panel = await this.prisma.panel.findFirst({
      where: { id, deletedAt: null },
      include: {
        panelTests: {
          orderBy: { displayOrder: 'asc' },
          include: {
            test: {
              select: {
                id: true,
                code: true,
                name: true,
                resultType: true,
                unit: true,
                categoryId: true,
              },
            },
          },
        },
      },
    });
    if (!panel) throw new NotFoundException('Panel no encontrado');
    return panel;
  }

  async create(dto: CreatePanelDto) {
    await this.assertCodeAvailable(dto.code);
    if (dto.tests?.length) {
      await this.assertTestsExist(dto.tests);
    }

    return this.prisma.panel.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        defaultProfessionalId: dto.defaultProfessionalId,
        panelTests: dto.tests?.length
          ? {
              create: dto.tests.map((t, idx) => ({
                testId: t.testId,
                displayOrder: t.displayOrder ?? idx,
              })),
            }
          : undefined,
      },
      include: { panelTests: { include: { test: true }, orderBy: { displayOrder: 'asc' } } },
    });
  }

  async update(id: string, dto: UpdatePanelDto) {
    await this.findById(id);
    return this.prisma.panel.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        defaultProfessionalId: dto.defaultProfessionalId,
        status: dto.status,
      },
    });
  }

  async softDelete(id: string) {
    await this.findById(id);
    await this.prisma.panel.update({
      where: { id },
      data: { deletedAt: new Date(), status: CatalogStatus.inactive },
    });
  }

  async addTest(panelId: string, dto: AddPanelTestDto) {
    await this.findById(panelId);
    await this.assertTestsExist([dto]);

    const existing = await this.prisma.panelTest.findUnique({
      where: { panelId_testId: { panelId, testId: dto.testId } },
    });
    if (existing) {
      throw new ConflictException('La prueba ya esta en el panel');
    }

    return this.prisma.panelTest.create({
      data: {
        panelId,
        testId: dto.testId,
        displayOrder: dto.displayOrder ?? 0,
      },
      include: { test: true },
    });
  }

  async removeTest(panelId: string, testId: string) {
    await this.findById(panelId);
    const existing = await this.prisma.panelTest.findUnique({
      where: { panelId_testId: { panelId, testId } },
    });
    if (!existing) {
      throw new NotFoundException('La prueba no esta en el panel');
    }
    await this.prisma.panelTest.delete({
      where: { panelId_testId: { panelId, testId } },
    });
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.prisma.panel.findFirst({
      where: { code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Ya existe un panel con ese codigo');
    }
  }

  private async assertTestsExist(entries: PanelTestEntryDto[] | AddPanelTestDto[]): Promise<void> {
    const ids = entries.map((e) => e.testId);
    const count = await this.prisma.test.count({
      where: { id: { in: ids }, deletedAt: null },
    });
    if (count !== ids.length) {
      throw new BadRequestException('Una o mas pruebas no existen o estan eliminadas');
    }
  }
}
