import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import { getSession, signOut } from '@/services/authService';
import { getProfile } from '@/services/usersService';
import { useProfile } from '@/context/ProfileContext';
import { resolveInitialScreen } from '@/navigation/routingGate';
import { deriveShellState } from '@/navigation/shellDerivation';
import type { ParamList } from '../navigation/types';

export const SplashScreen = () => {
  const navigation = useNavigation<StackNavigationProp<ParamList>>();
  const { setProfile, clearProfile } = useProfile();

  useEffect(() => {
    const resolveSession = async () => {
      try {
        const session = await getSession();
        if (session) {
          try {
            const profile = await getProfile();
            const result = resolveInitialScreen(true, profile);
            if (result.screen === 'Home') {
              setProfile(profile);
              const shell = deriveShellState(profile);
              navigation.replace(shell.screen === 'vendor' ? 'VendorTabs' : 'HomeCliente');
              return;
            }
          } catch {
            // fall through to sign-out path
          }
        }
      } catch {
        // fall through to sign-out path
      }
      try {
        await signOut();
      } catch {
        // best-effort sign-out
      }
      clearProfile();
      navigation.replace('Login');
    };
    void resolveSession();
  }, [navigation, setProfile, clearProfile]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#000000" />
      <Text style={styles.text}>Cargando sesión...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    marginTop: 12,
    fontSize: 16,
    color: '#333333',
  },
});
