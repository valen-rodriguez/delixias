import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { supabase } from '@/lib/supabase';
import { refreshSession } from '@/services/authService';
import type { RolOperativo, SanitizedProfile, UpgradeToSellerInput } from '@/types/auth';

const apiUrl = process.env.EXPO_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error('Missing EXPO_PUBLIC_API_URL environment variable');
}

const api: AxiosInstance = axios.create({
  baseURL: apiUrl,
  timeout: 15000,
});

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const session = await refreshSession();
        if (session) {
          originalRequest.headers.Authorization = `Bearer ${session.access_token}`;
          return api(originalRequest);
        }
      } catch {
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  },
);

export const getProfile = async (): Promise<SanitizedProfile> => {
  const { data } = await api.get<{ data: SanitizedProfile; error: unknown; message: string }>(
    '/users/me',
  );
  if (!data?.data) {
    throw new Error('Usuario no encontrado');
  }
  return data.data;
};

export class ApiError extends Error {
  readonly backendError: string | null;
  readonly status: number;

  constructor(backendError: string | null, status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.backendError = backendError;
    this.status = status;
  }
}

const CONNECTION_ERROR_MESSAGE =
  'No se pudo conectar con el servidor. Verificá tu conexión e intentá de nuevo.';

export const toApiError = (error: unknown): ApiError => {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: unknown; message?: unknown } | undefined;
    const backendError = typeof data?.error === 'string' ? data.error : null;
    const message = typeof data?.message === 'string' ? data.message : null;
    const status = error.response?.status ?? 0;
    if (backendError) {
      return new ApiError(backendError, status, message ?? 'Error del servidor.');
    }
    if (!error.response) {
      return new ApiError(null, 0, CONNECTION_ERROR_MESSAGE);
    }
    return new ApiError(null, status, message ?? 'Ocurrió un error inesperado.');
  }
  if (error instanceof Error) {
    return new ApiError(null, 0, error.message);
  }
  return new ApiError(null, 0, 'Ocurrió un error inesperado.');
};

export const switchProfileRole = async (rol: RolOperativo): Promise<SanitizedProfile> => {
  const { data } = await api.patch<{ data: SanitizedProfile; error: unknown; message: string }>(
    '/users/switch-role',
    { rol },
  );
  if (!data?.data) {
    throw new Error('La respuesta del servidor no incluyó el perfil actualizado.');
  }
  return data.data;
};

export const upgradeToSeller = async (input: UpgradeToSellerInput): Promise<SanitizedProfile> => {
  const { data } = await api.post<{ data: SanitizedProfile; error: unknown; message: string }>(
    '/users/upgrade-to-seller',
    input,
  );
  if (!data?.data) {
    throw new Error('La respuesta del servidor no incluyó el perfil actualizado.');
  }
  return data.data;
};

export const reappealDocumentation = async (
  nuevaFotoPerfilUrl: string,
): Promise<SanitizedProfile> => {
  const { data } = await api.post<{ data: SanitizedProfile; error: unknown; message: string }>(
    '/users/reappeal-documentation',
    { nueva_foto_perfil_url: nuevaFotoPerfilUrl },
  );
  if (!data?.data) {
    throw new Error('La respuesta del servidor no incluyó el perfil actualizado.');
  }
  return data.data;
};

export { api };
