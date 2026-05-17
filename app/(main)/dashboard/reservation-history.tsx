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
import { colors } from '@/constants/theme';
import { auth } from '@/lib/firebase';
import {
  cancelReservation,
  completeReservation,
  getReservationsByUser,
} from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { ReservationRecord, ReservationStatus } from '@/types/reservation';

type ReservationFilter = 'pending' | 'approved' | 'completed' | 'rejected' | 'all';

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

function getDisplayStatusLabel(status: ReservationStatus) {
  switch (status) {
    case 'approved':
      return 'Approved';
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

function getDisplayStatusStyle(status: ReservationStatus) {
  switch (status) {
    case 'approved':
    case 'completed':
      return [styles.chip, styles.chipApproved];
    case 'pending':
      return [styles.chip, styles.chipPending];
    case 'cancelled':
    case 'rejected':
      return [styles.chip, styles.chipRejected];
    default:
      return [styles.chip, styles.chipPending];
  }
}

function getDisplayStatusTextStyle(status: ReservationStatus) {
  switch (status) {
    case 'approved':
    case 'completed':
      return [styles.chipText, styles.chipTextApproved];
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
  const [activeFilter, setActiveFilter] = React.useState<ReservationFilter>('pending');
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);

  const loadReservations = React.useCallback(async (showSpinner = true) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setReservations([]);
      setError(null);
      setLoading(false);
      return;
    }

    if (showSpinner) {
      setLoading(true);
    }

    try {
      const nextReservations = await getReservationsByUser(currentUser.uid);
      setReservations(nextReservations.sort(sortReservations));
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
          {
            style: 'cancel',
            text: 'Keep',
          },
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

  const handleComplete = React.useCallback(
    async (reservationId: string) => {
      const currentUser = auth.currentUser;

      if (!currentUser || actionLoadingId) {
        return;
      }

      try {
        setActionLoadingId(reservationId);
        await completeReservation(reservationId, currentUser.uid);
        await loadReservations(false);
      } catch (caughtError) {
        Alert.alert(
          'Update Failed',
          caughtError instanceof Error
            ? caughtError.message
            : "We couldn't complete this reservation right now."
        );
      } finally {
        setActionLoadingId(null);
      }
    },
    [actionLoadingId, loadReservations]
  );

  const filteredReservations = React.useMemo(() => {
    if (activeFilter === 'all') {
      return reservations;
    }

    if (activeFilter === 'rejected') {
      return reservations.filter(
        (reservation) =>
          reservation.status === 'rejected' || reservation.status === 'cancelled'
      );
    }

    return reservations.filter((reservation) => reservation.status === activeFilter);
  }, [activeFilter, reservations]);

  const counts = React.useMemo(
    () => ({
      all: reservations.length,
      approved: reservations.filter((reservation) => reservation.status === 'approved')
        .length,
      completed: reservations.filter((reservation) => reservation.status === 'completed')
        .length,
      pending: reservations.filter((reservation) => reservation.status === 'pending').length,
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
              No {activeFilter === 'all' ? '' : `${filters.find((filter) => filter.key === activeFilter)?.label?.toLowerCase()} `}
              reservations found.
            </Text>
          </View>
        ) : (
          filteredReservations.map((reservation) => (
            <View key={reservation.id} style={styles.listItem}>
              <Text style={styles.mutedLabel}>
                {formatReservationDates(
                  reservation.dates,
                  reservation.date,
                  reservation.isRecurringRequest
                )}
              </Text>
              <View style={styles.reservationHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuTitle}>{reservation.roomName}</Text>
                </View>
                <View style={getDisplayStatusStyle(reservation.status)}>
                  <Text style={getDisplayStatusTextStyle(reservation.status)}>
                    {getDisplayStatusLabel(reservation.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.reservationMeta}>{reservation.buildingName}</Text>
              <Text style={styles.reservationMeta}>
                {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
              </Text>
              <Text style={styles.reservationMeta}>Purpose: {reservation.purpose}</Text>
              {reservation.status === 'pending' ? (
                <Text style={[styles.reservationMeta, { color: colors.primary }]}>
                  Waiting for approval
                </Text>
              ) : null}
              {reservation.reason ? (
                <Text style={styles.reservationMeta}>Reason for Rejection: {reservation.reason}</Text>
              ) : null}
              {reservation.checkedInAt ? (
                <Text style={styles.reservationMeta}>
                  Time Started: {formatTimestamp(reservation.checkedInAt)}
                </Text>
              ) : null}
              {reservation.completedAt ? (
                <Text style={styles.reservationMeta}>
                  Time Finished: {formatTimestamp(reservation.completedAt)}
                </Text>
              ) : null}
              <View style={styles.reservationActionsRow}>
                {(reservation.status === 'pending' || reservation.status === 'approved') ? (
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
                {reservation.status === 'approved' ? (
                  <Pressable
                    style={[
                      styles.reservationOutlineButton,
                      styles.reservationOutlineButtonPrimary,
                    ]}
                    onPress={() => {
                      void handleComplete(reservation.id);
                    }}
                    disabled={actionLoadingId === reservation.id}
                  >
                    <Text
                      style={[
                        styles.reservationOutlineButtonText,
                        styles.reservationOutlineButtonTextPrimary,
                      ]}
                    >
                      {actionLoadingId === reservation.id
                        ? 'Processing...'
                        : 'Mark Complete'}
                    </Text>
                  </Pressable>
                ) : null}
                {reservation.status === 'completed' ? (
                  <Pressable style={styles.inlineSecondaryButton} onPress={() => {}}>
                    <Text style={styles.inlineSecondaryButtonText}>Leave a Review</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))
        )}
      </View>

      <TouchableOpacity style={[styles.actionButton, styles.actionButtonInset]} onPress={() => router.back()}>
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
