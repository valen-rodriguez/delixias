export interface OrderRow {
  id_pedido: string;
  id_cliente: string;
  id_vendedor: string;
  id_jornada: string | null;
  estado: string;
  cancelado_por: string | null;
  motivo_cancela: string | null;
  ubicacion_entrega: any | null;
  total_orden: number;
  id_medio_pago: string | null;
  creado_el: Date;
  expira_el: Date | null;
}
