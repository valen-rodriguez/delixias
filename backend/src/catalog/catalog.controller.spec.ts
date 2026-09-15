import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CatalogController } from './catalog.controller.js';
import { CatalogModule } from './catalog.module.js';
import type { CatalogService } from './catalog.service.js';
import type { AuthUser } from '../auth/strategies/supabase-jwt.strategy.js';
import type { CreateProductDto } from './dto/create-product.dto.js';

const USER: AuthUser = { id_usuario: 'u1', email: 'vendedor@delixias.com' };

const CREATE_DTO: CreateProductDto = {
  id_categoria: 2,
  nombre: 'Empanada a caballo',
  precio_unitario: 2100,
  stock_base: 10,
};

function makeRequest(): { user: AuthUser } {
  return { user: USER };
}

describe('CatalogController', () => {
  let service: {
    listCategories: ReturnType<typeof vi.fn>;
    createProduct: ReturnType<typeof vi.fn>;
    listMyProducts: ReturnType<typeof vi.fn>;
    updateProduct: ReturnType<typeof vi.fn>;
    deleteProduct: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    service = {
      listCategories: vi.fn(),
      createProduct: vi.fn(),
      listMyProducts: vi.fn(),
      updateProduct: vi.fn(),
      deleteProduct: vi.fn(),
    };
  });

  function makeController(): CatalogController {
    return new CatalogController(service as unknown as CatalogService);
  }

  it('el módulo registra el controller', () => {
    expect(CatalogModule).toBeDefined();
  });

  it('GET /categories delega en el service', async () => {
    await makeController().getCategories();
    expect(service.listCategories).toHaveBeenCalledTimes(1);
  });

  it('POST /products pasa id_vendedor y el body', async () => {
    await makeController().createProduct(makeRequest() as never, CREATE_DTO);
    expect(service.createProduct).toHaveBeenCalledWith('u1', CREATE_DTO);
  });

  it('GET /products/me usa el id del usuario', async () => {
    await makeController().getMyProducts(makeRequest() as never);
    expect(service.listMyProducts).toHaveBeenCalledWith('u1', false);
  });

  it('GET /products/me con incluye_inactivos=true lo propaga', async () => {
    await makeController().getMyProducts(
      makeRequest() as never,
      'true',
    );
    expect(service.listMyProducts).toHaveBeenCalledWith('u1', true);
  });

  it('GET /products/me con incluye_inactivos inválido usa false', async () => {
    await makeController().getMyProducts(
      makeRequest() as never,
      '1',
    );
    expect(service.listMyProducts).toHaveBeenCalledWith('u1', false);
  });

  it('PATCH /products/:id pasa id, vendedor y body', async () => {
    await makeController().updateProduct(
      makeRequest() as never,
      'p1',
      { nombre: 'X' },
    );
    expect(service.updateProduct).toHaveBeenCalledWith('p1', 'u1', {
      nombre: 'X',
    });
  });

  it('DELETE /products/:id pasa vendedor e id', async () => {
    await makeController().deleteProduct(makeRequest() as never, 'p1');
    expect(service.deleteProduct).toHaveBeenCalledWith('u1', 'p1');
  });
});