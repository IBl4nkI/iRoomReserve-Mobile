import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { resetPassword, getAuthErrorMessage } from '@/lib/auth';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    setErrorMessage('');
    setSuccess(false);

    if (!email) {
      setErrorMessage('Please enter your email address.');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(email);
      setSuccess(true);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.appName}>iRoomReserve</Text>
          <Text style={styles.subtitle}>St. Dominic College of Asia</Text>
        </View>

        {/* Card */}
        <View style={styles.card}>

          {/* Icon */}
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>🔑</Text>
          </View>

          <Text style={styles.title}>Reset Password</Text>
          <Text style={styles.description}>
            Enter your email address and we'll send you a link to reset your password.
          </Text>

          {success ? (
            <>
              <View style={styles.successBox}>
                <Text style={styles.successTitle}>Reset link sent!</Text>
                <Text style={styles.successText}>
                  Check your email inbox for a password reset link. If you don't see it, check your spam folder.
                </Text>
              </View>
              <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/(auth)/login')}>
                <Text style={styles.primaryButtonText}>Back to Login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              {errorMessage ? (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>{errorMessage}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email Address</Text>
              <TextInput
                style={styles.input}
                placeholder="Please enter your email"
                placeholderTextColor="#ffffff40"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />

              <TouchableOpacity style={styles.primaryButton} onPress={handleSubmit} disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Send Reset Link</Text>
                )}
              </TouchableOpacity>

              <View style={styles.backRow}>
                <Text style={styles.backText}>Remember your password? </Text>
                <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
                  <Text style={styles.backLink}>Back to Login</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        {/* Footer */}
        <Text style={styles.footer}>iRoomReserve v1.0 — SDCA Capstone Project</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  header: { alignItems: 'center', marginBottom: 16 },
  appName: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#ffffff99' },
  card: { backgroundColor: '#ffffff0d', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#ffffff1a' },
  iconContainer: { alignItems: 'center', marginBottom: 16 },
  iconText: { fontSize: 40 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 13, color: '#ffffff80', textAlign: 'center', marginBottom: 20 },
  errorBox: { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef444450', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },
  successBox: { backgroundColor: '#22c55e20', borderWidth: 1, borderColor: '#22c55e50', borderRadius: 12, padding: 16, marginBottom: 16 },
  successTitle: { color: '#86efac', fontWeight: 'bold', fontSize: 14, textAlign: 'center', marginBottom: 6 },
  successText: { color: '#86efac', fontSize: 13, textAlign: 'center' },
  label: { fontSize: 13, fontWeight: 'bold', color: '#ffffffb3', marginBottom: 6 },
  input: { backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, padding: 14, color: '#ffffff', marginBottom: 16 },
  primaryButton: { backgroundColor: '#e11d48', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  backRow: { flexDirection: 'row', justifyContent: 'center' },
  backText: { color: '#ffffff66', fontSize: 13 },
  backLink: { color: '#e11d48', fontWeight: 'bold', fontSize: 13 },
  footer: { textAlign: 'center', color: '#ffffff4d', fontSize: 11, paddingVertical: 16 },
});