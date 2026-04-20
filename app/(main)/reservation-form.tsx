import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import RoomTimePickerModal from "@/components/selection-room-search/RoomTimePickerModal";
import { colors, fonts } from "@/constants/theme";
import {
  CAMPUS_LABELS,
  formatFullDate,
  getRoomCampus,
  minutesToTimeString,
  timeStringToMinutes,
} from "@/lib/reservation-search";
import { db } from "@/services/firebase";
import { getRoomById } from "@/services/rooms.service";
import { formatTime12h } from "@/services/schedules.service";
import type { ReservationCampus, Room } from "@/types/reservation";
import {
  addMonths,
  formatDisplayDateShort,
  fromTimeWheelParts,
  getCalendarWeeks,
  getDefaultEndTime,
  getEndTimeOptionsForRange,
  getMonthLabel,
  getNearestTimeOption,
  getSelectedTimeRange,
  getTimeWheelHoursForPeriod,
  getTimeWheelMinutesForHour,
  getTimeWheelPeriods,
  parseEditableDateInput,
  TIME_MINUTE_OPTIONS,
  TIME_PERIOD_OPTIONS,
  TIME_WHEEL_ITEM_HEIGHT,
  toDateKey,
  toTimeWheelParts,
} from "@/components/selection-room-search/helpers";

interface SelectedTimeslotParam {
  dateKey: string;
  endTime: string;
  startTime: string;
  state: "available" | "pending";
}

type MaterialKey =
  | "fans"
  | "speakersWithMicrophones"
  | "televisions"
  | "cables"
  | "chairs"
  | "tables";

type EmailStatus = "idle" | "checking" | "invalid" | "valid";

const MATERIAL_ITEMS: Array<{ key: MaterialKey; label: string }> = [
  { key: "fans", label: "Fans" },
  { key: "speakersWithMicrophones", label: "Speakers with Microphones" },
  { key: "televisions", label: "Televisions" },
  { key: "cables", label: "Cables" },
  { key: "chairs", label: "Chairs" },
  { key: "tables", label: "Tables" },
];
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const WEEKDAY_LABELS: Record<(typeof WEEKDAY_OPTIONS)[number], string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
};

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
      <View style={[styles.fieldInput, styles.fieldInputWithIcon, styles.segmentedDateShell]}>
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

