import { Slot, useRouter, useSegments } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { getUserProfile } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { ToastProvider } from '@/components/ToastProvider';
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
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setHasRole(null);
        setLoading(false);
        return;
      }

      try {
        const profile = await getUserProfile(firebaseUser.uid);
        setHasRole(Boolean(profile?.role));
      } finally {
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (loading) return;
    const firstSegment = String(segments[0] ?? '');
    const inAuthGroup = firstSegment === '(auth)';
    const isRoleSelection = segments.includes('role-selection');

    const timeout = setTimeout(() => {
      if (!user && !inAuthGroup) {
        router.replace('/(auth)/login');
      } else if (user && inAuthGroup && hasRole && !isRoleSelection) {
        router.replace('/(main)/campus-select');
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [user, loading, hasRole, segments]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <View style={{ flex: 1, backgroundColor: colors.background }}>
          <StatusBar style="dark" backgroundColor={colors.background} />
          <Slot />
        </View>
      </ToastProvider>
    </SafeAreaProvider>
  );
}
