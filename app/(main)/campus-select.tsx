import React, { useEffect } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { useSelectionFilters } from "@/components/SelectionFilterContext";
import { colors, fonts } from "@/constants/theme";

export default function CampusSelectScreen() {
  const router = useRouter();
  const { clearAll, pushFilter, setLevelOptions } = useSelectionFilters();

  useEffect(() => {
    setLevelOptions("campus", [
      { id: "main", label: "Main Campus" },
      { id: "digi", label: "Digital Campus" },
    ]);
  }, [setLevelOptions]);
  const footer = (
    <TouchableOpacity style={styles.dashboardButton} onPress={() => router.push("/(main)/dashboard")}>
      <Text style={styles.dashboardText}>Dashboard</Text>
    </TouchableOpacity>
  );

  function handleSelectCampus(campusId: string, campusLabel: string, route: string) {
    clearAll();
    pushFilter({ level: "campus", id: campusId, label: campusLabel });
    router.push(route as any);
  }

  return (
    <SelectionScreenLayout title="Select Campus" enableRoomSearch footer={footer}>
      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => handleSelectCampus("main", "Main Campus", "/(main)/buildings")}
      >
        <Text style={styles.optionLabel}>Main Campus</Text>
      </TouchableOpacity>

      <Text style={styles.orText}>or</Text>

      <TouchableOpacity
        style={styles.optionButton}
        onPress={() => handleSelectCampus("digi", "Digital Campus", "/(main)/floors/digital")}
      >
        <Text style={styles.optionLabel}>Digital Campus</Text>
      </TouchableOpacity>
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  optionButton: { borderWidth: 1, borderColor: colors.text, borderRadius: 12, paddingVertical: 20, alignItems: "center", marginBottom: 14, backgroundColor: colors.primary },
  optionLabel: { fontSize: 24, fontFamily: fonts.bold, color: colors.surface },
  orText: { textAlign: "center", color: colors.secondary, fontFamily: fonts.regular, marginBottom: 14 },
  dashboardButton: {},
  dashboardText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});
