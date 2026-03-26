export type ReservationCampus = "digi" | "main";

export interface Building {
  id: string;
  name: string;
  code: string;
  address: string;
  floors: number;
  campus: ReservationCampus;
  assignedAdminUid: string | null;
}

export type RoomStatusValue =
  | "Available"
  | "Reserved"
  | "Ongoing"
  | "Unavailable";

export interface Room {
  id: string;
  name: string;
  floor: string;
  roomType: string;
  acStatus: string;
  tvProjectorStatus: string;
  capacity: number;
  status: RoomStatusValue;
  buildingId: string;
  buildingName: string;
  reservedBy: string | null;
  activeReservationId?: string | null;
}

export interface Schedule {
  id: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  subjectName: string;
  instructorName: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  createdBy: string;
}

export interface FloorOption {
  id: string;
  label: string;
  roomCount: number;
}
