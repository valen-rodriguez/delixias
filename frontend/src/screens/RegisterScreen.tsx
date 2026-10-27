import { useState } from 'react';
import { StackNavigationProp } from '@react-navigation/stack';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardBottomInset } from '@/hooks/useKeyboardBottomInset';
import { signUp } from '@/services/authService';
import { normalizePhone, isValidE164, formatPhoneMask } from '@/utils/phone';
import { MESSAGES } from '@/constants/messages';
import type { RouteProp } from '@react-navigation/native';
import type { ParamList } from '../navigation/types';
import { useNavigation } from '@react-navigation/native';

type Props = {
  route: RouteProp<ParamList, 'Register'>;
};

export const RegisterScreen = ({ route: _route }: Props) => {
  const navigation = useNavigation<StackNavigationProp<ParamList>>();
  const keyboardInset = useKeyboardBottomInset();
  const [fullName, setFullName] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    setError(null);
    const telefono = normalizePhone(phoneRaw);
    if (!fullName.trim() || !email.trim() || !password || !telefono) {
      setError('Completá todos los campos');
      return;
    }
    if (!isValidE164(telefono)) {
      setError('El teléfono debe tener formato +549XXXXXXXXXX');
      return;
    }
    setLoading(true);
    try {
      await signUp({ email, password, nombre_completo: fullName.trim(), telefono });
      navigation.navigate('EmailVerification');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('already') || message.includes('ya') || message.includes('duplicate')) {
        setError(MESSAGES.registerErrorEmailInUse);
      } else {
        setError(MESSAGES.registerErrorGeneric);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: keyboardInset + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <Text style={styles.title}>{MESSAGES.registerTitle}</Text>
        <Text style={styles.label}>{MESSAGES.registerFullNameLabel}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="words"
          value={fullName}
          onChangeText={setFullName}
          placeholder="Juan Pérez"
        />
        <Text style={styles.label}>{MESSAGES.registerPhoneLabel}</Text>
        <TextInput
          style={styles.input}
          keyboardType="phone-pad"
          value={phoneRaw}
          onChangeText={(text) => setPhoneRaw(formatPhoneMask(text))}
          placeholder="+54 9 11 1234-5678"
          autoComplete="tel"
        />
        <Text style={styles.label}>{MESSAGES.registerEmailLabel}</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="nombre@dominio.com"
          autoComplete="email"
        />
        <Text style={styles.label}>{MESSAGES.registerPasswordLabel}</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <TouchableOpacity style={styles.button} onPress={handleRegister} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Creando...' : MESSAGES.registerButton}</Text>
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
});
