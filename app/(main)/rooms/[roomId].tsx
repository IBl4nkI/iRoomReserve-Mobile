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

import { colors, fonts } from "@/constants/theme";
import {
  DAY_NAMES,
  formatTime12h,
  getSchedulesByRoomId,
} from "@/services/schedules.service";
import { getRoomById } from "@/services/rooms.service";
import type { Room, Schedule } from "@/types/reservation";

type ScheduleSelection =
  | {
      id: string;
      type: "date";
      dayOfWeek: number;
      label: string;
      key: string;
    }
  | {
      id: string;
      type: "weekday";
      dayOfWeek: number;
      label: string;
      key: string;
    };

type SlotState = "available" | "unavailable" | "pending";

interface TimeSlotDefinition {
  endTime: string;
  startTime: string;
}

interface TimeSlotViewModel extends TimeSlotDefinition {
  description: string;
  state: SlotState;
}

const SELECTABLE_DAY_INDICES = [1, 2, 3, 4, 5, 6] as const;
const SLOT_DEFINITIONS: TimeSlotDefinition[] = [
  { startTime: "07:00", endTime: "08:00" },
  { startTime: "08:00", endTime: "09:00" },
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "12:00", endTime: "13:00" },
  { startTime: "13:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "15:00" },
  { startTime: "15:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "17:00" },
  { startTime: "17:00", endTime: "18:00" },
  { startTime: "18:00", endTime: "19:00" },
];

function getMondayOfWeek(date: Date) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);

  const day = localDate.getDay();
  const difference = day === 0 ? -6 : 1 - day;

  localDate.setDate(localDate.getDate() + difference);

  return localDate;
}

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function padTwoDigits(value: number) {
  return String(value).padStart(2, "0");
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${padTwoDigits(date.getMonth() + 1)}-${padTwoDigits(
    date.getDate()
  )}`;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

function formatWeekLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function isPastDate(date: Date) {
  return date.getTime() < startOfToday().getTime();
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((piece) => parseInt(piece, 10));
  return hours * 60 + minutes;
}

function slotsOverlap(left: TimeSlotDefinition, right: TimeSlotDefinition) {
  return (
    timeToMinutes(left.startTime) < timeToMinutes(right.endTime) &&
    timeToMinutes(left.endTime) > timeToMinutes(right.startTime)
  );
}

function getDeterministicHash(value: string) {
  return value.split("").reduce((sum, character, index) => {
    return sum + character.charCodeAt(0) * (index + 1);
  }, 0);
}

function getPendingState(roomId: string, selectionKey: string, slot: TimeSlotDefinition) {
  const hash = getDeterministicHash(`${roomId}-${selectionKey}-${slot.startTime}`);
  return hash % 7 === 0;
}

function buildSelectionSummary(selection: ScheduleSelection) {
  return selection.type === "date"
    ? selection.label
    : `${selection.label} recurring schedule`;
}

function buildTimeSlots(
  roomId: string,
  selection: ScheduleSelection,
  schedules: Schedule[]
): TimeSlotViewModel[] {
  const matchingSchedules = schedules.filter(
    (schedule) => schedule.dayOfWeek === selection.dayOfWeek
  );

  return SLOT_DEFINITIONS.map((slot) => {
    const blockedSchedule = matchingSchedules.find((schedule) =>
      slotsOverlap(slot, {
        endTime: schedule.endTime,
        startTime: schedule.startTime,
      })
    );

    if (blockedSchedule) {
      return {
        ...slot,
        description: `${blockedSchedule.subjectName} with ${blockedSchedule.instructorName}`,
        state: "unavailable",
      };
    }

    if (getPendingState(roomId, selection.key, slot)) {
      return {
        ...slot,
        description: "There is an ongoing reservation request for this timeslot.",
        state: "pending",
      };
    }

    return {
      ...slot,
      description: "This timeslot is available for reservation.",
      state: "available",
    };
  });
}

function getStatusStyles(state: SlotState) {
  if (state === "available") {
    return {
      backgroundColor: colors.successBackground,
      borderColor: colors.successBorder,
      textColor: colors.successText,
    };
  }

  if (state === "pending") {
    return {
      backgroundColor: "#fff7ed",
      borderColor: "#fdba74",
      textColor: "#c2410c",
    };
  }

  return {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
    textColor: colors.dangerText,
  };
}

export default function RoomDetailsScreen() {
  const router = useRouter();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const resolvedRoomId = String(roomId);
  const [room, setRoom] = useState<Room | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([]);
  const [selectedDateKeys, setSelectedDateKeys] = useState<string[]>([]);
  const [weekOffset, setWeekOffset] = useState(0);
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

  const currentWeekDates = useMemo(() => {
    const monday = addDays(getMondayOfWeek(new Date()), weekOffset * 7);

    return SELECTABLE_DAY_INDICES.map((dayOffset) => addDays(monday, dayOffset - 1));
  }, [weekOffset]);

  const scheduleSelections = useMemo<ScheduleSelection[]>(() => {
    const dateSelections = selectedDateKeys
      .map((dateKey) => {
        const date = new Date(`${dateKey}T00:00:00`);
        const dayOfWeek = date.getDay();

        if (!SELECTABLE_DAY_INDICES.includes(dayOfWeek as (typeof SELECTABLE_DAY_INDICES)[number])) {
          return null;
        }

        return {
          dayOfWeek,
          id: `date-${dateKey}`,
          key: dateKey,
          label: formatFullDate(date),
          type: "date" as const,
        };
      })
      .filter((value): value is Extract<ScheduleSelection, { type: "date" }> => Boolean(value))
      .sort((left, right) => left.key.localeCompare(right.key));

    const weekdaySelections = selectedWeekdays
      .slice()
      .sort((left, right) => left - right)
      .map((dayOfWeek) => ({
        dayOfWeek,
        id: `weekday-${dayOfWeek}`,
        key: `weekday-${dayOfWeek}`,
        label: `Every ${DAY_NAMES[dayOfWeek]}`,
        type: "weekday" as const,
      }));

    return [...dateSelections, ...weekdaySelections];
  }, [selectedDateKeys, selectedWeekdays]);

  function toggleWeekday(dayOfWeek: number) {
    setSelectedWeekdays((currentSelection) =>
      currentSelection.includes(dayOfWeek)
        ? currentSelection.filter((value) => value !== dayOfWeek)
        : [...currentSelection, dayOfWeek]
    );
  }

  function toggleDate(dateKey: string) {
    const selectedDate = new Date(`${dateKey}T00:00:00`);

    if (isPastDate(selectedDate)) {
      Alert.alert(
        "Past Dates Unavailable",
        "You can only reserve timeslots for today or a future date."
      );
      return;
    }

    setSelectedDateKeys((currentSelection) =>
      currentSelection.includes(dateKey)
        ? currentSelection.filter((value) => value !== dateKey)
        : [...currentSelection, dateKey]
    );
  }

  function openAlternativeRooms(selection: ScheduleSelection, slot: TimeSlotViewModel) {
    router.push({
      pathname: "/(main)/alternative-rooms",
      params: {
        roomId: resolvedRoomId,
        roomName: room?.name ?? "Selected Room",
        selection: buildSelectionSummary(selection),
        timeslot: `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`,
      },
    });
  }

  function openReservationForm(selection: ScheduleSelection, slot: TimeSlotViewModel) {
    router.push({
      pathname: "/(main)/reservation-form",
      params: {
        roomId: resolvedRoomId,
        roomName: room?.name ?? "Selected Room",
        selection: buildSelectionSummary(selection),
        timeslot: `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`,
      },
    });
  }

  function handleSlotPress(selection: ScheduleSelection, slot: TimeSlotViewModel) {
    if (slot.state === "unavailable") {
      Alert.alert(
        "Timeslot Unavailable",
        "This timeslot is currently unavailable. Would you like to see other rooms that are similar to your selected preferences?",
        [
          { style: "cancel", text: "No, stay here" },
          {
            text: "Yes, take me there",
            onPress: () => openAlternativeRooms(selection, slot),
          },
        ]
      );

      return;
    }

    if (slot.state === "pending") {
      Alert.alert(
        "Pending Reservation Request",
        "There is an ongoing reservation request for this timeslot. You can still try to reserve this room, but it may be rejected by the admin if the ongoing request gets approved. Would you like to proceed?",
        [
          { style: "cancel", text: "Not now" },
          {
            text: "Proceed",
            onPress: () => openReservationForm(selection, slot),
          },
        ]
      );

      return;
    }

    openReservationForm(selection, slot);
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
              <Text style={styles.selectorSubheading}>Select Date</Text>

              <View style={styles.weekNavRow}>
                <TouchableOpacity
                  style={styles.weekNavButton}
                  disabled={weekOffset === 0}
                  onPress={() =>
                    setWeekOffset((currentValue) => Math.max(0, currentValue - 1))
                  }
                >
                  <Text
                    style={[
                      styles.weekNavText,
                      weekOffset === 0 && styles.weekNavTextDisabled,
                    ]}
                  >
                    {"<"}
                  </Text>
                </TouchableOpacity>
                <Text style={styles.weekLabel}>{formatWeekLabel(currentWeekDates[0])}</Text>
                <TouchableOpacity
                  style={styles.weekNavButton}
                  onPress={() => setWeekOffset((currentValue) => currentValue + 1)}
                >
                  <Text style={styles.weekNavText}>{">"}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.dateGrid}>
                {currentWeekDates.map((date) => {
                  const dateKey = toDateKey(date);
                  const selected = selectedDateKeys.includes(dateKey);
                  const disabled = isPastDate(date);

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      disabled={disabled}
                      style={[
                        styles.dateChip,
                        selected && styles.dateChipSelected,
                        disabled && styles.dateChipDisabled,
                      ]}
                      onPress={() => toggleDate(dateKey)}
                    >
                      <Text
                        style={[
                          styles.dateChipDay,
                          selected && styles.dateChipTextSelected,
                          disabled && styles.dateChipTextDisabled,
                        ]}
                      >
                        {DAY_NAMES[date.getDay()].slice(0, 3)}
                      </Text>
                      <Text
                        style={[
                          styles.dateChipDate,
                          selected && styles.dateChipTextSelected,
                          disabled && styles.dateChipTextDisabled,
                        ]}
                      >
                        {formatShortDate(date)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.selectorSubheading}>Repeat Weekly</Text>
              <View style={styles.weekdayGrid}>
                {SELECTABLE_DAY_INDICES.map((dayOfWeek) => {
                  const selected = selectedWeekdays.includes(dayOfWeek);

                  return (
                    <TouchableOpacity
                      key={dayOfWeek}
                      style={[styles.weekdayChip, selected && styles.weekdayChipSelected]}
                      onPress={() => toggleWeekday(dayOfWeek)}
                    >
                      <Text
                        style={[
                          styles.weekdayChipText,
                          selected && styles.weekdayChipTextSelected,
                        ]}
                      >
                        {DAY_NAMES[dayOfWeek]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.selectionHint}>
                Schedules are available from Monday to Saturday. Exact date reservations can
                only be made for today or future dates.
              </Text>
            </View>

            {scheduleSelections.length === 0 ? (
              <View style={styles.emptySelectionCard}>
                <Text style={styles.emptySelectionText}>
                  Choose one or more dates above to view available timeslots.
                </Text>
              </View>
            ) : (
              <View style={styles.resultsContainer}>
                {scheduleSelections.map((selection) => (
                  <View key={selection.id} style={styles.selectionResultCard}>
                    <Text style={styles.selectionResultTitle}>{selection.label}</Text>
                    <Text style={styles.selectionResultMeta}>
                      Green means available, red means unavailable, orange means pending.
                    </Text>

                    {buildTimeSlots(resolvedRoomId, selection, schedules).map((slot) => {
                      const statusStyles = getStatusStyles(slot.state);

                      return (
                        <TouchableOpacity
                          key={`${selection.id}-${slot.startTime}`}
                          style={[
                            styles.timeSlotButton,
                            {
                              backgroundColor: statusStyles.backgroundColor,
                              borderColor: statusStyles.borderColor,
                            },
                          ]}
                          onPress={() => handleSlotPress(selection, slot)}
                        >
                          <View style={styles.timeSlotHeader}>
                            <Text
                              style={[
                                styles.timeSlotTime,
                                { color: statusStyles.textColor },
                              ]}
                            >
                              {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
                            </Text>
                            <Text
                              style={[
                                styles.timeSlotBadge,
                                { color: statusStyles.textColor },
                              ]}
                            >
                              {slot.state === "available"
                                ? "Available"
                                : slot.state === "pending"
                                  ? "Pending"
                                  : "Unavailable"}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.timeSlotDescription,
                              { color: statusStyles.textColor },
                            ]}
                          >
                            {slot.description}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>
            )}
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
