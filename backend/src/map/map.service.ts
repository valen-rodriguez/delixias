import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { RadarQueryDto } from './dto/radar-query.dto.js';
import type { RadarResponse, VendorDetail, VendorRadarItem } from './entities/map.entity.js';
import { MapRepository } from './map.repository.js';

@Injectable()
export class MapService {

  constructor(private readonly mapRepo: MapRepository) {}

  async getRadar(query: RadarQueryDto): Promise<RadarResponse> {
    // Validate category existence if provided
    if (query.categoria) {
      const exists = await this.mapRepo.checkCategoryExists(query.categoria);
      if (!exists) {
        throw new BadRequestException({
          error: 'VALIDATION_ERROR',
          message: `La categoría ${query.categoria} no existe.`,
        });
      }
    }

    const radioKm = await this.mapRepo.getRadio();
    const radiusM = radioKm * 1000;

    // Step 1: Redis GEORADIUS for proximity
    const candidates = await this.mapRepo.getRadarCandidates(
      query.lng,
      query.lat,
      radiusM,
    );

    if (candidates.length === 0) {
      return {
        radio_km: radioKm,
        posicion_cliente: { lat: query.lat, lng: query.lng },
        vendedores: [],
      };
    }

    // Step 2: PostgreSQL filter by stock/categoria
    const vendorIds = candidates.map((c) => c.id_usuario);
    const dbVendors = await this.mapRepo.getVendorStock(vendorIds, query.categoria);

    // Step 3: Merge in memory
    const dbMap = new Map(dbVendors.map((v) => [v.id_usuario, v]));

    const result: VendorRadarItem[] = [];
    for (const c of candidates) {
      const db = dbMap.get(c.id_usuario);
      if (!db) continue;

      const item: VendorRadarItem = {
        id_usuario: c.id_usuario,
        nombre_completo: db.nombre_completo,
        foto_perfil_url: db.foto_perfil_url,
        rating_promedio: db.rating_promedio,
        distancia_km: Math.round((c.distance_m / 1000) * 100) / 100,
        coordenadas: c.coordinates,
        total_productos_disponibles: db.total_productos_disponibles,
      };
      if (query.categoria && db.categoria_id != null) {
        item.categoria_id = db.categoria_id;
        item.productos_de_categoria = db.productos_de_categoria;
      }
      result.push(item);
    }

    result.sort((a, b) => a.distancia_km - b.distancia_km);

    return {
      radio_km: radioKm,
      posicion_cliente: { lat: query.lat, lng: query.lng },
      vendedores: result,
    };
  }

  async getVendorDetail(
    idVendedor: string,
    clienteLng: number,
    clienteLat: number,
  ): Promise<VendorDetail> {
    const detail = await this.mapRepo.getVendorDetail(idVendedor);
    if (!detail) {
      throw new NotFoundException({
        error: 'VENDOR_NOT_VISIBLE',
        message: 'El vendedor no está visible en el radar.',
      });
    }

    // Calculate distance using Haversine
    const distanciaKm = this.haversine(
      clienteLat,
      clienteLng,
      detail.coordenadas.lat,
      detail.coordenadas.lng,
    );

    const radioKm = await this.mapRepo.getRadio();
    if (distanciaKm > radioKm) {
      throw new NotFoundException({
        error: 'VENDOR_NOT_VISIBLE',
        message: 'El vendedor está fuera del radio de cobertura.',
      });
    }

    return {
      id_usuario: detail.id_usuario,
      nombre_completo: detail.nombre_completo,
       foto_perfil_url: detail.foto_perfil_url,
       rating_promedio: detail.rating_promedio,
       distancia_km: Math.round(distanciaKm * 100) / 100,
      coordenadas: detail.coordenadas,
      productos_disponibles: detail.productos_disponibles,
    };
  }

  private haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLng = this.toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
