import { Slot, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { getUserProfileWithRetry } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { PresenceMonitorProvider } from '@/components/PresenceMonitorProvider';
import { PushNotificationProvider } from '@/components/PushNotificationProvider';
import { ToastProvider } from '@/components/ToastProvider';
import { SelectionFilterProvider } from '@/components/SelectionFilterContext';
import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useRef, useState } from 'react';
import { colors } from '@/constants/theme';

function getApprovedUserRoute(role?: string | null) {
  return role?.trim() === 'Utility Staff'
    ? '/(main)/dashboard'
    : '/(main)/campus-select';
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'CenturyGothic-Regular': require('@/assets/fonts/centurygothic.ttf'),
    'CenturyGothic-Bold': require('@/assets/fonts/centurygothic_bold.ttf'),
  });
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [profileStatus, setProfileStatus] = useState<string | null>(null);
  const router = useRouter();
  const segments = useSegments();
  const authRequestIdRef = useRef(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      const requestId = authRequestIdRef.current + 1;
      authRequestIdRef.current = requestId;
      setLoading(true);
      setUser(firebaseUser);
      if (!firebaseUser) {
        setHasRole(null);
        setProfileRole(null);
        setProfileStatus(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await getUserProfileWithRetry(firebaseUser.uid, {
          attempts: 5,
          delayMs: 400,
        });
        if (authRequestIdRef.current !== requestId) {
          return;
        }
        setHasRole(Boolean(profile?.role));
        setProfileRole(profile?.role?.trim() ?? null);
        setProfileStatus(profile?.status ?? null);
      } finally {
        if (authRequestIdRef.current === requestId) {
          setLoading(false);
        }
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
    const isApprovedUser =
      Boolean(user) &&
      hasRole === true &&
      profileStatus !== 'pending' &&
      profileStatus !== 'rejected';

    if (!user) {
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
      return;
    }

    if (hasRole === false && !isRoleSelection) {
      router.replace('/(auth)/role-selection');
      return;
    }

    if (isApprovedUser && !inMainGroup) {
      router.replace(getApprovedUserRoute(profileRole));
    }
  }, [user, loading, hasRole, profileRole, profileStatus, segments, fontsLoaded, router]);

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