function buildDateInputValue(dateKey?: string) {
  return dateKey ? formatDisplayDateShort(dateKey) : "";
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ReservationFormScreen() {
  const router = useRouter();
  const {
    roomId,
    roomName,
    selection,
    selectedTimeslots,
    timeslot,
  } = useLocalSearchParams<{
    roomId?: string;
    roomName?: string;
    selection?: string;
    selectedTimeslots?: string;
    timeslot?: string;
  }>();
  const resolvedRoomId = String(roomId ?? "");
  const [room, setRoom] = React.useState<Room | null>(null);

  const parsedTimeslots: SelectedTimeslotParam[] = React.useMemo(() => {
    if (!selectedTimeslots) {
      return [];
    }

    try {
      const parsedValue = JSON.parse(String(selectedTimeslots));
      return Array.isArray(parsedValue) ? parsedValue : [];
    } catch {
      return [];
    }
  }, [selectedTimeslots]);

  React.useEffect(() => {
    let active = true;

    if (!resolvedRoomId) {
      return () => {
        active = false;
      };
    }

    getRoomById(resolvedRoomId)
      .then((roomResult) => {
        if (active) {
          setRoom(roomResult);
        }
      })
      .catch(() => {
        if (active) {
          setRoom(null);
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedRoomId]);

  const initialSlot = parsedTimeslots[0];
  const selectedCampus = room ? getRoomCampus(room) : null;
  const startMinutes = selectedCampus
    ? getSelectedTimeRange(selectedCampus).startMinutes
    : 7 * 60;
  const endMinutes = selectedCampus
    ? getSelectedTimeRange(selectedCampus).endMinutes
    : 21 * 60;
  const baseTimeOptions = React.useMemo(() => {
    const options: string[] = [];

    for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
      options.push(minutesToTimeString(minutes));
    }

    return options;
  }, [endMinutes, startMinutes]);

  const [reservationDateInput, setReservationDateInput] = React.useState(
    buildDateInputValue(initialSlot?.dateKey)
  );
  const [reservationDateKey, setReservationDateKey] = React.useState(initialSlot?.dateKey ?? "");
  const [recurringEndDateInput, setRecurringEndDateInput] = React.useState(
    buildDateInputValue(initialSlot?.dateKey)
  );
  const [recurringEndDateKey, setRecurringEndDateKey] = React.useState(
    initialSlot?.dateKey ?? ""
  );
  const [calendarMonth, setCalendarMonth] = React.useState(
    initialSlot?.dateKey ? new Date(`${initialSlot.dateKey}T00:00:00`) : new Date()
  );
  const [openCalendarField, setOpenCalendarField] = React.useState<
    "reservation" | "recurringEnd" | null
  >(null);
  const [openTimeField, setOpenTimeField] = React.useState<"start" | "end" | null>(null);
  const [isRecurring, setIsRecurring] = React.useState(false);
  const [selectedDays, setSelectedDays] = React.useState<number[]>([]);
  const [startTime, setStartTime] = React.useState(initialSlot?.startTime ?? "07:00");
  const [endTime, setEndTime] = React.useState(
    initialSlot?.endTime ?? getDefaultEndTime(selectedCampus)
  );
  const [organization, setOrganization] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [adviserEmail, setAdviserEmail] = React.useState("");
  const [emailStatus, setEmailStatus] = React.useState<EmailStatus>("idle");
  const [emailFeedback, setEmailFeedback] = React.useState("");
  const [materials, setMaterials] = React.useState<Record<MaterialKey, number>>({
    fans: 0,
    speakersWithMicrophones: 0,
    televisions: 0,
    cables: 0,
    chairs: 0,
    tables: 0,
  });

  const endTimeOptions = React.useMemo(
    () =>
      getEndTimeOptionsForRange(
        selectedCampus,
        startTime,
        minutesToTimeString,
        timeStringToMinutes
      ),
    [selectedCampus, startTime]
  );

  React.useEffect(() => {
    if (!endTimeOptions.includes(endTime)) {
      setEndTime(endTimeOptions[0] ?? endTime);
    }
  }, [endTime, endTimeOptions]);

  const startTimeParts = React.useMemo(() => toTimeWheelParts(startTime), [startTime]);
  const endTimeParts = React.useMemo(() => toTimeWheelParts(endTime), [endTime]);
  const activeTimeOptions = openTimeField === "start" ? baseTimeOptions : endTimeOptions;
  const activeTimeParts = openTimeField === "start" ? startTimeParts : endTimeParts;
  const timeWheelPeriods = React.useMemo(
    () => getTimeWheelPeriods(activeTimeOptions),
    [activeTimeOptions]
  );
  const timeWheelHoursForPeriod = React.useMemo(
    () =>
      getTimeWheelHoursForPeriod(
        activeTimeOptions,
        timeWheelPeriods.includes(activeTimeParts.period)
          ? activeTimeParts.period
          : timeWheelPeriods[0] ?? "AM"
      ),
    [activeTimeOptions, activeTimeParts.period, timeWheelPeriods]
  );
  const timeWheelMinutesForHour = React.useMemo(
    () =>
      getTimeWheelMinutesForHour(
        activeTimeOptions,
        timeWheelPeriods.includes(activeTimeParts.period)
          ? activeTimeParts.period
          : timeWheelPeriods[0] ?? "AM",
        timeWheelHoursForPeriod.includes(activeTimeParts.hour)
          ? activeTimeParts.hour
          : timeWheelHoursForPeriod[0] ?? activeTimeParts.hour
      ),
    [activeTimeOptions, activeTimeParts.hour, activeTimeParts.period, timeWheelHoursForPeriod, timeWheelPeriods]
  );
  const calendarWeeks = React.useMemo(() => getCalendarWeeks(calendarMonth), [calendarMonth]);
  const scheduledDatesLabel = React.useMemo(() => {
    if (parsedTimeslots.length === 0) {
      return selection ?? "";
    }

    return [...new Set(parsedTimeslots.map((slot) => slot.dateKey))]
      .map((dateKey) => formatFullDate(new Date(`${dateKey}T00:00:00`)))
      .join(", ");
  }, [parsedTimeslots, selection]);
  const scheduledTimeslotsLabel = React.useMemo(() => {
    if (parsedTimeslots.length === 0) {
      return timeslot ?? "";
    }

    return parsedTimeslots
      .map((slot) => `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`)
      .join(" | ");
  }, [parsedTimeslots, timeslot]);

  function handleReservationDateBlur() {
    const parsedDate = parseEditableDateInput(reservationDateInput);

    if (!parsedDate) {
      return;
    }

    setReservationDateKey(parsedDate);
    setReservationDateInput(buildDateInputValue(parsedDate));
    setCalendarMonth(new Date(`${parsedDate}T00:00:00`));
  }

  function handleRecurringEndDateBlur() {
    const parsedDate = parseEditableDateInput(recurringEndDateInput);

    if (!parsedDate) {
      return;
    }

    const nextDateKey =
      reservationDateKey && parsedDate < reservationDateKey ? reservationDateKey : parsedDate;
    setRecurringEndDateKey(nextDateKey);
    setRecurringEndDateInput(buildDateInputValue(nextDateKey));
    setCalendarMonth(new Date(`${nextDateKey}T00:00:00`));
  }

  function toggleSelectedDay(dayOfWeek: number) {
    setSelectedDays((currentValue) =>
      currentValue.includes(dayOfWeek)
        ? currentValue.filter((value) => value !== dayOfWeek)
        : [...currentValue, dayOfWeek].sort((left, right) => left - right)
    );
  }

  function applyTimeValue(field: "start" | "end", value: string) {
    if (field === "start") {
      const nextStartTime = getNearestTimeOption(
        baseTimeOptions,
        value,
        timeStringToMinutes
      );

      setStartTime(nextStartTime);
      setEndTime((currentValue) =>
        getNearestTimeOption(
          getEndTimeOptionsForRange(
            selectedCampus,
            nextStartTime,
            minutesToTimeString,
            timeStringToMinutes
          ),
          currentValue,
          timeStringToMinutes
        )
      );
      return;
    }

    setEndTime(getNearestTimeOption(endTimeOptions, value, timeStringToMinutes));
  }

  function updateTimeFromPicker(
    field: "start" | "end",
    parts: Partial<{ hour: string; minute: string; period: string }>
  ) {
    const currentParts = toTimeWheelParts(field === "start" ? startTime : endTime);
    const fieldOptions = field === "start" ? baseTimeOptions : endTimeOptions;
    const nextPeriod = (parts.period ?? currentParts.period) as (typeof TIME_PERIOD_OPTIONS)[number];
    const validHours = getTimeWheelHoursForPeriod(fieldOptions, nextPeriod);
    const nextHour =
      parts.hour ??
      (validHours.includes(currentParts.hour) ? currentParts.hour : validHours[0] ?? currentParts.hour);
    const normalizedHour =
      validHours.includes(nextHour) ? nextHour : validHours[0] ?? nextHour;
    const validMinutes = getTimeWheelMinutesForHour(fieldOptions, nextPeriod, normalizedHour);
    const requestedMinute = (parts.minute ?? currentParts.minute) as (typeof TIME_MINUTE_OPTIONS)[number];
    const nextMinute =
      validMinutes.includes(requestedMinute)
        ? requestedMinute
        : validMinutes[0] ?? currentParts.minute;

    applyTimeValue(
      field,
      fromTimeWheelParts(normalizedHour, nextMinute, nextPeriod)
    );
  }

  function handleTimeWheelScroll(
    field: "start" | "end",
    wheel: "hour" | "minute" | "period",
    offsetY: number
  ) {
    if (wheel === "hour") {
      const index = Math.max(
        0,
        Math.min(timeWheelHoursForPeriod.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      const nextHour = timeWheelHoursForPeriod[index];

      if (nextHour) {
        updateTimeFromPicker(field, { hour: nextHour });
      }
      return;
    }

    if (wheel === "minute") {
      const index = Math.max(
        0,
        Math.min(timeWheelMinutesForHour.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      const nextMinute = timeWheelMinutesForHour[index];

      if (nextMinute) {
        updateTimeFromPicker(field, { minute: nextMinute });
      }
      return;
    }

    const index = Math.max(
      0,
      Math.min(timeWheelPeriods.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
    );
    const nextPeriod = timeWheelPeriods[index];

    if (nextPeriod) {
      updateTimeFromPicker(field, { period: nextPeriod });
    }
  }

  function updateMaterialQuantity(key: MaterialKey, nextValue: number) {
    setMaterials((currentValue) => ({
      ...currentValue,
      [key]: Math.max(0, nextValue),
    }));
  }

  async function validateAdviserEmail() {
    const trimmedEmail = adviserEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailStatus("idle");
      setEmailFeedback("");
      return;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailStatus("invalid");
      setEmailFeedback("Please enter a valid email address.");
      return;
    }

    setEmailStatus("checking");
    setEmailFeedback("");

    try {
      const usersQuery = query(
        collection(db, "users"),
        where("email", "==", trimmedEmail),
        limit(1)
      );
      const snapshot = await getDocs(usersQuery);

      if (snapshot.empty) {
        setEmailStatus("invalid");
        setEmailFeedback("No iRoomReserve account matches this email.");
        return;
      }

      setEmailStatus("valid");
      setEmailFeedback("Email found in iRoomReserve.");
    } catch {
      setEmailStatus("invalid");
      setEmailFeedback("Unable to verify the email right now.");
    }
  }

  return (
    <SelectionScreenLayout
      title="Reservation Form"
      subtitle="Review and complete your reservation details."
      onBackPress={() => router.back()}
    >
      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Room Details</Text>
        <View style={styles.roomSummaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Room Name</Text>
            <Text style={styles.summaryValue}>{room?.name ?? roomName ?? "Selected Room"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Campus</Text>
            <Text style={styles.summaryValue}>
              {selectedCampus ? CAMPUS_LABELS[selectedCampus] : ""}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Floor</Text>
            <Text style={styles.summaryValue}>{room?.floor ?? ""}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type</Text>
            <Text style={styles.summaryValue}>{room?.roomType ?? ""}</Text>
          </View>
        </View>

        <Text style={styles.selectionText}>
          Scheduled Date(s): {scheduledDatesLabel || "-"}
        </Text>
        <Text style={styles.selectionText}>
          Timeslot(s): {scheduledTimeslotsLabel || "-"}
        </Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionTitle}>Reservation Schedule</Text>

        <View style={styles.toggleCard}>
          <View style={styles.toggleTextBlock}>
            <Text style={styles.toggleTitle}>Recurring Reservation</Text>
            <Text style={styles.toggleSubtitle}>
              Book the same time slot on multiple days
            </Text>
          </View>
          <Switch
            value={isRecurring}
            onValueChange={setIsRecurring}
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
                    onPress={() => toggleSelectedDay(dayOfWeek)}
                  >
                    <Text
                      style={[
                        styles.weekdayCalendarText,
                        selected && styles.weekdayCalendarTextSelected,
                      ]}
                    >
                      {WEEKDAY_LABELS[dayOfWeek]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        ) : null}

        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>{isRecurring ? "Start Date" : "Reservation Date"}</Text>
          <SegmentedDateInput
            onBlur={handleReservationDateBlur}
            onCalendarPress={() =>
              setOpenCalendarField((currentValue) =>
                currentValue === "reservation" ? null : "reservation"
              )
            }
            onChange={setReservationDateInput}
            value={reservationDateInput}
          />
        </View>

        {isRecurring ? (
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>End Date</Text>
            <SegmentedDateInput
              onBlur={handleRecurringEndDateBlur}
              onCalendarPress={() =>
                setOpenCalendarField((currentValue) =>
                  currentValue === "recurringEnd" ? null : "recurringEnd"
                )
              }
              onChange={setRecurringEndDateInput}
              value={recurringEndDateInput}
            />
          </View>
        ) : null}

        {openCalendarField ? (
          <View style={styles.calendarCard}>
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth((currentValue) => addMonths(currentValue, -1))}
              >
                <Text style={styles.calendarNavText}>{"<"}</Text>
              </TouchableOpacity>
              <Text style={styles.calendarTitle}>{getMonthLabel(calendarMonth)}</Text>
              <TouchableOpacity
                style={styles.calendarNavButton}
                onPress={() => setCalendarMonth((currentValue) => addMonths(currentValue, 1))}
              >
                <Text style={styles.calendarNavText}>{">"}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
                <Text key={label} style={styles.calendarWeekLabel}>
                  {label}
                </Text>
              ))}
            </View>

            {calendarWeeks.map((week, weekIndex) => (
              <View key={`${calendarMonth.toISOString()}-${weekIndex}`} style={styles.calendarWeekRow}>
                {week.map((entry) => {
                  const dateKey = toDateKey(entry.date);
                  const disabled = entry.date.getDay() === 0;
                  const selected =
                    openCalendarField === "reservation"
                      ? reservationDateKey === dateKey
                      : recurringEndDateKey === dateKey;

                  return (
                    <TouchableOpacity
                      key={dateKey}
                      disabled={disabled}
                      style={[
                        styles.calendarDateButton,
                        selected && styles.calendarDateButtonSelected,
                        disabled && styles.calendarDateButtonDisabled,
                      ]}
                      onPress={() => {
                        if (openCalendarField === "reservation") {
                          setReservationDateKey(dateKey);
                          setReservationDateInput(buildDateInputValue(dateKey));

                          if (isRecurring && recurringEndDateKey && recurringEndDateKey < dateKey) {
                            setRecurringEndDateKey(dateKey);
                            setRecurringEndDateInput(buildDateInputValue(dateKey));
                          }
                        } else {
                          const nextDateKey =
                            reservationDateKey && dateKey < reservationDateKey
                              ? reservationDateKey
                              : dateKey;
                          setRecurringEndDateKey(nextDateKey);
                          setRecurringEndDateInput(buildDateInputValue(nextDateKey));
                        }

                        setOpenCalendarField(null);
                      }}
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
              The date and time are prefilled from your selected timeslot and can still be changed.
            </Text>
          </View>
        ) : null}

        <View style={styles.inputGrid}>
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Start Time</Text>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setOpenTimeField("start")}>
              <View style={styles.inputWithAction}>
                <View style={[styles.fieldInput, styles.fieldInputWithIcon, styles.timeReadonly]}>
                  <Text style={styles.timeReadonlyText}>{formatTime12h(startTime)}</Text>
                </View>
                <View style={styles.inputActionButton}>
                  <ClockIcon />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>End Time</Text>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setOpenTimeField("end")}>
              <View style={styles.inputWithAction}>
                <View style={[styles.fieldInput, styles.fieldInputWithIcon, styles.timeReadonly]}>
                  <Text style={styles.timeReadonlyText}>{formatTime12h(endTime)}</Text>
                </View>
                <View style={styles.inputActionButton}>
                  <ClockIcon />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {parsedTimeslots.length > 0 ? (
          <View style={styles.selectedTimeslotsCard}>
            <Text style={styles.selectedTimeslotsTitle}>Selected Timeslots</Text>
            {parsedTimeslots.map((slot) => (
              <Text
                key={`${slot.dateKey}-${slot.startTime}-${slot.endTime}`}
                style={styles.selectedTimeslotItem}
              >
                {formatTime12h(slot.startTime)} - {formatTime12h(slot.endTime)}
              </Text>
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.sectionCard}>
        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Program / Department / Organization</Text>
          <TextInput
            onChangeText={setOrganization}
            placeholder="Enter your program, department, or organization"
            placeholderTextColor={colors.mutedText}
            style={styles.textInput}
            value={organization}
          />
        </View>

        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Purpose</Text>
          <TextInput
            multiline
            onChangeText={setPurpose}
            placeholder="Enter the purpose of this facility reservation"
            placeholderTextColor={colors.mutedText}
            style={[styles.textInput, styles.multilineInput]}
            textAlignVertical="top"
            value={purpose}
          />
        </View>

        <Text style={styles.sectionTitle}>Materials / Equipment</Text>
        <View style={styles.materialsList}>
          {MATERIAL_ITEMS.map((item) => (
            <View key={item.key} style={styles.materialRow}>
              <Text style={styles.materialLabel}>{item.label}</Text>
              <View style={styles.quantityControl}>
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateMaterialQuantity(item.key, materials[item.key] - 1)}
                >
                  <Text style={styles.quantityButtonText}>-</Text>
                </TouchableOpacity>
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) =>
                    updateMaterialQuantity(item.key, Number(value.replace(/\D/g, "")) || 0)
                  }
                  style={styles.quantityInput}
                  value={String(materials[item.key])}
                />
                <TouchableOpacity
                  style={styles.quantityButton}
                  onPress={() => updateMaterialQuantity(item.key, materials[item.key] + 1)}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.inputBlock}>
          <Text style={styles.inputLabel}>Email of Adviser / Department Head / Professor</Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onBlur={validateAdviserEmail}
            onChangeText={(value) => {
              setAdviserEmail(value);
              setEmailStatus("idle");
              setEmailFeedback("");
            }}
            placeholder="Input email of adviser / department head / professor"
            placeholderTextColor={colors.mutedText}
            style={[
              styles.textInput,
              emailStatus === "invalid" && styles.textInputInvalid,
              emailStatus === "valid" && styles.textInputValid,
            ]}
            value={adviserEmail}
          />
          {emailStatus === "checking" ? (
            <View style={styles.emailStatusRow}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.emailCheckingText}>Checking iRoomReserve account...</Text>
            </View>
          ) : emailFeedback ? (
            <Text
              style={[
                styles.emailFeedbackText,
                emailStatus === "valid" ? styles.emailFeedbackSuccess : styles.emailFeedbackError,
              ]}
            >
              {emailFeedback}
            </Text>
          ) : null}
        </View>
      </View>

      <TouchableOpacity activeOpacity={0.9} style={styles.submitButton}>
        <Text style={styles.submitButtonText}>Submit Reservation</Text>
      </TouchableOpacity>

      <RoomTimePickerModal
        endTime={endTime}
        endTimeParts={endTimeParts}
        hourOptions={timeWheelHoursForPeriod}
        minuteOptions={timeWheelMinutesForHour}
        onClose={() => setOpenTimeField(null)}
        onTimeWheelScroll={handleTimeWheelScroll}
        openTimeField={openTimeField}
        periodOptions={timeWheelPeriods}
        selectedCampus={selectedCampus}
        startTime={startTime}
        startTimeParts={startTimeParts}
      />
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 14,
    marginBottom: 14,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 12,
  },
  roomSummaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    gap: 10,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  summaryLabel: {
    color: colors.secondary,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  summaryValue: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    flexShrink: 1,
    textAlign: "right",
  },
  selectionText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 10,
  },
  inputGrid: {
    flexDirection: "row",
    gap: 12,
  },
  inputBlock: {
    marginBottom: 16,
    flex: 1,
  },
  inputLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 8,
  },
  textInput: {
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
  multilineInput: {
    minHeight: 96,
  },
  fieldInput: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  fieldInputWithIcon: {
    flex: 1,
    paddingRight: 48,
  },
  inputWithAction: {
    position: "relative",
    justifyContent: "center",
  },
  inputActionButton: {
    position: "absolute",
    right: 0,
    width: 48,
    height: 48,
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentedDateShell: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
  },
  segmentedDateInput: {
    minWidth: 28,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 0,
  },
  segmentedDateDivider: {
    color: colors.mutedText,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginHorizontal: 4,
  },
  timeReadonly: {
    justifyContent: "center",
  },
  timeReadonlyText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  calendarCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 12,
    marginBottom: 16,
  },
  calendarHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  calendarNavButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleBackground,
  },
  calendarNavText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  calendarTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
  },
  calendarWeekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  calendarWeekLabel: {
    width: "16%",
    textAlign: "center",
    color: colors.mutedText,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  calendarDateButton: {
    width: "16%",
    aspectRatio: 1,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarDateButtonSelected: {
    backgroundColor: colors.primary,
  },
  calendarDateButtonDisabled: {
    backgroundColor: colors.subtleBackground,
  },
  calendarDateText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  calendarDateTextMuted: {
    color: colors.mutedText,
  },
  calendarDateTextSelected: {
    color: colors.white,
    fontFamily: fonts.bold,
  },
  calendarDateTextDisabled: {
    color: colors.border,
  },
  helperText: {
    marginTop: 8,
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  selectedTimeslotsCard: {
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  selectedTimeslotsTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    marginBottom: 8,
  },
  selectedTimeslotItem: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  toggleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  toggleTextBlock: {
    flex: 1,
  },
  toggleTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 14,
    marginBottom: 2,
  },
  toggleSubtitle: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  filterSectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginBottom: 10,
  },
  weekdayCalendarRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  weekdayCalendarButton: {
    minWidth: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  weekdayCalendarButtonSelected: {
    borderColor: "#e7aaaa",
    backgroundColor: "#fbf2f2",
  },
  weekdayCalendarText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  weekdayCalendarTextSelected: {
    color: colors.primary,
  },
  materialsList: {
    gap: 10,
    marginBottom: 16,
  },
  materialRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  materialLabel: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    flex: 1,
  },
  quantityControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  quantityButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    alignItems: "center",
    justifyContent: "center",
  },
  quantityButtonText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 18,
    lineHeight: 18,
  },
  quantityInput: {
    width: 48,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 0,
  },
  textInputInvalid: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
  },
  textInputValid: {
    borderColor: colors.successBorder,
    backgroundColor: colors.successBackground,
  },
  emailStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  emailCheckingText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  emailFeedbackText: {
    marginTop: 8,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  emailFeedbackError: {
    color: colors.dangerText,
  },
  emailFeedbackSuccess: {
    color: colors.successText,
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  calendarIcon: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.primary,
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
  },
  calendarIconDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
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
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  clockHandVertical: {
    width: 1.5,
    height: 6,
    backgroundColor: colors.primary,
    borderRadius: 1,
    marginBottom: 1,
  },
  clockHandHorizontal: {
    position: "absolute",
    width: 5,
    height: 1.5,
    backgroundColor: colors.primary,
    borderRadius: 1,
    marginLeft: 4,
  },
});
