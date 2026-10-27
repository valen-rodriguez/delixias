import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useKeyboardBottomInset } from '@/hooks/useKeyboardBottomInset';
import { resendSignupEmail } from '@/services/authService';
import { MESSAGES } from '@/constants/messages';

export const EmailVerificationScreen = () => {
  const keyboardInset = useKeyboardBottomInset();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleResend = async () => {
    setLoading(true);
    try {
      await resendSignupEmail(email);
    } catch {
      // error handled generically
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, { paddingBottom: keyboardInset + 24 }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>{MESSAGES.emailVerificationTitle}</Text>
      <Text style={styles.body}>{MESSAGES.emailVerificationBody}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          placeholder="nombre@dominio.com"
        />
        <TouchableOpacity style={styles.resendButton} onPress={handleResend} disabled={loading}>
          <Text style={styles.resendText}>{MESSAGES.emailVerificationResend}</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.button}>
        <Text style={styles.buttonText}>{MESSAGES.emailVerificationButton}</Text>
      </TouchableOpacity>
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
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    width: '100%',
    marginBottom: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  resendButton: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
  },
  resendText: {
    fontSize: 14,
    color: '#2563eb',
  },
  button: {
    backgroundColor: '#111827',
    borderRadius: 8,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
