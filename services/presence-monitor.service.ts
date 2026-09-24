import AsyncStorage from "@react-native-async-storage/async-storage";
import ReactNativeBackgroundActions from "react-native-background-actions";
import {
  AppState,
  NativeModules,
  PermissionsAndroid,
  Platform,
  type AppStateStatus,
} from "react-native";
import { BleManager, State, type Device } from "react-native-ble-plx";

import { colors } from "@/constants/theme";
import {
  sendReservationPresenceHeartbeat,
  startReservationPresenceMonitor,
  stopReservationPresenceMonitor,
  type ReservationPresenceAppState,
} from "@/services/reservations.service";

const ACTIVE_SESSION_STORAGE_KEY = "iroomreserve.presence-monitor.session";
const BLE_SERVICE_UUID =
  process.env.EXPO_PUBLIC_ESP32_BLE_SERVICE_UUID?.trim() ?? "";
const BLE_BEACON_CHAR_UUID =
  process.env.EXPO_PUBLIC_ESP32_BLE_BEACON_CHARACTERISTIC_UUID?.trim() ?? "";
const parsedRssiThreshold = Number(
  process.env.EXPO_PUBLIC_ESP32_BLE_RSSI_THRESHOLD?.trim()
);
const BLE_RSSI_THRESHOLD = Number.isFinite(parsedRssiThreshold)
  ? parsedRssiThreshold
  : -75;
const REQUIRED_WIFI_SSID =
  process.env.EXPO_PUBLIC_REQUIRED_WIFI_SSID?.trim() ||
  "St Dominic College of Asia";
const HEARTBEAT_INTERVAL_MS = 30_000;
const PRESENCE_SCAN_TIMEOUT_MS = 10_000;
const CONSECUTIVE_BEACON_WARNINGS_REQUIRED = 2;
const KNOWN_DEVICE_FAILURES_BEFORE_RESET = 2;
const PRESENCE_NOTIFICATION_CHANNEL_ID = "presence-monitoring";
const BACKGROUND_TASK_OPTIONS = {
  color: colors.primary,
  linkingURI: "iroomreserve://(main)/dashboard",
  taskDesc: "Monitoring Bluetooth and room beacon proximity.",
  taskIcon: {
    name: "ic_launcher",
    type: "mipmap",
  },
  taskName: "iRoomReservePresenceMonitor",
  taskTitle: "e-RoomReserve monitoring active",
} as const;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

type PresenceWarningReason =
  | "bluetooth_off"
  | "out_of_range"
  | "wifi_disconnected"
  | "beacon_not_detected"
  | "beacon_connection_failed";

interface PresenceMonitorSession {
  beaconId: string;
  consecutiveBeaconWarningCount?: number;
  deviceId?: string;
  consecutiveKnownDeviceFailureCount?: number;
  lastBackgroundWarningReason: PresenceWarningReason | null;
  reservationId: string;
  userId: string;
}

export interface PresenceWarningState {
  message: string;
  reason: PresenceWarningReason;
  reservationId: string;
}

const warningListeners = new Set<(warning: PresenceWarningState | null) => void>();

let currentAppState: AppStateStatus = AppState.currentState;
let hasInitializedRuntime = false;
let hasWarnedAboutNotificationsDisabled = false;
let hasWarnedAboutBackgroundActionsRuntime = false;
let latestWarningState: PresenceWarningState | null = null;
let activePresenceCheckPromise: Promise<void> | null = null;
let foregroundMonitorInterval: ReturnType<typeof setInterval> | null = null;
let bleManager = createBleManager();
let retainedBeaconDevice: Device | null = null;

function createBleManager() {
  return new BleManager({
    restoreStateIdentifier: "iRoomReservePresenceMonitor",
    restoreStateFunction: () => undefined,
  });
}

function hasBackgroundActionsRuntime() {
  const runtime = ReactNativeBackgroundActions as {
    isRunning?: unknown;
    start?: unknown;
    stop?: unknown;
  } | null;

  const hasRequiredRuntime =
    runtime !== null &&
    typeof runtime?.isRunning === "function" &&
    typeof runtime?.start === "function" &&
    typeof runtime?.stop === "function";

  if (!hasRequiredRuntime && !hasWarnedAboutBackgroundActionsRuntime) {
    hasWarnedAboutBackgroundActionsRuntime = true;
    console.warn(
      "[presence-monitor] react-native-background-actions native runtime is unavailable; background monitoring will be disabled"
    );
  }

  return hasRequiredRuntime;
}

function ensureBleConfiguration() {
  if (!BLE_SERVICE_UUID || !BLE_BEACON_CHAR_UUID) {
    throw new Error(
      "Bluetooth presence monitoring is not configured. Set EXPO_PUBLIC_ESP32_BLE_SERVICE_UUID and EXPO_PUBLIC_ESP32_BLE_BEACON_CHARACTERISTIC_UUID."
    );
  }
}

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function logPresenceRetryDebug(message: string, details?: Record<string, unknown>) {
  console.log("[presence-retry]", message, details ?? {});
}

