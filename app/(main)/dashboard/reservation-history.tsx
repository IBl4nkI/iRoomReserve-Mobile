import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { reservationHistory } from '@/components/dashboard/data';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

export default function ReservationHistoryScreen() {
  const insets = useSafeAreaInsets();

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
          Past reservations with room, campus, date, time, and purpose details.
        </Text>

        {reservationHistory.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>There is no reservation history.</Text>
          </View>
        ) : (
          reservationHistory.map((reservation) => (
            <View key={reservation.id} style={styles.listItem}>
              <Text style={styles.mutedLabel}>{reservation.date}</Text>
              <View style={styles.row}>
                <Text style={styles.menuTitle}>{reservation.room}</Text>
                <View style={[styles.chip, styles.chipApproved]}>
                  <Text style={[styles.chipText, styles.chipTextApproved]}>{reservation.status}</Text>
                </View>
              </View>
              <Text style={styles.reservationMeta}>{reservation.building}</Text>
              <Text style={styles.reservationMeta}>{reservation.campus}</Text>
              <Text style={styles.reservationMeta}>{reservation.time}</Text>
              <Text style={styles.reservationPurpose}>{reservation.purpose}</Text>
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
