import { StyleSheet, Text, View } from 'react-native';
import { MESSAGES } from '@/constants/messages';
import type { RouteProp } from '@react-navigation/native';
import type { ParamList } from '../navigation/types';

type Props = {
  route: RouteProp<ParamList, 'Home'> & {
    params: { rol: string; modoForzado?: boolean; vendorStatusBanner?: string | null };
  };
};

export const HomeScreen = ({ route }: Props) => {
  const { rol, modoForzado, vendorStatusBanner } = route.params;

  const welcomeText = rol === 'vendedor' ? MESSAGES.welcomeVendor : MESSAGES.welcomeClient;

  return (
    <View style={styles.container}>
      <Text style={styles.welcome}>{welcomeText}</Text>
      {modoForzado && vendorStatusBanner && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            {vendorStatusBanner === 'suspendido'
              ? MESSAGES.vendorSuspendedWithReason('Tu cuenta de vendedor no está activa.')
              : vendorStatusBanner === 'pendiente_revision'
                ? MESSAGES.vendorPendingReview
                : MESSAGES.vendorBlocked}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcome: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
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
});
