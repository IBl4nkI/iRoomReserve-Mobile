import React from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import { colors, fonts } from "@/constants/theme";
import { CAMPUS_LABELS } from "@/lib/reservation-search";
import type { ReservationCampus } from "@/types/reservation";

const CAMPUS_OPTIONS: ReservationCampus[] = ["main", "digi"];
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const CALENDAR_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function formatDisplayDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-");
  if (!year || !month || !day) {
    return dateKey;
  }
  return `${day}/${month}/${year.slice(-2)}`;
}

interface CalendarEntry {
  date: Date;
  dateKey: string;
  inMonth: boolean;
}

interface RoomSearchFiltersProps {
  calendarMonthLabel: string;
  calendarWeeks: CalendarEntry[][];
  endDateInput: string;
  endTimeLabel: string;
  filtersOpen: boolean;
  getDayShortLabel: (dayOfWeek: number) => string;
  hasActiveFilters: boolean;
  isCalendarDateDisabled: (date: Date, dateKey: string) => boolean;
  isCalendarDateSelected: (dateKey: string) => boolean;
  isRecurring: boolean;
  onCalendarDateSelect: (dateKey: string) => void;
  onCalendarDone: () => void;
  onEndDateBlur: () => void;
  onEndDateChange: (value: string) => void;
  onEndDateCalendarPress: () => void;
  onEndTimePress: () => void;
  onNextMonth: () => void;
  onPrevMonth: () => void;
  onRemoveReservationDate: (dateKey: string) => void;
  onReservationDateBlur: () => void;
  onReservationDateChange: (value: string) => void;
  onReservationDateCalendarPress: () => void;
  onResetFilters: () => void;
  onStartTimePress: () => void;
  onToggleCampus: (campus: ReservationCampus) => void;
  onToggleDay: (dayOfWeek: number) => void;
  onToggleRecurring: (value: boolean) => void;
  openCalendarField: "reservationDates" | "reservationDate" | "recurringEndDate" | null;
  previewDates: string[];
  reservationDateInput: string;
  reservationDatesInput: string;
  selectedCampus: ReservationCampus | null;
  selectedDays: number[];
  startTimeLabel: string;
}

function CalendarIcon() {
  return (
    <View style={styles.calendarIcon}>
      <View style={styles.calendarIconHeader} />
      <View style={styles.calendarIconGrid}>
        <View style={styles.calendarIconDot} />
        <View style={styles.calendarIconDot} />
        <View style={styles.calendarIconDot} />
        <View style={styles.calendarIconDot} />
      </View>
    </View>
  );
}

function ClockIcon() {
  return (
    <View style={styles.clockIcon}>
      <View style={styles.clockFace} />
      <View style={styles.clockHandVertical} />
      <View style={styles.clockHandHorizontal} />
    </View>
  );
}

function splitDateValue(value: string) {
  const [rawDay = "", rawMonth = "", rawYear = ""] = value.split("/");

  return {
    day: rawDay.replace(/\D/g, "").slice(0, 2),
    month: rawMonth.replace(/\D/g, "").slice(0, 2),
    year: rawYear.replace(/\D/g, "").slice(0, 2),
  };
}

function joinDateValue(day: string, month: string, year: string) {
  if (!day && !month && !year) {
    return "";
  }

  return `${day}/${month}/${year}`.replace(/\/+$/, "");
}

function clampTwoDigitValue(value: string, min: number, max: number) {
  if (!value) {
    return "";
  }

  const numericValue = Number(value);
  return String(Math.min(max, Math.max(min, numericValue))).padStart(2, "0");
}

interface SegmentedDateInputProps {
  onBlur?: () => void;
  onCalendarPress: () => void;
  onChange: (value: string) => void;
  value: string;
}

