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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { registerWithEmail, getAuthErrorMessage } from '@/lib/auth';

export default function RegisterScreen() {
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
  const [successMessage, setSuccessMessage] = useState('');
  const router = useRouter();

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
        contentContainerStyle={styles.scroll}
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
                placeholderTextColor="#ffffff40"
                value={firstName}
                onChangeText={setFirstName}
              />
            </View>
            <View style={styles.nameField}>
              <Text style={styles.label}>Last Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Last name"
                placeholderTextColor="#ffffff40"
                value={lastName}
                onChangeText={setLastName}
              />
            </View>
          </View>

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
              placeholder="Create a password"
              placeholderTextColor="#ffffff40"
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
              placeholderTextColor="#ffffff40"
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
  container: { flex: 1, backgroundColor: '#0f172a' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 16 },
  header: { alignItems: 'center', marginBottom: 16 },
  appName: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  subtitle: { fontSize: 13, color: '#ffffff99' },
  card: { backgroundColor: '#ffffff0d', borderRadius: 16, padding: 24, borderWidth: 1, borderColor: '#ffffff1a' },
  title: { fontSize: 24, fontWeight: 'bold', color: '#ffffff', textAlign: 'center', marginBottom: 4 },
  description: { fontSize: 13, color: '#ffffff80', textAlign: 'center', marginBottom: 16 },
  tabContainer: { flexDirection: 'row', backgroundColor: '#ffffff0d', borderRadius: 12, padding: 4, borderWidth: 1, borderColor: '#ffffff1a', marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8, alignItems: 'center' },
  activeTab: { backgroundColor: '#e11d48' },
  tabText: { fontSize: 12, fontWeight: 'bold', color: '#ffffff80' },
  activeTabText: { color: '#ffffff' },
  errorBox: { backgroundColor: '#ef444420', borderWidth: 1, borderColor: '#ef444450', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#fca5a5', fontSize: 13 },
  nameRow: { flexDirection: 'row', gap: 8, marginBottom: 0 },
  nameField: { flex: 1 },
  label: { fontSize: 13, fontWeight: 'bold', color: '#ffffffb3', marginBottom: 6, marginTop: 8 },
  input: { backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, padding: 14, color: '#ffffff', marginBottom: 4 },
  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff1a', borderRadius: 12, paddingHorizontal: 14, marginBottom: 4 },
  passwordInput: { flex: 1, padding: 14, color: '#ffffff' },
  eyeIcon: { fontSize: 18, padding: 4 },
  passwordHint: { fontSize: 11, color: '#ffffff4d', marginBottom: 8 },
  primaryButton: { backgroundColor: '#e11d48', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  primaryButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 15 },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 16 },
  loginText: { color: '#ffffff66', fontSize: 13 },
  loginLink: { color: '#e11d48', fontWeight: 'bold', fontSize: 13 },
  footer: { textAlign: 'center', color: '#ffffff4d', fontSize: 11, paddingVertical: 16 },
  successBox: { backgroundColor: '#22c55e20', borderWidth: 1, borderColor: '#22c55e50', borderRadius: 12, padding: 12, marginBottom: 12 },
  successText: { color: '#86efac', fontSize: 13 },
});