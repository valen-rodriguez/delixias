import { describe, it, expect } from 'vitest';
import { resolveInitialScreen } from '@/navigation/routingGate';
import type { SanitizedProfile, RolOperativo } from '@/types/auth';

const baseProfile = (overrides: Partial<SanitizedProfile> = {}): SanitizedProfile => ({
  id_usuario: '11111111-1111-1111-1111-111111111111',
  email: 'cliente@delixias.com',
  nombre_completo: 'Cliente Prueba',
  telefono: '+5491112345678',
  direccion: null,
  dni: null,
  foto_perfil_url: null,
  estado_vendedor: 'no_solicitado',
  motivo_suspension: null,
  ultimo_rol_activo: 'cliente',
  ...overrides,
});

describe('resolveInitialScreen', () => {
  it('no session -> Login', () => {
    const result = resolveInitialScreen(false, null);
    expect(result.screen).toBe('Login');
    expect(result.rol).toBe('cliente');
    expect(result.modoForzado).toBe(false);
  });

  it('session but no profile -> Splash', () => {
    const result = resolveInitialScreen(true, null);
    expect(result.screen).toBe('Splash');
  });

  it('cliente role -> Home cliente', () => {
    const result = resolveInitialScreen(true, baseProfile({ ultimo_rol_activo: 'cliente' }));
    expect(result.screen).toBe('Home');
    expect(result.rol).toBe('cliente');
    expect(result.modoForzado).toBe(false);
    expect(result.vendorStatusBanner).toBeNull();
  });

  it('vendedor activo -> Home vendedor', () => {
    const result = resolveInitialScreen(
      true,
      baseProfile({ ultimo_rol_activo: 'vendedor', estado_vendedor: 'activo' } as SanitizedProfile),
    );
    expect(result.screen).toBe('Home');
    expect(result.rol).toBe('vendedor');
    expect(result.modoForzado).toBe(false);
  });

  it('vendedor suspendido -> client mode + banner', () => {
    const result = resolveInitialScreen(
      true,
      baseProfile({
        ultimo_rol_activo: 'vendedor',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'Falta de documentación',
      } as SanitizedProfile),
    );
    expect(result.screen).toBe('Home');
    expect(result.rol).toBe('cliente');
    expect(result.modoForzado).toBe(true);
    expect(result.vendorStatusBanner).toBe('suspendido');
  });

  it('vendedor pendiente_revision -> client mode + banner', () => {
    const result = resolveInitialScreen(
      true,
      baseProfile({
        ultimo_rol_activo: 'vendedor',
        estado_vendedor: 'pendiente_revision',
      } as SanitizedProfile),
    );
    expect(result.vendorStatusBanner).toBe('pendiente_revision');
    expect(result.modoForzado).toBe(true);
    expect(result.rol).toBe('cliente');
  });

  it('vendedor bloqueado -> client mode + banner', () => {
    const result = resolveInitialScreen(
      true,
      baseProfile({
        ultimo_rol_activo: 'vendedor',
        estado_vendedor: 'bloqueado',
      } as SanitizedProfile),
    );
    expect(result.vendorStatusBanner).toBe('bloqueado');
    expect(result.modoForzado).toBe(true);
  });

  it('vendedor no_solicitado -> client mode, no banner, modoForzado false', () => {
    const result = resolveInitialScreen(
      true,
      baseProfile({
        ultimo_rol_activo: 'vendedor',
        estado_vendedor: 'no_solicitado',
      } as SanitizedProfile),
    );
    expect(result.rol).toBe('cliente');
    expect(result.modoForzado).toBe(false);
    expect(result.vendorStatusBanner).toBeNull();
  });
});

describe('SanitizedProfile type', () => {
  it('accepts valid EstadoVendedor values', () => {
    const valid: RolOperativo = 'vendedor';
    expect(valid).toBe('vendedor');
  });
});
