import type { Building, FloorOption, Room } from "@/types/reservation";

function formatOrdinalFloor(level: number) {
  switch (level) {
    case 1:
      return "1st Floor";
    case 2:
      return "2nd Floor";
    case 3:
      return "3rd Floor";
    default:
      return `${level}th Floor`;
  }
}

export function getBuildingFloorOptions(buildingId?: string, buildingFloors?: number) {
  switch ((buildingId ?? "").toLowerCase()) {
    case "gd1":
      return [
        "Basement Floor",
        "Ground Floor",
        ...Array.from({ length: 7 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    case "gd2":
      return [
        "Ground Floor",
        ...Array.from({ length: 9 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    case "gd3":
      return [
        "Ground Floor",
        ...Array.from({ length: 10 }, (_, index) => formatOrdinalFloor(index + 2)),
      ];
    default:
      return Array.from({ length: buildingFloors || 5 }, (_, index) => {
        if (index === 0) {
          return "Ground Floor";
        }

        return formatOrdinalFloor(index + 1);
      });
  }
}

export function createFloorId(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getFloorSortOrder(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("basement")) {
    return -1;
  }

  if (normalized.includes("ground")) {
    return 0;
  }

  const match = normalized.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 999;
}

function dedupeFloorLabels(labels: string[]) {
  return [...new Set(labels.filter(Boolean))].sort(
    (left, right) =>
      getFloorSortOrder(left) - getFloorSortOrder(right) ||
      left.localeCompare(right)
  );
}

export function buildBuildingFloorOptions(
  building: Building,
  rooms: Room[]
): FloorOption[] {
  const floorLabels = dedupeFloorLabels([
    ...getBuildingFloorOptions(building.id, building.floors),
    ...rooms.map((room) => room.floor),
  ]);

  return floorLabels.map((label) => ({
    id: createFloorId(label),
    label,
    roomCount: rooms.filter((room) => room.floor === label).length,
  }));
}

export function buildCampusFloorOptions(
  buildings: Building[],
  rooms: Room[]
): FloorOption[] {
  const floorLabels = dedupeFloorLabels([
    ...buildings.flatMap((building) =>
      getBuildingFloorOptions(building.id, building.floors)
    ),
    ...rooms.map((room) => room.floor),
  ]);

  return floorLabels.map((label) => ({
    id: createFloorId(label),
    label,
    roomCount: rooms.filter((room) => room.floor === label).length,
  }));
}

export function getFloorLabelById(options: FloorOption[], floorId: string) {
  return options.find((option) => option.id === floorId)?.label ?? null;
}
