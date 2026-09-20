export interface TrackingPingResponse {
  id_tracking: number;
  id_jornada: string;
  coordenadas: { lat: number; lng: number };
  timestamp: string;
  distancia_km: number | null;
}

export interface TrackingStatusResponse {
  tracking: boolean;
  id_jornada: string | null;
  fecha_hora_inicio: string | null;
  ultima_posicion: { lat: number; lng: number; timestamp: string } | null;
}
