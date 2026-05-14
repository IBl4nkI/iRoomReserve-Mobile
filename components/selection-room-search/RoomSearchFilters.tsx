import React from "react";
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

import FilterBar from "@/components/FilterBar";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import type { FilterLevel, LevelOption } from "@/components/SelectionFilterContext";
import { colors, fonts } from "@/constants/theme";
import type { ReservationCampus } from "@/types/reservation";

const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

function formatDisplayDate(dateKey: string) {
  if (!dateKey) return dateKey;
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
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
  filterBarDefaultSelections: Partial<Record<FilterLevel, string>>;
  filterBarLevelOptions: Partial<Record<FilterLevel, LevelOption[]>>;
  filterBarSelectedByLevel: Partial<Record<FilterLevel, string | null>>;
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
  onSelectionOptionPress: (level: FilterLevel, id: string, selected: boolean) => void;
  onStartTimePress: () => void;
  onToggleCampus: (campus: ReservationCampus) => void;
  onToggleRoomType: (roomType: string) => void;
  onToggleDay: (dayOfWeek: number) => void;
  onToggleRecurring: (value: boolean) => void;
  openCalendarField: "reservationDates" | "reservationDate" | "recurringEndDate" | null;
  previewDates: string[];
  reservationDateInput: string;
  reservationDatesInput: string;
  roomTypeOptions: string[];
  selectedCampus: ReservationCampus | null;
  selectedRoomTypes: string[];
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
  const [rawMonth = "", rawDay = "", rawYear = ""] = value.split("/");
  return {
    month: rawMonth.replace(/\D/g, "").slice(0, 2),
    day: rawDay.replace(/\D/g, "").slice(0, 2),
    year: rawYear.replace(/\D/g, "").slice(0, 2),
  };
}

function joinDateValue(month: string, day: string, year: string) {
  if (!month && !day && !year) {
    return "";
  }
  return `${month}/${day}/${year}`.replace(/\/+$/, "");
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
  const { month, day, year } = splitDateValue(value);

  function updateValue(nextMonth: string, nextDay: string, nextYear: string) {
    onChange(joinDateValue(nextMonth, nextDay, nextYear));
  }

  function handleMonthChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);
    if (digits.length === 1 && Number(digits) >= 2) {
      updateValue(`0${digits}`, day, year);
      monthRef.current?.focus();
      return;
    }
    const nextMonth = digits.length === 2 ? clampTwoDigitValue(digits, 1, 12) : digits;
    updateValue(nextMonth, day, year);
    if (digits.length === 2) {
      monthRef.current?.focus();
    }
  }

  function handleDayChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);
    if (digits.length === 1 && Number(digits) > 3) {
      updateValue(month, `0${digits}`, year);
      yearRef.current?.focus();
      return;
    }
    const nextDay = digits.length === 2 ? clampTwoDigitValue(digits, 1, 31) : digits;
    updateValue(month, nextDay, year);
    if (digits.length === 2) {
      yearRef.current?.focus();
    }
  }

  function handleYearChange(rawValue: string) {
    const digits = rawValue.replace(/\D/g, "").slice(0, 2);
    const nextYear = digits.length === 2 ? clampTwoDigitValue(digits, 25, 99) : digits;
    updateValue(month, day, nextYear);
  }

  return (
    <View style={styles.inputWithAction}>
      <View style={[styles.filterInput, styles.filterInputWithIcon, styles.segmentedDateShell]}>
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
  filterBarDefaultSelections,
  filterBarLevelOptions,
  filterBarSelectedByLevel,
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
  onSelectionOptionPress,
  onStartTimePress,
  onToggleRoomType,
  onToggleDay,
  onToggleRecurring,
  openCalendarField,
  previewDates,
  reservationDateInput,
  reservationDatesInput,
  roomTypeOptions,
  selectedRoomTypes,
  selectedDays,
  startTimeLabel,
}: RoomSearchFiltersProps) {
  if (!filtersOpen) {
    return null;
  }

  return (
    <View style={styles.filterCard}>
      <Text style={styles.filterSectionTitle}>Filter by Campus, Building, and Floor:</Text>
      <View style={styles.selectionFilterBarShell}>
        <FilterBar
          defaultCampusId="main"
          defaultSelections={filterBarDefaultSelections}
          levelOptionsOverride={filterBarLevelOptions}
          onOptionPress={onSelectionOptionPress}
          selectedByLevelOverride={filterBarSelectedByLevel}
          showAllLevels
        />
      </View>

      <Text style={styles.filterSectionTitle}>Filter by Room Type:</Text>
      <View style={styles.checkboxGroup}>
        {roomTypeOptions.map((roomType) => {
          const selected = selectedRoomTypes.includes(roomType);
          return (
            <TouchableOpacity
              key={roomType}
              style={[styles.checkboxRow, selected && styles.checkboxRowSelected]}
              onPress={() => onToggleRoomType(roomType)}
            >
              <View style={[styles.checkboxBox, selected && styles.checkboxBoxSelected]}>
                {selected ? <Text style={styles.checkboxMark}>✓</Text> : null}
              </View>
              <Text style={styles.checkboxText}>{roomType}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.toggleCard}>
        <View style={styles.toggleTextBlock}>
          <Text style={styles.toggleTitle}>Recurring Reservation</Text>
          <Text style={styles.toggleSubtitle}>Book the same time slot(s) on multiple days</Text>
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
        <AvailabilityCalendar
          calendarMonthLabel={calendarMonthLabel}
          calendarWeeks={calendarWeeks}
          isCalendarDateDisabled={isCalendarDateDisabled}
          isCalendarDateSelected={isCalendarDateSelected}
          onCalendarDateSelect={onCalendarDateSelect}
          onCalendarDone={onCalendarDone}
          onNextMonth={onNextMonth}
          onPrevMonth={onPrevMonth}
          showDoneButton={openCalendarField === "reservationDates"}
        />
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
  selectionFilterBarShell: {
    marginBottom: 16,
  },
  checkboxGroup: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 10,
    rowGap: 10,
    justifyContent: "space-between",
    marginBottom: 16,
  },
  checkboxRow: {
    width: "48%",
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
  checkboxRowSelected: {
    borderColor: "#e7aaaa",
    backgroundColor: "#fbf2f2",
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxBoxSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkboxMark: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
    lineHeight: 12,
  },
  checkboxText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 10,
    flex: 1,
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
    minWidth: 24,
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
