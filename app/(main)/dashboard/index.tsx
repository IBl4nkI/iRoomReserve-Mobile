import { router } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  Alert,
  PermissionsAndroid,
  Platform,
  Pressable,
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
import { getRoomsByIds } from "@/services/rooms.service";
import {
  checkInReservation,
  completeReservation,
  getReservationsByCampus,
  getReservationsByUser,
} from "@/services/reservations.service";
import { formatTime12h } from "@/services/schedules.service";
import type {
  ReservationApprovalStep,
  ReservationRecord,
  Room,
} from "@/types/reservation";

const BLE_SERVICE_UUID = "7becefce-f0e2-4a3e-8db6-53a9ee63f176";
const BLE_BEACON_CHAR_UUID = "2c993f0e-0b22-47c1-b9c2-8d1fbe4b1973";
const BLE_SCAN_TIMEOUT_MS = 15000;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

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

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 20C9.95833 21.1667 10.7917 21.75 12 21.75C13.2083 21.75 14.0417 21.1667 14.5 20"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M5.5 17.5H18.5C17.6667 16.6667 17.25 15.5208 17.25 14.0625V10.875C17.25 7.81842 14.9926 5.25 12 5.25C9.00736 5.25 6.75 7.81842 6.75 10.875V14.0625C6.75 15.5208 6.33333 16.6667 5.5 17.5Z"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10.125 4.625C10.125 3.58947 10.9645 2.75 12 2.75C13.0355 2.75 13.875 3.58947 13.875 4.625"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
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
    return reservation.campus === "main"
      ? "Faculty approved, waiting for building admin approval"
      : "Waiting for building admin approval";
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
      <View style={styles.row}>
        <Text
          style={[
            compactTitle ? styles.reservationTitle : styles.sectionTitle,
            compactTitle ? { marginTop: 0 } : null,
          ]}
        >
          {reservation.roomName}
        </Text>
        <StatusChip status={getDisplayStatus(reservation)} />
      </View>
      <Text style={styles.reservationMeta}>{locationLabel ?? reservation.buildingName}</Text>
      <Text style={styles.reservationMeta}>{formatReservationDate(reservation.date)}</Text>
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
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reservationActionLoading, setReservationActionLoading] = React.useState(false);
  const isMountedRef = React.useRef(true);
  const bleManagerRef = React.useRef<BleManager | null>(null);
  const connectedBeaconDeviceRef = React.useRef<Device | null>(null);
  const isUtilityStaff = userRole?.trim() === "Utility Staff";

  if (!bleManagerRef.current) {
    bleManagerRef.current = new BleManager();
  }

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
    void loadDashboard();

    return () => {
      isMountedRef.current = false;
      bleManagerRef.current?.stopDeviceScan();
      bleManagerRef.current?.destroy();
      bleManagerRef.current = null;
    };
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
  const hasUnreadInbox = isUtilityStaff ? false : pendingReservations.length > 0;
  const isReservationStarted = !isUtilityStaff && Boolean(ongoingReservation?.checkedInAt);
  const canStartOngoingReservation = canStartReservation(
    ongoingReservation,
    todayDateKey,
    currentTimeKey
  );
  const canManageOngoingReservation =
    !isUtilityStaff &&
    (isReservationStarted || canStartOngoingReservation);
  const getRoomLocationLabel = (reservation: ReservationRecord) => {
    const room = roomsById[reservation.roomId];
    return room?.floor
      ? `${reservation.buildingName} - ${room.floor}`
      : reservation.buildingName;
  };
  const handleReservationAction = async () => {
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
      const bleManager = bleManagerRef.current;
      if (!bleManager) {
        throw new Error("Bluetooth manager is unavailable.");
      }

      const expectedBase64 = encodeAsciiToBase64(expectedBeaconId);
      const attemptedDeviceIds = new Set<string>();

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
                `Couldn't find the room beacon for ${expectedBeaconId}. Move closer and try again.`
              )
            )
          );
        }, BLE_SCAN_TIMEOUT_MS);

        bleManager.startDeviceScan([BLE_SERVICE_UUID], null, async (error, device) => {
          if (settled) {
            return;
          }

          if (error) {
            clearTimeout(timeout);
            finish(() => reject(new Error(error.message)));
            return;
          }

          if (!device?.id || attemptedDeviceIds.has(device.id)) {
            return;
          }

          attemptedDeviceIds.add(device.id);

          try {
            const connectedDevice = await bleManager.connectToDevice(device.id, {
              timeout: 10000,
            });
            const discoveredDevice =
              await connectedDevice.discoverAllServicesAndCharacteristics();
            const beaconCharacteristic =
              await discoveredDevice.readCharacteristicForService(
                BLE_SERVICE_UUID,
                BLE_BEACON_CHAR_UUID
              );

            if (beaconCharacteristic.value === expectedBase64) {
              clearTimeout(timeout);
              finish(() => resolve(discoveredDevice));
              return;
            }

            await discoveredDevice.cancelConnection().catch(() => undefined);
          } catch {
            // Continue scanning until timeout or a matching beacon is found.
          }
        });
      });
    }

    try {
      setReservationActionLoading(true);

      if (isReservationStarted) {
        await completeReservation(ongoingReservation.id, currentUser.uid);
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
  };

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
        <View style={styles.screenTitleRow}>
          <Text style={styles.screenTitleCentered}>{`${firstName}'s Dashboard`}</Text>
          <Pressable
            style={styles.inboxShortcutButton}
            onPress={() => router.push("/(main)/dashboard/inbox")}
          >
            <BellIcon />
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
                {ongoingReservations.map((reservation, index) => (
                  <View
                    key={reservation.id}
                    style={index === ongoingReservations.length - 1 ? null : styles.dashboardGroupItem}
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
                ))}
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
                      styles.listItem,
                      index === pendingReservations.length - 1
                        ? { marginBottom: 0 }
                        : null,
                    ]}
                  >
                    {(() => {
                      const room = roomsById[reservation.roomId];
                      const locationLabel = room?.floor
                        ? `${reservation.buildingName} - ${room.floor}`
                        : reservation.buildingName;

                      return (
                        <>
                          <View style={styles.row}>
                            <Text style={[styles.reservationTitle, { marginTop: 0 }]}>
                              {reservation.roomName}
                            </Text>
                            <StatusChip status="Pending" />
                          </View>
                          <Text style={styles.reservationMeta}>{locationLabel}</Text>
                          <Text style={styles.reservationMeta}>{formatReservationDate(reservation.date)}</Text>
                          <Text style={styles.reservationMeta}>
                            {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
                          </Text>
                          <Text style={styles.reservationMeta}>
                            {reservation.programDepartmentOrganization || "Program / Department / Organization not provided"}
                          </Text>
                          <Text style={styles.reservationPurpose}>{reservation.purpose}</Text>
                          <Text style={[styles.reservationMeta, { color: colors.primary }]}>
                            {getPendingStageLabel(reservation)}
                          </Text>
                        </>
                      );
                    })()}
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
                {upcomingReservations.map((reservation, index) => (
                  <View
                    key={reservation.id}
                    style={index === upcomingReservations.length - 1 ? { marginBottom: 0 } : null}
                  >
                    <ReservationCard
                      reservation={reservation}
                      compactTitle
                      locationLabel={getRoomLocationLabel(reservation)}
                    />
                  </View>
                ))}
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
