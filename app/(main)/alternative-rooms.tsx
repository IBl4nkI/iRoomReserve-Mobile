import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import FilterBar from "@/components/FilterBar";
import type { FilterLevel, LevelOption } from "@/components/SelectionFilterContext";
import SelectionScreenLayout from "@/components/SelectionScreenLayout";
import { colors, fonts } from "@/constants/theme";
import {
  buildTimeSlots,
  formatFullDate,
  getRoomCampus,
  toSearchRoom,
  type SearchRoom,
} from "@/lib/reservation-search";
import { auth } from "@/services/firebase";
import { getBuildings } from "@/services/buildings.service";
import {
  buildBuildingFloorOptions,
  buildCampusFloorOptions,
  getRoomFloorId,
} from "@/services/floors.service";
import {
  getReservationsByRoom,
  getReservationsByUser,
} from "@/services/reservations.service";
import {
  getRoomById,
  getRoomsByBuilding,
  getRoomsByBuildingAndFloor,
} from "@/services/rooms.service";
import { formatTime12h, getSchedulesByRoomId } from "@/services/schedules.service";
import type { Building, ReservationRecord, Room, Schedule } from "@/types/reservation";

type MatchFilters = {
  sameAcStatus: boolean;
  sameCapacity: boolean;
  sameTvProjectorStatus: boolean;
  sameType: boolean;
};

const DEFAULT_MATCH_FILTERS: MatchFilters = {
  sameAcStatus: true,
  sameCapacity: true,
  sameTvProjectorStatus: true,
  sameType: true,
};

const EXACT_MATCH_PAGE_SIZE = 3;

type ExactFetchState = {
  exhausted: boolean;
  pendingRooms: SearchRoom[];
  stage: 0 | 1;
};

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isSpecializedRoom(room: Pick<Room, "roomType">) {
  return normalizeText(room.roomType).includes("specialized");
}

function isExactRoomMatch(originalRoom: Room, candidateRoom: SearchRoom) {
  return (
    originalRoom.capacity === candidateRoom.capacity &&
    normalizeText(originalRoom.roomType) === normalizeText(candidateRoom.roomType) &&
    normalizeText(originalRoom.acStatus) === normalizeText(candidateRoom.acStatus) &&
    normalizeText(originalRoom.tvProjectorStatus) ===
      normalizeText(candidateRoom.tvProjectorStatus)
  );
}

function getRoomBuildingLabel(room: Pick<Room, "buildingId" | "buildingName">) {
  const normalizedBuildingId = normalizeText(room.buildingId);

  if (normalizedBuildingId === "gd1") {
    return "GD1 Main Campus";
  }

  if (normalizedBuildingId === "gd2") {
    return "GD2 Main Campus";
  }

  if (normalizedBuildingId === "gd3") {
    return "GD3 Main Campus";
  }

  if (normalizedBuildingId === "sdca") {
    return "SDCA Digital Campus";
  }

  return room.buildingName?.trim() || room.buildingId;
}

function getBuildingShortLabel(building: Pick<Building, "id" | "name">) {
  const normalizedBuildingId = normalizeText(building.id);

  if (normalizedBuildingId === "gd1") {
    return "GD1";
  }

  if (normalizedBuildingId === "gd2") {
    return "GD2";
  }

  if (normalizedBuildingId === "gd3") {
    return "GD3";
  }

  return building.name;
}

function matchesSelectedFilters(
  originalRoom: Room,
  candidateRoom: SearchRoom,
  filters: MatchFilters,
  selection: Partial<Record<FilterLevel, string | null>>
) {
  if (
    selection.campus &&
    selection.campus !== candidateRoom.campus
  ) {
    return false;
  }

  if (
    selection.building &&
    normalizeText(selection.building) !== normalizeText(candidateRoom.buildingId)
  ) {
    return false;
  }

  if (
    selection.floor &&
    selection.floor !== getRoomFloorId(candidateRoom)
  ) {
    return false;
  }

  if (
    filters.sameCapacity &&
    candidateRoom.capacity < originalRoom.capacity
  ) {
    return false;
  }

  if (
    filters.sameType &&
    normalizeText(originalRoom.roomType) !== normalizeText(candidateRoom.roomType)
  ) {
    return false;
  }

  if (
    filters.sameAcStatus &&
    normalizeText(originalRoom.acStatus) !== normalizeText(candidateRoom.acStatus)
  ) {
    return false;
  }

  if (
    filters.sameTvProjectorStatus &&
    normalizeText(originalRoom.tvProjectorStatus) !==
      normalizeText(candidateRoom.tvProjectorStatus)
  ) {
    return false;
  }

  return true;
}

