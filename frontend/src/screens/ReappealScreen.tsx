import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useProfile } from '@/context/ProfileContext';
import { MESSAGES } from '@/constants/messages';
import { toApiError, reappealDocumentation, getProfile } from '@/services/usersService';
import { uploadAvatar, deleteLocalImage } from '@/services/storageService';
import type { ParamList } from '../navigation/types';

type NavigationProps = StackNavigationProp<ParamList>;

export const ReappealScreen = () => {
  const navigation = useNavigation<NavigationProps>();
  const { profile, setProfile } = useProfile();
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
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

  const handleTakePhoto = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (result.canceled) {
      const { granted } = await ImagePicker.getCameraPermissionsAsync();
      if (!granted) {
        setPhotoError(MESSAGES.cameraUnavailable);
      }
      return;
    }
    const uri = result.assets[0]?.uri;
    if (!uri) {
      setPhotoError(MESSAGES.cameraUnavailable);
      return;
    }
    const previous = photoUriRef.current;
    photoUriRef.current = uri;
    setPhotoUri(uri);
    setPhotoError(null);
    if (previous && previous !== uri) {
      void deleteLocalImage(previous);
    }
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!profile || submitting) {
      return;
    }
    if (!photoUri) {
      setPhotoError(MESSAGES.upgradePhotoRequired);
      return;
    }
    setSubmitting(true);
    try {
      const publicUrl = await uploadAvatar(profile.id_usuario, photoUri);
      submittedRef.current = true;
      await deleteLocalImage(photoUri);
      const updated = await reappealDocumentation(publicUrl);
      navigation.goBack();
      setProfile(updated);
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.backendError === 'INVALID_STATE') {
        try {
          setProfile(await getProfile());
        } catch {
          // keep the local profile if the refresh fails
        }
        Alert.alert(MESSAGES.pendingReviewAlertTitle, MESSAGES.pendingReviewAlertBody);
      } else {
        Alert.alert(MESSAGES.switchErrorTitle, apiError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }, [profile, submitting, photoUri, navigation, setProfile]);

  if (!profile) {
    return null;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title}>{MESSAGES.reappealTitle}</Text>
      <Text style={styles.body}>{MESSAGES.reappealBody}</Text>

      <Pressable style={styles.photoButton} onPress={handleTakePhoto} disabled={submitting}>
        <Text style={styles.photoButtonText}>
          {photoUri ? MESSAGES.upgradePhotoRetake : MESSAGES.upgradePhotoButton}
        </Text>
      </Pressable>
      {photoUri ? <Image source={{ uri: photoUri }} style={styles.photoPreview} /> : null}
      {photoError ? <Text style={styles.errorText}>{photoError}</Text> : null}

      <Pressable
        style={[styles.submitButton, submitting ? styles.submitButtonDisabled : null]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <View style={styles.submittingRow}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.submitButtonText}>{MESSAGES.reappealSubmitting}</Text>
          </View>
        ) : (
          <Text style={styles.submitButtonText}>{MESSAGES.reappealSubmit}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    alignItems: 'stretch',
    justifyContent: 'center',
    backgroundColor: '#fafafa',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  body: {
    marginTop: 12,
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
  },
  photoButton: {
    marginTop: 24,
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
  errorText: {
    marginTop: 8,
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
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
});
