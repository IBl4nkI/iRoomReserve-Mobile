import { router } from 'expo-router';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

export default function FeedbackScreen() {
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
        <Text style={styles.screenTitle}>Give Us Feedback</Text>
        <Text style={styles.screenSubtitle}>
          Placeholder screen for the feedback flow. This is ready for a form or survey later.
        </Text>

        <View style={styles.placeholderCard}>
          <Text style={styles.placeholderText}>
            The next iteration can add categories, comments, screenshots, and rating controls here.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={[styles.actionButton, styles.actionButtonInset]} onPress={() => router.back()}>
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
