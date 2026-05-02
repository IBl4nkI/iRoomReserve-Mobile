export type ReservationCampus = "digi" | "main";
export type ReservationApprovalRole = "advisor" | "building_admin";
export type ReservationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "completed"
  | "cancelled";

export interface ReservationApprovalStep {
  role: ReservationApprovalRole;
  email: string;
}

export interface ReservationApprovalRecord extends ReservationApprovalStep {
  date?: {
    _nanoseconds?: number;
    _seconds?: number;
    nanoseconds?: number;
    seconds?: number;
  } | null;
  status: "approved";
}

export interface ReservationRecord {
  id: string;
  userId: string;
  userName: string;
  userRole: string;
  roomId: string;
  roomName: string;
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  date: string;
  startTime: string;
  endTime: string;
  programDepartmentOrganization?: string;
  purpose: string;
  approvalDocumentMimeType?: string;
  approvalDocumentName?: string;
  approvalDocumentPath?: string;
  approvalDocumentSize?: number;
  equipment?: Record<string, number>;
  approvalFlow: ReservationApprovalStep[];
  currentStep: number;
  approvals: ReservationApprovalRecord[];
  rejectedBy?: string;
  reason?: string;
  status: ReservationStatus;
  adminUid: string | null;
  recurringGroupId?: string;
  checkedInAt?:
    | {
        _nanoseconds?: number;
        _seconds?: number;
        nanoseconds?: number;
        seconds?: number;
      }
    | null;
  completedAt?:
    | {
        _nanoseconds?: number;
        _seconds?: number;
        nanoseconds?: number;
        seconds?: number;
      }
    | null;
  checkInMethod?: "manual" | "bluetooth" | null;
}

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
  | "Occupied"
  | "Unavailable";

export interface Room {
  id: string;
  beaconId?: string | null;
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
