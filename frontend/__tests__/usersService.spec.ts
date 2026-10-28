import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';

vi.hoisted(() => {
  process.env.EXPO_PUBLIC_API_URL = 'https://api.test';
});

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

vi.mock('@/services/authService', () => ({
  refreshSession: mocks.refreshSession,
}));

import {
  api,
  ApiError,
  toApiError,
  getProfile,
  switchProfileRole,
  upgradeToSeller,
  reappealDocumentation,
} from '@/services/usersService';
import type { SanitizedProfile } from '@/types/auth';

interface AdapterConfig {
  status: number;
  data: unknown;
}

interface AxiosLikeError extends Error {
  isAxiosError: boolean;
  response: {
    status: number;
    data: unknown;
    headers: Record<string, string>;
    config: InternalAxiosRequestConfig;
  };
  config: InternalAxiosRequestConfig;
}

let adapterBehavior: (config: InternalAxiosRequestConfig) => AdapterConfig;
const capturedConfigs: InternalAxiosRequestConfig[] = [];

const withAdapter = () => {
  api.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
    capturedConfigs.push(config);
    const { status, data } = adapterBehavior(config);
    if (status < 200 || status > 299) {
      const error = Object.assign(new Error(`Request failed with status code ${status}`), {
        isAxiosError: true,
        response: { status, data, headers: {}, config },
        config,
      }) as unknown as AxiosLikeError;
      throw error;
    }
    return {
      status,
      statusText: 'OK',
      data,
      headers: {},
      config,
    } as AxiosResponse;
  };
};

const profileResponse = (overrides: Partial<SanitizedProfile> = {}): SanitizedProfile => ({
  id_usuario: '11111111-1111-1111-1111-111111111111',
  email: 'vendedor@delixias.com',
  nombre_completo: 'Vendedor Prueba',
  telefono: '+5491112345678',
  direccion: 'Calle 123',
  dni: '12345678',
  foto_perfil_url: 'https://supabase.co/storage/v1/object/public/avatares/x/1.jpg',
  estado_vendedor: 'activo',
  motivo_suspension: null,
  ultimo_rol_activo: 'vendedor',
  ...overrides,
});

const okEnvelope = (data: unknown) => ({ data, error: null, message: 'OK' });

beforeEach(() => {
  vi.clearAllMocks();
  capturedConfigs.length = 0;
  mocks.getSession.mockResolvedValue({
    data: { session: { access_token: 'tok' } },
    error: null,
  });
  adapterBehavior = () => ({ status: 200, data: okEnvelope(null) });
  withAdapter();
});