function getBeaconCandidateType(
  device: Pick<Device, "localName" | "name" | "serviceUUIDs">,
  expectedBeaconId: string
) {
  const normalizedExpectedBeaconId = expectedBeaconId.trim().toLowerCase();
  const normalizedServiceUuid = BLE_SERVICE_UUID.trim().toLowerCase();

  const visibleNames = [device.localName, device.name]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));
  const visibleServiceUuids = (device.serviceUUIDs ?? [])
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  if (
    normalizedServiceUuid &&
    visibleServiceUuids.includes(normalizedServiceUuid)
  ) {
    return "service_match" as const;
  }

  if (visibleNames.includes(normalizedExpectedBeaconId)) {
    return "name_match" as const;
  }

  if (visibleNames.length === 0) {
    return "missing_name" as const;
  }

  return "mismatch" as const;
}

async function getCurrentWifiSsid() {
  if (Platform.OS !== "android") {
    return null;
  }

  const wifiInfoModule = NativeModules.WifiInfoModule as
    | {
        getCurrentSsid?: () => Promise<string | null>;
      }
    | undefined;

  if (typeof wifiInfoModule?.getCurrentSsid !== "function") {
    return null;
  }

  return await wifiInfoModule.getCurrentSsid();
}

async function isConnectedToRequiredWifi() {
  const ssid = await getCurrentWifiSsid();
  const normalizedSsid = ssid?.trim() ?? null;
  const matches = normalizedSsid === REQUIRED_WIFI_SSID;

  logPresenceRetryDebug("Wi-Fi SSID check", {
    actualSsid: normalizedSsid,
    expectedSsid: REQUIRED_WIFI_SSID,
    matches,
  });

  return matches;
}

function isBeaconRssiWeak(rssi: number | null) {
  return typeof rssi === "number" && !Number.isNaN(rssi) && rssi <= BLE_RSSI_THRESHOLD;
}

function isBeaconWarningReason(reason: PresenceWarningReason | null) {
  return (
    reason === "out_of_range" ||
    reason === "beacon_not_detected" ||
    reason === "beacon_connection_failed"
  );
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

async function resetBleManager() {
  logPresenceRetryDebug("Resetting BLE manager");
  try {
    bleManager.stopDeviceScan();
  } catch {
    // Best-effort cleanup before rebuilding the BLE runtime.
  }

  try {
    await bleManager.destroy();
  } catch {
    // Some runtimes can already be torn down at this point.
  }

  bleManager = createBleManager();
  logPresenceRetryDebug("BLE manager reset complete");
}

function getExpectedBeaconNameState(
  device: Pick<Device, "localName" | "name" | "serviceUUIDs">,
  expectedBeaconId: string
) {
  const normalizedExpectedBeaconId = expectedBeaconId.trim().toLowerCase();
  if (!normalizedExpectedBeaconId) {
    return "mismatch" as const;
  }

  const normalizedServiceUuid = BLE_SERVICE_UUID.trim().toLowerCase();

  const visibleNames = [device.localName, device.name]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  const visibleServiceUuids = (device.serviceUUIDs ?? [])
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value));

  if (
    normalizedServiceUuid &&
    visibleServiceUuids.includes(normalizedServiceUuid)
  ) {
    return "service_match" as const;
  }

  if (visibleNames.length === 0) {
    return "missing" as const;
  }

  return visibleNames.includes(normalizedExpectedBeaconId)
    ? ("match" as const)
    : ("mismatch" as const);
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

async function disconnectConnectedBeaconDevices() {
  try {
    const connectedDevices = await bleManager.connectedDevices([BLE_SERVICE_UUID]);
    await Promise.all(
      connectedDevices.map((device) => device.cancelConnection().catch(() => undefined))
    );
  } catch {
    // Best-effort cleanup. Some Android BLE stacks report no connected devices
    // even when a stale connection is being torn down.
  }
}

async function readBeaconCharacteristic(device: Device, expectedBase64: string) {
  const discoveredDevice = await device.discoverAllServicesAndCharacteristics();
  const beaconCharacteristic = await discoveredDevice.readCharacteristicForService(
    BLE_SERVICE_UUID,
    BLE_BEACON_CHAR_UUID
  );

  return {
    discoveredDevice,
    matches: beaconCharacteristic.value === expectedBase64,
  };
}

