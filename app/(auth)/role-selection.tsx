import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { auth } from "@/lib/firebase";
import { getUserProfile, isAllowedEmail, logout, saveUserProfile } from "@/lib/auth";
import { colors, fonts } from "@/constants/theme";

const ROLE_OPTIONS = [
  {
    label: "Student",
    value: "Student",
    description: "Browse and reserve rooms for study or group work.",
  },
  {
    label: "Faculty",
    value: "Faculty",
    description: "Reserve rooms for classes or faculty meetings.",
  },
  {
    label: "Utility Staff",
    value: "Utility Staff",
    description: "Manage room equipment and facilities.",
  },
];

export default function RoleSelectionScreen() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState("Student");
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      const user = auth.currentUser;

      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      try {
        const profile = await getUserProfile(user.uid);
        if (!isMounted) {
          return;
        }

        if (profile?.role) {
          setSelectedRole(profile.role);
        }
      } finally {
        if (isMounted) {
          setBootstrapping(false);
        }
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleContinue = async () => {
    const user = auth.currentUser;

    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    setLoading(true);

    try {
      const email = user.email ?? "";
      if (!isAllowedEmail(email) && selectedRole !== "Utility Staff") {
        Alert.alert(
          "SDCA email required",
          selectedRole === "Student"
            ? "Students must use an SDCA email address for Google Sign-In."
            : "Faculty must use an SDCA email address for Google Sign-In."
        );
        return;
      }

      const status = selectedRole === "Student" ? "approved" : "pending";
      const profile = await getUserProfile(user.uid);
      const [firstName = "", ...rest] = (user.displayName ?? "").split(" ");

      await saveUserProfile(user.uid, {
        firstName: profile?.firstName || firstName,
        lastName: profile?.lastName || rest.join(" "),
        email,
        role: selectedRole,
        status,
      });

      if (selectedRole === "Student") {
        Alert.alert(
          "Account created",
          "Account created! Welcome to iRoomReserve.",
          [{ text: "OK", onPress: () => router.replace("/(main)/campus-select") }]
        );
        return;
      }

      Alert.alert(
        "Registration pending",
        selectedRole === "Faculty"
          ? "Account created as Faculty Professor! Your registration is pending for Admin approval."
          : "Account created as Utility Staff! Your registration is pending for Admin approval.",
        [
          {
            text: "OK",
            onPress: async () => {
              await logout();
              router.replace("/(auth)/login?pending=true");
            },
          },
        ]
      );
    } catch {
      Alert.alert("Unable to continue", "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <SelectionScreenLayout
      title="Select Your Role"
      subtitle="Choose the role that best describes you."
    >
      {ROLE_OPTIONS.map((option) => {
        const isSelected = selectedRole === option.value;

        return (
          <TouchableOpacity
            key={option.value}
            style={[styles.option, isSelected && styles.optionSelected]}
            onPress={() => setSelectedRole(option.value)}
          >
            <Text style={[styles.optionTitle, isSelected && styles.optionTitleSelected]}>
              {option.label}
            </Text>
            <Text
              style={[
                styles.optionDescription,
                isSelected && styles.optionDescriptionSelected,
              ]}
            >
              {option.description}
            </Text>
          </TouchableOpacity>
        );
      })}

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonText}>Confirm Role</Text>
        )}
      </TouchableOpacity>
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  option: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    backgroundColor: colors.subtleBackground,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  optionTitle: {
    fontSize: 16,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 4,
  },
  optionTitleSelected: {
    color: colors.primary,
  },
  optionDescription: {
    fontSize: 13,
    fontFamily: fonts.regular,
    color: colors.secondary,
  },
  optionDescriptionSelected: {
    color: colors.text,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
