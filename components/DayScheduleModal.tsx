import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import { colors, fonts } from "@/constants/theme";
import {
  buildTimeSlots,
  getSlotDefinitionsForCampus,
  type TimeSlotViewModel,
} from "@/lib/reservation-search";
import { auth } from "@/services/firebase";
import {
  getReservationsByRoom,
  getReservationsByUser,
} from "@/services/reservations.service";
import { formatTime12h } from "@/services/schedules.service";
import type {
  ReservationCampus,
  ReservationRecord,
  Schedule,
} from "@/types/reservation";

interface DayScheduleModalProps {
  campus: ReservationCampus | null;
  dateKey: string;
  onClose: () => void;
  onSlotPress: (dateKey: string, slot: TimeSlotViewModel) => void;
  roomId: string;
  schedules: Schedule[];
  selectedSlotKeys: string[];
  userReservations?: ReservationRecord[];
  visible: boolean;
}

function getStatusStyles(state: TimeSlotViewModel["state"]) {
  if (state === "available") {
    return {
      backgroundColor: colors.successBackground,
      borderColor: colors.successBorder,
      textColor: colors.successText,
      labelColor: colors.successText,
    };
  }

  if (state === "pending") {
    return {
      backgroundColor: "#fff7ed",
      borderColor: "#fdba74",
      textColor: "#c2410c",
      labelColor: "#c2410c",
    };
  }

  return {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
    textColor: colors.dangerText,
    labelColor: colors.dangerText,
  };
}

function formatModalHeading(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.toLocaleDateString("en-US", {weekday: "short" });
  const fullDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `(${weekday}) ${fullDate}`;
}

export default function DayScheduleModal({
  campus,
  dateKey,
  onClose,
  onSlotPress,
  roomId,
  schedules,
  selectedSlotKeys,
  userReservations,
  visible,
}: DayScheduleModalProps) {
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [currentUserReservations, setCurrentUserReservations] = useState<
    ReservationRecord[]
  >([]);

  useEffect(() => {
    if (!visible || !roomId) {
      return;
    }

    let active = true;

    getReservationsByRoom(roomId)
      .then((nextReservations) => {
        if (active) {
          setReservations(nextReservations);
        }
      })
      .catch(() => {
        if (active) {
          setReservations([]);
        }
      });

    return () => {
      active = false;
    };
  }, [roomId, visible]);

  useEffect(() => {
    if (userReservations) {
      setCurrentUserReservations(userReservations);
      return;
    }

    if (!visible) {
      return;
    }

    const currentUser = auth.currentUser;

    if (!currentUser) {
      setCurrentUserReservations([]);
      return;
    }

    let active = true;

    getReservationsByUser(currentUser.uid)
      .then((nextReservations) => {
        if (active) {
          setCurrentUserReservations(
            nextReservations.filter(
              (reservation) =>
                reservation.status === "pending" ||
                reservation.status === "approved"
            )
          );
        }
      })
      .catch(() => {
        if (active) {
          setCurrentUserReservations([]);
        }
      });

    return () => {
      active = false;
    };
  }, [userReservations, visible]);

  const effectiveUserReservations = userReservations ?? currentUserReservations;

  const visibleSlots = useMemo(() => {
    if (!dateKey) {
      return [];
    }

    const slotDefinitions = getSlotDefinitionsForCampus(campus);
    const allSlots = buildTimeSlots(
      roomId,
      dateKey,
      schedules,
      reservations,
      effectiveUserReservations
    );

    return allSlots.filter((slot) =>
      slotDefinitions.some(
        (definition) =>
          definition.startTime === slot.startTime &&
          definition.endTime === slot.endTime
      )
    );
  }, [
    campus,
    dateKey,
    effectiveUserReservations,
    reservations,
    roomId,
    schedules,
  ]);

  if (!dateKey) {
    return null;
  }

  const heading = formatModalHeading(dateKey);

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.heading}>{heading}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: colors.successText },
                ]}
              />
              <Text style={styles.legendText}>Available</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[styles.legendDot, { backgroundColor: "#fdba74" }]}
              />
              <Text style={styles.legendText}>Pending</Text>
            </View>
            <View style={styles.legendItem}>
              <View
                style={[
                  styles.legendDot,
                  { backgroundColor: colors.dangerText },
                ]}
              />
              <Text style={styles.legendText}>Unavailable</Text>
            </View>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {visibleSlots.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No timeslots available</Text>
                <Text style={styles.emptyStateText}>
                  There are no reservable timeslots for this date yet.
                </Text>
              </View>
            ) : (
              visibleSlots.map((slot) => {
                const slotKey = `${dateKey}-${slot.startTime}-${slot.endTime}`;
                const isSelected = selectedSlotKeys.includes(slotKey);
                const statusStyles = getStatusStyles(slot.state);

                return (
                  <TouchableOpacity
                    key={slotKey}
                    activeOpacity={0.8}
                    onPress={() => onSlotPress(dateKey, slot)}
                    style={styles.slotRow}
                  >
                    <View style={styles.timeLabelColumn}>
                      <Text style={styles.timeLabel}>
                        {formatTime12h(slot.startTime)}
                      </Text>
                    </View>

                    <View style={styles.slotTrack}>
                      <View
                        style={[
                          styles.slotBody,
                          {
                            backgroundColor: isSelected
                              ? colors.primary
                              : statusStyles.backgroundColor,
                            borderColor: isSelected
                              ? colors.primary
                              : statusStyles.borderColor,
                          },
                          isSelected && styles.slotBodySelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.slotTimeRange,
                            {
                              color: isSelected
                                ? colors.white
                                : statusStyles.textColor,
                            },
                          ]}
                        >
                          {formatTime12h(slot.startTime)} -{" "}
                          {formatTime12h(slot.endTime)}
                        </Text>
                        <Text
                          style={[
                            styles.slotDescription,
                            {
                              color: isSelected
                                ? "rgba(255,255,255,0.84)"
                                : statusStyles.labelColor,
                            },
                          ]}
                        >
                          {slot.description}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>

          <Text style={styles.helperText}>
            Tap a timeslot to select it. Selecting a later timeslot on the same
            day automatically fills the full range in between.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(29, 27, 32, 0.4)",
    justifyContent: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 32,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    width: "100%",
    maxHeight: "92%",
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: "column",
  },
  heading: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 22,
    lineHeight: 30,
    paddingRight: 12,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 14,
    paddingHorizontal: 2,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 16,
    marginBottom: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 6,
  },
  legendText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  emptyStateTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 6,
  },
  emptyStateText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  timeLabelColumn: {
    width: 62,
    paddingTop: 10,
    paddingRight: 8,
  },
  timeLabel: {
    color: colors.secondary,
    fontFamily: fonts.bold,
    fontSize: 12,
    textAlign: "right",
  },
  slotTrack: {
    flex: 1,
    minHeight: 76,
    justifyContent: "center",
  },
  slotBody: {
    flex: 1,
    minHeight: 76,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: "center",
  },
  slotBodySelected: {
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  slotTimeRange: {
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 4,
  },
  slotDescription: {
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  helperText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 10,
    textAlign: "center",
  },
});
