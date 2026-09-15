import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  CatalogRepository,
  CategoryNotFoundError,
  ProductDeleteBlockedError,
  ProductNotFoundError,
  ProductReductionBlockedError,
} from './catalog.repository.js';
import type { CreateProductDto } from './dto/create-product.dto.js';

type QueryResultLike = { rows: unknown[]; rowCount: number };

function qr(rows: unknown[], rowCount?: number): QueryResultLike {
  return { rows, rowCount: rowCount ?? rows.length };
}

function sequence(values: Array<unknown | Error>): ReturnType<typeof vi.fn> {
  const list = [...values];
  let call = 0;
  return vi.fn(async () => {
    if (call >= list.length) {
      throw new Error(`Unexpected extra query #${call + 1}`);
    }
    const next = list[call++];
    if (next instanceof Error) throw next;
    return next;
  });
}

function makeMocks(): { pool: Pool; client: { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } } {
  const client = { query: vi.fn(), release: vi.fn() };
  const pool = {
    query: vi.fn(),
    connect: vi.fn(async () => client),
  };
  return { pool: pool as unknown as Pool, client };
}

function makeRepo(pool: Pool): CatalogRepository {
  return new CatalogRepository(pool);
}

const PRODUCT_ROW = {
  id_producto: 'p1',
  id_categoria: 2,
  nombre: 'Empanada a caballo',
  precio_unitario: '2100',
  stock_base: 10,
  foto_url: 'https://wyrjgmzsnixpqydvrmrw.supabase.co/storage/v1/object/public/productos/empanada.jpg',
  activo: true,
};

const CREATE_DTO: CreateProductDto = {
  id_categoria: 2,
  nombre: 'Empanada a caballo',
  precio_unitario: 2100,
  stock_base: 10,
  foto_url: PRODUCT_ROW.foto_url,
};

