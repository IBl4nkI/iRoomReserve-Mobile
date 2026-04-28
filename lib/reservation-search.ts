import { DAY_NAMES } from "@/services/schedules.service";
import type {
  ReservationCampus,
  ReservationRecord,
  Room,
  Schedule,
} from "@/types/reservation";

export const CAMPUS_LABELS: Record<ReservationCampus, string> = {
  digi: "Digital Campus",
  main: "Main Campus",
};

export const CAMPUS_TIME_RANGES: Record<
  ReservationCampus,
  { endMinutes: number; startMinutes: number }
> = {
  digi: { startMinutes: 7 * 60, endMinutes: 17 * 60 },
  main: { startMinutes: 7 * 60, endMinutes: 21 * 60 },
};

export const SELECTABLE_DAY_INDICES = [1, 2, 3, 4, 5, 6] as const;

export interface TimeSlotDefinition {
  endTime: string;
  startTime: string;
}

export interface TimeSlotViewModel extends TimeSlotDefinition {
  description: string;
  state: "available" | "pending" | "unavailable";
  unavailableReason?:
    | "schedule_conflict"
    | "room_reserved"
    | "room_pending"
    | "user_conflict";
}

export const SLOT_DEFINITIONS: TimeSlotDefinition[] = [
  { startTime: "07:00", endTime: "08:00" },
  { startTime: "08:00", endTime: "09:00" },
  { startTime: "09:00", endTime: "10:00" },
  { startTime: "10:00", endTime: "11:00" },
  { startTime: "11:00", endTime: "12:00" },
  { startTime: "12:00", endTime: "13:00" },
  { startTime: "13:00", endTime: "14:00" },
  { startTime: "14:00", endTime: "15:00" },
  { startTime: "15:00", endTime: "16:00" },
  { startTime: "16:00", endTime: "17:00" },
  { startTime: "17:00", endTime: "18:00" },
  { startTime: "18:00", endTime: "19:00" },
  { startTime: "19:00", endTime: "20:00" },
  { startTime: "20:00", endTime: "21:00" },
];

export interface SearchRoom extends Room {
  campus: ReservationCampus | null;
  campusName: string;
}

export function getRoomCampus(room: Pick<Room, "buildingId" | "buildingName">) {
  const buildingId = room.buildingId.toLowerCase();
  const buildingName = room.buildingName.toLowerCase();

  if (
    buildingId.startsWith("dig") ||
    buildingName.includes("digital")
  ) {
    return "digi" as const;
  }

  return "main" as const;
}

export function toSearchRoom(room: Room): SearchRoom {
  const campus = getRoomCampus(room);

  return {
    ...room,
    campus,
    campusName: CAMPUS_LABELS[campus],
  };
}

export function timeStringToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTimeString(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getCampusTimeOptions(campus: ReservationCampus | null) {
  if (!campus) {
    return [];
  }

  const { startMinutes, endMinutes } = CAMPUS_TIME_RANGES[campus];
  const options: string[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
    options.push(minutesToTimeString(minutes));
  }

  return options;
}

export function getSlotDefinitionsForCampus(campus: ReservationCampus | null) {
  if (!campus) {
    return SLOT_DEFINITIONS;
  }

  const { endMinutes } = CAMPUS_TIME_RANGES[campus];

  return SLOT_DEFINITIONS.filter(
    (slot) => timeStringToMinutes(slot.endTime) <= endMinutes
  );
}

export function isTimeRangeValid(
  campus: ReservationCampus | null,
  startTime: string,
  endTime: string
) {
  if (!campus || !startTime || !endTime) {
    return false;
  }

  const { startMinutes, endMinutes } = CAMPUS_TIME_RANGES[campus];
  const start = timeStringToMinutes(startTime);
  const end = timeStringToMinutes(endTime);

  return (
    start >= startMinutes &&
    end <= endMinutes &&
    start % 30 === 0 &&
    end % 30 === 0 &&
    end - start >= 60
  );
}

export function formatDateInputValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

export function getDefaultReservationDate() {
  const date = startOfToday();

  while (!SELECTABLE_DAY_INDICES.includes(date.getDay() as 1 | 2 | 3 | 4 | 5 | 6)) {
    date.setDate(date.getDate() + 1);
  }

  return formatDateInputValue(date);
}

export function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

export function getMondayOfWeek(date: Date) {
  const localDate = new Date(date);
  localDate.setHours(0, 0, 0, 0);

  const day = localDate.getDay();
  const difference = day === 0 ? -6 : 1 - day;
  localDate.setDate(localDate.getDate() + difference);

  return localDate;
}

export function toDateKey(date: Date) {
  return formatDateInputValue(date);
}

export function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
}

