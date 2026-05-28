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
  taskTitle: "iRoomReserve monitoring active",
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
  deviceId?: string;
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
  return ssid?.trim() === REQUIRED_WIFI_SSID;
}

function isBeaconRssiWeak(rssi: number | null) {
  return typeof rssi === "number" && !Number.isNaN(rssi) && rssi <= BLE_RSSI_THRESHOLD;
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
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let connectedDevice: Device | null = null;

    try {
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

      await discoveredDevice.cancelConnection().catch(() => undefined);

      return {
        inRange: matches,
        rssi,
      };
    } catch {
      await connectedDevice?.cancelConnection().catch(() => undefined);

      if (attempt < 2) {
        await sleep(500);
      }
    }
  }

  return null;
}

async function readConnectedBeaconPresence(expectedBase64: string) {
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
    taskTitle: "iRoomReserve: Warning",
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
  let foundExpectedBeaconAdvertisement = false;
  let foundExpectedBeaconButReadFailed = false;
  let strongestRssi: number | null = null;

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

    const timeout = setTimeout(() => {
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
    }, PRESENCE_SCAN_TIMEOUT_MS);

    bleManager.startDeviceScan(null, null, async (error, device) => {
      if (settled) {
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

      if (beaconNameState === "mismatch") {
        return;
      }

      if (
        beaconNameState === "match" ||
        beaconNameState === "service_match"
      ) {
        foundExpectedBeaconAdvertisement = true;
      }

      if (attemptedDeviceIds.has(device.id)) {
        return;
      }

      attemptedDeviceIds.add(device.id);

      let connectedDevice: Device | null = null;

      try {
        connectedDevice = await bleManager.connectToDevice(device.id, {
          autoConnect: false,
          timeout: 10_000,
        });
        const discoveredDevice =
          await connectedDevice.discoverAllServicesAndCharacteristics();
        const beaconCharacteristic =
          await discoveredDevice.readCharacteristicForService(
            BLE_SERVICE_UUID,
            BLE_BEACON_CHAR_UUID
          );

        if (beaconCharacteristic.value === expectedBase64) {
          foundExpectedBeaconAdvertisement = true;
          clearTimeout(timeout);
          finish(() =>
            resolve({
              inRange: true,
              reason: "out_of_range",
              rssi:
                typeof device.rssi === "number" && !Number.isNaN(device.rssi)
                  ? device.rssi
                  : strongestRssi,
            })
          );
          await connectedDevice.cancelConnection().catch(() => undefined);
          return;
        }

        await connectedDevice.cancelConnection().catch(() => undefined);
      } catch {
        await connectedDevice?.cancelConnection().catch(() => undefined);
        if (
          beaconNameState === "match" ||
          beaconNameState === "service_match"
        ) {
          foundExpectedBeaconButReadFailed = true;
        }
      }
    });
  });
}

async function scanForBeaconPresence(expectedBeaconId: string) {
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
      lastResult = result;

      if (result.inRange || result.reason !== "beacon_not_detected" || attempt === 1) {
        return result;
      }
    } catch (error) {
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
  const appState = getNormalizedAppState();
  const bluetoothState = await bleManager.state();
  const bluetoothOn = bluetoothState === State.PoweredOn;

  if (!bluetoothOn) {
    return {
      appState,
      bluetoothOn,
      inRange: false,
      reason: "bluetooth_off" as const,
      rssi: null,
    };
  }

  if (session.deviceId) {
    const knownDevicePresence = await tryConnectToKnownBeaconDevice(
      session.deviceId,
      encodeAsciiToBase64(session.beaconId)
    );

    if (knownDevicePresence?.inRange) {
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
  const checkedAt = new Date().toISOString();

  if (result.reason) {
    const warning = buildWarningState(result.reason, session.reservationId);

    if (result.appState === "foreground") {
      emitWarning(warning);
      if (session.lastBackgroundWarningReason !== null) {
        await saveActiveSession({
          ...session,
          lastBackgroundWarningReason: null,
        });
      }
    } else if (session.lastBackgroundWarningReason !== result.reason) {
      await scheduleBackgroundWarningNotification(warning.message);
      await updateBackgroundNotification(result.reason);
      await saveActiveSession({
        ...session,
        lastBackgroundWarningReason: result.reason,
      });
    }
  } else {
    emitWarning(null);
    if (result.appState === "background") {
      await updateBackgroundNotification(null);
    }
    if (session.lastBackgroundWarningReason !== null) {
      await saveActiveSession({
        ...session,
        lastBackgroundWarningReason: null,
      });
    }
  }

  const heartbeatResult = await sendReservationPresenceHeartbeat(session.reservationId, {
    appState: result.appState,
    beaconId: session.beaconId,
    bluetoothOn: result.bluetoothOn,
    checkedAt,
    inRange: result.inRange,
    rssi: result.rssi,
    userId: session.userId,
  }).catch((error) => {
    console.warn("[presence-monitor] unable to send heartbeat", error);
    return null;
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
  deviceId?: string;
  reservationId: string;
  userId: string;
}) {
  initializePresenceMonitorRuntime();
  await ensureNotificationsConfigured();

  await startReservationPresenceMonitor(
    input.reservationId,
    input.userId,
    input.beaconId
  );

  await saveActiveSession({
    beaconId: input.beaconId.trim(),
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
  await clearActiveSession();
  stopForegroundMonitor();

  if (hasBackgroundActionsRuntime() && ReactNativeBackgroundActions.isRunning()) {
    await ReactNativeBackgroundActions.stop();
  }
}

export async function retryPresenceMonitoringCheck() {
  initializePresenceMonitorRuntime();
  const permissionGranted = await requestBluetoothPermissions();
  if (!permissionGranted) {
    throw new Error("Bluetooth permission is required to retry the room connection.");
  }

  await resetBleManager();

  try {
    await syncCurrentWarningState();
  } catch (error) {
    if (!isBluetoothUnauthorizedError(error)) {
      throw error;
    }

    await resetBleManager();
    await syncCurrentWarningState();
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
