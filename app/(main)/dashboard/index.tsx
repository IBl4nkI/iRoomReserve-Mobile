import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { inboxItems } from '@/components/dashboard/data';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

function EmptyStateCard({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function BellIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9.5 20C9.95833 21.1667 10.7917 21.75 12 21.75C13.2083 21.75 14.0417 21.1667 14.5 20"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path
        d="M5.5 17.5H18.5C17.6667 16.6667 17.25 15.5208 17.25 14.0625V10.875C17.25 7.81842 14.9926 5.25 12 5.25C9.00736 5.25 6.75 7.81842 6.75 10.875V14.0625C6.75 15.5208 6.33333 16.6667 5.5 17.5Z"
        stroke="#343434"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M10.125 4.625C10.125 3.58947 10.9645 2.75 12 2.75C13.0355 2.75 13.875 3.58947 13.875 4.625" stroke="#343434" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

const dashboardLinks = [
  {
    label: 'Reserve Now',
    description: 'Start a new room reservation from campus selection.',
    onPress: () => router.push('/(main)/dashboard/reserve-now'),
  },
];

export default function DashboardHomeScreen() {
  const insets = useSafeAreaInsets();
  const [firstName, setFirstName] = React.useState('My');
  const hasUnreadInbox = inboxItems.some((item) => item.unread);

  React.useEffect(() => {
    let active = true;

    const loadUserProfile = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return;
      }

      const profile = await getUserProfile(currentUser.uid);
      if (!active || !profile?.firstName?.trim()) {
        return;
      }

      setFirstName(profile.firstName.trim());
    };

    loadUserProfile();

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
        <View style={styles.screenTitleRow}>
          <Text style={styles.screenTitleCentered}>{`${firstName}'s Dashboard`}</Text>
          <Pressable
            style={styles.inboxShortcutButton}
            onPress={() => router.push('/(main)/dashboard/inbox')}
          >
            <BellIcon />
            {hasUnreadInbox ? <View style={styles.inboxShortcutDot} /> : null}
          </Pressable>
        </View>

        <EmptyStateCard
          title="Ongoing Reservation"
          message="There are no ongoing reservations."
        />

        <EmptyStateCard
          title="Pending Requests"
          message="There are no pending requests."
        />

        <EmptyStateCard
          title="Upcoming Reservations"
          message="There are no upcoming reservations."
        />
        <Pressable style={styles.actionButton} onPress={dashboardLinks[0].onPress}>
          <Text style={styles.actionButtonText}>Reserve Now</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
