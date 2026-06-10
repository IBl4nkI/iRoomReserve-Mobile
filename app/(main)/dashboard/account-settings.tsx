import React from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import DashboardTopNav from '@/components/dashboard/DashboardTopNav';
import { colors, fonts } from '@/constants/theme';
import {
  deleteCurrentUserAccount,
  getAuthErrorMessage,
  getUserProfile,
  updateUserPassword,
  updateUserProfileName,
} from '@/lib/auth';
import { auth } from '@/lib/firebase';
import { dashboardStyles as styles } from '@/components/dashboard/styles';

interface AccountProfile {
  firstName: string;
  lastName: string;
  email: string;
  role?: string;
}

function AuthMessage({
  message,
  tone,
}: {
  message: string;
  tone: 'error' | 'success';
}) {
  return (
    <View style={tone === 'error' ? localStyles.errorBox : localStyles.successBox}>
      <Text style={tone === 'error' ? localStyles.errorText : localStyles.successText}>
        {message}
      </Text>
    </View>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.listItem}>
      <Text style={styles.mutedLabel}>{label}</Text>
      <Text style={styles.menuTitle}>{value}</Text>
    </View>
  );
}

function ResponsiveNameRow({
  firstName,
  lastName,
  editing = false,
  editableFirstName = '',
  editableLastName = '',
  onChangeFirstName,
  onChangeLastName,
}: {
  firstName: string;
  lastName: string;
  editing?: boolean;
  editableFirstName?: string;
  editableLastName?: string;
  onChangeFirstName?: (value: string) => void;
  onChangeLastName?: (value: string) => void;
}) {
  return (
    <View style={localStyles.nameRow}>
      <View style={[styles.listItem, localStyles.nameRowItem]}>
        <Text style={styles.mutedLabel}>First Name</Text>
        {editing ? (
          <TextInput
            style={localStyles.inlineNameInput}
            value={editableFirstName}
            onChangeText={onChangeFirstName}
            placeholder="Enter your first name"
            placeholderTextColor={colors.mutedText}
          />
        ) : (
          <Text style={styles.menuTitle}>{firstName}</Text>
        )}
      </View>
      <View style={[styles.listItem, localStyles.nameRowItem]}>
        <Text style={styles.mutedLabel}>Last Name</Text>
        {editing ? (
          <TextInput
            style={localStyles.inlineNameInput}
            value={editableLastName}
            onChangeText={onChangeLastName}
            placeholder="Enter your last name"
            placeholderTextColor={colors.mutedText}
          />
        ) : (
          <Text style={styles.menuTitle}>{lastName}</Text>
        )}
      </View>
    </View>
  );
}

function PasswordField({
  label,
  value,
  onChangeText,
  placeholder,
  visible,
  onToggleVisibility,
  onFocus,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisibility: () => void;
  onFocus?: () => void;
}) {
  return (
    <>
      <Text style={localStyles.fieldLabel}>{label}</Text>
      <View style={localStyles.passwordContainer}>
        <TextInput
          style={localStyles.passwordInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedText}
          secureTextEntry={!visible}
          autoCapitalize="none"
          onFocus={onFocus}
        />
        <TouchableOpacity
          onPress={onToggleVisibility}
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
        >
          <Text style={localStyles.passwordToggleText}>{visible ? '🙈' : '👁️'}</Text>
        </TouchableOpacity>
      </View>
    </>
  );
}

