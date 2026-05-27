import { Slot, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { PresenceMonitorProvider } from '@/components/PresenceMonitorProvider';
import { PushNotificationProvider } from '@/components/PushNotificationProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { SelectionFilterProvider } from '@/components/SelectionFilterContext';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { colors } from '@/constants/theme';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'CenturyGothic-Regular': require('@/assets/fonts/centurygothic.ttf'),
    'CenturyGothic-Bold': require('@/assets/fonts/centurygothic_bold.ttf'),
  });
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setHasRole(null);
        setProfileStatus(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await getUserProfile(firebaseUser.uid);
        setHasRole(Boolean(profile?.role));
        setProfileStatus(profile?.status ?? null);
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading || !fontsLoaded) return;
    const firstSegment = String(segments[0] ?? '');
    const inAuthGroup = firstSegment === '(auth)';
    const inMainGroup = firstSegment === '(main)';
    const isRoleSelection = segments.includes('role-selection');
    const isApprovedUser = Boolean(user) && hasRole && profileStatus !== 'pending' && profileStatus !== 'rejected';

    const timeout = setTimeout(() => {
      if (!user && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (user && hasRole === false && !isRoleSelection) {
        router.replace('/(auth)/role-selection');
      } else if (isApprovedUser && !inMainGroup) {
        router.replace('/(main)/campus-select');
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [user, loading, hasRole, profileStatus, segments, fontsLoaded]);

  if (!fontsLoaded || loading) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <SelectionFilterProvider>
        <PresenceMonitorProvider>
          <PushNotificationProvider>
            <ToastProvider>
              <View style={{ flex: 1, backgroundColor: colors.background }}>
                <StatusBar style="dark" backgroundColor={colors.background} />
                <Slot />
              </View>
            </ToastProvider>
          </PushNotificationProvider>
        </PresenceMonitorProvider>
      </SelectionFilterProvider>
    </SafeAreaProvider>
  );
}
