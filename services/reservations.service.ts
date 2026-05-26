import { apiRequest } from "@/services/api";
import type { ReservationCampus, ReservationRecord } from "@/types/reservation";

interface ReservationAttachmentPayload {
  approvalDocumentMimeType?: string;
  approvalDocumentName?: string;
  approvalDocumentPath?: string;
  approvalDocumentSize?: number;
  approvalDocumentUrl?: string;
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
      advisorEmail?: string;
      buildingAdminEmail?: string;
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
      advisorEmail?: string;
      buildingAdminEmail?: string;
      campus: "main";
    })
  | (ReservationCreateBaseInput & {
      buildingAdminEmail: string;
      campus: "digi";
    });

export type ReservationPresenceAppState = "background" | "foreground";
export type ReservationPresenceStatus =
  | "healthy"
  | "stopped"
  | "timed_out"
  | "warning";

export interface ReservationPresenceHeartbeatResponse {
  healthy: boolean;
  status: ReservationPresenceStatus;
  timedOut: boolean;
}

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
  userId: string,
  method: "bluetooth" | "manual" = "manual"
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "check-in",
      method,
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

export async function cancelReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "cancel",
      userId,
    },
    method: "PATCH",
  });
}

export async function deleteReservation(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "delete",
      userId,
    },
    method: "PATCH",
  });
}

export async function startReservationPresenceMonitor(
  reservationId: string,
  userId: string,
  beaconId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "start-monitor",
      beaconId,
      userId,
    },
    method: "PATCH",
  });
}

export async function sendReservationPresenceHeartbeat(
  reservationId: string,
  input: {
    appState: ReservationPresenceAppState;
    beaconId?: string;
    bluetoothOn: boolean;
    checkedAt?: string;
    inRange: boolean;
    rssi?: number | null;
    userId: string;
  }
): Promise<ReservationPresenceHeartbeatResponse> {
  return apiRequest<ReservationPresenceHeartbeatResponse>(
    `/api/reservations/${reservationId}`,
    {
      body: {
        action: "presence-heartbeat",
        ...input,
      },
      method: "PATCH",
    }
  );
}

export async function stopReservationPresenceMonitor(
  reservationId: string,
  userId: string
): Promise<void> {
  await apiRequest(`/api/reservations/${reservationId}`, {
    body: {
      action: "stop-monitor",
      userId,
    },
    method: "PATCH",
  });
}
