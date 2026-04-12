import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { colors, fonts } from "@/constants/theme";
import { getBuildingById } from "@/services/buildings.service";
import { buildBuildingFloorOptions } from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Building, FloorOption } from "@/types/reservation";

export default function MainFloorsScreen() {
  const router = useRouter();
  const { buildingId } = useLocalSearchParams<{ buildingId?: string }>();
  const resolvedBuildingId = buildingId ? String(buildingId) : "";
  const [building, setBuilding] = useState<Building | null>(null);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loading, setLoading] = useState(Boolean(resolvedBuildingId));
  const [error, setError] = useState<string | null>(
    resolvedBuildingId ? null : "Select a building first."
  );
  const footer = (
    <TouchableOpacity
      style={styles.linkButton}
      onPress={() => router.push("/(main)/dashboard")}
    >
      <Text style={styles.linkText}>Dashboard</Text>
    </TouchableOpacity>
  );

  useEffect(() => {
    if (!resolvedBuildingId) {
      return;
    }

    let active = true;

    Promise.all([
      getBuildingById(resolvedBuildingId),
      getRoomsByBuilding(resolvedBuildingId),
    ])
      .then(([buildingResult, rooms]) => {
        if (!active) {
          return;
        }

        if (!buildingResult) {
          throw new Error("Building not found.");
        }

        setBuilding(buildingResult);
        setFloors(buildBuildingFloorOptions(buildingResult, rooms));
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
  }, [resolvedBuildingId]);

  return (
    <SelectionScreenLayout
      title={building?.name ?? "Selected Building"}
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
            onPress={() =>
              router.push({
                pathname: "/(main)/floors/main/[floorId]",
                params: { floorId: floor.id, buildingId: resolvedBuildingId },
              })
            }
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
  linkButton: { alignItems: "center", marginTop: 8 },
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
