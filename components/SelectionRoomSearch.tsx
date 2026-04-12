import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { colors, fonts } from "@/constants/theme";
import {
  CAMPUS_LABELS,
  buildRoomSearchText,
  buildTimeSlots,
  formatSelectionLabel,
  formatShortDate,
  formatWeekLabel,
  getCampusTimeOptions,
  getDayShortLabel,
  getWeekDates,
  isPastDate,
  isRoomAvailableForRequest,
  isTimeRangeValid,
  timeStringToMinutes,
  toSearchRoom,
  type SearchRoom,
} from "@/lib/reservation-search";
import { getBuildings } from "@/services/buildings.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import { formatTime12h, getSchedulesByRoomId } from "@/services/schedules.service";
import type { ReservationCampus, Schedule } from "@/types/reservation";

const CAMPUS_OPTIONS: ReservationCampus[] = ["main", "digi"];
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6] as const;
const CALENDAR_DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const TIME_MINUTE_OPTIONS = ["00", "30"] as const;
const TIME_PERIOD_OPTIONS = ["AM", "PM"] as const;
const TIME_WHEEL_ITEM_HEIGHT = 72;

function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function formatDisplayDate(dateKey: string) {
  if (!dateKey) {
    return "";
  }

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year.slice(-2)}`;
}

function formatDisplayDateLong(dateKey: string) {
  if (!dateKey) {
    return "";
  }

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year}`;
}

function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

function getCalendarWeeks(monthDate: Date) {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const gridStart = new Date(monthStart);
  const startDay = gridStart.getDay();
  const difference = startDay === 0 ? -6 : 1 - startDay;
  gridStart.setDate(gridStart.getDate() + difference);

  return Array.from({ length: 6 }, (_, weekIndex) => {
    const weekStart = addDays(gridStart, weekIndex * 7);

    return Array.from({ length: 6 }, (_, dayIndex) => {
      const date = addDays(weekStart, dayIndex);

      return {
        date,
        dateKey: toDateKey(date),
        inMonth: date.getMonth() === monthDate.getMonth(),
      };
    });
  }).filter((week) =>
    week.some((entry) => entry.inMonth || entry.date <= monthEnd || entry.date >= monthStart)
  );
}

function parseEditableDateInput(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);

  if (month < 1 || month > 12 || day < 1) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getDay() === 0
  ) {
    return null;
  }

  return toDateKey(date);
}

function parseEditableDateList(value: string) {
  return value
    .split(",")
    .map((entry) => parseEditableDateInput(entry))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .sort((left, right) => left.localeCompare(right));
}

function getEffectiveTimeCampus(campus: ReservationCampus | null) {
  return campus === "digi" ? "digi" : "main";
}

function getDefaultStartTime() {
  return "07:00";
}

function getDefaultEndTime(campus: ReservationCampus | null) {
  return getEffectiveTimeCampus(campus) === "digi" ? "17:00" : "21:00";
}

function getStartTimeOptions(campus: ReservationCampus | null) {
  const options = getCampusTimeOptions(getEffectiveTimeCampus(campus));
  return options.filter(
    (value) =>
      timeStringToMinutes(value) <= timeStringToMinutes(getDefaultEndTime(campus)) - 60
  );
}

function getEndTimeOptionsForRange(campus: ReservationCampus | null, startTime: string) {
  const options = getCampusTimeOptions(getEffectiveTimeCampus(campus));
  const startMinutes = timeStringToMinutes(startTime || getDefaultStartTime());

  return options.filter((value) => timeStringToMinutes(value) - startMinutes >= 60);
}

function toTimeWheelParts(value: string) {
  const [hourString, minuteString] = value.split(":");
  let hour = Number(hourString);
  const period: (typeof TIME_PERIOD_OPTIONS)[number] = hour >= 12 ? "PM" : "AM";

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return {
    hour: String(hour),
    minute: (minuteString === "30" ? "30" : "00") as (typeof TIME_MINUTE_OPTIONS)[number],
    period,
  };
}

function fromTimeWheelParts(hour: string, minute: string, period: string) {
  let hourNumber = Number(hour);

  if (period === "AM") {
    hourNumber = hourNumber === 12 ? 0 : hourNumber;
  } else if (hourNumber !== 12) {
    hourNumber += 12;
  }

  return `${String(hourNumber).padStart(2, "0")}:${minute}`;
}

function getTimeWheelHours(campus: ReservationCampus | null) {
  return Array.from({ length: 12 }, (_, index) => String(index + 1));
}

