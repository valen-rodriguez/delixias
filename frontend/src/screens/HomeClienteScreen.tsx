import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { MESSAGES } from '@/constants/messages';
import { useProfile } from '@/context/ProfileContext';
import { resolveSwitchAction } from '@/navigation/roleSwitchGate';
import { getVendorBannerText } from '@/navigation/routingGate';
import { switchProfileRole, getProfile, toApiError } from '@/services/usersService';
import { signOut } from '@/services/authService';
import type { ParamList } from '../navigation/types';

type NavigationProps = StackNavigationProp<ParamList>;

export const HomeClienteScreen = () => {
  const navigation = useNavigation<NavigationProps>();
  const { profile, banner, setProfile, clearProfile } = useProfile();
  const [switching, setSwitching] = useState(false);
  const [suspendedModalVisible, setSuspendedModalVisible] = useState(false);

  const bannerText = getVendorBannerText(banner, profile?.motivo_suspension ?? null);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
    } finally {
      clearProfile();
    }
  }, [clearProfile]);

  const handleRoleSwitch = useCallback(async () => {
    if (!profile || switching) {
      return;
    }
    const action = resolveSwitchAction(profile);
    if (action === 'enterVendor') {
      setSwitching(true);
      try {
        const updated = await switchProfileRole('vendedor');
        setProfile(updated);
      } catch (error) {
        const apiError = toApiError(error);
        if (apiError.backendError === 'VENDEDOR_NOT_ACTIVE') {
          try {
            setProfile(await getProfile());
          } catch {
            // keep the local profile if the refresh fails
          }
          setSuspendedModalVisible(true);
        } else {
          Alert.alert(MESSAGES.switchErrorTitle, apiError.message);
        }
      } finally {
        setSwitching(false);
      }
      return;
    }
    if (action === 'openOnboarding') {
      navigation.navigate('UpgradeToSeller');
      return;
    }
    if (action === 'showSuspendedModal') {
      setSuspendedModalVisible(true);
      return;
    }
    if (action === 'showPendingReviewAlert') {
      Alert.alert(MESSAGES.pendingReviewAlertTitle, MESSAGES.pendingReviewAlertBody);
      return;
    }
    Alert.alert(MESSAGES.blockedAlertTitle, MESSAGES.blockedAlertBody);
  }, [profile, switching, navigation, setProfile]);

  if (!profile) {
    return null;
  }

  const isBlocked = profile.estado_vendedor === 'bloqueado';
  const showFixDocsButton = banner === 'suspendido' && profile.estado_vendedor === 'suspendido';

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>{MESSAGES.welcomeClient}</Text>
      <Text style={styles.name}>{profile.nombre_completo}</Text>

      {bannerText ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{bannerText}</Text>
        </View>
      ) : null}

      {showFixDocsButton ? (
        <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate('Reappeal')}>
          <Text style={styles.secondaryButtonText}>{MESSAGES.fixDocsUnderBanner}</Text>
        </Pressable>
      ) : null}

      <Pressable
        style={[styles.primaryButton, isBlocked ? styles.primaryButtonDisabled : null]}
        onPress={handleRoleSwitch}
        disabled={switching || isBlocked}
      >
        {switching ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <Text style={styles.primaryButtonText}>{MESSAGES.switchToVendorButton}</Text>
        )}
      </Pressable>

      {isBlocked ? <Text style={styles.blockedNotice}>{MESSAGES.blockedNotice}</Text> : null}

      <Pressable style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutButtonText}>{MESSAGES.signOutButton}</Text>
      </Pressable>

      <Modal
        visible={suspendedModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSuspendedModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{MESSAGES.suspendedModalTitle}</Text>
            <Text style={styles.modalReason}>
              {profile.motivo_suspension?.trim()
                ? profile.motivo_suspension
                : MESSAGES.suspendedModalDefaultReason}
            </Text>
            <Pressable
              style={styles.modalPrimaryButton}
              onPress={() => {
                setSuspendedModalVisible(false);
                navigation.navigate('Reappeal');
              }}
            >
              <Text style={styles.modalPrimaryButtonText}>{MESSAGES.suspendedModalFixDocs}</Text>
            </Pressable>
            <Pressable
              style={styles.modalSecondaryButton}
              onPress={() => setSuspendedModalVisible(false)}
            >
              <Text style={styles.modalSecondaryButtonText}>{MESSAGES.suspendedModalAccept}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  welcome: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  name: {
    marginTop: 4,
    fontSize: 15,
    color: '#6b7280',
  },
  banner: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    alignItems: 'center',
  },
  bannerText: {
    fontSize: 14,
    color: '#92400e',
    textAlign: 'center',
  },
  secondaryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#92400e',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
  },
  primaryButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    minWidth: 220,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  blockedNotice: {
    marginTop: 10,
    fontSize: 14,
    color: '#991b1b',
    textAlign: 'center',
  },
  signOutButton: {
    marginTop: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
    minWidth: 220,
  },
  signOutButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  modalReason: {
    marginTop: 12,
    fontSize: 14,
    color: '#374151',
    textAlign: 'center',
  },
  modalPrimaryButton: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  modalPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  modalSecondaryButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    color: '#6b7280',
  },
});
