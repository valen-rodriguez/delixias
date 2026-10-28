import type { SanitizedProfile, VendorStatusBanner } from '@/types/auth';

export type ShellScreen = 'client' | 'vendor';

export interface ShellState {
  screen: ShellScreen;
  banner: VendorStatusBanner;
}

export const deriveShellState = (profile: SanitizedProfile): ShellState => {
  let banner: VendorStatusBanner = null;

  switch (profile.estado_vendedor) {
    case 'pendiente_revision':
      banner = 'pendiente_revision';
      break;
    case 'suspendido':
      banner = 'suspendido';
      break;
    case 'bloqueado':
      banner = 'bloqueado';
      break;
    case 'activo':
    case 'no_solicitado':
      banner = null;
      break;
  }

  const mountVendor: boolean =
    profile.ultimo_rol_activo === 'vendedor' && profile.estado_vendedor === 'activo';

  const screen: ShellScreen = mountVendor ? 'vendor' : 'client';

  return { screen, banner };
};