export function formatFullDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    weekday: "long",
    year: "numeric",
  });
}

export function formatWeekLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function isPastDate(date: Date) {
  return date.getTime() < startOfToday().getTime();
}

export function getPreviewDates(
  reservationDate: string,
  recurringEndDate: string,
  selectedDays: number[]
) {
  if (!reservationDate || !recurringEndDate || selectedDays.length === 0) {
    return [];
  }

  const dates: string[] = [];
  const current = new Date(`${reservationDate}T00:00:00`);
  const end = new Date(`${recurringEndDate}T00:00:00`);

  while (current <= end && dates.length < 20) {
    if (selectedDays.includes(current.getDay())) {
      dates.push(toDateKey(current));
    }

    current.setDate(current.getDate() + 1);
  }

  return dates;
}

export function getReservationDateKeys(options: {
  isRecurring: boolean;
  recurringEndDate: string;
  reservationDate: string;
  selectedDays: number[];
}) {
  const { isRecurring, recurringEndDate, reservationDate, selectedDays } = options;

  if (isRecurring) {
    return getPreviewDates(reservationDate, recurringEndDate, selectedDays);
  }

  return reservationDate ? [reservationDate] : [];
}

export function buildRoomSearchText(room: SearchRoom) {
  return [
    room.name,
    room.campusName,
    room.buildingName,
    room.floor,
    room.roomType,
  ]
    .join(" ")
    .toLowerCase();
}

export function slotsOverlap(left: TimeSlotDefinition, right: TimeSlotDefinition) {
  return (
    timeStringToMinutes(left.startTime) < timeStringToMinutes(right.endTime) &&
    timeStringToMinutes(left.endTime) > timeStringToMinutes(right.startTime)
  );
}

export function getDeterministicHash(value: string) {
  return value.split("").reduce((sum, character, index) => {
    return sum + character.charCodeAt(0) * (index + 1);
  }, 0);
}

