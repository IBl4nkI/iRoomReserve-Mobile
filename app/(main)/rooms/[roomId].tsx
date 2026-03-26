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
import {
  DAY_NAMES,
  formatTime12h,
  getSchedulesByRoomId,
} from "@/services/schedules.service";
import { getRoomById } from "@/services/rooms.service";
import type { Room, Schedule } from "@/types/reservation";

export default function RoomDetailsScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const resolvedRoomId = String(roomId);
  const [room, setRoom] = useState<Room | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    Promise.all([getRoomById(resolvedRoomId), getSchedulesByRoomId(resolvedRoomId)])
      .then(([roomResult, scheduleResults]) => {
        if (!active) {
          return;
        }

        if (!roomResult) {
          throw new Error("Room not found.");
        }

        setRoom(roomResult);
        setSchedules(scheduleResults);
        setError(null);
      })
      .catch((caughtError) => {
        if (active) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load room details."
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
  }, [resolvedRoomId]);

  if (!loading && (!room || error)) {
    return (
      <View style={styles.fallbackContainer}>
        <Text style={styles.fallbackText}>{error ?? "Room not found."}</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
          <Text style={styles.linkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <TouchableOpacity style={styles.backIconButton} onPress={() => router.back()}>
        <Text style={styles.backIconText}>{"<"}</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.appName}>iRoomReserve</Text>
        <Text style={styles.title}>Room Information</Text>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
        ) : (
          <>
            <Text style={styles.subtitle}>({room?.name})</Text>

            <View style={styles.infoBlock}>
              <Text style={styles.infoText}>Building: {room?.buildingName}</Text>
              <Text style={styles.infoText}>Floor: {room?.floor}</Text>
              <Text style={styles.infoText}>Type: {room?.roomType}</Text>
              <Text style={styles.infoText}>Status: {room?.status}</Text>
              <Text style={styles.infoText}>Air-Conditioner: {room?.acStatus}</Text>
              <Text style={styles.infoText}>TV/Projector: {room?.tvProjectorStatus}</Text>
              <Text style={styles.infoText}>Capacity: {room?.capacity}</Text>
            </View>

            <View style={styles.scheduleCard}>
              <Text style={styles.scheduleTitle}>Schedule</Text>
              {schedules.length === 0 ? (
                <Text style={styles.emptyScheduleText}>
                  No recurring classes scheduled.
                </Text>
              ) : (
                schedules.map((schedule) => (
                  <View key={schedule.id} style={styles.scheduleRow}>
                    <Text style={styles.scheduleText}>
                      {DAY_NAMES[schedule.dayOfWeek]} • {formatTime12h(schedule.startTime)} -{" "}
                      {formatTime12h(schedule.endTime)}
                    </Text>
                    <Text style={styles.scheduleMeta}>
                      {schedule.subjectName} • {schedule.instructorName}
                    </Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.reserveButton}>
          <Text style={styles.reserveText}>Select Time to Reserve Room</Text>
        </TouchableOpacity>
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
  fallbackContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: 16,
  },
  fallbackText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
    marginBottom: 16,
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
  statusSpacing: { marginVertical: 24 },
  infoBlock: { marginBottom: 12 },
  infoText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    marginBottom: 4,
  },
  scheduleCard: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scheduleTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 10,
  },
  emptyScheduleText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  scheduleRow: {
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  scheduleText: { color: colors.text, fontFamily: fonts.bold, fontSize: 12 },
  scheduleMeta: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  reserveButton: {
    marginTop: 18,
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  reserveText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },
  linkButton: { alignItems: "center", marginTop: 12 },
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
