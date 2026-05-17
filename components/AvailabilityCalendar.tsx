import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, fonts } from "@/constants/theme";

const CALENDAR_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface CalendarEntry {
  date: Date;
  dateKey: string;
  inMonth: boolean;
}

type CalendarDateVariant = "danger" | "success" | "warning";
type CalendarSelectedVariant = "primary" | "success";

interface AvailabilityCalendarProps {
  calendarMonthLabel: string;
  calendarWeeks: CalendarEntry[][];
  getCalendarDateVariant?: (dateKey: string) => CalendarDateVariant | undefined;
  isCalendarDateDisabled: (date: Date, dateKey: string) => boolean;
  isCalendarDateSelected: (dateKey: string) => boolean;
  onCalendarDateSelect: (dateKey: string) => void;
  onCalendarDone?: () => void;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  selectedDateVariant?: CalendarSelectedVariant;
  showDoneButton?: boolean;
}

export default function AvailabilityCalendar({
  calendarMonthLabel,
  calendarWeeks,
  getCalendarDateVariant,
  isCalendarDateDisabled,
  isCalendarDateSelected,
  onCalendarDateSelect,
  onCalendarDone,
  onNextMonth,
  onPrevMonth,
  selectedDateVariant = "primary",
  showDoneButton = false,
}: AvailabilityCalendarProps) {
  function getVariantStyles(variant?: CalendarDateVariant) {
    if (variant === "success") {
      return {
        buttonStyle: styles.calendarDateButtonSuccess,
        textStyle: styles.calendarDateTextSuccess,
      };
    }

    if (variant === "warning") {
      return {
        buttonStyle: styles.calendarDateButtonWarning,
        textStyle: styles.calendarDateTextWarning,
      };
    }

    if (variant === "danger") {
      return {
        buttonStyle: styles.calendarDateButtonDanger,
        textStyle: styles.calendarDateTextDanger,
      };
    }

    return {
      buttonStyle: null,
      textStyle: null,
    };
  }

  const selectedButtonStyle =
    selectedDateVariant === "success"
      ? styles.calendarDateButtonSelectedSuccess
      : styles.calendarDateButtonSelected;

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
            const variantStyles = getVariantStyles(getCalendarDateVariant?.(entry.dateKey));

            return (
              <TouchableOpacity
                key={entry.dateKey}
                disabled={disabled}
                style={[
                  styles.calendarDateButton,
                  variantStyles.buttonStyle,
                  selected && selectedButtonStyle,
                  disabled && styles.calendarDateButtonDisabled,
                ]}
                onPress={() => onCalendarDateSelect(entry.dateKey)}
              >
                <Text
                  style={[
                    styles.calendarDateText,
                    variantStyles.textStyle,
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
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleBackground,
  },
  calendarDateButtonSuccess: {
    backgroundColor: colors.successBackground,
    borderColor: colors.successBorder,
  },
  calendarDateButtonWarning: {
    backgroundColor: "#fff7ed",
    borderColor: "#fdba74",
  },
  calendarDateButtonDanger: {
    backgroundColor: colors.dangerBackground,
    borderColor: colors.dangerBorder,
  },
  calendarDateButtonSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  calendarDateButtonSelectedSuccess: {
    backgroundColor: colors.successText,
    borderColor: colors.successText,
  },
  calendarDateButtonDisabled: {
    opacity: 0.35,
  },
  calendarDateText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  calendarDateTextSuccess: {
    color: colors.successText,
  },
  calendarDateTextWarning: {
    color: "#c2410c",
  },
  calendarDateTextDanger: {
    color: colors.dangerText,
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