async function tryConnectToKnownBeaconDevice(
  deviceId: string,
  expectedBase64: string
) {
  logPresenceRetryDebug("Trying known beacon device", { deviceId });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let connectedDevice: Device | null = null;

    try {
      logPresenceRetryDebug("Known device attempt started", {
        attempt: attempt + 1,
        deviceId,
      });
      connectedDevice = await bleManager.connectToDevice(deviceId, {
        autoConnect: false,
        timeout: 10_000,
      });

      const { discoveredDevice, matches } = await readBeaconCharacteristic(
        connectedDevice,
        expectedBase64
      );
      const rssi =
        typeof discoveredDevice.rssi === "number" && !Number.isNaN(discoveredDevice.rssi)
          ? discoveredDevice.rssi
          : typeof connectedDevice.rssi === "number" && !Number.isNaN(connectedDevice.rssi)
            ? connectedDevice.rssi
            : null;

      if (matches) {
        logPresenceRetryDebug("Keeping verified beacon connection open", {
          deviceId,
        });
      } else {
        await discoveredDevice.cancelConnection().catch(() => undefined);
      }

      logPresenceRetryDebug("Known device attempt succeeded", {
        attempt: attempt + 1,
        deviceId,
        matches,
        rssi,
      });

      return {
        inRange: matches,
        rssi,
      };
    } catch {
      await connectedDevice?.cancelConnection().catch(() => undefined);
      logPresenceRetryDebug("Known device attempt failed", {
        attempt: attempt + 1,
        deviceId,
      });

      if (attempt < 1) {
        await sleep(500);
      }
    }
  }

  return null;
}

async function readConnectedBeaconPresence(expectedBase64: string) {
  if (retainedBeaconDevice) {
    try {
      const { matches } = await readBeaconCharacteristic(
        retainedBeaconDevice,
        expectedBase64
      );
      if (matches) {
        logPresenceRetryDebug("Reusing retained beacon connection", {
          deviceId: retainedBeaconDevice.id,
        });
        return true;
      }
    } catch {
      // The retained link may have dropped; fall through to a fresh scan.
    }

    const disconnectedDevice = retainedBeaconDevice;
    retainedBeaconDevice = null;
    await disconnectedDevice.cancelConnection().catch(() => undefined);
  }

  try {
    const connectedDevices = await bleManager.connectedDevices([BLE_SERVICE_UUID]);

    for (const device of connectedDevices) {
      try {
        const discoveredDevice =
          await device.discoverAllServicesAndCharacteristics();
        const beaconCharacteristic =
          await discoveredDevice.readCharacteristicForService(
            BLE_SERVICE_UUID,
            BLE_BEACON_CHAR_UUID
          );

        if (beaconCharacteristic.value === expectedBase64) {
          return true;
        }
      } catch {
        await device.cancelConnection().catch(() => undefined);
      }
    }
  } catch {
    return false;
  }

  return false;
}

async function releaseRetainedBeaconDevice() {
  const device = retainedBeaconDevice;
  retainedBeaconDevice = null;
  await device?.cancelConnection().catch(() => undefined);
}

function getNormalizedAppState(): ReservationPresenceAppState {
  return currentAppState === "active" ? "foreground" : "background";
}

function buildWarningState(
  reason: PresenceWarningReason,
  reservationId: string
): PresenceWarningState {
  return {
    message:
      reason === "bluetooth_off"
        ? "Turn on Bluetooth to keep this reservation active."
        : reason === "wifi_disconnected"
          ? `Connect to "${REQUIRED_WIFI_SSID}".`
        : reason === "beacon_connection_failed"
          ? "We found the room beacon, but couldn't reconnect to it yet. Keep Bluetooth on and retry in a moment."
        : reason === "beacon_not_detected"
          ? "We couldn't detect this room's beacon yet. Move closer to the room and try again."
          : "Move closer to the room to keep this reservation active.",
    reason,
    reservationId,
  };
}

function getBackgroundNotificationContent(
  reason: PresenceWarningReason | null
): { taskDesc: string; taskTitle: string } {
  if (reason === null) {
    return {
      taskDesc: BACKGROUND_TASK_OPTIONS.taskDesc,
      taskTitle: BACKGROUND_TASK_OPTIONS.taskTitle,
    };
  }

  return {
    taskDesc:
      reason === "bluetooth_off"
        ? "Turn bluetooth back on"
        : reason === "wifi_disconnected"
          ? "Connect to St Dominic College of Asia"
        : "Room is out of range",
    taskTitle: "e-RoomReserve: Warning",
  };
}

async function updateBackgroundNotification(reason: PresenceWarningReason | null) {
  if (!hasBackgroundActionsRuntime()) {
    return;
  }

  if (!ReactNativeBackgroundActions.isRunning()) {
    return;
  }

  await ReactNativeBackgroundActions.updateNotification(
    getBackgroundNotificationContent(reason)
  ).catch((error) => {
    console.warn("[presence-monitor] unable to update background notification", error);
  });
}

function emitWarning(warning: PresenceWarningState | null) {
  latestWarningState = warning;
  warningListeners.forEach((listener) => listener(warning));
}

async function loadActiveSession() {
  const rawValue = await AsyncStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as PresenceMonitorSession;
  } catch {
    await AsyncStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
    return null;
  }
}

async function saveActiveSession(session: PresenceMonitorSession) {
  await AsyncStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, JSON.stringify(session));
}

async function clearActiveSession() {
  await AsyncStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
}

