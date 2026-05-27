import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import React from "react";
import { Platform } from "react-native";

import { saveExpoPushToken } from "@/lib/auth";
import { auth } from "@/lib/firebase";

const RESERVATION_UPDATES_CHANNEL_ID = "reservation-updates";
const INBOX_ROUTE = "/(main)/dashboard/inbox";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getProjectId() {
  return (
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    null
  );
}

async function ensureNotificationChannel() {
  if (Platform.OS !== "android") {
    return;
  }

  await Notifications.setNotificationChannelAsync(RESERVATION_UPDATES_CHANNEL_ID, {
    name: "Reservation updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: "#a12124",
  });
}

function routeFromNotificationData(data: Record<string, unknown> | undefined) {
  const candidateRoute = typeof data?.route === "string" ? data.route.trim() : "";
  return candidateRoute || INBOX_ROUTE;
}

async function registerForPushNotificationsAsync() {
  await ensureNotificationChannel();

  const existingPermissions = await Notifications.getPermissionsAsync();
  let currentStatus = existingPermissions.status;

  if (currentStatus !== "granted") {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    currentStatus = requestedPermissions.status;
  }

  if (currentStatus !== "granted") {
    return null;
  }

  const projectId = getProjectId();
  if (!projectId) {
    console.warn("[push-notifications] missing Expo project id");
    return null;
  }

  const pushTokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  return pushTokenResponse.data;
}

export function PushNotificationProvider({
  children,
}: React.PropsWithChildren) {
  React.useEffect(() => {
    let active = true;

    const registerCurrentUser = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return;
      }

      try {
        const pushToken = await registerForPushNotificationsAsync();
        if (!active || !pushToken) {
          return;
        }

        await saveExpoPushToken(currentUser.uid, pushToken);
      } catch (error) {
        console.warn("[push-notifications] unable to register push token", error);
      }
    };

    void registerCurrentUser();
    const authUnsubscribe = auth.onAuthStateChanged(() => {
      void registerCurrentUser();
    });

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const route = routeFromNotificationData(
          response.notification.request.content.data as Record<string, unknown> | undefined
        );
        router.push(route as never);
      });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!active || !response) {
        return;
      }

      const route = routeFromNotificationData(
        response.notification.request.content.data as Record<string, unknown> | undefined
      );
      router.push(route as never);
    });

    return () => {
      active = false;
      authUnsubscribe();
      responseSubscription.remove();
    };
  }, []);

  return <>{children}</>;
}
