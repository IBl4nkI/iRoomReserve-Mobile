import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
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
import { getReservationsByUser } from '@/services/reservations.service';
import { formatTime12h } from '@/services/schedules.service';
import type { ReservationRecord } from '@/types/reservation';

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

export default function ReservationHistoryScreen() {
  const insets = useSafeAreaInsets();
  const [reservations, setReservations] = React.useState<ReservationRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadReservations = async () => {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        if (active) {
          setReservations([]);
          setLoading(false);
        }
        return;
      }

      try {
        const nextReservations = await getReservationsByUser(currentUser.uid);

        if (!active) {
          return;
        }

        setReservations(
          nextReservations.filter((reservation) => reservation.status === 'completed')
        );
        setError(null);
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Failed to load reservation history.'
        );
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadReservations();

    return () => {
      active = false;
    };
  }, []);

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
        <Text style={styles.screenTitle}>Reservation History</Text>
        <Text style={styles.screenSubtitle}>
          This is where you will see all finished reservations.
        </Text>

        {loading ? (
          <View style={styles.card}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : error ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : reservations.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>There is no reservation history.</Text>
          </View>
        ) : (
          reservations.map((reservation) => (
            <View key={reservation.id} style={styles.listItem}>
              <Text style={styles.mutedLabel}>{formatReservationDate(reservation.date)}</Text>
              <View style={styles.row}>
                <Text style={styles.menuTitle}>{reservation.roomName}</Text>
                <View style={[styles.chip, styles.chipApproved]}>
                  <Text style={[styles.chipText, styles.chipTextApproved]}>Finished</Text>
                </View>
              </View>
              <Text style={styles.reservationMeta}>Purpose: {reservation.purpose}</Text>
              <Text style={styles.reservationMeta}>
                Reservation Window: {formatTime12h(reservation.startTime)} - {formatTime12h(reservation.endTime)}
              </Text>
              <Text style={styles.reservationMeta}>
                Time Started: {formatTimestamp(reservation.checkedInAt)}
              </Text>
              <Text style={styles.reservationMeta}>
                Time Finished: {formatTimestamp(reservation.completedAt)}
              </Text>
              <Pressable style={styles.inlineSecondaryButton} onPress={() => {}}>
                <Text style={styles.inlineSecondaryButtonText}>Leave a Review</Text>
              </Pressable>
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
