import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import DayScheduleModal from "@/components/DayScheduleModal";
import { addMonths, applySelectedTimeslotPress, getCalendarWeeks, getMonthLabel } from "@/components/selection-room-search/helpers";
import { colors, fonts } from "@/constants/theme";
import {
  formatFullDate,
  getRoomCampus,
  isPastDate,
  type TimeSlotViewModel,
} from "@/lib/reservation-search";
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
  const [selectedSlots, setSelectedSlots] = useState<SelectedTimeslot[]>([]);
  const [modalSelectionSnapshot, setModalSelectionSnapshot] = useState<
    SelectedTimeslot[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedSlotKeys = useMemo(
    () => selectedSlots.map((slot) => getTimeslotKey(slot)),
    [selectedSlots]
  );
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [modalDateKey, setModalDateKey] = useState<string | null>(null);
  const calendarWeeks = useMemo(() => getCalendarWeeks(calendarMonth), [calendarMonth]);
  const calendarMonthLabel = getMonthLabel(calendarMonth);
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
    slot: TimeSlotViewModel
  ) {
    const selectionLabel = formatFullDate(new Date(`${dateKey}T00:00:00`));
    const timeslot = `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`;

    if (slot.state === "unavailable") {
      if (slot.unavailableReason === "user_conflict") {
        Alert.alert(
          "Existing Reservation",
          "You already have a reservation request for this same timeslot. Press OK to remove or change that reservation first.",
          [{ text: "OK" }]
        );
        return;
      }

      Alert.alert(
        "Room Unavailable",
        "This room is unavailable. Would you like to see alternative rooms that are available for this timeslot?",
        [
          { style: "cancel", text: "No" },
          {
            text: "Yes",
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

  function handleOpenDayScheduleModal(dateKey: string) {
    setModalSelectionSnapshot(selectedSlots);
    setModalDateKey(dateKey);
  }

  function handleCloseDayScheduleModal() {
    setModalDateKey(null);
    setModalSelectionSnapshot(null);
  }

  function handleDiscardDayScheduleChanges() {
    if (modalSelectionSnapshot) {
      setSelectedSlots(modalSelectionSnapshot);
    }
  }

  if (!loading && (!room || error)) {
    return (
      <SelectionScreenLayout
        title="Room Not Found"
        onBackPress={() => router.back()}
      >
        <Text style={styles.fallbackText}>{error ?? "Room not found."}</Text>
        <TouchableOpacity style={styles.linkButton} onPress={() => router.back()}>
          <Text style={styles.linkText}>Go Back</Text>
        </TouchableOpacity>
      </SelectionScreenLayout>
    );
  }

  const footer = (
    <TouchableOpacity
      style={styles.linkButton}
      onPress={() => router.push("/(main)/dashboard")}
    >
      <Text style={styles.linkText}>Dashboard</Text>
    </TouchableOpacity>
  );

  return (
    <SelectionScreenLayout
      title="Room Information"
      subtitle={room?.name ? `(${room.name})` : undefined}
      onBackPress={() => router.back()}
      footer={footer}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} style={styles.statusSpacing} />
      ) : (
        <>
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
            <Text style={styles.selectionHelperText}>
              Tap a date to view and select timeslots for reservation.
            </Text>
            <AvailabilityCalendar
              calendarMonthLabel={calendarMonthLabel}
              calendarWeeks={calendarWeeks}
              isCalendarDateDisabled={(date) =>
                isPastDate(date) || date.getDay() === 0
              }
              isCalendarDateSelected={(dateKey) =>
                selectedSlots.some((slot) => slot.dateKey === dateKey)
              }
              onCalendarDateSelect={handleOpenDayScheduleModal}
              onNextMonth={() =>
                setCalendarMonth((prev) => addMonths(prev, 1))
              }
              onPrevMonth={() =>
                setCalendarMonth((prev) => addMonths(prev, -1))
              }
            />
            <DayScheduleModal
              campus={room ? getRoomCampus(room) : null}
              dateKey={modalDateKey ?? ""}
              onClose={handleCloseDayScheduleModal}
              onDiscardChanges={handleDiscardDayScheduleChanges}
              onSave={handleCloseDayScheduleModal}
              onSlotPress={handleSlotPress}
              saveButtonLabel="Save"
              roomId={resolvedRoomId}
              schedules={schedules}
              selectedSlotKeys={selectedSlotKeys}
              visible={modalDateKey !== null}
            />
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
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  fallbackText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 16,
    marginBottom: 16,
    textAlign: "center",
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
    marginBottom: 20,
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
  reserveButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  reserveButtonTextDisabled: {
    color: colors.mutedText,
  },
  linkButton: { alignItems: "center", marginTop: 12 },
  linkText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
    textDecorationLine: "underline",
  },
});
