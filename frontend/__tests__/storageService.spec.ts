import { beforeEach, describe, it, expect, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readAsStringAsync: vi.fn(),
  deleteAsync: vi.fn(),
  from: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: mocks.readAsStringAsync,
  deleteAsync: mocks.deleteAsync,
  EncodingType: { Base64: 'base64' },
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    storage: { from: mocks.from },
  },
}));

vi.mock('@/services/usersService', () => ({
  toApiError: (error: unknown) => error,
}));

import { uploadAvatar, deleteLocalImage, buildPublicAvatarUrl } from '@/services/storageService';

const ID_USUARIO = '11111111-1111-1111-1111-111111111111';
const PUBLIC_URL = 'https://abc.supabase.co/storage/v1/object/public/avatares/x/1.jpg';

describe('uploadAvatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
  });

  it('lee el archivo, sube al bucket avatares y devuelve la URL pública', async () => {
    mocks.readAsStringAsync.mockResolvedValue('aGVsbG8=');
    mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });

    const url = await uploadAvatar(ID_USUARIO, 'file:///tmp/foto.jpg');

    expect(mocks.readAsStringAsync).toHaveBeenCalledWith('file:///tmp/foto.jpg', {
      encoding: 'base64',
    });
    const [path, body, options] = mocks.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^avatares/${ID_USUARIO}/\\d+\\.jpg$`));
    expect(body).toBeInstanceOf(ArrayBuffer);
    expect(options.contentType).toBe('image/jpeg');
    expect(options.upsert).toBe(false);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(url).toBe(PUBLIC_URL);
    expect(mocks.getPublicUrl).toHaveBeenCalledWith(path);
  });

  it('rechaza con el error del storage si la subida falla', async () => {
    mocks.readAsStringAsync.mockResolvedValue('aGVsbG8=');
    mocks.upload.mockResolvedValue({ data: null, error: new Error('bucket error') });

    await expect(uploadAvatar(ID_USUARIO, 'file:///tmp/foto.jpg')).rejects.toThrow('bucket error');
  });

  it('rechaza si la lectura del archivo local falla', async () => {
    mocks.readAsStringAsync.mockRejectedValue(new Error('no such file'));

    await expect(uploadAvatar(ID_USUARIO, 'file:///tmp/foto.jpg')).rejects.toThrow('no such file');
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it('aplica timeout de 15 segundos con AbortController (REQ-022)', async () => {
    vi.useFakeTimers();
    try {
      mocks.readAsStringAsync.mockResolvedValue('aGVsbG8=');
      mocks.upload.mockImplementation(
        (_path: string, _body: unknown, options: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => {
              const abortError = new Error('aborted');
              abortError.name = 'AbortError';
              reject(abortError);
            });
          }),
      );

      const pending = uploadAvatar(ID_USUARIO, 'file:///tmp/foto.jpg');
      const expectation = expect(pending).rejects.toThrow(
        'La subida de la imagen tardó demasiado. Verificá tu conexión e intentá de nuevo.',
      );
      await vi.advanceTimersByTimeAsync(15000);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('deleteLocalImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('llama deleteAsync con idempotent true', async () => {
    mocks.deleteAsync.mockResolvedValue(undefined);
    await deleteLocalImage('file:///tmp/foto.jpg');
    expect(mocks.deleteAsync).toHaveBeenCalledWith('file:///tmp/foto.jpg', { idempotent: true });
  });

  it('no lanza si el borrado falla', async () => {
    mocks.deleteAsync.mockRejectedValue(new Error('busy'));
    await expect(deleteLocalImage('file:///tmp/foto.jpg')).resolves.toBeUndefined();
  });
});

describe('buildPublicAvatarUrl', () => {
  it('delega en supabase storage getPublicUrl', () => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ upload: mocks.upload, getPublicUrl: mocks.getPublicUrl });
    mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: PUBLIC_URL } });
    expect(buildPublicAvatarUrl('avatares/x/1.jpg')).toBe(PUBLIC_URL);
    expect(mocks.from).toHaveBeenCalledWith('avatares');
  });
});