async function ensureNotificationsConfigured() {
  if (!hasWarnedAboutNotificationsDisabled) {
    hasWarnedAboutNotificationsDisabled = true;
    console.warn(
      "[presence-monitor] background warning notifications are disabled in this build"
    );
  }

  return false;
}

function initializePresenceMonitorRuntime() {
  if (hasInitializedRuntime) {
    return;
  }

  AppState.addEventListener("change", (nextState) => {
    const previousState = currentAppState;
    currentAppState = nextState;

    if (nextState === "active" && previousState !== "active") {
      void syncCurrentWarningState().catch((error) => {
        console.warn("[presence-monitor] unable to refresh warning state", error);
      });
      ensureForegroundMonitorRunning();
      return;
    }

    if (nextState !== "active" && previousState === "active") {
      stopForegroundMonitor();
      void ensureBackgroundMonitorRunning().catch((error) => {
        console.warn("[presence-monitor] unable to start background monitor", error);
      });
    }
  });

  hasInitializedRuntime = true;
}

function stopForegroundMonitor() {
  if (foregroundMonitorInterval) {
    clearInterval(foregroundMonitorInterval);
    foregroundMonitorInterval = null;
  }
}

function ensureForegroundMonitorRunning() {
  if (currentAppState !== "active" || foregroundMonitorInterval) {
    return;
  }

  foregroundMonitorInterval = setInterval(() => {
    void syncCurrentWarningState().catch((error) => {
      console.warn("[presence-monitor] foreground presence check failed", error);
    });
  }, HEARTBEAT_INTERVAL_MS);
}

async function scheduleBackgroundWarningNotification(message: string) {
  const isNotificationsConfigured = await ensureNotificationsConfigured();
  if (!isNotificationsConfigured) {
    return;
  }
}

