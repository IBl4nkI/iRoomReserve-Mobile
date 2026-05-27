import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import { dashboardStyles as styles } from "@/components/dashboard/styles";
import { colors } from "@/constants/theme";
import { getUserProfile } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { toSearchRoom, type SearchRoom } from "@/lib/reservation-search";
import { getBuildingsByCampus } from "@/services/buildings.service";
import {
  formatCompactFloorLabel,
  getFloorSortOrder,
  getRoomFloorId,
  getRoomFloorLabel,
} from "@/services/floors.service";
import { getReservationsByCampus } from "@/services/reservations.service";
import { getRoomsByBuilding } from "@/services/rooms.service";
import type { ReservationCampus, ReservationRecord } from "@/types/reservation";

const MAIN_CAMPUS_BUILDING_OPTIONS = [
  { id: "gd1", label: "GD1" },
  { id: "gd2", label: "GD2" },
  { id: "gd3", label: "GD3" },
];

type RoomFilterValue = string | null;
type RoomFilterOption = {
  id: string;
  label: string;
};
type RoomDisplayStatus = "Reserved" | "Occupied" | "Vacant";

function StatusChip({
  status,
}: {
  status: RoomDisplayStatus;
}) {
  if (status === "Vacant") {
    return (
      <View style={[styles.chip, styles.chipApproved]}>
        <Text style={[styles.chipText, styles.chipTextApproved]}>Vacant</Text>
      </View>
    );
  }

  if (status === "Occupied") {
    return (
      <View style={[styles.chip, styles.chipOccupied]}>
        <Text style={[styles.chipText, styles.chipTextOccupied]}>Occupied</Text>
      </View>
    );
  }

  if (status === "Reserved") {
    return (
      <View style={[styles.chip, styles.chipPending]}>
        <Text style={[styles.chipText, styles.chipTextPending]}>Reserved</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipPending]}>
      <Text style={[styles.chipText, styles.chipTextPending]}>Reserved</Text>
    </View>
  );
}

function getLocalDateKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentTimeKey() {
  const date = new Date();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function getRoomDisplayStatus(
  room: SearchRoom,
  reservations: ReservationRecord[],
  todayDateKey: string,
  currentTimeKey: string
): RoomDisplayStatus {
  const todaysApprovedReservations = reservations
    .filter(
      (reservation) =>
        reservation.roomId === room.id &&
        reservation.status === "approved" &&
        reservation.date === todayDateKey
    )
    .sort(
      (left, right) =>
        left.startTime.localeCompare(right.startTime) ||
        left.endTime.localeCompare(right.endTime) ||
        left.id.localeCompare(right.id)
    );

  const activeReservation = todaysApprovedReservations.find(
    (reservation) =>
      Boolean(reservation.checkedInAt) &&
      reservation.startTime <= currentTimeKey &&
      reservation.endTime > currentTimeKey
  );

  if (activeReservation) {
    return "Occupied";
  }

  const sameDayReservation = todaysApprovedReservations.find(
    (reservation) => reservation.endTime > currentTimeKey
  );

  return sameDayReservation ? "Reserved" : "Vacant";
}

function getRoomFloorOption(room: SearchRoom): RoomFilterOption | null {
  if (!room.floor) {
    return null;
  }

  const label = getRoomFloorLabel(room);

  return {
    id: getRoomFloorId(room),
    label: formatCompactFloorLabel(label) || label,
  };
}

function getDefaultBuildingFilter(rooms: SearchRoom[]) {
  const buildingIds = new Set(
    rooms.map((room) => room.buildingId.toLowerCase())
  );

  return (
    MAIN_CAMPUS_BUILDING_OPTIONS.find((option) => buildingIds.has(option.id))?.id ??
    null
  );
}

function getFloorOptions(rooms: SearchRoom[], buildingFilter: RoomFilterValue) {
  const optionsById = new Map<string, RoomFilterOption & { sortLabel: string }>();

  rooms.forEach((room) => {
    if (buildingFilter && room.buildingId.toLowerCase() !== buildingFilter) {
      return;
    }

    const option = getRoomFloorOption(room);

    if (option) {
      optionsById.set(option.id, {
        ...option,
        sortLabel: getRoomFloorLabel(room),
      });
    }
  });

  return [...optionsById.values()]
    .sort(
      (left, right) =>
        getFloorSortOrder(left.sortLabel) - getFloorSortOrder(right.sortLabel) ||
        left.label.localeCompare(right.label, undefined, { numeric: true })
    )
    .map(({ sortLabel, ...option }) => option);
}

function filterRooms(
  rooms: SearchRoom[],
  buildingFilter: RoomFilterValue,
  floorFilter: RoomFilterValue
) {
  return rooms.filter((room) => {
    if (buildingFilter && room.buildingId.toLowerCase() !== buildingFilter) {
      return false;
    }

    if (!floorFilter) {
      return true;
    }

    return getRoomFloorOption(room)?.id === floorFilter;
  });
}

function RoomStatusRadioGroup({
  options,
  selectedValue,
  onChange,
}: {
  options: RoomFilterOption[];
  selectedValue: RoomFilterValue;
  onChange: (value: RoomFilterValue) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <View style={styles.reservationFilterRow}>
      {options.map((option) => {
        const selected = selectedValue === option.id;

        return (
          <Pressable
            key={option.id}
            style={[
              styles.reservationRadioChip,
              selected ? styles.reservationRadioChipSelected : null,
            ]}
            onPress={() => onChange(option.id)}
          >
            <View
              style={[
                styles.reservationRadioOuter,
                selected ? styles.reservationRadioOuterSelected : null,
              ]}
            >
              {selected ? <View style={styles.reservationRadioInner} /> : null}
            </View>
            <Text style={styles.reservationRadioText} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function RoomsStatusScreen() {
  const insets = useSafeAreaInsets();
  const [assignedCampus, setAssignedCampus] = React.useState<ReservationCampus | null>(null);
  const [rooms, setRooms] = React.useState<SearchRoom[]>([]);
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [buildingFilter, setBuildingFilter] = React.useState<RoomFilterValue>(null);
  const [floorFilter, setFloorFilter] = React.useState<RoomFilterValue>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadRooms = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (active) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const profile = await getUserProfile(currentUser.uid);
        const campus =
          profile?.campus === "main" || profile?.campus === "digi"
            ? profile.campus
            : null;

        if (!active) {
          return;
        }

        setAssignedCampus(campus);

        if (!campus) {
          setRooms([]);
          setError("No campus is assigned to this account.");
          return;
        }

        const [buildings, nextReservations] = await Promise.all([
          getBuildingsByCampus(campus),
          getReservationsByCampus(campus),
        ]);
        const roomGroups = await Promise.all(
          buildings.map((building) => getRoomsByBuilding(building.id))
        );

        if (!active) {
          return;
        }

        setRooms(
          roomGroups
            .flat()
            .map(toSearchRoom)
            .sort(
              (left, right) =>
                left.buildingName.localeCompare(right.buildingName) ||
                left.floor.localeCompare(right.floor) ||
                left.name.localeCompare(right.name)
              )
        );
        setReservations(nextReservations);
        setError(null);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Failed to load room statuses."
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadRooms();

    return () => {
      active = false;
    };
  }, []);

  const defaultBuildingFilter = React.useMemo(
    () => assignedCampus === "main" ? getDefaultBuildingFilter(rooms) : null,
    [assignedCampus, rooms]
  );
  const effectiveBuildingFilter =
    assignedCampus === "main" ? buildingFilter ?? defaultBuildingFilter : null;
  const buildingOptions = React.useMemo(
    () => assignedCampus === "main" ? MAIN_CAMPUS_BUILDING_OPTIONS : [],
    [assignedCampus]
  );
  const floorOptions = React.useMemo(
    () => getFloorOptions(rooms, effectiveBuildingFilter),
    [effectiveBuildingFilter, rooms]
  );
  const effectiveFloorFilter = floorFilter ?? floorOptions[0]?.id ?? null;
  const filteredRooms = React.useMemo(
    () => filterRooms(rooms, effectiveBuildingFilter, effectiveFloorFilter),
    [effectiveBuildingFilter, effectiveFloorFilter, rooms]
  );
  const todayDateKey = getLocalDateKey();
  const currentTimeKey = getCurrentTimeKey();

  React.useEffect(() => {
    if (assignedCampus !== "main" && buildingFilter) {
      setBuildingFilter(null);
    }
  }, [assignedCampus, buildingFilter]);

  React.useEffect(() => {
    if (
      floorFilter &&
      !floorOptions.some((option) => option.id === floorFilter)
    ) {
      setFloorFilter(null);
    }
  }, [floorFilter, floorOptions]);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <Text style={styles.screenTitle}>Rooms Status</Text>
        <Text style={styles.screenSubtitle}>
          {assignedCampus === "digi"
            ? "Showing all rooms assigned to the Digital Campus."
            : assignedCampus === "main"
              ? "Showing all rooms assigned to the Main Campus."
              : "Showing all rooms assigned to your campus."}
        </Text>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : rooms.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>There are no rooms available for this campus.</Text>
          </View>
        ) : (
          <>
            {assignedCampus === "main" ? (
              <RoomStatusRadioGroup
                options={buildingOptions}
                selectedValue={effectiveBuildingFilter}
                onChange={(value) => {
                  setBuildingFilter(value);
                  setFloorFilter(null);
                }}
              />
            ) : null}
            <RoomStatusRadioGroup
              options={floorOptions}
              selectedValue={effectiveFloorFilter}
              onChange={setFloorFilter}
            />
            {filteredRooms.length === 0 ? (
              <View style={styles.card}>
                <Text style={styles.emptyText}>There are no rooms for this filter.</Text>
              </View>
            ) : (
              filteredRooms.map((room) => (
                <View key={room.id} style={styles.listItem}>
                  <View style={styles.reservationHeaderRow}>
                    <View style={styles.reservationHeaderContent}>
                      <Text style={styles.reservationRoomName}>{room.name}</Text>
                    </View>
                    <View style={styles.reservationHeaderBadge}>
                      <StatusChip
                        status={getRoomDisplayStatus(
                          room,
                          reservations,
                          todayDateKey,
                          currentTimeKey
                        )}
                      />
                    </View>
                  </View>
                  <Text style={styles.reservationMeta}>{room.buildingName}</Text>
                  <Text style={styles.reservationMeta}>Floor: {room.floor}</Text>
                  <Text style={styles.reservationMeta}>Type: {room.roomType}</Text>
                  <Text style={styles.reservationMeta}>Max. Capacity: {room.capacity} People</Text>
                  <Text style={styles.reservationMeta}>Air-Conditioner: {room.acStatus}</Text>
                  <Text style={styles.reservationMeta}>TV/Projector: {room.tvProjectorStatus}</Text>
                </View>
              ))
            )}
          </>
        )}

        <Pressable style={styles.actionButton} onPress={() => router.push("/(main)/dashboard")}>
          <Text style={styles.actionButtonText}>Back to Dashboard</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
