import React, { useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import DayScheduleModal from "@/components/DayScheduleModal";
import styles from "./styles";
import { addMonths, getCalendarWeeks, getMonthLabel, getSelectedTimeslotKey, type SelectedTimeslot } from "./helpers";
import { colors } from "@/constants/theme";
import {
  buildTimeSlots,
  isPastDate,
  timeStringToMinutes,
  type SearchRoom,
  type TimeSlotViewModel,
} from "@/lib/reservation-search";
import { getReservationsByRoom } from "@/services/reservations.service";
import type { ReservationCampus, ReservationRecord, Schedule } from "@/types/reservation";

interface SelectionRoomResultsProps {
  availabilityLoading: boolean;
  availableRooms: SearchRoom[];
  endTime: string;
  expandedRoomId: string | null;
  resultsFooter?: React.ReactNode;
  resultsHeadingVisible: boolean;
  resultsTitle?: string;
  roomSchedules: Record<string, Schedule[]>;
  userReservations: ReservationRecord[];
  roomsError: string | null;
  roomsLoading: boolean;
  scheduleLoadingIds: Record<string, boolean>;
  selectedSlotsByRoom: Record<string, SelectedTimeslot[]>;
  startTime: string;
  onOpenReservationFormForRoom: (room: SearchRoom) => void;
  onSetSelectedSlotsForRoom: (roomId: string, slots: SelectedTimeslot[]) => void;
  onToggleExpandedRoom: (roomId: string) => void;
  onToggleSelectedTimeslot: (
    room: SearchRoom,
    dateKey: string,
    slot: TimeSlotViewModel
  ) => void;
}

export default function SelectionRoomResults({
  availabilityLoading,
  availableRooms,
  endTime,
  expandedRoomId,
  resultsFooter,
  resultsHeadingVisible,
  resultsTitle,
  roomSchedules,
  userReservations,
  roomsError,
  roomsLoading,
  scheduleLoadingIds,
  selectedSlotsByRoom,
  startTime,
  onOpenReservationFormForRoom,
  onSetSelectedSlotsForRoom,
  onToggleExpandedRoom,
  onToggleSelectedTimeslot,
}: SelectionRoomResultsProps) {
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [modalDateKey, setModalDateKey] = useState<string | null>(null);
  const [modalSelectionSnapshot, setModalSelectionSnapshot] = useState<{
    roomId: string;
    slots: SelectedTimeslot[];
  } | null>(null);
  const [roomReservationsByRoomId, setRoomReservationsByRoomId] = useState<
    Record<string, ReservationRecord[]>
  >({});
  const [reservationLoadingIds, setReservationLoadingIds] = useState<Record<string, boolean>>({});
  const calendarWeeks = useMemo(() => getCalendarWeeks(calendarMonth), [calendarMonth]);
  const calendarMonthLabel = getMonthLabel(calendarMonth);

  React.useEffect(() => {
    if (!expandedRoomId || roomReservationsByRoomId[expandedRoomId] || reservationLoadingIds[expandedRoomId]) {
      return;
    }

    let active = true;

    setReservationLoadingIds((currentValue) => ({
      ...currentValue,
      [expandedRoomId]: true,
    }));

    getReservationsByRoom(expandedRoomId)
      .then((nextReservations) => {
        if (!active) {
          return;
        }

        setRoomReservationsByRoomId((currentValue) => ({
          ...currentValue,
          [expandedRoomId]: nextReservations,
        }));
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setRoomReservationsByRoomId((currentValue) => ({
          ...currentValue,
          [expandedRoomId]: [],
        }));
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setReservationLoadingIds((currentValue) => ({
          ...currentValue,
          [expandedRoomId]: false,
        }));
      });

    return () => {
      active = false;
    };
  }, [expandedRoomId, reservationLoadingIds, roomReservationsByRoomId]);

  function handleOpenDayScheduleModal(
    roomId: string,
    dateKey: string,
    selectedSlots: SelectedTimeslot[]
  ) {
    setModalSelectionSnapshot({
      roomId,
      slots: selectedSlots,
    });
    setModalDateKey(dateKey);
  }

  function handleCloseDayScheduleModal() {
    setModalDateKey(null);
    setModalSelectionSnapshot(null);
  }

  function handleDiscardDayScheduleChanges(room: SearchRoom) {
    if (modalSelectionSnapshot?.roomId !== room.id) {
      return;
    }

    onSetSelectedSlotsForRoom(room.id, modalSelectionSnapshot.slots);
  }

  return (
    <View style={styles.resultsShell}>
      {resultsHeadingVisible ? (
        <>
          <Text style={styles.resultsAppName}>iRoomReserve</Text>
          <Text style={styles.resultsTitle}>Available Rooms</Text>
          {resultsTitle ? (
            <Text style={styles.resultsSubtitle}>{resultsTitle}</Text>
          ) : null}
        </>
      ) : null}
      {roomsLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading rooms...</Text>
        </View>
      ) : roomsError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{roomsError}</Text>
        </View>
      ) : availabilityLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Checking room availability...</Text>
        </View>
      ) : availableRooms.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>
            No rooms match the current filters and availability window.
          </Text>
        </View>
      ) : (
        <View style={styles.resultsBlock}>
          {availableRooms.map((room) => {
            const expanded = expandedRoomId === room.id;
            const schedules = roomSchedules[room.id] ?? [];
            const selectedSlots = selectedSlotsByRoom[room.id] ?? [];
            const selectedSlotKeys = selectedSlots.map((slot) =>
              getSelectedTimeslotKey(slot)
            );
            const hasSelectedSlots = selectedSlots.length > 0;
            const isModalOpenForRoom =
              modalDateKey !== null && modalSelectionSnapshot?.roomId === room.id;
            const roomReservations = roomReservationsByRoomId[room.id] ?? [];
            const dateVariantByKey = Object.fromEntries(
              calendarWeeks.flat().map((entry) => {
                const matchingSlots = buildTimeSlots(
                  room.id,
                  entry.dateKey,
                  schedules,
                  roomReservations,
                  userReservations
                ).filter(
                  (slot) =>
                    timeStringToMinutes(slot.startTime) >= timeStringToMinutes(startTime) &&
                    timeStringToMinutes(slot.endTime) <= timeStringToMinutes(endTime)
                );

                if (matchingSlots.some((slot) => slot.state === "available")) {
                  return [entry.dateKey, "success"];
                }

                if (matchingSlots.some((slot) => slot.state === "pending")) {
                  return [entry.dateKey, "warning"];
                }

                return [entry.dateKey, "danger"];
              })
            ) as Record<string, "danger" | "success" | "warning">;

            return (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.roomInfoPressable}
                    onPress={() => onToggleExpandedRoom(room.id)}
                  >
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomMeta}>{room.buildingName}</Text>
                    <Text style={styles.roomMeta}>Floor: {room.floor}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => onToggleExpandedRoom(room.id)}
                  >
                    <Text style={styles.expandButtonText}>{expanded ? "^" : "v"}</Text>
                  </TouchableOpacity>
                </View>

                {scheduleLoadingIds[room.id] ? (
                  <ActivityIndicator color={colors.primary} style={styles.roomLoader} />
                ) : null}

                {expanded ? (
                  <View style={styles.expandedSection}>
                    <View style={styles.detailCard}>
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Type: </Text>
                        {room.roomType}
                      </Text>
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Status: </Text>
                        {room.status}
                      </Text>
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Air-Conditioner: </Text>
                        {room.acStatus}
                      </Text>
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>TV/Projector: </Text>
                        {room.tvProjectorStatus}
                      </Text>
                      <Text style={styles.detailText}>
                        <Text style={styles.detailLabel}>Max. Capacity: </Text>
                        {`${room.capacity} People`}
                      </Text>
                    </View>

                    <View style={styles.schedulePreviewCard}>
                      <Text style={styles.schedulePreviewTitle}>View Schedules</Text>
                      <AvailabilityCalendar
                        calendarMonthLabel={calendarMonthLabel}
                        calendarWeeks={calendarWeeks}
                        getCalendarDateVariant={(dateKey) => dateVariantByKey[dateKey]}
                        isCalendarDateDisabled={(date) =>
                          isPastDate(date) || date.getDay() === 0
                        }
                        isCalendarDateSelected={(dateKey) =>
                          selectedSlots.some((slot) => slot.dateKey === dateKey)
                        }
                        onCalendarDateSelect={(dateKey) =>
                          handleOpenDayScheduleModal(room.id, dateKey, selectedSlots)
                        }
                        onNextMonth={() =>
                          setCalendarMonth((prev) => addMonths(prev, 1))
                        }
                        onPrevMonth={() =>
                          setCalendarMonth((prev) => addMonths(prev, -1))
                        }
                      />
                      <DayScheduleModal
                        campus={room.campus as ReservationCampus | null}
                        dateKey={isModalOpenForRoom ? modalDateKey ?? "" : ""}
                        onClose={handleCloseDayScheduleModal}
                        onDiscardChanges={() => handleDiscardDayScheduleChanges(room)}
                        onSave={handleCloseDayScheduleModal}
                        onSlotPress={(dateKey, slot) =>
                          onToggleSelectedTimeslot(room, dateKey, slot)
                        }
                        saveButtonLabel="Save Selected Timeslots"
                        roomId={room.id}
                        schedules={schedules}
                        selectedSlotKeys={selectedSlotKeys}
                        userReservations={userReservations}
                        visible={isModalOpenForRoom}
                      />
                      <TouchableOpacity
                        disabled={!hasSelectedSlots}
                        onPress={() => onOpenReservationFormForRoom(room)}
                        style={[
                          styles.reserveSelectedButton,
                          !hasSelectedSlots && styles.reserveSelectedButtonDisabled,
                        ]}
                      >
                        <Text
                          style={[
                            styles.reserveSelectedButtonText,
                            !hasSelectedSlots &&
                              styles.reserveSelectedButtonTextDisabled,
                          ]}
                        >
                          {!hasSelectedSlots
                            ? "Select timeslots to reserve"
                            : "Reserve Selected Timeslots"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
      {resultsFooter ? <View style={styles.resultsFooter}>{resultsFooter}</View> : null}
    </View>
  );
}
