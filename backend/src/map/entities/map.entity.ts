export interface VendorRadarItem {
  id_usuario: string;
  nombre_completo: string;
  foto_perfil_url: string | null;
  rating_promedio: number;
  distancia_km: number;
  coordenadas: { lat: number; lng: number };
  total_productos_disponibles: number;
  categoria_id?: number;
  productos_de_categoria?: number;
}

export interface RadarResponse {
  radio_km: number;
  posicion_cliente: { lat: number; lng: number };
  vendedores: VendorRadarItem[];
}

export interface VendorDetail {
  id_usuario: string;
  nombre_completo: string;
  foto_perfil_url: string | null;
  rating_promedio: number;
  distancia_km: number;
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
