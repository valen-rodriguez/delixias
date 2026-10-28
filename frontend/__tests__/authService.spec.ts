import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  signIn,
  signUp,
  signOut,
  getSession,
  refreshSession,
  resendSignupEmail,
  onAuthStateChange,
} from '@/services/authService';

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  resend: vi.fn(),
  onAuthStateChange: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: mocks },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('signIn', () => {
  it('returns session on success', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: { access_token: 'abc', user: { id: 'u1', email: 'a@b.com' } }, error: null },
      error: null,
    } as any);
    const session = await signIn('a@b.com', 'pass');
    expect(session?.access_token).toBe('abc');
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.com', password: 'pass' });
  });

  it('throws on error', async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null, error: new Error('invalid credentials') },
      error: new Error('invalid credentials'),
    } as any);
    await expect(signIn('a@b.com', 'pass')).rejects.toThrow('invalid credentials');
  });
});

describe('signUp', () => {
  it('returns session null and userId when email confirmation required', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: { id: 'u1' } },
      error: null,
    } as any);
    const result = await signUp({
      email: 'a@b.com',
      password: 'pass',
      nombre_completo: 'Juan Pérez',
      telefono: '+5491112345678',
    });
    expect(result.session).toBeNull();
    expect(result.userId).toBe('u1');
    expect(mocks.signUp).toHaveBeenCalledWith({
      email: 'a@b.com',
      password: 'pass',
      options: { data: { nombre_completo: 'Juan Pérez', telefono: '+5491112345678' } },
    });
  });

  it('returns session when signUp auto-confirms', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: { access_token: 'tok', user: { id: 'u1' } }, error: null },
      error: null,
    } as any);
    const result = await signUp({
      email: 'a@b.com',
      password: 'pass',
      nombre_completo: 'X',
      telefono: '+5491112345678',
    });
    expect(result.session?.access_token).toBe('tok');
  });

  it('throws on error', async () => {
    mocks.signUp.mockResolvedValue({
      data: { session: null, user: null },
      error: new Error('User already registered'),
    } as any);
    await expect(
      signUp({
        email: 'a@b.com',
        password: 'pass',
        nombre_completo: 'X',
        telefono: '+5491112345678',
      }),
    ).rejects.toThrow('User already registered');
  });
});

describe('signOut', () => {
  it('resolves on success', async () => {
    mocks.signOut.mockResolvedValue({ error: null });
    await expect(signOut()).resolves.toBeUndefined();
  });

  it('throws on error', async () => {
    mocks.signOut.mockResolvedValue({ error: new Error('signout failed') });
    await expect(signOut()).rejects.toThrow('signout failed');
  });
});

describe('getSession', () => {
  it('returns session or null', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
      error: null,
    } as any);
    const session = await getSession();
    expect(session?.access_token).toBe('tok');

    mocks.getSession.mockResolvedValue({ data: { session: null }, error: null } as any);
    const empty = await getSession();
    expect(empty).toBeNull();
  });
});

describe('refreshSession', () => {
  it('returns refreshed session', async () => {
    mocks.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'newtok' } },
      error: null,
    } as any);
    const session = await refreshSession();
    expect(session?.access_token).toBe('newtok');
  });
});

describe('resendSignupEmail', () => {
  it('calls resend with signup type and resolves', async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: null });
    await expect(resendSignupEmail('a@b.com')).resolves.toBeUndefined();
    expect(mocks.resend).toHaveBeenCalledWith({ type: 'signup', email: 'a@b.com' });
  });

  it('throws on error', async () => {
    mocks.resend.mockResolvedValue({ data: {}, error: new Error('resend failed') });
    await expect(resendSignupEmail('a@b.com')).rejects.toThrow('resend failed');
  });
});

describe('onAuthStateChange', () => {
  it('subscribes and returns the supabase subscription', () => {
    const unsubscribe = vi.fn();
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe } } });
    const callback = vi.fn();
    const result = onAuthStateChange(callback);
    expect(mocks.onAuthStateChange).toHaveBeenCalledWith(callback);
    expect(result.data.subscription.unsubscribe).toBe(unsubscribe);
  });
});
