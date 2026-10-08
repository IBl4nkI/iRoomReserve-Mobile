import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import ReservationDateRangeModal from '@/components/ReservationDateRangeModal';
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
type ReservationDateRange = 'last7' | 'last30' | 'custom';
type HistoryDropdown = 'date' | 'type' | null;
type CustomDateRange = { startDate: string; endDate: string } | null;

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
  const createdAtDifference =
    (getTimestampDate(left.createdAt)?.getTime() ?? 0) -
    (getTimestampDate(right.createdAt)?.getTime() ?? 0);

  return (
    -createdAtDifference ||
    right.date.localeCompare(left.date) ||
    right.startTime.localeCompare(left.startTime) ||
    right.id.localeCompare(left.id)
  );
}

function getActivityDate(reservation: ReservationRecord) {
  return (
    getTimestampDate(reservation.status === 'completed' ? reservation.completedAt ?? reservation.createdAt : reservation.createdAt) ??
    (reservation.date ? new Date(`${reservation.date}T00:00:00`) : null)
  );
}

function getActivityMonthKey(reservation: ReservationRecord) {
  const date = getActivityDate(reservation);
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    : 'unknown';
}

function getActivityMonthLabel(reservation: ReservationRecord) {
  const date = getActivityDate(reservation);
  return date
    ? date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : 'Date unavailable';
}

function isWithinDateRange(
  reservation: ReservationRecord,
  range: ReservationDateRange,
  customRange: CustomDateRange
) {
  const activityDate = getActivityDate(reservation);
  if (!activityDate || Number.isNaN(activityDate.getTime())) {
    return false;
  }

  if (range === 'custom') {
    if (!customRange) {
      return false;
    }
    const activityDateKey = [
      activityDate.getFullYear(),
      String(activityDate.getMonth() + 1).padStart(2, '0'),
      String(activityDate.getDate()).padStart(2, '0'),
    ].join('-');
    return (
      activityDateKey >= customRange.startDate &&
      activityDateKey <= customRange.endDate
    );
  }

  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (range === 'last7' ? 6 : 29));

  return activityDate >= start && activityDate <= end;
}

function getDefaultFilter(reservations: ReservationRecord[]): ReservationFilter {
  if (reservations.some((reservation) => getDisplayStatus(reservation) === 'pending')) {
    return 'pending';
  }
  if (reservations.some((reservation) => getDisplayStatus(reservation) === 'approved')) {
    return 'approved';
  }
  if (reservations.some((reservation) => reservation.status === 'completed')) {
    return 'completed';
  }
  return 'all';
}

function DropdownChevron({ direction = 'down' }: { direction?: 'down' | 'right' }) {
  const path = direction === 'right' ? 'M6 3.5 10.5 8 6 12.5' : 'm3.5 6 4.5 4.5L12.5 6';
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" accessibilityLabel="Open options">
      <Path
        d={path}
        fill="none"
        stroke={colors.secondary}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function DropdownCheck() {
  return (
    <Svg width={16} height={16} viewBox="0 0 16 16" accessibilityLabel="Selected">
      <Path
        d="m3 8.5 3.2 3.2L13 5"
        fill="none"
        stroke={colors.primary}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function CalendarIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 18 18" accessibilityLabel="Calendar">
      <Path
        d="M5 2.5v3M13 2.5v3M3 7h12M4 4h10a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
        fill="none"
        stroke={colors.secondary}
        strokeWidth={1.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const historyStyles = StyleSheet.create({
  filtersRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
    zIndex: 1,
    elevation: 1,
  },
  filterAnchor: {
    flex: 1,
    position: 'relative',
    zIndex: 2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  filterAnchorActive: {
    borderColor: colors.primary,
  },
  filterButton: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 8,
  },
  filterButtonText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  dropdownMenu: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
    zIndex: 3,
  },
  dropdownOption: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  dropdownOptionLast: {
    borderBottomWidth: 0,
  },
  dropdownOptionText: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
    flexShrink: 1,
  },
  dropdownOptionSelected: {
    color: colors.primary,
    fontFamily: fonts.bold,
  },
  dropdownDismissArea: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  monthSummary: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f1f7f1',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    borderRadius: 8,
  },
  monthTitle: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 16,
  },
  monthTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    flexShrink: 0,
  },
  monthTotalLabel: {
    color: colors.secondary,
    fontFamily: fonts.regular,
    fontSize: 11,
  },
  monthTotal: {
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 13,
  },
  sectionList: {
    marginBottom: 18,
  },
  dateRangeAction: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    paddingHorizontal: 8,
    backgroundColor: '#f3f8f3',
  },
  dateRangeCalendarWrap: {
    marginLeft: 4,
    marginRight: 12,
  },
  dateRangeArrowWrap: {
    marginLeft: 1,
  },
  dateRangeActionText: {
    flex: 1,
    flexShrink: 1,
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 13,
  },
});

