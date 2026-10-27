import axios from 'axios';
import type { AxiosInstance } from 'axios';
import { supabase } from '@/lib/supabase';
import { refreshSession } from '@/services/authService';
import type { SanitizedProfile } from '@/types/auth';

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

export { api };
