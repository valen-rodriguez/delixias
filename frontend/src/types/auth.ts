export type EstadoVendedor =
  'no_solicitado' | 'activo' | 'suspendido' | 'pendiente_revision' | 'bloqueado';

export type RolOperativo = 'cliente' | 'vendedor';

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

export interface AuthState {
  session: {
    access_token: string;
    user: { id: string; email: string };
  } | null;
  profile: SanitizedProfile | null;
  loading: boolean;
}

export type VendorStatusBanner = 'suspendido' | 'pendiente_revision' | 'bloqueado' | null;
