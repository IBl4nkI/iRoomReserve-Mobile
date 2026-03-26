import { apiRequest } from "@/services/api";
import type { Schedule } from "@/types/reservation";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function sortSchedules(left: Schedule, right: Schedule) {
  return (
    left.dayOfWeek - right.dayOfWeek ||
    left.startTime.localeCompare(right.startTime) ||
    left.roomName.localeCompare(right.roomName)
  );
}

export function formatTime12h(time24: string): string {
  const [hourString, minuteString] = time24.split(":");
  let hour = parseInt(hourString, 10);
  const suffix = hour >= 12 ? "PM" : "AM";

  if (hour === 0) {
    hour = 12;
  } else if (hour > 12) {
    hour -= 12;
  }

  return `${hour}:${minuteString} ${suffix}`;
}

export async function getSchedulesByRoomId(roomId: string): Promise<Schedule[]> {
  const schedules = await apiRequest<Schedule[]>("/api/schedules", {
    params: { roomId },
  });

  return schedules.sort(sortSchedules);
}
