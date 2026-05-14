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
import { getBuildingsByCampus } from "@/services/buildings.service";
import {
  buildCampusFloorOptions,
  getFloorLabelById,
  getFloorValueById,
  isRoomOnFloor,
} from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Room } from "@/types/reservation";

export default function DigitalFloorRoomsScreen() {
  const router = useRouter();
  const { clearFiltersFrom, setLevelOptions } = useSelectionFilters();
  const { floorId } = useLocalSearchParams<{ floorId: string }>();
  const resolvedFloorId = String(floorId);
  const [floorLabel, setFloorLabel] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
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
        const allRooms = roomGroups.flat();
        const floorOptions = buildCampusFloorOptions(buildings, allRooms);
        const label = getFloorLabelById(floorOptions, resolvedFloorId);
        const value = getFloorValueById(floorOptions, resolvedFloorId);

        if (!active) {
          return;
        }

        if (!label || !value) {
          throw new Error("Floor not found.");
        }

        setLevelOptions(
          "floor",
          floorOptions.map((floor) => ({
            id: floor.id,
            label: floor.label,
          }))
        );
        setFloorLabel(label);
        setRooms(allRooms.filter((room) => isRoomOnFloor(room, value)));
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
  }, [resolvedFloorId, setLevelOptions]);

  function handleBack() {
    clearFiltersFrom("floor");
    router.back();
  }

  return (
    <SelectionScreenLayout
      title={floorLabel ?? "Selected Floor"}
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