describe('usersService endpoints (adapter)', () => {
  it('getProfile hace GET /users/me con Bearer token y devuelve el perfil', async () => {
    const profile = profileResponse();
    adapterBehavior = () => ({ status: 200, data: okEnvelope(profile) });

    const result = await getProfile();

    expect(capturedConfigs[0]?.url).toBe('/users/me');
    expect(capturedConfigs[0]?.headers.Authorization).toBe('Bearer tok');
    expect(result).toEqual(profile);
  });

  it('getProfile omite Authorization cuando no hay sesión', async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    adapterBehavior = () => ({ status: 200, data: okEnvelope(profileResponse()) });

    await getProfile();

    expect(capturedConfigs[0]?.headers.Authorization).toBeUndefined();
  });

  it('getProfile lanza si la respuesta no trae data', async () => {
    adapterBehavior = () => ({ status: 200, data: null });
    await expect(getProfile()).rejects.toThrow('Usuario no encontrado');
  });

  it('reintenta con token fresco tras un 401', async () => {
    let callCount = 0;
    const profile = profileResponse();
    adapterBehavior = () => {
      callCount += 1;
      if (callCount === 1) {
        return { status: 401, data: { data: null, error: 'UNAUTHORIZED', message: 'expired' } };
      }
      return { status: 200, data: okEnvelope(profile) };
    };
    mocks.getSession
      .mockResolvedValueOnce({ data: { session: { access_token: 'tok' } }, error: null })
      .mockResolvedValueOnce({ data: { session: { access_token: 'newtok' } }, error: null });
    mocks.refreshSession.mockResolvedValue({ access_token: 'newtok' });

    const result = await getProfile();

    expect(callCount).toBe(2);
    expect(mocks.refreshSession).toHaveBeenCalledTimes(1);
    expect(capturedConfigs[1]?.headers.Authorization).toBe('Bearer newtok');
    expect(result).toEqual(profile);
  });

  it('rechaza el error original si el refresh falla', async () => {
    let callCount = 0;
    adapterBehavior = () => {
      callCount += 1;
      return { status: 401, data: { data: null, error: 'UNAUTHORIZED', message: 'expired' } };
    };
    mocks.refreshSession.mockRejectedValue(new Error('refresh failed'));

    await expect(getProfile()).rejects.toMatchObject({ response: { status: 401 } });
    expect(callCount).toBe(1);
  });

  it('switchProfileRole hace PATCH /users/switch-role con el rol', async () => {
    const updated = profileResponse({ ultimo_rol_activo: 'vendedor' });
    adapterBehavior = () => ({ status: 200, data: okEnvelope(updated) });

    const result = await switchProfileRole('vendedor');

    expect(capturedConfigs[0]?.method).toBe('patch');
    expect(capturedConfigs[0]?.url).toBe('/users/switch-role');
    expect(JSON.parse(String(capturedConfigs[0]?.data))).toEqual({ rol: 'vendedor' });
    expect(result).toEqual(updated);
  });

  it('switchProfileRole lanza si la respuesta no trae data', async () => {
    adapterBehavior = () => ({ status: 200, data: null });
    await expect(switchProfileRole('vendedor')).rejects.toThrow(
      'La respuesta del servidor no incluyó el perfil actualizado.',
    );
  });

  it('upgradeToSeller hace POST /users/upgrade-to-seller con el payload del DTO', async () => {
    const updated = profileResponse({ dni: '12345678', estado_vendedor: 'activo' });
    adapterBehavior = () => ({ status: 200, data: okEnvelope(updated) });

    const result = await upgradeToSeller({
      dni: '12345678',
      direccion: 'Calle 123',
      foto_perfil_url: 'https://supabase.co/storage/v1/object/public/avatares/x/1.jpg',
    });

    expect(capturedConfigs[0]?.url).toBe('/users/upgrade-to-seller');
    expect(JSON.parse(String(capturedConfigs[0]?.data))).toEqual({
      dni: '12345678',
      direccion: 'Calle 123',
      foto_perfil_url: 'https://supabase.co/storage/v1/object/public/avatares/x/1.jpg',
    });
    expect(result).toEqual(updated);
  });

  it('reappealDocumentation hace POST /users/reappeal-documentation', async () => {
    const updated = profileResponse({ estado_vendedor: 'pendiente_revision' });
    adapterBehavior = () => ({ status: 200, data: okEnvelope(updated) });

    const result = await reappealDocumentation(
      'https://supabase.co/storage/v1/object/public/avatares/x/2.jpg',
    );

    expect(capturedConfigs[0]?.url).toBe('/users/reappeal-documentation');
    expect(JSON.parse(String(capturedConfigs[0]?.data))).toEqual({
      nueva_foto_perfil_url: 'https://supabase.co/storage/v1/object/public/avatares/x/2.jpg',
    });
    expect(result.estado_vendedor).toBe('pendiente_revision');
  });
});

const axiosError = (status: number | null, data: unknown): Record<string, unknown> => ({
  isAxiosError: true,
  response: status === null ? undefined : { status, data },
  message: 'Request failed',
});

describe('toApiError / ApiError', () => {
  it('mapea el envelope de error del backend a ApiError tipado', () => {
    const apiError = toApiError(
      axiosError(409, { error: 'DNI_ALREADY_IN_USE', message: 'DNI duplicado' }),
    );
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.backendError).toBe('DNI_ALREADY_IN_USE');
    expect(apiError.status).toBe(409);
    expect(apiError.message).toBe('DNI duplicado');
  });

  it('usa mensaje por defecto cuando el envelope no trae message', () => {
    const apiError = toApiError(axiosError(403, { error: 'VENDEDOR_NOT_ACTIVE' }));
    expect(apiError.backendError).toBe('VENDEDOR_NOT_ACTIVE');
    expect(apiError.status).toBe(403);
    expect(apiError.message).toBe('Error del servidor.');
  });

  it('usa el message del envelope cuando no hay codigo de error', () => {
    const apiError = toApiError(axiosError(500, { error: null, message: 'Fallo interno' }));
    expect(apiError.backendError).toBeNull();
    expect(apiError.status).toBe(500);
    expect(apiError.message).toBe('Fallo interno');
  });

  it('usa mensaje generico para respuesta sin envelope', () => {
    const apiError = toApiError(axiosError(502, 'Bad Gateway'));
    expect(apiError.backendError).toBeNull();
    expect(apiError.status).toBe(502);
    expect(apiError.message).toBe('Ocurrió un error inesperado.');
  });

  it('mapea errores de red sin respuesta al mensaje de conexión', () => {
    const apiError = toApiError(axiosError(null, undefined));
    expect(apiError.backendError).toBeNull();
    expect(apiError.message).toBe(
      'No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.',
    );
  });

  it('envuelve errores genéricos manteniendo el mensaje', () => {
    const apiError = toApiError(new Error('algo explotó'));
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.backendError).toBeNull();
    expect(apiError.message).toBe('algo explotó');
  });

  it('usa mensaje generico para valores no-Error', () => {
    const apiError = toApiError('boom');
    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.message).toBe('Ocurrió un error inesperado.');
  });
});
