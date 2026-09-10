import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { dashboardStyles as styles } from '@/components/dashboard/styles';
import { colors, fonts } from '@/constants/theme';
import { auth } from '@/lib/firebase';
import { getFeedbackByUser } from '@/services/feedback.service';
import {
  cancelReservation,
  getReservationsByUser,
} from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { ReservationRecord, ReservationStatus } from '@/types/reservation';

type ReservationFilter =
  | 'pending'
  | 'approved'
  | 'expired'
  | 'completed'
  | 'rejected'
  | 'all';

type ReservationDisplayStatus = ReservationStatus | 'expired';

type FirestoreTimestampLike = {
  _nanoseconds?: number;
  _seconds?: number;
  seconds?: number;
  nanoseconds?: number;
} | null | undefined;

function getTimestampDate(timestamp: FirestoreTimestampLike) {
  const seconds =
    typeof timestamp?.seconds === 'number'
      ? timestamp.seconds
      : typeof timestamp?._seconds === 'number'
        ? timestamp._seconds
        : null;

  if (seconds === null) {
    return null;
  }

  return new Date(seconds * 1000);
}

function formatTimestamp(timestamp: FirestoreTimestampLike) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return 'Not available';
  }

  return date.toLocaleString('en-US', {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatTimestampTimeOnly(timestamp: FirestoreTimestampLike) {
  const date = getTimestampDate(timestamp);

  if (!date) {
    return 'Not available';
  }

  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatReservationDate(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatReservationWeekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
  });
}

function formatReservationDates(
  dates?: string[],
  fallbackDate?: string,
  isRecurringRequest?: boolean
) {
  const dateList = dates?.length ? dates : fallbackDate ? [fallbackDate] : [];

  if (dateList.length === 0) {
    return 'Not available';
  }

  if (isRecurringRequest && dateList.length > 1) {
    const firstDate = dateList[0];
    const lastDate = dateList[dateList.length - 1];
    return `Every ${formatReservationWeekday(firstDate)} Until ${formatReservationDate(lastDate)}`;
  }

  return dateList.map((date) => formatReservationDate(date)).join(' / ');
}

function getTodayDateKey() {
  const today = new Date();
  return [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');
}

function getReservationDates(reservation: ReservationRecord) {
  return reservation.dates?.length
    ? reservation.dates
    : reservation.date
      ? [reservation.date]
      : [];
}

function isExpiredReservation(reservation: ReservationRecord) {
  if (reservation.status !== 'pending' && reservation.status !== 'approved') {
    return false;
  }

  const reservationDates = getReservationDates(reservation);
  if (reservationDates.length === 0) {
    return false;
  }

  const todayDateKey = getTodayDateKey();
  return reservationDates.every((date) => date < todayDateKey);
}

function getDisplayStatus(reservation: ReservationRecord): ReservationDisplayStatus {
  return isExpiredReservation(reservation) ? 'expired' : reservation.status;
}

function getDisplayStatusLabel(status: ReservationDisplayStatus) {
  switch (status) {
    case 'approved':
      return 'Approved';
    case 'expired':
      return 'Expired';
    case 'completed':
      return 'Completed';
    case 'pending':
      return 'Pending';
    case 'cancelled':
      return 'Cancelled';
    case 'rejected':
      return 'Rejected';
    default:
      return 'Reservation';
  }
}

function getDisplayStatusStyle(status: ReservationDisplayStatus) {
  switch (status) {
    case 'approved':
    case 'completed':
      return [styles.chip, styles.chipApproved];
    case 'expired':
      return [styles.chip, styles.chipExpired];
    case 'pending':
      return [styles.chip, styles.chipPending];
    case 'cancelled':
    case 'rejected':
      return [styles.chip, styles.chipRejected];
    default:
      return [styles.chip, styles.chipPending];
  }
}

function getDisplayStatusTextStyle(status: ReservationDisplayStatus) {
  switch (status) {
    case 'approved':
    case 'completed':
      return [styles.chipText, styles.chipTextApproved];
    case 'expired':
      return [styles.chipText, styles.chipTextExpired];
    case 'pending':
      return [styles.chipText, styles.chipTextPending];
    case 'cancelled':
    case 'rejected':
      return [styles.chipText, styles.chipTextRejected];
    default:
      return [styles.chipText, styles.chipTextPending];
  }
}

function sortReservations(left: ReservationRecord, right: ReservationRecord) {
  return (
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    right.id.localeCompare(left.id)
  );
}

export default function ReservationHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [reviewedReservationIds, setReviewedReservationIds] = React.useState<string[]>([]);
  const [activeFilter, setActiveFilter] = React.useState<ReservationFilter>('pending');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  const loadReservations = React.useCallback(async (showSpinner = true) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setReservations([]);
      setReviewedReservationIds([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    try {
      const [nextReservations, feedback] = await Promise.all([
        getReservationsByUser(currentUser.uid),
        getFeedbackByUser(currentUser.uid),
      ]);
      setReservations(nextReservations.sort(sortReservations));
      setReviewedReservationIds(feedback.map((item) => item.reservationId));
      setError(null);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Failed to load reservations.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    let active = true;

    const run = async () => {
      try {
        if (!active) {
          return;
        }
        await loadReservations();
      } catch {
        // loadReservations handles screen state.
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [loadReservations]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadReservations(false);
    } finally {
      setRefreshing(false);
    }
  }, [loadReservations]);

  const handleCancel = React.useCallback(
    (reservationId: string) => {
      const currentUser = auth.currentUser;

      if (!currentUser || actionLoadingId) {
        return;
      }

      Alert.alert(
        'Cancel Reservation',
        'Are you sure you want to cancel this reservation?',
        [
          { style: 'cancel', text: 'Keep' },
          {
            style: 'destructive',
            text: 'Cancel Reservation',
            onPress: async () => {
              try {
                setActionLoadingId(reservationId);
                await cancelReservation(reservationId, currentUser.uid);
                await loadReservations(false);
              } catch (caughtError) {
                Alert.alert(
                  'Update Failed',
                  caughtError instanceof Error
                    ? caughtError.message
                    : "We couldn't cancel this reservation right now."
                );
              } finally {
                setActionLoadingId(null);
              }
            },
          },
        ]
      );
    },
    [actionLoadingId, loadReservations]
  );

  const filteredReservations = React.useMemo(() => {
    if (activeFilter === 'all') {
      return reservations;
    }

    if (activeFilter === 'expired') {
      return reservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'expired'
      );
    }

    if (activeFilter === 'rejected') {
      return reservations.filter(
        (reservation) =>
          reservation.status === 'rejected' || reservation.status === 'cancelled'
      );
    }

    return reservations.filter(
      (reservation) => getDisplayStatus(reservation) === activeFilter
    );
  }, [activeFilter, reservations]);

  const reviewedReservationIdSet = React.useMemo(
    () => new Set(reviewedReservationIds),
    [reviewedReservationIds]
  );

  const counts = React.useMemo(
    () => ({
      all: reservations.length,
      approved: reservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'approved'
      ).length,
      completed: reservations.filter((reservation) => reservation.status === 'completed')
        .length,
      expired: reservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'expired'
      ).length,
      pending: reservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'pending'
      ).length,
      rejected: reservations.filter(
        (reservation) =>
          reservation.status === 'rejected' || reservation.status === 'cancelled'
      ).length,
    }),
    [reservations]
  );

  const filters: { key: ReservationFilter; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'expired', label: 'Expired', count: counts.expired },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'rejected', label: 'Rejected/Cancelled', count: counts.rejected },
    { key: 'all', label: 'All', count: counts.all },
  ];

  return (
    <ScrollView
      stickyHeaderIndices={[0]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void handleRefresh();
          }}
          tintColor={colors.primary}
          colors={[colors.primary]}
        />
      }
      contentContainerStyle={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, 0),
        },
      ]}
    >
      <DashboardTopNav />

      <View style={styles.screenContent}>
        <Text style={styles.screenTitle}>My Reservations</Text>
        <Text style={styles.screenSubtitle}>
          View and manage all your room reservations.
        </Text>

        <View style={styles.filterTabsRow}>
          {filters.map((filter) => {
            const isActive = activeFilter === filter.key;

            return (
              <Pressable
                key={filter.key}
                style={[
                  styles.filterTabButton,
                  isActive ? styles.filterTabButtonActive : null,
                ]}
                onPress={() => setActiveFilter(filter.key)}
              >
                <Text
                  style={[
                    styles.filterTabButtonText,
                    isActive ? styles.filterTabButtonTextActive : null,
                  ]}
                  numberOfLines={1}
                >
                  {filter.label}
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
                    {filter.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : filteredReservations.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>
              No{' '}
              {activeFilter === 'all'
                ? ''
                : `${filters
                    .find((filter) => filter.key === activeFilter)
                    ?.label?.toLowerCase()} `}
              reservations found.
            </Text>
          </View>
        ) : (
          filteredReservations.map((reservation, index) => {
            const displayStatus = getDisplayStatus(reservation);
            const isExpired = displayStatus === 'expired';

            return (
              <View
                key={reservation.id}
                style={[
                  styles.listItem,
                  index === filteredReservations.length - 1 ? { marginBottom: 0 } : null,
                ]}
              >
                <View style={styles.reservationContent}>
                  <View style={styles.reservationHeaderRow}>
                    <View style={styles.reservationHeaderContent}>
                      <Text style={styles.mutedLabel}>
                        {formatReservationDates(
                          reservation.dates,
                          reservation.date,
                          reservation.isRecurringRequest
                        )}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {reservation.isEvent === 'Yes' ? (
                        <View
                          style={[
                            styles.reservationHeaderBadge,
                            styles.chip,
                            { backgroundColor: '#f3e8ff', borderColor: '#d8b4fe' },
                          ]}
                        >
                          <Text style={[styles.chipText, { color: '#7e22ce' }]}>Event</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.reservationHeaderBadge,
                          ...getDisplayStatusStyle(displayStatus),
                        ]}
                      >
                        <Text style={getDisplayStatusTextStyle(displayStatus)}>
                          {getDisplayStatusLabel(displayStatus)}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.reservationRoomNameWrap}>
                    <Text style={styles.reservationRoomName}>{reservation.roomName}</Text>
                  </View>
                  <Text style={styles.reservationMeta}>
                    <Text style={{ fontFamily: fonts.regular }}></Text>{''}
                    {reservation.buildingName}
                  </Text>
                  <Text style={styles.reservationMeta}>
                    <Text style={{ fontFamily: fonts.regular }}>Reserved Time:</Text>{' '}
                    {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
                  </Text>
                  <Text style={styles.reservationMeta}>
                    <Text style={{ fontFamily: fonts.regular }}>Purpose:</Text>{' '}
                    {reservation.purpose}
                  </Text>
                  {displayStatus === 'pending' ? (
                    <Text style={[styles.reservationMeta, { color: colors.primary }]}>
                      Waiting for approval
                    </Text>
                  ) : null}
                  {reservation.reason ? (
                    <Text style={styles.reservationMeta}>
                      <Text style={{ fontFamily: fonts.bold }}>Reason for Rejection:</Text>{' '}
                      {reservation.reason}
                    </Text>
                  ) : null}
                  {reservation.checkedInAt || reservation.completedAt ? (
                    <Text style={styles.reservationMeta}>
                      <Text style={{ fontFamily: fonts.regular }}>Time Used:</Text>{' '}
                      {formatTimestampTimeOnly(reservation.checkedInAt)} -{' '}
                      {formatTimestampTimeOnly(reservation.completedAt)}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.reservationActionsRow}>
                  {!isExpired &&
                  (reservation.status === 'pending' ||
                    reservation.status === 'approved') ? (
                    <Pressable
                      style={[
                        styles.reservationOutlineButton,
                        styles.reservationOutlineButtonDanger,
                      ]}
                      onPress={() => handleCancel(reservation.id)}
                      disabled={actionLoadingId === reservation.id}
                    >
                      <Text
                        style={[
                          styles.reservationOutlineButtonText,
                          styles.reservationOutlineButtonTextDanger,
                        ]}
                      >
                        {actionLoadingId === reservation.id ? 'Processing...' : 'Cancel'}
                      </Text>
                    </Pressable>
                  ) : null}
                  {reservation.status === 'completed' &&
                  !reviewedReservationIdSet.has(reservation.id) ? (
                    <Pressable
                      style={[styles.inlineSecondaryButton, { marginTop: -2, marginBottom: 0 }]}
                      onPress={() =>
                        router.push({
                          pathname: '/(main)/dashboard/feedback',
                          params: { reservationId: reservation.id },
                        })
                      }>
                      <Text style={styles.inlineSecondaryButtonText}>Leave a Review</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.backButtonContainer]}
        onPress={() => router.back()}
      >
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
