export const ESTADOS_VENDEDOR = ['no_solicitado', 'activo', 'suspendido', 'pendiente_revision', 'bloqueado'] as const;
export type EstadoVendedor = (typeof ESTADOS_VENDEDOR)[number];
export const ROLES_OPERATIVOS = ['cliente', 'vendedor'] as const;
export type RolOperativo = (typeof ROLES_OPERATIVOS)[number];

export interface VendorRow {
  id_usuario: string;
  nombre_completo: string;
  telefono: string;
  email: string;
  direccion: string | null;
  dni: string | null;
  foto_perfil_url: string | null;
  estado_vendedor: EstadoVendedor;
  motivo_suspension: string | null;
  ultima_revision_documental: Date | null;
  id_super_admin_revisor: string | null;
  ultimo_rol_activo: RolOperativo;
  creado_el: Date;
}
