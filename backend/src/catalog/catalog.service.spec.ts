import { vi } from 'vitest';
import { CatalogService } from './catalog.service.js';
import type { CatalogRepository } from './catalog.repository.js';
import {
  CategoryNotFoundError,
  ProductDeleteBlockedError,
  ProductNotFoundError,
  ProductReductionBlockedError,
} from './catalog.repository.js';
import type { ProductRow } from './entities/product.entity.js';
import type { CreateProductDto } from './dto/create-product.dto.js';

const baseRow: ProductRow = {
  id_producto: 'c6b1d8f4-1e2b-4c4a-8b5a-2f3a4b5c6d7e',
  id_categoria: 2,
  nombre: 'Empanada a caballo',
  precio_unitario: 2100,
  stock_base: 10,
  foto_url:
    'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object/public/productos/empanada.jpg',
  activo: true,
};

const createDto: CreateProductDto = {
  id_categoria: 2,
  nombre: 'Empanada a caballo',
  precio_unitario: 2100,
  stock_base: 10,
  foto_url: baseRow.foto_url,
};

type MockedRepo = {
  [K in keyof CatalogRepository]: ReturnType<typeof vi.fn>;
};

describe('CatalogService', () => {
  let repo: MockedRepo;

  beforeEach(() => {
    repo = {
      listCategories: vi.fn(),
      findProductOwned: vi.fn(),
      listProductsByVendor: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      softDeleteProduct: vi.fn(),
    };
  });

  function makeService(): CatalogService {
    return new CatalogService(repo as unknown as CatalogRepository);
  }

  it('listCategories delega en el repositorio', async () => {
    repo.listCategories.mockResolvedValue([
      { id_categoria: 1, nombre: 'Desayuno/Merienda' },
    ]);
    const categories = await makeService().listCategories();
    expect(categories).toEqual([
      { id_categoria: 1, nombre: 'Desayuno/Merienda' },
    ]);
  });

  it('createProduct devuelve el producto creado', async () => {
    repo.createProduct.mockResolvedValue(baseRow);
    const product = await makeService().createProduct('vendedor-uuid', createDto);
    expect(repo.createProduct).toHaveBeenCalledWith('vendedor-uuid', createDto);
    expect(product).toMatchObject({ nombre: 'Empanada a caballo' });
  });

  it('createProduct con categoría inexistente responde 404 CATEGORY_NOT_FOUND', async () => {
    repo.createProduct.mockRejectedValue(
      new CategoryNotFoundError('La categoría 99 no existe.'),
    );
    await expect(
      makeService().createProduct('vendedor-uuid', createDto),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'CATEGORY_NOT_FOUND' },
    });
  });

  it('listMyProducts lista solo activos del vendedor', async () => {
    repo.listProductsByVendor.mockResolvedValue([baseRow]);
    const products = await makeService().listMyProducts('vendedor-uuid');
    expect(repo.listProductsByVendor).toHaveBeenCalledWith(
      'vendedor-uuid',
      false,
    );
    expect(products).toHaveLength(1);
  });

  it('listMyProducts con incluye_inactivos=true pide incluir inactivos', async () => {
    repo.listProductsByVendor.mockResolvedValue([
      baseRow,
      { ...baseRow, id_producto: 'e2', activo: false },
    ]);
    const products = await makeService().listMyProducts(
      'vendedor-uuid',
      true,
    );
    expect(repo.listProductsByVendor).toHaveBeenCalledWith(
      'vendedor-uuid',
      true,
    );
    expect(products).toHaveLength(2);
  });

  it('updateProduct pasa hasFotoUrl=true y foto_url cuando se envía la foto', async () => {
    repo.updateProduct.mockResolvedValue(baseRow);
    await makeService().updateProduct(baseRow.id_producto, 'vendedor-uuid', {
      foto_url: baseRow.foto_url,
    });
    expect(repo.updateProduct).toHaveBeenCalledWith(
      baseRow.id_producto,
      'vendedor-uuid',
      {
        hasFotoUrl: true,
        foto_url: baseRow.foto_url,
      },
    );
  });

  it('updateProduct con foto_url=null la limpia (hasFotoUrl=true, null)', async () => {
    repo.updateProduct.mockResolvedValue({ ...baseRow, foto_url: null });
    await makeService().updateProduct(baseRow.id_producto, 'vendedor-uuid', {
      foto_url: null,
    });
    expect(repo.updateProduct).toHaveBeenCalledWith(
      baseRow.id_producto,
      'vendedor-uuid',
      { hasFotoUrl: true, foto_url: null },
    );
  });

  it('updateProduct con body vacío no marca foto (hasFotoUrl=false)', async () => {
    repo.updateProduct.mockResolvedValue(baseRow);
    await makeService().updateProduct(baseRow.id_producto, 'vendedor-uuid', {});
    expect(repo.updateProduct).toHaveBeenCalledWith(
      baseRow.id_producto,
      'vendedor-uuid',
      { hasFotoUrl: false },
    );
  });

  it('updateProduct sin precio_unitario no lo incluye en los cambios', async () => {
    repo.updateProduct.mockResolvedValue(baseRow);
    await makeService().updateProduct(baseRow.id_producto, 'vendedor-uuid', {
      nombre: 'XL',
    });
    expect(repo.updateProduct).toHaveBeenCalledWith(
      baseRow.id_producto,
      'vendedor-uuid',
      { nombre: 'XL', hasFotoUrl: false },
    );
  });

  it('updateProduct de producto inexistente responde 404 PRODUCT_NOT_FOUND', async () => {
    repo.updateProduct.mockRejectedValue(
      new ProductNotFoundError('Producto no encontrado.'),
    );
    await expect(
      makeService().updateProduct('missing', 'vendedor-uuid', {
        nombre: 'X',
      }),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'PRODUCT_NOT_FOUND' },
    });
  });

  it('updateProduct reduciendo stock con jornada activa responde 409 STOCK_REDUCTION_BLOCKED_ACTIVE_SHIFT', async () => {
    repo.updateProduct.mockRejectedValue(
      new ProductReductionBlockedError('bloqueado'),
    );
    await expect(
      makeService().updateProduct(baseRow.id_producto, 'vendedor-uuid', {
        stock_base: 1,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'STOCK_REDUCTION_BLOCKED_ACTIVE_SHIFT' },
    });
  });

  it('deleteProduct devuelve baja lógica', async () => {
    repo.softDeleteProduct.mockResolvedValue({
      id_producto: baseRow.id_producto,
      activo: false,
    });
    const result = await makeService().deleteProduct(
      'vendedor-uuid',
      baseRow.id_producto,
    );
    expect(result).toEqual({ id_producto: baseRow.id_producto, activo: false });
  });

  it('deleteProduct con jornada activa responde 409 DELETE_BLOCKED_ACTIVE_SHIFT', async () => {
    repo.softDeleteProduct.mockRejectedValue(
      new ProductDeleteBlockedError('bloqueado'),
    );
    await expect(
      makeService().deleteProduct('vendedor-uuid', baseRow.id_producto),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'DELETE_BLOCKED_ACTIVE_SHIFT' },
    });
  });

  it('deleteProduct de producto inexistente responde 404 PRODUCT_NOT_FOUND', async () => {
    repo.softDeleteProduct.mockRejectedValue(
      new ProductNotFoundError('Producto no encontrado.'),
    );
    await expect(
      makeService().deleteProduct('vendedor-uuid', 'missing'),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'PRODUCT_NOT_FOUND' },
    });
  });
});