import { useState } from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardBottomInset } from '@/hooks/useKeyboardBottomInset';
import { signIn } from '@/services/authService';
import { MESSAGES } from '@/constants/messages';
import type { RouteProp } from '@react-navigation/native';
import type { ParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';

type Props = {
  route: RouteProp<ParamList, 'Login'>;
};

export const LoginScreen = ({ route: _route }: Props) => {
  const navigation = useNavigation<StackNavigationProp<ParamList>>();
  const keyboardInset = useKeyboardBottomInset();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      navigation.reset({ index: 0, routes: [{ name: 'Splash' }] });
    } catch {
      setError(MESSAGES.loginErrorInvalid);
    } finally {
      setLoading(false);
    }
  };

  const goToRegister = () => {
    navigation.navigate('Register');
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: keyboardInset + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.title}>{MESSAGES.loginTitle}</Text>
        <Text style={styles.label}>{MESSAGES.loginEmailLabel}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="nombre@dominio.com"
          autoComplete="email"
        />
        <Text style={styles.label}>{MESSAGES.loginPasswordLabel}</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoComplete="password"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Ingresando...' : MESSAGES.loginButton}</Text>
        </TouchableOpacity>
        <View style={styles.dividerRow}>
          <View style={styles.divider} />
          <Text style={styles.dividerText}>o</Text>
          <View style={styles.divider} />
        </View>
        <TouchableOpacity style={styles.link} onPress={goToRegister}>
          <Text style={styles.linkText}>
            {MESSAGES.loginNoAccount} {MESSAGES.loginRegisterLink}
          </Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 6,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 8,
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: '#e5e7eb',
  },
  dividerText: {
    color: '#6b7280',
    fontSize: 14,
    marginHorizontal: 12,
  },
  link: {
    alignItems: 'center',
  },
  linkText: {
    color: '#2563eb',
    fontSize: 15,
    fontWeight: '600',
  },
});
