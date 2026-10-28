import { describe, it, expect } from 'vitest';
import { deriveShellState } from '@/navigation/shellDerivation';
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

describe('deriveShellState', () => {
  it('vendedor activo -> vendor stack, sin banner', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'vendedor', estado_vendedor: 'activo' }),
    );
    expect(result.screen).toBe('vendor');
    expect(result.banner).toBeNull();
  });

  it('cliente activo -> client stack, sin banner', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'cliente', estado_vendedor: 'activo' }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBeNull();
  });

  it('vendedor pendiente_revision -> client stack + banner (independiente del rol)', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'vendedor', estado_vendedor: 'pendiente_revision' }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBe('pendiente_revision');
  });

  it('cliente pendiente_revision -> banner igualmente (v1.3: sin acoplamiento a rol)', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'cliente', estado_vendedor: 'pendiente_revision' }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBe('pendiente_revision');
  });

  it('vendedor suspendido -> client stack + banner suspendido', () => {
    const result = deriveShellState(
      baseProfile({
        ultimo_rol_activo: 'vendedor',
        estado_vendedor: 'suspendido',
        motivo_suspension: 'Documentacion vencida',
      }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBe('suspendido');
  });

  it('vendedor bloqueado -> client stack + banner bloqueado', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'vendedor', estado_vendedor: 'bloqueado' }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBe('bloqueado');
  });

  it('no monta vendor stack sin estado activo aunque el rol sea vendedor', () => {
    const result = deriveShellState(
      baseProfile({ ultimo_rol_activo: 'vendedor', estado_vendedor: 'no_solicitado' }),
    );
    expect(result.screen).toBe('client');
    expect(result.banner).toBeNull();
  });
});
