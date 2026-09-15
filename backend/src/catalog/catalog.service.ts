import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateProductDto } from './dto/create-product.dto.js';
import type { UpdateProductDto } from './dto/update-product.dto.js';
import type { CategoryRow } from './entities/category.entity.js';
import {
  ProductRow,
  SoftDeletedProduct,
} from './entities/product.entity.js';
import {
  CatalogRepository,
  CategoryNotFoundError,
  ProductDeleteBlockedError,
  ProductNotFoundError,
  ProductReductionBlockedError,
} from './catalog.repository.js';

@Injectable()
export class CatalogService {
  constructor(private readonly catalogRepository: CatalogRepository) {}

  async listCategories(): Promise<CategoryRow[]> {
    return this.catalogRepository.listCategories();
  }

  async createProduct(
    idVendedor: string,
    dto: CreateProductDto,
  ): Promise<ProductRow> {
    try {
      return await this.catalogRepository.createProduct(idVendedor, dto);
    } catch (error) {
      if (error instanceof CategoryNotFoundError) {
        throw new NotFoundException({
          error: 'CATEGORY_NOT_FOUND',
          message: error.message,
        });
      }
      throw error;
    }
  }

  async listMyProducts(
    idVendedor: string,
    incluyeInactivos = false,
  ): Promise<ProductRow[]> {
    return this.catalogRepository.listProductsByVendor(
      idVendedor,
      incluyeInactivos,
    );
  }

  async updateProduct(
    idProducto: string,
    idVendedor: string,
    dto: UpdateProductDto,
  ): Promise<ProductRow> {
    const changes = this.buildUpdate(dto);
    try {
      return await this.catalogRepository.updateProduct(
        idProducto,
        idVendedor,
        changes,
      );
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        throw new NotFoundException({
          error: 'PRODUCT_NOT_FOUND',
          message: error.message,
        });
      }
      if (error instanceof ProductReductionBlockedError) {
        throw new ConflictException({
          error: 'STOCK_REDUCTION_BLOCKED_ACTIVE_SHIFT',
          message: error.message,
        });
      }
      throw error;
    }
  }

  async deleteProduct(
    idVendedor: string,
    idProducto: string,
  ): Promise<SoftDeletedProduct> {
    try {
      return await this.catalogRepository.softDeleteProduct(
        idProducto,
        idVendedor,
      );
    } catch (error) {
      if (error instanceof ProductNotFoundError) {
        throw new NotFoundException({
          error: 'PRODUCT_NOT_FOUND',
          message: error.message,
        });
      }
      if (error instanceof ProductDeleteBlockedError) {
        throw new ConflictException({
          error: 'DELETE_BLOCKED_ACTIVE_SHIFT',
          message: error.message,
        });
      }
      throw error;
    }
  }

  private buildUpdate(dto: UpdateProductDto): {
    nombre?: string;
    precio_unitario?: number;
    stock_base?: number;
    hasFotoUrl: boolean;
    foto_url?: string | null;
  } {
    const changes: {
      nombre?: string;
      precio_unitario?: number;
      stock_base?: number;
      hasFotoUrl: boolean;
      foto_url?: string | null;
    } = { hasFotoUrl: false };

    if (dto.nombre !== undefined) changes.nombre = dto.nombre;
    if (dto.precio_unitario !== undefined) {
      changes.precio_unitario = dto.precio_unitario;
    }
    if (dto.stock_base !== undefined) changes.stock_base = dto.stock_base;
    if (dto.foto_url !== undefined) {
      changes.hasFotoUrl = true;
      changes.foto_url = dto.foto_url;
    }
    return changes;
  }
}