function SegmentedDateInput({
  onBlur,
  onCalendarPress,
  onChange,
  value,
}: SegmentedDateInputProps) {
  const monthRef = React.useRef<TextInput | null>(null);
  const yearRef = React.useRef<TextInput | null>(null);
  const { day, month, year } = splitDateValue(value);

  function updateValue(nextDay: string, nextMonth: string, nextYear: string) {
    onChange(joinDateValue(nextDay, nextMonth, nextYear));
  }

  function handleDayChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);

    if (digits.length === 1 && Number(digits) > 3) {
      updateValue(`0${digits}`, month, year);
      monthRef.current?.focus();
      return;
    }

    const nextDay = digits.length === 2 ? clampTwoDigitValue(digits, 1, 31) : digits;
    updateValue(nextDay, month, year);

    if (digits.length === 2) {
      monthRef.current?.focus();
    }
  }

  function handleMonthChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);

    if (digits.length === 1) {
      const digit = Number(digits);

      if (digit >= 2) {
        updateValue(day, `0${digits}`, year);
        yearRef.current?.focus();
        return;
      }
    }

    const nextMonth = digits.length === 2 ? clampTwoDigitValue(digits, 1, 12) : digits;
    updateValue(day, nextMonth, year);

    if (digits.length === 2) {
      yearRef.current?.focus();
    }
  }

  function handleYearChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);
    const nextYear = digits.length === 2 ? clampTwoDigitValue(digits, 25, 99) : digits;
    updateValue(day, month, nextYear);
  }

  return (
    <View style={styles.inputWithAction}>
      <View style={[styles.filterInput, styles.filterInputWithIcon, styles.segmentedDateShell]}>
        <TextInput
          keyboardType="number-pad"
          maxLength={2}
          onBlur={onBlur}
          onChangeText={handleDayChange}
          placeholder="DD"
          placeholderTextColor={colors.mutedText}
          style={styles.segmentedDateInput}
          value={day}
        />
        <Text style={styles.segmentedDateDivider}>/</Text>
        <TextInput
          keyboardType="number-pad"
          maxLength={2}
          onBlur={onBlur}
          onChangeText={handleMonthChange}
          placeholder="MM"
          placeholderTextColor={colors.mutedText}
          ref={monthRef}
          style={styles.segmentedDateInput}
          value={month}
        />
        <Text style={styles.segmentedDateDivider}>/</Text>
        <TextInput
          keyboardType="number-pad"
          maxLength={2}
          onBlur={onBlur}
          onChangeText={handleYearChange}
          placeholder="YY"
          placeholderTextColor={colors.mutedText}
          ref={yearRef}
          style={styles.segmentedDateInput}
          value={year}
        />
      </View>
      <TouchableOpacity style={styles.inputActionButton} onPress={onCalendarPress}>
        <CalendarIcon />
      </TouchableOpacity>
    </View>
  );
}

