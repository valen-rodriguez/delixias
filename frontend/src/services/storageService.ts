import { decode } from 'base64-arraybuffer';
import * as LegacyFileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { toApiError } from '@/services/usersService';

const AVATARS_BUCKET = 'avatares';
const STORAGE_UPLOAD_TIMEOUT_MS = 15000;
const AVATAR_CONTENT_TYPE = 'image/jpeg';
const AVATAR_STORAGE_PATH_PREFIX = 'avatares';

export const buildPublicAvatarUrl = (storagePath: string): string => {
  const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(storagePath);
  return data.publicUrl;
};

const AVATAR_UPLOAD_OPTIONS = {
  contentType: AVATAR_CONTENT_TYPE,
  upsert: false,
};

export const uploadAvatar = async (idUsuario: string, localUri: string): Promise<string> => {
  let base64: string;
  try {
    base64 = await LegacyFileSystem.readAsStringAsync(localUri, {
      encoding: LegacyFileSystem.EncodingType.Base64,
    });
  } catch (error) {
    throw toApiError(error);
  }

  const storagePath = `${AVATAR_STORAGE_PATH_PREFIX}/${idUsuario}/${Date.now()}.jpg`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), STORAGE_UPLOAD_TIMEOUT_MS);

  const uploadOptions = {
    ...AVATAR_UPLOAD_OPTIONS,
    signal: controller.signal,
  };

  try {
    const { error } = await supabase.storage
      .from(AVATARS_BUCKET)
      .upload(storagePath, decode(base64), uploadOptions);
    if (error) {
      throw toApiError(error);
    }
  } catch (error) {
    const errorName = (error as { name?: string } | null)?.name;
    if (errorName === 'AbortError') {
      throw new Error(
        'La subida de la imagen tardó demasiado. Verificá tu conexión e intentá de nuevo.',
      );
    }
    if (errorName === 'ApiError') {
      throw error;
    }
    throw toApiError(error);
  } finally {
    clearTimeout(timeoutId);
  }

  return buildPublicAvatarUrl(storagePath);
};

export const deleteLocalImage = async (uri: string): Promise<void> => {
  try {
    await LegacyFileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    return;
  }
};