export default function ReservationHistoryScreen() {
  const routeParams = useLocalSearchParams<{
    filter?: string;
    dateRange?: string;
    startDate?: string;
    endDate?: string;
    reservationId?: string;
    navigationToken?: string;
  }>();
  const insets = useSafeAreaInsets();
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [reviewedReservationIds, setReviewedReservationIds] = React.useState<string[]>([]);
  const [activeFilter, setActiveFilter] = React.useState<ReservationFilter | null>(null);
  const [dateRange, setDateRange] = React.useState<ReservationDateRange>('last7');
  const [customDateRange, setCustomDateRange] = React.useState<CustomDateRange>(null);
  const [dateRangeModalVisible, setDateRangeModalVisible] = React.useState(false);
  const [activeDropdown, setActiveDropdown] = React.useState<HistoryDropdown>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(null);
  const [highlightedReservationId, setHighlightedReservationId] = React.useState<string | null>(null);
  const reservationHighlight = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const allowedFilters: ReservationFilter[] = ['pending', 'approved', 'expired', 'completed', 'rejected', 'all'];
    if (routeParams.filter && allowedFilters.includes(routeParams.filter as ReservationFilter)) {
      setActiveFilter(routeParams.filter as ReservationFilter);
    }
    if (routeParams.dateRange === 'last7' || routeParams.dateRange === 'last30') {
      setDateRange(routeParams.dateRange);
      setCustomDateRange(null);
    } else if (
      routeParams.dateRange === 'custom' &&
      routeParams.startDate &&
      routeParams.endDate
    ) {
      setDateRange('custom');
      setCustomDateRange({ startDate: routeParams.startDate, endDate: routeParams.endDate });
    }
  }, [routeParams.dateRange, routeParams.endDate, routeParams.filter, routeParams.startDate]);

  React.useEffect(() => {
    const reservationId = routeParams.reservationId;
    if (!reservationId || !reservations.some((reservation) => reservation.id === reservationId)) {
      return;
    }

    setHighlightedReservationId(reservationId);
    reservationHighlight.setValue(0);
    Animated.sequence([
      Animated.timing(reservationHighlight, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }),
      Animated.delay(1100),
      Animated.timing(reservationHighlight, {
        toValue: 0,
        duration: 850,
        useNativeDriver: false,
      }),
    ]).start(({ finished }) => {
      if (finished) setHighlightedReservationId(null);
    });
  }, [reservationHighlight, reservations, routeParams.reservationId]);

  const loadReservations = React.useCallback(async (showSpinner = true, forceRefresh = false) => {
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
        getReservationsByUser(currentUser.uid, { forceRefresh }),
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
        await loadReservations(true, Boolean(routeParams.navigationToken));
      } catch {
        // loadReservations handles screen state.
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [loadReservations, routeParams.navigationToken]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await loadReservations(false, true);
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

  const dateFilteredReservations = React.useMemo(
    () => reservations.filter((reservation) =>
      isWithinDateRange(reservation, dateRange, customDateRange)
    ),
    [customDateRange, dateRange, reservations]
  );

  const selectedFilter = React.useMemo(
    () => activeFilter ?? getDefaultFilter(dateFilteredReservations),
    [activeFilter, dateFilteredReservations]
  );

  const filteredReservations = React.useMemo(() => {
    if (selectedFilter === 'all') {
      return dateFilteredReservations;
    }

    if (selectedFilter === 'expired') {
      return dateFilteredReservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'expired'
      );
    }

    if (selectedFilter === 'rejected') {
      return dateFilteredReservations.filter(
        (reservation) =>
          reservation.status === 'rejected' || reservation.status === 'cancelled'
      );
    }

    return dateFilteredReservations.filter(
      (reservation) => getDisplayStatus(reservation) === selectedFilter
    );
  }, [dateFilteredReservations, selectedFilter]);

  const reviewedReservationIdSet = React.useMemo(
    () => new Set(reviewedReservationIds),
    [reviewedReservationIds]
  );

  const counts = React.useMemo(
    () => ({
      all: dateFilteredReservations.length,
      approved: dateFilteredReservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'approved'
      ).length,
      completed: dateFilteredReservations.filter((reservation) => reservation.status === 'completed')
        .length,
      expired: dateFilteredReservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'expired'
      ).length,
      pending: dateFilteredReservations.filter(
        (reservation) => getDisplayStatus(reservation) === 'pending'
      ).length,
      rejected: dateFilteredReservations.filter(
        (reservation) =>
          reservation.status === 'rejected' || reservation.status === 'cancelled'
      ).length,
    }),
    [dateFilteredReservations]
  );

  const filters: { key: ReservationFilter; label: string; count: number }[] = [
    { key: 'pending', label: 'Pending', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'expired', label: 'Expired', count: counts.expired },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'rejected', label: 'Rejected/Cancelled', count: counts.rejected },
    { key: 'all', label: 'All Types', count: counts.all },
  ];

  const monthGroups = React.useMemo(() => {
    const groups = new Map<string, { label: string; total: number; items: ReservationRecord[] }>();

    filteredReservations.forEach((reservation) => {
      const key = getActivityMonthKey(reservation);
      const group = groups.get(key) ?? {
        label: getActivityMonthLabel(reservation),
        total: dateFilteredReservations.filter((candidate) =>
          getActivityMonthKey(candidate) === key &&
          ['pending', 'approved', 'completed'].includes(getDisplayStatus(candidate))
        ).length,
        items: [],
      };
      group.items.push(reservation);
      groups.set(key, group);
    });

    return [...groups.entries()].map(([key, group]) => ({ key, ...group }));
  }, [dateFilteredReservations, filteredReservations]);

  const dateRangeLabel = React.useMemo(() => {
    if (dateRange === 'last7') return 'Last 7 days';
    if (dateRange === 'last30') return 'Last 30 days';
    if (!customDateRange) return 'Pick dates';

    const startLabel = new Date(`${customDateRange.startDate}T00:00:00`).toLocaleDateString(
      'en-US',
      { day: 'numeric', month: 'short' }
    );
    const endLabel = new Date(`${customDateRange.endDate}T00:00:00`).toLocaleDateString(
      'en-US',
      { day: 'numeric', month: 'short', year: 'numeric' }
    );
    return `${startLabel} – ${endLabel}`;
  }, [customDateRange, dateRange]);

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

        <View style={{ position: 'relative' }}>
          {activeDropdown ? (
            <Pressable
              style={historyStyles.dropdownDismissArea}
              onPress={() => setActiveDropdown(null)}
              accessibilityLabel="Close dropdown"
            />
          ) : null}
          <View style={historyStyles.filtersRow}>
            <View
              style={[
                historyStyles.filterAnchor,
                activeDropdown === 'date' ? historyStyles.filterAnchorActive : null,
              ]}
            >
              <Pressable
                style={historyStyles.filterButton}
                onPress={() => setActiveDropdown(activeDropdown === 'date' ? null : 'date')}
                accessibilityRole="button"
                accessibilityLabel={`Date range: ${dateRangeLabel}`}
              >
                <Text style={historyStyles.filterButtonText}>{dateRangeLabel}</Text>
                <DropdownChevron />
              </Pressable>
              {activeDropdown === 'date' ? (
                <View style={historyStyles.dropdownMenu}>
                  {([
                    ['last7', 'Last 7 days'],
                    ['last30', 'Last 30 days'],
                  ] as const).map(([value, label], index, options) => (
                    <Pressable
                      key={value}
                      style={[
                        historyStyles.dropdownOption,
                        index === options.length - 1 ? historyStyles.dropdownOptionLast : null,
                      ]}
                      onPress={() => {
                        setDateRange(value);
                        setActiveDropdown(null);
                      }}
                    >
                      <Text
                        style={[
                          historyStyles.dropdownOptionText,
                          dateRange === value ? historyStyles.dropdownOptionSelected : null,
                        ]}
                      >
                        {label}
                      </Text>
                      {dateRange === value ? <DropdownCheck /> : null}
                    </Pressable>
                  ))}
                  <Pressable
                    style={historyStyles.dateRangeAction}
                    onPress={() => {
                      setActiveDropdown(null);
                      setDateRangeModalVisible(true);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Pick the Date Range"
                  >
                    <View style={historyStyles.dateRangeCalendarWrap}>
                      <CalendarIcon />
                    </View>
                    <Text style={historyStyles.dateRangeActionText}>Pick the Date Range</Text>
                    <View style={historyStyles.dateRangeArrowWrap}>
                      <DropdownChevron direction="right" />
                    </View>
                  </Pressable>
                </View>
              ) : null}
            </View>
            <View
              style={[
                historyStyles.filterAnchor,
                activeDropdown === 'type' ? historyStyles.filterAnchorActive : null,
              ]}
            >
              <Pressable
                style={historyStyles.filterButton}
                onPress={() => setActiveDropdown(activeDropdown === 'type' ? null : 'type')}
                accessibilityRole="button"
                accessibilityLabel={`Reservation type: ${filters.find((filter) => filter.key === selectedFilter)?.label}`}
              >
                <Text style={historyStyles.filterButtonText} numberOfLines={1}>
                  {filters.find((filter) => filter.key === selectedFilter)?.label}
                </Text>
                <DropdownChevron />
              </Pressable>
              {activeDropdown === 'type' ? (
                <View style={historyStyles.dropdownMenu}>
                  {filters.map((filter, index) => (
                    <Pressable
                      key={filter.key}
                      style={[
                        historyStyles.dropdownOption,
                        index === filters.length - 1 ? historyStyles.dropdownOptionLast : null,
                      ]}
                      onPress={() => {
                        setActiveFilter(filter.key);
                        setActiveDropdown(null);
                      }}
                    >
                      <Text
                        style={[
                          historyStyles.dropdownOptionText,
                          selectedFilter === filter.key ? historyStyles.dropdownOptionSelected : null,
                        ]}
                      >
                        {filter.label}
                      </Text>
                      {selectedFilter === filter.key ? <DropdownCheck /> : null}
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </View>
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
              {selectedFilter === 'all'
                ? ''
                : `${filters
                    .find((filter) => filter.key === selectedFilter)
                    ?.label?.toLowerCase()} `}
              reservations found.
            </Text>
          </View>
        ) : (
          monthGroups.map((group) => (
            <View key={group.key} style={historyStyles.sectionList}>
              <View style={historyStyles.monthSummary}>
                <Text style={historyStyles.monthTitle}>{group.label}</Text>
                <View style={historyStyles.monthTotalRow}>
                  <Text style={historyStyles.monthTotalLabel}>Total Reservations:</Text>
                  <Text style={historyStyles.monthTotal}>{group.total}</Text>
                </View>
              </View>
              {group.items.map((reservation, index) => {
            const displayStatus = getDisplayStatus(reservation);
            const isExpired = displayStatus === 'expired';

            return (
              <Animated.View
                key={reservation.id}
                style={[
                  styles.listItem,
                  highlightedReservationId === reservation.id
                    ? {
                        borderColor: reservationHighlight.interpolate({
                          inputRange: [0, 1],
                          outputRange: [colors.border, colors.primary],
                        }),
                        borderWidth: 2,
                      }
                    : null,
                  index === group.items.length - 1 ? { marginBottom: 0 } : null,
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
                  {reservation.reservationStartedAt || reservation.checkedInAt || reservation.completedAt ? (
                    <Text style={styles.reservationMeta}>
                      <Text style={{ fontFamily: fonts.regular }}>Time Used:</Text>{' '}
                      {formatTimestampTimeOnly(reservation.reservationStartedAt ?? reservation.checkedInAt)} -{' '}
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
                    <TouchableOpacity
                      style={[styles.inlineSecondaryButton, { marginTop: -2, marginBottom: 0 }]}
                      onPress={() =>
                        router.push({
                          pathname: '/(main)/dashboard/feedback',
                          params: { reservationId: reservation.id },
                        })
                      }>
                      <Text style={styles.inlineSecondaryButtonText}>Leave a Review</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </Animated.View>
            );
              })}
            </View>
          ))
        )}
      </View>

      <TouchableOpacity
        style={[styles.actionButton, styles.backButtonContainer]}
        onPress={() => router.back()}
      >
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>

      <ReservationDateRangeModal
        visible={dateRangeModalVisible}
        initialStartDate={dateRange === 'custom' ? customDateRange?.startDate ?? null : null}
        initialEndDate={dateRange === 'custom' ? customDateRange?.endDate ?? null : null}
        onApply={(startDate, endDate) => {
          setCustomDateRange({ startDate, endDate });
          setDateRange('custom');
        }}
        onClose={() => setDateRangeModalVisible(false)}
      />

    </ScrollView>
  );
}
