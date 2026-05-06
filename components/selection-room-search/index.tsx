import React, { useEffect, useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { useRouter } from "expo-router";

import { useSelectionFilters } from "@/components/SelectionFilterContext";
import FilterBar from "@/components/FilterBar";
import {
  buildRoomSearchText,
  getDayShortLabel,
  formatFullDate,
  isPastDate,
  isRoomAvailableForRequest,
  isTimeRangeValid,
  minutesToTimeString,
  timeStringToMinutes,
  toSearchRoom,
  type TimeSlotViewModel,
  type SearchRoom,
} from "@/lib/reservation-search";
import SelectionRoomResults from "./SelectionRoomResults";
import styles from "./styles";
import {
  addMonths,
  applySelectedTimeslotPress,
  buildSelectionLabel,
  buildTimeslotLabel,
  collapseSelectedTimeslots,
  fromTimeWheelParts,
  getCalendarWeeks,
  getDefaultEndTime,
  getDefaultStartTime,
  getEndTimeOptionsForRange,
  getMonthLabel,
  getNearestTimeOption,
  getSelectedTimeslotKey,
  getStartTimeOptions,
  getTimeWheelHoursForPeriod,
  getTimeWheelMinutesForHour,
  getTimeWheelPeriods,
  parseEditableDateInput,
  type SelectedTimeslot,
  TIME_MINUTE_OPTIONS,
  TIME_PERIOD_OPTIONS,
  TIME_WHEEL_ITEM_HEIGHT,
  toDateKey,
  toTimeWheelParts,
  formatDisplayDateShort,
} from "./helpers";
import { getBuildings } from "@/services/buildings.service";
import { createFloorId, normalizeFloorLabel } from "@/services/floors.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import { auth } from "@/services/firebase";
import { getReservationsByUser } from "@/services/reservations.service";
import { formatTime12h, getSchedulesByRoomId } from "@/services/schedules.service";
import type {
  ReservationCampus,
  ReservationRecord,
  Schedule,
} from "@/types/reservation";
import RoomSearchBar from "./RoomSearchBar";
import RoomSearchFilters from "./RoomSearchFilters";
import RoomTimePickerModal from "./RoomTimePickerModal";

interface SelectionRoomSearchProps {
  children: React.ReactNode;
  forceResultsVisible?: boolean;
  onHeaderVisibilityChange?: (visible: boolean) => void;
  onInteractionChange?: (active: boolean) => void;
  resultsFooter?: React.ReactNode;
  resultsTitle?: string;
}

const DEFAULT_ROOM_TYPE_OPTIONS = ["Classroom", "Glass Room", "Conference Room", "Specialized Room", "Gymnasium"];

export default function SelectionRoomSearch({
  children,
  forceResultsVisible = false,
  onHeaderVisibilityChange,
  onInteractionChange,
  resultsFooter,
  resultsTitle,
}: SelectionRoomSearchProps) {
  const router = useRouter();
  const { getActiveFilterByLevel } = useSelectionFilters();
  const [query, setQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [isRecurringDraft, setIsRecurringDraft] = useState(false);
  const [selectedCampusDraft, setSelectedCampusDraft] = useState<ReservationCampus | null>(null);
  const [selectedRoomTypesDraft, setSelectedRoomTypesDraft] = useState<string[]>([]);
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
  const [selectedSlotsByRoom, setSelectedSlotsByRoom] = useState<
    Record<string, SelectedTimeslot[]>
  >({});
  const [weekOffsets, setWeekOffsets] = useState<Record<string, number>>({});
  const [rooms, setRooms] = useState<SearchRoom[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, Schedule[]>>({});
  const [userReservations, setUserReservations] = useState<ReservationRecord[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [scheduleLoadingIds, setScheduleLoadingIds] = useState<Record<string, boolean>>({});
  const [openCalendarField, setOpenCalendarField] = useState<
    "reservationDates" | "reservationDate" | "recurringEndDate" | null
  >(null);
  const [openTimeField, setOpenTimeField] = useState<"start" | "end" | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  const normalizedQuery = query.trim().toLowerCase();
  const roomTypeOptions = useMemo(
    () =>
      [
        ...new Set(
          [...DEFAULT_ROOM_TYPE_OPTIONS, ...rooms.map((room) => room.roomType.trim())].filter(
            Boolean
          )
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [rooms]
  );
  const activeCampusSelection = getActiveFilterByLevel("campus")?.id ?? null;
  const activeBuildingSelection = getActiveFilterByLevel("building")?.id ?? null;
  const activeFloorSelection = getActiveFilterByLevel("floor")?.id ?? null;
  const hasActiveFilters =
    selectedCampusDraft !== null ||
    selectedRoomTypesDraft.length > 0 ||
    isRecurringDraft ||
    selectedDaysDraft.length > 0 ||
    reservationDatesDraft.length > 0 ||
    reservationDateDraft.length > 0 ||
    recurringEndDateDraft.length > 0 ||
    startTimeDraft !== getDefaultStartTime() ||
    endTimeDraft !== getDefaultEndTime(null);
  const resultsVisible =
    forceResultsVisible || filtersOpen || normalizedQuery.length > 0 || hasActiveFilters;
  const resultsHeadingVisible = resultsVisible;
  const startTimeOptions = useMemo(
    () =>
      getStartTimeOptions(
        selectedCampusDraft,
        minutesToTimeString,
        timeStringToMinutes
      ),
    [selectedCampusDraft]
  );
  const endTimeOptions = useMemo(
    () =>
      getEndTimeOptionsForRange(
        selectedCampusDraft,
        startTimeDraft,
        minutesToTimeString,
        timeStringToMinutes
      ),
    [selectedCampusDraft, startTimeDraft]
  );
  const calendarWeeks = useMemo(() => getCalendarWeeks(calendarMonth), [calendarMonth]);
  const isStartTimeValid = startTimeOptions.includes(startTimeDraft);
  const isEndTimeValid = endTimeOptions.includes(endTimeDraft);
  const startTimeParts = useMemo(() => toTimeWheelParts(startTimeDraft), [startTimeDraft]);
  const endTimeParts = useMemo(() => toTimeWheelParts(endTimeDraft), [endTimeDraft]);
  const activeTimeOptions = useMemo(
    () => (openTimeField === "start" ? startTimeOptions : endTimeOptions),
    [endTimeOptions, openTimeField, startTimeOptions]
  );
  const activeTimeParts = openTimeField === "start" ? startTimeParts : endTimeParts;
  const timeWheelPeriods = useMemo(
    () => getTimeWheelPeriods(activeTimeOptions),
    [activeTimeOptions]
  );
  const timeWheelHoursForPeriod = useMemo(
    () =>
      getTimeWheelHoursForPeriod(
        activeTimeOptions,
        activeTimeParts.period
      ),
    [activeTimeOptions, activeTimeParts.period]
  );
  const timeWheelMinutesForHour = useMemo(
    () =>
      getTimeWheelMinutesForHour(
        activeTimeOptions,
        activeTimeParts.period,
        activeTimeParts.hour
      ),
    [activeTimeOptions, activeTimeParts.hour, activeTimeParts.period]
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

  useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setUserReservations([]);
      return;
    }

    let active = true;

    getReservationsByUser(currentUser.uid)
      .then((nextReservations) => {
        if (active) {
          setUserReservations(
            nextReservations.filter(
              (reservation) =>
                reservation.status === "pending" || reservation.status === "approved"
            )
          );
        }
      })
      .catch(() => {
        if (active) {
          setUserReservations([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const roomType = room.roomType.trim();
      const roomFloorId = createFloorId(normalizeFloorLabel(room.floor) ?? room.floor);

      if (!room.campus) {
        return false;
      }

      if (activeCampusSelection && room.campus !== activeCampusSelection) {
        return false;
      }

      if (activeBuildingSelection && room.buildingId !== activeBuildingSelection) {
        return false;
      }

      if (activeFloorSelection && roomFloorId !== activeFloorSelection) {
        return false;
      }

      if (selectedCampusDraft && room.campus !== selectedCampusDraft) {
        return false;
      }

      if (
        selectedRoomTypesDraft.length > 0 &&
        !selectedRoomTypesDraft.includes(roomType)
      ) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return buildRoomSearchText(room).includes(normalizedQuery);
    });
  }, [
    activeBuildingSelection,
    activeCampusSelection,
    activeFloorSelection,
    normalizedQuery,
    rooms,
    selectedCampusDraft,
    selectedRoomTypesDraft,
  ]);

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
    setReservationDateInputDraft(formatDisplayDateShort(reservationDateDraft));
  }, [reservationDateDraft]);

  useEffect(() => {
    setRecurringEndDateInputDraft(formatDisplayDateShort(recurringEndDateDraft));
  }, [recurringEndDateDraft]);

  useEffect(() => {
    const nextStartTime = getNearestTimeOption(
      startTimeOptions,
      startTimeDraft,
      timeStringToMinutes
    );

    if (nextStartTime !== startTimeDraft) {
      setStartTimeDraft(nextStartTime);
      return;
    }

    const nextEndTimeOptions = getEndTimeOptionsForRange(
      selectedCampusDraft,
      nextStartTime,
      minutesToTimeString,
      timeStringToMinutes
    );
    const nextEndTime = getNearestTimeOption(
      nextEndTimeOptions,
      endTimeDraft,
      timeStringToMinutes
    );

    if (nextEndTime !== endTimeDraft) {
      setEndTimeDraft(nextEndTime);
    }
  }, [endTimeDraft, selectedCampusDraft, startTimeDraft, startTimeOptions]);

  useEffect(() => {
    if (!resultsVisible) {
      return;
    }

    const roomIdsToFetch = filteredRooms
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
  }, [filteredRooms, resultsVisible, roomSchedules]);

  const hasExplicitTimeFilter =
    startTimeDraft !== getDefaultStartTime() || endTimeDraft !== getDefaultEndTime(null);

  const availableRooms = useMemo(() => {
    return filteredRooms.filter((room) => {
      if (
        (selectedCampusDraft !== null || hasExplicitTimeFilter) &&
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
        endTimeDraft,
        userReservations
      );
    });
  }, [
    endTimeDraft,
    filteredRooms,
    hasExplicitTimeFilter,
    reservationDateKeys,
    roomSchedules,
    selectedCampusDraft,
    startTimeDraft,
    userReservations,
  ]);

  const availabilityRequiresSchedules = reservationDateKeys.length > 0;
  const availabilityLoading = useMemo(
    () =>
      availabilityRequiresSchedules &&
      filteredRooms.some(
        (room) => roomSchedules[room.id] === undefined || Boolean(scheduleLoadingIds[room.id])
      ),
    [availabilityRequiresSchedules, filteredRooms, roomSchedules, scheduleLoadingIds]
  );

  function openAlternativeRooms(
    room: SearchRoom,
    dateKey: string,
    slot: Pick<TimeSlotViewModel, "startTime" | "endTime">
  ) {
    router.push({
      pathname: "/(main)/alternative-rooms",
      params: {
        roomName: room.name,
        selection: formatFullDate(new Date(`${dateKey}T00:00:00`)),
        timeslot: `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`,
      },
    });
  }

  function toggleSelectedTimeslot(
    room: SearchRoom,
    dateKey: string,
    slot: TimeSlotViewModel
  ) {
    if (slot.state === "unavailable") {
      if (slot.unavailableReason === "past_time") {
        Alert.alert(
          "Timeslot Unavailable",
          "This timeslot is no longer available because it is already outside today's current reservation window.",
          [{ text: "OK" }]
        );
        return;
      }

      if (slot.unavailableReason === "user_conflict") {
        Alert.alert(
          "Existing Reservation",
          "You already have a reservation request for this same timeslot. Users can only reserve one room per timeslot.",
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
            onPress: () => openAlternativeRooms(room, dateKey, slot),
          },
        ]
      );
      return;
    }

    const nextSlot: SelectedTimeslot = {
      dateKey,
      endTime: slot.endTime,
      startTime: slot.startTime,
      state: slot.state,
    };

    setSelectedSlotsByRoom((currentValue) => {
      const roomSelections = currentValue[room.id] ?? [];

      return {
        ...currentValue,
        [room.id]: applySelectedTimeslotPress(roomSelections, nextSlot),
      };
    });
  }

  function openReservationFormForRoom(room: SearchRoom) {
    const selectedSlots = [...(selectedSlotsByRoom[room.id] ?? [])].sort((left, right) => {
      const dateComparison = left.dateKey.localeCompare(right.dateKey);

      if (dateComparison !== 0) {
        return dateComparison;
      }

      return left.startTime.localeCompare(right.startTime);
    });

    if (selectedSlots.length === 0) {
      return;
    }

    router.push({
      pathname: "/(main)/reservation-form",
      params: {
        roomId: room.id,
        roomName: room.name,
        selection: buildSelectionLabel(selectedSlots),
        selectedTimeslots: JSON.stringify(collapseSelectedTimeslots(selectedSlots)),
        timeslot: buildTimeslotLabel(selectedSlots),
      },
    });
  }

  useEffect(() => {
    onInteractionChange?.(filtersOpen || searchFocused);
  }, [filtersOpen, onInteractionChange, searchFocused]);

  useEffect(() => {
    onHeaderVisibilityChange?.(resultsHeadingVisible);
  }, [onHeaderVisibilityChange, resultsHeadingVisible]);

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

  function toggleRoomType(roomType: string) {
    setSelectedRoomTypesDraft((currentValue) =>
      currentValue.includes(roomType)
        ? currentValue.filter((value) => value !== roomType)
        : [...currentValue, roomType].sort((left, right) => left.localeCompare(right))
    );
  }

  function resetFilters() {
    setSelectedCampusDraft(null);
    setSelectedRoomTypesDraft([]);
    setIsRecurringDraft(false);
    setSelectedDaysDraft([]);
    setReservationDatesDraft([]);
    setReservationDatesInputDraft("");
    setReservationDateDraft("");
    setReservationDateInputDraft("");
    setRecurringEndDateDraft("");
    setRecurringEndDateInputDraft("");
    setStartTimeDraft(getDefaultStartTime());
    setEndTimeDraft(getDefaultEndTime(null));
    setOpenCalendarField(null);
    setOpenTimeField(null);
    setCalendarMonth(new Date());
  }

  function applyTimeValue(field: "start" | "end", value: string) {
    if (field === "start") {
      const nextStartTime = getNearestTimeOption(
        startTimeOptions,
        value,
        timeStringToMinutes
      );
      setStartTimeDraft(nextStartTime);
      setEndTimeDraft(
        getNearestTimeOption(
          getEndTimeOptionsForRange(
            selectedCampusDraft,
            nextStartTime,
            minutesToTimeString,
            timeStringToMinutes
          ),
          endTimeDraft,
          timeStringToMinutes
        )
      );
      return;
    }

    setEndTimeDraft(getNearestTimeOption(endTimeOptions, value, timeStringToMinutes));
  }

  function updateTimeFromPicker(
    field: "start" | "end",
    parts: Partial<{ hour: string; minute: string; period: string }>
  ) {
    const currentParts = toTimeWheelParts(field === "start" ? startTimeDraft : endTimeDraft);
    const fieldOptions = field === "start" ? startTimeOptions : endTimeOptions;
    const nextPeriod = (parts.period ?? currentParts.period) as (typeof TIME_PERIOD_OPTIONS)[number];
    const validHours = getTimeWheelHoursForPeriod(fieldOptions, nextPeriod);
    const nextHour =
      parts.hour ?? (validHours.includes(currentParts.hour) ? currentParts.hour : validHours[0] ?? currentParts.hour);
    const normalizedHour = validHours.includes(nextHour) ? nextHour : validHours[0] ?? nextHour;
    const validMinutes = getTimeWheelMinutesForHour(fieldOptions, nextPeriod, normalizedHour);
    const requestedMinute = (parts.minute ?? currentParts.minute) as (typeof TIME_MINUTE_OPTIONS)[number];
    const nextMinute =
      validMinutes.includes(requestedMinute)
        ? requestedMinute
        : validMinutes[0] ?? currentParts.minute;
    const normalizedMinute = validMinutes.includes(nextMinute) ? nextMinute : validMinutes[0] ?? nextMinute;

    applyTimeValue(
      field,
      fromTimeWheelParts(
      normalizedHour,
      normalizedMinute,
      nextPeriod
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
        Math.min(timeWheelHoursForPeriod.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      updateTimeFromPicker(field, { hour: timeWheelHoursForPeriod[index] });
      return;
    }

    if (wheel === "minute") {
      const index = Math.max(
        0,
        Math.min(timeWheelMinutesForHour.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
      );
      updateTimeFromPicker(field, { minute: timeWheelMinutesForHour[index] });
      return;
    }

    const index = Math.max(
      0,
      Math.min(timeWheelPeriods.length - 1, Math.round(offsetY / TIME_WHEEL_ITEM_HEIGHT))
    );
    updateTimeFromPicker(field, { period: timeWheelPeriods[index] });
  }

  function handleReservationDatesInputBlur() {
    const parsedDate = parseEditableDateInput(reservationDatesInputDraft);

    if (!parsedDate) {
      return;
    }

    setReservationDatesDraft((currentValue) =>
      currentValue.includes(parsedDate)
        ? currentValue
        : [...currentValue, parsedDate].sort((left, right) => left.localeCompare(right))
    );
    setReservationDatesInputDraft("");
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

    setReservationDatesDraft((currentValue) =>
      currentValue.filter((value) => value !== dateKey)
    );
  }

  function toggleExpandedRoom(roomId: string) {
    setExpandedRoomId((currentValue) => (currentValue === roomId ? null : roomId));
    setWeekOffsets((currentValue) => ({
      ...currentValue,
      [roomId]: currentValue[roomId] ?? 0,
    }));
  }

  return (
    <View style={styles.wrapper}>
      <RoomSearchBar
        filtersOpen={filtersOpen}
        onQueryBlur={() => setSearchFocused(false)}
        onQueryFocus={() => setSearchFocused(true)}
        onToggleFilters={() => setFiltersOpen((currentValue) => !currentValue)}
        onQueryChange={setQuery}
        query={query}
      />
      <FilterBar />

      <RoomSearchFilters
        calendarMonthLabel={getMonthLabel(calendarMonth)}
        calendarWeeks={calendarWeeks}
        endDateInput={recurringEndDateInputDraft}
        endTimeLabel={formatTime12h(endTimeDraft)}
        filtersOpen={filtersOpen}
        getDayShortLabel={getDayShortLabel}
        hasActiveFilters={hasActiveFilters}
        isCalendarDateDisabled={(date, dateKey) =>
          isPastDate(date) ||
          (openCalendarField === "recurringEndDate" && Boolean(reservationDateDraft) && dateKey < reservationDateDraft)
        }
        isCalendarDateSelected={(dateKey) =>
          openCalendarField === "reservationDates"
            ? reservationDatesDraft.includes(dateKey)
            : openCalendarField === "reservationDate"
              ? reservationDateDraft === dateKey
              : recurringEndDateDraft === dateKey
        }
        isRecurring={isRecurringDraft}
        onCalendarDateSelect={handleCalendarDateSelect}
        onCalendarDone={() => setOpenCalendarField(null)}
        onEndDateBlur={handleRecurringEndDateBlur}
        onEndDateChange={setRecurringEndDateInputDraft}
        onEndDateCalendarPress={() => openCalendar("recurringEndDate")}
        onEndTimePress={() => toggleTimePicker("end")}
        onNextMonth={() => setCalendarMonth((currentValue) => addMonths(currentValue, 1))}
        onPrevMonth={() => setCalendarMonth((currentValue) => addMonths(currentValue, -1))}
        onRemoveReservationDate={removeReservationDate}
        onReservationDateBlur={isRecurringDraft ? handleReservationDateBlur : handleReservationDatesInputBlur}
        onReservationDateChange={isRecurringDraft ? setReservationDateInputDraft : setReservationDatesInputDraft}
        onReservationDateCalendarPress={() =>
          openCalendar(isRecurringDraft ? "reservationDate" : "reservationDates")
        }
        onResetFilters={resetFilters}
        onStartTimePress={() => toggleTimePicker("start")}
        onToggleCampus={toggleCampus}
        onToggleRoomType={toggleRoomType}
        onToggleDay={toggleSelectedDay}
        onToggleRecurring={setIsRecurringDraft}
        openCalendarField={openCalendarField}
        previewDates={reservationDateKeys}
        reservationDateInput={reservationDateInputDraft}
        reservationDatesInput={reservationDatesInputDraft}
        roomTypeOptions={roomTypeOptions}
        selectedCampus={selectedCampusDraft}
        selectedRoomTypes={selectedRoomTypesDraft}
        selectedDays={selectedDaysDraft}
        startTimeLabel={formatTime12h(startTimeDraft)}
      />

      <RoomTimePickerModal
        endTime={endTimeDraft}
        endTimeParts={endTimeParts}
        hourOptions={timeWheelHoursForPeriod}
        minuteOptions={timeWheelMinutesForHour}
        onClose={() => setOpenTimeField(null)}
        onTimeWheelScroll={handleTimeWheelScroll}
        openTimeField={openTimeField}
        periodOptions={timeWheelPeriods}
        selectedCampus={selectedCampusDraft}
        startTime={startTimeDraft}
        startTimeParts={startTimeParts}
      />

      {!resultsVisible ? (
        <View style={styles.defaultContentShell}>{children}</View>
      ) : (
        <SelectionRoomResults
          availabilityLoading={availabilityLoading}
          availableRooms={availableRooms}
          expandedRoomId={expandedRoomId}
          resultsFooter={resultsFooter}
          resultsHeadingVisible={resultsHeadingVisible}
          resultsTitle={resultsTitle}
          roomSchedules={roomSchedules}
          userReservations={userReservations}
          roomsError={roomsError}
          roomsLoading={roomsLoading}
          scheduleLoadingIds={scheduleLoadingIds}
          selectedSlotsByRoom={selectedSlotsByRoom}
          weekOffsets={weekOffsets}
          onOpenReservationFormForRoom={openReservationFormForRoom}
          onRoomPress={(roomId) =>
            router.push({
              pathname: "/(main)/rooms/[roomId]",
              params: { roomId },
            })
          }
          onToggleExpandedRoom={toggleExpandedRoom}
          onToggleSelectedTimeslot={toggleSelectedTimeslot}
          onWeekOffsetChange={(roomId, nextWeekOffset) =>
            setWeekOffsets((currentValue) => ({
              ...currentValue,
              [roomId]: nextWeekOffset,
            }))
          }
        />
      )}
    </View>
  );
}
