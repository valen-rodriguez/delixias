import { vi, describe, it, expect, beforeEach } from 'vitest';
import { MapService } from './map.service.js';
import type { RadarQueryDto } from './dto/radar-query.dto.js';

describe('MapService', () => {
  let service: MapService;
  let mapRepo: any;

  beforeEach(() => {
    mapRepo = {
      getRadio: vi.fn(),
      getRadarCandidates: vi.fn(),
      getVendorStock: vi.fn(),
      getVendorDetail: vi.fn(),
      checkCategoryExists: vi.fn(),
    };
    service = new MapService(mapRepo);
  });

  describe('getRadar', () => {
    const query: RadarQueryDto = { lat: -38.002, lng: -57.55 };

    it('should return empty vendors when no candidates in Redis', async () => {
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getRadarCandidates.mockResolvedValue([]);

      const result = await service.getRadar(query);

      expect(result.vendedores).toEqual([]);
      expect(result.radio_km).toBe(3);
    });

    it('should merge Redis candidates with DB stock data', async () => {
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getRadarCandidates.mockResolvedValue([
        { id_usuario: 'v-1', distance_m: 420, coordinates: { lng: -57.545, lat: -38.0001 } },
      ]);
      mapRepo.getVendorStock.mockResolvedValue([
        {
          id_usuario: 'v-1',
          nombre_completo: 'Pepe Churro',
          foto_perfil_url: 'https://example.com/pepe.jpg',
          rating_promedio: 4.7,
          total_productos_disponibles: 12,
        },
      ]);

      const result = await service.getRadar(query);

      expect(result.vendedores).toHaveLength(1);
      expect(result.vendedores[0].distancia_km).toBe(0.42);
      expect(result.vendedores[0].nombre_completo).toBe('Pepe Churro');
    });

    it('should exclude vendors without stock from results', async () => {
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getRadarCandidates.mockResolvedValue([
        { id_usuario: 'v-1', distance_m: 420, coordinates: { lng: -57.545, lat: -38.0001 } },
        { id_usuario: 'v-2', distance_m: 800, coordinates: { lng: -57.54, lat: -38.001 } },
      ]);
      mapRepo.getVendorStock.mockResolvedValue([
        {
          id_usuario: 'v-1',
          nombre_completo: 'Pepe Churro',
          foto_perfil_url: null,
          rating_promedio: 4.7,
          total_productos_disponibles: 5,
        },
      ]);

      const result = await service.getRadar(query);

      expect(result.vendedores).toHaveLength(1);
      expect(result.vendedores[0].id_usuario).toBe('v-1');
    });

    it('should sort vendors by distance ascending', async () => {
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getRadarCandidates.mockResolvedValue([
        { id_usuario: 'v-far', distance_m: 2000, coordinates: { lng: -57.53, lat: -38.01 } },
        { id_usuario: 'v-near', distance_m: 100, coordinates: { lng: -57.548, lat: -38.001 } },
      ]);
      mapRepo.getVendorStock.mockResolvedValue([
        {
          id_usuario: 'v-far',
          nombre_completo: 'Far Vendor',
          foto_perfil_url: null,
          rating_promedio: 4.0,
          total_productos_disponibles: 3,
        },
        {
          id_usuario: 'v-near',
          nombre_completo: 'Near Vendor',
          foto_perfil_url: null,
          rating_promedio: 5.0,
          total_productos_disponibles: 7,
        },
      ]);

      const result = await service.getRadar(query);

      expect(result.vendedores[0].id_usuario).toBe('v-near');
      expect(result.vendedores[1].id_usuario).toBe('v-far');
    });

    it('should throw BadRequestException for invalid category', async () => {
      mapRepo.checkCategoryExists.mockResolvedValue(false);

      await expect(
        service.getRadar({ ...query, categoria: 999 }),
      ).rejects.toThrow();
    });

    it('should accept valid category', async () => {
      mapRepo.checkCategoryExists.mockResolvedValue(true);
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getRadarCandidates.mockResolvedValue([]);
      mapRepo.getVendorStock.mockResolvedValue([]);

      const result = await service.getRadar({ ...query, categoria: 1 });
      expect(result.vendedores).toEqual([]);
    });
  });

  describe('getVendorDetail', () => {
    it('should return vendor detail with products', async () => {
      mapRepo.getRadio.mockResolvedValue(3);
      mapRepo.getVendorDetail.mockResolvedValue({
        id_usuario: 'v-1',
        nombre_completo: 'Pepe Churro',
         foto_perfil_url: 'https://example.com/pepe.jpg',
         rating_promedio: 4.7,
        coordenadas: { lat: -38.0001, lng: -57.5452 },
        total_productos_disponibles: 5,
        productos_disponibles: [
          {
            id_producto: 'p-1',
            nombre: 'Empanada',
            precio_unitario: 1200,
            foto_url: null,
            id_categoria: 1,
            stock_actual: 10,
          },
        ],
      });

      const result = await service.getVendorDetail('v-1', -57.55, -38.002);

      expect(result.id_usuario).toBe('v-1');
      expect(result.productos_disponibles).toHaveLength(1);
      expect(result.distancia_km).toBeGreaterThan(0);
    });

    it('should throw NotFoundException when vendor not visible', async () => {
      mapRepo.getVendorDetail.mockResolvedValue(null);

      await expect(
        service.getVendorDetail('v-1', -57.55, -38.002),
      ).rejects.toThrow();
    });
  });
});
