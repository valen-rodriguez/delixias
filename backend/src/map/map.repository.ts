import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { RedisGeoService } from '../infra/redis-geo.service.js';

export interface VendorFromRedis {
  id_usuario: string;
  distance_m: number;
  coordinates: { lng: number; lat: number };
}

export interface VendorFromDb {
  id_usuario: string;
  nombre_completo: string;
  foto_perfil_url: string | null;
  rating_promedio: number;
  total_productos_disponibles: number;
  categoria_id?: number;
  productos_de_categoria?: number;
}

export interface VendorDetailFromDb extends VendorFromDb {
  coordenadas: { lat: number; lng: number };
  productos_disponibles: {
    id_producto: string;
    nombre: string;
    precio_unitario: number;
    foto_url: string | null;
    id_categoria: number;
    stock_actual: number;
  }[];
}

@Injectable()
export class MapRepository {
  constructor(
    @Inject('DATABASE_POOL') private readonly pool: Pool,
    private readonly redisGeo: RedisGeoService,
  ) {}

  async getRadio(): Promise<number> {
    const val = await this.redisGeo.get('param:radio_cobertura_km');
    if (!val) return 3;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }

  async checkCategoryExists(idCategoria: number): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM public.categorias WHERE id_categoria = $1`,
      [idCategoria],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async getRadarCandidates(
    lng: number,
    lat: number,
    radiusM: number,
  ): Promise<VendorFromRedis[]> {
    const members = await this.redisGeo.georadius(
      'geo:vendedores',
      lng,
      lat,
      radiusM,
    );
    return members
      .filter((m) => m.member.startsWith('vendedor:'))
      .map((m) => ({
        id_usuario: m.member.replace('vendedor:', ''),
        distance_m: m.distance_m,
        coordinates: m.coordinates,
      }));
  }

  async getVendorStock(
    vendorIds: string[],
    categoria?: number,
  ): Promise<VendorFromDb[]> {
    if (vendorIds.length === 0) return [];

    const params: unknown[] = [vendorIds];
    let catFilter = '';
    if (categoria) {
      params.push(categoria);
      catFilter = ` AND p.id_categoria = $${params.length}`;
    }

    const result = await this.pool.query(
      `SELECT
         u.id_usuario,
          u.nombre_completo,
          u.foto_perfil_url,
          COALESCE((SELECT ROUND(AVG(c.puntaje)::numeric, 1) FROM public.calificaciones c WHERE c.id_vendedor = u.id_usuario), 0) AS rating_promedio,
          COUNT(DISTINCT ij.id_producto) FILTER (WHERE ij.stock_actual > 0) AS total_productos_disponibles,
         ${categoria ? `p.id_categoria AS categoria_id, COUNT(DISTINCT ij.id_producto) FILTER (WHERE ij.stock_actual > 0 AND p.id_categoria = $${params.length}) AS productos_de_categoria` : 'NULL AS categoria_id, NULL AS productos_de_categoria'}
       FROM public.usuarios u
       JOIN public.jornadas j ON j.id_vendedor = u.id_usuario AND j.estado = 'ACTIVA'
       LEFT JOIN public.inventario_jornada ij ON ij.id_jornada = j.id_jornada
       LEFT JOIN public.productos p ON p.id_producto = ij.id_producto
       WHERE u.id_usuario = ANY($1)
         AND u.estado_vendedor = 'activo'
         ${catFilter}
        GROUP BY u.id_usuario, u.nombre_completo, u.foto_perfil_url${categoria ? ', p.id_categoria' : ''}
       HAVING COUNT(DISTINCT ij.id_producto) FILTER (WHERE ij.stock_actual > 0${categoria ? ` AND p.id_categoria = $${params.length}` : ''}) > 0`,
      params,
    );

    return result.rows.map((row) => ({
      id_usuario: row.id_usuario as string,
      nombre_completo: row.nombre_completo as string,
      foto_perfil_url: (row.foto_perfil_url as string) ?? null,
      rating_promedio: Number(row.rating_promedio),
      total_productos_disponibles: Number(row.total_productos_disponibles),
      categoria_id: row.categoria_id != null ? Number(row.categoria_id) : undefined,
      productos_de_categoria: row.productos_de_categoria != null ? Number(row.productos_de_categoria) : undefined,
    }));
  }

  async getVendorDetail(
    idVendedor: string,
  ): Promise<VendorDetailFromDb | null> {
    // Check vendor is in Redis (visible)
    const pos = await this.redisGeo.geopos('geo:vendedores', `vendedor:${idVendedor}`);
    if (!pos) return null;

    // Check vendor has active shift with stock
    const result = await this.pool.query(
      `SELECT
         u.id_usuario,
          u.nombre_completo,
          u.foto_perfil_url,
          COALESCE(
            (SELECT ROUND(AVG(c.puntaje)::numeric, 2)
               FROM public.calificaciones c
              WHERE c.id_vendedor = u.id_usuario),
            0
          ) AS rating_promedio,
          COUNT(DISTINCT ij.id_producto) FILTER (WHERE ij.stock_actual > 0) AS total_productos_disponibles
       FROM public.usuarios u
       JOIN public.jornadas j ON j.id_vendedor = u.id_usuario AND j.estado = 'ACTIVA'
       LEFT JOIN public.inventario_jornada ij ON ij.id_jornada = j.id_jornada
       WHERE u.id_usuario = $1
         AND u.estado_vendedor = 'activo'
        GROUP BY u.id_usuario, u.nombre_completo, u.foto_perfil_url`,
      [idVendedor],
    );

    if ((result.rowCount ?? 0) === 0) return null;

    const row = result.rows[0];
    const total = Number(row.total_productos_disponibles);
    if (total === 0) return null;

    // Get available products
    const products = await this.pool.query(
      `SELECT
         p.id_producto,
         p.nombre,
         p.precio_unitario,
         p.foto_url,
         p.id_categoria,
         ij.stock_actual
       FROM public.inventario_jornada ij
       JOIN public.productos p ON p.id_producto = ij.id_producto
       WHERE ij.id_jornada = (SELECT id_jornada FROM public.jornadas WHERE id_vendedor = $1 AND estado = 'ACTIVA')
         AND ij.stock_actual > 0
       ORDER BY p.nombre`,
      [idVendedor],
    );

    return {
      id_usuario: row.id_usuario as string,
      nombre_completo: row.nombre_completo as string,
      foto_perfil_url: (row.foto_perfil_url as string) ?? null,
      rating_promedio: Number(row.rating_promedio),
       coordenadas: pos,
      total_productos_disponibles: total,
      productos_disponibles: products.rows.map((p) => ({
        id_producto: p.id_producto as string,
        nombre: p.nombre as string,
        precio_unitario: Number(p.precio_unitario),
        foto_url: (p.foto_url as string) ?? null,
        id_categoria: Number(p.id_categoria),
        stock_actual: p.stock_actual as number,
      })),
    };
  }
}
