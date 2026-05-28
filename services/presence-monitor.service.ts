import AsyncStorage from "@react-native-async-storage/async-storage";
import ReactNativeBackgroundActions from "react-native-background-actions";
import { AppState, type AppStateStatus } from "react-native";
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
  | "beacon_not_detected"
  | "beacon_connection_failed";

interface PresenceMonitorSession {
  beaconId: string;
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
const bleManager = new BleManager({
  restoreStateIdentifier: "iRoomReservePresenceMonitor",
  restoreStateFunction: () => undefined,
});

let currentAppState: AppStateStatus = AppState.currentState;
let hasInitializedRuntime = false;
let hasWarnedAboutNotificationsDisabled = false;
let hasWarnedAboutBackgroundActionsRuntime = false;
let latestWarningState: PresenceWarningState | null = null;
let activePresenceCheckPromise: Promise<void> | null = null;
let foregroundMonitorInterval: ReturnType<typeof setInterval> | null = null;

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
        : reason === "beacon_connection_failed"
          ? "We found the room beacon, but couldn't reconnect to it yet. Keep Bluetooth on and retry in a moment."
        : reason === "beacon_not_detected"
          ? "We couldn't detect this room's beacon yet. Move closer to the room and try again."
          : "Move closer to the room to keep this reservation active.",
    reason,
    reservationId,
  };
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

async function scanForBeaconPresence(expectedBeaconId: string) {
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

      if (beaconNameState === "match") {
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
        if (beaconNameState === "match") {
          foundExpectedBeaconButReadFailed = true;
        }
      }
    });
  });
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
      await saveActiveSession({
        ...session,
        lastBackgroundWarningReason: result.reason,
      });
    }
  } else {
    emitWarning(null);
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

export async function activatePresenceMonitoring(input: {
  beaconId: string;
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

export async function retryPresenceMonitoringCheck() {
  initializePresenceMonitorRuntime();
  await syncCurrentWarningState();
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
