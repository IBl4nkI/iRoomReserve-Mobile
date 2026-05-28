import { router, useFocusEffect } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { BleManager, type Device, State } from "react-native-ble-plx";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

import DashboardTopNav from "@/components/dashboard/DashboardTopNav";
import { useToast } from "@/components/ToastProvider";
import { dashboardStyles as styles } from "@/components/dashboard/styles";
import { colors } from "@/constants/theme";
import { getUserProfile } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import {
  activatePresenceMonitoring,
  deactivatePresenceMonitoring,
  syncPresenceMonitoringSession,
} from "@/services/presence-monitor.service";
import {
  onUnreadNotifications,
  shouldHideUtilityStaffInboxNotification,
} from "@/services/notifications.service";
import { getRoomsByIds } from "@/services/rooms.service";
import {
  formatCompactFloorLabel,
  getRoomFloorId,
  getRoomFloorLabel,
} from "@/services/floors.service";
import {
  checkInReservation,
  completeReservation,
  getReservationsByCampus,
  getReservationsByUser,
} from "@/services/reservations.service";
import { formatTime12h } from "@/services/schedules.service";
import type {
  ReservationApprovalStep,
  ReservationCampus,
  ReservationRecord,
  Room,
} from "@/types/reservation";

const BLE_SERVICE_UUID =
  process.env.EXPO_PUBLIC_ESP32_BLE_SERVICE_UUID?.trim() ?? "";
const BLE_BEACON_CHAR_UUID =
  process.env.EXPO_PUBLIC_ESP32_BLE_BEACON_CHARACTERISTIC_UUID?.trim() ?? "";
const BLE_SCAN_TIMEOUT_MS = 15000;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const BLE_DEBUG = true;
const MAIN_CAMPUS_BUILDING_OPTIONS = [
  { id: "gd1", label: "GD1" },
  { id: "gd2", label: "GD2" },
  { id: "gd3", label: "GD3" },
];

type ReservationFilterValue = string | null;
type ReservationFilterOption = {
  id: string;
  label: string;
};

function ensureBleConfiguration() {
  if (!BLE_SERVICE_UUID || !BLE_BEACON_CHAR_UUID) {
    throw new Error(
      "Bluetooth check-in is not configured. Set EXPO_PUBLIC_ESP32_BLE_SERVICE_UUID and EXPO_PUBLIC_ESP32_BLE_BEACON_CHARACTERISTIC_UUID."
    );
  }
}

function decodeBase64ToAscii(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  let output = "";
  let buffer = 0;
  let bitsCollected = 0;

  for (const char of value.replace(/=+$/, "")) {
    const index = BASE64_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }

    buffer = (buffer << 6) | index;
    bitsCollected += 6;

    if (bitsCollected >= 8) {
      bitsCollected -= 8;
      output += String.fromCharCode((buffer >> bitsCollected) & 0xff);
    }
  }

  return output;
}

function logBleDebug(message: string, extra?: Record<string, unknown>) {
  if (!BLE_DEBUG) {
    return;
  }

  console.log("[BLE DEBUG]", message, extra ?? {});
}

function getExpectedBeaconNameState(
  device: Pick<Device, "localName" | "name">,
  expectedBeaconId: string
) {
  const normalizedExpectedBeaconId = expectedBeaconId.trim().toLowerCase();
  if (!normalizedExpectedBeaconId) {
    return "mismatch" as const;
  }

  const visibleNames = [device.localName, device.name]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  if (visibleNames.length === 0) {
    return "missing" as const;
  }

  return visibleNames.includes(normalizedExpectedBeaconId)
    ? ("match" as const)
    : ("mismatch" as const);
}

function EmptyStateCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function MailIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4.5 6.75C4.5 5.7835 5.2835 5 6.25 5H17.75C18.7165 5 19.5 5.7835 19.5 6.75V17.25C19.5 18.2165 18.7165 19 17.75 19H6.25C5.2835 19 4.5 18.2165 4.5 17.25V6.75Z"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.25 7L11.0168 11.3251C11.6099 11.7699 12.3901 11.7699 12.9832 11.3251L18.75 7"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function StatusChip({
  status,
}: {
  status: "Active" | "Approved" | "Occupied" | "Pending" | "Rejected";
}) {
  if (status === "Approved") {
    return (
      <View style={[styles.chip, styles.chipApproved]}>
        <Text style={[styles.chipText, styles.chipTextApproved]}>Approved</Text>
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

  if (status === "Rejected") {
    return (
      <View style={[styles.chip, styles.chipRejected]}>
        <Text style={[styles.chipText, styles.chipTextRejected]}>Rejected</Text>
      </View>
    );
  }

  if (status === "Active") {
    return (
      <View style={[styles.chip, styles.chipActive]}>
        <Text style={[styles.chipText, styles.chipTextActive]}>Active</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipPending]}>
      <Text style={[styles.chipText, styles.chipTextPending]}>Pending</Text>
    </View>
  );
}

function sortReservations(left: ReservationRecord, right: ReservationRecord) {
  return (
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    right.id.localeCompare(left.id)
  );
}

function sortUpcomingReservations(left: ReservationRecord, right: ReservationRecord) {
  return (
    left.date.localeCompare(right.date) ||
    left.startTime.localeCompare(right.startTime) ||
    left.id.localeCompare(right.id)
  );
}

function formatReservationDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatReservationDates(dates?: string[], fallbackDate?: string) {
  const dateList = dates?.length ? dates : fallbackDate ? [fallbackDate] : [];
  return dateList.map((date) => formatReservationDate(date)).join(", ");
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

function isOngoingReservation(
  reservation: ReservationRecord,
  todayDateKey: string,
  currentTimeKey: string
) {
  return (
    reservation.status === "approved" &&
    reservation.date === todayDateKey &&
    reservation.startTime <= currentTimeKey &&
    reservation.endTime > currentTimeKey
  );
}

function canStartReservation(
  reservation: ReservationRecord | null,
  todayDateKey: string,
  currentTimeKey: string
) {
  if (!reservation) {
    return false;
  }

  return (
    reservation.status === "approved" &&
    !reservation.checkedInAt &&
    reservation.date === todayDateKey &&
    reservation.startTime <= currentTimeKey &&
    reservation.endTime > currentTimeKey
  );
}

function encodeAsciiToBase64(value: string) {
  let output = "";

  for (let index = 0; index < value.length; index += 3) {
    const first = value.charCodeAt(index);
    const second = index + 1 < value.length ? value.charCodeAt(index + 1) : NaN;
    const third = index + 2 < value.length ? value.charCodeAt(index + 2) : NaN;
    const chunk =
      (first << 16) |
      ((Number.isNaN(second) ? 0 : second) << 8) |
      (Number.isNaN(third) ? 0 : third);

    output += BASE64_ALPHABET[(chunk >> 18) & 63];
    output += BASE64_ALPHABET[(chunk >> 12) & 63];
    output += Number.isNaN(second) ? "=" : BASE64_ALPHABET[(chunk >> 6) & 63];
    output += Number.isNaN(third) ? "=" : BASE64_ALPHABET[chunk & 63];
  }

  return output;
}

function isCurrentOrFutureReservation(
  reservation: ReservationRecord,
  todayDateKey: string,
  currentTimeKey: string
) {
  return (
    reservation.date > todayDateKey ||
    (reservation.date === todayDateKey && reservation.endTime > currentTimeKey)
  );
}

function getCurrentApprovalStep(
  reservation: ReservationRecord
): ReservationApprovalStep | null {
  if (
    !Array.isArray(reservation.approvalFlow) ||
    typeof reservation.currentStep !== "number"
  ) {
    return null;
  }

  return reservation.approvalFlow[reservation.currentStep] ?? null;
}

function getPendingStageLabel(reservation: ReservationRecord) {
  const currentStep = getCurrentApprovalStep(reservation);

  if (currentStep?.role === "advisor") {
    return "Waiting for faculty approval";
  }

  if (currentStep?.role === "building_admin") {
    return "Waiting for building admin approval";
  }

  return "Waiting for approval";
}

function getDisplayStatus(reservation: ReservationRecord) {
  if (reservation.checkedInAt) {
    return "Occupied" as const;
  }

  if (reservation.status === "pending") {
    return "Pending" as const;
  }

  if (reservation.status === "approved") {
    return "Approved" as const;
  }

  if (reservation.status === "rejected" || reservation.status === "cancelled") {
    return "Rejected" as const;
  }

  return "Active" as const;
}

function getReservationFloorOption(
  reservation: ReservationRecord,
  roomsById: Record<string, Room>
): ReservationFilterOption | null {
  const room = roomsById[reservation.roomId];

  if (!room?.floor) {
    return null;
  }

  const label = getRoomFloorLabel(room);

  return {
    id: getRoomFloorId(room),
    label: formatCompactFloorLabel(label) || label,
  };
}

function getSectionFloorOptions(
  reservations: ReservationRecord[],
  roomsById: Record<string, Room>,
  buildingFilter: ReservationFilterValue
) {
  const optionsById = new Map<string, ReservationFilterOption>();

  reservations.forEach((reservation) => {
    if (
      buildingFilter &&
      reservation.buildingId.toLowerCase() !== buildingFilter
    ) {
      return;
    }

    const option = getReservationFloorOption(reservation, roomsById);

    if (option) {
      optionsById.set(option.id, option);
    }
  });

  return [...optionsById.values()].sort((left, right) =>
    left.label.localeCompare(right.label, undefined, { numeric: true })
  );
}

function getDefaultBuildingFilter(reservations: ReservationRecord[]) {
  const buildingIds = new Set(
    reservations.map((reservation) => reservation.buildingId.toLowerCase())
  );

  return (
    MAIN_CAMPUS_BUILDING_OPTIONS.find((option) => buildingIds.has(option.id))?.id ??
    null
  );
}

function filterReservationsByBuildingAndFloor(
  reservations: ReservationRecord[],
  roomsById: Record<string, Room>,
  buildingFilter: ReservationFilterValue,
  floorFilter: ReservationFilterValue
) {
  return reservations.filter((reservation) => {
    if (
      buildingFilter &&
      reservation.buildingId.toLowerCase() !== buildingFilter
    ) {
      return false;
    }

    if (!floorFilter) {
      return true;
    }

    return getReservationFloorOption(reservation, roomsById)?.id === floorFilter;
  });
}

function ReservationRadioGroup({
  options,
  selectedValue,
  onChange,
}: {
  options: ReservationFilterOption[];
  selectedValue: ReservationFilterValue;
  onChange: (value: ReservationFilterValue) => void;
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

function ReservationCard({
  reservation,
  showPendingStage = false,
  compactTitle = false,
  locationLabel,
}: {
  reservation: ReservationRecord;
  showPendingStage?: boolean;
  compactTitle?: boolean;
  locationLabel?: string;
}) {
  return (
    <View style={styles.listItem}>
      <View style={styles.reservationHeaderRow}>
        <View style={styles.reservationHeaderContent}>
          <Text
            style={[
              compactTitle ? styles.reservationRoomName : styles.sectionTitleWrap,
              compactTitle ? { marginTop: 0 } : null,
            ]}
          >
            {reservation.roomName}
          </Text>
        </View>
        <View style={styles.reservationHeaderBadge}>
          <StatusChip status={getDisplayStatus(reservation)} />
        </View>
      </View>
      <Text style={styles.reservationMeta}>{locationLabel ?? reservation.buildingName}</Text>
      <Text style={styles.reservationMeta}>
        {formatReservationDates(reservation.dates, reservation.date)}
      </Text>
      <Text style={styles.reservationMeta}>
        {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
      </Text>
      <Text style={styles.reservationMeta}>
        {reservation.programDepartmentOrganization ||
          "Program / Department / Organization not provided"}
      </Text>
      <Text style={styles.reservationPurpose}>{reservation.purpose}</Text>
      {showPendingStage ? (
        <Text style={[styles.reservationMeta, { color: colors.primary }]}>
          {getPendingStageLabel(reservation)}
        </Text>
      ) : null}
    </View>
  );
}

export default function DashboardHomeScreen() {
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();
  const [firstName, setFirstName] = React.useState("My");
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [roomsById, setRoomsById] = React.useState<Record<string, Room>>({});
  const [userRole, setUserRole] = React.useState<string | null>(null);
  const [assignedCampus, setAssignedCampus] = React.useState<ReservationCampus | null>(null);
  const [ongoingBuildingFilter, setOngoingBuildingFilter] =
    React.useState<ReservationFilterValue>(null);
  const [ongoingFloorFilter, setOngoingFloorFilter] =
    React.useState<ReservationFilterValue>(null);
  const [upcomingBuildingFilter, setUpcomingBuildingFilter] =
    React.useState<ReservationFilterValue>(null);
  const [upcomingFloorFilter, setUpcomingFloorFilter] =
    React.useState<ReservationFilterValue>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [unreadInboxCount, setUnreadInboxCount] = React.useState(0);
  const [reservationActionLoading, setReservationActionLoading] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const bleManagerRef = React.useRef<BleManager | null>(null);
  const connectedBeaconDeviceRef = React.useRef<Device | null>(null);
  const isUtilityStaff = userRole?.trim() === "Utility Staff";

  if (!bleManagerRef.current) {
    bleManagerRef.current = new BleManager();
  }

  const markReservationCompletedLocally = React.useCallback((reservationId: string) => {
    setReservations((currentValue) =>
      currentValue.map((reservation) =>
        reservation.id === reservationId
          ? {
              ...reservation,
              checkInMethod: null,
              status: "completed",
            }
          : reservation
      )
    );
  }, []);

  const loadDashboard = React.useCallback(async (showSpinner = true) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      if (isMountedRef.current) {
        setLoading(false);
      }
      return;
    }

    if (showSpinner && isMountedRef.current) {
      setLoading(true);
    }

    try {
      const profile = await getUserProfile(currentUser.uid);

      if (!isMountedRef.current) {
        return;
      }

      if (profile?.firstName?.trim()) {
        setFirstName(profile.firstName.trim());
      }

      const normalizedRole = profile?.role?.trim() ?? null;
      const campus = profile?.campus === "main" || profile?.campus === "digi"
        ? profile.campus
        : null;
      setUserRole(normalizedRole);
      setAssignedCampus(campus);

      const nextReservations =
        normalizedRole === "Utility Staff" && campus
          ? await getReservationsByCampus(campus)
          : await getReservationsByUser(currentUser.uid);
      const roomIds = [...new Set(nextReservations.map((reservation) => reservation.roomId))];
      const rooms = await getRoomsByIds(roomIds);

      if (!isMountedRef.current) {
        return;
      }

      setReservations(nextReservations.sort(sortReservations));
      setRoomsById(
        Object.fromEntries(rooms.map((room) => [room.id, room] as const))
      );
      setError(null);
    } catch (caughtError) {
      if (!isMountedRef.current) {
        return;
      }

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Failed to load dashboard data."
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  React.useEffect(() => {
    isMountedRef.current = true;
    void loadDashboard();

    return () => {
      isMountedRef.current = false;
      bleManagerRef.current?.stopDeviceScan();
      connectedBeaconDeviceRef.current?.cancelConnection().catch(() => undefined);
      connectedBeaconDeviceRef.current = null;
    };
  }, [loadDashboard]);

  useFocusEffect(
    React.useCallback(() => {
      isMountedRef.current = true;
      void loadDashboard(false);

      return () => {
        isMountedRef.current = false;
      };
    }, [loadDashboard])
  );

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);

    try {
      await loadDashboard(false);
    } finally {
      if (isMountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [loadDashboard]);

  const pendingReservations = reservations.filter(
    (reservation) =>
      reservation.status === "pending" &&
      isCurrentOrFutureReservation(
        reservation,
        getLocalDateKey(),
        getCurrentTimeKey()
      )
  );
  const todayDateKey = getLocalDateKey();
  const currentTimeKey = getCurrentTimeKey();
  const approvedReservations = reservations.filter(
    (reservation) =>
      reservation.status === "approved" &&
      isCurrentOrFutureReservation(reservation, todayDateKey, currentTimeKey)
  );
  const ongoingReservations = isUtilityStaff
    ? approvedReservations.filter(
        (reservation) =>
          Boolean(reservation.checkedInAt) &&
          isOngoingReservation(reservation, todayDateKey, currentTimeKey)
      )
    : approvedReservations.filter((reservation) =>
        isOngoingReservation(reservation, todayDateKey, currentTimeKey)
      ).slice(0, 1);
  const ongoingReservation = ongoingReservations[0] ?? null;
  const ongoingRoom = ongoingReservation ? roomsById[ongoingReservation.roomId] ?? null : null;
  const ongoingRoomBeaconId = ongoingRoom?.beaconId?.trim() ?? "";
  const upcomingReservations = approvedReservations
    .filter(
      (reservation) =>
        !ongoingReservations.some((ongoingItem) => ongoingItem.id === reservation.id)
    )
    .sort(sortUpcomingReservations);
  const defaultOngoingBuildingFilter = React.useMemo(
    () =>
      assignedCampus === "main"
        ? getDefaultBuildingFilter(ongoingReservations)
        : null,
    [assignedCampus, ongoingReservations]
  );
  const defaultUpcomingBuildingFilter = React.useMemo(
    () =>
      assignedCampus === "main"
        ? getDefaultBuildingFilter(upcomingReservations)
        : null,
    [assignedCampus, upcomingReservations]
  );
  const effectiveOngoingBuildingFilter =
    assignedCampus === "main"
      ? ongoingBuildingFilter ?? defaultOngoingBuildingFilter
      : null;
  const effectiveUpcomingBuildingFilter =
    assignedCampus === "main"
      ? upcomingBuildingFilter ?? defaultUpcomingBuildingFilter
      : null;
  const ongoingBuildingOptions = React.useMemo(
    () =>
      isUtilityStaff && assignedCampus === "main"
        ? MAIN_CAMPUS_BUILDING_OPTIONS
        : [],
    [assignedCampus, isUtilityStaff]
  );
  const upcomingBuildingOptions = React.useMemo(
    () =>
      isUtilityStaff && assignedCampus === "main"
        ? MAIN_CAMPUS_BUILDING_OPTIONS
        : [],
    [assignedCampus, isUtilityStaff]
  );
  const ongoingFloorOptions = React.useMemo(
    () =>
      isUtilityStaff
        ? getSectionFloorOptions(
            ongoingReservations,
            roomsById,
            effectiveOngoingBuildingFilter
          )
        : [],
    [
      effectiveOngoingBuildingFilter,
      isUtilityStaff,
      ongoingReservations,
      roomsById,
    ]
  );
  const upcomingFloorOptions = React.useMemo(
    () =>
      isUtilityStaff
        ? getSectionFloorOptions(
            upcomingReservations,
            roomsById,
            effectiveUpcomingBuildingFilter
          )
        : [],
    [
      effectiveUpcomingBuildingFilter,
      isUtilityStaff,
      upcomingReservations,
      roomsById,
    ]
  );
  const effectiveOngoingFloorFilter =
    ongoingFloorFilter ?? ongoingFloorOptions[0]?.id ?? null;
  const effectiveUpcomingFloorFilter =
    upcomingFloorFilter ?? upcomingFloorOptions[0]?.id ?? null;
  const filteredOngoingReservations = isUtilityStaff
    ? filterReservationsByBuildingAndFloor(
        ongoingReservations,
        roomsById,
        effectiveOngoingBuildingFilter,
        effectiveOngoingFloorFilter
      )
    : ongoingReservations;
  const filteredUpcomingReservations = isUtilityStaff
    ? filterReservationsByBuildingAndFloor(
        upcomingReservations,
        roomsById,
        effectiveUpcomingBuildingFilter,
        effectiveUpcomingFloorFilter
      )
    : upcomingReservations;

  React.useEffect(() => {
    if (assignedCampus !== "main" && ongoingBuildingFilter) {
      setOngoingBuildingFilter(null);
    }
  }, [assignedCampus, ongoingBuildingFilter]);

  React.useEffect(() => {
    if (assignedCampus !== "main" && upcomingBuildingFilter) {
      setUpcomingBuildingFilter(null);
    }
  }, [assignedCampus, upcomingBuildingFilter]);

  React.useEffect(() => {
    if (
      ongoingFloorFilter &&
      !ongoingFloorOptions.some((option) => option.id === ongoingFloorFilter)
    ) {
      setOngoingFloorFilter(null);
    }
  }, [ongoingFloorFilter, ongoingFloorOptions]);

  React.useEffect(() => {
    if (
      upcomingFloorFilter &&
      !upcomingFloorOptions.some((option) => option.id === upcomingFloorFilter)
    ) {
      setUpcomingFloorFilter(null);
    }
  }, [upcomingFloorFilter, upcomingFloorOptions]);

  const hasUnreadInbox = unreadInboxCount > 0;
  const isReservationStarted = !isUtilityStaff && Boolean(ongoingReservation?.checkedInAt);
  const canStartOngoingReservation = canStartReservation(
    ongoingReservation,
    todayDateKey,
    currentTimeKey
  );
  const canManageOngoingReservation =
    !isUtilityStaff &&
    (isReservationStarted || canStartOngoingReservation);
  const shouldMonitorOngoingReservation =
    !isUtilityStaff &&
    Boolean(ongoingReservation?.checkedInAt) &&
    ongoingReservation?.checkInMethod === "bluetooth" &&
    Boolean(ongoingRoomBeaconId);
  const getRoomLocationLabel = (reservation: ReservationRecord) => {
    const room = roomsById[reservation.roomId];
    return room?.floor
      ? `${reservation.buildingName} - ${room.floor}`
      : reservation.buildingName;
  };

  React.useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setUnreadInboxCount(0);
      return;
    }

    const unsubscribe = onUnreadNotifications(currentUser.uid, (notifications) => {
      if (isMountedRef.current) {
        setUnreadInboxCount(
          isUtilityStaff
            ? notifications.filter(
                (notification) => !shouldHideUtilityStaffInboxNotification(notification)
              ).length
            : notifications.length
        );
      }
    });

    return unsubscribe;
  }, [isUtilityStaff]);

  React.useEffect(() => {
    const currentUser = auth.currentUser;

    if (loading || !currentUser) {
      return;
    }

    let cancelled = false;

    const syncMonitor = async () => {
      if (shouldMonitorOngoingReservation && ongoingReservation && ongoingRoomBeaconId) {
        await syncPresenceMonitoringSession({
          beaconId: ongoingRoomBeaconId,
          reservationId: ongoingReservation.id,
          userId: currentUser.uid,
        });
        return;
      }

      await syncPresenceMonitoringSession(null);
    };

    void syncMonitor().catch((error) => {
      if (!cancelled) {
        console.warn("[presence-monitor] unable to sync dashboard session", error);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    loading,
    ongoingReservation,
    ongoingRoomBeaconId,
    shouldMonitorOngoingReservation,
  ]);

  const handleReservationAction = React.useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || !ongoingReservation || reservationActionLoading) {
      return;
    }

    async function requestBluetoothPermissions() {
      if (Platform.OS !== "android") {
        return true;
      }

      if (Platform.Version >= 31) {
        const result = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        ]);

        return (
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
            PermissionsAndroid.RESULTS.GRANTED &&
          result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
            PermissionsAndroid.RESULTS.GRANTED
        );
      }

      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );

      return result === PermissionsAndroid.RESULTS.GRANTED;
    }

    async function ensureBluetoothPoweredOn() {
      const bleManager = bleManagerRef.current;
      if (!bleManager) {
        throw new Error("Bluetooth manager is unavailable.");
      }

      const currentState = await bleManager.state();
      if (currentState === State.PoweredOn) {
        return;
      }

      throw new Error("Please turn on Bluetooth before starting this reservation.");
    }

    async function connectToMatchingBeacon(expectedBeaconId: string) {
      ensureBleConfiguration();

      const bleManager = bleManagerRef.current;
      if (!bleManager) {
        throw new Error("Bluetooth manager is unavailable.");
      }

      const expectedBase64 = encodeAsciiToBase64(expectedBeaconId);
      const attemptedDeviceIds = new Set<string>();
      let scannedDeviceCount = 0;
      let attemptedConnectionCount = 0;
      let lastSeenDeviceSummary = "";
      let lastReadBeaconId = "";

      bleManager.stopDeviceScan();
      try {
        const connectedDevices = await bleManager.connectedDevices([BLE_SERVICE_UUID]);
        await Promise.all(
          connectedDevices.map((device) => device.cancelConnection().catch(() => undefined))
        );
      } catch {
        // Best-effort cleanup before starting a new scan.
      }

      logBleDebug("Starting beacon scan", {
        expectedBeaconId,
        serviceUuid: BLE_SERVICE_UUID,
        beaconCharacteristicUuid: BLE_BEACON_CHAR_UUID,
      });

      return await new Promise<Device>((resolve, reject) => {
        let settled = false;

        const finish = (callback: () => void) => {
          if (settled) {
            return;
          }

          settled = true;
          bleManager.stopDeviceScan();
          callback();
        };

        const timeout = setTimeout(() => {
          finish(() =>
            reject(
              new Error(
                `Couldn't find the room beacon for ${expectedBeaconId}. Debug: scanned ${scannedDeviceCount} device(s), attempted ${attemptedConnectionCount} connection(s), last device "${lastSeenDeviceSummary}", last beacon read "${lastReadBeaconId || "none"}".`
              )
            )
          );
        }, BLE_SCAN_TIMEOUT_MS);

        bleManager.startDeviceScan(null, null, async (error, device) => {
          if (settled) {
            return;
          }

          if (error) {
            logBleDebug("Scan error", { message: error.message });
            clearTimeout(timeout);
            finish(() => reject(new Error(error.message)));
            return;
          }

          if (!device?.id || attemptedDeviceIds.has(device.id)) {
            return;
          }

          scannedDeviceCount += 1;
          lastSeenDeviceSummary = `${device.name ?? "unnamed"} / ${device.id} / RSSI ${device.rssi ?? "n/a"}`;
          logBleDebug("Discovered device", {
            id: device.id,
            name: device.name,
            localName: device.localName,
            rssi: device.rssi,
          });

          const beaconNameState = getExpectedBeaconNameState(device, expectedBeaconId);

          if (beaconNameState === "mismatch") {
            logBleDebug("Device rejected for name mismatch", {
              expectedBeaconId,
              id: device.id,
              localName: device.localName,
              name: device.name,
            });
            return;
          }

          if (beaconNameState === "missing") {
            logBleDebug("Device name unavailable, falling back to characteristic verification", {
              expectedBeaconId,
              id: device.id,
              rssi: device.rssi,
            });
          }

          attemptedDeviceIds.add(device.id);
          attemptedConnectionCount += 1;

          let connectedDevice: Device | null = null;

          try {
            logBleDebug("Attempting connection", { id: device.id });
            connectedDevice = await bleManager.connectToDevice(device.id, {
              autoConnect: false,
              timeout: 10000,
            });
            const discoveredDevice =
              await connectedDevice.discoverAllServicesAndCharacteristics();
            const beaconCharacteristic =
              await discoveredDevice.readCharacteristicForService(
                BLE_SERVICE_UUID,
                BLE_BEACON_CHAR_UUID
              );
            lastReadBeaconId = decodeBase64ToAscii(beaconCharacteristic.value);
            logBleDebug("Read beacon characteristic", {
              id: device.id,
              expectedBeaconId,
              readBeaconId: lastReadBeaconId,
            });

            if (beaconCharacteristic.value === expectedBase64) {
              logBleDebug("Matched expected beacon", {
                id: device.id,
                expectedBeaconId,
                rssi: device.rssi,
              });
              clearTimeout(timeout);
              finish(() => resolve(discoveredDevice));
              return;
            }

            logBleDebug("Beacon mismatch", {
              id: device.id,
              expectedBeaconId,
              readBeaconId: lastReadBeaconId,
            });
            await connectedDevice.cancelConnection().catch(() => undefined);
          } catch (caughtError) {
            await connectedDevice?.cancelConnection().catch(() => undefined);
            logBleDebug("Connection/read failed", {
              id: device.id,
              message: caughtError instanceof Error ? caughtError.message : String(caughtError),
            });
            // Continue scanning until timeout or a matching beacon is found.
          }
        });
      });
    }

    try {
      setReservationActionLoading(true);

      if (isReservationStarted) {
        await completeReservation(ongoingReservation.id, currentUser.uid);
        markReservationCompletedLocally(ongoingReservation.id);
        await deactivatePresenceMonitoring();
        if (connectedBeaconDeviceRef.current) {
          await connectedBeaconDeviceRef.current.cancelConnection().catch(() => undefined);
          connectedBeaconDeviceRef.current = null;
        }
        showToast("Reservation finished successfully. Thank you for keeping the room clean.");
      } else if (canStartOngoingReservation) {
        if (ongoingRoomBeaconId) {
          Alert.alert(
            "Bluetooth Check-In Required",
            `Connect to the room beacon "${ongoingRoomBeaconId}" to start this reservation.`,
            [
              {
                style: "cancel",
                text: "Cancel",
              },
              {
                text: "Connect",
                onPress: async () => {
                  try {
                    setReservationActionLoading(true);

                    const permissionGranted = await requestBluetoothPermissions();
                    if (!permissionGranted) {
                      throw new Error("Bluetooth permission is required for beacon check-in.");
                    }

                    await ensureBluetoothPoweredOn();
                    showToast("Scanning for room beacon...");

                    const matchedDevice = await connectToMatchingBeacon(ongoingRoomBeaconId);
                    connectedBeaconDeviceRef.current = matchedDevice;

                    await checkInReservation(
                      ongoingReservation.id,
                      currentUser.uid,
                      "bluetooth"
                    );

                    await matchedDevice.cancelConnection().catch(() => undefined);
                    connectedBeaconDeviceRef.current = null;
                    await activatePresenceMonitoring({
                      beaconId: ongoingRoomBeaconId,
                      reservationId: ongoingReservation.id,
                      userId: currentUser.uid,
                    });

                    showToast("Reservation started with Bluetooth check-in.");
                    await loadDashboard(false);
                  } catch (caughtError) {
                    Alert.alert(
                      "Bluetooth Check-In Failed",
                      caughtError instanceof Error
                        ? caughtError.message
                        : "We couldn't connect to the room beacon right now."
                    );
                  } finally {
                    setReservationActionLoading(false);
                  }
                },
              },
            ]
          );
          return;
        }

        await checkInReservation(ongoingReservation.id, currentUser.uid, "manual");
        showToast("Reservation started successfully. Please wait for the utility staff to come.");
      } else {
        return;
      }

      await loadDashboard(false);
    } catch (caughtError) {
      Alert.alert(
        "Reservation Update Failed",
        caughtError instanceof Error
          ? caughtError.message
          : "We couldn't update this reservation right now."
      );
    } finally {
      setReservationActionLoading(false);
    }
  }, [
    canStartOngoingReservation,
    isReservationStarted,
    loadDashboard,
    markReservationCompletedLocally,
    ongoingReservation,
    ongoingRoomBeaconId,
    reservationActionLoading,
    showToast,
  ]);

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void handleRefresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <View style={styles.screenTitleRow}>
          <Text style={styles.screenTitleCentered}>{`${firstName}'s Dashboard`}</Text>
          <Pressable
            style={styles.inboxShortcutButton}
            onPress={() => router.push("/(main)/dashboard/inbox")}
          >
            <MailIcon />
            {hasUnreadInbox ? <View style={styles.inboxShortcutDot} /> : null}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <EmptyStateCard title="Dashboard" message={error} />
        ) : (
          <>
            {ongoingReservations.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>
                  {isUtilityStaff ? "Ongoing Reservations" : "Ongoing Reservation"}
                </Text>
                {isUtilityStaff && assignedCampus === "main" ? (
                  <ReservationRadioGroup
                    options={ongoingBuildingOptions}
                    selectedValue={effectiveOngoingBuildingFilter}
                    onChange={(value) => {
                      setOngoingBuildingFilter(value);
                      setOngoingFloorFilter(null);
                    }}
                  />
                ) : null}
                {isUtilityStaff ? (
                  <ReservationRadioGroup
                    options={ongoingFloorOptions}
                    selectedValue={effectiveOngoingFloorFilter}
                    onChange={setOngoingFloorFilter}
                  />
                ) : null}
                {filteredOngoingReservations.length === 0 ? (
                  <Text style={styles.emptyText}>
                    There are no ongoing reservations for this filter.
                  </Text>
                ) : (
                  filteredOngoingReservations.map((reservation, index) => (
                    <View
                      key={reservation.id}
                      style={index === filteredOngoingReservations.length - 1 ? null : styles.dashboardGroupItem}
                    >
                      <ReservationCard
                        reservation={reservation}
                        compactTitle
                        locationLabel={getRoomLocationLabel(reservation)}
                      />
                      {!isUtilityStaff && canManageOngoingReservation ? (
                        <Pressable
                          style={[
                            styles.reservationActionButton,
                            isReservationStarted
                              ? styles.reservationActionButtonFinish
                              : styles.reservationActionButtonStart,
                            reservationActionLoading
                              ? styles.reservationActionButtonDisabled
                              : null,
                          ]}
                          onPress={handleReservationAction}
                          disabled={reservationActionLoading}
                        >
                          <Text style={styles.reservationActionButtonText}>
                            {reservationActionLoading
                              ? isReservationStarted
                                ? "Finishing..."
                                : "Starting..."
                              : isReservationStarted
                                ? "Finish Reservation"
                                : "Start Reservation"}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            ) : (
              <EmptyStateCard
                title={isUtilityStaff ? "Ongoing Reservations" : "Ongoing Reservation"}
                message="There are no ongoing reservations."
              />
            )}

            {isUtilityStaff ? null : pendingReservations.length === 0 ? (
              <EmptyStateCard
                title="Pending Requests"
                message="There are no pending requests."
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Pending Requests</Text>
                {pendingReservations.map((reservation, index) => (
                  <View
                    key={reservation.id}
                    style={[
                      index === pendingReservations.length - 1
                        ? { marginBottom: 0 }
                        : null,
                    ]}
                  >
                    <ReservationCard
                      reservation={reservation}
                      compactTitle
                      locationLabel={getRoomLocationLabel(reservation)}
                      showPendingStage
                    />
                  </View>
                ))}
              </View>
            )}

            {upcomingReservations.length === 0 ? (
              <EmptyStateCard
                title="Upcoming Reservations"
                message="There are no upcoming reservations."
              />
            ) : (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Upcoming Reservations</Text>
                {isUtilityStaff && assignedCampus === "main" ? (
                  <ReservationRadioGroup
                    options={upcomingBuildingOptions}
                    selectedValue={effectiveUpcomingBuildingFilter}
                    onChange={(value) => {
                      setUpcomingBuildingFilter(value);
                      setUpcomingFloorFilter(null);
                    }}
                  />
                ) : null}
                {isUtilityStaff ? (
                  <ReservationRadioGroup
                    options={upcomingFloorOptions}
                    selectedValue={effectiveUpcomingFloorFilter}
                    onChange={setUpcomingFloorFilter}
                  />
                ) : null}
                {filteredUpcomingReservations.length === 0 ? (
                  <Text style={styles.emptyText}>
                    There are no upcoming reservations for this filter.
                  </Text>
                ) : (
                  filteredUpcomingReservations.map((reservation, index) => (
                    <View
                      key={reservation.id}
                      style={index === filteredUpcomingReservations.length - 1 ? { marginBottom: 0 } : null}
                    >
                      <ReservationCard
                        reservation={reservation}
                        compactTitle
                        locationLabel={getRoomLocationLabel(reservation)}
                      />
                    </View>
                  ))
                )}
              </View>
            )}
          </>
        )}

        {isUtilityStaff ? null : (
          <Pressable
            style={styles.actionButton}
            onPress={() => router.push("/(main)/dashboard/reserve-now")}
          >
            <Text style={styles.actionButtonText}>Reserve Now</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
