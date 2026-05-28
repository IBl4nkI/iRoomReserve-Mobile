import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
  type Timestamp,
  updateDoc,
  writeBatch,
  where,
} from "firebase/firestore";

import { apiRequest } from "@/services/api";
import { db } from "@/services/firebase";

export type AppNotificationType =
  | "new_reservation"
  | "reservation_cancelled"
  | "reservation_approved"
  | "reservation_rejected"
  | "feedback"
  | "system";

export interface AppNotification {
  id: string;
  recipientUid: string;
  type: AppNotificationType;
  title: string;
  message: string;
  buildingId: string;
  reservationId: string;
  read: boolean;
  createdAt?: Timestamp;
}

export function shouldHideUtilityStaffInboxNotification(
  notification: AppNotification
) {
  const title = notification.title?.trim();

  return (
    notification.type === "feedback" ||
    title === "New Room Feedback" ||
    title === "Room Checked In" ||
    title === "Reservation Completed"
  );
}

export function shouldHideFacultyInboxNotification(notification: AppNotification) {
  return notification.type === "new_reservation";
}

function mapNotificationSnapshot(snapshot: QuerySnapshot) {
  return snapshot.docs.map(
    (notificationDoc) =>
      ({
        id: notificationDoc.id,
        ...notificationDoc.data(),
      }) as AppNotification
  );
}

export function onAllNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void
) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      callback(mapNotificationSnapshot(snapshot));
    },
    () => {
      callback([]);
    }
  );
}

export function onUnreadNotifications(
  uid: string,
  callback: (notifications: AppNotification[]) => void
) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    where("read", "==", false),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    notificationsQuery,
    (snapshot) => {
      callback(mapNotificationSnapshot(snapshot));
    },
    () => {
      callback([]);
    }
  );
}

export async function markNotificationRead(notificationId: string) {
  await updateDoc(doc(db, "notifications", notificationId), { read: true });
}

export async function markAllNotificationsRead(uid: string) {
  const notificationsQuery = query(
    collection(db, "notifications"),
    where("recipientUid", "==", uid),
    where("read", "==", false)
  );
  const snapshot = await getDocs(notificationsQuery);

  if (snapshot.empty) {
    return;
  }

  const batch = writeBatch(db);
  snapshot.docs.forEach((notificationDoc) => {
    batch.update(notificationDoc.ref, { read: true });
  });
  await batch.commit();
}

export async function deleteAllReadNotifications() {
  await apiRequest("/api/notifications/read", { method: "DELETE" });
}
