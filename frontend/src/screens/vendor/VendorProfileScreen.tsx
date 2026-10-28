import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { MESSAGES } from '@/constants/messages';
import { useProfile } from '@/context/ProfileContext';
import { switchProfileRole, toApiError } from '@/services/usersService';

export const VendorProfileScreen = () => {
  const { profile, setProfile } = useProfile();
  const [switching, setSwitching] = useState(false);

  const handleSwitchToClient = useCallback(async () => {
    if (!profile || switching) {
      return;
    }
    setSwitching(true);
    try {
      const updated = await switchProfileRole('cliente');
      setProfile(updated);
    } catch (error) {
      Alert.alert(MESSAGES.switchErrorTitle, toApiError(error).message);
    } finally {
      setSwitching(false);
    }
  }, [profile, switching, setProfile]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{MESSAGES.vendorProfileTitle}</Text>
      <Text style={styles.placeholder}>{MESSAGES.vendorProfilePlaceholder}</Text>
      {profile?.email ? <Text style={styles.email}>{profile.email}</Text> : null}

      <Pressable
        style={[styles.switchButton, switching ? styles.switchButtonDisabled : null]}
        onPress={handleSwitchToClient}
        disabled={switching}
      >
        {switching ? (
          <View style={styles.switchingRow}>
            <ActivityIndicator color="#ffffff" />
            <Text style={styles.switchButtonText}>{MESSAGES.switchingInProgress}</Text>
          </View>
        ) : (
          <Text style={styles.switchButtonText}>{MESSAGES.switchToClientButton}</Text>
        )}
      </Pressable>
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
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  placeholder: {
    marginTop: 12,
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
  },
  email: {
    marginTop: 8,
    fontSize: 14,
    color: '#9ca3af',
  },
  switchButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#111827',
    alignItems: 'center',
    minWidth: 220,
  },
  switchButtonDisabled: {
    opacity: 0.6,
  },
  switchButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ffffff',
  },
  switchingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
