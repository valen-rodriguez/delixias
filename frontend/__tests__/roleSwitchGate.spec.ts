import { describe, it, expect } from 'vitest';
import { resolveSwitchAction } from '@/navigation/roleSwitchGate';
import type { SanitizedProfile } from '@/types/auth';

const baseProfile = (overrides: Partial<SanitizedProfile> = {}): SanitizedProfile => ({
  id_usuario: '11111111-1111-1111-1111-111111111111',
  email: 'vendedor@delixias.com',
  nombre_completo: 'Vendedor Prueba',
  telefono: '+5491112345678',
  direccion: null,
  dni: null,
  foto_perfil_url: null,
  estado_vendedor: 'no_solicitado',
  motivo_suspension: null,
  ultimo_rol_activo: 'cliente',
  ...overrides,
});

describe('resolveSwitchAction', () => {
  it.each([
    ['activo', 'enterVendor'],
    ['no_solicitado', 'openOnboarding'],
    ['suspendido', 'showSuspendedModal'],
    ['pendiente_revision', 'showPendingReviewAlert'],
    ['bloqueado', 'showBlockedState'],
  ] as const)('estado %s -> accion %s', (estado, expected) => {
    expect(resolveSwitchAction(baseProfile({ estado_vendedor: estado }))).toBe(expected);
  });

  it('es independiente de ultimo_rol_activo', () => {
    expect(
      resolveSwitchAction(
        baseProfile({ estado_vendedor: 'activo', ultimo_rol_activo: 'vendedor' }),
      ),
    ).toBe('enterVendor');
    expect(
      resolveSwitchAction(
        baseProfile({ estado_vendedor: 'suspendido', ultimo_rol_activo: 'vendedor' }),
      ),
    ).toBe('showSuspendedModal');
  });
});
