import { apiRequest } from "@/services/api";
import type { Room } from "@/types/reservation";

const ROOM_QUERY_CACHE_TTL_MS = 15_000;

type RoomQueryCacheEntry = {
  expiresAt: number;
  value: Room[];
};

const roomQueryCache = new Map<string, RoomQueryCacheEntry>();

async function getCachedRoomQuery(
  cacheKey: string,
  fetcher: () => Promise<Room[]>,
  options?: {
    forceRefresh?: boolean;
  }
) {
  if (!options?.forceRefresh) {
    const cachedValue = roomQueryCache.get(cacheKey);
    if (cachedValue && cachedValue.expiresAt > Date.now()) {
      return cachedValue.value;
    }
  }

  const rooms = await fetcher();
  roomQueryCache.set(cacheKey, {
    expiresAt: Date.now() + ROOM_QUERY_CACHE_TTL_MS,
    value: rooms,
  });
  return rooms;
}

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

export async function getRoomsByIds(
  roomIds: string[],
  options?: {
    forceRefresh?: boolean;
  }
): Promise<Room[]> {
  if (roomIds.length === 0) {
    return [];
  }

  const normalizedRoomIds = [...roomIds].sort();

  return getCachedRoomQuery(
    `ids:${normalizedRoomIds.join(",")}`,
    () =>
      apiRequest<Room[]>("/api/rooms", {
        params: { roomIds: normalizedRoomIds.join(",") },
      }),
    options
  );
}
