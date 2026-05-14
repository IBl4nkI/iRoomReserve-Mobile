import type { Building, FloorOption, Room } from "@/types/reservation";

const DIGITAL_CAMPUS_FLOOR_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "1st Floor", value: "Ground Floor" },
  { label: "2nd Floor", value: "1st Floor" },
  { label: "3rd Floor", value: "2nd Floor" },
  { label: "4th Floor", value: "3rd Floor" },
];

const DIGITAL_CAMPUS_FLOOR_LABELS = new Map(
  DIGITAL_CAMPUS_FLOOR_OPTIONS.map((option) => [option.value, option.label])
);

type FloorMappedRoom = Pick<Room, "buildingId" | "buildingName" | "floor"> & {
  campus?: string | null;
};

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

export function formatCompactFloorLabel(label?: string | null) {
  const normalized = normalizeFloorLabel(label);

  if (!normalized) {
    return "";
  }

  if (normalized === "Basement") {
    return "B";
  }

  const match = normalized.match(/(\d+)/);
  return match ? match[1] : normalized;
}

export function formatExpandedFloorLabel(label?: string | null) {
  const normalized = normalizeFloorLabel(label);

  if (!normalized) {
    return "";
  }

  if (normalized === "Basement" || normalized.includes("Floor")) {
    return normalized;
  }

  if (normalized === "B") {
    return "Basement";
  }

  const level = Number(normalized);

  if (!Number.isNaN(level)) {
    return formatOrdinalFloor(level);
  }

  return normalized;
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

function normalizeMainCampusFloorLabel(label?: string | null) {
  const trimmed = label?.trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed === "Basement Floor") {
    return "Basement";
  }

  if (trimmed === "Ground Floor") {
    return "1st Floor";
  }

  return trimmed;
}

function isDigitalCampusRoom(room: FloorMappedRoom) {
  if (room.campus === "digi") {
    return true;
  }

  const buildingId = room.buildingId.toLowerCase();
  const buildingName = room.buildingName.toLowerCase();

  return buildingId.startsWith("dig") || buildingName.includes("digital");
}

export function getRoomFloorLabel(room: FloorMappedRoom) {
  if (isDigitalCampusRoom(room)) {
    return DIGITAL_CAMPUS_FLOOR_LABELS.get(room.floor) ?? room.floor;
  }

  return normalizeMainCampusFloorLabel(room.floor) ?? room.floor;
}

export function getRoomFloorId(room: FloorMappedRoom) {
  return createFloorId(getRoomFloorLabel(room));
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
  if (isDigitalCampusRoom(room)) {
    return room.floor.trim() === floorLabel;
  }

  return getRoomFloorLabel(room) === floorLabel;
}

export function buildBuildingFloorOptions(
  building: Building,
  rooms: Room[]
): FloorOption[] {
  const floorLabels = dedupeFloorLabels([
    ...getBuildingFloorOptions(building.id, building.floors),
    ...rooms.map((room) => getRoomFloorLabel(room)),
  ]);

  return floorLabels.map((label) => ({
    id: createFloorId(label),
    label,
    roomCount: rooms.filter((room) => isRoomOnFloor(room, label)).length,
    value: label,
  }));
}

export function buildCampusFloorOptions(
  buildings: Building[],
  rooms: Room[]
): FloorOption[] {
  const isDigitalCampusOnly =
    buildings.length > 0 && buildings.every((building) => building.campus === "digi");

  if (isDigitalCampusOnly) {
    return DIGITAL_CAMPUS_FLOOR_OPTIONS.map((option) => ({
      id: createFloorId(option.label),
      label: option.label,
      roomCount: rooms.filter((room) => isRoomOnFloor(room, option.value)).length,
      value: option.value,
    }));
  }

  const floorLabels = dedupeFloorLabels([
    ...buildings.flatMap((building) =>
      getBuildingFloorOptions(building.id, building.floors)
    ),
    ...rooms.map((room) => getRoomFloorLabel(room)),
  ]);

  return floorLabels.map((label) => ({
    id: createFloorId(label),
    label,
    roomCount: rooms.filter((room) => isRoomOnFloor(room, label)).length,
    value: label,
  }));
}

export function getFloorLabelById(options: FloorOption[], floorId: string) {
  return options.find((option) => option.id === floorId)?.label ?? null;
}

export function getFloorValueById(options: FloorOption[], floorId: string) {
  const option = options.find((entry) => entry.id === floorId);
  return option?.value ?? option?.label ?? null;
}
