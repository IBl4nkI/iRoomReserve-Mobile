import React, { useEffect, useRef, useState } from 'react';
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
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { registerWithEmail, getAuthErrorMessage } from '@/lib/auth';
import { colors, fonts } from '@/constants/theme';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [selectedRole, setSelectedRole] = useState('student');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage] = useState('');
  const router = useRouter();

  useEffect(() => {
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      scrollViewRef.current?.scrollTo({ y: 0, animated: true });
    });

    return () => {
      hideSubscription.remove();
    };
  }, []);

  const roles = [
    { key: 'student', label: 'Student' },
    { key: 'faculty', label: 'Faculty' },
    { key: 'utility_staff', label: 'Utility Staff' },
  ];

  const getRoleDisplayName = (tab: string) => {
    switch (tab) {
      case 'faculty': return 'Faculty Professor';
      case 'utility_staff': return 'Utility Staff';
      default: return 'Student';
    }
  };

  const validatePassword = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(pw)) return 'Password must include at least one uppercase letter';
    if (!/[0-9]/.test(pw)) return 'Password must include at least one number';
    return null;
  };

  const handleRegister = async () => {
    setErrorMessage('');

    if (!firstName || !lastName || !email || !password || !confirmPassword) {
      setErrorMessage('Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match');
      return;
    }

    const pwError = validatePassword(password);
    if (pwError) {
      setErrorMessage(pwError);
      return;
    }

    setLoading(true);

    try {
      const role = getRoleDisplayName(selectedRole);
      const result = await registerWithEmail(email, password, firstName, lastName, role);
      const determinedRole = result.actualRole;

      const message = determinedRole === 'Student'
        ? 'Account created! Please check your inbox or spam folder to verify your email before signing in.'
        : `Account created as ${determinedRole}! Your registration is pending for Admin approval.`;

      Alert.alert('Success', message, [
        {
          text: 'OK',
          onPress: () => router.replace('/(auth)/login'),
        },
      ]);
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: Math.max(insets.top, 32),
            paddingBottom: Math.max(insets.bottom, 0),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>

        {/* Header */}
          <View style={styles.header}>
            <Text style={styles.appName}>iRoomReserve</Text>
            <Text style={styles.subtitle}>St. Dominic College of Asia</Text>
          </View>

        {/* Card */}
        <View style={styles.card}>

          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.description}>Fill in your details to get started</Text>

          {/* Role Tabs */}
          <View style={styles.tabContainer}>
            {roles.map((role) => (
              <TouchableOpacity
                key={role.key}
                style={[styles.tab, selectedRole === role.key && styles.activeTab]}
                onPress={() => setSelectedRole(role.key)}
              >
                <Text style={[styles.tabText, selectedRole === role.key && styles.activeTabText]}>
                  {role.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {successMessage ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMessage}</Text>
            </View>
          ) : null}

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Name Row */}
          <View style={styles.nameRow}>
            <View style={styles.nameField}>
              <Text style={styles.label}>First Name</Text>
              <TextInput
                style={styles.input}
                placeholder="First name"
                placeholderTextColor={colors.mutedText}
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={styles.nameField}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor={colors.mutedText}
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor={colors.mutedText}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Create a password"
              placeholderTextColor={colors.mutedText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.passwordHint}>Min 8 chars, 1 uppercase, 1 number</Text>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Confirm your password"
              placeholderTextColor={colors.mutedText}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showConfirmPassword}
            />
            <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
              <Text style={styles.eyeIcon}>{showConfirmPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.primaryButton} onPress={handleRegister} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Register</Text>
            )}
          </TouchableOpacity>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
              <Text style={styles.loginLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>

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
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, textAlign: 'center', marginBottom: 4 },
  description: { fontSize: 13, fontFamily: fonts.regular, color: colors.secondary, textAlign: 'center', marginBottom: 16 },
  tabContainer: { flexDirection: 'row', backgroundColor: colors.subtleBackground, borderRadius: 12, padding: 4, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  activeTab: { backgroundColor: colors.primary },
  tabText: { fontSize: 12, fontFamily: fonts.bold, color: colors.secondary },
  activeTabText: { color: colors.white },
  errorBox: { backgroundColor: colors.dangerBackground, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: colors.dangerText, fontSize: 13, fontFamily: fonts.regular },
  nameRow: { flexDirection: 'row', gap: 8, marginBottom: 0 },
  nameField: { flex: 1 },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: colors.subtleBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14, color: colors.text, marginBottom: 4, fontFamily: fonts.regular },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.subtleBackground, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, marginBottom: 4 },
  passwordInput: { flex: 1, padding: 14, color: colors.text, fontFamily: fonts.regular },
  eyeIcon: { fontSize: 18, padding: 4 },
  passwordHint: { fontSize: 11, color: colors.secondary, marginBottom: 8, fontFamily: fonts.regular },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  loginText: { color: colors.secondary, fontSize: 13, fontFamily: fonts.regular },
  loginLink: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  footer: { textAlign: 'center', color: colors.secondary, fontSize: 11, paddingVertical: 16, fontFamily: fonts.regular },
  successBox: { backgroundColor: colors.successBackground, borderWidth: 1, borderColor: colors.successBorder, borderRadius: 12, padding: 12, marginBottom: 12 },
  successText: { color: colors.successText, fontSize: 13, fontFamily: fonts.regular },
});
