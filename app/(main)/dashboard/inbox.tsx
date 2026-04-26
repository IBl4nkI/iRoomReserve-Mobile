import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { inboxItems } from '@/components/dashboard/data';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

function InboxStatus({ status }: { status: 'Approved' | 'Rejected' | 'Pending' }) {
  if (status === 'Approved') {
    return (
      <View style={[styles.chip, styles.chipApproved]}>
        <Text style={[styles.chipText, styles.chipTextApproved]}>Approved</Text>
      </View>
    );
  }

  if (status === 'Rejected') {
    return (
      <View style={[styles.chip, styles.chipRejected]}>
        <Text style={[styles.chipText, styles.chipTextRejected]}>Rejected</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, styles.chipPending]}>
      <Text style={[styles.chipText, styles.chipTextPending]}>Pending</Text>
    </View>
  );
}

export default function InboxScreen() {
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
        <Text style={styles.screenTitle}>Inbox</Text>
        <Text style={styles.screenSubtitle}>
          Notifications for reservation approvals, rejections, and requests still under review.
        </Text>

        {inboxItems.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>There are no inbox notifications.</Text>
          </View>
        ) : (
          inboxItems.map((item) => (
            <View key={item.id} style={styles.listItem}>
              <View style={styles.row}>
                <Text style={styles.menuTitle}>{item.title}</Text>
                <InboxStatus status={item.status} />
              </View>
              <Text style={styles.menuDescription}>{item.description}</Text>
              <Text style={styles.reservationMeta}>{item.timestamp}</Text>
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
