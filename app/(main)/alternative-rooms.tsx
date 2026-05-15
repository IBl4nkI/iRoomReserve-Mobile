import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

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
  getReservationsByRoom,
  getReservationsByUser,
} from "@/services/reservations.service";
import { getRoomById, getRoomsByBuilding } from "@/services/rooms.service";
import { formatTime12h, getSchedulesByRoomId } from "@/services/schedules.service";
import type { ReservationRecord, Room, Schedule } from "@/types/reservation";

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

function matchesSelectedFilters(
  originalRoom: Room,
  candidateRoom: SearchRoom,
  filters: MatchFilters
) {
  if (
    filters.sameCapacity &&
    originalRoom.capacity !== candidateRoom.capacity
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
  const [originalRoom, setOriginalRoom] = useState<Room | null>(null);
  const [rooms, setRooms] = useState<SearchRoom[]>([]);
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

  const originalCampus = useMemo(
    () => (originalRoom ? getRoomCampus(originalRoom) : null),
    [originalRoom]
  );

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

        const roomGroups = await Promise.all(
          buildings.map((building) => getRoomsByBuilding(building.id))
        );

        if (!active) {
          return;
        }

        setOriginalRoom(roomResult);
        setRooms(roomGroups.flat().map(toSearchRoom));
        setUserReservations(
          currentUserReservations.filter(
            (reservation) =>
              reservation.status === "approved" || reservation.status === "pending"
          )
        );
        setScreenError(null);
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

  const exactCandidateRooms = useMemo(() => {
    if (!originalRoom || isSpecializedRoom(originalRoom)) {
      return [];
    }

    return baseCandidateRooms.filter((room) => isExactRoomMatch(originalRoom, room));
  }, [baseCandidateRooms, originalRoom]);

  const relaxedCandidateRooms = useMemo(() => {
    if (!originalRoom || isSpecializedRoom(originalRoom)) {
      return [];
    }

    return baseCandidateRooms.filter(
      (room) =>
        !isExactRoomMatch(originalRoom, room) &&
        matchesSelectedFilters(originalRoom, room, matchFilters)
    );
  }, [baseCandidateRooms, matchFilters, originalRoom]);

  const neededRoomIds = useMemo(() => {
    return [...new Set([...exactCandidateRooms, ...relaxedCandidateRooms].map((room) => room.id))];
  }, [exactCandidateRooms, relaxedCandidateRooms]);

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
    () => exactCandidateRooms.filter((room) => candidateAvailability[room.id]),
    [candidateAvailability, exactCandidateRooms]
  );

  const relaxedAvailableRooms = useMemo(
    () => relaxedCandidateRooms.filter((room) => candidateAvailability[room.id]),
    [candidateAvailability, relaxedCandidateRooms]
  );

  const sameCampusExactRooms = useMemo(() => {
    return exactAvailableRooms.filter((room) => room.campus === originalCampus);
  }, [exactAvailableRooms, originalCampus]);

  const otherCampusExactRooms = useMemo(() => {
    return exactAvailableRooms.filter((room) => room.campus !== originalCampus);
  }, [exactAvailableRooms, originalCampus]);

  const hasExactMatches = exactAvailableRooms.length > 0;
  const isCheckingAvailability =
    !screenLoading &&
    neededRoomIds.some((candidateRoomId) => Boolean(loadingRoomIds[candidateRoomId]));
  const shouldShowRelaxedSection =
    !screenLoading &&
    !isSpecializedRoom(originalRoom ?? { roomType: "" });

  function toggleFilter(filterKey: keyof MatchFilters) {
    setMatchFilters((currentValue) => ({
      ...currentValue,
      [filterKey]: !currentValue[filterKey],
    }));
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
          <View style={styles.roomHeaderText}>
            <Text style={styles.roomName}>{room.name}</Text>
            <Text style={styles.roomMeta}>{room.buildingName}</Text>
            <Text style={styles.roomMeta}>Floor: {room.floor}</Text>
            <Text style={styles.roomMeta}>Campus: {room.campusName}</Text>
          </View>
          <TouchableOpacity
            style={styles.reserveButton}
            onPress={() => openReservationFormForRoom(room)}
          >
            <Text style={styles.reserveButtonText}>Reserve This Room</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.roomDetailGrid}>
          <Text style={styles.roomDetail}>Type: {room.roomType}</Text>
          <Text style={styles.roomDetail}>Capacity: Approx. {room.capacity} People</Text>
          <Text style={styles.roomDetail}>Air-Conditioner: {room.acStatus}</Text>
          <Text style={styles.roomDetail}>TV/Projector: {room.tvProjectorStatus}</Text>
        </View>
      </View>
    );
  }

  return (
    <SelectionScreenLayout
      title="Alternative Rooms"
      subtitle="Available rooms for the same unavailable timeslot"
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
            {isCheckingAvailability ? (
              <View style={styles.stateCard}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.stateText}>Checking exact room matches...</Text>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Same Campus</Text>
              {sameCampusExactRooms.length === 0 ? (
                <Text style={styles.emptySectionText}>
                  No exact-match rooms are available in the same campus.
                </Text>
              ) : (
                sameCampusExactRooms.map(renderRoomCard)
              )}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Other Campus</Text>
              {otherCampusExactRooms.length === 0 ? (
                <Text style={styles.emptySectionText}>
                  No exact-match rooms are available in the other campus.
                </Text>
              ) : (
                otherCampusExactRooms.map(renderRoomCard)
              )}
            </View>

            {shouldShowRelaxedSection ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Broaden Your Match</Text>
                <Text style={styles.sectionDescription}>
                  {hasExactMatches
                    ? "Need more options? Adjust the matching parts of the room below."
                    : "No exact alternatives were found. Adjust the matching parts of the room below."}
                </Text>

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
                    <Text style={styles.filterLabel}>Same Capacity</Text>
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

                {relaxedAvailableRooms.length === 0 ? (
                  <Text style={styles.emptySectionText}>
                    No rooms are available with the current match filters. Turn off one or more
                    filters to broaden the results.
                  </Text>
                ) : (
                  relaxedAvailableRooms.map(renderRoomCard)
                )}
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
    gap: 14,
  },
  roomHeader: {
    gap: 12,
  },
  roomHeaderText: {
    gap: 4,
  },
  roomName: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 17,
  },
  roomMeta: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
  roomDetailGrid: {
    gap: 8,
  },
  roomDetail: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
  },
  reserveButton: {
    alignSelf: "flex-start",
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reserveButtonText: {
    color: colors.white,
    fontFamily: fonts.bold,
    fontSize: 13,
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
