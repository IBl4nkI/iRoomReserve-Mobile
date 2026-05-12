import React from "react";
import {
  Alert,
  ActivityIndicator,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";

import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { useToast } from "@/components/ToastProvider";
import WeeklyScheduleGrid from "@/components/WeeklyScheduleGrid";
import RoomTimePickerModal from "@/components/selection-room-search/RoomTimePickerModal";
import { colors, fonts } from "@/constants/theme";
import { getUserProfile } from "@/lib/auth";
import {
  CAMPUS_LABELS,
  formatFullDate,
  getRoomCampus,
  minutesToTimeString,
  timeStringToMinutes,
  type TimeSlotViewModel,
} from "@/lib/reservation-search";
import { auth } from "@/services/firebase";
import { apiRequest } from "@/services/api";
import { uploadReservationDocument } from "@/services/reservation-documents.service";
import {
  createRecurringReservation,
  createReservation,
} from "@/services/reservations.service";
import { getRoomById } from "@/services/rooms.service";
import { formatTime12h, getSchedulesByRoomId } from "@/services/schedules.service";
import type { ReservationCampus, Room, Schedule } from "@/types/reservation";
import {
  addMonths,
  applySelectedTimeslotPress,
  collapseSelectedTimeslots,
  formatDisplayDateShort,
  fromTimeWheelParts,
  getCalendarWeeks,
  getDefaultEndTime,
  getEndTimeOptionsForRange,
  getMonthLabel,
  getNearestTimeOption,
  getSelectedTimeslotKey,
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
  | "chairs"
  | "tables";

type EmailStatus = "idle" | "checking" | "invalid" | "valid";

interface ReservationAttachment {
  mimeType: string;
  name: string;
  size: number;
  uri: string;
}

interface UserProfileSummary {
  email: string;
  firstName: string;
  lastName: string;
  role?: string;
  status?: string;
}

const MATERIAL_ITEMS: Array<{ key: MaterialKey; label: string }> = [
  { key: "fans", label: "Electric Fans" },
  { key: "speakersWithMicrophones", label: "Speakers with Microphones" },
  { key: "televisions", label: "Extra Televisions" },
  { key: "chairs", label: "Extra Chairs" },
  { key: "tables", label: "Extra Tables" },
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
const DIGITAL_CAMPUS_BUILDING_ADMIN_EMAIL = "kenjimwill.baltero@sdca.edu.ph";
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

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

    if (digits.length === 1) {
      const digit = Number(digits);

      if (digit >= 2) {
        updateValue(`0${digits}`, day, year);
        monthRef.current?.focus();
        return;
      }
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
      <View style={[styles.fieldInput, styles.fieldInputWithIcon, styles.segmentedDateShell]}>
        <TextInput
          keyboardType="number-pad"
          maxLength={2}
          onBlur={onBlur}
          onChangeText={handleMonthChange}
          placeholder="MM"
          placeholderTextColor={colors.mutedText}
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
          ref={monthRef}
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

function buildDateInputValue(dateKey?: string) {
  return dateKey ? formatDisplayDateShort(dateKey) : "";
}

function getEffectiveDateKey(inputValue: string, fallbackDateKey: string) {
  return parseEditableDateInput(inputValue) ?? fallbackDateKey;
}

function getWeekOffsetForDate(dateKey: string) {
  const today = new Date();
  const currentWeekStart = new Date(today);
  const currentDay = currentWeekStart.getDay();
  const currentWeekDifference = currentDay === 0 ? -6 : 1 - currentDay;
  currentWeekStart.setDate(currentWeekStart.getDate() + currentWeekDifference);
  currentWeekStart.setHours(0, 0, 0, 0);

  const targetDate = new Date(`${dateKey}T00:00:00`);
  const targetWeekStart = new Date(targetDate);
  const targetDay = targetWeekStart.getDay();
  const targetWeekDifference = targetDay === 0 ? -6 : 1 - targetDay;
  targetWeekStart.setDate(targetWeekStart.getDate() + targetWeekDifference);
  targetWeekStart.setHours(0, 0, 0, 0);

  const millisecondsPerWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.round(
    (targetWeekStart.getTime() - currentWeekStart.getTime()) / millisecondsPerWeek
  );
}

function expandSelectedTimeslots(
  slots: SelectedTimeslotParam[]
): SelectedTimeslotParam[] {
  return slots.flatMap((slot) => {
    const expandedSlots: SelectedTimeslotParam[] = [];
    let currentMinutes = timeStringToMinutes(slot.startTime);
    const endMinutes = timeStringToMinutes(slot.endTime);

    while (currentMinutes < endMinutes) {
      const nextMinutes = currentMinutes + 60;

      expandedSlots.push({
        dateKey: slot.dateKey,
        startTime: minutesToTimeString(currentMinutes),
        endTime: minutesToTimeString(nextMinutes),
        state: slot.state,
      });

      currentMinutes = nextMinutes;
    }

    return expandedSlots;
  });
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatFileSize(size: number) {
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export default function ReservationFormScreen() {
  const router = useRouter();
  const { showToast } = useToast();
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
  const [schedules, setSchedules] = React.useState<Schedule[]>([]);

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
  const [selectedScheduleSlots, setSelectedScheduleSlots] = React.useState<
    SelectedTimeslotParam[]
  >(expandSelectedTimeslots(parsedTimeslots));
  const [isEditingSelectedSchedule, setIsEditingSelectedSchedule] = React.useState(false);
  const [scheduleWeekOffset, setScheduleWeekOffset] = React.useState(0);

  React.useEffect(() => {
    setSelectedScheduleSlots(expandSelectedTimeslots(parsedTimeslots));
  }, [parsedTimeslots]);

  React.useEffect(() => {
    let active = true;

    if (!resolvedRoomId) {
      return () => {
        active = false;
      };
    }

    Promise.all([getRoomById(resolvedRoomId), getSchedulesByRoomId(resolvedRoomId)])
      .then(([roomResult, scheduleResults]) => {
        if (active) {
          setRoom(roomResult);
          setSchedules(scheduleResults);
        }
      })
      .catch(() => {
        if (active) {
          setRoom(null);
          setSchedules([]);
        }
      });

    return () => {
      active = false;
    };
  }, [resolvedRoomId]);

  React.useEffect(() => {
    let active = true;
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setUserProfile(null);
      return () => {
        active = false;
      };
    }

    getUserProfile(currentUser.uid)
      .then((profile) => {
        if (active) {
          setUserProfile(profile);
        }
      })
      .catch(() => {
        if (active) {
          setUserProfile(null);
        }
      });

    return () => {
      active = false;
    };
  }, []);

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
    chairs: 0,
    tables: 0,
  });
  const [attachment, setAttachment] = React.useState<ReservationAttachment | null>(null);
  const [attachmentError, setAttachmentError] = React.useState("");
  const [submittingReservation, setSubmittingReservation] = React.useState(false);
  const [userProfile, setUserProfile] = React.useState<UserProfileSummary | null>(null);

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
  const selectedScheduleSlotKeys = React.useMemo(
    () => selectedScheduleSlots.map((slot) => getSelectedTimeslotKey(slot)),
    [selectedScheduleSlots]
  );
  const effectiveReservationDateKey = React.useMemo(
    () => getEffectiveDateKey(reservationDateInput, reservationDateKey),
    [reservationDateInput, reservationDateKey]
  );
  const effectiveRecurringEndDateKey = React.useMemo(() => {
    const parsedEndDateKey = getEffectiveDateKey(recurringEndDateInput, recurringEndDateKey);

    if (
      effectiveReservationDateKey &&
      parsedEndDateKey &&
      parsedEndDateKey < effectiveReservationDateKey
    ) {
      return effectiveReservationDateKey;
    }

    return parsedEndDateKey;
  }, [effectiveReservationDateKey, recurringEndDateInput, recurringEndDateKey]);
  const scheduledEntries = React.useMemo(() => {
    if (isRecurring) {
      if (
        !effectiveReservationDateKey ||
        !effectiveRecurringEndDateKey ||
        !startTime ||
        !endTime ||
        selectedDays.length === 0
      ) {
        return [];
      }

      const recurringEntries: string[] = [];
      const currentDate = new Date(`${effectiveReservationDateKey}T00:00:00`);
      const endDate = new Date(`${effectiveRecurringEndDateKey}T00:00:00`);

      while (currentDate <= endDate) {
        if (selectedDays.includes(currentDate.getDay() as (typeof WEEKDAY_OPTIONS)[number])) {
          recurringEntries.push(
            `${formatFullDate(currentDate)} | ${formatTime12h(startTime)} - ${formatTime12h(
              endTime
            )}`
          );
        }

        currentDate.setDate(currentDate.getDate() + 1);
      }

      return recurringEntries;
    }

    if (selectedScheduleSlots.length > 0) {
      return collapseSelectedTimeslots(selectedScheduleSlots).map(
        (slot) =>
          `${formatFullDate(new Date(`${slot.dateKey}T00:00:00`))} | ${formatTime12h(
            slot.startTime
          )} - ${formatTime12h(slot.endTime)}`
      );
    }

    if (selection && timeslot) {
      return [`${selection} | ${timeslot}`];
    }

    if (selection) {
      return [selection];
    }

    if (timeslot) {
      return [timeslot];
    }

    return [];
  }, [
    effectiveRecurringEndDateKey,
    effectiveReservationDateKey,
    endTime,
    isRecurring,
    selectedDays,
    selectedScheduleSlots,
    selection,
    startTime,
    timeslot,
  ]);
  const userRole = userProfile?.role?.trim() ?? "";
  const isStudentUser = userRole === "Student";

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

  function openAlternativeRooms(dateKey: string, slot: Pick<TimeSlotViewModel, "startTime" | "endTime">) {
    router.push({
      pathname: "/(main)/alternative-rooms",
      params: {
        roomId: resolvedRoomId,
        roomName: room?.name ?? roomName ?? "Selected Room",
        selection: formatFullDate(new Date(`${dateKey}T00:00:00`)),
        timeslot: `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`,
      },
    });
  }

  function handleScheduleSlotPress(
    dateKey: string,
    slot: TimeSlotViewModel
  ) {
    if (slot.state === "unavailable") {
      if (slot.unavailableReason === "user_conflict") {
        Alert.alert(
          "Existing Reservation",
          "You already have a reservation request for this same timeslot. Press OK to remove or change that reservation first.",
          [{ text: "OK" }]
        );
        return;
      }

      Alert.alert(
        "Room Unavailable",
        "This room is unavailable. Would you like to see alternative rooms that are available for this timeslot?",
        [
          { style: "cancel", text: "No" },
          {
            text: "Yes",
            onPress: () => openAlternativeRooms(dateKey, slot),
          },
        ]
      );
      return;
    }

    const nextSlot: SelectedTimeslotParam = {
      dateKey,
      endTime: slot.endTime,
      startTime: slot.startTime,
      state: slot.state,
    };
    setSelectedScheduleSlots((currentValue) => {
      return applySelectedTimeslotPress(currentValue, nextSlot);
    });
  }

  function handleEditSelectedSchedulePress() {
    const firstSelectedSlot = selectedScheduleSlots
      .slice()
      .sort(
        (left, right) =>
          left.dateKey.localeCompare(right.dateKey) ||
          left.startTime.localeCompare(right.startTime)
      )[0];

    if (firstSelectedSlot) {
      setScheduleWeekOffset(Math.max(0, getWeekOffsetForDate(firstSelectedSlot.dateKey)));
    }

    setIsEditingSelectedSchedule((currentValue) => !currentValue);
  }

  async function validateAdviserEmail() {
    const trimmedEmail = adviserEmail.trim().toLowerCase();

    if (!trimmedEmail) {
      setEmailStatus("idle");
      setEmailFeedback("");
      return false;
    }

    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      setEmailStatus("invalid");
      setEmailFeedback("Please enter a valid email address.");
      return false;
    }

    setEmailStatus("checking");
    setEmailFeedback("");

    try {
      await apiRequest<{ email: string; ok: true }>(
        "/api/reservation-approvers/validate",
        {
          method: "POST",
          body: {
            campus: "main",
            email: trimmedEmail,
          },
        }
      );

      setEmailStatus("valid");
      setEmailFeedback("Email found in iRoomReserve.");
      return true;
    } catch (error) {
      setEmailStatus("invalid");
      setEmailFeedback(
        error instanceof Error
          ? error.message
          : "Unable to verify the email right now."
      );
      return false;
    }
  }

  async function handlePickAttachment() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        copyToCacheDirectory: true,
        multiple: false,
        type: ["application/pdf", "image/jpeg", "image/png"],
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const [asset] = result.assets;
      const mimeType = asset.mimeType ?? "";
      const fileSize = asset.size ?? 0;

      if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
        setAttachment(null);
        setAttachmentError("Only PDF, JPG, and PNG files are allowed.");
        return;
      }

      if (!fileSize || fileSize > MAX_ATTACHMENT_SIZE_BYTES) {
        setAttachment(null);
        setAttachmentError("The selected file must be 10 MB or smaller.");
        return;
      }

      setAttachment({
        mimeType,
        name: asset.name,
        size: fileSize,
        uri: asset.uri,
      });
      setAttachmentError("");
    } catch {
      setAttachmentError("Unable to open the file picker right now.");
    }
  }

  function handleRemoveAttachment() {
    setAttachment(null);
    setAttachmentError("");
  }

  async function handleSubmitReservation() {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      showToast("You need to sign in again before submitting.", "error");
      return;
    }

    if (!room || !selectedCampus) {
      showToast("Room details are still loading. Please try again.", "error");
      return;
    }

    if (!organization.trim() || !purpose.trim()) {
      showToast("Complete the organization and purpose fields first.", "error");
      return;
    }

    if (isRecurring) {
      if (!effectiveReservationDateKey || !effectiveRecurringEndDateKey || selectedDays.length === 0) {
        showToast("Select the recurring dates and days before submitting.", "error");
        return;
      }
    } else {
      if (selectedScheduleSlots.length === 0) {
        showToast("Select at least one reservation timeslot before submitting.", "error");
        return;
      }
    }

    const adviserEmailValue = adviserEmail.trim().toLowerCase();
    if (isStudentUser && selectedCampus === "main") {
      if (!EMAIL_PATTERN.test(adviserEmailValue)) {
        showToast("Enter a valid adviser, department head, or professor email.", "error");
        return;
      }

      if (!(await validateAdviserEmail())) {
        showToast("We could not verify that adviser email.", "error");
        return;
      }
    }

    if (isStudentUser && !attachment) {
      showToast("Attach the concept paper or letter of approval before submitting.", "error");
      return;
    }

    if (attachment && !ALLOWED_ATTACHMENT_MIME_TYPES.has(attachment.mimeType)) {
      showToast("Only PDF, JPG, and PNG files are allowed.", "error");
      return;
    }

    if (attachment && attachment.size > MAX_ATTACHMENT_SIZE_BYTES) {
      showToast("The selected file must be 10 MB or smaller.", "error");
      return;
    }

    setSubmittingReservation(true);

    try {
      const profile = userProfile ?? (await getUserProfile(currentUser.uid));
      const firstName = profile?.firstName?.trim() ?? "";
      const lastName = profile?.lastName?.trim() ?? "";
      const resolvedUserRole = profile?.role?.trim() || userRole || "Student";
      const normalizedResolvedRole = resolvedUserRole.trim().toLowerCase();
      const isFacultyUser =
        normalizedResolvedRole === "faculty professor" ||
        normalizedResolvedRole === "faculty";
      const userName = `${firstName} ${lastName}`.trim() || currentUser.displayName?.trim() || "iRoomReserve User";
      const equipment = Object.fromEntries(
        Object.entries(materials).filter(([, quantity]) => quantity > 0)
      );

      const uploadedDocument = attachment
        ? await uploadReservationDocument({
            file: attachment,
          })
        : null;

      const attachmentPayload = uploadedDocument
        ? {
            approvalDocumentMimeType: uploadedDocument.contentType,
            approvalDocumentName: uploadedDocument.name,
            approvalDocumentPath: uploadedDocument.path,
            approvalDocumentSize: uploadedDocument.size,
          }
        : {};

      if (isRecurring) {
        const recurringReservationBase = {
          ...attachmentPayload,
          ...(Object.keys(equipment).length > 0 ? { equipment } : {}),
          buildingId: room.buildingId,
          buildingName: room.buildingName,
          campus: selectedCampus,
          endTime,
          programDepartmentOrganization: organization.trim(),
          purpose: purpose.trim(),
          roomId: room.id,
          roomName: room.name,
          startTime,
          userId: currentUser.uid,
          userName,
          userRole: resolvedUserRole,
        } as const;

        if (selectedCampus === "main") {
          await createRecurringReservation(
            {
              ...recurringReservationBase,
              ...(isFacultyUser ? {} : { advisorEmail: adviserEmailValue }),
              campus: "main",
            },
            selectedDays,
            effectiveReservationDateKey,
            effectiveRecurringEndDateKey
          );
        } else {
          await createRecurringReservation(
            {
              ...recurringReservationBase,
              buildingAdminEmail: DIGITAL_CAMPUS_BUILDING_ADMIN_EMAIL,
              campus: "digi",
            },
            selectedDays,
            effectiveReservationDateKey,
            effectiveRecurringEndDateKey
          );
        }
      } else {
        const collapsedSlots = collapseSelectedTimeslots(selectedScheduleSlots);

        await Promise.all(
          collapsedSlots.map((slot) => {
            const singleReservationBase = {
              ...attachmentPayload,
              ...(Object.keys(equipment).length > 0 ? { equipment } : {}),
              buildingId: room.buildingId,
              buildingName: room.buildingName,
              campus: selectedCampus,
              date: slot.dateKey,
              endTime: slot.endTime,
              programDepartmentOrganization: organization.trim(),
              purpose: purpose.trim(),
              roomId: room.id,
              roomName: room.name,
              startTime: slot.startTime,
              userId: currentUser.uid,
              userName,
              userRole: resolvedUserRole,
            } as const;

            if (selectedCampus === "main") {
              return createReservation({
                ...singleReservationBase,
                ...(isFacultyUser ? {} : { advisorEmail: adviserEmailValue }),
                campus: "main",
              });
            }

            return createReservation({
              ...singleReservationBase,
              buildingAdminEmail: DIGITAL_CAMPUS_BUILDING_ADMIN_EMAIL,
              campus: "digi",
            });
          })
        );
      }

      showToast("Reservation submitted successfully.");
      router.replace("/(main)/dashboard");
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Failed to submit the reservation.",
        "error"
      );
    } finally {
      setSubmittingReservation(false);
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
            <Text style={styles.summaryLabel}>Room Name:</Text>
            <Text style={styles.summaryValue}>{room?.name ?? roomName ?? "Selected Room"}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Campus:</Text>
            <Text style={styles.summaryValue}>
              {selectedCampus ? CAMPUS_LABELS[selectedCampus] : ""}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Floor:</Text>
            <Text style={styles.summaryValue}>{room?.floor ?? ""}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type:</Text>
            <Text style={styles.summaryValue}>{room?.roomType ?? ""}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Capacity:</Text>
            <Text style={styles.summaryValue}>
              {typeof room?.capacity === "number"
                ? `Approx. ${room.capacity} People`
                : ""}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Air Conditioner Status:</Text>
            <Text style={styles.summaryValue}>{room?.acStatus ?? ""}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Television/Projector:</Text>
            <Text style={styles.summaryValue}>{room?.tvProjectorStatus ?? ""}</Text>
          </View>
        </View>

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

            <View style={styles.recurringDateRow}>
              <View style={styles.recurringDateField}>
                <Text style={styles.inputLabel}>Start Date</Text>
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

              <View style={styles.recurringDateField}>
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
            </View>

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
                  <View
                    key={`${calendarMonth.toISOString()}-${weekIndex}`}
                    style={styles.calendarWeekRow}
                  >
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

                              if (
                                isRecurring &&
                                recurringEndDateKey &&
                                recurringEndDateKey < dateKey
                              ) {
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
                  The date and time are prefilled from your selected timeslot and can still be
                  changed.
                </Text>
              </View>
            ) : null}

            <View style={styles.inputGrid}>
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>Start Time</Text>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setOpenTimeField("start")}>
                  <View style={styles.inputWithAction}>
                    <View
                      style={[styles.fieldInput, styles.fieldInputWithIcon, styles.timeReadonly]}
                    >
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
                    <View
                      style={[styles.fieldInput, styles.fieldInputWithIcon, styles.timeReadonly]}
                    >
                      <Text style={styles.timeReadonlyText}>{formatTime12h(endTime)}</Text>
                    </View>
                    <View style={styles.inputActionButton}>
                      <ClockIcon />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          </>
        ) : null}

        <View style={styles.scheduleRequestCard}>
          <Text style={styles.selectedTimeslotsTitle}>Request Reservation for these Dates:</Text>
          {scheduledEntries.length > 0 ? (
            scheduledEntries.map((entry, index) => (
              <View key={`${entry}-${index}`} style={styles.selectionListRow}>
                <Text style={styles.selectionBullet}>-</Text>
                <Text style={styles.selectedTimeslotItem}>{entry}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.selectedTimeslotItem}>-</Text>
          )}

          {!isRecurring ? (
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handleEditSelectedSchedulePress}
              style={styles.editScheduleButton}
            >
              <Text style={styles.editScheduleButtonText}>
                {isEditingSelectedSchedule ? "Save selected dates and times" : "Edit selected dates and times"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!isRecurring && isEditingSelectedSchedule ? (
          <View style={styles.scheduleEditorBlock}>
            <Text style={styles.scheduleHelperText}>
              Tap <Text style={styles.scheduleHelperTextGreen}>green</Text> or{" "}
              <Text style={styles.scheduleHelperTextYellow}>yellow</Text> timeslots to update
              your reservation schedule. <Text style={styles.scheduleHelperTextRed}>Red</Text>{" "}
              timeslots are unavailable.
            </Text>
            <WeeklyScheduleGrid
              campus={selectedCampus}
              roomId={resolvedRoomId}
              schedules={schedules}
              weekOffset={scheduleWeekOffset}
              onWeekChange={setScheduleWeekOffset}
              onSlotPress={handleScheduleSlotPress}
              selectedSlotKeys={selectedScheduleSlotKeys}
              weekNavTopMargin={0}
            />
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

        <Text style={styles.sectionTitle}>Materials/Equipment Needed</Text>
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

        {isStudentUser && selectedCampus === "main" ? (
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
        ) : null}

        {isStudentUser ? (
          <View style={styles.inputBlock}>
            <Text style={styles.inputLabel}>Concept Paper / Letter of Approval</Text>
            <Text style={styles.helperText}>
              Required. Attach a PDF, JPG, or PNG file up to 10 MB.
            </Text>

            {attachment ? (
              <View style={styles.attachmentCard}>
                <View style={styles.attachmentInfo}>
                  <Text numberOfLines={1} style={styles.attachmentName}>
                    {attachment.name}
                  </Text>
                  <Text style={styles.attachmentMeta}>
                    {attachment.mimeType} • {formatFileSize(attachment.size)}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.9}
                  onPress={handleRemoveAttachment}
                  style={styles.attachmentRemoveButton}
                >
                  <Text style={styles.attachmentRemoveButtonText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handlePickAttachment}
                style={styles.attachmentPickerButton}
              >
                <Text style={styles.attachmentPickerButtonText}>Choose File</Text>
              </TouchableOpacity>
            )}

            {attachmentError ? (
              <Text style={[styles.emailFeedbackText, styles.emailFeedbackError]}>
                {attachmentError}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      <TouchableOpacity
        activeOpacity={0.9}
        disabled={submittingReservation}
        onPress={handleSubmitReservation}
        style={[styles.submitButton, submittingReservation && styles.submitButtonDisabled]}
      >
        {submittingReservation ? (
          <ActivityIndicator color={colors.white} size="small" />
        ) : (
          <Text style={styles.submitButtonText}>Submit Reservation</Text>
        )}
      </TouchableOpacity>

      <RoomTimePickerModal
        endTime={endTime}
        endTimeParts={endTimeParts}
        hourOptions={timeWheelHoursForPeriod}
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
    flexWrap: "wrap",
    gap: 4,
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
  },
  selectionText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    marginTop: 10,
  },
  selectionList: {
    marginTop: 8,
    gap: 6,
  },
  selectionListRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  selectionBullet: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  selectionListItem: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
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
    paddingHorizontal: 12,
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
    minWidth: 24,
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
    marginHorizontal: -4,
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
  scheduleRequestCard: {
    marginTop: 0,
  },
  selectedTimeslotsTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
    marginBottom: 8,
  },
  selectedTimeslotItem: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 11,
    lineHeight: 18,
  },
  editScheduleButton: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  editScheduleButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  scheduleEditorBlock: {
    marginTop: 14,
  },
  scheduleHelperText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 10,
  },
  scheduleHelperTextGreen: {
    color: colors.successText,
    fontFamily: fonts.bold,
  },
  scheduleHelperTextYellow: {
    color: "#c2410c",
    fontFamily: fonts.bold,
  },
  scheduleHelperTextRed: {
    color: colors.dangerText,
    fontFamily: fonts.bold,
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
    width: "31%",
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
  recurringDateRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  recurringDateField: {
    flex: 1,
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
  attachmentPickerButton: {
    marginTop: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  attachmentPickerButtonText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  attachmentCard: {
    marginTop: 10,
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
  attachmentInfo: {
    flex: 1,
  },
  attachmentName: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  attachmentMeta: {
    marginTop: 4,
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  attachmentRemoveButton: {
    borderRadius: 10,
    backgroundColor: colors.subtleBackground,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  attachmentRemoveButtonText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  submitButton: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitButtonDisabled: {
    opacity: 0.7,
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
