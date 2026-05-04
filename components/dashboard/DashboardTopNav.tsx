import { router, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getUserProfile, logout } from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

const defaultNavItems = [
  {
    label: 'Dashboard',
    route: '/(main)/dashboard',
  },
  {
    label: 'Reserve Now',
    route: '/(main)/dashboard/reserve-now',
  },
  {
    label: 'Reservation History',
    route: '/(main)/dashboard/reservation-history',
  },
  {
    label: 'Account Settings',
    route: '/(main)/dashboard/account-settings',
  },
  {
    label: 'Feedback',
    route: '/(main)/dashboard/feedback',
  },
  {
    label: 'Inbox',
    route: '/(main)/dashboard/inbox',
  },
];

const utilityStaffNavItems = [
  {
    label: 'Dashboard',
    route: '/(main)/dashboard',
  },
  {
    label: 'Rooms Status',
    route: '/(main)/dashboard/rooms-status',
  },
  {
    label: 'Account Settings',
    route: '/(main)/dashboard/account-settings',
  },
  {
    label: 'Feedback',
    route: '/(main)/dashboard/feedback',
  },
  {
    label: 'Inbox',
    route: '/(main)/dashboard/inbox',
  },
];

function normalizeRoutePath(path: string) {
  const withoutGroups = path.replace(/\/\([^/]+\)/g, '');
  const normalized = withoutGroups === '' ? '/' : withoutGroups;
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

function formatDashboardRole(role: string | null | undefined) {
  const normalizedRole = role?.trim() || 'User';

  return normalizedRole === 'Faculty Professor' ? 'Faculty' : normalizedRole;
}

export default function DashboardTopNav() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [userInitials, setUserInitials] = React.useState('IR');
  const [userRole, setUserRole] = React.useState('User');
  const [isUtilityStaff, setIsUtilityStaff] = React.useState(false);
  const currentPath = normalizeRoutePath(pathname);

  React.useEffect(() => {
    let active = true;

    const loadUserProfile = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        return;
      }

      const profile = await getUserProfile(currentUser.uid);
      if (!active || !profile) {
        return;
      }

      const firstInitial = profile.firstName?.trim().charAt(0).toUpperCase() ?? '';
      const lastInitial = profile.lastName?.trim().charAt(0).toUpperCase() ?? '';
      const initials = `${firstInitial}${lastInitial}`.trim() || 'IR';

      setUserInitials(initials);
      const normalizedRole = profile.role?.trim() || 'User';
      setUserRole(formatDashboardRole(normalizedRole));
      setIsUtilityStaff(normalizedRole === 'Utility Staff');
    };

    loadUserProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleNavigate = (route: string) => {
    setMenuOpen(false);
    router.push(route);
  };

  const handleLogout = async () => {
    if (loggingOut) {
      return;
    }

    setMenuOpen(false);
    setLoggingOut(true);

    try {
      await logout();
      router.replace('/(auth)/login');
    } finally {
      setLoggingOut(false);
    }
  };

  const navItems = isUtilityStaff ? utilityStaffNavItems : defaultNavItems;

  return (
    <View style={[styles.stickyNavWrap, { paddingTop: insets.top + 10 }]}>
      <View style={styles.topBarRow}>
        <Text style={styles.topBarBrand}>iRoomReserve</Text>
        <Pressable style={styles.userBadgeRow} onPress={() => handleNavigate('/(main)/dashboard/account-settings')}>
          <View style={styles.userInitialsCircle}>
            <Text style={styles.userInitialsText}>{userInitials}</Text>
          </View>
          <View style={styles.userRolePill}>
            <Text style={styles.userRoleText}>{userRole}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.burgerButton, menuOpen ? styles.burgerButtonActive : null]}
          onPress={() => setMenuOpen((current) => !current)}
        >
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
          <View style={styles.burgerLine} />
        </Pressable>
      </View>

      {menuOpen ? (
        <View style={styles.menuOverlayWrap}>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.dropdownMenu}>
            {navItems.map((item) => {
              const itemPath = normalizeRoutePath(item.route);
              const isActive = currentPath === itemPath;

            return (
              <Pressable
                key={item.label}
                style={[styles.menuRowButton, isActive ? styles.menuRowButtonActive : null]}
                onPress={() => {
                  if (isActive) {
                    setMenuOpen(false);
                    return;
                  }

                  handleNavigate(item.route);
                }}
              >
                <Text style={[styles.menuRowText, isActive ? styles.menuRowTextActive : styles.menuRowTextInactive]}>
                  {item.label}
                </Text>
                </Pressable>
              );
            })}
            <Pressable style={[styles.menuRowButton, styles.menuRowButtonLogout]} onPress={handleLogout}>
              <Text style={[styles.menuRowText, styles.menuRowTextLogout]}>
                {loggingOut ? 'Logging out...' : 'Log out'}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}