function getNearestTimeOption(options: string[], value: string) {
  if (options.length === 0) {
    return "";
  }

  if (options.includes(value)) {
    return value;
  }

  const [hourString = "", minuteString = ""] = value.split(":");
  const hours = Number(hourString);
  const minutes = Number(minuteString);

  if (
    hourString.length !== 2 ||
    minuteString.length !== 2 ||
    Number.isNaN(hours) ||
    Number.isNaN(minutes)
  ) {
    return options[0];
  }

  const targetMinutes = hours * 60 + minutes;

  return options.reduce((closestValue, currentValue) => {
    const currentDistance = Math.abs(timeStringToMinutes(currentValue) - targetMinutes);
    const closestDistance = Math.abs(timeStringToMinutes(closestValue) - targetMinutes);

    return currentDistance < closestDistance ? currentValue : closestValue;
  }, options[0]);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function getStatusStyles(state: "available" | "pending" | "unavailable") {
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

interface SelectionRoomSearchProps {
  children: React.ReactNode;
}

export default function SelectionRoomSearch({ children }: SelectionRoomSearchProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRecurringDraft, setIsRecurringDraft] = useState(false);
  const [selectedCampusDraft, setSelectedCampusDraft] = useState<ReservationCampus | null>(null);
  const [selectedDaysDraft, setSelectedDaysDraft] = useState<number[]>([]);
  const [reservationDatesDraft, setReservationDatesDraft] = useState<string[]>([]);
  const [reservationDatesInputDraft, setReservationDatesInputDraft] = useState("");
  const [reservationDateDraft, setReservationDateDraft] = useState("");
  const [reservationDateInputDraft, setReservationDateInputDraft] = useState("");
  const [recurringEndDateDraft, setRecurringEndDateDraft] = useState("");
  const [recurringEndDateInputDraft, setRecurringEndDateInputDraft] = useState("");
  const [startTimeDraft, setStartTimeDraft] = useState(getDefaultStartTime());
  const [endTimeDraft, setEndTimeDraft] = useState(getDefaultEndTime(null));
  const [expandedRoomId, setExpandedRoomId] = useState<string | null>(null);
  const [expandedDates, setExpandedDates] = useState<Record<string, string[]>>({});
  const [weekOffsets, setWeekOffsets] = useState<Record<string, number>>({});
  const [rooms, setRooms] = useState<SearchRoom[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, Schedule[]>>({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [scheduleLoadingIds, setScheduleLoadingIds] = useState<Record<string, boolean>>({});
  const [openCalendarField, setOpenCalendarField] = useState<
    "reservationDates" | "reservationDate" | "recurringEndDate" | null
  >(null);
  const [openTimeField, setOpenTimeField] = useState<"start" | "end" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const searchActive = query.trim().length > 0;
  const effectiveTimeCampus = useMemo(
    () => getEffectiveTimeCampus(selectedCampusDraft),
    [selectedCampusDraft]
  );
  const startTimeOptions = useMemo(
    () => getStartTimeOptions(selectedCampusDraft),
    [selectedCampusDraft]
  );
  const campusTimeOptions = useMemo(
    () => getCampusTimeOptions(effectiveTimeCampus),
    [effectiveTimeCampus]
  );
  const endTimeOptions = useMemo(
    () => getEndTimeOptionsForRange(selectedCampusDraft, startTimeDraft),
    [selectedCampusDraft, startTimeDraft]
  );
  const calendarWeeks = useMemo(() => getCalendarWeeks(calendarMonth), [calendarMonth]);
  const isStartTimeValid = startTimeOptions.includes(startTimeDraft);
  const isEndTimeValid = endTimeOptions.includes(endTimeDraft);
  const startTimeParts = useMemo(() => toTimeWheelParts(startTimeDraft), [startTimeDraft]);
  const endTimeParts = useMemo(() => toTimeWheelParts(endTimeDraft), [endTimeDraft]);
  const timeWheelHours = useMemo(
    () => getTimeWheelHours(selectedCampusDraft),
    [selectedCampusDraft]
  );
  const reservationDateKeys = useMemo(
    () => {
      if (!isRecurringDraft) {
        return reservationDatesDraft;
      }

      if (!reservationDateDraft || !recurringEndDateDraft || selectedDaysDraft.length === 0) {
        return [];
      }

      const dates: string[] = [];
      const current = new Date(`${reservationDateDraft}T00:00:00`);
      const end = new Date(`${recurringEndDateDraft}T00:00:00`);

      while (current <= end && dates.length < 50) {
        if (selectedDaysDraft.includes(current.getDay())) {
          dates.push(toDateKey(current));
        }

        current.setDate(current.getDate() + 1);
      }

      return dates;
    },
    [
      isRecurringDraft,
      recurringEndDateDraft,
      reservationDateDraft,
      reservationDatesDraft,
      selectedDaysDraft,
    ]
  );

  useEffect(() => {
    let active = true;
    setRoomsLoading(true);

    getBuildings()
      .then(async (buildings) => {
        const roomGroups = await Promise.all(
          buildings.map((building) => getRoomsByBuilding(building.id))
        );

        if (!active) {
          return;
        }

        setRooms(roomGroups.flat().map(toSearchRoom));
        setRoomsError(null);
      })
      .catch((caughtError) => {
        if (active) {
          setRoomsError(
            caughtError instanceof Error
              ? caughtError.message
              : "Failed to load searchable rooms."
          );
        }
      })
      .finally(() => {
        if (active) {
          setRoomsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const searchedRooms = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }

    return rooms.filter((room) => {
      if (!room.campus) {
        return false;
      }

      if (selectedCampusDraft && room.campus !== selectedCampusDraft) {
        return false;
      }

      return buildRoomSearchText(room).includes(normalizedQuery);
    });
  }, [query, rooms, selectedCampusDraft]);

  useEffect(() => {
    if (!isRecurringDraft) {
      setReservationDateDraft("");
      setReservationDateInputDraft("");
      setRecurringEndDateDraft("");
      setRecurringEndDateInputDraft("");
      setSelectedDaysDraft([]);
    }
  }, [isRecurringDraft]);

  useEffect(() => {
    setReservationDatesInputDraft(reservationDatesDraft.map(formatDisplayDate).join(", "));
  }, [reservationDatesDraft]);

  useEffect(() => {
    setReservationDateInputDraft(formatDisplayDateLong(reservationDateDraft));
  }, [reservationDateDraft]);

  useEffect(() => {
    setRecurringEndDateInputDraft(formatDisplayDateLong(recurringEndDateDraft));
  }, [recurringEndDateDraft]);

  useEffect(() => {
    const nextStartTime = getNearestTimeOption(startTimeOptions, startTimeDraft);

    if (nextStartTime !== startTimeDraft) {
      setStartTimeDraft(nextStartTime);
      return;
    }

    const nextEndTimeOptions = getEndTimeOptionsForRange(selectedCampusDraft, nextStartTime);
    const nextEndTime = getNearestTimeOption(nextEndTimeOptions, endTimeDraft);

    if (nextEndTime !== endTimeDraft) {
      setEndTimeDraft(nextEndTime);
    }
  }, [endTimeDraft, selectedCampusDraft, startTimeDraft, startTimeOptions]);

  useEffect(() => {
    if (!searchActive) {
      return;
    }

    const roomIdsToFetch = searchedRooms
      .map((room) => room.id)
      .filter((roomId) => roomSchedules[roomId] === undefined);

    if (roomIdsToFetch.length === 0) {
      return;
    }

    let active = true;
    setScheduleLoadingIds((currentValue) => {
      const nextValue = { ...currentValue };
      roomIdsToFetch.forEach((roomId) => {
        nextValue[roomId] = true;
      });
      return nextValue;
    });

    Promise.all(
      roomIdsToFetch.map(async (roomId) => ({
        roomId,
        schedules: await getSchedulesByRoomId(roomId),
      }))
    )
      .then((results) => {
        if (!active) {
          return;
        }

        setRoomSchedules((currentValue) => {
          const nextValue = { ...currentValue };
          results.forEach(({ roomId, schedules }) => {
            nextValue[roomId] = schedules;
          });
          return nextValue;
        });
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setScheduleLoadingIds((currentValue) => {
          const nextValue = { ...currentValue };
          roomIdsToFetch.forEach((roomId) => {
            delete nextValue[roomId];
          });
          return nextValue;
        });
      });

    return () => {
      active = false;
    };
  }, [roomSchedules, searchActive, searchedRooms]);

  const availableRooms = useMemo(() => {
    return searchedRooms.filter((room) => {
      if (
        startTimeDraft &&
        endTimeDraft &&
        !isTimeRangeValid(room.campus, startTimeDraft, endTimeDraft)
      ) {
        return false;
      }

      return isRoomAvailableForRequest(
        room,
        roomSchedules[room.id] ?? [],
        reservationDateKeys,
        startTimeDraft,
        endTimeDraft
      );
    });
  }, [endTimeDraft, reservationDateKeys, roomSchedules, searchedRooms, startTimeDraft]);

  function toggleSelectedDay(dayOfWeek: number) {
    setSelectedDaysDraft((currentValue) =>
      currentValue.includes(dayOfWeek)
        ? currentValue.filter((value) => value !== dayOfWeek)
        : [...currentValue, dayOfWeek].sort((left, right) => left - right)
    );
  }

  function toggleCampus(campus: ReservationCampus) {
    const nextCampus = selectedCampusDraft === campus ? null : campus;
    const nextStartTime = getDefaultStartTime();
    const nextEndTime = getDefaultEndTime(nextCampus);

    setSelectedCampusDraft(nextCampus);
    setStartTimeDraft(nextStartTime);
    setEndTimeDraft(nextEndTime);
  }

  function applyTimeValue(field: "start" | "end", value: string) {
    if (field === "start") {
      const nextStartTime = getNearestTimeOption(startTimeOptions, value);
      setStartTimeDraft(nextStartTime);
      setEndTimeDraft(
        getNearestTimeOption(
          getEndTimeOptionsForRange(selectedCampusDraft, nextStartTime),
          endTimeDraft
        )
      );
      return;
    }

    setEndTimeDraft(getNearestTimeOption(endTimeOptions, value));
  }

  function updateTimeFromPicker(
    field: "start" | "end",
    parts: Partial<{ hour: string; minute: string; period: string }>
  ) {
    const currentParts = toTimeWheelParts(field === "start" ? startTimeDraft : endTimeDraft);
    applyTimeValue(
      field,
      fromTimeWheelParts(
      parts.hour ?? currentParts.hour,
      parts.minute ?? currentParts.minute,
      parts.period ?? currentParts.period
      )
    );
  }

  function toggleTimePicker(field: "start" | "end") {
    setOpenCalendarField(null);
    setOpenTimeField((currentValue) => (currentValue === field ? null : field));
  }

  function handleTimeWheelScroll(
    field: "start" | "end",
    wheel: "hour" | "minute" | "period",
    offsetY: number
  ) {
    if (wheel === "hour") {
      const index = Math.max(
        0,
        Math.min(timeWheelHours.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      updateTimeFromPicker(field, { hour: timeWheelHours[index] });
      return;
    }

    if (wheel === "minute") {
      const index = Math.max(
        0,
        Math.min(TIME_MINUTE_OPTIONS.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      updateTimeFromPicker(field, { minute: TIME_MINUTE_OPTIONS[index] });
      return;
    }

    const index = Math.max(
      0,
      Math.min(TIME_PERIOD_OPTIONS.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
    );
    updateTimeFromPicker(field, { period: TIME_PERIOD_OPTIONS[index] });
  }

  function handleReservationDatesInputBlur() {
    setReservationDatesDraft(parseEditableDateList(reservationDatesInputDraft));
  }

  function handleReservationDateBlur() {
    const parsedDate = parseEditableDateInput(reservationDateInputDraft);
    setReservationDateDraft(parsedDate ?? "");
  }

  function handleRecurringEndDateBlur() {
    const parsedDate = parseEditableDateInput(recurringEndDateInputDraft);

    if (!parsedDate) {
      setRecurringEndDateDraft("");
      return;
    }

    setRecurringEndDateDraft(
      reservationDateDraft && parsedDate < reservationDateDraft ? reservationDateDraft : parsedDate
    );
  }

  function openCalendar(field: "reservationDates" | "reservationDate" | "recurringEndDate") {
    if (openCalendarField === field) {
      setOpenCalendarField(null);
      return;
    }

    const value =
      field === "reservationDates"
        ? reservationDatesDraft[0]
        : field === "reservationDate"
          ? reservationDateDraft
          : recurringEndDateDraft;
    setOpenTimeField(null);
    setOpenCalendarField(field);
    setCalendarMonth(value ? new Date(`${value}T00:00:00`) : new Date());
  }

  function handleCalendarDateSelect(dateKey: string) {
    if (openCalendarField === "reservationDates") {
      setReservationDatesDraft((currentValue) =>
        currentValue.includes(dateKey)
          ? currentValue.filter((value) => value !== dateKey)
          : [...currentValue, dateKey].sort((left, right) => left.localeCompare(right))
      );
      return;
    }

    if (openCalendarField === "reservationDate") {
      setReservationDateDraft(dateKey);

      if (isRecurringDraft && recurringEndDateDraft < dateKey) {
        setRecurringEndDateDraft(dateKey);
      }
    }

    if (openCalendarField === "recurringEndDate") {
      setRecurringEndDateDraft(
        dateKey < reservationDateDraft ? reservationDateDraft : dateKey
      );
    }

    setOpenCalendarField(null);
  }

  function removeReservationDate(dateKey: string) {
    if (isRecurringDraft) {
      return;
    }

    const nextDates = reservationDatesDraft.filter((value) => value !== dateKey);
    setReservationDatesDraft(nextDates);
    setReservationDatesInputDraft(nextDates.map(formatDisplayDate).join(", "));
  }

  function toggleExpandedRoom(roomId: string) {
    setExpandedRoomId((currentValue) => (currentValue === roomId ? null : roomId));
    setExpandedDates((currentValue) => ({
      ...currentValue,
      [roomId]:
        currentValue[roomId] ??
        (reservationDateKeys.length > 0
          ? reservationDateKeys.slice(0, 3)
          : reservationDateDraft
            ? [reservationDateDraft]
            : []),
    }));
    setWeekOffsets((currentValue) => ({
      ...currentValue,
      [roomId]: currentValue[roomId] ?? 0,
    }));
  }

  function toggleExpandedDate(roomId: string, dateKey: string) {
    const selectedDate = new Date(`${dateKey}T00:00:00`);
    if (isPastDate(selectedDate)) {
      return;
    }

    setExpandedDates((currentValue) => {
      const currentDates = currentValue[roomId] ?? [];

      return {
        ...currentValue,
        [roomId]: currentDates.includes(dateKey)
          ? currentDates.filter((value) => value !== dateKey)
          : [...currentDates, dateKey].sort((left, right) => left.localeCompare(right)),
      };
    });
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrap}>
          <View style={styles.searchIcon}>
            <View style={styles.searchIconCircle} />
            <View style={styles.searchIconHandle} />
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a room"
            placeholderTextColor={colors.mutedText}
            style={styles.searchInput}
          />
        </View>
        <TouchableOpacity
          style={[styles.filterButton, filtersOpen && styles.filterButtonActive]}
          onPress={() => setFiltersOpen((currentValue) => !currentValue)}
        >
          <View style={styles.filterButtonContent}>
            <View style={styles.filterIcon}>
              <View
                style={[
                  styles.filterIconLine,
                  filtersOpen && styles.filterIconLineActive,
                  styles.filterIconLineTop,
                ]}
              />
              <View
                style={[
                  styles.filterIconLine,
                  filtersOpen && styles.filterIconLineActive,
                  styles.filterIconLineMiddle,
                ]}
              />
              <View
                style={[
                  styles.filterIconLine,
                  filtersOpen && styles.filterIconLineActive,
                  styles.filterIconLineBottom,
                ]}
              />
            </View>
            <Text
              style={[
                styles.filterButtonText,
                filtersOpen && styles.filterButtonTextActive,
              ]}
            >
              Filters
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {filtersOpen ? (
        <View style={styles.filterCard}>
          <Text style={styles.filterSectionTitle}>Search by Campus:</Text>
          <View style={styles.radioGroup}>
            {CAMPUS_OPTIONS.map((campus) => {
              const selected = selectedCampusDraft === campus;

              return (
                <TouchableOpacity
                  key={campus}
                  style={[styles.radioRow, selected && styles.radioRowSelected]}
                  onPress={() => toggleCampus(campus)}
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
              <Text style={styles.toggleSubtitle}>
                Book the same time slot on multiple days
              </Text>
            </View>
            <Switch
              value={isRecurringDraft}
              onValueChange={setIsRecurringDraft}
              trackColor={{ false: "#d7cdcd", true: "#d87878" }}
              thumbColor={isRecurringDraft ? colors.primary : colors.surface}
            />
          </View>

          {isRecurringDraft ? (
            <>
              <Text style={styles.filterSectionTitle}>Select Days of the Week</Text>
              <View style={styles.weekdayCalendarRow}>
                {WEEKDAY_OPTIONS.map((dayOfWeek) => {
                  const selected = selectedDaysDraft.includes(dayOfWeek);

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
                {isRecurringDraft ? "Start Date" : "Add Reservation Date(s)"}
              </Text>
              {isRecurringDraft ? (
                <View style={styles.inputWithAction}>
                  <TextInput
                    value={reservationDateInputDraft}
                    onChangeText={setReservationDateInputDraft}
                    onBlur={handleReservationDateBlur}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={colors.mutedText}
                    style={[styles.filterInput, styles.filterInputWithIcon]}
                  />
                  <TouchableOpacity
                    style={styles.inputActionButton}
                    onPress={() => openCalendar("reservationDate")}
                  >
                    <View style={styles.calendarIcon}>
                      <View style={styles.calendarIconHeader} />
                      <View style={styles.calendarIconGrid}>
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.inputWithAction}>
                  <TextInput
                    value={reservationDatesInputDraft}
                    onChangeText={setReservationDatesInputDraft}
                    onBlur={handleReservationDatesInputBlur}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={colors.mutedText}
                    style={[styles.filterInput, styles.filterInputWithIcon]}
                  />
                  <TouchableOpacity
                    style={styles.inputActionButton}
                    onPress={() => openCalendar("reservationDates")}
                  >
                    <View style={styles.calendarIcon}>
                      <View style={styles.calendarIconHeader} />
                      <View style={styles.calendarIconGrid}>
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {isRecurringDraft ? (
              <View style={styles.inputBlock}>
                <Text style={styles.inputLabel}>End Date</Text>
                <View style={styles.inputWithAction}>
                  <TextInput
                    value={recurringEndDateInputDraft}
                    onChangeText={setRecurringEndDateInputDraft}
                    onBlur={handleRecurringEndDateBlur}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor={colors.mutedText}
                    style={[styles.filterInput, styles.filterInputWithIcon]}
                  />
                  <TouchableOpacity
                    style={styles.inputActionButton}
                    onPress={() => openCalendar("recurringEndDate")}
                  >
                    <View style={styles.calendarIcon}>
                      <View style={styles.calendarIconHeader} />
                      <View style={styles.calendarIconGrid}>
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                        <View style={styles.calendarIconDot} />
                      </View>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
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
                {CALENDAR_DAY_LABELS.map((label) => (
                  <Text key={label} style={styles.calendarWeekLabel}>
                    {label}
                  </Text>
                ))}
              </View>

              {calendarWeeks.map((week, weekIndex) => (
                <View key={`${calendarMonth.getMonth()}-${weekIndex}`} style={styles.calendarWeekRow}>
                  {week.map((entry) => {
                    const selectedDateKey =
                      openCalendarField === "reservationDate"
                        ? reservationDateDraft
                        : openCalendarField === "recurringEndDate"
                          ? recurringEndDateDraft
                          : "";
                    const isSelected =
                      openCalendarField === "reservationDates"
                        ? reservationDatesDraft.includes(entry.dateKey)
                        : entry.dateKey === selectedDateKey;
                    const isDisabled =
                      !entry.inMonth ||
                      isPastDate(entry.date) ||
                      (openCalendarField === "recurringEndDate" &&
                        entry.dateKey < reservationDateDraft);

                    return (
                      <TouchableOpacity
                        key={entry.dateKey}
                        disabled={isDisabled}
                        style={[
                          styles.calendarDateButton,
                          isSelected && styles.calendarDateButtonSelected,
                          isDisabled && styles.calendarDateButtonDisabled,
                        ]}
                        onPress={() => handleCalendarDateSelect(entry.dateKey)}
                      >
                        <Text
                          style={[
                            styles.calendarDateText,
                            !entry.inMonth && styles.calendarDateTextMuted,
                            isSelected && styles.calendarDateTextSelected,
                            isDisabled && styles.calendarDateTextDisabled,
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
                <TouchableOpacity
                  style={styles.calendarDoneButton}
                  onPress={() => setOpenCalendarField(null)}
                >
                  <Text style={styles.calendarDoneButtonText}>Done</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <View style={styles.previewCard}>
            <Text style={styles.previewTitle}>Room should be available on:</Text>
            <View style={styles.previewChipWrap}>
              {reservationDateKeys.length === 0 ? (
                <Text style={styles.previewEmptyText}>
                  {isRecurringDraft
                    ? "Add valid dates and weekdays to preview the selected range."
                    : "Add one or more valid dates to preview room availability."}
                </Text>
              ) : (
                reservationDateKeys.map((dateKey) => (
                  <View key={dateKey} style={styles.previewChip}>
                    <Text style={styles.previewChipText}>{formatDisplayDate(dateKey)}</Text>
                    {!isRecurringDraft ? (
                      <TouchableOpacity
                        style={styles.previewChipRemoveButton}
                        onPress={() => removeReservationDate(dateKey)}
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
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleTimePicker("start")}
              >
                <View style={styles.inputWithAction}>
                  <View
                    style={[
                      styles.filterInput,
                      styles.filterInputWithIcon,
                      styles.timeReadonlyInput,
                      !isStartTimeValid && styles.filterInputInvalid,
                    ]}
                  >
                    <Text style={styles.timeReadonlyText}>{formatTime12h(startTimeDraft)}</Text>
                  </View>
                  <View style={styles.inputActionButton}>
                    <View style={styles.clockIcon}>
                      <View style={styles.clockFace} />
                      <View style={styles.clockHandVertical} />
                      <View style={styles.clockHandHorizontal} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.inputBlock}>
              <Text style={styles.inputLabel}>End Time</Text>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => toggleTimePicker("end")}
              >
                <View style={styles.inputWithAction}>
                  <View
                    style={[
                      styles.filterInput,
                      styles.filterInputWithIcon,
                      styles.timeReadonlyInput,
                      !isEndTimeValid && styles.filterInputInvalid,
                    ]}
                  >
                    <Text style={styles.timeReadonlyText}>{formatTime12h(endTimeDraft)}</Text>
                  </View>
                  <View style={styles.inputActionButton}>
                    <View style={styles.clockIcon}>
                      <View style={styles.clockFace} />
                      <View style={styles.clockHandVertical} />
                      <View style={styles.clockHandHorizontal} />
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <Modal
        visible={Boolean(openTimeField)}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenTimeField(null)}
      >
        <View style={styles.timeModalBackdrop}>
          <View style={styles.timeModalCard}>
            <View style={styles.timeModalHeader}>
              <Text style={styles.timePickerTitle}>
                {openTimeField === "start" ? "Choose Start Time" : "Choose End Time"}
              </Text>
              <TouchableOpacity
                style={styles.timeModalCloseButton}
                onPress={() => setOpenTimeField(null)}
              >
                <Text style={styles.timeModalCloseText}>X</Text>
              </TouchableOpacity>
            </View>

            {openTimeField ? (
              <View style={styles.timeWheelWrap}>
                <View style={styles.timeWheelSelectionBand} />
                <ScrollView
                  key={`${openTimeField}-${selectedCampusDraft ?? "all"}-${
                    openTimeField === "start" ? startTimeDraft : endTimeDraft
                  }-hour`}
                  style={styles.timeWheelColumn}
                  contentContainerStyle={styles.timeWheelContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  onScrollEndDrag={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "hour",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  onMomentumScrollEnd={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "hour",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  contentOffset={{
                    x: 0,
                    y:
                      timeWheelHours.indexOf(
                        openTimeField === "start" ? startTimeParts.hour : endTimeParts.hour
                      ) * TIME_WHEEL_ITEM_HEIGHT,
                  }}
                >
                  {timeWheelHours.map((hour) => {
                    const selected =
                      hour ===
                      (openTimeField === "start" ? startTimeParts.hour : endTimeParts.hour);

                    return (
                      <View key={hour} style={styles.timeWheelItem}>
                        <Text
                          style={[
                            styles.timeWheelText,
                            selected && styles.timeWheelTextSelected,
                          ]}
                        >
                          {hour}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <Text style={styles.timeWheelDivider}>:</Text>
                <ScrollView
                  key={`${openTimeField}-${openTimeField === "start" ? startTimeDraft : endTimeDraft}-minute`}
                  style={styles.timeWheelColumn}
                  contentContainerStyle={styles.timeWheelContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  onScrollEndDrag={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "minute",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  onMomentumScrollEnd={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "minute",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  contentOffset={{
                    x: 0,
                    y:
                      TIME_MINUTE_OPTIONS.indexOf(
                        openTimeField === "start" ? startTimeParts.minute : endTimeParts.minute
                      ) * TIME_WHEEL_ITEM_HEIGHT,
                  }}
                >
                  {TIME_MINUTE_OPTIONS.map((minute) => {
                    const selected =
                      minute ===
                      (openTimeField === "start" ? startTimeParts.minute : endTimeParts.minute);

                    return (
                      <View key={minute} style={styles.timeWheelItem}>
                        <Text
                          style={[
                            styles.timeWheelText,
                            selected && styles.timeWheelTextSelected,
                          ]}
                        >
                          {minute}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
                <ScrollView
                  key={`${openTimeField}-${openTimeField === "start" ? startTimeDraft : endTimeDraft}-period`}
                  style={styles.timePeriodColumn}
                  contentContainerStyle={styles.timeWheelContent}
                  showsVerticalScrollIndicator={false}
                  nestedScrollEnabled
                  snapToInterval={TIME_WHEEL_ITEM_HEIGHT}
                  decelerationRate="fast"
                  scrollEventThrottle={16}
                  onScrollEndDrag={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "period",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  onMomentumScrollEnd={(event) =>
                    handleTimeWheelScroll(
                      openTimeField,
                      "period",
                      event.nativeEvent.contentOffset.y
                    )
                  }
                  contentOffset={{
                    x: 0,
                    y:
                      TIME_PERIOD_OPTIONS.indexOf(
                        openTimeField === "start" ? startTimeParts.period : endTimeParts.period
                      ) * TIME_WHEEL_ITEM_HEIGHT,
                  }}
                >
                  {TIME_PERIOD_OPTIONS.map((period) => {
                    const selected =
                      period ===
                      (openTimeField === "start" ? startTimeParts.period : endTimeParts.period);

                    return (
                      <View key={period} style={styles.timeWheelItem}>
                        <Text
                          style={[
                            styles.timeWheelText,
                            styles.timePeriodText,
                            selected && styles.timeWheelTextSelected,
                          ]}
                        >
                          {period.toLowerCase()}
                        </Text>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {!searchActive ? (
        <View>{children}</View>
      ) : roomsLoading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.stateText}>Loading searchable rooms...</Text>
        </View>
      ) : roomsError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>{roomsError}</Text>
        </View>
      ) : availableRooms.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateText}>
            No rooms match this search and availability filter.
          </Text>
        </View>
      ) : (
        <View style={styles.resultsBlock}>
          {availableRooms.map((room) => {
            const expanded = expandedRoomId === room.id;
            const schedules = roomSchedules[room.id] ?? [];
            const selectedDateKeys = expandedDates[room.id] ?? [];
            const weekOffset = weekOffsets[room.id] ?? 0;
            const currentWeekDates = getWeekDates(weekOffset);

            return (
              <View key={room.id} style={styles.roomCard}>
                <View style={styles.roomHeader}>
                  <TouchableOpacity
                    style={styles.roomInfoPressable}
                    onPress={() =>
                      router.push({
                        pathname: "/(main)/rooms/[roomId]",
                        params: { roomId: room.id },
                      })
                    }
                  >
                    <Text style={styles.roomName}>{room.name}</Text>
                    <Text style={styles.roomMeta}>
                      {room.campusName} / {room.buildingName}
                    </Text>
                    <Text style={styles.roomMeta}>Floor: {room.floor}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.expandButton}
                    onPress={() => toggleExpandedRoom(room.id)}
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
                      <Text style={styles.detailText}>Type: {room.roomType}</Text>
                      <Text style={styles.detailText}>Status: {room.status}</Text>
                      <Text style={styles.detailText}>
                        Air-Conditioner: {room.acStatus}
                      </Text>
                      <Text style={styles.detailText}>
                        TV/Projector: {room.tvProjectorStatus}
                      </Text>
                      <Text style={styles.detailText}>Capacity: {room.capacity}</Text>
                    </View>

                    <View style={styles.schedulePreviewCard}>
                      <Text style={styles.schedulePreviewTitle}>View Schedules</Text>
                      <View style={styles.weekNavRow}>
                        <TouchableOpacity
                          style={styles.weekNavButton}
                          disabled={weekOffset === 0}
                          onPress={() =>
                            setWeekOffsets((currentValue) => ({
                              ...currentValue,
                              [room.id]: Math.max(0, weekOffset - 1),
                            }))
                          }
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
                        <Text style={styles.schedulePreviewSubtitle}>
                          {formatWeekLabel(currentWeekDates[0])}
                        </Text>
                        <TouchableOpacity
                          style={styles.weekNavButton}
                          onPress={() =>
                            setWeekOffsets((currentValue) => ({
                              ...currentValue,
                              [room.id]: weekOffset + 1,
                            }))
                          }
                        >
                          <Text style={styles.weekNavText}>{">"}</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.scheduleDateGrid}>
                        {currentWeekDates.map((date) => {
                          const rawDateKey = toDateKey(date);
                          const selected = selectedDateKeys.includes(rawDateKey);
                          const disabled = isPastDate(date);

                          return (
                            <TouchableOpacity
                              key={rawDateKey}
                              disabled={disabled}
                              style={[
                                styles.scheduleDateChip,
                                selected && styles.scheduleDateChipSelected,
                                disabled && styles.scheduleDateChipDisabled,
                              ]}
                              onPress={() => toggleExpandedDate(room.id, rawDateKey)}
                            >
                              <Text
                                style={[
                                  styles.scheduleDateDay,
                                  selected && styles.scheduleDateTextSelected,
                                  disabled && styles.scheduleDateTextDisabled,
                                ]}
                              >
                                {getDayShortLabel(date.getDay())}
                              </Text>
                              <Text
                                style={[
                                  styles.scheduleDateValue,
                                  selected && styles.scheduleDateTextSelected,
                                  disabled && styles.scheduleDateTextDisabled,
                                ]}
                              >
                                {formatShortDate(date)}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>

                      {selectedDateKeys.length === 0 ? (
                        <Text style={styles.previewEmptyText}>
                          Select one or more days to preview room schedules.
                        </Text>
                      ) : (
                        selectedDateKeys.map((dateKey) => (
                          <View key={dateKey} style={styles.timeSlotSection}>
                            <Text style={styles.timeSlotSectionTitle}>
                              {formatSelectionLabel(dateKey)}
                            </Text>
                            {buildTimeSlots(room.id, dateKey, schedules).map((slot) => {
                              const statusStyles = getStatusStyles(slot.state);

                              return (
                                <View
                                  key={`${dateKey}-${slot.startTime}`}
                                  style={[
                                    styles.timeSlotCard,
                                    {
                                      backgroundColor: statusStyles.backgroundColor,
                                      borderColor: statusStyles.borderColor,
                                    },
                                  ]}
                                >
                                  <View style={styles.timeSlotHeader}>
                                    <Text
                                      style={[
                                        styles.timeSlotTime,
                                        { color: statusStyles.textColor },
                                      ]}
                                    >
                                      {formatTime12h(slot.startTime)} -{" "}
                                      {formatTime12h(slot.endTime)}
                                    </Text>
                                    <Text
                                      style={[
                                        styles.timeSlotBadge,
                                        { color: statusStyles.textColor },
                                      ]}
                                    >
                                      {slot.state}
                                    </Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.timeSlotDescription,
                                      { color: statusStyles.textColor },
                                    ]}
                                  >
                                    {slot.description}
                                  </Text>
                                </View>
                              );
                            })}
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
  },
  searchIcon: {
    width: 18,
    height: 18,
    marginRight: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  searchIconCircle: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: colors.mutedText,
  },
  searchIconHandle: {
    position: "absolute",
    width: 7,
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.mutedText,
    transform: [{ rotate: "45deg" }, { translateX: 5 }, { translateY: 5 }],
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 0,
    paddingVertical: 12,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  filterButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  filterButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterIcon: {
    width: 14,
    height: 12,
    justifyContent: "space-between",
  },
  filterIconLine: {
    height: 2,
    borderRadius: 999,
    backgroundColor: colors.text,
  },
  filterIconLineActive: {
    backgroundColor: colors.white,
  },
  filterIconLineTop: {
    width: 14,
  },
  filterIconLineMiddle: {
    width: 10,
  },
  filterIconLineBottom: {
    width: 6,
  },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterButtonText: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
  filterButtonTextActive: { color: colors.white },
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
  radioText: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
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
  toggleTextBlock: { flex: 1, paddingRight: 12 },
  toggleTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 16 },
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
  weekdayCalendarButtonSelected: { backgroundColor: "#f9e3e3", borderColor: "#e7aaaa" },
  weekdayCalendarText: { color: colors.text, fontFamily: fonts.bold, fontSize: 14 },
  weekdayCalendarTextSelected: { color: colors.primary },
  inputGrid: { flexDirection: "row", justifyContent: "space-between", gap: 12, marginBottom: 16 },
  inputBlock: { flex: 1 },
  inputLabel: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, marginBottom: 8 },
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
  timeReadonlyInput: {
    justifyContent: "center",
  },
  timeReadonlyText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
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
  filterInputInvalid: {
    borderColor: colors.dangerBorder,
    backgroundColor: colors.dangerBackground,
  },
  timeModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(29, 27, 32, 0.32)",
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  timeModalCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 18,
  },
  timeModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  timeModalCloseButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeModalCloseText: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  timePickerTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  timeWheelWrap: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  timeWheelSelectionBand: {
    position: "absolute",
    left: 0,
    right: 0,
    top: TIME_WHEEL_ITEM_HEIGHT,
    height: TIME_WHEEL_ITEM_HEIGHT,
    borderRadius: 18,
    backgroundColor: colors.subtleBackground,
  },
  timeWheelColumn: {
    width: 88,
    maxHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  timePeriodColumn: {
    width: 92,
    maxHeight: TIME_WHEEL_ITEM_HEIGHT * 3,
  },
  timeWheelContent: {
    paddingVertical: TIME_WHEEL_ITEM_HEIGHT,
  },
  timeWheelItem: {
    height: TIME_WHEEL_ITEM_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  timeWheelText: {
    color: colors.mutedText,
    fontFamily: fonts.regular,
    fontSize: 52,
    lineHeight: 56,
  },
  timeWheelTextSelected: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  timePeriodText: {
    fontSize: 34,
    lineHeight: 46,
  },
  timeWheelDivider: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 52,
    lineHeight: 56,
    marginHorizontal: 4,
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
  helperText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  previewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#efc3c3",
    backgroundColor: "#fbf2f2",
    padding: 14,
    marginBottom: 16,
  },
  previewTitle: { color: colors.primary, fontFamily: fonts.bold, fontSize: 15, marginBottom: 10 },
  previewChipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  previewChipText: { color: colors.text, fontFamily: fonts.regular, fontSize: 12 },
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
  stateCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 16,
    alignItems: "center",
  },
  stateText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  resultsBlock: { marginTop: 12 },
  roomCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    marginBottom: 12,
  },
  roomHeader: { flexDirection: "row", alignItems: "flex-start" },
  roomInfoPressable: { flex: 1, paddingRight: 12 },
  roomName: { color: colors.text, fontFamily: fonts.bold, fontSize: 18 },
  roomMeta: { color: colors.secondary, fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  expandButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  expandButtonText: { color: colors.primary, fontFamily: fonts.bold, fontSize: 22, lineHeight: 22 },
  roomLoader: { marginTop: 12 },
  expandedSection: { marginTop: 14 },
  detailCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 12,
  },
  detailText: { color: colors.text, fontFamily: fonts.regular, fontSize: 13, marginBottom: 4 },
  schedulePreviewCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
    padding: 12,
  },
  schedulePreviewTitle: { color: colors.primary, fontFamily: fonts.bold, fontSize: 16 },
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
  schedulePreviewSubtitle: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  scheduleDateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 10,
    marginBottom: 12,
  },
  scheduleDateChip: {
    width: "31%",
    minHeight: 72,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    alignItems: "center",
    padding: 10,
  },
  scheduleDateChipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  scheduleDateChipDisabled: { opacity: 0.55 },
  scheduleDateDay: { color: colors.secondary, fontFamily: fonts.bold, fontSize: 12, marginBottom: 4 },
  scheduleDateValue: { color: colors.text, fontFamily: fonts.bold, fontSize: 13 },
  scheduleDateTextSelected: { color: colors.white },
  scheduleDateTextDisabled: { color: colors.mutedText },
  timeSlotSection: { marginTop: 12 },
  timeSlotSectionTitle: { color: colors.text, fontFamily: fonts.bold, fontSize: 14, marginBottom: 8 },
  timeSlotCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  timeSlotHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  timeSlotTime: { fontFamily: fonts.bold, fontSize: 13, flex: 1, paddingRight: 8 },
  timeSlotBadge: { fontFamily: fonts.bold, fontSize: 11, textTransform: "capitalize" },
  timeSlotDescription: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
});
