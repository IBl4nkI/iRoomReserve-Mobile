import React from 'react';
import { router } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { ActivityIndicator, Alert, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import ReservationDateRangeModal from '@/components/ReservationDateRangeModal';
import { dashboardStyles as styles } from '@/components/dashboard/styles';
import { colors, fonts } from '@/constants/theme';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import {
  deleteAllReadNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  onAllNotifications,
  shouldHideUtilityStaffInboxNotification,
  type AppNotification,
} from '@/services/notifications.service';
import {
  approveReservation,
  getReservationsByCampus,
  getPendingReservationsForApprover,
  getReservationsByUser,
  rejectReservation,
} from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { ReservationRecord } from '@/types/reservation';
import { closeAppMessage, getMessageRecipients, markAppMessageRead, onInboxMessages, onSentMessages, sendAppMessage, type AppMessage, type MessageRecipient } from '@/services/messages.service';

type InboxTab = 'Unread' | 'Read' | 'Sent' | 'Closed' | 'All Messages';
type InboxRowStatus = 'Approved' | 'Rejected' | 'Pending';

interface InboxRowItem {
  id: string;
  reservationId: string;
  reservationStatus: string;
  purpose: string;
  date: string;
  time: string;
  roomName: string;
  equipment: string;
  approvalDocumentName?: string;
  approvalDocumentUrl?: string;
  sentAtLabel: string;
  status: InboxRowStatus;
  unread: boolean;
  message?: AppMessage;
  createdAt?: AppNotification['createdAt'];
  reservationFilter?: 'pending' | 'approved' | 'expired' | 'completed' | 'rejected' | 'all';
  reservationActivityDate?: string;
  isOwnReservation?: boolean;
}

type InboxDateRange = 'last7' | 'last30' | 'custom';
type InboxDropdown = 'date' | 'messages' | null;

function FilterCheck() {
  return <Svg width={16} height={16} viewBox="0 0 16 16" accessibilityLabel="Selected"><Path d="m3 8.5 3.2 3.2L13 5" fill="none" stroke={colors.primary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

function CalendarIcon() {
  return <Svg width={18} height={18} viewBox="0 0 18 18" accessibilityLabel="Calendar"><Path d="M5 2.5v3M13 2.5v3M3 7h12M4 4h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" fill="none" stroke={colors.secondary} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" /></Svg>;
}

const inboxFilterStyles = StyleSheet.create({
  controls: { position: 'relative', zIndex: 2, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  anchor: { flex: 1, position: 'relative', zIndex: 2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  anchorActive: { borderColor: colors.primary },
  button: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 8 },
  buttonText: { flexShrink: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 14 },
  menu: { position: 'absolute', top: 48, left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.14, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4, zIndex: 4 },
  option: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  optionLast: { borderBottomWidth: 0 },
  optionText: { flexShrink: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 13 },
  optionSelected: { color: colors.primary, fontFamily: fonts.bold },
  dateAction: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, backgroundColor: '#f3f8f3' },
  calendarWrap: { marginLeft: 4, marginRight: 12 },
  dateActionText: { flex: 1, flexShrink: 1, color: colors.text, fontFamily: fonts.regular, fontSize: 13 },
  dateActionArrow: { marginLeft: 1 },
  dismiss: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
});

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

function ChevronIcon({ expanded, navigate = false }: { expanded: boolean; navigate?: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d={navigate ? 'M9 5L16 12L9 19' : expanded ? 'M7 14L12 9L17 14' : 'M7 10L12 15L17 10'}
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

function getReservationActivityDate(reservation: ReservationRecord) {
  const timestamp = reservation.status === 'completed'
    ? reservation.completedAt ?? reservation.createdAt
    : reservation.createdAt;
  const seconds = typeof timestamp?.seconds === 'number'
    ? timestamp.seconds
    : typeof timestamp?._seconds === 'number'
      ? timestamp._seconds
      : null;
  const date = seconds === null ? null : new Date(seconds * 1000);
  if (!date || Number.isNaN(date.getTime())) return reservation.date || null;
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function getReservationFilter(reservation: ReservationRecord) {
  const today = new Date();
  const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');
  const reservationDates = reservation.dates?.length ? reservation.dates : [reservation.date];
  if (reservation.status === 'approved' && reservationDates.every((date) => date < todayKey)) return 'expired' as const;
  if (reservation.status === 'cancelled' || reservation.status === 'rejected') return 'rejected' as const;
  return reservation.status;
}

function getActivityDateRange(dateKey: string) {
  const activityDate = new Date(`${dateKey}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysAgo = Math.floor((today.getTime() - activityDate.getTime()) / 86400000);
  if (daysAgo >= 0 && daysAgo <= 6) return { dateRange: 'last7' as const };
  if (daysAgo >= 0 && daysAgo <= 29) return { dateRange: 'last30' as const };
  return { dateRange: 'custom' as const, startDate: dateKey, endDate: dateKey };
}

function getRowStatus(notification: AppNotification): InboxRowStatus {
  switch (notification.type) {
    case "reservation_rejected":
    case "reservation_cancelled":
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
        "Unavailable",
      date: reservation?.date ? formatReservationDate(reservation.date) : "Unavailable",
      time:
        reservation?.startTime && reservation?.endTime
          ? `${formatTime12h(reservation.startTime)} - ${formatTime12h(reservation.endTime)}`
          : "Unavailable",
      roomName: reservation?.roomName?.trim() || "Unavailable",
      equipment: reservation?.equipment
        ? Object.entries(reservation.equipment)
            .filter(([, quantity]) => quantity > 0)
            .map(([name, quantity]) => `${name} (x${quantity})`)
            .join(', ') || 'No equipment requested'
        : 'No equipment requested',
      approvalDocumentName: reservation?.approvalDocumentName,
      approvalDocumentUrl: reservation?.approvalDocumentUrl,
      sentAtLabel: formatSentDateFromNotification(notification),
      status: getRowStatus(notification),
      unread: !notification.read,
      createdAt: notification.createdAt,
      reservationFilter: reservation ? getReservationFilter(reservation) : undefined,
      reservationActivityDate: reservation ? getReservationActivityDate(reservation) ?? undefined : undefined,
      isOwnReservation: Boolean(reservation && reservation.userId === auth.currentUser?.uid),
    };
  });
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const inboxScrollRef = React.useRef<ScrollView | null>(null);
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  const [items, setItems] = React.useState<InboxRowItem[]>([]);
  const [appMessages, setAppMessages] = React.useState<AppMessage[]>([]);
  const [sentMessages, setSentMessages] = React.useState<AppMessage[]>([]);
  const [dateRange, setDateRange] = React.useState<InboxDateRange>('last7');
  const [activeDropdown, setActiveDropdown] = React.useState<InboxDropdown>(null);
  const [customRange, setCustomRange] = React.useState<{ startDate: string; endDate: string } | null>(null);
  const [calendarOpen, setCalendarOpen] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [recipients, setRecipients] = React.useState<MessageRecipient[]>([]);
  const [recipientId, setRecipientId] = React.useState('');
  const [subject, setSubject] = React.useState('');
  const [body, setBody] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [senderProfile, setSenderProfile] = React.useState<{ name: string; role: string; campus?: string }>({ name: '', role: '' });
  const [expandedItemId, setExpandedItemId] = React.useState<string | null>(null);
  const [openingReservationId, setOpeningReservationId] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<InboxTab>('Unread');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [markingReadId, setMarkingReadId] = React.useState<string | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = React.useState(false);
  const [isFaculty, setIsFaculty] = React.useState(false);
  const [reviewingReservationId, setReviewingReservationId] = React.useState<string | null>(null);
  const [rejectingItemId, setRejectingItemId] = React.useState<string | null>(null);
  const [rejectReason, setRejectReason] = React.useState('');
  const [rejectReasonError, setRejectReasonError] = React.useState('');

  React.useEffect(() => {
    if (isFocused) setOpeningReservationId(null);
  }, [isFocused]);

  React.useEffect(() => {
    const showEvent = Keyboard.addListener('keyboardDidShow', (event) => {
      setKeyboardHeight(event.endCoordinates.height);
      requestAnimationFrame(() => inboxScrollRef.current?.scrollToEnd({ animated: true }));
    });
    const hideEvent = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showEvent.remove();
      hideEvent.remove();
    };
  }, []);

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
          const isFacultyRole = ['faculty', 'faculty professor'].includes(normalizedRole?.toLowerCase() ?? '');
          setIsFaculty(isFacultyRole);
          const campus =
            profile?.campus === "main" || profile?.campus === "digi"
              ? profile.campus
              : null;
          const reservations =
            normalizedRole === "Utility Staff" && campus
              ? await getReservationsByCampus(campus)
              : await getReservationsByUser(currentUser.uid);
          const assignedApprovals = isFacultyRole
            ? await getPendingReservationsForApprover()
            : [];
          const reservationDetails = [
            ...reservations,
            ...assignedApprovals.filter(
              (approval) => !reservations.some((reservation) => reservation.id === approval.id)
            ),
          ];
          const visibleNotifications =
            normalizedRole === "Utility Staff"
              ? notifications.filter(
                  (notification) => !shouldHideUtilityStaffInboxNotification(notification)
                )
              : notifications;

          if (!active) {
            return;
          }

          setItems(buildInboxRows(visibleNotifications, reservationDetails));
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
    const stopInboxMessages = onInboxMessages(currentUser.uid, setAppMessages);
    const stopSentMessages = onSentMessages(currentUser.uid, setSentMessages);
    void getUserProfile(currentUser.uid).then((profile) => {
      if (!profile) return;
      const user = profile as typeof profile & { firstName?: string; lastName?: string; name?: string };
      setSenderProfile({ name: user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || currentUser.displayName || '', role: user.role ?? '', campus: user.campus ?? undefined });
    });

    return () => {
      active = false;
      unsubscribe();
      stopInboxMessages();
      stopSentMessages();
    };
  }, []);

  const dateRangeStart = React.useMemo(() => {
    if (dateRange === 'custom' && customRange) return new Date(`${customRange.startDate}T00:00:00`).getTime();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (dateRange === 'last30' ? 29 : 6));
    return start.getTime();
  }, [customRange, dateRange]);
  const isInRange = (createdAt?: { toDate?: () => Date }) => {
    const timestamp = createdAt?.toDate?.().getTime();
    if (timestamp === undefined) return true;
    if (dateRange === 'custom' && customRange) return timestamp <= new Date(`${customRange.endDate}T23:59:59`).getTime() && timestamp >= dateRangeStart;
    return timestamp >= dateRangeStart;
  };
  const unreadCount = items.filter((item) => item.unread).length + appMessages.filter((item) => !item.isRead).length;
  const readCount = items.filter((item) => !item.unread).length + appMessages.filter((item) => item.isRead).length;
  const visibleItems = React.useMemo<InboxRowItem[]>(() => {
    if (activeTab === 'Sent' || activeTab === 'Closed') {
      return sentMessages.filter((message) => isInRange(message.createdAt) && (activeTab === 'Sent' ? !message.closedBySender : message.closedBySender)).map((message) => ({ id: message.id, reservationId: '', reservationStatus: activeTab === 'Closed' ? 'Closed' : `To ${message.receiverName}`, purpose: message.subject, date: '', time: '', roomName: '', equipment: '', approvalDocumentName: undefined, approvalDocumentUrl: undefined, sentAtLabel: message.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? 'Recent', status: 'Approved' as InboxRowStatus, unread: false, message }));
    }
    const notificationRows = items.filter((item) => isInRange(item.createdAt));
    const messageRows = appMessages.filter((message) => isInRange(message.createdAt) && (activeTab === 'Unread' ? !message.isRead : activeTab === 'Read' ? message.isRead : true)).map((message) => ({ id: message.id, reservationId: '', reservationStatus: `From ${message.senderName}`, purpose: message.subject, date: '', time: '', roomName: '', equipment: '', approvalDocumentName: undefined, approvalDocumentUrl: undefined, sentAtLabel: message.createdAt?.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? 'Recent', status: 'Approved' as InboxRowStatus, unread: !message.isRead, message }));
    const notificationFiltered = notificationRows.filter((item) => activeTab === 'Unread' ? item.unread : activeTab === 'Read' ? !item.unread : true);
    return [...notificationFiltered, ...messageRows];
  // isInRange relies on the selected filter state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, appMessages, dateRangeStart, customRange, dateRange, items, sentMessages]);
  const showTabs = !loading && (items.length > 0 || !error);
  const showEmptyState = !loading && !error && visibleItems.length === 0;
  const showList = !loading && visibleItems.length > 0;
  const showMarkAllAsRead = activeTab === 'Unread' && unreadCount > 0;
  const showDeleteAllMail = false;

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

  const handleApprove = React.useCallback(async (item: InboxRowItem) => {
    const email = auth.currentUser?.email;
    if (!email || reviewingReservationId) return;
    try {
      setReviewingReservationId(item.id);
      await approveReservation(item.reservationId, email);
      await markNotificationRead(item.id);
      Alert.alert('Approved', 'The reservation request has been approved.');
    } catch (caughtError) {
      Alert.alert('Unable to approve', caughtError instanceof Error ? caughtError.message : 'Please try again.');
    } finally {
      setReviewingReservationId(null);
    }
  }, [reviewingReservationId]);

  const handleReject = React.useCallback(async (item: InboxRowItem) => {
    const email = auth.currentUser?.email;
    if (!email || reviewingReservationId) return;
    if (!rejectReason.trim()) {
      setRejectReasonError('Please state a reason for rejection.');
      return;
    }
    try {
      setReviewingReservationId(item.id);
      await rejectReservation(item.reservationId, email, rejectReason.trim());
      await markNotificationRead(item.id);
      setRejectingItemId(null);
      setRejectReason('');
      setRejectReasonError('');
      Alert.alert('Rejected', 'The reservation request has been rejected.');
    } catch (caughtError) {
      Alert.alert('Unable to reject', caughtError instanceof Error ? caughtError.message : 'Please try again.');
    } finally {
      setReviewingReservationId(null);
    }
  }, [rejectReason, reviewingReservationId]);

  const handleMarkAllAsRead = React.useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || bulkActionLoading) {
      return;
    }

    try {
      setBulkActionLoading(true);
      await Promise.all([
        markAllNotificationsRead(currentUser.uid),
        ...appMessages.filter((message) => !message.isRead).map((message) => markAppMessageRead(message.id)),
      ]);
    } finally {
      setBulkActionLoading(false);
    }
  }, [appMessages, bulkActionLoading]);

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
              await deleteAllReadNotifications();
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
      ref={inboxScrollRef}
      stickyHeaderIndices={[0]}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0) + (keyboardHeight ? keyboardHeight + 120 : 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 12 }}>
          <Text style={styles.screenTitle}>Inbox</Text>
          <Pressable onPress={async () => {
            const user = auth.currentUser;
            if (!user) return;
            const people = await getMessageRecipients(user.uid);
            setRecipients(people); setRecipientId('');
            setSubject(''); setBody(''); setComposeOpen(true);
            }} style={[
              styles.filterTabButton,
              styles.filterTabButtonActive,
              { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5,
              transform: [{ translateY: 6 }]
            }]}>
              <Text style={[styles.filterTabButtonTextActive,
                { fontSize: 12 }]}>+ Compose</Text>
          </Pressable>
        </View>
        <Text style={styles.screenSubtitle}>Messages and reservation updates in one place.</Text>
        <View style={{ position: 'relative', marginBottom: 0 }}>
          {activeDropdown ? <Pressable style={inboxFilterStyles.dismiss} onPress={() => setActiveDropdown(null)} accessibilityLabel="Close filter dropdown" /> : null}
          <View style={inboxFilterStyles.controls}>
            <View style={[inboxFilterStyles.anchor, activeDropdown === 'date' ? inboxFilterStyles.anchorActive : null]}>
              <Pressable style={inboxFilterStyles.button} onPress={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')} accessibilityRole="button" accessibilityLabel="Choose message date range">
                <Text style={inboxFilterStyles.buttonText} numberOfLines={1}>{dateRange === 'last7' ? 'Last 7 days' : dateRange === 'last30' ? 'Last 30 days' : customRange ? `${customRange.startDate} - ${customRange.endDate}` : 'Pick dates'}</Text><Text style={inboxFilterStyles.buttonText}>v</Text>
              </Pressable>
              {activeDropdown === 'date' ? <View style={inboxFilterStyles.menu}>
                {([['last7', 'Last 7 days'], ['last30', 'Last 30 days']] as const).map(([value, label], index) => <Pressable key={value} style={[inboxFilterStyles.option, index === 1 ? inboxFilterStyles.optionLast : null]} onPress={() => { setDateRange(value); setActiveDropdown(null); }}><Text style={[inboxFilterStyles.optionText, dateRange === value ? inboxFilterStyles.optionSelected : null]}>{label}</Text>{dateRange === value ? <FilterCheck /> : null}</Pressable>)}
                <Pressable style={inboxFilterStyles.dateAction} onPress={() => { setActiveDropdown(null); setCalendarOpen(true); }} accessibilityRole="button" accessibilityLabel="Pick the Date Range"><View style={inboxFilterStyles.calendarWrap}><CalendarIcon /></View><Text style={inboxFilterStyles.dateActionText}>Pick the Date Range</Text><View style={inboxFilterStyles.dateActionArrow}><Text style={inboxFilterStyles.optionText}>&gt;</Text></View></Pressable>
              </View> : null}
            </View>
            <View style={[inboxFilterStyles.anchor, activeDropdown === 'messages' ? inboxFilterStyles.anchorActive : null]}>
              <Pressable style={inboxFilterStyles.button} onPress={() => setActiveDropdown(activeDropdown === 'messages' ? null : 'messages')} accessibilityRole="button" accessibilityLabel={`Message filter: ${activeTab}`}>
                <Text style={inboxFilterStyles.buttonText} numberOfLines={1}>{activeTab}</Text><Text style={inboxFilterStyles.buttonText}>v</Text>
              </Pressable>
              {activeDropdown === 'messages' ? <View style={inboxFilterStyles.menu}>
                {(['Unread', 'Read', 'Sent', 'Closed', 'All Messages'] as InboxTab[]).map((tab, index, options) => <Pressable key={tab} style={[inboxFilterStyles.option, index === options.length - 1 ? inboxFilterStyles.optionLast : null]} onPress={() => { setActiveTab(tab); setActiveDropdown(null); }}><Text style={[inboxFilterStyles.optionText, activeTab === tab ? inboxFilterStyles.optionSelected : null]}>{tab}</Text>{activeTab === tab ? <FilterCheck /> : null}</Pressable>)}
              </View> : null}
            </View>
          </View>
        </View>

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

        {showMarkAllAsRead ? (
          <View style={{ alignItems: 'flex-end', marginBottom: 18 }}>
            <Pressable disabled={bulkActionLoading} onPress={() => void handleMarkAllAsRead()}>
              <Text style={styles.textLink}>{bulkActionLoading ? 'Marking...' : 'Mark All Read'}</Text>
            </Pressable>
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
                onPress={() => {
                  if (!item.message && item.isOwnReservation && item.reservationFilter && item.reservationActivityDate) {
                    const targetRange = getActivityDateRange(item.reservationActivityDate);
                    setOpeningReservationId(item.id);
                    requestAnimationFrame(() => {
                      router.push({
                        pathname: '/(main)/dashboard/reservation-history',
                        params: {
                          filter: item.reservationFilter,
                          reservationId: item.reservationId,
                          navigationToken: String(Date.now()),
                          ...targetRange,
                        },
                      });
                    });
                    return;
                  }
                  setExpandedItemId((current) => {
                      if (current !== item.id && item.message && !item.message.isRead && activeTab !== 'Sent' && activeTab !== 'Closed') void markAppMessageRead(item.id);
                      return current === item.id ? null : item.id;
                  });
                }}
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
                    {openingReservationId === item.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <ChevronIcon
                        expanded={expandedItemId === item.id}
                        navigate={!item.message && Boolean(item.isOwnReservation)}
                      />
                    )}
                  </View>

                  {expandedItemId === item.id ? (
                    <View style={styles.inboxNotificationExpanded}>
                      {item.message ? <>
                        <Text style={styles.inboxNotificationDetailText}>Subject: {item.message.subject}</Text>
                        <Text style={styles.inboxNotificationDetailText}>{item.message.body}</Text>
                        <Text style={styles.inboxNotificationDetailText}>{activeTab === 'Sent' || activeTab === 'Closed' ? `To: ${item.message.receiverName} · ${item.message.receiverRole}${item.message.receiverCampus ? ` · ${item.message.receiverCampus === 'digi' ? 'Digital Campus' : 'Main Campus'}` : ''}` : `From: ${item.message.senderName} · ${item.message.senderRole}${item.message.senderCampus ? ` · ${item.message.senderCampus === 'digi' ? 'Digital Campus' : 'Main Campus'}` : ''}`}</Text>
                        {activeTab === 'Sent' && !item.message.closedBySender ? <Pressable style={[styles.inboxNotificationActionButton, { marginTop: 10 }]} onPress={() => void closeAppMessage(item.id)}><Text style={styles.inboxNotificationActionButtonText}>Close message</Text></Pressable> : null}
                      </> : null}
                      {!item.message ? <Text style={styles.inboxNotificationDetailText}>
                        Purpose: {item.purpose}
                      </Text> : null}
                      {!item.message ? <Text style={styles.inboxNotificationDetailText}>
                        Requested Equipment: {item.equipment}
                      </Text> : null}
                      {item.approvalDocumentUrl ? (
                        <View style={{ marginTop: 6 }}>
                          <Text style={styles.inboxNotificationDetailText}>
                            Concept Paper / Approval Letter:
                          </Text>
                          <Pressable
                            onPress={(event) => {
                              event.stopPropagation();
                              void Linking.openURL(item.approvalDocumentUrl!);
                            }}
                          >
                            <Text style={[styles.inboxNotificationDetailText, { color: colors.primary, textDecorationLine: 'underline' }]}>
                              {item.approvalDocumentName || 'Open attachment'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                      {item.unread && isFaculty && item.status === 'Pending' ? (
                        <View style={{ gap: 10, marginTop: 14 }}>
                          {rejectingItemId === item.id ? (
                            <View style={{ gap: 6 }}>
                              <Text style={{ color: '#292524', fontSize: 13, fontWeight: '700' }}>
                                Reason for Rejection:
                              </Text>
                              <TextInput
                                value={rejectReason}
                                onChangeText={(value) => {
                                  setRejectReason(value);
                                  if (value.trim()) setRejectReasonError('');
                                }}
                                onFocus={() => {
                                  setTimeout(() => inboxScrollRef.current?.scrollToEnd({ animated: true }), 100);
                                }}
                                placeholder="Enter a reason"
                                multiline
                                style={{ borderColor: '#d6d3d1', borderRadius: 12, borderWidth: 1, minHeight: 76, padding: 12 }}
                              />
                              {rejectReasonError ? (
                                <Text style={{ color: '#b91c1c', fontSize: 12 }}>
                                  {rejectReasonError}
                                </Text>
                              ) : null}
                            </View>
                          ) : null}
                          <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                            <Pressable
                              disabled={reviewingReservationId === item.id}
                              onPress={(event) => {
                                event.stopPropagation();
                                if (rejectingItemId === item.id) {
                                  void handleReject(item);
                                } else {
                                  void handleApprove(item);
                                }
                              }}
                              style={[
                                styles.inboxNotificationActionButton,
                                rejectingItemId === item.id
                                  ? styles.inboxNotificationRejectButton
                                  : styles.inboxNotificationApproveButton,
                                reviewingReservationId === item.id ? styles.inboxNotificationActionButtonDisabled : null,
                              ]}
                            >
                              <Text style={[
                                styles.inboxNotificationActionButtonText,
                                rejectingItemId === item.id
                                  ? styles.inboxNotificationRejectButtonText
                                  : styles.inboxNotificationApproveButtonText,
                              ]}>
                                {reviewingReservationId === item.id ? 'Processing...' : rejectingItemId === item.id ? 'Confirm Reject' : 'Approve'}
                              </Text>
                            </Pressable>
                            <Pressable
                              disabled={reviewingReservationId === item.id}
                              onPress={(event) => {
                                event.stopPropagation();
                                if (rejectingItemId === item.id) {
                                  setRejectingItemId(null);
                                  setRejectReason('');
                                  setRejectReasonError('');
                                } else {
                                  setRejectingItemId(item.id);
                                  setRejectReasonError('');
                                }
                              }}
                              style={[
                                styles.inboxNotificationActionButton,
                                rejectingItemId === item.id
                                  ? styles.inboxNotificationCancelButton
                                  : styles.inboxNotificationRejectButton,
                                reviewingReservationId === item.id ? styles.inboxNotificationActionButtonDisabled : null,
                              ]}
                            >
                              <Text style={[
                                styles.inboxNotificationActionButtonText,
                                rejectingItemId === item.id
                                  ? styles.inboxNotificationCancelButtonText
                                  : styles.inboxNotificationRejectButtonText,
                              ]}>{rejectingItemId === item.id ? 'Cancel' : 'Reject'}</Text>
                            </Pressable>
                          </View>
                        </View>
                      ) : item.unread ? (
                        <Pressable
                          style={[
                            styles.inboxNotificationActionButton,
                            markingReadId === item.id
                              ? styles.inboxNotificationActionButtonDisabled
                              : null,
                          ]}
                          disabled={markingReadId === item.id}
                          onPress={() => {
                            if (item.message) void markAppMessageRead(item.id);
                            else void handleMarkAsRead(item.id);
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
      <Modal visible={composeOpen} transparent animationType="slide" onRequestClose={() => setComposeOpen(false)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <View style={[styles.card, { gap: 12, maxHeight: '85%' }]}>
            <Text style={styles.screenTitle}>New Message</Text>
            <Text style={styles.screenSubtitle}>From {senderProfile.name} · {senderProfile.role}{senderProfile.campus ? ` · ${senderProfile.campus === 'digi' ? 'Digital Campus' : 'Main Campus'}` : ''}</Text>
            <Text style={styles.mutedLabel}>To</Text>
            <ScrollView style={{ maxHeight: 160 }}>
              {recipients.map((person) => <Pressable key={person.uid} onPress={() => setRecipientId(person.uid)} style={{ padding: 10, borderRadius: 10, backgroundColor: recipientId === person.uid ? '#f3e8e8' : '#f8f8f8', marginBottom: 5 }}><Text>{person.name} — {person.role}{person.campus ? ` · ${person.campus === 'digi' ? 'Digital Campus' : 'Main Campus'}` : ''}</Text></Pressable>)}
            </ScrollView>
            <TextInput value={subject} onChangeText={setSubject} placeholder="Subject" style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12 }} />
            <TextInput value={body} onChangeText={setBody} placeholder="Write your message..." multiline style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, minHeight: 110, textAlignVertical: 'top' }} />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 18 }}>
              <Pressable onPress={() => setComposeOpen(false)}><Text style={styles.textLink}>Cancel</Text></Pressable>
              <Pressable disabled={sending} onPress={async () => { const user = auth.currentUser; const recipient = recipients.find((entry) => entry.uid === recipientId); if (!user || !recipient || !subject.trim() || !body.trim()) { Alert.alert('Complete the message', 'Choose a recipient and enter a subject and message.'); return; } try { setSending(true); await sendAppMessage({ senderId: user.uid, senderName: senderProfile.name, senderRole: senderProfile.role, senderCampus: senderProfile.campus, receiverId: recipient.uid, receiverName: recipient.name, receiverRole: recipient.role, receiverCampus: recipient.campus, subject, body }); setComposeOpen(false); Alert.alert('Message sent', `Your message was sent to ${recipient.name}.`); } catch (error) { Alert.alert('Unable to send', error instanceof Error ? error.message : 'Please try again.'); } finally { setSending(false); } }}><Text style={styles.textLink}>{sending ? 'Sending...' : 'Send'}</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <ReservationDateRangeModal visible={calendarOpen} initialStartDate={customRange?.startDate ?? null} initialEndDate={customRange?.endDate ?? null} onApply={(startDate, endDate) => { setCustomRange({ startDate, endDate }); setDateRange('custom'); }} onClose={() => setCalendarOpen(false)} />
    </ScrollView>
  );
}