async function scanForBeaconPresenceOnce(expectedBeaconId: string) {
  ensureBleConfiguration();

  const expectedBase64 = encodeAsciiToBase64(expectedBeaconId);
  const existingConnectionMatches = await readConnectedBeaconPresence(expectedBase64);

  if (existingConnectionMatches) {
    return {
      inRange: true,
      reason: "out_of_range" as const,
      rssi: null,
    };
  }

  bleManager.stopDeviceScan();
  await disconnectConnectedBeaconDevices();

  const attemptedDeviceIds = new Set<string>();
  const pendingCandidates = new Map<string, Device>();
  let isProcessingCandidate = false;
  let hasStartedCandidateProcessing = false;
  let foundExpectedBeaconAdvertisement = false;
  let foundExpectedBeaconButReadFailed = false;
  let strongestRssi: number | null = null;
  let scanTimedOut = false;

  return await new Promise<{
    inRange: boolean;
    rssi: number | null;
    reason: "out_of_range" | "beacon_not_detected" | "beacon_connection_failed";
  }>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      bleManager.stopDeviceScan();
      callback();
    };
    const completeScan = () =>
      finish(() =>
        resolve({
          inRange: false,
          reason: foundExpectedBeaconButReadFailed
            ? "beacon_connection_failed"
            : foundExpectedBeaconAdvertisement
              ? "out_of_range"
              : "beacon_not_detected",
          rssi: strongestRssi,
        })
      );

    const processNextCandidate = async () => {
      if (settled || isProcessingCandidate || pendingCandidates.size === 0) {
        return;
      }

      isProcessingCandidate = true;
      if (!hasStartedCandidateProcessing) {
        hasStartedCandidateProcessing = true;
        await sleep(250);
      }
      if (settled || pendingCandidates.size === 0) {
        isProcessingCandidate = false;
        if (scanTimedOut) {
          completeScan();
        }
        return;
      }

      const candidate = [...pendingCandidates.values()].sort((left, right) => {
        const leftState = getExpectedBeaconNameState(left, expectedBeaconId);
        const rightState = getExpectedBeaconNameState(right, expectedBeaconId);
        const statePriority = (state: typeof leftState) =>
          state === "match" || state === "service_match" ? 1 : 0;
        const priorityDifference = statePriority(rightState) - statePriority(leftState);
        if (priorityDifference !== 0) {
          return priorityDifference;
        }

        return (right.rssi ?? -Infinity) - (left.rssi ?? -Infinity);
      })[0];
      const deviceId = candidate.id;
      pendingCandidates.delete(deviceId);
      const beaconNameState = getExpectedBeaconNameState(candidate, expectedBeaconId);
      const candidateType = getBeaconCandidateType(candidate, expectedBeaconId);
      let connectedDevice: Device | null = null;
      let keepConnectionOpen = false;
      let failureStage = "connect";

      try {
        connectedDevice = await bleManager.connectToDevice(candidate.id, {
          autoConnect: false,
          timeout: 5_000,
        });
        failureStage = "service_discovery";
        const discoveredDevice =
          await connectedDevice.discoverAllServicesAndCharacteristics();
        failureStage = "beacon_characteristic_read";
        const beaconCharacteristic =
          await discoveredDevice.readCharacteristicForService(
            BLE_SERVICE_UUID,
            BLE_BEACON_CHAR_UUID
          );

        if (beaconCharacteristic.value === expectedBase64) {
          foundExpectedBeaconAdvertisement = true;
          keepConnectionOpen = true;
          logPresenceRetryDebug("Keeping verified beacon connection open", {
            deviceId: candidate.id,
            expectedBeaconId,
          });
          clearTimeout(timeout);
          finish(() =>
            resolve({
              inRange: true,
              reason: "out_of_range",
              rssi:
                typeof candidate.rssi === "number" && !Number.isNaN(candidate.rssi)
                  ? candidate.rssi
                  : strongestRssi,
            })
          );
          return;
        }

        logPresenceRetryDebug("Candidate read succeeded but beacon value mismatched", {
          candidateType,
          deviceId: candidate.id,
          expectedBeaconId,
          readValue: beaconCharacteristic.value ?? null,
          rssi: typeof candidate.rssi === "number" ? candidate.rssi : strongestRssi,
        });
      } catch (error) {
        if (beaconNameState === "match" || beaconNameState === "service_match") {
          foundExpectedBeaconButReadFailed = true;
        }
        logPresenceRetryDebug("Candidate connect/read failed in scan fallback", {
          candidateType,
          deviceId: candidate.id,
          expectedBeaconId,
          failureStage,
          errorCode:
            typeof error === "object" && error !== null && "errorCode" in error
              ? error.errorCode
              : null,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        if (!keepConnectionOpen) {
          await connectedDevice?.cancelConnection().catch(() => undefined);
        }
        isProcessingCandidate = false;
        if (scanTimedOut) {
          completeScan();
        } else {
          void processNextCandidate();
        }
      }
    };

    const timeout = setTimeout(() => {
      scanTimedOut = true;
      pendingCandidates.clear();
      bleManager.stopDeviceScan();
      if (!isProcessingCandidate) {
        completeScan();
      }
    }, PRESENCE_SCAN_TIMEOUT_MS);

    bleManager.startDeviceScan(null, null, async (error, device) => {
      if (settled || scanTimedOut) {
        return;
      }

      if (error) {
        clearTimeout(timeout);
        finish(() => reject(new Error(error.message)));
        return;
      }

      if (!device?.id) {
        return;
      }

      if (typeof device.rssi === "number") {
        strongestRssi =
          strongestRssi === null
            ? device.rssi
            : Math.max(strongestRssi, device.rssi);
      }

      const beaconNameState = getExpectedBeaconNameState(device, expectedBeaconId);
      const candidateType = getBeaconCandidateType(device, expectedBeaconId);
      logPresenceRetryDebug("Scan discovered candidate", {
        candidateType,
        deviceId: device.id,
        localName: device.localName ?? null,
        name: device.name ?? null,
        rssi: device.rssi ?? null,
        serviceUUIDs: device.serviceUUIDs ?? [],
      });

      if (beaconNameState === "mismatch") {
        logPresenceRetryDebug("Candidate rejected before connect", {
          candidateType,
          deviceId: device.id,
          expectedBeaconId,
        });
        return;
      }

      if (
        beaconNameState === "match" ||
        beaconNameState === "service_match"
      ) {
        foundExpectedBeaconAdvertisement = true;
      }

      if (attemptedDeviceIds.has(device.id)) {
        const queuedCandidate = pendingCandidates.get(device.id);
        if (
          queuedCandidate &&
          typeof device.rssi === "number" &&
          (typeof queuedCandidate.rssi !== "number" || device.rssi > queuedCandidate.rssi)
        ) {
          pendingCandidates.set(device.id, device);
        }
        return;
      }

      attemptedDeviceIds.add(device.id);
      pendingCandidates.set(device.id, device);
      void processNextCandidate();
    });
  });
}

async function scanForBeaconPresence(expectedBeaconId: string) {
  logPresenceRetryDebug("Scanning for beacon presence", { expectedBeaconId });
  let lastResult:
    | {
        inRange: boolean;
        rssi: number | null;
        reason: "out_of_range" | "beacon_not_detected" | "beacon_connection_failed";
      }
    | null = null;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const result = await scanForBeaconPresenceOnce(expectedBeaconId);
      logPresenceRetryDebug("Beacon scan attempt result", {
        attempt: attempt + 1,
        expectedBeaconId,
        inRange: result.inRange,
        reason: result.reason,
        rssi: result.rssi,
      });
      lastResult = result;

      if (result.inRange || result.reason !== "beacon_not_detected" || attempt === 1) {
        return result;
      }
    } catch (error) {
      logPresenceRetryDebug("Beacon scan attempt threw", {
        attempt: attempt + 1,
        expectedBeaconId,
        message: error instanceof Error ? error.message : String(error),
      });
      if (attempt === 1) {
        throw error;
      }
    }

    await resetBleManager();
    await sleep(750);
  }

  return (
    lastResult ?? {
      inRange: false,
      reason: "beacon_not_detected" as const,
      rssi: null,
    }
  );
}

