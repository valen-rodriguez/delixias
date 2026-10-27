import { supabase } from '@/lib/supabase';
import type { Session } from '@supabase/supabase-js';

export const signIn = async (email: string, password: string): Promise<Session | null> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session ?? null;
};

export const signUp = async (params: {
  email: string;
  password: string;
  nombre_completo: string;
  telefono: string;
}): Promise<{ session: Session | null; userId: string }> => {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        nombre_completo: params.nombre_completo,
        telefono: params.telefono,
      },
    },
  });
  if (error) throw error;
  return {
    session: data.session ?? null,
    userId: data.user?.id ?? '',
  };
};

export const signOut = async (): Promise<void> => {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
};

export const getSession = async (): Promise<Session | null> => {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
};

export const refreshSession = async (): Promise<Session | null> => {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session ?? null;
};

export const resendSignupEmail = async (email: string): Promise<void> => {
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) throw error;
};

export const onAuthStateChange = (callback: (event: string, session: Session | null) => void) => {
  return supabase.auth.onAuthStateChange(callback);
};
