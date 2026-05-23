import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CatalogStatus,
  Prisma,
  ResultType,
  Test,
} from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { CreateTestDto, TestOptionDto } from './dto/create-test.dto';
import { ListTestsDto } from './dto/list-tests.dto';
import { UpdateTestDto } from './dto/update-test.dto';

@Injectable()
export class TestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListTestsDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.TestWhereInput = { deletedAt: null };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.status) where.status = query.status;
    if (query.resultType) where.resultType = query.resultType;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { code: { contains: query.search, mode: 'insensitive' } },
        { shortName: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.test.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          category: { select: { id: true, name: true, color: true } },
        },
      }),
      this.prisma.test.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const test = await this.prisma.test.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: { select: { id: true, name: true, color: true } },
        professional: { select: { id: true, fullName: true } },
        options: { orderBy: { displayOrder: 'asc' } },
        ranges: { orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] },
      },
    });
    if (!test) throw new NotFoundException('Prueba no encontrada');
    return test;
  }

  async create(dto: CreateTestDto, changedBy?: string) {
    await this.assertCodeAvailable(dto.code);
    await this.assertCategoryExists(dto.categoryId);
    this.assertOptionsConsistent(dto.resultType, dto.options);

    return this.prisma.test.create({
      data: {
        code: dto.code,
        name: dto.name,
        shortName: dto.shortName,
        categoryId: dto.categoryId,
        resultType: dto.resultType,
        unit: dto.unit,
        method: dto.method,
        decimals: dto.decimals ?? 2,
        minCritical: dto.minCritical,
        maxCritical: dto.maxCritical,
        referenceText: dto.referenceText,
        professionalId: dto.professionalId,
        options: dto.options?.length
          ? {
              create: dto.options.map((o, idx) => ({
                value: o.value,
                displayOrder: o.displayOrder ?? idx,
              })),
            }
          : undefined,
      },
      include: { options: true },
    });
  }

  async update(id: string, dto: UpdateTestDto, changedBy?: string) {
    const current = await this.prisma.test.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('Prueba no encontrada');

    if (dto.categoryId && dto.categoryId !== current.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }
    if (dto.resultType ?? dto.options) {
      this.assertOptionsConsistent(dto.resultType ?? current.resultType, dto.options);
    }

    return this.prisma.$transaction(async (tx) => {
      await this.snapshotTest(tx, current, changedBy);

      const updated = await tx.test.update({
        where: { id },
        data: {
          name: dto.name,
          shortName: dto.shortName,
          categoryId: dto.categoryId,
          resultType: dto.resultType,
          unit: dto.unit,
          method: dto.method,
          decimals: dto.decimals,
          minCritical: dto.minCritical,
          maxCritical: dto.maxCritical,
          referenceText: dto.referenceText,
          professionalId: dto.professionalId,
          status: dto.status,
          version: { increment: 1 },
        },
        include: { options: { orderBy: { displayOrder: 'asc' } } },
      });

      if (dto.options) {
        await tx.testOption.deleteMany({ where: { testId: id } });
        if (dto.options.length) {
          await tx.testOption.createMany({
            data: dto.options.map((o, idx) => ({
              testId: id,
              value: o.value,
              displayOrder: o.displayOrder ?? idx,
            })),
          });
        }
      }

      return tx.test.findUnique({
        where: { id },
        include: {
          options: { orderBy: { displayOrder: 'asc' } },
          ranges: true,
          category: { select: { id: true, name: true, color: true } },
        },
      });
    });
  }

  async softDelete(id: string, changedBy?: string) {
    const current = await this.prisma.test.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw new NotFoundException('Prueba no encontrada');

    await this.prisma.$transaction(async (tx) => {
      await this.snapshotTest(tx, current, changedBy);
      await tx.test.update({
        where: { id },
        data: {
          deletedAt: new Date(),
          status: CatalogStatus.inactive,
        },
      });
    });
  }

  async history(id: string) {
    await this.findById(id);
    return this.prisma.testHistory.findMany({
      where: { testId: id },
      orderBy: { version: 'desc' },
    });
  }

  private async assertCodeAvailable(code: string): Promise<void> {
    const existing = await this.prisma.test.findFirst({
      where: { code, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Ya existe una prueba con ese codigo');
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const cat = await this.prisma.category.findFirst({
      where: { id: categoryId, deletedAt: null },
    });
    if (!cat) {
      throw new BadRequestException('Categoria no encontrada');
    }
  }

  private assertOptionsConsistent(
    resultType: ResultType,
    options?: TestOptionDto[] | null,
  ): void {
    if (resultType === ResultType.qualitative) {
      if (!options || options.length < 2) {
        throw new BadRequestException(
          'Las pruebas cualitativas requieren al menos 2 opciones',
        );
      }
    } else if (options && options.length > 0) {
      throw new BadRequestException(
        'Solo las pruebas cualitativas pueden tener opciones predefinidas',
      );
    }
  }

  private async snapshotTest(
    tx: Prisma.TransactionClient,
    current: Test,
    changedBy?: string,
  ): Promise<void> {
    await tx.testHistory.create({
      data: {
        testId: current.id,
        version: current.version,
        code: current.code,
        name: current.name,
        shortName: current.shortName,
        categoryId: current.categoryId,
        resultType: current.resultType,
        unit: current.unit,
        method: current.method,
        decimals: current.decimals,
        minCritical: current.minCritical,
        maxCritical: current.maxCritical,
        referenceText: current.referenceText,
        professionalId: current.professionalId,
        status: current.status,
        validFrom: current.updatedAt,
        validTo: new Date(),
        changedByUserId: changedBy ?? null,
      },
    });
  }
}
