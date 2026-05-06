import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { useSelectionFilters } from "@/components/SelectionFilterContext";
import { colors, fonts } from "@/constants/theme";
import { getBuildingById } from "@/services/buildings.service";
import {
  buildBuildingFloorOptions,
  formatCompactFloorLabel,
} from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Building, FloorOption } from "@/types/reservation";

export default function BuildingDetailsScreen() {
  const router = useRouter();
  const { clearFiltersFrom, pushFilter, setLevelOptions } = useSelectionFilters();
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const resolvedBuildingId = String(buildingId);
  const [building, setBuilding] = useState<Building | null>(null);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const footer = (
    <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/(main)/dashboard")}>
      <Text style={styles.linkText}>Dashboard</Text>
    </TouchableOpacity>
  );

  useEffect(() => {
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

        const floorOptions = buildBuildingFloorOptions(buildingResult, rooms);
        setBuilding(buildingResult);
        setFloors(floorOptions);
        setLevelOptions(
          "floor",
          floorOptions.map((floor) => ({
            id: floor.id,
            label: formatCompactFloorLabel(floor.label),
          }))
        );
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

  function handleBack() {
    clearFiltersFrom("building");
    router.back();
  }

  function handleSelectFloor(floor: FloorOption) {
    pushFilter({
      level: "floor",
      id: floor.id,
      label: formatCompactFloorLabel(floor.label),
    });
    router.push({
      pathname: "/(main)/floors/main/[floorId]",
      params: { floorId: floor.id, buildingId: resolvedBuildingId },
    });
  }

  return (
    <SelectionScreenLayout
      title={building?.name ?? "Selected Building"}
      subtitle="Select Floor"
      onBackPress={handleBack}
      enableRoomSearch
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
      ) : error ? (
        <Text style={styles.statusText}>{error}</Text>
      ) : (
        <View style={styles.optionGrid}>
          {floors.map((floor) => (
            <TouchableOpacity
              key={floor.id}
              style={styles.optionButton}
              onPress={() => handleSelectFloor(floor)}
            >
              <Text style={styles.optionLabel}>{floor.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  optionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  statusSpacing: { marginVertical: 24 },
  statusText: { width: "100%", color: colors.secondary, fontFamily: fonts.regular, textAlign: "center", marginBottom: 12 },
  optionButton: { width: "47%", backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  optionLabel: { fontSize: 20, fontFamily: fonts.bold, color: colors.white, textAlign: "center" },
  linkButton: {},
  linkText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});
