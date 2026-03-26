import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";

export default function DashboardScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>Dashboard</Text>
        <Text style={styles.subtitle}>Quick access hub for reservations and navigation.</Text>

        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push("/(main)/campus-select")}>
          <Text style={styles.primaryText}>Start Room Reservation</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 16, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary, textAlign: "center", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, fontFamily: fonts.regular, color: colors.secondary, textAlign: "center", marginBottom: 24 },
  primaryButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  primaryText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },
});
