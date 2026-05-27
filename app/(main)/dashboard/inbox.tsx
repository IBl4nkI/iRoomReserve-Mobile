import React from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { dashboardStyles as styles } from '@/components/dashboard/styles';
import { colors } from '@/constants/theme';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import {
  deleteAllReadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  onAllNotifications,
  type AppNotification,
} from '@/services/notifications.service';
import {
  getReservationsByCampus,
  getReservationsByUser,
} from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { ReservationRecord } from '@/types/reservation';

type InboxTab = 'Unread' | 'Read' | 'All Mail';
type InboxRowStatus = 'Approved' | 'Rejected' | 'Pending';

interface InboxRowItem {
  id: string;
  reservationId: string;
  reservationStatus: string;
  purpose: string;
  date: string;
  time: string;
  roomName: string;
  sentAtLabel: string;
  status: InboxRowStatus;
  unread: boolean;
}

function CheckIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M7 12.5L10.2 15.7L17 8.9"
        stroke="#166534"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function PendingIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 7V12L15 15"
        stroke="#c2410c"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
        stroke="#c2410c"
        strokeWidth={2}
      />
    </Svg>
  );
}

function RejectedIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M8 8L16 16"
        stroke="#b91c1c"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <Path
        d="M16 8L8 16"
        stroke="#b91c1c"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d={expanded ? 'M7 14L12 9L17 14' : 'M7 10L12 15L17 10'}
        stroke="#625f5f"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function NotificationIcon({ status }: { status: InboxRowStatus }) {
  if (status === 'Rejected') {
    return <RejectedIcon />;
  }

  if (status === 'Pending') {
    return <PendingIcon />;
  }

  return <CheckIcon />;
}

function getNotificationIconStyle(status: InboxRowStatus) {
  if (status === 'Rejected') {
    return styles.inboxNotificationIconWrapRejected;
  }

  if (status === 'Pending') {
    return styles.inboxNotificationIconWrapPending;
  }

  return null;
}