export default function AccountSettingsScreen() {
  const insets = useSafeAreaInsets();
  const scrollViewRef = React.useRef<ScrollView | null>(null);
  const [passwordCardTop, setPasswordCardTop] = React.useState(0);
  const [profile, setProfile] = React.useState<AccountProfile | null>(null);
  const [firstName, setFirstName] = React.useState('');
  const [lastName, setLastName] = React.useState('');
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [showCurrentPassword, setShowCurrentPassword] = React.useState(false);
  const [showNewPassword, setShowNewPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [loadingProfile, setLoadingProfile] = React.useState(true);
  const [savingName, setSavingName] = React.useState(false);
  const [savingPassword, setSavingPassword] = React.useState(false);
  const [editingName, setEditingName] = React.useState(false);
  const [editingPassword, setEditingPassword] = React.useState(false);
  const [nameErrorMessage, setNameErrorMessage] = React.useState('');
  const [nameSuccessMessage, setNameSuccessMessage] = React.useState('');
  const [passwordErrorMessage, setPasswordErrorMessage] = React.useState('');
  const [passwordSuccessMessage, setPasswordSuccessMessage] = React.useState('');
  const [deleteErrorMessage, setDeleteErrorMessage] = React.useState('');
  const [deletingAccount, setDeletingAccount] = React.useState(false);

  const validatePassword = React.useCallback((password: string): string | null => {
    if (password.length < 8) {
      return 'Password must be at least 8 characters.';
    }

    if (!/[A-Z]/.test(password)) {
      return 'Password must include at least one uppercase letter.';
    }

    if (!/[0-9]/.test(password)) {
      return 'Password must include at least one number.';
    }

    return null;
  }, []);

  const scrollToPasswordCard = React.useCallback(() => {
    scrollViewRef.current?.scrollTo({
      y: Math.max(passwordCardTop - 24, 0),
      animated: true,
    });
  }, [passwordCardTop]);

  React.useEffect(() => {
    let active = true;

    const loadProfile = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        if (active) {
          setLoadingProfile(false);
        }
        return;
      }

      try {
        const userProfile = await getUserProfile(currentUser.uid);
        if (!active || !userProfile) {
          return;
        }

        const nextProfile = {
          firstName: userProfile.firstName ?? '',
          lastName: userProfile.lastName ?? '',
          email: userProfile.email ?? currentUser.email ?? '',
          role: userProfile.role,
        };

        setProfile(nextProfile);
        setFirstName(nextProfile.firstName);
        setLastName(nextProfile.lastName);
      } finally {
        if (active) {
          setLoadingProfile(false);
        }
      }
    };

    void loadProfile();

    return () => {
      active = false;
    };
  }, []);

  const handleSaveName = React.useCallback(async () => {
    const currentUser = auth.currentUser;
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();

    if (!currentUser) {
      setNameSuccessMessage('');
      setNameErrorMessage('Please log in again and try once more.');
      return;
    }

    if (!trimmedFirstName || !trimmedLastName) {
      setNameSuccessMessage('');
      setNameErrorMessage('Please enter both your first name and last name.');
      return;
    }

    try {
      setSavingName(true);
      setNameErrorMessage('');
      setNameSuccessMessage('');
      await updateUserProfileName(currentUser.uid, {
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
      });
      setProfile((currentProfile) => ({
        email: currentProfile?.email ?? currentUser.email ?? '',
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        role: currentProfile?.role,
      }));
      setEditingName(false);
      setNameSuccessMessage('Your name has been updated successfully.');
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : '';
      setNameSuccessMessage('');
      setNameErrorMessage(getAuthErrorMessage(code));
    } finally {
      setSavingName(false);
    }
  }, [firstName, lastName]);

  const handleSavePassword = React.useCallback(async () => {
    const trimmedCurrentPassword = currentPassword.trim();
    const trimmedPassword = newPassword.trim();
    const trimmedConfirmPassword = confirmPassword.trim();

    if (!trimmedCurrentPassword || !trimmedPassword || !trimmedConfirmPassword) {
      setPasswordSuccessMessage('');
      setPasswordErrorMessage('Please enter your current password and confirm your new password.');
      return;
    }

    const passwordError = validatePassword(trimmedPassword);

    if (passwordError) {
      setPasswordSuccessMessage('');
      setPasswordErrorMessage(passwordError);
      return;
    }

    if (trimmedPassword !== trimmedConfirmPassword) {
      setPasswordSuccessMessage('');
      setPasswordErrorMessage('Please make sure both password fields are identical.');
      return;
    }

    try {
      setSavingPassword(true);
      setPasswordErrorMessage('');
      setPasswordSuccessMessage('');
      await updateUserPassword(trimmedCurrentPassword, trimmedPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrentPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setEditingPassword(false);
      setPasswordSuccessMessage('Your password has been updated successfully.');
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : '';
      setPasswordSuccessMessage('');
      const isIncorrectPasswordCode =
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-login-credentials';
      setPasswordErrorMessage(
        isIncorrectPasswordCode ? 'Incorrect Password' : getAuthErrorMessage(code)
      );
    } finally {
      setSavingPassword(false);
    }
  }, [confirmPassword, currentPassword, newPassword, validatePassword]);

  const handleDeleteAccount = React.useCallback(async () => {
    try {
      setDeletingAccount(true);
      setDeleteErrorMessage('');
      await deleteCurrentUserAccount();
      router.replace('/(auth)/login');
    } catch (error) {
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : '';
      setDeleteErrorMessage(getAuthErrorMessage(code));
    } finally {
      setDeletingAccount(false);
    }
  }, []);

  return (
    <KeyboardAvoidingView
      style={localStyles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        ref={scrollViewRef}
        stickyHeaderIndices={[0]}
        keyboardShouldPersistTaps="handled"
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
            Review and edit details attached to your
            e-RoomReserve account.
          </Text>

          {loadingProfile ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <>
              <View style={localStyles.sectionHeaderRow}>
                <Text style={[styles.sectionTitle, localStyles.headerTitle]}>Profile Information</Text>
                <TouchableOpacity
                  style={localStyles.editButton}
                  onPress={() => {
                    if (editingName) {
                      setFirstName(profile?.firstName ?? '');
                      setLastName(profile?.lastName ?? '');
                    }
                    setNameErrorMessage('');
                    setNameSuccessMessage('');
                    setEditingName((current) => !current);
                  }}
                >
                  <Text style={localStyles.editButtonText}>
                    {editingName ? 'Close' : 'Edit'}
                  </Text>
                </TouchableOpacity>
              </View>

              <ResponsiveNameRow
                firstName={profile?.firstName || '-'}
                lastName={profile?.lastName || '-'}
                editing={editingName}
                editableFirstName={firstName}
                editableLastName={lastName}
                onChangeFirstName={setFirstName}
                onChangeLastName={setLastName}
              />

              {nameErrorMessage ? <AuthMessage message={nameErrorMessage} tone="error" /> : null}
              {nameSuccessMessage ? <AuthMessage message={nameSuccessMessage} tone="success" /> : null}

              {editingName ? (
                <View style={localStyles.editPanel}>
                  <TouchableOpacity
                    style={[styles.actionButton, localStyles.sectionButton]}
                    onPress={() => {
                      void handleSaveName();
                    }}
                    disabled={savingName}
                  >
                    {savingName ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.actionButtonText}>Save Name</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : null}

              <AccountRow label="Email" value={profile?.email || '-'} />
              <AccountRow label="Role" value={profile?.role || 'User'} />

              <View
                style={editingPassword ? [styles.card, localStyles.passwordCard] : [styles.listItem, localStyles.passwordSummaryCard]}
                onLayout={(event) => {
                  setPasswordCardTop(event.nativeEvent.layout.y);
                }}
              >
                <View style={editingPassword ? localStyles.sectionHeaderRow : localStyles.summaryHeaderRow}>
                  <View style={localStyles.passwordSummaryContent}>
                    <Text
                      style={editingPassword ? [styles.sectionTitle, localStyles.headerTitle] : styles.mutedLabel}
                    >
                      {editingPassword ? 'Change Password' : 'Password'}
                    </Text>
                    {!editingPassword ? <Text style={styles.menuTitle}>**********</Text> : null}
                  </View>
                  <TouchableOpacity
                    style={localStyles.editButton}
                    onPress={() => {
                      if (editingPassword) {
                        setCurrentPassword('');
                        setNewPassword('');
                        setConfirmPassword('');
                        setShowCurrentPassword(false);
                        setShowNewPassword(false);
                        setShowConfirmPassword(false);
                        setDeleteErrorMessage('');
                      }
                      setPasswordErrorMessage('');
                      setPasswordSuccessMessage('');
                      setEditingPassword((current) => !current);
                    }}
                  >
                    <Text style={localStyles.editButtonText}>
                      {editingPassword ? 'Close' : 'Edit'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {editingPassword ? (
                  <>
                  {passwordErrorMessage ? <AuthMessage message={passwordErrorMessage} tone="error" /> : null}
                  {passwordSuccessMessage ? <AuthMessage message={passwordSuccessMessage} tone="success" /> : null}
                  <Text style={localStyles.passwordHint}>
                    Min 8 chars, 1 uppercase, 1 number
                  </Text>

                  <PasswordField
                    label="Current Password"
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                    placeholder="Enter your current password"
                    visible={showCurrentPassword}
                    onToggleVisibility={() => setShowCurrentPassword((current) => !current)}
                    onFocus={scrollToPasswordCard}
                  />

                  <PasswordField
                    label="New Password"
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Enter your new password"
                    visible={showNewPassword}
                    onToggleVisibility={() => setShowNewPassword((current) => !current)}
                    onFocus={scrollToPasswordCard}
                  />

                  <PasswordField
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm your new password"
                    visible={showConfirmPassword}
                    onToggleVisibility={() => setShowConfirmPassword((current) => !current)}
                    onFocus={scrollToPasswordCard}
                  />

                  <TouchableOpacity
                    style={[styles.actionButton, localStyles.sectionButton]}
                    onPress={() => {
                      void handleSavePassword();
                    }}
                    disabled={savingPassword}
                  >
                    {savingPassword ? (
                      <ActivityIndicator color={colors.white} />
                    ) : (
                      <Text style={styles.actionButtonText}>Update Password</Text>
                    )}
                  </TouchableOpacity>
                  </>
                ) : null}
              </View>

              {!editingPassword && passwordSuccessMessage ? (
                <AuthMessage message={passwordSuccessMessage} tone="success" />
              ) : null}

              <View style={[styles.card, localStyles.dangerSectionCard]}>
                <Text style={localStyles.dangerTitle}>Delete Account</Text>
                <Text style={localStyles.dangerBody}>
                  Permanently delete your account and profile data. This action cannot be undone.
                </Text>

                {deleteErrorMessage ? (
                  <AuthMessage message={deleteErrorMessage} tone="error" />
                ) : null}

                <TouchableOpacity
                  style={localStyles.deleteButton}
                  onPress={() => {
                    Alert.alert(
                      'Delete Account',
                      'This permanently deletes your account and cannot be undone. Are you sure you want to continue?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: () => {
                            void handleDeleteAccount();
                          },
                        },
                      ]
                    );
                  }}
                  disabled={deletingAccount}
                >
                  {deletingAccount ? (
                    <ActivityIndicator color={colors.dangerText} />
                  ) : (
                    <Text style={localStyles.deleteButtonText}>Delete Account</Text>
                  )}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={[styles.actionButton, styles.backButtonContainer]}
          onPress={() => router.back()}
        >
          <Text style={styles.actionButtonText}>Back to Dashboard</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const localStyles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  editButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  editButtonText: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.primary,
  },
  editPanel: {
    marginBottom: 12,
  },
  dangerBody: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.regular,
    color: colors.secondary,
    marginBottom: 12,
  },
  dangerSectionCard: {
    marginBottom: 6,
  },
  dangerTitle: {
    fontSize: 14,
    fontFamily: fonts.bold,
    color: colors.dangerText,
    marginBottom: 6,
  },
  deleteButton: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: colors.dangerText,
    fontFamily: fonts.bold,
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: colors.dangerBackground,
    borderWidth: 1,
    borderColor: colors.dangerBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: colors.dangerText,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  fieldLabel: {
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.text,
    marginBottom: 6,
    marginTop: 2,
  },
  headerTitle: {
    marginBottom: 0,
  },
  input: {
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    color: colors.text,
    marginBottom: 14,
    fontFamily: fonts.regular,
  },
  inlineNameInput: {
    paddingTop: 10,
    paddingBottom: 2,
    color: colors.text,
    fontFamily: fonts.bold,
    fontSize: 17,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 12,
  },
  nameRowItem: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 160,
    minWidth: '47%',
    marginBottom: 0,
  },
  successBox: {
    backgroundColor: colors.successBackground,
    borderWidth: 1,
    borderColor: colors.successBorder,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  successText: {
    color: colors.successText,
    fontSize: 13,
    fontFamily: fonts.regular,
  },
  passwordCard: {
    marginBottom: 6,
  },
  passwordSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  passwordSummaryContent: {
    flex: 1,
    minWidth: 0,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.subtleBackground,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  passwordHint: {
    fontSize: 11,
    color: colors.secondary,
    marginBottom: 10,
    fontFamily: fonts.regular,
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 14,
    paddingRight: 12,
    color: colors.text,
    fontFamily: fonts.regular,
  },
  passwordToggleText: {
    fontSize: 18,
    padding: 4,
  },
  sectionButton: {
    marginTop: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
});
