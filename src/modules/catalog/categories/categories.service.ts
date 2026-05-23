import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CatalogStatus, Prisma } from '@prisma/client';

import { PrismaService } from '@shared/prisma/prisma.service';
import { paginated, Paginated } from '@shared/utils/paging';

import { CreateCategoryDto } from './dto/create-category.dto';
import { ListCategoriesDto } from './dto/list-categories.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCategoriesDto): Promise<Paginated<unknown>> {
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 25;

    const where: Prisma.CategoryWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where,
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * perPage,
        take: perPage,
      }),
      this.prisma.category.count({ where }),
    ]);
    return paginated(items, total, page, perPage);
  }

  async findById(id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, deletedAt: null },
      include: { defaultProfessional: { select: { id: true, fullName: true } } },
    });
    if (!category) throw new NotFoundException('Categoria no encontrada');
    return category;
  }

  async create(dto: CreateCategoryDto) {
    await this.assertNameAvailable(dto.name);
    return this.prisma.category.create({ data: dto });
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.findById(id);
    if (dto.name && dto.name !== current.name) {
      await this.assertNameAvailable(dto.name);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async softDelete(id: string) {
    const current = await this.findById(id);
    const testsCount = await this.prisma.test.count({
      where: { categoryId: current.id, deletedAt: null },
    });
    if (testsCount > 0) {
      throw new ConflictException(
        `No se puede eliminar: hay ${testsCount} pruebas activas en esta categoria`,
      );
    }
    await this.prisma.category.update({
      where: { id },
      data: { deletedAt: new Date(), status: CatalogStatus.inactive },
    });
  }

  private async assertNameAvailable(name: string): Promise<void> {
    const existing = await this.prisma.category.findFirst({
      where: { name, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('Ya existe una categoria con ese nombre');
    }
  }
}