describe('CatalogRepository', () => {
  describe('listas y lectura', () => {
    it('listCategories devuelve las categorías', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(
        qr([{ id_categoria: 1, nombre: 'Desayuno' }], 1),
      );
      const rows = await makeRepo(pool).listCategories();
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('FROM public.categorias'),
      );
      expect(rows).toEqual([{ id_categoria: 1, nombre: 'Desayuno' }]);
    });

    it('listProductsByVendor filtra solo activos por defecto', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([PRODUCT_ROW], 1));
      const rows = await makeRepo(pool).listProductsByVendor('v1', false);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('AND activo = true'),
        ['v1'],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].precio_unitario).toBe(2100);
    });

    it('listProductsByVendor con incluyeInactivos=true omite el filtro de activos', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([PRODUCT_ROW], 1));
      await makeRepo(pool).listProductsByVendor('v1', true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.not.stringContaining('AND activo = true'),
        ['v1'],
      );
    });

    it('findProductOwned devuelve el producto mapeado', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([PRODUCT_ROW], 1));
      const product = await makeRepo(pool).findProductOwned('p1', 'v1');
      expect(product).toMatchObject({ id_producto: 'p1', nombre: 'Empanada a caballo' });
    });

    it('findProductOwned devuelve null si no existe', async () => {
      const { pool } = makeMocks();
      pool.query.mockResolvedValueOnce(qr([], 0));
      const product = await makeRepo(pool).findProductOwned('p1', 'v1');
      expect(product).toBeNull();
    });
  });

  describe('createProduct', () => {
    it('crea sin jornada activa y no sincroniza inventario', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_categoria: 2 }], 1),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([]),
      ]));
      const created = await makeRepo(pool).createProduct('v1', CREATE_DTO);
      expect(created).toMatchObject({ id_producto: 'p1', activo: true });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.productos'),
        ['v1', 2, 'Empanada a caballo', 2100, 10, PRODUCT_ROW.foto_url],
      );
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
      );
      expect(client.query).toHaveBeenCalledWith('COMMIT');
    });

    it('rechaza categoría inexistente (pre-checko)', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).createProduct('v1', CREATE_DTO),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('mapea 23503 a CategoryNotFoundError', async () => {
      const { pool, client } = makeMocks();
      const fkViolation = Object.assign(new Error('fk violation'), {
        code: '23503',
      });
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_categoria: 99 }], 1),
        fkViolation,
        qr([]),
      ]));
      await expect(
        makeRepo(pool).createProduct('v1', { ...CREATE_DTO, id_categoria: 99 }),
      ).rejects.toBeInstanceOf(CategoryNotFoundError);
    });

    it('re-lanza errores no relacionados con FK', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_categoria: 2 }], 1),
        new Error('db disconnected'),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).createProduct('v1', CREATE_DTO),
      ).rejects.toThrow('db disconnected');
    });

    it('con jornada activa y stock>0 sincroniza inventario + kárdex INGRESO', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_categoria: 2 }], 1),
        qr([PRODUCT_ROW], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([], 1),
        qr([], 1),
        qr([]),
      ]));
      await makeRepo(pool).createProduct('v1', CREATE_DTO);
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
        ['j1', 'p1', 10],
      );
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.movimientos_stock'),
        ['p1', 'j1', 10, 10, 'v1'],
      );
    });

    it('con jornada activa y stock_base=0 NO sincroniza inventario', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([{ id_categoria: 2 }], 1),
        qr([{ ...PRODUCT_ROW, stock_base: 0 }], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([]),
      ]));
      await makeRepo(pool).createProduct('v1', { ...CREATE_DTO, stock_base: 0 });
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
      );
    });
  });

  describe('updateProduct', () => {
    it('rechaza producto inexistente', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).updateProduct('p1', 'v1', { hasFotoUrl: false }),
      ).rejects.toBeInstanceOf(ProductNotFoundError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('sin cambios no ejecuta UPDATE', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([]),
      ]));
      const updated = await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: false,
      });
      expect(updated).toMatchObject({ id_producto: 'p1' });
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.productos'),
      );
    });

    it('actualiza precio sin jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([{ ...PRODUCT_ROW, precio_unitario: '2300' }], 1),
        qr([]),
      ]));
      const updated = await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: false,
        precio_unitario: 2300,
      });
      expect(updated.precio_unitario).toBe(2300);
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
      );
    });

    it('aumenta stock_base sin jornada: solo toca productos', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([{ ...PRODUCT_ROW, stock_base: 20 }], 1),
        qr([]),
      ]));
      await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: false,
        stock_base: 20,
      });
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
      );
      expect(client.query).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.movimientos_stock'),
      );
    });

    it('bloquea la reducción de stock con jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).updateProduct('p1', 'v1', {
          hasFotoUrl: false,
          stock_base: 5,
        }),
      ).rejects.toBeInstanceOf(ProductReductionBlockedError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('con jornada activa y refuerzo: sube stock_inicial/actual y escribe INGRESO', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([{ ...PRODUCT_ROW, stock_base: 20 }], 1),
        qr([{ stock_inicial: 10, stock_actual: 10 }], 1),
        qr([], 1),
        qr([], 1),
        qr([]),
      ]));
      await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: false,
        stock_base: 20,
      });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE public.inventario_jornada'),
        ['j1', 'p1', 20, 20],
      );
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.movimientos_stock'),
        ['p1', 'j1', 10, 20, 'v1'],
      );
    });

    it('con jornada activa y producto ajeno al inventario: lo agrega completo', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([{ ...PRODUCT_ROW, stock_base: 20 }], 1),
        qr([], 0),
        qr([], 1),
        qr([], 1),
        qr([]),
      ]));
      await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: false,
        stock_base: 20,
      });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.inventario_jornada'),
        ['j1', 'p1', 20],
      );
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO public.movimientos_stock'),
        ['p1', 'j1', 20, 20, 'v1'],
      );
    });

    it('foto_url=null limpia el campo', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([{ ...PRODUCT_ROW, foto_url: null }], 1),
        qr([]),
      ]));
      await makeRepo(pool).updateProduct('p1', 'v1', {
        hasFotoUrl: true,
        foto_url: null,
      });
      const updateCall = client.query.mock.calls.find(([sql]) =>
        String(sql).includes('UPDATE public.productos'),
      );
      expect(String(updateCall[0])).toContain('SET foto_url = $2');
      expect(updateCall[1]).toEqual(['p1', null]);
    });
  });

  describe('softDeleteProduct', () => {
    it('hace baja lógica sin jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([], 0),
        qr([], 1),
        qr([]),
      ]));
      const result = await makeRepo(pool).softDeleteProduct('p1', 'v1');
      expect(result).toEqual({ id_producto: 'p1', activo: false });
      expect(client.query).toHaveBeenCalledWith(
        expect.stringContaining('SET activo = false'),
        ['p1', 'v1'],
      );
    });

    it('bloquea baja con jornada activa', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([PRODUCT_ROW], 1),
        qr([{ id_jornada: 'j1' }], 1),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).softDeleteProduct('p1', 'v1'),
      ).rejects.toBeInstanceOf(ProductDeleteBlockedError);
      expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('rechaza producto inexistente', async () => {
      const { pool, client } = makeMocks();
      client.query.mockImplementation(sequence([
        qr([]),
        qr([], 0),
        qr([]),
      ]));
      await expect(
        makeRepo(pool).softDeleteProduct('p1', 'v1'),
      ).rejects.toBeInstanceOf(ProductNotFoundError);
    });
  });
});