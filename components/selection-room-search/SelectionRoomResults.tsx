import React from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";

import WeeklyScheduleGrid from "@/components/WeeklyScheduleGrid";
import styles from "./styles";
import { getSelectedTimeslotKey, type SelectedTimeslot } from "./helpers";
import { colors } from "@/constants/theme";
import type { SearchRoom, TimeSlotViewModel } from "@/lib/reservation-search";
import type { ReservationRecord, Schedule } from "@/types/reservation";

interface SelectionRoomResultsProps {
  availabilityLoading: boolean;
  availableRooms: SearchRoom[];
  expandedRoomId: string | null;
  resultsFooter?: React.ReactNode;
  resultsHeadingVisible: boolean;
  roomSchedules: Record<string, Schedule[]>;
  userReservations: ReservationRecord[];
  roomsError: string | null;
  roomsLoading: boolean;
  scheduleLoadingIds: Record<string, boolean>;
  selectedSlotsByRoom: Record<string, SelectedTimeslot[]>;
  weekOffsets: Record<string, number>;
  onOpenReservationFormForRoom: (room: SearchRoom) => void;
  onRoomPress: (roomId: string) => void;
  onToggleExpandedRoom: (roomId: string) => void;
  onToggleSelectedTimeslot: (
    room: SearchRoom,
    dateKey: string,
    slot: TimeSlotViewModel
  ) => void;
  onWeekOffsetChange: (roomId: string, nextWeekOffset: number) => void;
}

export default function SelectionRoomResults({
  availabilityLoading,
  availableRooms,
  expandedRoomId,
  resultsFooter,
  resultsHeadingVisible,
  roomSchedules,
  userReservations,
  roomsError,
  roomsLoading,
  scheduleLoadingIds,
  selectedSlotsByRoom,
  weekOffsets,
  onOpenReservationFormForRoom,
  onRoomPress,
  onToggleExpandedRoom,
  onToggleSelectedTimeslot,
  onWeekOffsetChange,
}: SelectionRoomResultsProps) {
  return (
    <View style={styles.resultsShell}>
      {resultsHeadingVisible ? (
        <>
          <Text style={styles.resultsAppName}>iRoomReserve</Text>
          <Text style={styles.resultsTitle}>Available Rooms</Text>
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
            const weekOffset = weekOffsets[room.id] ?? 0;

            return (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.roomInfoPressable}
                    onPress={() => onRoomPress(room.id)}
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
                        <Text style={styles.detailLabel}>Capacity: </Text>
                        {`Approx. ${room.capacity} People`}
                      </Text>
                    </View>

                    <View style={styles.schedulePreviewCard}>
                      <Text style={styles.schedulePreviewTitle}>View Schedules</Text>
                      <Text style={styles.schedulePreviewSubtitle}>
                        <Text style={styles.schedulePreviewGreen}>Green</Text>
                        {" means available, "}
                        <Text style={styles.schedulePreviewYellow}>yellow</Text>
                        {" means there is an ongoing reservation request, and "}
                        <Text style={styles.schedulePreviewRed}>red</Text>
                        {" means unavailable."}
                      </Text>
                      <Text style={styles.schedulePreviewHelperText}>
                        <Text style={styles.schedulePreviewHelperTextBold}>
                          Tap the timeslots
                        </Text>{" "}
                        to reserve this room. Selecting a later timeslot on the same day
                        automatically fills the full range in between.
                      </Text>
                      <WeeklyScheduleGrid
                        campus={room.campus}
                        roomId={room.id}
                        schedules={schedules}
                        userReservations={userReservations}
                        weekOffset={weekOffset}
                        weekNavTopMargin={0}
                        onWeekChange={(nextWeekOffset) =>
                          onWeekOffsetChange(room.id, nextWeekOffset)
                        }
                        onSlotPress={(dateKey, slot) =>
                          onToggleSelectedTimeslot(room, dateKey, slot)
                        }
                        selectedSlotKeys={selectedSlotKeys}
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
