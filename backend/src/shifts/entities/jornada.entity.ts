export type JornadaEstado = 'ACTIVA' | 'FINALIZADA';

export interface JornadaRow {
  id_jornada: string;
  id_vendedor: string;
  estado: JornadaEstado;
  fecha_hora_inicio: Date;
  fecha_hora_fin: Date | null;
  coordenada_inicio: { lat: number; lng: number };
  stock_inicial_consolidado: Record<string, unknown>;
}

export interface SnapshotItem {
  id_producto: string;
  nombre: string;
  precio_unitario: number;
  cantidad_inicial: number;
}

export interface InventarioItem {
  id_producto: string;
  nombre: string;
  precio_unitario: number;
  foto_url: string | null;
  stock_inicial: number;
  stock_actual: number;
}

export interface CurrentShiftResponse {
  id_jornada: string;
  id_vendedor: string;
  estado: JornadaEstado;
  fecha_hora_inicio: string;
  fecha_hora_fin?: string | null;
  coordenada_inicio: { lat: number; lng: number };
  stock_inicial_consolidado: {
    fecha_snapshot: string;
    total_unidades: number;
    items: SnapshotItem[];
  };
  inventario: InventarioItem[];
}

export interface MermaResponse {
  id_producto: string;
  stock_actual_anterior: number;
  stock_actual_nuevo: number;
  cantidad_mermada: number;
  motivo: string;
}