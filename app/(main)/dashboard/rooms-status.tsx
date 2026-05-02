import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import { dashboardStyles as styles } from "@/components/dashboard/styles";
import { colors } from "@/constants/theme";
import { getUserProfile } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { toSearchRoom, type SearchRoom } from "@/lib/reservation-search";
import { getBuildingsByCampus } from "@/services/buildings.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { ReservationCampus } from "@/types/reservation";

function StatusChip({
  status,
}: {
  status: "Available" | "Reserved" | "Occupied" | "Unavailable";
}) {
  if (status === "Available") {
    return (
      <View style={[styles.chip, styles.chipApproved]}>
        <Text style={[styles.chipText, styles.chipTextApproved]}>Available</Text>
      </View>
    );
  }

  if (status === "Occupied") {
    return (
      <View style={[styles.chip, styles.chipOccupied]}>
        <Text style={[styles.chipText, styles.chipTextOccupied]}>Occupied</Text>
      </View>
    );
  }

  if (status === "Reserved") {
    return (
      <View style={[styles.chip, styles.chipPending]}>
        <Text style={[styles.chipText, styles.chipTextPending]}>Reserved</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipRejected]}>
      <Text style={[styles.chipText, styles.chipTextRejected]}>Unavailable</Text>
    </View>
  );
}

export default function RoomsStatusScreen() {
  const insets = useSafeAreaInsets();
  const [assignedCampus, setAssignedCampus] = React.useState<ReservationCampus | null>(null);
  const [rooms, setRooms] = React.useState<SearchRoom[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadRooms = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const profile = await getUserProfile(currentUser.uid);
        const campus =
          profile?.campus === "main" || profile?.campus === "digi"
            ? profile.campus
            : null;

        if (!active) {
          return;
        }

        setAssignedCampus(campus);

        if (!campus) {
          setRooms([]);
          setError("No campus is assigned to this account.");
          return;
        }

        const buildings = await getBuildingsByCampus(campus);
        const roomGroups = await Promise.all(
          buildings.map((building) => getRoomsByBuilding(building.id))
        );

        if (!active) {
          return;
        }

        setRooms(
          roomGroups
            .flat()
            .map(toSearchRoom)
            .sort(
              (left, right) =>
                left.buildingName.localeCompare(right.buildingName) ||
                left.floor.localeCompare(right.floor) ||
                left.name.localeCompare(right.name)
            )
        );
        setError(null);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load room statuses."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRooms();

    return () => {
      active = false;
    };
  }, []);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <Text style={styles.screenTitle}>Rooms Status</Text>
        <Text style={styles.screenSubtitle}>
          {assignedCampus === "digi"
            ? "Showing all rooms assigned to the Digital Campus."
            : assignedCampus === "main"
              ? "Showing all rooms assigned to the Main Campus."
              : "Showing all rooms assigned to your campus."}
        </Text>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>There are no rooms available for this campus.</Text>
          </View>
        ) : (
          rooms.map((room) => (
            <View key={room.id} style={styles.listItem}>
              <View style={styles.row}>
                <Text style={[styles.reservationTitle, { marginTop: 0 }]}>{room.name}</Text>
                <StatusChip status={room.status} />
              </View>
              <Text style={styles.reservationMeta}>{room.buildingName}</Text>
              <Text style={styles.reservationMeta}>Floor: {room.floor}</Text>
              <Text style={styles.reservationMeta}>Type: {room.roomType}</Text>
              <Text style={styles.reservationMeta}>Capacity: Approx. {room.capacity} People</Text>
              <Text style={styles.reservationMeta}>Air-Conditioner: {room.acStatus}</Text>
              <Text style={styles.reservationMeta}>TV/Projector: {room.tvProjectorStatus}</Text>
            </View>
          ))
        )}

        <Pressable style={styles.actionButton} onPress={() => router.push("/(main)/dashboard")}>
          <Text style={styles.actionButtonText}>Back to Dashboard</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
