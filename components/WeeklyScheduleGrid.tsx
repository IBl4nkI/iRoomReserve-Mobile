import React from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";

import { colors, fonts } from "@/constants/theme";
import {
  buildTimeSlots,
  formatShortDate,
  formatWeekLabel,
  getSlotDefinitionsForCampus,
  getDayShortLabel,
  getWeekDates,
  toDateKey,
  type TimeSlotViewModel,
} from "@/lib/reservation-search";
import { formatTime12h } from "@/services/schedules.service";
import type { ReservationCampus, Schedule } from "@/types/reservation";

interface WeeklyScheduleGridProps {
  campus: ReservationCampus | null;
  roomId: string;
  schedules: Schedule[];
  weekOffset: number;
  onWeekChange: (nextWeekOffset: number) => void;
  onSlotPress?: (dateKey: string, slot: TimeSlotViewModel) => void;
}

function getStatusStyles(state: TimeSlotViewModel["state"]) {
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

function CellWrapper({
  children,
  disabled,
  onPress,
  style,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (!onPress) {
    return <View style={style}>{children}</View>;
  }

  return (
    <TouchableOpacity disabled={disabled} onPress={onPress} style={style}>
      {children}
    </TouchableOpacity>
  );
}

export default function WeeklyScheduleGrid({
  campus,
  roomId,
  schedules,
  weekOffset,
  onWeekChange,
  onSlotPress,
}: WeeklyScheduleGridProps) {
  const currentWeekDates = getWeekDates(weekOffset);
  const slotDefinitions = getSlotDefinitionsForCampus(campus);
  const columns = currentWeekDates.map((date) => {
    const dateKey = toDateKey(date);

    return {
      date,
      dateKey,
      slots: buildTimeSlots(roomId, dateKey, schedules),
    };
  });

  return (
    <View>
      <View style={styles.weekNavRow}>
        <TouchableOpacity
          style={styles.weekNavButton}
          disabled={weekOffset === 0}
          onPress={() => onWeekChange(Math.max(0, weekOffset - 1))}
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
          onPress={() => onWeekChange(weekOffset + 1)}
        >
          <Text style={styles.weekNavText}>{">"}</Text>
        </TouchableOpacity>
      </View>

      <View>
        <View style={styles.headerRow}>
          {columns.map(({ date, dateKey }) => (
            <View key={dateKey} style={styles.dayHeaderCell}>
              <Text style={styles.dayHeaderText}>{getDayShortLabel(date.getDay())}</Text>
              <Text style={styles.dayDateText}>{formatShortDate(date)}</Text>
            </View>
          ))}
        </View>

        {slotDefinitions.map((slotDefinition, rowIndex) => (
          <View key={slotDefinition.startTime} style={styles.slotRow}>
            {columns.map(({ dateKey, slots }) => {
              const slot = slots[rowIndex];
              const statusStyles = getStatusStyles(slot.state);

              return (
                <CellWrapper
                  key={`${dateKey}-${slot.startTime}`}
                  disabled={!onSlotPress}
                  onPress={onSlotPress ? () => onSlotPress(dateKey, slot) : undefined}
                  style={[
                    styles.slotCell,
                    {
                      backgroundColor: statusStyles.backgroundColor,
                      borderColor: statusStyles.borderColor,
                    },
                  ]}
                >
                  <Text style={[styles.slotTimeText, { color: statusStyles.textColor }]}>
                    {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
                  </Text>
                </CellWrapper>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekNavRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    marginBottom: 10,
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
  weekNavText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 18 },
  weekNavTextDisabled: { color: colors.mutedText },
  weekLabel: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 6,
    gap: 4,
  },
  dayHeaderCell: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  dayHeaderText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 11,
    marginBottom: 2,
  },
  dayDateText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 10,
    textAlign: "center",
  },
  slotRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 4,
    gap: 4,
  },
  slotCell: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 6,
    justifyContent: "center",
  },
  slotTimeText: {
    fontFamily: fonts.bold,
    fontSize: 8,
    lineHeight: 10,
    textAlign: "center",
  },
});
