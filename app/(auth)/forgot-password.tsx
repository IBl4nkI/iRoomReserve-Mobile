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
import { colors, fonts } from '@/constants/theme';

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
                placeholderTextColor={colors.mutedText}
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
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  header: { alignItems: 'center', marginBottom: 16 },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.secondary },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  iconContainer: { alignItems: 'center', marginBottom: 16 },
  iconText: { fontSize: 40 },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, textAlign: 'center', marginBottom: 8 },
  description: { fontSize: 13, color: colors.secondary, textAlign: 'center', marginBottom: 20, fontFamily: fonts.regular },
  errorBox: { backgroundColor: colors.dangerBackground, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: colors.dangerText, fontSize: 13, fontFamily: fonts.regular },
  successBox: { backgroundColor: colors.successBackground, borderWidth: 1, borderColor: colors.successBorder, borderRadius: 12, padding: 16, marginBottom: 16 },
  successTitle: { color: colors.successText, fontFamily: fonts.bold, fontSize: 14, textAlign: 'center', marginBottom: 6 },
  successText: { color: colors.successText, fontSize: 13, textAlign: 'center', fontFamily: fonts.regular },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, marginBottom: 6 },
  input: { backgroundColor: colors.subtleBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.text, marginBottom: 16, fontFamily: fonts.regular },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  backRow: { flexDirection: 'row', justifyContent: 'center' },
  backText: { color: colors.secondary, fontSize: 13, fontFamily: fonts.regular },
  backLink: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  footer: { textAlign: 'center', color: colors.secondary, fontSize: 11, paddingVertical: 16, fontFamily: fonts.regular },
});
