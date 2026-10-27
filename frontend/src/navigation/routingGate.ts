import type { SanitizedProfile, RolOperativo, VendorStatusBanner } from '@/types/auth';

export interface RoutingResult {
  screen: 'Login' | 'Splash' | 'Home';
  rol: RolOperativo;
  modoForzado: boolean;
  vendorStatusBanner?: VendorStatusBanner;
}

const VENDOR_BANNER_TEXT: Record<Exclude<VendorStatusBanner, null>, string> = {
  suspendido: 'Tu cuenta de vendedor no está activa.',
  pendiente_revision: 'Tu documentación está en revisión',
  bloqueado: 'Cuenta inhabilitada administrativamente',
};

export const resolveInitialScreen = (
  hasSession: boolean,
  profile: SanitizedProfile | null,
): RoutingResult => {
  if (!hasSession) {
    return { screen: 'Login', rol: 'cliente', modoForzado: false };
  }
  if (!profile) {
    return { screen: 'Splash', rol: 'cliente', modoForzado: false };
  }

  let rol: RolOperativo = profile.ultimo_rol_activo;
  let modoForzado = false;
  let vendorStatusBanner: VendorStatusBanner = null;

  if (profile.ultimo_rol_activo === 'vendedor') {
    if (profile.estado_vendedor === 'no_solicitado') {
      rol = 'cliente';
      modoForzado = false;
      vendorStatusBanner = null;
    } else if (profile.estado_vendedor === 'suspendido') {
      rol = 'cliente';
      modoForzado = true;
      vendorStatusBanner = 'suspendido';
    } else if (profile.estado_vendedor === 'pendiente_revision') {
      rol = 'cliente';
      modoForzado = true;
      vendorStatusBanner = 'pendiente_revision';
    } else if (profile.estado_vendedor === 'bloqueado') {
      rol = 'cliente';
      modoForzado = true;
      vendorStatusBanner = 'bloqueado';
    } else if (profile.estado_vendedor === 'activo') {
      rol = 'vendedor';
      modoForzado = false;
      vendorStatusBanner = null;
    }
  }

  return { screen: 'Home', rol, modoForzado, vendorStatusBanner };
};

export const getVendorBannerText = (banner: VendorStatusBanner): string | null => {
  if (!banner) return null;
  return VENDOR_BANNER_TEXT[banner] ?? null;
};