function formatSentDate(date: string) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date.replace(/,?\s*\d{4}$/, '');
  }

  return parsedDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatReservationDate(date: string) {
  const parsedDate = new Date(date);

  if (Number.isNaN(parsedDate.getTime())) {
    return date;
  }

  return parsedDate.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatSentDateFromNotification(notification: AppNotification) {
  if (!notification.createdAt) {
    return "Recent";
  }

  return notification.createdAt.toDate().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getRowStatus(notification: AppNotification): InboxRowStatus {
  switch (notification.type) {
    case "reservation_rejected":
      return "Rejected";
    case "new_reservation":
      return "Pending";
    default:
      return "Approved";
  }
}

function getReservationStatusLabel(notification: AppNotification) {
  switch (notification.type) {
    case "new_reservation":
      return "Reservation Pending";
    case "reservation_rejected":
      return "Reservation Rejected";
    case "reservation_cancelled":
      return "Reservation Cancelled";
    case "reservation_approved":
      return "Reservation Approved";
    default:
      if (notification.title?.trim() === "Faculty Adviser Approved") {
        return "Dept. Head/Adviser Approved";
      }
      return notification.title?.trim() || "Reservation Update";
  }
}

function buildInboxRows(
  notifications: AppNotification[],
  reservations: ReservationRecord[]
): InboxRowItem[] {
  const reservationsById = new Map(
    reservations.map((reservation) => [reservation.id, reservation] as const)
  );

  return notifications.map((notification) => {
    const reservation = reservationsById.get(notification.reservationId);

    return {
      id: notification.id,
      reservationId: notification.reservationId,
      reservationStatus: getReservationStatusLabel(notification),
      purpose:
        reservation?.purpose?.trim() ||
        notification.message?.trim() ||
        "No purpose provided.",
      date: reservation?.date ? formatReservationDate(reservation.date) : "Unavailable",
      time:
        reservation?.startTime && reservation?.endTime
          ? `${formatTime12h(reservation.startTime)} - ${formatTime12h(reservation.endTime)}`
          : "Unavailable",
      roomName: reservation?.roomName?.trim() || "Unavailable",
      sentAtLabel: formatSentDateFromNotification(notification),
      status: getRowStatus(notification),
      unread: !notification.read,
    };
  });
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = React.useState<InboxRowItem[]>([]);
  const [expandedItemId, setExpandedItemId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<InboxTab>('Unread');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = React.useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false);

  React.useEffect(() => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setItems([]);
      setLoading(false);
      setError("Sign in to view your inbox.");
      return;
    }

    let active = true;

    const unsubscribe = onAllNotifications(currentUser.uid, (notifications) => {
      void (async () => {
        try {
          const profile = await getUserProfile(currentUser.uid);
          const normalizedRole = profile?.role?.trim() ?? null;
          const campus =
            profile?.campus === "main" || profile?.campus === "digi"
              ? profile.campus
              : null;
          const reservations =
            normalizedRole === "Utility Staff" && campus
              ? await getReservationsByCampus(campus)
              : await getReservationsByUser(currentUser.uid);

          if (!active) {
            return;
          }

          setItems(buildInboxRows(notifications, reservations));
          setError(null);
        } catch (caughtError) {
          if (!active) {
            return;
          }

          setItems(buildInboxRows(notifications, []));
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Unable to load reservation details for inbox messages."
          );
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      })();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const unreadCount = items.filter((item) => item.unread).length;
  const readCount = items.length - unreadCount;
  const visibleItems = items.filter((item) => {
    if (activeTab === 'Unread') {
      return item.unread;
    }

    if (activeTab === 'Read') {
      return !item.unread;
    }

    return true;
  });
  const showTabs = !loading && (items.length > 0 || !error);
  const showEmptyState = !loading && !error && visibleItems.length === 0;
  const showList = !loading && visibleItems.length > 0;
  const showMarkAllAsRead = activeTab === 'Unread' && unreadCount > 0;
  const showDeleteAllMail = activeTab === 'Read' && readCount > 0;

  const handleMarkAsRead = React.useCallback(async (notificationId: string) => {
    if (markingReadId) {
      return;
    }

    try {
      setMarkingReadId(notificationId);
      await markNotificationRead(notificationId);
    } finally {
      setMarkingReadId(null);
    }
  }, [markingReadId]);

  const handleMarkAllAsRead = React.useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || bulkActionLoading) {
      return;
    }

    try {
      setBulkActionLoading(true);
      await markAllNotificationsRead(currentUser.uid);
    } finally {
      setBulkActionLoading(false);
    }
  }, [bulkActionLoading]);

  const handleDeleteAllMail = React.useCallback(() => {
    const currentUser = auth.currentUser;
    if (!currentUser || bulkActionLoading) {
      return;
    }

    Alert.alert(
      'Delete All Mail',
      'Are you sure you want to delete all read mail?',
      [
        {
          style: 'cancel',
          text: 'Cancel',
        },
        {
          style: 'destructive',
          text: 'Delete',
          onPress: async () => {
            try {
              setBulkActionLoading(true);
              setExpandedItemId(null);
              await deleteAllReadNotifications(currentUser.uid);
            } finally {
              setBulkActionLoading(false);
            }
          },
        },
      ]
    );
  }, [bulkActionLoading]);

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
        <Text style={styles.screenTitle}>Inbox</Text>
        <Text style={styles.screenSubtitle}>
          Reservation updates appear here first while push notifications are not yet enabled.
        </Text>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {!loading && error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : null}

        {showTabs ? (
        <View style={{ marginBottom: 18 }}>
          <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <View style={[styles.filterTabsRow, { flex: 1, marginBottom: 0 }]}>
              {(['Unread', 'Read', 'All Mail'] as InboxTab[]).map((tab) => {
                const isActive = activeTab === tab;
                const count =
                  tab === 'Unread' ? unreadCount : tab === 'Read' ? readCount : items.length;

                return (
                  <Pressable
                    key={tab}
                    style={[
                      styles.filterTabButton,
                      isActive ? styles.filterTabButtonActive : null,
                    ]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text
                      style={[
                        styles.filterTabButtonText,
                        isActive ? styles.filterTabButtonTextActive : null,
                      ]}
                    >
                      {tab}
                    </Text>
                    <View
                      style={[
                        styles.filterTabBadge,
                        isActive ? styles.filterTabBadgeActive : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterTabBadgeText,
                          isActive ? styles.filterTabBadgeTextActive : null,
                        ]}
                      >
                        {count}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {showMarkAllAsRead ? (
              <Pressable
                disabled={bulkActionLoading}
                onPress={() => {
                  void handleMarkAllAsRead();
                }}
              >
                <Text style={styles.textLink}>
                  {bulkActionLoading ? 'Marking...' : 'Mark All as Read'}
                </Text>
              </Pressable>
            ) : null}

            {showDeleteAllMail ? (
              <Pressable
                disabled={bulkActionLoading}
                onPress={handleDeleteAllMail}
              >
                <Text style={styles.textLink}>
                  {bulkActionLoading ? 'Deleting...' : 'Delete All Mail'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        ) : null}

        {showEmptyState ? (
          <View style={styles.inboxPanelEmpty}>
            <Text style={styles.emptyText}>There are no messages in {activeTab.toLowerCase()}.</Text>
          </View>
        ) : showList ? (
          <View style={styles.inboxListFullWidth}>
            <View style={styles.inboxList}>
            {visibleItems.map((item, index) => (
              <Pressable
                key={item.id}
                onPress={() =>
                  setExpandedItemId((current) => (current === item.id ? null : item.id))
                }
                style={[
                  styles.inboxNotificationRow,
                  item.unread ? styles.inboxNotificationRowUnread : null,
                  index === visibleItems.length - 1 ? styles.inboxNotificationRowLast : null,
                ]}
              >
                <View
                  style={[
                    styles.inboxNotificationIconWrap,
                    getNotificationIconStyle(item.status),
                  ]}
                >
                  <NotificationIcon status={item.status} />
                </View>

                <View style={styles.inboxNotificationContent}>
                  <View style={styles.inboxNotificationHeader}>
                    <View style={styles.inboxNotificationHeadingBlock}>
                      <Text style={styles.inboxNotificationTitle}>{item.reservationStatus}</Text>
                      <Text style={styles.inboxNotificationBody}>{item.purpose}</Text>
                    </View>
                    <View style={styles.inboxNotificationMetaBlock}>
                      <Text style={styles.inboxNotificationTimestamp}>
                        {item.sentAtLabel}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.inboxNotificationArrowRow}>
                    <View style={styles.inboxNotificationArrowSpacer} />
                    <ChevronIcon expanded={expandedItemId === item.id} />
                  </View>

                  {expandedItemId === item.id ? (
                    <View style={styles.inboxNotificationExpanded}>
                      <Text style={styles.inboxNotificationDetailText}>
                        Room Name: {item.roomName}
                      </Text>
                      <Text style={styles.inboxNotificationDetailText}>
                        Date: {item.date}
                      </Text>
                      <Text style={styles.inboxNotificationDetailText}>
                        Time: {item.time}
                      </Text>
                      {item.unread ? (
                        <Pressable
                          style={[
                            styles.inboxNotificationActionButton,
                            markingReadId === item.id
                              ? styles.inboxNotificationActionButtonDisabled
                              : null,
                          ]}
                          disabled={markingReadId === item.id}
                          onPress={() => {
                            void handleMarkAsRead(item.id);
                          }}
                        >
                          <Text style={styles.inboxNotificationActionButtonText}>
                            {markingReadId === item.id ? 'Marking...' : 'Mark as read'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </Pressable>
            ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
