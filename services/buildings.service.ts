import { apiRequest } from "@/services/api";
import type { Building, ReservationCampus } from "@/types/reservation";

export async function getBuildings(): Promise<Building[]> {
  return apiRequest<Building[]>("/api/buildings");
}

export async function getBuildingsByCampus(
  campus: ReservationCampus
): Promise<Building[]> {
  return apiRequest<Building[]>("/api/buildings", {
    params: { campus },
  });
}

export async function getBuildingById(buildingId: string): Promise<Building | null> {
  return apiRequest<Building>(`/api/buildings/${buildingId}`);
}
