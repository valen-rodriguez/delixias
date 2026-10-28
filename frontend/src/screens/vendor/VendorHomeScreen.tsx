import { StyleSheet, Text, View } from 'react-native';
import { MESSAGES } from '@/constants/messages';
import { useProfile } from '@/context/ProfileContext';

export const VendorHomeScreen = () => {
  const { profile } = useProfile();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{profile?.nombre_completo ?? MESSAGES.welcomeVendor}</Text>
      <Text style={styles.placeholder}>{MESSAGES.vendorHomePlaceholder}</Text>
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
});
