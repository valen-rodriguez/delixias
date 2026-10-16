export interface ShiftRow {
  id_jornada: string;
  id_vendedor: string;
  incluye_autonomo: boolean;
  fecha_hora_inicio: Date;
  fecha_hora_fin: Date | null;
  stock_inicial_consolidado: number;
  coordenada_inicio: any | null;
  estado: 'ACTIVA' | 'FINALIZADA';
  cierre_automatico: boolean;
  distancia_km: number | null;
  total_recaudado: number;
}