function getExactRoomPriority(originalRoom: Room, candidateRoom: SearchRoom) {
  const sameBuilding = normalizeText(originalRoom.buildingId) === normalizeText(candidateRoom.buildingId);
  const sameFloor = normalizeText(originalRoom.floor) === normalizeText(candidateRoom.floor);
  const sameCampus = getRoomCampus(originalRoom) === candidateRoom.campus;

  if (sameBuilding && sameFloor) {
    return 0;
  }

  if (sameBuilding) {
    return 1;
  }

  if (sameCampus) {
    return 2;
  }

  return 3;
}

function compareExactRooms(originalRoom: Room, left: SearchRoom, right: SearchRoom) {
  const priorityDifference =
    getExactRoomPriority(originalRoom, left) - getExactRoomPriority(originalRoom, right);

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const buildingDifference = left.buildingName.localeCompare(right.buildingName);

  if (buildingDifference !== 0) {
    return buildingDifference;
  }

  const floorDifference = left.floor.localeCompare(right.floor);

  if (floorDifference !== 0) {
    return floorDifference;
  }

  return left.name.localeCompare(right.name);
}

export default function AlternativeRoomsScreen() {
  const router = useRouter();
  const {
    dateKey,
    endTime,
    roomId,
    roomName,
    selection,
    startTime,
    timeslot,
  } = useLocalSearchParams<{
    dateKey?: string;
    endTime?: string;
    roomId?: string;
    roomName?: string;
    selection?: string;
    startTime?: string;
    timeslot?: string;
  }>();
  const resolvedRoomId = String(roomId ?? "");
  const resolvedDateKey = String(dateKey ?? "");
  const resolvedStartTime = String(startTime ?? "");
  const resolvedEndTime = String(endTime ?? "");
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [originalRoom, setOriginalRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<SearchRoom[]>([]);
  const [exactRooms, setExactRooms] = useState<SearchRoom[]>([]);
  const [roomSchedules, setRoomSchedules] = useState<Record<string, Schedule[]>>({});
  const [roomReservations, setRoomReservations] = useState<Record<string, ReservationRecord[]>>(
    {}
  );
  const [userReservations, setUserReservations] = useState<ReservationRecord[]>([]);
  const [loadingRoomIds, setLoadingRoomIds] = useState<Record<string, boolean>>({});
  const [matchFilters, setMatchFilters] = useState<MatchFilters>(DEFAULT_MATCH_FILTERS);
  const [screenLoading, setScreenLoading] = useState(true);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [specializedAlertShown, setSpecializedAlertShown] = useState(false);
  const [visibleExactRoomCount, setVisibleExactRoomCount] = useState(EXACT_MATCH_PAGE_SIZE);
  const [loadingMoreExactRooms, setLoadingMoreExactRooms] = useState(false);
  const [loadingRelaxedRooms, setLoadingRelaxedRooms] = useState(false);
  const [relaxedRoomsLoaded, setRelaxedRoomsLoaded] = useState(false);
  const [showRelaxedSection, setShowRelaxedSection] = useState(false);
  const [relaxedSelection, setRelaxedSelection] = useState<
    Partial<Record<FilterLevel, string | null>>
  >({
    building: null,
    campus: null,
    floor: null,
  });
  const [visibleRelaxedRoomCount, setVisibleRelaxedRoomCount] = useState(EXACT_MATCH_PAGE_SIZE);
  const [loadingMoreRelaxedRooms, setLoadingMoreRelaxedRooms] = useState(false);
  const [loadingExactCandidates, setLoadingExactCandidates] = useState(false);
  const buildingsRef = useRef<Building[]>([]);
  const exactRoomsRef = useRef<SearchRoom[]>([]);
  const originalRoomRef = useRef<Room | null>(null);
  const exactFetchStateRef = useRef<ExactFetchState>({
    exhausted: false,
    pendingRooms: [],
    stage: 0,
  });

  useEffect(() => {
    buildingsRef.current = buildings;
  }, [buildings]);

  useEffect(() => {
    exactRoomsRef.current = exactRooms;
  }, [exactRooms]);

  useEffect(() => {
    originalRoomRef.current = originalRoom;
  }, [originalRoom]);

  function resetExactFetchState() {
    exactFetchStateRef.current = {
      exhausted: false,
      pendingRooms: [],
      stage: 0,
    };
    exactRoomsRef.current = [];
    setExactRooms([]);
  }

  function appendExactRooms(nextRooms: SearchRoom[]) {
    if (nextRooms.length === 0) {
      return;
    }

    const existingIds = new Set(exactRoomsRef.current.map((room) => room.id));
    const uniqueRooms = nextRooms.filter((room) => !existingIds.has(room.id));

    if (uniqueRooms.length === 0) {
      return;
    }

    const updatedRooms = [...exactRoomsRef.current, ...uniqueRooms];
    exactRoomsRef.current = updatedRooms;
    setExactRooms(updatedRooms);
  }

  async function fetchNextExactRoomBatch(room: Room, availableBuildings: Building[]) {
    const fetchState = exactFetchStateRef.current;

    while (!fetchState.exhausted) {
      if (fetchState.stage === 0) {
        fetchState.stage = 1;
        return (await getRoomsByBuildingAndFloor(room.buildingId, room.floor))
          .map(toSearchRoom)
          .filter(
            (candidateRoom) =>
              candidateRoom.id !== room.id &&
              !isSpecializedRoom(candidateRoom) &&
              isExactRoomMatch(room, candidateRoom)
          );
      }

      fetchState.exhausted = true;
      break;
    }

    return [];
  }

  async function ensureExactRoomCount(targetCount: number) {
    if (loadingExactCandidates) {
      return;
    }

    const room = originalRoomRef.current;
    const availableBuildings = buildingsRef.current;

    if (!room || availableBuildings.length === 0) {
      return;
    }

    setLoadingExactCandidates(true);

    try {
      while (
        exactRoomsRef.current.length < targetCount &&
        !exactFetchStateRef.current.exhausted
      ) {
        if (exactFetchStateRef.current.pendingRooms.length > 0) {
          const remaining = targetCount - exactRoomsRef.current.length;
          const nextRooms = exactFetchStateRef.current.pendingRooms.splice(0, remaining);
          appendExactRooms(nextRooms);

          if (exactRoomsRef.current.length >= targetCount) {
            break;
          }
        }

        const nextBatch = await fetchNextExactRoomBatch(room, availableBuildings);

        if (nextBatch.length === 0) {
          continue;
        }

        const knownIds = new Set([
          ...exactRoomsRef.current.map((candidateRoom) => candidateRoom.id),
          ...exactFetchStateRef.current.pendingRooms.map((candidateRoom) => candidateRoom.id),
        ]);
        const uniqueBatch = nextBatch.filter((candidateRoom) => !knownIds.has(candidateRoom.id));

        if (uniqueBatch.length === 0) {
          continue;
        }

        exactFetchStateRef.current.pendingRooms.push(...uniqueBatch);
      }

      if (
        exactRoomsRef.current.length < targetCount &&
        exactFetchStateRef.current.pendingRooms.length > 0
      ) {
        appendExactRooms(exactFetchStateRef.current.pendingRooms.splice(0));
      }
    } finally {
      setLoadingExactCandidates(false);
    }
  }

  async function loadRelaxedRoomPool() {
    if (loadingRelaxedRooms || relaxedRoomsLoaded) {
      return;
    }

    setLoadingRelaxedRooms(true);

    try {
      const loadedRooms = await Promise.all(
        buildingsRef.current.map((building) => getRoomsByBuilding(building.id))
      );
      setRooms(
        loadedRooms
          .flat()
          .map(toSearchRoom)
          .filter((room) => !isSpecializedRoom(room))
      );
      setRelaxedRoomsLoaded(true);
    } catch (caughtError) {
      setScreenError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load alternative rooms."
      );
    } finally {
      setLoadingRelaxedRooms(false);
    }
  }

  useEffect(() => {
    let active = true;

    async function loadInitialData() {
      if (!resolvedRoomId) {
        if (active) {
          setScreenError("The original room details were not provided.");
          setScreenLoading(false);
        }
        return;
      }

      setScreenLoading(true);

      try {
        const [roomResult, buildings, currentUserReservations] = await Promise.all([
          getRoomById(resolvedRoomId),
          getBuildings(),
          auth.currentUser
            ? getReservationsByUser(auth.currentUser.uid)
            : Promise.resolve([] as ReservationRecord[]),
        ]);

        if (!roomResult) {
          throw new Error("The selected room could not be found.");
        }

        if (!active) {
          return;
        }

        resetExactFetchState();
        buildingsRef.current = buildings;
        originalRoomRef.current = roomResult;
        setBuildings(buildings);
        setOriginalRoom(roomResult);
        setRooms([]);
        setRelaxedRoomsLoaded(false);
        setShowRelaxedSection(false);
        setRelaxedSelection({
          building: roomResult.buildingId,
          campus: getRoomCampus(roomResult),
          floor: getRoomFloorId(roomResult),
        });
        setUserReservations(
          currentUserReservations.filter(
            (reservation) =>
              reservation.status === "approved" || reservation.status === "pending"
          )
        );
        setScreenError(null);
        await ensureExactRoomCount(EXACT_MATCH_PAGE_SIZE);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setScreenError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load alternative rooms."
        );
      } finally {
        if (active) {
          setScreenLoading(false);
        }
      }
    }

    loadInitialData();

    return () => {
      active = false;
    };
  }, [resolvedRoomId]);

  useEffect(() => {
    if (!originalRoom || specializedAlertShown || !isSpecializedRoom(originalRoom)) {
      return;
    }

    Alert.alert(
      "No Alternative Rooms",
      "This room has no alternative because it is unique."
    );
    setSpecializedAlertShown(true);
  }, [originalRoom, specializedAlertShown]);

  const baseCandidateRooms = useMemo(() => {
    if (!originalRoom) {
      return [];
    }

    return rooms.filter((room) => room.id !== originalRoom.id);
  }, [originalRoom, rooms]);

  const relaxedCampusOptions = useMemo<LevelOption[]>(
    () => [
      { id: "main", label: "Main Campus" },
      { id: "digi", label: "Digital Campus" },
    ],
    []
  );

  const relaxedBuildingOptions = useMemo<LevelOption[]>(() => {
    if (!relaxedSelection.campus || relaxedSelection.campus === "digi") {
      return [];
    }

    return buildings
      .filter((building) => building.campus === relaxedSelection.campus)
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))
      .map((building) => ({
        id: building.id,
        label: getBuildingShortLabel(building),
      }));
  }, [buildings, relaxedSelection.campus]);

  const relaxedFloorOptions = useMemo<LevelOption[]>(() => {
    if (!relaxedSelection.campus) {
      return [];
    }

    if (relaxedSelection.building) {
      const selectedBuilding = buildings.find(
        (building) => building.id === relaxedSelection.building
      );

      if (!selectedBuilding) {
        return [];
      }

      return buildBuildingFloorOptions(selectedBuilding, []).map((floor) => ({
        id: floor.id,
        label: floor.label,
      }));
    }

    const campusBuildings = buildings.filter(
      (building) => building.campus === relaxedSelection.campus
    );

    return buildCampusFloorOptions(campusBuildings, []).map((floor) => ({
      id: floor.id,
      label: floor.label,
    }));
  }, [buildings, relaxedSelection.building, relaxedSelection.campus]);

  const relaxedFilterBarLevelOptions = useMemo<
    Partial<Record<FilterLevel, LevelOption[]>>
  >(
    () => ({
      building: relaxedBuildingOptions,
      campus: relaxedCampusOptions,
      floor: relaxedFloorOptions,
    }),
    [relaxedBuildingOptions, relaxedCampusOptions, relaxedFloorOptions]
  );

  const relaxedCandidateRooms = useMemo(() => {
    if (!originalRoom || isSpecializedRoom(originalRoom)) {
      return [];
    }

    const exactRoomIds = new Set(exactRooms.map((room) => room.id));

    return baseCandidateRooms.filter(
      (room) =>
        !exactRoomIds.has(room.id) &&
        matchesSelectedFilters(originalRoom, room, matchFilters, relaxedSelection)
    );
  }, [baseCandidateRooms, exactRooms, matchFilters, originalRoom, relaxedSelection]);

  const neededRoomIds = useMemo(() => {
    return [...new Set([...exactRooms, ...relaxedCandidateRooms].map((room) => room.id))];
  }, [exactRooms, relaxedCandidateRooms]);

  useEffect(() => {
    if (neededRoomIds.length === 0) {
      return;
    }

    const missingRoomIds = neededRoomIds.filter(
      (candidateRoomId) =>
        roomSchedules[candidateRoomId] === undefined ||
        roomReservations[candidateRoomId] === undefined
    );

    if (missingRoomIds.length === 0) {
      return;
    }

    let active = true;

    setLoadingRoomIds((currentValue) => {
      const nextValue = { ...currentValue };
      missingRoomIds.forEach((candidateRoomId) => {
        nextValue[candidateRoomId] = true;
      });
      return nextValue;
    });

    Promise.all(
      missingRoomIds.map(async (candidateRoomId) => ({
        reservations: await getReservationsByRoom(candidateRoomId),
        roomId: candidateRoomId,
        schedules: await getSchedulesByRoomId(candidateRoomId),
      }))
    )
      .then((results) => {
        if (!active) {
          return;
        }

        setRoomSchedules((currentValue) => {
          const nextValue = { ...currentValue };
          results.forEach(({ roomId: candidateRoomId, schedules }) => {
            nextValue[candidateRoomId] = schedules;
          });
          return nextValue;
        });

        setRoomReservations((currentValue) => {
          const nextValue = { ...currentValue };
          results.forEach(({ reservations, roomId: candidateRoomId }) => {
            nextValue[candidateRoomId] = reservations;
          });
          return nextValue;
        });
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setLoadingRoomIds((currentValue) => {
          const nextValue = { ...currentValue };
          missingRoomIds.forEach((candidateRoomId) => {
            delete nextValue[candidateRoomId];
          });
          return nextValue;
        });
      });

    return () => {
      active = false;
    };
  }, [neededRoomIds, roomReservations, roomSchedules]);

  const candidateAvailability = useMemo(() => {
    if (!resolvedDateKey || !resolvedStartTime || !resolvedEndTime) {
      return {} as Record<string, boolean>;
    }

    return neededRoomIds.reduce<Record<string, boolean>>((result, candidateRoomId) => {
      const schedules = roomSchedules[candidateRoomId];
      const reservations = roomReservations[candidateRoomId];

      if (!schedules || !reservations) {
        result[candidateRoomId] = false;
        return result;
      }

      const slot = buildTimeSlots(
        candidateRoomId,
        resolvedDateKey,
        schedules,
        reservations,
        userReservations
      ).find(
        (entry) =>
          entry.startTime === resolvedStartTime && entry.endTime === resolvedEndTime
      );

      result[candidateRoomId] = slot?.state === "available";
      return result;
    }, {});
  }, [
    neededRoomIds,
    resolvedDateKey,
    resolvedEndTime,
    resolvedStartTime,
    roomReservations,
    roomSchedules,
    userReservations,
  ]);

  const exactAvailableRooms = useMemo(
    () =>
      exactRooms
        .filter((room) => candidateAvailability[room.id])
        .sort((left, right) =>
          originalRoom ? compareExactRooms(originalRoom, left, right) : 0
        ),
    [candidateAvailability, exactRooms, originalRoom]
  );

  const relaxedAvailableRooms = useMemo(
    () =>
      relaxedCandidateRooms
        .filter((room) => candidateAvailability[room.id])
        .sort((left, right) =>
          originalRoom ? compareExactRooms(originalRoom, left, right) : 0
        ),
    [candidateAvailability, relaxedCandidateRooms, originalRoom]
  );

  const visibleExactRooms = useMemo(
    () => exactAvailableRooms.slice(0, visibleExactRoomCount),
    [exactAvailableRooms, visibleExactRoomCount]
  );
  const visibleRelaxedRooms = useMemo(
    () => relaxedAvailableRooms.slice(0, visibleRelaxedRoomCount),
    [relaxedAvailableRooms, visibleRelaxedRoomCount]
  );

  useEffect(() => {
    setVisibleExactRoomCount(EXACT_MATCH_PAGE_SIZE);
    setLoadingMoreExactRooms(false);
  }, [resolvedRoomId, resolvedDateKey, resolvedStartTime, resolvedEndTime]);

  useEffect(() => {
    setVisibleRelaxedRoomCount(EXACT_MATCH_PAGE_SIZE);
    setLoadingMoreRelaxedRooms(false);
  }, [
    relaxedSelection,
    resolvedRoomId,
    resolvedDateKey,
    resolvedStartTime,
    resolvedEndTime,
    matchFilters,
  ]);

  useEffect(() => {
    if (
      screenLoading ||
      loadingExactCandidates ||
      exactFetchStateRef.current.exhausted ||
      exactAvailableRooms.length >= visibleExactRoomCount
    ) {
      return;
    }

    void ensureExactRoomCount(exactRoomsRef.current.length + EXACT_MATCH_PAGE_SIZE);
  }, [
    exactAvailableRooms.length,
    loadingExactCandidates,
    screenLoading,
    visibleExactRoomCount,
  ]);

  const hasExactMatches = exactAvailableRooms.length > 0;
  const canLoadMoreExactRooms = visibleExactRoomCount < exactAvailableRooms.length;
  const canLoadMoreRelaxedRooms = visibleRelaxedRoomCount < relaxedAvailableRooms.length;
  const visibleExactRoomIds = useMemo(
    () => visibleExactRooms.map((room) => room.id),
    [visibleExactRooms]
  );
  const visibleRelaxedRoomIds = useMemo(
    () => visibleRelaxedRooms.map((room) => room.id),
    [visibleRelaxedRooms]
  );
  const isLoadingMoreExactRooms =
    loadingMoreExactRooms &&
    !screenLoading &&
    visibleExactRoomIds.some((candidateRoomId) => Boolean(loadingRoomIds[candidateRoomId]));
  const isLoadingMoreRelaxedRooms =
    loadingMoreRelaxedRooms &&
    !screenLoading &&
    visibleRelaxedRoomIds.some((candidateRoomId) => Boolean(loadingRoomIds[candidateRoomId]));
  const shouldShowRelaxedSection =
    !screenLoading &&
    !isSpecializedRoom(originalRoom ?? { roomType: "" }) &&
    showRelaxedSection;

  useEffect(() => {
    if (!loadingMoreExactRooms) {
      return;
    }

    const hasRenderedRequestedRoomCount =
      visibleExactRooms.length >= visibleExactRoomCount;
    const hasNoMoreExactRoomsToReveal =
      exactAvailableRooms.length < visibleExactRoomCount;
    const hasVisibleExactRoomStillLoading = visibleExactRoomIds.some((candidateRoomId) =>
      Boolean(loadingRoomIds[candidateRoomId])
    );

    if (
      hasRenderedRequestedRoomCount ||
      hasNoMoreExactRoomsToReveal ||
      !hasVisibleExactRoomStillLoading
    ) {
      setLoadingMoreExactRooms(false);
    }
  }, [
    exactAvailableRooms.length,
    loadingMoreExactRooms,
    loadingRoomIds,
    visibleExactRoomCount,
    visibleExactRoomIds,
    visibleExactRooms.length,
  ]);

  useEffect(() => {
    if (!loadingMoreRelaxedRooms) {
      return;
    }

    const hasRenderedRequestedRoomCount =
      visibleRelaxedRooms.length >= visibleRelaxedRoomCount;
    const hasNoMoreRelaxedRoomsToReveal =
      relaxedAvailableRooms.length < visibleRelaxedRoomCount;
    const hasVisibleRelaxedRoomStillLoading = visibleRelaxedRoomIds.some((candidateRoomId) =>
      Boolean(loadingRoomIds[candidateRoomId])
    );

    if (
      hasRenderedRequestedRoomCount ||
      hasNoMoreRelaxedRoomsToReveal ||
      !hasVisibleRelaxedRoomStillLoading
    ) {
      setLoadingMoreRelaxedRooms(false);
    }
  }, [
    loadingMoreRelaxedRooms,
    loadingRoomIds,
    relaxedAvailableRooms.length,
    visibleRelaxedRoomCount,
    visibleRelaxedRoomIds,
    visibleRelaxedRooms.length,
  ]);

  function toggleFilter(filterKey: keyof MatchFilters) {
    if (!relaxedRoomsLoaded) {
      void loadRelaxedRoomPool();
    }

    setMatchFilters((currentValue) => ({
      ...currentValue,
      [filterKey]: !currentValue[filterKey],
    }));
  }

  function handleRelaxedSelectionOptionPress(
    level: FilterLevel,
    id: string,
    selected: boolean
  ) {
    if (!relaxedRoomsLoaded) {
      void loadRelaxedRoomPool();
    }

    setRelaxedSelection((currentValue) => {
      if (selected) {
        return currentValue;
      }

      if (level === "campus") {
        if (id === "digi") {
          const nextFloorId = buildCampusFloorOptions(
            buildings.filter((building) => building.campus === "digi"),
            []
          )[0]?.id ?? null;

          return {
            building: null,
            campus: id,
            floor: nextFloorId,
          };
        }

        const nextBuildingId = buildings
          .filter((building) => building.campus === id)
          .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id))[0]?.id ?? null;
        const nextBuilding = buildings.find((building) => building.id === nextBuildingId);
        const nextFloorId =
          nextBuilding ? buildBuildingFloorOptions(nextBuilding, [])[0]?.id ?? null : null;

        return {
          building: nextBuildingId,
          campus: id,
          floor: nextFloorId,
        };
      }

      if (level === "building") {
        const selectedBuilding = buildings.find((building) => building.id === id);

        return {
          ...currentValue,
          building: id,
          floor:
            selectedBuilding ? buildBuildingFloorOptions(selectedBuilding, [])[0]?.id ?? null : null,
        };
      }

      return {
        ...currentValue,
        floor: id,
      };
    });
  }

  async function loadMoreExactRooms() {
    if (!canLoadMoreExactRooms) {
      setShowRelaxedSection(true);

      if (!relaxedRoomsLoaded) {
        await loadRelaxedRoomPool();
      }

      setLoadingMoreExactRooms(false);
      return;
    }

    setLoadingMoreExactRooms(true);
    const nextVisibleCount = visibleExactRoomCount + EXACT_MATCH_PAGE_SIZE;
    setVisibleExactRoomCount(nextVisibleCount);
    await ensureExactRoomCount(nextVisibleCount);
  }

  function loadMoreRelaxedRooms() {
    setLoadingMoreRelaxedRooms(true);
    setVisibleRelaxedRoomCount((currentValue) => currentValue + EXACT_MATCH_PAGE_SIZE);
  }

  function openReservationFormForRoom(room: SearchRoom) {
    if (!resolvedDateKey || !resolvedStartTime || !resolvedEndTime) {
      return;
    }

    router.push({
      pathname: "/(main)/reservation-form",
      params: {
        roomId: room.id,
        roomName: room.name,
        selectedTimeslots: JSON.stringify([
          {
            dateKey: resolvedDateKey,
            endTime: resolvedEndTime,
            startTime: resolvedStartTime,
            state: "available",
          },
        ]),
        selection:
          selection ?? formatFullDate(new Date(`${resolvedDateKey}T00:00:00`)),
        timeslot:
          timeslot ??
          `${formatTime12h(resolvedStartTime)} - ${formatTime12h(resolvedEndTime)}`,
      },
    });
  }

  function renderRoomCard(room: SearchRoom) {
    return (
      <View key={room.id} style={styles.roomCard}>
        <View style={styles.roomHeader}>
          <Text style={styles.roomName}>{room.name}</Text>
          <Text style={styles.roomBuildingName}>
            <Text style={styles.roomDetailLabel}>Building: </Text>
            {getRoomBuildingLabel(room)}
          </Text>
        </View>

        <View style={styles.roomDetailGrid}>
          <Text style={styles.roomDetail}>
            <Text style={styles.roomDetailLabel}>Floor: </Text>
            {room.floor}
          </Text>
          <Text style={styles.roomDetail}>
            <Text style={styles.roomDetailLabel}>Type: </Text>
            {room.roomType}
          </Text>
          <Text style={styles.roomDetail}>
            <Text style={styles.roomDetailLabel}>Max. Capacity: </Text>
            {`${room.capacity} People`}
          </Text>
          <Text style={styles.roomDetail}>
            <Text style={styles.roomDetailLabel}>Air-Conditioner: </Text>
            {room.acStatus}
          </Text>
          <Text style={styles.roomDetail}>
            <Text style={styles.roomDetailLabel}>TV/Projector: </Text>
            {room.tvProjectorStatus}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.reserveButton}
          onPress={() => openReservationFormForRoom(room)}
        >
          <Text style={styles.reserveButtonText}>Reserve This Room</Text>
        </TouchableOpacity>

      </View>
    );
  }

  return (
    <SelectionScreenLayout
      title="Alternative Rooms"
      subtitle="Available rooms for the selected timeslot"
      onBackPress={() => router.back()}
    >
      <View style={styles.content}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Original Room</Text>
          <Text style={styles.summaryText}>{roomName ?? originalRoom?.name ?? "Selected Room"}</Text>
          <Text style={styles.summaryDetail}>Schedule: {selection ?? "Not provided"}</Text>
          <Text style={styles.summaryDetail}>Timeslot: {timeslot ?? "Not provided"}</Text>
        </View>

        {screenLoading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.stateText}>Loading alternative rooms...</Text>
          </View>
        ) : screenError ? (
          <View style={styles.stateCard}>
            <Text style={styles.errorText}>{screenError}</Text>
          </View>
        ) : isSpecializedRoom(originalRoom ?? { roomType: "" }) ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateText}>
              No alternative rooms are shown because this specialized room is unique.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Exact Matches</Text>
              {visibleExactRooms.length === 0 ? (
                <Text style={styles.emptySectionText}>
                  No exact-match rooms are available for this timeslot.
                </Text>
              ) : (
                visibleExactRooms.map(renderRoomCard)
              )}
              {canLoadMoreExactRooms || !showRelaxedSection ? (
                <TouchableOpacity
                  style={[
                    styles.loadMoreButton,
                    isLoadingMoreExactRooms && styles.loadMoreButtonDisabled,
                  ]}
                  onPress={loadMoreExactRooms}
                  disabled={isLoadingMoreExactRooms}
                >
                  {isLoadingMoreExactRooms ? (
                    <View style={styles.loadMoreButtonContent}>
                      <ActivityIndicator color={colors.white} size="small" />
                      <Text style={styles.loadMoreButtonText}>Loading More Rooms...</Text>
                    </View>
                  ) : (
                    <Text style={styles.loadMoreButtonText}>Load More Rooms</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>

            {shouldShowRelaxedSection ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Broaden Your Match</Text>
                <Text style={styles.sectionDescription}>
                  {hasExactMatches
                    ? "No exact matches? Adjust the matching parts of the room below."
                    : "No exact matches? Adjust the room details below."}
                </Text>

                <View style={styles.selectionFilterBarShell}>
                  <FilterBar
                    disableActivePress
                    levelOptionsOverride={relaxedFilterBarLevelOptions}
                    navigateOnSelect={false}
                    onOptionPress={handleRelaxedSelectionOptionPress}
                    selectedByLevelOverride={relaxedSelection}
                    showAllLevels
                  />
                </View>

                <View style={styles.filterList}>
                  <TouchableOpacity
                    style={styles.filterRow}
                    onPress={() => toggleFilter("sameType")}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        matchFilters.sameType && styles.checkboxSelected,
                      ]}
                    >
                      {matchFilters.sameType ? (
                        <Text style={styles.checkboxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.filterLabel}>Same Type</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filterRow}
                    onPress={() => toggleFilter("sameCapacity")}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        matchFilters.sameCapacity && styles.checkboxSelected,
                      ]}
                    >
                      {matchFilters.sameCapacity ? (
                        <Text style={styles.checkboxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.filterLabel}>Same or Higher Max. Capacity</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filterRow}
                    onPress={() => toggleFilter("sameAcStatus")}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        matchFilters.sameAcStatus && styles.checkboxSelected,
                      ]}
                    >
                      {matchFilters.sameAcStatus ? (
                        <Text style={styles.checkboxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.filterLabel}>Same Air-Conditioner Status</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.filterRow}
                    onPress={() => toggleFilter("sameTvProjectorStatus")}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        matchFilters.sameTvProjectorStatus &&
                          styles.checkboxSelected,
                      ]}
                    >
                      {matchFilters.sameTvProjectorStatus ? (
                        <Text style={styles.checkboxMark}>✓</Text>
                      ) : null}
                    </View>
                    <Text style={styles.filterLabel}>Same TV/Projector Status</Text>
                  </TouchableOpacity>
                </View>

                {!relaxedRoomsLoaded ? (
                  loadingRelaxedRooms ? (
                    <View style={styles.stateCard}>
                      <ActivityIndicator color={colors.primary} />
                      <Text style={styles.stateText}>Loading broader matches...</Text>
                    </View>
                  ) : (
                    <Text style={styles.emptySectionText}>
                      Change one or more filters to load broader room matches.
                    </Text>
                  )
                ) : visibleRelaxedRooms.length === 0 ? (
                  <Text style={styles.emptySectionText}>
                    No rooms are available with the current match filters. Turn off one or more
                    filters to broaden the results.
                  </Text>
                ) : (
                  visibleRelaxedRooms.map(renderRoomCard)
                )}
                {canLoadMoreRelaxedRooms ? (
                  <TouchableOpacity
                    style={[
                      styles.loadMoreButton,
                      isLoadingMoreRelaxedRooms && styles.loadMoreButtonDisabled,
                    ]}
                    onPress={loadMoreRelaxedRooms}
                    disabled={isLoadingMoreRelaxedRooms}
                  >
                    {isLoadingMoreRelaxedRooms ? (
                      <View style={styles.loadMoreButtonContent}>
                        <ActivityIndicator color={colors.white} size="small" />
                        <Text style={styles.loadMoreButtonText}>Loading More Rooms...</Text>
                      </View>
                    ) : (
                      <Text style={styles.loadMoreButtonText}>Load More Rooms</Text>
                    )}
                  </TouchableOpacity>
                ) : visibleRelaxedRooms.length > 0 ? (
                  <Text style={styles.endOfResultsText}>
                    No more rooms match selected filters. Change the floor, building, or filters to see more similar rooms.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </View>
    </SelectionScreenLayout>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.subtleBackground,
  },
  summaryTitle: {
    color: colors.primary,
    fontFamily: fonts.bold,
    fontSize: 15,
    marginBottom: 8,
  },
  summaryText: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
    marginBottom: 8,
  },
  summaryDetail: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    marginBottom: 4,
  },
  stateCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: 10,
  },
  stateText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  errorText: {
    color: colors.dangerText,
    fontFamily: fonts.regular,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 21,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 18,
  },
  sectionDescription: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  selectionFilterBarShell: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  emptySectionText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  roomCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: 10,
  },
  roomHeader: {
    gap: 4,
  },
  roomName: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 17,
  },
  roomBuildingName: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 18,
  },
  roomDetailGrid: {
    gap: 6,
  },
  roomDetail: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  roomDetailLabel: {
    fontFamily: fonts.bold,
  },
  reserveButton: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: 10,
  },
  reserveButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
    textAlign: "center",
  },
  loadMoreButton: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    paddingVertical: 10,
  },
  loadMoreButtonDisabled: {
    opacity: 0.85,
  },
  loadMoreButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  loadMoreButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  endOfResultsText: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: "center",
    paddingTop: 10,
  },
  filterList: {
    gap: 10,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkboxMark: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 12,
  },
  filterLabel: {
    flex: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
});
