import { apiRequest } from "@/services/api";
import type { ReservationCampus, ReservationRecord } from "@/types/reservation";

interface ReservationAttachmentPayload {
  approvalDocumentMimeType?: string;
  approvalDocumentName?: string;
  approvalDocumentPath?: string;
  approvalDocumentSize?: number;
}

interface ReservationCreateBaseInput extends ReservationAttachmentPayload {
  buildingId: string;
  buildingName: string;
  campus: ReservationCampus;
  endTime: string;
  equipment?: Record<string, number>;
  programDepartmentOrganization: string;
  purpose: string;
  roomId: string;
  roomName: string;
  startTime: string;
  userId: string;
  userName: string;
  userRole: string;
}

export type SingleReservationCreateInput =
  | (ReservationCreateBaseInput & {
      advisorEmail: string;
      campus: "main";
      date: string;
    })
  | (ReservationCreateBaseInput & {
      buildingAdminEmail: string;
      campus: "digi";
      date: string;
    });

export type RecurringReservationCreateInput =
  | (ReservationCreateBaseInput & {
      advisorEmail: string;
      campus: "main";
    })
  | (ReservationCreateBaseInput & {
      buildingAdminEmail: string;
      campus: "digi";
    });

export async function createReservation(
  reservation: SingleReservationCreateInput
): Promise<string> {
  const payload = await apiRequest<{ id: string }>("/api/reservations", {
    body: {
      reservation,
      type: "single",
    },
    method: "POST",
  });

  return payload.id;
}

export async function createRecurringReservation(
  reservation: RecurringReservationCreateInput,
  selectedDays: number[],
  startDate: string,
  endDate: string
): Promise<string[]> {
  const payload = await apiRequest<{ ids: string[] }>("/api/reservations", {
    body: {
      endDate,
      reservation,
      selectedDays,
      startDate,
      type: "recurring",
    },
    method: "POST",
  });

  return payload.ids;
}

export async function getReservationsByUser(
  userId: string
): Promise<ReservationRecord[]> {
  return apiRequest<ReservationRecord[]>("/api/reservations", {
    method: "GET",
    params: {
      statuses: "pending,approved,rejected,completed,cancelled",
      userId,
    },
  });
}

export async function getReservationsByCampus(
  campus: ReservationCampus
): Promise<ReservationRecord[]> {
  return apiRequest<ReservationRecord[]>("/api/reservations", {
    method: "GET",
    params: {
      campus,
      statuses: "pending,approved,rejected,completed,cancelled",
    },
  });
}

export async function getReservationsByRoom(
  roomId: string
): Promise<ReservationRecord[]> {
  return apiRequest<ReservationRecord[]>("/api/reservations", {
    method: "GET",
    params: {
      roomId,
      statuses: "pending,approved",
    },
  });
}

export async function checkInReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "check-in",
      method: "manual",
      userId,
    },
    method: "PATCH",
  });
}

export async function completeReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "complete",
      userId,
    },
    method: "PATCH",
  });
}
