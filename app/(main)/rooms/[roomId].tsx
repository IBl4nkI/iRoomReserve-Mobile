import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import WeeklyScheduleGrid from "@/components/WeeklyScheduleGrid";
import { applySelectedTimeslotPress } from "@/components/selection-room-search/helpers";
import { colors, fonts } from "@/constants/theme";
import { formatFullDate, getRoomCampus } from "@/lib/reservation-search";
import {
  DAY_NAMES,
  formatTime12h,
  getSchedulesByRoomId,
} from "@/services/schedules.service";
import { getRoomById } from "@/services/rooms.service";
import type { Room, Schedule } from "@/types/reservation";

interface SelectedTimeslot {
  dateKey: string;
  description: string;
  endTime: string;
  startTime: string;
  state: "available" | "pending";
}

function getTimeslotKey(slot: Pick<SelectedTimeslot, "dateKey" | "startTime" | "endTime">) {
  return `${slot.dateKey}-${slot.startTime}-${slot.endTime}`;
}

function buildSelectionLabel(selectedSlots: SelectedTimeslot[]) {
  const uniqueDateKeys = [...new Set(selectedSlots.map((slot) => slot.dateKey))];
  return uniqueDateKeys
    .map((dateKey) => formatFullDate(new Date(`${dateKey}T00:00:00`)))
    .join(", ");
}

function collapseSelectedTimeslots(selectedSlots: SelectedTimeslot[]) {
  const groupedSlots = selectedSlots.reduce<Record<string, SelectedTimeslot[]>>(
    (result, slot) => {
      if (!result[slot.dateKey]) {
        result[slot.dateKey] = [];
      }

      result[slot.dateKey].push(slot);
      return result;
    },
    {}
  );

  return Object.entries(groupedSlots)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, slots]) => {
      const orderedSlots = [...slots].sort((left, right) =>
        left.startTime.localeCompare(right.startTime)
      );
      const firstSlot = orderedSlots[0];
      const lastSlot = orderedSlots[orderedSlots.length - 1];

      return {
        ...firstSlot,
        endTime: lastSlot.endTime,
        state: orderedSlots.some((slot) => slot.state === "pending")
          ? "pending"
          : firstSlot.state,
      };
    });
}

function buildTimeslotLabel(selectedSlots: SelectedTimeslot[]) {
  return collapseSelectedTimeslots(selectedSlots)
    .map((slot) => {
      return `${formatFullDate(new Date(`${slot.dateKey}T00:00:00`))}: ${formatTime12h(
        slot.startTime
      )} - ${formatTime12h(slot.endTime)}`;
    })
    .join(" | ");
}

