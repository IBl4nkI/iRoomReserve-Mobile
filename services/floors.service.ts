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

export function normalizeFloorLabel(label?: string | null) {
  const trimmed = label?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed === "Basement Floor") {
    return "Basement";
  }

  if (trimmed === "Ground Floor") {
    return null;
  }

  return trimmed;
}

export function getBuildingFloorOptions(buildingId?: string, buildingFloors?: number) {
  switch ((buildingId ?? "").toLowerCase()) {
    case "gd1":
      return [
        "Basement",
        ...Array.from({ length: 8 }, (_, index) => formatOrdinalFloor(index + 1)),
      ];
    case "gd2":
      return Array.from({ length: 10 }, (_, index) => formatOrdinalFloor(index + 1));
    case "gd3":
      return Array.from({ length: 11 }, (_, index) => formatOrdinalFloor(index + 1));
    default:
      return Array.from({ length: buildingFloors || 5 }, (_, index) =>
        formatOrdinalFloor(index + 1)
      );
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
  const normalizedLabels = labels.reduce<string[]>((result, label) => {
    const normalizedLabel = normalizeFloorLabel(label);

    if (normalizedLabel) {
      result.push(normalizedLabel);
    }

    return result;
  }, []);

  return [...new Set(normalizedLabels)].sort(
    (left, right) =>
      getFloorSortOrder(left) - getFloorSortOrder(right) || left.localeCompare(right)
  );
}

export function isRoomOnFloor(room: Room, floorLabel: string) {
  return normalizeFloorLabel(room.floor) === floorLabel;
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
    roomCount: rooms.filter((room) => isRoomOnFloor(room, label)).length,
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
    roomCount: rooms.filter((room) => isRoomOnFloor(room, label)).length,
  }));
}

export function getFloorLabelById(options: FloorOption[], floorId: string) {
  return options.find((option) => option.id === floorId)?.label ?? null;
}
