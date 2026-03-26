import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { colors, fonts } from "@/constants/theme";
import { getBuildingById } from "@/services/buildings.service";
import { buildBuildingFloorOptions } from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Building, FloorOption } from "@/types/reservation";

export default function BuildingDetailsScreen() {
  const router = useRouter();
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();
  const resolvedBuildingId = String(buildingId);
  const [building, setBuilding] = useState<Building | null>(null);
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
        <Text style={styles.backIconText}>{"<"}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>{building?.name ?? "Select Building"}</Text>
        <Text style={styles.subtitle}>Select Floor</Text>

        <View style={styles.optionGrid}>
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
        </View>

        <TouchableOpacity style={styles.linkButton} onPress={() => router.push("/(main)/dashboard")}>
          <Text style={styles.linkText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: "center", padding: 16, backgroundColor: colors.background },
  backIconButton: { alignSelf: "flex-start", width: 42, height: 42, borderRadius: 21, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  backIconText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 20, lineHeight: 20 },
  card: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  appName: { fontSize: 20, fontFamily: fonts.bold, color: colors.primary, textAlign: "center", marginBottom: 4 },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, textAlign: "center", marginBottom: 2 },
  subtitle: { fontSize: 16, fontFamily: fonts.regular, color: colors.text, textAlign: "center", marginBottom: 24 },
  optionGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 12 },
  statusSpacing: { marginVertical: 24 },
  statusText: { width: "100%", color: colors.secondary, fontFamily: fonts.regular, textAlign: "center", marginBottom: 12 },
  optionButton: { width: "47%", backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  optionLabel: { fontSize: 20, fontFamily: fonts.bold, color: colors.white, textAlign: "center" },
  linkButton: { alignItems: "center", marginTop: 8 },
  linkText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 13, textDecorationLine: "underline" },
});
