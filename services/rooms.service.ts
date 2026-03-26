import { apiRequest } from "@/services/api";
import type { Room } from "@/types/reservation";

export async function getRoomsByBuilding(buildingId: string): Promise<Room[]> {
  return apiRequest<Room[]>("/api/rooms", {
    params: { buildingId },
  });
}

export async function getRoomsByBuildingAndFloor(
  buildingId: string,
  floorLabel: string
): Promise<Room[]> {
  return apiRequest<Room[]>("/api/rooms", {
    params: { buildingId, floor: floorLabel },
  });
}

export async function getRoomById(roomId: string): Promise<Room | null> {
  return apiRequest<Room>(`/api/rooms/${roomId}`);
}

export async function getRoomsByIds(roomIds: string[]): Promise<Room[]> {
  if (roomIds.length === 0) {
    return [];
  }

  return apiRequest<Room[]>("/api/rooms", {
    params: { roomIds: roomIds.join(",") },
  });
}