export default function RoomSearchFilters({
  calendarMonthLabel,
  calendarWeeks,
  endDateInput,
  endTimeLabel,
  filtersOpen,
  getDayShortLabel,
  hasActiveFilters,
  isCalendarDateDisabled,
  isCalendarDateSelected,
  isRecurring,
  onCalendarDateSelect,
  onCalendarDone,
  onEndDateBlur,
  onEndDateChange,
  onEndDateCalendarPress,
  onEndTimePress,
  onNextMonth,
  onPrevMonth,
  onRemoveReservationDate,
  onReservationDateBlur,
  onReservationDateChange,
  onReservationDateCalendarPress,
  onResetFilters,
  onStartTimePress,
  onToggleCampus,
  onToggleDay,
  onToggleRecurring,
  openCalendarField,
  previewDates,
  reservationDateInput,
  reservationDatesInput,
  selectedCampus,
  selectedDays,
  startTimeLabel,
}: RoomSearchFiltersProps) {
  if (!filtersOpen) {
    return null;
  }

  return (
    <View style={styles.filterCard}>
      <Text style={styles.filterSectionTitle}>Search by Campus:</Text>
      <View style={styles.radioGroup}>
        {CAMPUS_OPTIONS.map((campus) => {
          const selected = selectedCampus === campus;

          return (
            <TouchableOpacity
              key={campus}
              style={[styles.radioRow, selected && styles.radioRowSelected]}
              onPress={() => onToggleCampus(campus)}
            >
              <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                {selected ? <View style={styles.radioInner} /> : null}
              </View>
              <Text style={styles.radioText}>{CAMPUS_LABELS[campus]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.toggleCard}>
        <View style={styles.toggleTextBlock}>
          <Text style={styles.toggleTitle}>Recurring Reservation</Text>
          <Text style={styles.toggleSubtitle}>Book the same time slot on multiple days</Text>
        </View>
        <Switch
          value={isRecurring}
          onValueChange={onToggleRecurring}
          trackColor={{ false: "#d7cdcd", true: "#d87878" }}
          thumbColor={isRecurring ? colors.primary : colors.surface}
        />
      </View>

      {isRecurring ? (
        <>
          <Text style={styles.filterSectionTitle}>Select Days of the Week</Text>
          <View style={styles.weekdayCalendarRow}>
            {WEEKDAY_OPTIONS.map((dayOfWeek) => {
              const selected = selectedDays.includes(dayOfWeek);

              return (
                <TouchableOpacity
                  key={dayOfWeek}
                  style={[
                    styles.weekdayCalendarButton,
                    selected && styles.weekdayCalendarButtonSelected,
                  ]}
                  onPress={() => onToggleDay(dayOfWeek)}
                >
                  <Text
                    style={[
                      styles.weekdayCalendarText,
                      selected && styles.weekdayCalendarTextSelected,
                    ]}
                  >
                    {getDayShortLabel(dayOfWeek)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={styles.inputGrid}>
        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>
            {isRecurring ? "Start Date" : "Add Reservation Date(s)"}
          </Text>
          <SegmentedDateInput
            onBlur={onReservationDateBlur}
            onCalendarPress={onReservationDateCalendarPress}
            onChange={onReservationDateChange}
            value={isRecurring ? reservationDateInput : reservationDatesInput}
          />
        </View>

        {isRecurring ? (
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>End Date</Text>
            <SegmentedDateInput
              onBlur={onEndDateBlur}
              onCalendarPress={onEndDateCalendarPress}
              onChange={onEndDateChange}
              value={endDateInput}
            />
          </View>
        ) : null}
      </View>

      {openCalendarField ? (
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

          <Text style={styles.helperText}>
            Sundays are excluded. Only Monday to Saturday can be selected.
          </Text>

          {openCalendarField === "reservationDates" ? (
            <TouchableOpacity style={styles.calendarDoneButton} onPress={onCalendarDone}>
              <Text style={styles.calendarDoneButtonText}>Done</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>Room should be available on:</Text>
        <View style={styles.previewChipWrap}>
          {previewDates.length === 0 ? (
            <Text style={styles.previewEmptyText}>
              {isRecurring
                ? "Add valid dates and weekdays to preview the selected range."
                : "Add one or more valid dates to preview room availability."}
            </Text>
          ) : (
            previewDates.map((dateKey) => (
              <View key={dateKey} style={styles.previewChip}>
                <Text style={styles.previewChipText}>{formatDisplayDate(dateKey)}</Text>
                {!isRecurring ? (
                  <TouchableOpacity
                    style={styles.previewChipRemoveButton}
                    onPress={() => onRemoveReservationDate(dateKey)}
                  >
                    <Text style={styles.previewChipRemoveText}>x</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.inputGrid}>
        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Start Time</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={onStartTimePress}>
            <View style={styles.inputWithAction}>
              <View style={[styles.filterInput, styles.filterInputWithIcon, styles.timeReadonly]}>
                <Text style={styles.timeReadonlyText}>{startTimeLabel}</Text>
              </View>
              <View style={styles.inputActionButton}>
                <ClockIcon />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>End Time</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={onEndTimePress}>
            <View style={styles.inputWithAction}>
              <View style={[styles.filterInput, styles.filterInputWithIcon, styles.timeReadonly]}>
                <Text style={styles.timeReadonlyText}>{endTimeLabel}</Text>
              </View>
              <View style={styles.inputActionButton}>
                <ClockIcon />
              </View>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        disabled={!hasActiveFilters}
        onPress={onResetFilters}
        style={[
          styles.resetButton,
          !hasActiveFilters && styles.resetButtonDisabled,
        ]}
      >
        <Text
          style={[
            styles.resetButtonText,
            !hasActiveFilters && styles.resetButtonTextDisabled,
          ]}
        >
          Reset Filters
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  filterCard: {
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 14,
  },
  filterSectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 10,
  },
  radioGroup: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  radioRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  radioRowSelected: {
    borderColor: "#e7aaaa",
    backgroundColor: "#fbf2f2",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: colors.primary,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  radioText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  toggleCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  toggleTextBlock: {
    flex: 1,
    paddingRight: 12,
  },
  toggleTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  toggleSubtitle: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 4,
  },
  weekdayCalendarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 16,
  },
  weekdayCalendarButton: {
    width: "31%",
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  weekdayCalendarButtonSelected: {
    backgroundColor: "#f9e3e3",
    borderColor: "#e7aaaa",
  },
  weekdayCalendarText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  weekdayCalendarTextSelected: {
    color: colors.primary,
  },
  inputGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  inputBlock: {
    flex: 1,
  },
  inputLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 8,
  },
  inputWithAction: {
    position: "relative",
    justifyContent: "center",
  },
  filterInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  filterInputWithIcon: {
    paddingRight: 48,
  },
  segmentedDateShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  segmentedDateInput: {
    minWidth: 28,
    paddingVertical: 0,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    textAlign: "center",
  },
  segmentedDateDivider: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginHorizontal: 0,
  },
  inputActionButton: {
    position: "absolute",
    right: 12,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarIcon: {
    width: 18,
    height: 18,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 4,
    overflow: "hidden",
  },
  calendarIconHeader: {
    height: 5,
    backgroundColor: colors.primary,
  },
  calendarIconGrid: {
    flex: 1,
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 2,
    gap: 2,
    justifyContent: "center",
  },
  calendarIconDot: {
    width: 3,
    height: 3,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  clockIcon: {
    width: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  clockFace: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  clockHandVertical: {
    position: "absolute",
    width: 1.5,
    height: 5,
    backgroundColor: colors.primary,
    top: 4,
  },
  clockHandHorizontal: {
    position: "absolute",
    width: 4,
    height: 1.5,
    backgroundColor: colors.primary,
    left: 9,
  },
  resetButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resetButtonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  resetButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  resetButtonTextDisabled: {
    color: colors.mutedText,
  },
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
  helperText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
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
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#efc3c3",
    backgroundColor: "#fbf2f2",
    padding: 14,
    marginBottom: 16,
  },
  previewTitle: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginBottom: 10,
  },
  previewChipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewChipText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  previewChipRemoveButton: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.subtleBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  previewChipRemoveText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 11,
    lineHeight: 11,
  },
  previewEmptyText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  timeReadonly: {
    justifyContent: "center",
  },
  timeReadonlyText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
});
