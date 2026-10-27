import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { StackNavigationProp } from '@react-navigation/stack';
import { getSession } from '@/services/authService';
import { getProfile } from '@/services/usersService';
import { resolveInitialScreen } from '@/navigation/routingGate';
import { useNavigation } from '@react-navigation/native';
import type { ParamList } from '../navigation/types';

export const SplashScreen = () => {
  const navigation = useNavigation<StackNavigationProp<ParamList>>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const resolveSession = async () => {
      let hasSession = false;
      let profile = null;
      try {
        const session = await getSession();
        hasSession = !!session;
        if (hasSession) {
          try {
            profile = await getProfile();
          } catch {
            profile = null;
          }
        }
      } catch {
        hasSession = false;
      } finally {
        const result = resolveInitialScreen(hasSession, profile);
        if (result.screen === 'Home') {
          navigation.replace('Home', {
            rol: result.rol,
            modoForzado: result.modoForzado,
            vendorStatusBanner: result.vendorStatusBanner ?? null,
          });
        } else {
          navigation.replace('Login');
        }
        setLoading(false);
      }
    };
    resolveSession();
  }, []);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.text}>Cargando sesión...</Text>
      </View>
    );
  }

  return null;
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