async function performPresenceCheck(session: PresenceMonitorSession) {
  logPresenceRetryDebug("Performing presence check", {
    reservationId: session.reservationId,
    beaconId: session.beaconId,
    deviceId: session.deviceId ?? null,
    consecutiveBeaconWarningCount: session.consecutiveBeaconWarningCount ?? 0,
  });
  const appState = getNormalizedAppState();
  const bluetoothState = await bleManager.state();
  const bluetoothOn = bluetoothState === State.PoweredOn;

  if (!bluetoothOn) {
    logPresenceRetryDebug("Presence check failed because bluetooth is off", {
      reservationId: session.reservationId,
    });
    return {
      appState,
      bluetoothOn,
      inRange: false,
      reason: "bluetooth_off" as const,
      rssi: null,
    };
  }

  const existingConnectionMatches = await readConnectedBeaconPresence(
    encodeAsciiToBase64(session.beaconId)
  );
  if (existingConnectionMatches) {
    const wifiConnected = await isConnectedToRequiredWifi();
    return {
      appState,
      bluetoothOn,
      inRange: true,
      reason: wifiConnected ? null : ("wifi_disconnected" as const),
      rssi: null,
    };
  }

  if (session.deviceId) {
    const knownDevicePresence = await tryConnectToKnownBeaconDevice(
      session.deviceId,
      encodeAsciiToBase64(session.beaconId)
    );

    if (knownDevicePresence?.inRange) {
      logPresenceRetryDebug("Known device presence matched", {
        reservationId: session.reservationId,
        rssi: knownDevicePresence.rssi,
      });
      if (isBeaconRssiWeak(knownDevicePresence.rssi)) {
        return {
          appState,
          bluetoothOn,
          inRange: false,
          reason: "out_of_range" as const,
          rssi: knownDevicePresence.rssi,
        };
      }

      const wifiConnected = await isConnectedToRequiredWifi();
      if (!wifiConnected) {
        return {
          appState,
          bluetoothOn,
          inRange: true,
          reason: "wifi_disconnected" as const,
          rssi: knownDevicePresence.rssi,
        };
      }

      return {
        appState,
        bluetoothOn,
        inRange: true,
        reason: null,
        rssi: knownDevicePresence.rssi,
      };
    }
  }

  const presence = await scanForBeaconPresence(session.beaconId);
  logPresenceRetryDebug("Scan-based presence result", {
    reservationId: session.reservationId,
    inRange: presence.inRange,
    reason: presence.reason,
    rssi: presence.rssi,
  });

  if (!presence.inRange) {
    return {
      appState,
      bluetoothOn,
      inRange: false,
      reason: presence.reason,
      rssi: presence.rssi,
    };
  }

  if (isBeaconRssiWeak(presence.rssi)) {
    return {
      appState,
      bluetoothOn,
      inRange: false,
      reason: "out_of_range" as const,
      rssi: presence.rssi,
    };
  }

  const wifiConnected = await isConnectedToRequiredWifi();
  if (!wifiConnected) {
    return {
      appState,
      bluetoothOn,
      inRange: true,
      reason: "wifi_disconnected" as const,
      rssi: presence.rssi,
    };
  }

  return {
    appState,
    bluetoothOn,
    inRange: true,
    reason: null,
    rssi: presence.rssi,
  };
}

