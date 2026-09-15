export interface ProductRow {
  id_producto: string;
  id_categoria: number;
  nombre: string;
  precio_unitario: number;
  stock_base: number;
  foto_url: string | null;
  activo: boolean;
}

export interface SoftDeletedProduct {
  id_producto: string;
  activo: false;
}