import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts } from "@/constants/theme";

const CALENDAR_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface CalendarEntry {
  date: Date;
  dateKey: string;
  inMonth: boolean;
}

interface AvailabilityCalendarProps {
  calendarMonthLabel: string;
  calendarWeeks: CalendarEntry[][];
  isCalendarDateDisabled: (date: Date, dateKey: string) => boolean;
  isCalendarDateSelected: (dateKey: string) => boolean;
  onCalendarDateSelect: (dateKey: string) => void;
  onCalendarDone?: () => void;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  showDoneButton?: boolean;
}

export default function AvailabilityCalendar({
  calendarMonthLabel,
  calendarWeeks,
  isCalendarDateDisabled,
  isCalendarDateSelected,
  onCalendarDateSelect,
  onCalendarDone,
  onNextMonth,
  onPrevMonth,
  showDoneButton = false,
}: AvailabilityCalendarProps) {
  return (
    <View style={styles.calendarCard}>
      <View style={styles.calendarHeaderRow}>
        <TouchableOpacity style={styles.calendarNavButton} onPress={onPrevMonth}>
          <Text style={styles.calendarNavText}>{"<"}</Text>
        </TouchableOpacity>
        <Text style={styles.calendarTitle}>{calendarMonthLabel}</Text>
        <TouchableOpacity style={styles.calendarNavButton} onPress={onNextMonth}>
          <Text style={styles.calendarNavText}>{">"}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.calendarWeekRow}>
        {CALENDAR_DAY_LABELS.map((label) => (
          <Text key={label} style={styles.calendarWeekLabel}>
            {label}
          </Text>
        ))}
      </View>

      {calendarWeeks.map((week, weekIndex) => (
        <View key={`${calendarMonthLabel}-${weekIndex}`} style={styles.calendarWeekRow}>
          {week.map((entry) => {
            const selected = isCalendarDateSelected(entry.dateKey);
            const disabled = isCalendarDateDisabled(entry.date, entry.dateKey);

            return (
              <TouchableOpacity
                key={entry.dateKey}
                disabled={disabled}
                style={[
                  styles.calendarDateButton,
                  selected && styles.calendarDateButtonSelected,
                  disabled && styles.calendarDateButtonDisabled,
                ]}
                onPress={() => onCalendarDateSelect(entry.dateKey)}
              >
                <Text
                  style={[
                    styles.calendarDateText,
                    !entry.inMonth && styles.calendarDateTextMuted,
                    selected && styles.calendarDateTextSelected,
                    disabled && styles.calendarDateTextDisabled,
                  ]}
                >
                  {entry.date.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {showDoneButton && onCalendarDone ? (
        <TouchableOpacity style={styles.calendarDoneButton} onPress={onCalendarDone}>
          <Text style={styles.calendarDoneButtonText}>Done</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 16,
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarNavText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  calendarTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  calendarWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarWeekLabel: {
    width: "15%",
    textAlign: "center",
    color: colors.secondary,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  calendarDateButton: {
    width: "15%",
    aspectRatio: 1,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleBackground,
  },
  calendarDateButtonSelected: {
    backgroundColor: colors.primary,
  },
  calendarDateButtonDisabled: {
    opacity: 0.35,
  },
  calendarDateText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  calendarDateTextMuted: {
    color: colors.mutedText,
  },
  calendarDateTextSelected: {
    color: colors.white,
  },
  calendarDateTextDisabled: {
    color: colors.mutedText,
  },
  calendarDoneButton: {
    marginTop: 10,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    alignItems: "center",
  },
  calendarDoneButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
});