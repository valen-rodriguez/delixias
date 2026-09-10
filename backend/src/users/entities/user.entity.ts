export const ESTADOS_VENDEDOR = [
  'no_solicitado',
  'activo',
  'suspendido',
  'pendiente_revision',
  'bloqueado',
] as const;

export type EstadoVendedor = (typeof ESTADOS_VENDEDOR)[number];

export const ROLES_OPERATIVOS = ['cliente', 'vendedor'] as const;

export type RolOperativo = (typeof ROLES_OPERATIVOS)[number];

export interface UserRow {
  id_usuario: string;
  email: string;
  nombre_completo: string;
  telefono: string;
  direccion: string | null;
  dni: string | null;
  foto_perfil_url: string | null;
  estado_vendedor: EstadoVendedor;
  motivo_suspension: string | null;
  ultima_revision_documental: Date | null;
  ultimo_rol_activo: RolOperativo;
}

export interface SanitizedProfile {
  id_usuario: string;
  email: string;
  nombre_completo: string;
  telefono: string;
  direccion: string | null;
  dni: string | null;
  foto_perfil_url: string | null;
  estado_vendedor: EstadoVendedor;
  motivo_suspension: string | null;
  ultimo_rol_activo: RolOperativo;
}
