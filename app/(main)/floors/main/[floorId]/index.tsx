import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { useSelectionFilters } from "@/components/SelectionFilterContext";
import { colors, fonts } from "@/constants/theme";
import { getBuildingById } from "@/services/buildings.service";
import {
  buildBuildingFloorOptions,
  getFloorLabelById,
  isRoomOnFloor,
} from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Building, Room } from "@/types/reservation";

export default function MainFloorRoomsScreen() {
  const router = useRouter();
  const { clearFiltersFrom } = useSelectionFilters();
  const { floorId, buildingId } = useLocalSearchParams<{
    floorId: string;
    buildingId?: string;
  }>();
  const resolvedFloorId = String(floorId);
  const resolvedBuildingId = buildingId ? String(buildingId) : "";
  const [building, setBuilding] = useState<Building | null>(null);
  const [floorLabel, setFloorLabel] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(Boolean(resolvedBuildingId));
  const [error, setError] = useState<string | null>(
    resolvedBuildingId ? null : "Missing building."
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
      .then(([buildingResult, buildingRooms]) => {
        if (!active) {
          return;
        }

        if (!buildingResult) {
          throw new Error("Building not found.");
        }

        const floors = buildBuildingFloorOptions(buildingResult, buildingRooms);
        const label = getFloorLabelById(floors, resolvedFloorId);

        if (!label) {
          throw new Error("Floor not found.");
        }

        setBuilding(buildingResult);
        setFloorLabel(label);
        setRooms(buildingRooms.filter((room) => isRoomOnFloor(room, label)));
        setError(null);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load rooms."
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
  }, [resolvedBuildingId, resolvedFloorId]);

  function handleBack() {
    clearFiltersFrom("floor");
    router.back();
  }

  return (
    <SelectionScreenLayout
      title={floorLabel ?? building?.name ?? "Selected Floor"}
      subtitle="Select Room"
      onBackPress={handleBack}
      enableRoomSearch
      roomSearchForceResultsVisible={!loading && !error}
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
      ) : error ? (
        <Text style={styles.statusText}>{error}</Text>
      ) : (
        <Text style={styles.statusText}>Loading matching rooms...</Text>
      )}

    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  statusSpacing: { marginVertical: 24 },
  statusText: {
    width: "100%",
    color: colors.secondary,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 12,
  },
  linkButton: {},
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
