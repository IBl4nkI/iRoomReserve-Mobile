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
import { buildCampusFloorOptions } from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { FloorOption } from "@/types/reservation";

export default function DigitalFloorsScreen() {
  const router = useRouter();
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const footer = (
    <TouchableOpacity
      style={styles.linkButton}
      onPress={() => router.push("/(main)/dashboard")}
    >
      <Text style={styles.linkText}>Dashboard</Text>
    </TouchableOpacity>
  );

  useEffect(() => {
    let active = true;

    getBuildingsByCampus("digi")
      .then(async (buildings) => {
        const roomGroups = await Promise.all(
          buildings.map((building) => getRoomsByBuilding(building.id))
        );

        if (!active) {
          return;
        }

        setFloors(buildCampusFloorOptions(buildings, roomGroups.flat()));
        setError(null);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load floors."
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
      title="Digital Campus"
      subtitle="Select Floor"
      onBackPress={() => router.back()}
      enableRoomSearch
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
      ) : error ? (
        <Text style={styles.statusText}>{error}</Text>
      ) : (
        floors.map((floor) => (
          <TouchableOpacity
            key={floor.id}
            style={styles.optionButton}
            onPress={() => router.push(`/(main)/floors/digital/${floor.id}`)}
          >
            <Text style={styles.optionLabel}>{floor.label}</Text>
          </TouchableOpacity>
        ))
      )}

    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  statusSpacing: { marginVertical: 24 },
  statusText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 16,
  },
  optionButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginBottom: 12,
  },
  optionLabel: { fontSize: 22, fontFamily: fonts.bold, color: colors.white },
  linkButton: {},
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