export function buildTimeSlots(
  roomId: string,
  dateKey: string,
  schedules: Schedule[],
  reservations: ReservationRecord[] = [],
  userReservations: ReservationRecord[] = []
): TimeSlotViewModel[] {
  const date = new Date(`${dateKey}T00:00:00`);
  const dayOfWeek = date.getDay();
  const matchingSchedules = schedules.filter(
    (schedule) => schedule.dayOfWeek === dayOfWeek
  );
  const matchingReservations = reservations.filter(
    (reservation) => reservation.roomId === roomId && reservation.date === dateKey
  );
  const matchingUserReservations = userReservations.filter(
    (reservation) =>
      reservation.roomId !== roomId &&
      reservation.date === dateKey &&
      (reservation.status === "pending" || reservation.status === "approved")
  );

  return SLOT_DEFINITIONS.map((slot) => {
    const blockedSchedule = matchingSchedules.find((schedule) =>
      slotsOverlap(slot, {
        endTime: schedule.endTime,
        startTime: schedule.startTime,
      })
    );

    if (blockedSchedule) {
      return {
        ...slot,
        description: `${blockedSchedule.subjectName} with ${blockedSchedule.instructorName}`,
        state: "unavailable" as const,
        unavailableReason: "schedule_conflict" as const,
      };
    }

    const approvedReservation = matchingReservations.find(
      (reservation) =>
        reservation.status === "approved" &&
        slotsOverlap(slot, {
          endTime: reservation.endTime,
          startTime: reservation.startTime,
        })
    );

    if (approvedReservation) {
      return {
        ...slot,
        description: "This timeslot is already reserved.",
        state: "unavailable" as const,
        unavailableReason: "room_reserved" as const,
      };
    }

    const pendingReservation = matchingReservations.find(
      (reservation) =>
        reservation.status === "pending" &&
        slotsOverlap(slot, {
          endTime: reservation.endTime,
          startTime: reservation.startTime,
        })
    );

    if (pendingReservation) {
      const currentApprovalStep =
        pendingReservation.approvalFlow?.[pendingReservation.currentStep];
      const waitingLabel =
        currentApprovalStep?.role === "advisor"
          ? "awaiting faculty approval"
          : currentApprovalStep?.role === "building_admin"
            ? "awaiting building admin approval"
            : "awaiting approval";

      return {
        ...slot,
        description: `There is an ongoing reservation request for this timeslot, currently ${waitingLabel}.`,
        state: "pending" as const,
      };
    }

    const conflictingUserReservation = matchingUserReservations.find((reservation) =>
      slotsOverlap(slot, {
        endTime: reservation.endTime,
        startTime: reservation.startTime,
      })
    );

    if (conflictingUserReservation) {
      return {
        ...slot,
        description:
          conflictingUserReservation.status === "approved"
            ? `You already have an approved reservation for this timeslot in ${conflictingUserReservation.roomName}.`
            : `You already have an ongoing reservation request for this timeslot in ${conflictingUserReservation.roomName}.`,
        state: "unavailable" as const,
        unavailableReason: "user_conflict" as const,
      };
    }

    return {
      ...slot,
      description: "This timeslot is available for reservation.",
      state: "available" as const,
    };
  });
}

export function isRoomAvailableForRequest(
  room: SearchRoom,
  schedules: Schedule[],
  dateKeys: string[],
  startTime: string,
  endTime: string,
  userReservations: ReservationRecord[] = []
) {
  if (dateKeys.length === 0 || !startTime || !endTime) {
    return true;
  }

  const requestSlot = { startTime, endTime };

  return dateKeys.every((dateKey) => {
    const date = new Date(`${dateKey}T00:00:00`);
    const dayOfWeek = date.getDay();

    if (!SELECTABLE_DAY_INDICES.includes(dayOfWeek as 1 | 2 | 3 | 4 | 5 | 6)) {
      return false;
    }

    const hasScheduleConflict = schedules.some(
      (schedule) =>
        schedule.dayOfWeek === dayOfWeek &&
        slotsOverlap(requestSlot, {
          endTime: schedule.endTime,
          startTime: schedule.startTime,
        })
    );

    if (hasScheduleConflict) {
      return false;
    }

    return !userReservations.some(
      (reservation) =>
        reservation.roomId !== room.id &&
        reservation.date === dateKey &&
        (reservation.status === "pending" || reservation.status === "approved") &&
        slotsOverlap(requestSlot, {
          endTime: reservation.endTime,
          startTime: reservation.startTime,
        })
    );
  });
}

export function getInitialExpandedDates(reservationDateKeys: string[]) {
  return reservationDateKeys.slice(0, 6);
}

export function getWeekDates(weekOffset: number) {
  const anchorDate = startOfToday();

  while (!SELECTABLE_DAY_INDICES.includes(anchorDate.getDay() as 1 | 2 | 3 | 4 | 5 | 6)) {
    anchorDate.setDate(anchorDate.getDate() + 1);
  }

  const currentDate = addDays(anchorDate, weekOffset * 7);
  const dates: Date[] = [];

  while (dates.length < SELECTABLE_DAY_INDICES.length) {
    if (SELECTABLE_DAY_INDICES.includes(currentDate.getDay() as 1 | 2 | 3 | 4 | 5 | 6)) {
      dates.push(new Date(currentDate));
    }

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return dates;
}

export function formatSelectionLabel(dateKey: string) {
  return formatFullDate(new Date(`${dateKey}T00:00:00`));
}

export function getDayShortLabel(dayOfWeek: number) {
  return DAY_NAMES[dayOfWeek].slice(0, 3);
}
