import React, { useState } from "react";
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
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import GoogleIcon from "@/components/GoogleIcon";
import { useToast } from "@/components/toast-provider";
import { colors, fonts } from "@/constants/theme";
import {
  loginWithEmail,
  getAuthErrorMessage,
  getUserProfile,
  resendVerificationEmail,
  signInWithGoogle,
  logout,
} from "@/lib/auth";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showResendButton, setShowResendButton] = useState(false);
  const router = useRouter();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ pending?: string }>();
  const isPending = params.pending === "true";

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMessage("");

    try {
      const result = await signInWithGoogle();
      const userProfile = await getUserProfile(result.user.uid);
      if (!userProfile?.role) {
        router.replace("/(auth)/role-selection");
      } else if (userProfile.status === "pending") {
        await logout();
        router.replace("/(auth)/login?pending=true");
      } else {
        showToast("Login successful!");
        router.replace("/(main)/campus-select");
      }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ""));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setErrorMessage("Please fill in all fields");
      return;
    }
    setLoading(true);
    setErrorMessage("");
    try {
      const credential = await loginWithEmail(email, password);
      const userProfile = await getUserProfile(credential.user.uid);
      if (userProfile?.status === "pending") {
        await logout();
        router.replace("/(auth)/login?pending=true");
      } else {
        showToast("Login successful!");
        router.replace("/(main)/campus-select");
      }
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      const code = firebaseError.code || "";
      setErrorMessage(getAuthErrorMessage(code));
      setShowResendButton(code === "auth/email-not-verified");
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ""));
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail(email, password);
      setShowResendButton(false);
      setErrorMessage(
        "Verification email resent! Check your inbox or spam folder."
      );
    } catch (err: unknown) {
      const firebaseError = err as { code?: string };
      setErrorMessage(getAuthErrorMessage(firebaseError.code || ""));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: 28,
            paddingBottom: 8,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.appName}>iRoomReserve</Text>
          <Text style={styles.subtitle}>St. Dominic College of Asia</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.title}>Sign In</Text>

          {errorMessage ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{errorMessage}</Text>
              {showResendButton && (
                <TouchableOpacity onPress={handleResendVerification} style={styles.resendButton}>
                  <Text style={styles.resendText}>Resend verification email</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

          {isPending ? (
            <View style={styles.pendingBox}>
              <Text style={styles.pendingText}>
                Your account is pending Super Admin approval. You will be notified once approved.
              </Text>
            </View>
          ) : null}

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
              placeholder="Enter your password"
              placeholderTextColor={colors.mutedText}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")} style={styles.forgotPassword}>
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

          <TouchableOpacity style={styles.googleButton} onPress={handleGoogleLogin} disabled={loading}>
            <View style={styles.googleContent}>
              <GoogleIcon width={20} height={20} />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </View>
          </TouchableOpacity>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => router.push("/(auth)/register")}>
              <Text style={styles.registerLink}>Register</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.footer}>iRoomReserve v1.0 - SDCA Capstone Project</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 16 },
  header: { alignItems: "center", marginBottom: 16 },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary },
  subtitle: { fontSize: 13, fontFamily: fonts.regular, color: colors.secondary },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 24,
    fontFamily: fonts.bold,
    color: colors.text,
    textAlign: "center",
    marginBottom: 20,
  },
  errorBox: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { color: colors.dangerText, fontSize: 13, fontFamily: fonts.regular },
  resendButton: { marginTop: 8 },
  resendText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  pendingBox: { backgroundColor: "#FFF7E6", borderWidth: 1, borderColor: "#F5C06A", borderRadius: 12, padding: 12, marginBottom: 12 },
  pendingText: { color: "#8A5A00", fontSize: 13, fontFamily: fonts.regular },
  label: { fontSize: 13, fontFamily: fonts.bold, color: colors.text, marginBottom: 6 },
  input: {
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    marginBottom: 14,
    fontFamily: fonts.regular,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingRight: 14,
    marginBottom: 8,
  },
  passwordInput: { flex: 1, padding: 14, color: colors.text, fontFamily: fonts.regular },
  eyeIcon: { fontSize: 14, padding: 4, marginLeft: 8, color: colors.secondary },
  forgotPassword: { alignItems: "flex-end", marginBottom: 16 },
  forgotPasswordText: { fontSize: 13, color: colors.primary, fontFamily: fonts.bold },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  primaryButtonText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
  divider: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    color: colors.secondary,
    fontSize: 13,
    marginHorizontal: 8,
    fontFamily: fonts.regular,
  },
  googleButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginBottom: 16,
  },
  googleContent: { flexDirection: "row", alignItems: "center" },
  googleButtonText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginLeft: 10,
  },
  registerRow: { flexDirection: "row", justifyContent: "center" },
  registerText: { color: colors.secondary, fontSize: 13, fontFamily: fonts.regular },
  registerLink: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13 },
  footer: {
    textAlign: "center",
    color: colors.secondary,
    fontSize: 11,
    paddingVertical: 16,
    fontFamily: fonts.regular,
  },
});
