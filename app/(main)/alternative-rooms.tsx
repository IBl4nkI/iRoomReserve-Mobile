import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { colors, fonts } from "@/constants/theme";

export default function AlternativeRoomsScreen() {
  const router = useRouter();
  const { roomName, selection, timeslot } = useLocalSearchParams<{
    roomName?: string;
    selection?: string;
    timeslot?: string;
  }>();

  return (
    <SelectionScreenLayout
      title="Alternative Rooms"
      subtitle="Placeholder Screen"
      onBackPress={() => router.back()}
    >
      <View style={styles.content}>
        <Text style={styles.description}>
          This is a placeholder for the alternative rooms recommendation flow.
        </Text>
        <Text style={styles.detail}>Room: {roomName ?? "Selected Room"}</Text>
        <Text style={styles.detail}>Schedule: {selection ?? "Not provided"}</Text>
        <Text style={styles.detail}>Timeslot: {timeslot ?? "Not provided"}</Text>
      </View>

      <TouchableOpacity
        style={styles.dashboardButton}
        onPress={() => router.push("/(main)/dashboard")}
      >
        <Text style={styles.dashboardButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
  },
  description: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
  detail: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 6,
  },
  dashboardButton: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  dashboardButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
