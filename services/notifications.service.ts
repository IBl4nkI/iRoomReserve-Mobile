import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  type QuerySnapshot,
  type Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";

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
