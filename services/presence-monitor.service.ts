import AsyncStorage from "@react-native-async-storage/async-storage";
import ReactNativeBackgroundActions from "react-native-background-actions";
import { AppState, type AppStateStatus } from "react-native";
import { BleManager, State } from "react-native-ble-plx";

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
const BLE_RSSI_THRESHOLD = Number(
  process.env.EXPO_PUBLIC_ESP32_BLE_RSSI_THRESHOLD?.trim() ?? "-70"
);
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

type PresenceWarningReason = "bluetooth_off" | "out_of_range";

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
let notificationsConfigured = false;
let hasWarnedAboutNotificationsModule = false;
let hasWarnedAboutNotificationsApiMismatch = false;
let notificationsModulePromise: Promise<typeof import("expo-notifications") | null> | null =
  null;
let latestWarningState: PresenceWarningState | null = null;
let activePresenceCheckPromise: Promise<void> | null = null;
let foregroundMonitorInterval: ReturnType<typeof setInterval> | null = null;

async function loadNotificationsModule() {
  if (!notificationsModulePromise) {
    notificationsModulePromise = import("expo-notifications")
      .then((module) => module)
      .catch((error) => {
        if (!hasWarnedAboutNotificationsModule) {
          hasWarnedAboutNotificationsModule = true;
          console.warn(
            "[presence-monitor] expo-notifications is unavailable in the current native build",
            error
          );
        }

        return null;
      });
  }

  return notificationsModulePromise;
}

function hasNotificationsRuntime(
  Notifications: typeof import("expo-notifications") | null
): Notifications is typeof import("expo-notifications") {
  if (!Notifications) {
    return false;
  }

  const requiredMethods = [
    "setNotificationHandler",
    "setNotificationChannelAsync",
    "getPermissionsAsync",
    "requestPermissionsAsync",
    "scheduleNotificationAsync",
  ] as const;

  const hasRequiredRuntime = requiredMethods.every(
    (methodName) => typeof Notifications[methodName] === "function"
  );

  if (!hasRequiredRuntime && !hasWarnedAboutNotificationsApiMismatch) {
    hasWarnedAboutNotificationsApiMismatch = true;
    console.warn(
      "[presence-monitor] expo-notifications native runtime is incomplete; background warning notifications will be disabled"
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

function isWithinBeaconRange(rssi: number | null | undefined) {
  if (typeof rssi !== "number" || Number.isNaN(rssi)) {
    return false;
  }

  return rssi >= BLE_RSSI_THRESHOLD;
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
  if (notificationsConfigured) {
    return true;
  }

  const Notifications = await loadNotificationsModule();
  if (!hasNotificationsRuntime(Notifications)) {
    return false;
  }

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  await Notifications.setNotificationChannelAsync(
    PRESENCE_NOTIFICATION_CHANNEL_ID,
    {
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: colors.primary,
      name: "Presence monitoring",
      vibrationPattern: [0, 250, 250, 250],
    }
  );

  const permissions = await Notifications.getPermissionsAsync();
  if (!permissions.granted && permissions.canAskAgain) {
    await Notifications.requestPermissionsAsync();
  }

  notificationsConfigured = true;
  return true;
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

  const Notifications = await loadNotificationsModule();
  if (!hasNotificationsRuntime(Notifications)) {
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      body: message,
      sound: "default",
      title: "Reservation signal lost",
    },
    trigger: null,
  });
}

async function scanForBeaconPresence(expectedBeaconId: string) {
  ensureBleConfiguration();

  const expectedBase64 = encodeAsciiToBase64(expectedBeaconId);
  const attemptedDeviceIds = new Set<string>();
  let detectedButTooFar = false;
  let strongestRssi: number | null = null;

  return await new Promise<{ inRange: boolean; rssi: number | null }>((resolve, reject) => {
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
          rssi: strongestRssi,
        })
      );
    }, PRESENCE_SCAN_TIMEOUT_MS);

    bleManager.startDeviceScan([BLE_SERVICE_UUID], null, async (error, device) => {
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

      if (!isWithinBeaconRange(device.rssi)) {
        detectedButTooFar = true;
        return;
      }

      if (attemptedDeviceIds.has(device.id)) {
        return;
      }

      attemptedDeviceIds.add(device.id);

      try {
        const connectedDevice = await bleManager.connectToDevice(device.id, {
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
          clearTimeout(timeout);
          finish(() =>
            resolve({
              inRange: true,
              rssi:
                typeof device.rssi === "number" && !Number.isNaN(device.rssi)
                  ? device.rssi
                  : strongestRssi,
            })
          );
          await discoveredDevice.cancelConnection().catch(() => undefined);
          return;
        }

        await discoveredDevice.cancelConnection().catch(() => undefined);
      } catch {
        if (detectedButTooFar) {
          return;
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
      reason: "out_of_range" as const,
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

  await sendReservationPresenceHeartbeat(session.reservationId, {
    appState: result.appState,
    beaconId: session.beaconId,
    bluetoothOn: result.bluetoothOn,
    checkedAt,
    inRange: result.inRange,
    rssi: result.rssi,
    userId: session.userId,
  }).catch((error) => {
    console.warn("[presence-monitor] unable to send heartbeat", error);
  });
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
  if (ReactNativeBackgroundActions.isRunning()) {
    return;
  }

  await ReactNativeBackgroundActions.start(
    async () => {
      await runPresenceMonitorLoop();
    },
    BACKGROUND_TASK_OPTIONS
  );
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
    if (ReactNativeBackgroundActions.isRunning()) {
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
  if (ReactNativeBackgroundActions.isRunning()) {
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
