import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";

export default function CampusSelectScreen() {
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>Select Campus</Text>

        <TouchableOpacity style={styles.optionButton} onPress={() => router.push("/(main)/buildings")}>
          <Text style={styles.optionLabel}>Main Campus</Text>
        </TouchableOpacity>

        <Text style={styles.orText}>or</Text>

        <TouchableOpacity style={styles.optionButton} onPress={() => router.push("/(main)/floors/digital")}>
          <Text style={styles.optionLabel}>Digital Campus</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.dashboardButton} onPress={() => router.push("/(main)/dashboard")}>
          <Text style={styles.dashboardText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 16, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary, textAlign: "center", marginBottom: 4 },
  title: { fontSize: 16, fontFamily: fonts.regular, color: colors.text, textAlign: "center", marginBottom: 24 },
  optionButton: { borderWidth: 1, borderColor: colors.text, borderRadius: 12, paddingVertical: 20, alignItems: "center", marginBottom: 14, backgroundColor: colors.primary },
  optionLabel: { fontSize: 24, fontFamily: fonts.bold, color: colors.surface },
  orText: { textAlign: "center", color: colors.secondary, fontFamily: fonts.regular, marginBottom: 14 },
  dashboardButton: { marginTop: 12, alignItems: "center" },
  dashboardText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});
