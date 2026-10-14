export interface OrderLineResponse {
  id_producto: string;
  cantidad: number;
  precio_historico: number;
  subtotal: number;
}

export interface OrderResponse {
  id_pedido: string;
  id_cliente: string;
  id_vendedor: string;
  id_jornada: string;
  estado: string;
  total_orden: number;
  id_medio_pago: number;
  creado_el: string;
  expira_el: string | null;
  cancelado_por: string | null;
  motivo_cancela: string | null;
  ubicacion_entrega: { lat: number; lng: number } | null;
  ubicacion_compartida: boolean;
  lineas: OrderLineResponse[];
}

export interface OrderSummaryResponse {
  id_pedido: string;
  id_vendedor: string;
  id_cliente: string;
  estado: string;
  total_orden: number;
  creado_el: string;
  expira_el: string | null;
  lineas_cantidad: number;
  espera_segundos?: number;
  ubicacion_entrega?: { lat: number; lng: number } | null;
}
