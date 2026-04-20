import { formatFullDate } from "@/lib/reservation-search";
import { formatTime12h } from "@/services/schedules.service";
import type { ReservationCampus } from "@/types/reservation";

export const TIME_MINUTE_OPTIONS = ["00", "30"] as const;
export const TIME_PERIOD_OPTIONS = ["AM", "PM"] as const;
export const TIME_WHEEL_ITEM_HEIGHT = 72;

export interface SelectedTimeslot {
  dateKey: string;
  endTime: string;
  startTime: string;
  state: "available" | "pending";
}

export function getSelectedTimeslotKey(
  slot: Pick<SelectedTimeslot, "dateKey" | "startTime" | "endTime">
) {
  return `${slot.dateKey}-${slot.startTime}-${slot.endTime}`;
}

export function buildSelectionLabel(selectedSlots: SelectedTimeslot[]) {
  const uniqueDateKeys = [...new Set(selectedSlots.map((slot) => slot.dateKey))];
  return uniqueDateKeys
    .map((dateKey) => formatFullDate(new Date(`${dateKey}T00:00:00`)))
    .join(", ");
}

export function buildTimeslotLabel(selectedSlots: SelectedTimeslot[]) {
  const groupedSlots = selectedSlots.reduce<Record<string, SelectedTimeslot[]>>(
    (result, slot) => {
      if (!result[slot.dateKey]) {
        result[slot.dateKey] = [];
      }

      result[slot.dateKey].push(slot);
      return result;
    },
    {}
  );

  return Object.entries(groupedSlots)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([dateKey, slots]) => {
      const orderedSlots = [...slots].sort((left, right) =>
        left.startTime.localeCompare(right.startTime)
      );

      return `${formatFullDate(new Date(`${dateKey}T00:00:00`))}: ${orderedSlots
        .map(
          (slot) => `${formatTime12h(slot.startTime)} - ${formatTime12h(slot.endTime)}`
        )
        .join(", ")}`;
    })
    .join(" | ");
}

export function areSelectedSlotsConsecutive(selectedSlots: SelectedTimeslot[]) {
  const groupedSlots = selectedSlots.reduce<Record<string, SelectedTimeslot[]>>(
    (result, slot) => {
      if (!result[slot.dateKey]) {
        result[slot.dateKey] = [];
      }

      result[slot.dateKey].push(slot);
      return result;
    },
    {}
  );

  return Object.values(groupedSlots).every((slots) => {
    const orderedSlots = [...slots].sort((left, right) =>
      left.startTime.localeCompare(right.startTime)
    );

    return orderedSlots.every((slot, index) => {
      if (index === 0) {
        return true;
      }

      return orderedSlots[index - 1].endTime === slot.startTime;
    });
  });
}

export function addDays(date: Date, amount: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

export function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

export function formatDisplayDate(dateKey: string) {
  if (!dateKey) {
    return "";
  }

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year.slice(-2)}`;
}

export function formatDisplayDateLong(dateKey: string) {
  if (!dateKey) {
    return "";
  }

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year}`;
}

export function formatDisplayDateShort(dateKey: string) {
  if (!dateKey) {
    return "";
  }

  const [year, month, day] = dateKey.split("-");

  if (!year || !month || !day) {
    return dateKey;
  }

  return `${day}/${month}/${year.slice(-2)}`;
}

export function getMonthLabel(date: Date) {
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getCalendarWeeks(monthDate: Date) {
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

export function parseEditableDateInput(value: string) {
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);

  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 2025) {
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

export function parseEditableDateList(value: string) {
  return value
    .split(",")
    .map((entry) => parseEditableDateInput(entry))
    .filter((entry): entry is string => Boolean(entry))
    .filter((entry, index, all) => all.indexOf(entry) === index)
    .sort((left, right) => left.localeCompare(right));
}

export function getSelectedTimeRange(campus: ReservationCampus | null) {
  if (!campus) {
    return {
      startMinutes: 7 * 60,
      endMinutes: 21 * 60,
    };
  }

  return campus === "digi"
    ? { startMinutes: 7 * 60, endMinutes: 17 * 60 }
    : { startMinutes: 7 * 60, endMinutes: 21 * 60 };
}

export function getDefaultStartTime() {
  return "07:00";
}

export function getDefaultEndTime(campus: ReservationCampus | null) {
  return `${String(Math.floor(getSelectedTimeRange(campus).endMinutes / 60)).padStart(
    2,
    "0"
  )}:${String(getSelectedTimeRange(campus).endMinutes % 60).padStart(2, "0")}`;
}

export function getStartTimeOptions(
  campus: ReservationCampus | null,
  minutesToTimeString: (value: number) => string,
  timeStringToMinutes: (value: string) => number
) {
  const { startMinutes, endMinutes } = getSelectedTimeRange(campus);
  const options: string[] = [];

  for (let minutes = startMinutes; minutes <= endMinutes; minutes += 30) {
    options.push(minutesToTimeString(minutes));
  }

  return options.filter(
    (value) =>
      timeStringToMinutes(value) <= timeStringToMinutes(getDefaultEndTime(campus)) - 60
  );
}

export function getEndTimeOptionsForRange(
  campus: ReservationCampus | null,
  startTime: string,
  minutesToTimeString: (value: number) => string,
  timeStringToMinutes: (value: string) => number
) {
  const { startMinutes: earliestMinutes, endMinutes } = getSelectedTimeRange(campus);
  const options: string[] = [];

  for (let minutes = earliestMinutes; minutes <= endMinutes; minutes += 30) {
    options.push(minutesToTimeString(minutes));
  }

  const startMinutes = timeStringToMinutes(startTime || getDefaultStartTime());

  return options.filter((value) => timeStringToMinutes(value) - startMinutes >= 60);
}

export function toTimeWheelParts(value: string): {
  hour: string;
  minute: (typeof TIME_MINUTE_OPTIONS)[number];
  period: (typeof TIME_PERIOD_OPTIONS)[number];
} {
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
    minute: minuteString === "30" ? "30" : "00",
    period,
  };
}

export function fromTimeWheelParts(hour: string, minute: string, period: string) {
  let hourNumber = Number(hour);

  if (period === "AM") {
    hourNumber = hourNumber === 12 ? 0 : hourNumber;
  } else if (hourNumber !== 12) {
    hourNumber += 12;
  }

  return `${String(hourNumber).padStart(2, "0")}:${minute}`;
}

export function getTimeWheelPeriods(options: string[]) {
  return TIME_PERIOD_OPTIONS.filter((period) =>
    options.some((value) => toTimeWheelParts(value).period === period)
  );
}

export function getTimeWheelHoursForPeriod(
  options: string[],
  period: (typeof TIME_PERIOD_OPTIONS)[number]
) {
  return options.reduce<string[]>((hours, value) => {
    const parts = toTimeWheelParts(value);

    if (parts.period !== period || hours.includes(parts.hour)) {
      return hours;
    }

    return [...hours, parts.hour];
  }, []);
}

export function getTimeWheelMinutesForHour(
  options: string[],
  period: (typeof TIME_PERIOD_OPTIONS)[number],
  hour: string
) {
  return options.reduce<Array<(typeof TIME_MINUTE_OPTIONS)[number]>>((minutes, value) => {
    const parts = toTimeWheelParts(value);

    if (
      parts.period !== period ||
      parts.hour !== hour ||
      minutes.includes(parts.minute)
    ) {
      return minutes;
    }

    return [...minutes, parts.minute];
  }, []);
}

export function getNearestTimeOption(
  options: string[],
  value: string,
  timeStringToMinutes: (value: string) => number
) {
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
