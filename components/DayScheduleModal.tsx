import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import type {
  ReservationCampus,
  ReservationRecord,
  Schedule,
} from "@/types/reservation";

interface DayScheduleModalProps {
  campus: ReservationCampus | null;
  dateKey: string;
  onClose: () => void;
  onDiscardChanges?: () => void;
  onSave?: () => void;
  onSlotPress: (dateKey: string, slot: TimeSlotViewModel) => void;
  saveButtonLabel?: string;
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
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const fullDate = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `(${weekday}) ${fullDate}`;
}

function formatHourOnly(timeString: string) {
  return new Date(`2000-01-01T${timeString}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
}

function formatHourRangeLabel(startTime: string, endTime: string) {
  const start = new Date(`2000-01-01T${startTime}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });
  const end = new Date(`2000-01-01T${endTime}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    hour12: true,
  });

  return `${start} - ${end}`;
}

function formatSelectedDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${weekday}, ${monthDay}`;
}

function formatFullTime(timeString: string) {
  return new Date(`2000-01-01T${timeString}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function getStateLabel(state: TimeSlotViewModel["state"]) {
  if (state === "pending") {
    return "Pending";
  }

  if (state === "unavailable") {
    return "Unavailable";
  }

  return "Available";
}

export default function DayScheduleModal({
  campus,
  dateKey,
  onClose,
  onDiscardChanges,
  onSave,
  onSlotPress,
  saveButtonLabel,
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
  const selectedKeysForDate = useMemo(
    () =>
      selectedSlotKeys
        .filter((slotKey) => slotKey.startsWith(`${dateKey}-`))
        .sort((left, right) => left.localeCompare(right)),
    [dateKey, selectedSlotKeys]
  );
  const [initialSelectedKeysForDate, setInitialSelectedKeysForDate] = useState<string[]>(
    []
  );

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

  useEffect(() => {
    if (!visible || !dateKey) {
      return;
    }

    setInitialSelectedKeysForDate(selectedKeysForDate);
  }, [dateKey, visible]);

  const selectedRangeLabel = useMemo(() => {
    if (!dateKey || selectedKeysForDate.length === 0) {
      return null;
    }

    const orderedKeys = [...selectedKeysForDate].sort((left, right) =>
      left.localeCompare(right)
    );
    const firstKeyParts = orderedKeys[0]?.split("-");
    const lastKeyParts = orderedKeys[orderedKeys.length - 1]?.split("-");

    if (!firstKeyParts || !lastKeyParts || firstKeyParts.length < 5 || lastKeyParts.length < 5) {
      return null;
    }

    const startTime = firstKeyParts[3];
    const endTime = lastKeyParts[4];

    if (!startTime || !endTime) {
      return null;
    }

    return `Reserve ${formatHourRangeLabel(startTime, endTime)} for ${formatSelectedDateLabel(
      dateKey
    )}`;
  }, [dateKey, selectedKeysForDate]);
  const selectedSlotContentByKey = useMemo(() => {
    const contentByKey: Record<string, string> = {};
    const selectedSlots = visibleSlots.filter((slot) =>
      selectedKeysForDate.includes(`${dateKey}-${slot.startTime}-${slot.endTime}`)
    );

    if (selectedSlots.length === 0) {
      return contentByKey;
    }

    let groupStart = 0;

    while (groupStart < selectedSlots.length) {
      let groupEnd = groupStart;

      while (
        groupEnd + 1 < selectedSlots.length &&
        selectedSlots[groupEnd]?.endTime === selectedSlots[groupEnd + 1]?.startTime
      ) {
        groupEnd += 1;
      }

      const group = selectedSlots.slice(groupStart, groupEnd + 1);
      const firstSlot = group[0];
      const lastSlot = group[group.length - 1];
      const stateLabel = getStateLabel(lastSlot.state);

      if (group.length === 1) {
        contentByKey[`${dateKey}-${firstSlot.startTime}-${firstSlot.endTime}`] =
          `${formatFullTime(firstSlot.startTime)} - ${formatFullTime(firstSlot.endTime)} (${stateLabel})`;
      } else {
        contentByKey[`${dateKey}-${firstSlot.startTime}-${firstSlot.endTime}`] =
          `${formatFullTime(firstSlot.startTime)} -`;
        contentByKey[`${dateKey}-${lastSlot.startTime}-${lastSlot.endTime}`] =
          `${formatFullTime(lastSlot.endTime)} (${stateLabel})`;
      }

      groupStart = groupEnd + 1;
    }

    return contentByKey;
  }, [dateKey, selectedKeysForDate, visibleSlots]);

  if (!dateKey) {
    return null;
  }

  const heading = formatModalHeading(dateKey);
  const hasUnsavedChanges =
    initialSelectedKeysForDate.length !== selectedKeysForDate.length ||
    initialSelectedKeysForDate.some(
      (slotKey, index) => slotKey !== selectedKeysForDate[index]
    );

  function handleClosePress() {
    if (!hasUnsavedChanges) {
      onClose();
      return;
    }

    Alert.alert(
      "Discard changes?",
      "You have unsaved timeslot changes for this date. If you close now, those changes will be lost.",
      [
        { style: "cancel", text: "Keep editing" },
        {
          style: "destructive",
          text: "Discard",
          onPress: () => {
            onDiscardChanges?.();
            onClose();
          },
        },
      ]
    );
  }

  function handleSavePress() {
    if (onSave) {
      onSave();
      return;
    }

    onClose();
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={handleClosePress}
      transparent
      visible={visible}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClosePress} />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.heading}>{heading}</Text>
            </View>
            <TouchableOpacity style={styles.closeButton} onPress={handleClosePress}>
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
              visibleSlots.map((slot, index) => {
                const slotKey = `${dateKey}-${slot.startTime}-${slot.endTime}`;
                const isSelected = selectedSlotKeys.includes(slotKey);
                const statusStyles = getStatusStyles(slot.state);
                const selectedContent = selectedSlotContentByKey[slotKey];
                const showEndLabel = index < visibleSlots.length - 1;
                return (
                  <View key={slotKey} style={styles.slotSection}>
                    <View style={styles.slotRow}>
                      <View style={styles.timeColumn} />
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => onSlotPress(dateKey, slot)}
                        style={styles.slotTrack}
                      >
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
                          {selectedContent ? (
                            <Text style={styles.selectedSlotText}>
                              {selectedContent}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    </View>

                    {showEndLabel ? (
                      <View style={styles.timeMarkerRow}>
                        <Text style={styles.timeLabel}>
                          {formatHourOnly(slot.endTime)}
                        </Text>
                        <View style={styles.timeMarkerSpacer} />
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </ScrollView>

          {onSave ? (
            <TouchableOpacity
              onPress={handleSavePress}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>
                {selectedRangeLabel ?? saveButtonLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
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
  slotSection: {
    marginBottom: 2,
    position: "relative",
  },
  timeMarkerRow: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -7,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  timeMarkerSpacer: {
    flex: 1,
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  timeColumn: {
    width: 64,
    paddingRight: 8,
    alignItems: "flex-end",
  },
  timeLabel: {
    color: colors.secondary,
    fontFamily: fonts.bold,
    fontSize: 12,
    width: 52,
    textAlign: "right",
  },
  slotTrack: {
    flex: 1,
    minHeight: 52,
    justifyContent: "center",
  },
  slotBody: {
    flex: 1,
    minHeight: 52,
    borderRadius: 4,
    borderWidth: 1,
    backgroundColor: colors.subtleBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  slotBodySelected: {
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  selectedSlotText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 10,
    textAlign: "center",
  },
  saveButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
  },
  saveButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});