async function processPresenceCheck(session: PresenceMonitorSession) {
  const result = await performPresenceCheck(session);
  const knownDeviceFailed =
    Boolean(session.deviceId) &&
    isBeaconWarningReason(result.reason);
  const nextConsecutiveKnownDeviceFailureCount = knownDeviceFailed
    ? (session.consecutiveKnownDeviceFailureCount ?? 0) + 1
    : 0;
  const shouldClearStoredDeviceId =
    Boolean(session.deviceId) &&
    nextConsecutiveKnownDeviceFailureCount >= KNOWN_DEVICE_FAILURES_BEFORE_RESET;
  const nextConsecutiveBeaconWarningCount = isBeaconWarningReason(result.reason)
    ? (session.consecutiveBeaconWarningCount ?? 0) + 1
    : 0;
  const shouldSuppressTransientBeaconWarning =
    isBeaconWarningReason(result.reason) &&
    nextConsecutiveBeaconWarningCount < CONSECUTIVE_BEACON_WARNINGS_REQUIRED;
  const effectiveResult = shouldSuppressTransientBeaconWarning
    ? {
        ...result,
        inRange: true,
        reason: null,
      }
    : result;
  logPresenceRetryDebug("Processed presence check", {
    reservationId: session.reservationId,
    rawReason: result.reason,
    effectiveReason: effectiveResult.reason,
    inRange: effectiveResult.inRange,
    rssi: effectiveResult.rssi,
    consecutiveBeaconWarningCount: nextConsecutiveBeaconWarningCount,
    suppressedTransientBeaconWarning: shouldSuppressTransientBeaconWarning,
  });
  const checkedAt = new Date().toISOString();

  if (shouldClearStoredDeviceId) {
    logPresenceRetryDebug("Clearing stale known beacon device id", {
      deviceId: session.deviceId ?? null,
      reservationId: session.reservationId,
      consecutiveKnownDeviceFailureCount: nextConsecutiveKnownDeviceFailureCount,
    });
  }

  if (session.consecutiveBeaconWarningCount !== nextConsecutiveBeaconWarningCount) {
    await saveActiveSession({
      ...session,
      consecutiveBeaconWarningCount: nextConsecutiveBeaconWarningCount,
      consecutiveKnownDeviceFailureCount: nextConsecutiveKnownDeviceFailureCount,
      deviceId: shouldClearStoredDeviceId ? undefined : session.deviceId,
    });
  } else if (
    session.consecutiveKnownDeviceFailureCount !==
      nextConsecutiveKnownDeviceFailureCount ||
    shouldClearStoredDeviceId
  ) {
    await saveActiveSession({
      ...session,
      consecutiveKnownDeviceFailureCount: nextConsecutiveKnownDeviceFailureCount,
      deviceId: shouldClearStoredDeviceId ? undefined : session.deviceId,
    });
  }

  if (effectiveResult.reason) {
    const warning = buildWarningState(effectiveResult.reason, session.reservationId);

    if (effectiveResult.appState === "foreground") {
      emitWarning(warning);
      if (session.lastBackgroundWarningReason !== null) {
        await saveActiveSession({
          ...session,
          consecutiveBeaconWarningCount: nextConsecutiveBeaconWarningCount,
          lastBackgroundWarningReason: null,
        });
      }
    } else if (session.lastBackgroundWarningReason !== effectiveResult.reason) {
      await scheduleBackgroundWarningNotification(warning.message);
      await updateBackgroundNotification(effectiveResult.reason);
      await saveActiveSession({
        ...session,
        consecutiveBeaconWarningCount: nextConsecutiveBeaconWarningCount,
        lastBackgroundWarningReason: effectiveResult.reason,
      });
    }
  } else {
    emitWarning(null);
    if (effectiveResult.appState === "background") {
      await updateBackgroundNotification(null);
    }
    if (session.lastBackgroundWarningReason !== null) {
      await saveActiveSession({
        ...session,
        consecutiveBeaconWarningCount: nextConsecutiveBeaconWarningCount,
        lastBackgroundWarningReason: null,
      });
    }
  }

  const heartbeatResult = await sendReservationPresenceHeartbeat(session.reservationId, {
    appState: effectiveResult.appState,
    beaconId: session.beaconId,
    bluetoothOn: effectiveResult.bluetoothOn,
    checkedAt,
    inRange: effectiveResult.inRange,
    rssi: effectiveResult.rssi,
    userId: session.userId,
  }).catch((error) => {
    console.warn("[presence-monitor] unable to send heartbeat", error);
    return null;
  });
  logPresenceRetryDebug("Heartbeat result", {
    reservationId: session.reservationId,
    heartbeatResult,
  });

  if (heartbeatResult?.status === "stopped") {
    await syncPresenceMonitoringSession(null);
  }
}

async function processPresenceCheckSafely(session: PresenceMonitorSession) {
  if (activePresenceCheckPromise) {
    return activePresenceCheckPromise;
  }

  const nextPresenceCheckPromise = (async () => {
    await processPresenceCheck(session);
  })();

  activePresenceCheckPromise = nextPresenceCheckPromise;

  try {
    await nextPresenceCheckPromise;
  } finally {
    if (activePresenceCheckPromise === nextPresenceCheckPromise) {
      activePresenceCheckPromise = null;
    }
  }
}

async function syncCurrentWarningState() {
  const session = await loadActiveSession();
  if (!session) {
    emitWarning(null);
    return;
  }

  await processPresenceCheckSafely(session);
}

async function runPresenceMonitorLoop() {
  initializePresenceMonitorRuntime();

  if (!hasBackgroundActionsRuntime()) {
    return;
  }

  while (ReactNativeBackgroundActions.isRunning()) {
    const iterationStartedAt = Date.now();
    const session = await loadActiveSession();

    if (!session) {
      emitWarning(null);
      break;
    }

    try {
      await processPresenceCheckSafely(session);
    } catch (error) {
      console.warn("[presence-monitor] presence check failed", error);
    }

    const elapsedMs = Date.now() - iterationStartedAt;
    await sleep(Math.max(0, HEARTBEAT_INTERVAL_MS - elapsedMs));
  }
}

async function ensureBackgroundMonitorRunning() {
  if (!hasBackgroundActionsRuntime()) {
    return;
  }

  if (currentAppState === "active") {
    return;
  }

  if (ReactNativeBackgroundActions.isRunning()) {
    return;
  }

  try {
    await ReactNativeBackgroundActions.start(
      async () => {
        await runPresenceMonitorLoop();
      },
      BACKGROUND_TASK_OPTIONS
    );
  } catch (error) {
    console.warn("[presence-monitor] unable to start background actions", error);
  }
}

function isBluetoothUnauthorizedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes("not authorized to use bluetooth")
  );
}

export async function activatePresenceMonitoring(input: {
  beaconId: string;
  connectedDevice?: Device;
  deviceId?: string;
  reservationId: string;
  userId: string;
}) {
  initializePresenceMonitorRuntime();
  if (input.connectedDevice) {
    retainedBeaconDevice = input.connectedDevice;
  }
  await ensureNotificationsConfigured();

  await startReservationPresenceMonitor(
    input.reservationId,
    input.userId,
    input.beaconId
  );

  await saveActiveSession({
    beaconId: input.beaconId.trim(),
    consecutiveBeaconWarningCount: 0,
    consecutiveKnownDeviceFailureCount: 0,
    deviceId: input.deviceId?.trim() || undefined,
    lastBackgroundWarningReason: null,
    reservationId: input.reservationId,
    userId: input.userId,
  });

  ensureForegroundMonitorRunning();
  await syncCurrentWarningState();
  await ensureBackgroundMonitorRunning();
}

export async function syncPresenceMonitoringSession(
  input:
    | {
        beaconId: string;
        deviceId?: string;
        reservationId: string;
        userId: string;
      }
    | null
) {
  initializePresenceMonitorRuntime();

  if (!input) {
    emitWarning(null);
    await releaseRetainedBeaconDevice();
    await clearActiveSession();
    stopForegroundMonitor();
    if (hasBackgroundActionsRuntime() && ReactNativeBackgroundActions.isRunning()) {
      await ReactNativeBackgroundActions.stop();
    }
    return;
  }

  const existingSession = await loadActiveSession();
  if (
    existingSession?.reservationId !== input.reservationId ||
    existingSession.beaconId !== input.beaconId
  ) {
    await saveActiveSession({
      beaconId: input.beaconId.trim(),
      consecutiveBeaconWarningCount: 0,
      consecutiveKnownDeviceFailureCount: 0,
      deviceId: input.deviceId?.trim() || existingSession?.deviceId || undefined,
      lastBackgroundWarningReason: null,
      reservationId: input.reservationId,
      userId: input.userId,
    });
  }

  await startReservationPresenceMonitor(
    input.reservationId,
    input.userId,
    input.beaconId
  ).catch((error) => {
    console.warn("[presence-monitor] unable to re-register server monitor", error);
  });
  ensureForegroundMonitorRunning();
  await syncCurrentWarningState();
  await ensureBackgroundMonitorRunning();
}

export async function deactivatePresenceMonitoring() {
  const session = await loadActiveSession();

  emitWarning(null);
  await releaseRetainedBeaconDevice();
  await clearActiveSession();
  stopForegroundMonitor();
  if (hasBackgroundActionsRuntime() && ReactNativeBackgroundActions.isRunning()) {
    await ReactNativeBackgroundActions.stop();
  }

  if (session) {
    await stopReservationPresenceMonitor(session.reservationId, session.userId).catch(
      (error) => {
        console.warn("[presence-monitor] unable to stop server monitor", error);
      }
    );
  }
}

export async function stopLocalPresenceMonitoring() {
  emitWarning(null);
  stopForegroundMonitor();

  if (hasBackgroundActionsRuntime() && ReactNativeBackgroundActions.isRunning()) {
    await ReactNativeBackgroundActions.stop();
  }

  if (activePresenceCheckPromise) {
    await activePresenceCheckPromise.catch(() => undefined);
  }

  await releaseRetainedBeaconDevice();
  await clearActiveSession();
  emitWarning(null);
}

export async function retryPresenceMonitoringCheck() {
  initializePresenceMonitorRuntime();
  logPresenceRetryDebug("Manual retry requested");
  const permissionGranted = await requestBluetoothPermissions();
  logPresenceRetryDebug("Manual retry permission result", { permissionGranted });
  if (!permissionGranted) {
    throw new Error("Bluetooth permission is required to retry the room connection.");
  }

  if (activePresenceCheckPromise) {
    logPresenceRetryDebug("Waiting for active presence check before manual retry");
    await activePresenceCheckPromise.catch(() => undefined);
  }

  await resetBleManager();

  try {
    await syncCurrentWarningState();
    logPresenceRetryDebug("Manual retry completed on first attempt");
  } catch (error) {
    logPresenceRetryDebug("Manual retry first attempt failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    if (!isBluetoothUnauthorizedError(error)) {
      throw error;
    }

    await resetBleManager();
    await syncCurrentWarningState();
    logPresenceRetryDebug("Manual retry completed after BLE authorization recovery");
  }
}

export function subscribeToPresenceWarnings(
  listener: (warning: PresenceWarningState | null) => void
) {
  initializePresenceMonitorRuntime();
  warningListeners.add(listener);
  listener(latestWarningState);

  return () => {
    warningListeners.delete(listener);
  };
}
