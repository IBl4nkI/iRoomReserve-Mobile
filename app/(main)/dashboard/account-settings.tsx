import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

interface AccountProfile {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.mutedLabel}>{label}</Text>
      <Text style={styles.menuTitle}>{value}</Text>
    </View>
  );
}

function AccountRowPair({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
}) {
  return (
    <View style={styles.accountPairRow}>
      <View style={[styles.listItem, styles.accountPairItem]}>
        <Text style={styles.mutedLabel}>{leftLabel}</Text>
        <Text style={styles.menuTitle}>{leftValue}</Text>
      </View>
      <View style={[styles.listItem, styles.accountPairItem]}>
        <Text style={styles.mutedLabel}>{rightLabel}</Text>
        <Text style={styles.menuTitle}>{rightValue}</Text>
      </View>
    </View>
  );
}

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = React.useState<AccountProfile | null>(null);

  React.useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return;
      }

      const userProfile = await getUserProfile(currentUser.uid);
      if (!active || !userProfile) {
        return;
      }

      setProfile({
        firstName: userProfile.firstName ?? '',
        lastName: userProfile.lastName ?? '',
        email: userProfile.email ?? currentUser.email ?? '',
        role: userProfile.role,
      });
    };

    loadProfile();

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
        <Text style={styles.screenTitle}>Account Settings</Text>
        <Text style={styles.screenSubtitle}>
          Review the account details currently attached to your iRoomReserve profile.
        </Text>

        <AccountRowPair
          leftLabel="First Name"
          leftValue={profile?.firstName || '-'}
          rightLabel="Last Name"
          rightValue={profile?.lastName || '-'}
        />
        <AccountRow label="Role" value={profile?.role || 'User'} />
        <AccountRow label="Email" value={profile?.email || '-'} />
      </View>

      <TouchableOpacity style={[styles.actionButton, styles.actionButtonInset]} onPress={() => router.back()}>
        <Text style={styles.actionButtonText}>Back to Dashboard</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}
