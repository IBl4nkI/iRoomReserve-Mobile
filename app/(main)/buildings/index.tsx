import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { useRouter } from "expo-router";
import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { colors, fonts } from "@/constants/theme";
import { getBuildingsByCampus } from "@/services/buildings.service";
import type { Building } from "@/types/reservation";

export default function BuildingsScreen() {
  const router = useRouter();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const footer = (
    <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/(main)/dashboard")}>
      <Text style={styles.linkText}>Dashboard</Text>
    </TouchableOpacity>
  );

  useEffect(() => {
    let active = true;

    getBuildingsByCampus("main")
      .then((result) => {
        if (active) {
          setBuildings(result);
          setError(null);
        }
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load buildings."
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <SelectionScreenLayout
      title="Main Campus"
      subtitle="Select Building"
      onBackPress={() => router.back()}
      enableRoomSearch
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
      ) : error ? (
        <Text style={styles.statusText}>{error}</Text>
      ) : (
        buildings.map((building) => (
          <TouchableOpacity
            key={building.id}
            style={styles.optionButton}
            onPress={() => router.push(`/(main)/buildings/${building.id}`)}
          >
            <Text style={styles.optionLabel}>{building.name}</Text>
          </TouchableOpacity>
        ))
      )}

    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  statusSpacing: { marginVertical: 24 },
  statusText: { color: colors.secondary, fontFamily: fonts.regular, textAlign: "center", marginBottom: 20 },
  optionButton: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 20, alignItems: "center", marginBottom: 14 },
  optionLabel: { fontSize: 24, fontFamily: fonts.bold, color: colors.white },
  linkButton: { alignItems: "center", marginTop: 8 },
  linkText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});