export default function RoomDetailsScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const resolvedRoomId = String(roomId);
  const [room, setRoom] = useState<Room | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedSlots, setSelectedSlots] = useState<SelectedTimeslot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedSlotKeys = useMemo(
    () => selectedSlots.map((slot) => getTimeslotKey(slot)),
    [selectedSlots]
  );
  const hasSelection = selectedSlots.length > 0;
  const hasPendingSelection = selectedSlots.some((slot) => slot.state === "pending");
  const reserveButtonLabel = !hasSelection
    ? "Select timeslots to reserve"
    : "Reserve Selected Timeslots";

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

  function openAlternativeRooms(selectionLabel: string, timeslot: string) {
    router.push({
      pathname: "/(main)/alternative-rooms",
      params: {
        roomId: resolvedRoomId,
        roomName: room?.name ?? "Selected Room",
        selection: selectionLabel,
        timeslot,
      },
    });
  }

  function openReservationForm(
    selectionLabel: string,
    timeslot: string,
    selectionPayload?: string
  ) {
    const roomCampus = room ? getRoomCampus(room) : null;

    router.push({
      pathname: "/(main)/reservation-form",
      params: {
        roomId: resolvedRoomId,
        roomName: room?.name ?? "Selected Room",
        campus: roomCampus ?? undefined,
        floor: room?.floor ?? undefined,
        roomType: room?.roomType ?? undefined,
        selection: selectionLabel,
        selectedTimeslots: selectionPayload,
        timeslot,
      },
    });
  }

  function handleSlotPress(
    dateKey: string,
    slot: {
      description: string;
      endTime: string;
      startTime: string;
      state: "available" | "pending" | "unavailable";
    }
  ) {
    const selectionLabel = formatFullDate(new Date(`${dateKey}T00:00:00`));
    const timeslot = `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`;

    if (slot.state === "unavailable") {
      Alert.alert(
        "Timeslot Unavailable",
        "This timeslot is currently unavailable. Would you like to see other rooms that are similar to your selected preferences?",
        [
          { style: "cancel", text: "No, stay here" },
          {
            text: "Yes, take me there",
            onPress: () => openAlternativeRooms(selectionLabel, timeslot),
          },
        ]
      );

      return;
    }

    const selectedSlot: SelectedTimeslot = {
      dateKey,
      description: slot.description,
      endTime: slot.endTime,
      startTime: slot.startTime,
      state: slot.state,
    };
    setSelectedSlots((currentValue) => {
      return applySelectedTimeslotPress(currentValue, selectedSlot);
    });
  }

  function handleReserveSelectedSlots() {
    if (!hasSelection) {
      return;
    }

    const orderedSlots = [...selectedSlots].sort((left, right) => {
      const dateComparison = left.dateKey.localeCompare(right.dateKey);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return left.startTime.localeCompare(right.startTime);
    });
    const selectionLabel = buildSelectionLabel(orderedSlots);
    const timeslot = buildTimeslotLabel(orderedSlots);
    const selectedTimeslots = JSON.stringify(collapseSelectedTimeslots(orderedSlots));

    if (hasPendingSelection) {
      Alert.alert(
        "Pending Reservation Request",
        "One or more selected timeslots already have an ongoing reservation request. You can still continue, but the reservation may be rejected if another request is approved first.",
        [
          { style: "cancel", text: "Not now" },
          {
            text: "Proceed",
            onPress: () =>
              openReservationForm(selectionLabel, timeslot, selectedTimeslots),
          },
        ]
      );

      return;
    }

    openReservationForm(selectionLabel, timeslot, selectedTimeslots);
  }

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

            <View style={styles.selectorCard}>
              <Text style={styles.selectorHeading}>View Schedules</Text>
              <Text style={styles.selectionHint}>
                <Text style={styles.selectionHintGreen}>Green</Text>
                {" means available, "}
                <Text style={styles.selectionHintYellow}>yellow</Text>
                {" means there is an ongoing reservation request, and "}
                <Text style={styles.selectionHintRed}>red</Text>
                {" means unavailable."}
              </Text>
              <WeeklyScheduleGrid
                campus={room ? getRoomCampus(room) : null}
                roomId={resolvedRoomId}
                schedules={schedules}
                weekOffset={weekOffset}
                onWeekChange={setWeekOffset}
                onSlotPress={handleSlotPress}
                selectedSlotKeys={selectedSlotKeys}
              />
              <Text style={styles.selectionHelperText}>
                Tap green or yellow timeslots to build a reservation. Picking a later
                timeslot on the same day automatically selects the full range in between.
              </Text>
              <TouchableOpacity
                disabled={!hasSelection}
                onPress={handleReserveSelectedSlots}
                style={[
                  styles.reserveButton,
                  !hasSelection && styles.reserveButtonDisabled,
                ]}
              >
                <Text
                  style={[
                    styles.reserveButtonText,
                    !hasSelection && styles.reserveButtonTextDisabled,
                  ]}
                >
                  {reserveButtonLabel}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

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
  selectorCard: {
    marginTop: 18,
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectorHeading: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 18,
    marginBottom: 12,
  },
  selectorSubheading: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 10,
  },
  weekNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  weekNavButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  weekNavText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  weekNavTextDisabled: {
    color: colors.mutedText,
  },
  weekLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  dateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 16,
  },
  dateChip: {
    width: "31%",
    minHeight: 74,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  dateChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateChipDisabled: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    opacity: 0.55,
  },
  dateChipDay: {
    color: colors.secondary,
    fontFamily: fonts.bold,
    fontSize: 12,
    marginBottom: 4,
  },
  dateChipDate: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  dateChipTextSelected: {
    color: colors.white,
  },
  dateChipTextDisabled: {
    color: colors.mutedText,
  },
  weekdayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: 10,
    columnGap: 8,
  },
  weekdayChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  weekdayChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  weekdayChipText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  weekdayChipTextSelected: {
    color: colors.white,
  },
  selectionHint: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 14,
  },
  selectionHintGreen: { color: colors.successText, fontFamily: fonts.bold },
  selectionHintYellow: { color: "#fdba74", fontFamily: fonts.bold },
  selectionHintRed: { color: colors.dangerText, fontFamily: fonts.bold },
  selectionHelperText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 12,
  },
  reserveButton: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  reserveButtonDisabled: {
    backgroundColor: colors.border,
  },
  reserveButtonError: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
  },
  reserveButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  reserveButtonTextError: {
    color: colors.mutedText,
  },
  reserveButtonTextDisabled: {
    color: colors.mutedText,
  },
  emptySelectionCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptySelectionText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
  },
  resultsContainer: {
    marginTop: 18,
  },
  selectionResultCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 14,
  },
  selectionResultTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginBottom: 4,
  },
  selectionResultMeta: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginBottom: 12,
  },
  timeSlotButton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 10,
  },
  timeSlotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  timeSlotTime: {
    fontFamily: fonts.bold,
    fontSize: 13,
    flex: 1,
    paddingRight: 8,
  },
  timeSlotBadge: {
    fontFamily: fonts.bold,
    fontSize: 11,
    textTransform: "uppercase",
  },
  timeSlotDescription: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  linkButton: { alignItems: "center", marginTop: 12 },
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
