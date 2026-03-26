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
import { getBuildingsByCampus } from "@/services/buildings.service";
import {
  buildCampusFloorOptions,
  getFloorLabelById,
} from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { Room } from "@/types/reservation";

export default function DigitalFloorRoomsScreen() {
  const router = useRouter();
  const { floorId } = useLocalSearchParams<{ floorId: string }>();
  const resolvedFloorId = String(floorId);
  const [floorLabel, setFloorLabel] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

        if (!active) {
          return;
        }

        if (!label) {
          throw new Error("Floor not found.");
        }

        setFloorLabel(label);
        setRooms(allRooms.filter((room) => room.floor === label));
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
  }, [resolvedFloorId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
        <Text style={styles.backIconText}>{"<"}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>Select Room</Text>
        <Text style={styles.subtitle}>{floorLabel ?? "Selected Floor"}</Text>

        <View style={styles.roomGrid}>
          {loading ? (
            <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
          ) : error ? (
            <Text style={styles.statusText}>{error}</Text>
          ) : (
            rooms.map((room) => (
              <TouchableOpacity
                key={room.id}
                style={styles.roomButton}
                onPress={() =>
                  router.push({
                    pathname: "/(main)/rooms/[roomId]",
                    params: {
                      roomId: room.id,
                      buildingId: room.buildingId,
                      floorId: resolvedFloorId,
                    },
                  })
                }
              >
                <Text style={styles.roomLabel}>{room.name}</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        <TouchableOpacity
          style={styles.linkButton}
          onPress={() => router.push("/(main)/dashboard")}
        >
          <Text style={styles.linkText}>Dashboard</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
    backgroundColor: colors.background,
  },
  backIconButton: {
    alignSelf: "flex-start",
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  backIconText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 20,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  appName: {
    fontSize: 20,
    fontFamily: fonts.bold,
    color: colors.primary,
    textAlign: "center",
    marginBottom: 4,
  },
  title: { fontSize: 24, fontFamily: fonts.bold, color: colors.text, textAlign: "center" },
  subtitle: {
    fontSize: 16,
    fontFamily: fonts.regular,
    color: colors.secondary,
    textAlign: "center",
    marginBottom: 20,
  },
  roomGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
  },
  statusSpacing: { marginVertical: 24 },
  statusText: {
    width: "100%",
    color: colors.secondary,
    fontFamily: fonts.regular,
    textAlign: "center",
    marginBottom: 12,
  },
  roomButton: {
    width: "47%",
    minHeight: 72,
    backgroundColor: colors.primary,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  roomLabel: {
    fontSize: 18,
    fontFamily: fonts.bold,
    color: colors.white,
    textAlign: "center",
  },
  linkButton: { alignItems: "center", marginTop: 12 },
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
