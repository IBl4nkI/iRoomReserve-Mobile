import React, { useState, useEffect } from 'react';
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
import { loginWithEmail, getAuthErrorMessage, getUserProfile, useGoogleSignIn, handleGoogleSignInResponse } from '@/lib/auth';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const router = useRouter();

  const { request, response, promptAsync } = useGoogleSignIn();

  useEffect(() => {
    if (response) {
      handleGoogleResponse();
    }
  }, [response]);

  const handleGoogleResponse = async () => {
    try {
      const result = await handleGoogleSignInResponse(response);
      if (!result) return;
      const userProfile = await getUserProfile(result.user.uid);
      if (!userProfile?.role) {
        router.replace('/(auth)/role-selection');
      } else if (userProfile.status === 'pending') {
        router.replace('/(auth)/pending');
      } else {
        router.replace('/(main)/campus-select');
      }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage('Please fill in all fields');
      return;
    }
    setLoading(true);
    setErrorMessage('');
    try {
      const credential = await loginWithEmail(email, password);
      const userProfile = await getUserProfile(credential.user.uid);
      if (userProfile?.status === 'pending') {
        router.replace('/(auth)/pending');
      } else {
        router.replace('/(main)/campus-select');
      }
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
          <Text style={styles.title}>Sign In</Text>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#ffffff40"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#ffffff40"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.googleButton}
            onPress={() => promptAsync()}
            disabled={!request}
          >
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/register')}>
              <Text style={styles.registerLink}>Register</Text>
            </TouchableOpacity>
          </View>
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
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 20 },
  errorBox: { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef444450', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#ffffffb3', marginBottom: 6 },
  input: { backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, padding: 14, color: '#ffffff', marginBottom: 14 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, paddingHorizontal: 14, marginBottom: 8 },
  passwordInput: { flex: 1, padding: 14, color: '#ffffff' },
  eyeIcon: { fontSize: 18, padding: 4 },
  forgotPassword: { alignItems: 'flex-end', marginBottom: 16 },
  forgotPasswordText: { fontSize: 13, color: '#ffffff80', fontWeight: 'bold' },
  primaryButton: { backgroundColor: '#e11d48', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  divider: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#ffffff1a' },
  dividerText: { color: '#ffffff4d', fontSize: 13, marginHorizontal: 8 },
  googleButton: { backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff26', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  googleButtonText: { color: '#ffffffcc', fontWeight: 'bold', fontSize: 15 },
  registerRow: { flexDirection: 'row', justifyContent: 'center' },
  registerText: { color: '#ffffff66', fontSize: 13 },
  registerLink: { color: '#e11d48', fontWeight: 'bold', fontSize: 13 },
  footer: { textAlign: 'center', color: '#ffffff4d', fontSize: 11, paddingVertical: 16 },
});