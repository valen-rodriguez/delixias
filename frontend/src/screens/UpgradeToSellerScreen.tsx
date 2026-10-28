import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useProfile } from '@/context/ProfileContext';
import { MESSAGES } from '@/constants/messages';
import { normalizeDni, isValidDni } from '@/utils/dni';
import { switchProfileRole, toApiError, upgradeToSeller } from '@/services/usersService';
import { uploadAvatar, deleteLocalImage } from '@/services/storageService';
import { signOut } from '@/services/authService';

interface FieldErrors {
  dni: string | null;
  address: string | null;
  photo: string | null;
}

const EMPTY_FIELD_ERRORS: FieldErrors = { dni: null, address: null, photo: null };

export const UpgradeToSellerScreen = () => {
  const { profile, setProfile, clearProfile } = useProfile();
  const [dni, setDni] = useState('');
  const [direccion, setDireccion] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS);
  const [submitting, setSubmitting] = useState(false);

  const photoUriRef = useRef<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    return () => {
      const uri = photoUriRef.current;
      if (uri && !submittedRef.current) {
        void deleteLocalImage(uri);
      }
    };
  }, []);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      clearProfile();
    }
  }, [clearProfile]);

  const handleTakePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) {
      const { granted } = await ImagePicker.getCameraPermissionsAsync();
      if (!granted) {
        setFieldErrors((prev) => ({ ...prev, photo: MESSAGES.cameraUnavailable }));
      }
      return;
    }
    const uri = result.assets[0]?.uri;
    if (!uri) {
      setFieldErrors((prev) => ({ ...prev, photo: MESSAGES.cameraUnavailable }));
      return;
    }
    const previous = photoUriRef.current;
    photoUriRef.current = uri;
    setPhotoUri(uri);
    setFieldErrors((prev) => ({ ...prev, photo: null }));
    if (previous && previous !== uri) {
      void deleteLocalImage(previous);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile || submitting) {
      return;
    }
    const nextErrors: FieldErrors = {
      dni: !isValidDni(dni) ? MESSAGES.upgradeDniInvalid : null,
      address: !direccion.trim() ? MESSAGES.upgradeAddressInvalid : null,
      photo: !photoUri ? MESSAGES.upgradePhotoRequired : null,
    };
    setFieldErrors(nextErrors);
    if (nextErrors.dni || nextErrors.address || nextErrors.photo || !photoUri) {
      return;
    }

    setSubmitting(true);
    try {
      const publicUrl = await uploadAvatar(profile.id_usuario, photoUri);
      submittedRef.current = true;
      await deleteLocalImage(photoUri);
      const updated = await upgradeToSeller({
        dni,
        direccion: direccion.trim(),
        foto_perfil_url: publicUrl,
      });
      setProfile(updated);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.backendError === 'DNI_ALREADY_IN_USE') {
        setFieldErrors((prev) => ({ ...prev, dni: MESSAGES.upgradeDniInUse }));
      } else if (apiError.backendError === 'ALREADY_ACTIVE') {
        try {
          const recovered = await switchProfileRole('vendedor');
          setProfile(recovered);
        } catch (fallbackError) {
          Alert.alert(MESSAGES.switchErrorTitle, toApiError(fallbackError).message);
        }
      } else {
        Alert.alert(MESSAGES.switchErrorTitle, apiError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [profile, submitting, dni, direccion, photoUri, setProfile]);

  if (!profile) {
    return null;
  }

  const profileIncomplete = !profile.nombre_completo.trim() || !profile.telefono.trim();

  if (profileIncomplete) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.blockingTitle}>{MESSAGES.profileIncompleteTitle}</Text>
        <Text style={styles.blockingBody}>{MESSAGES.profileIncompleteBody}</Text>
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>{MESSAGES.signOutButton}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{MESSAGES.upgradeTitle}</Text>

        <Text style={styles.label}>{MESSAGES.upgradeDniLabel}</Text>
        <TextInput
          style={[styles.input, fieldErrors.dni ? styles.inputError : null]}
          value={dni}
          onChangeText={(text) => setDni(normalizeDni(text))}
          keyboardType="number-pad"
          maxLength={9}
          placeholder="12345678"
          placeholderTextColor="#9ca3af"
        />
        {fieldErrors.dni ? <Text style={styles.errorText}>{fieldErrors.dni}</Text> : null}

        <Text style={styles.label}>{MESSAGES.upgradeAddressLabel}</Text>
        <TextInput
          style={[
            styles.input,
            styles.addressInput,
            fieldErrors.address ? styles.inputError : null,
          ]}
          value={direccion}
          onChangeText={setDireccion}
          multiline
          placeholder="Calle, número, ciudad"
          placeholderTextColor="#9ca3af"
        />
        {fieldErrors.address ? <Text style={styles.errorText}>{fieldErrors.address}</Text> : null}

        <Pressable style={styles.photoButton} onPress={handleTakePhoto} disabled={submitting}>
          <Text style={styles.photoButtonText}>
            {photoUri ? MESSAGES.upgradePhotoRetake : MESSAGES.upgradePhotoButton}
          </Text>
        </Pressable>
        {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : null}
        {fieldErrors.photo ? <Text style={styles.errorText}>{fieldErrors.photo}</Text> : null}

        <Pressable
          style={[styles.submitButton, submitting ? styles.submitButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={submitting}
        >
          {submitting ? (
            <View style={styles.submittingRow}>
              <ActivityIndicator color="#ffffff" />
              <Text style={styles.submitButtonText}>{MESSAGES.upgradeSubmitting}</Text>
            </View>
          ) : (
            <Text style={styles.submitButtonText}>{MESSAGES.upgradeSubmit}</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    padding: 24,
    alignItems: 'stretch',
  },
  centeredContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#ffffff',
    marginBottom: 4,
  },
  addressInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputError: {
    borderColor: '#dc2626',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    marginBottom: 8,
  },
  photoButton: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#111827',
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  photoPreview: {
    marginTop: 12,
    width: '100%',
    height: 200,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
  },
  submitButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  submittingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  blockingTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  blockingBody: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
});
