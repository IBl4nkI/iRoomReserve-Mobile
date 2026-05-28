import { Platform } from "react-native";
import {
  deleteUser,
  EmailAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  reauthenticateWithCredential,
  updateProfile,
  updatePassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import { arrayUnion, deleteDoc, doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "./firebase";
import { stopLocalPresenceMonitoring } from "@/services/presence-monitor.service";

const ALLOWED_DOMAIN = "sdca.edu.ph";
const SUPERADMIN_EMAIL = "johncyrus.agoncillo@sdca.edu.ph";
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID =
  process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ?? GOOGLE_WEB_CLIENT_ID;

let googleConfigured = false;
let googleSigninModule: any = null;
const USER_PROFILE_CACHE_TTL_MS = 60_000;

type UserProfile = {
  campus?: "digi" | "main" | null;
  campusName?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  expoPushTokens?: string[];
  role?: string;
  status?: string;
};

const userProfileCache = new Map<
  string,
  {
    expiresAt: number;
    value: UserProfile | null;
  }
>();

function sleep(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

function getGoogleSignin() {
  if (googleSigninModule) {
    return googleSigninModule;
  }

  try {
    googleSigninModule = require("@react-native-google-signin/google-signin").GoogleSignin;
    return googleSigninModule;
  } catch {
    throw { code: "auth/google-requires-dev-build" };
  }
}

function ensureGoogleConfigured() {
  if (googleConfigured || Platform.OS === "web") {
    return;
  }

  if (!GOOGLE_WEB_CLIENT_ID) {
    throw { code: "auth/google-misconfigured" };
  }

  if (Platform.OS === "android" && !GOOGLE_ANDROID_CLIENT_ID) {
    throw { code: "auth/google-misconfigured" };
  }

  const GoogleSignin = getGoogleSignin();

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    offlineAccess: true,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });

  googleConfigured = true;
}

export async function signInWithGoogle() {
  if (Platform.OS === "web") {
    throw { code: "auth/google-native-only" };
  }

  ensureGoogleConfigured();
  const GoogleSignin = getGoogleSignin();

  if (Platform.OS === "android") {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  }

  const signInResult = await GoogleSignin.signIn();
  if (signInResult.type !== "success") {
    throw { code: "auth/popup-closed-by-user" };
  }

  const idToken = signInResult.data.idToken;
  if (!idToken) {
    throw { code: "auth/missing-id-token" };
  }

  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  const userEmail = result.user.email;
  const emailAllowed = userEmail ? isAllowedEmail(userEmail) : false;
  const { uid, displayName, email } = result.user;
  const nameParts = (displayName ?? "").split(" ");
  const existingProfile = await getUserProfile(uid);

  if (!userEmail) {
    await signOut(auth);
    await GoogleSignin.signOut();
    throw { code: "auth/invalid-email" };
  }

  if (existingProfile?.role) {
    const finalRole = existingProfile.role;
    const status = existingProfile.status || "approved";

    if (!emailAllowed && finalRole !== "Utility Staff") {
      await signOut(auth);
      await GoogleSignin.signOut();
      throw { code: "auth/unauthorized-domain" };
    }

    await saveUserProfile(uid, {
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: email || "",
      role: finalRole,
      status,
    });

    if (
      finalRole === "Faculty" ||
      finalRole === "Administrator" ||
      finalRole === "Utility Staff"
    ) {
      if (status === "pending") {
        await signOut(auth);
        await GoogleSignin.signOut();
        throw { code: "auth/account-pending" };
      }
      if (status === "rejected") {
        await signOut(auth);
        await GoogleSignin.signOut();
        throw { code: "auth/account-rejected" };
      }
    }

    return result;
  }

  await saveUserProfile(uid, {
    firstName: nameParts[0] || "",
    lastName: nameParts.slice(1).join(" ") || "",
    email: email || "",
  });

  return result;
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);

  if (!credential.user.emailVerified) {
    await signOut(auth);
    throw { code: "auth/email-not-verified" };
  }

  if (credential.user.email?.toLowerCase() === SUPERADMIN_EMAIL.toLowerCase()) {
    await saveUserProfile(credential.user.uid, {
      firstName: credential.user.displayName?.split(" ")[0] || "Super",
      lastName:
        credential.user.displayName?.split(" ").slice(1).join(" ") || "Admin",
      email: credential.user.email,
      role: "Super Admin",
      status: "approved",
    });
    return credential;
  }

  const profile = await getUserProfile(credential.user.uid);
  if (
    profile &&
    (profile.role === "Faculty" ||
      profile.role === "Administrator" ||
      profile.role === "Utility Staff")
  ) {
    if (profile.status === "pending") {
      await signOut(auth);
      throw { code: "auth/account-pending" };
    }
    if (profile.status === "rejected") {
      await signOut(auth);
      throw { code: "auth/account-rejected" };
    }
  }

  return credential;
}

export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: string = "Student"
) {
  const actualRole =
    role === "Faculty" && !isAllowedEmail(email) ? "Utility Staff" : role;

  if (actualRole !== "Utility Staff" && !isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, {
    displayName: `${firstName} ${lastName}`,
  });

  const status = actualRole === "Student" ? "approved" : "pending";

  await saveUserProfile(credential.user.uid, {
    firstName,
    lastName,
    email,
    role: actualRole,
    status,
  });

  await sendEmailVerification(credential.user);
  await signOut(auth);

  return { credential, actualRole };
}

function invalidateUserProfileCache(uid?: string) {
  if (uid) {
    userProfileCache.delete(uid);
    return;
  }

  userProfileCache.clear();
}

async function getUserProfileUncached(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data() as UserProfile;
  }
  return null;
}

export async function getUserProfile(
  uid: string,
  options?: {
    forceRefresh?: boolean;
  }
) {
  if (!options?.forceRefresh) {
    const cachedProfile = userProfileCache.get(uid);
    if (cachedProfile && cachedProfile.expiresAt > Date.now()) {
      return cachedProfile.value;
    }
  }

  const profile = await getUserProfileUncached(uid);
  if (profile) {
    userProfileCache.set(uid, {
      expiresAt: Date.now() + USER_PROFILE_CACHE_TTL_MS,
      value: profile,
    });
  } else {
    userProfileCache.delete(uid);
  }
  return profile;
}

export async function getUserProfileWithRetry(
  uid: string,
  options?: {
    attempts?: number;
    delayMs?: number;
  }
) {
  const attempts = Math.max(1, options?.attempts ?? 3);
  const delayMs = Math.max(0, options?.delayMs ?? 300);

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const profile = await getUserProfile(uid);
    if (profile) {
      return profile;
    }

    if (attempt < attempts - 1) {
      await sleep(delayMs);
    }
  }

  return null;
}

export async function logout() {
  invalidateUserProfileCache(auth.currentUser?.uid);
  await stopLocalPresenceMonitoring().catch(() => {
    // Best-effort local cleanup. Sign-out should still continue.
  });

  if (Platform.OS !== "web") {
    try {
      ensureGoogleConfigured();
      const GoogleSignin = getGoogleSignin();
      await GoogleSignin.signOut();
    } catch {
      // Ignore Google session cleanup failures and still sign out from Firebase.
    }
  }

  return signOut(auth);
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email);
}

export async function saveUserProfile(
  uid: string,
  data: {
    campus?: "digi" | "main" | null;
    campusName?: string | null;
    firstName: string;
    lastName: string;
    email: string;
    role?: string;
    status?: string;
  }
) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  invalidateUserProfileCache(uid);
}

export async function updateUserProfileName(
  uid: string,
  data: {
    firstName: string;
    lastName: string;
  }
) {
  const currentUser = auth.currentUser;
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();

  await saveUserProfile(uid, {
    email: currentUser?.email ?? '',
    firstName,
    lastName,
  });

  if (currentUser) {
    await updateProfile(currentUser, {
      displayName: [firstName, lastName].filter(Boolean).join(' ').trim(),
    });
  }
}

export async function updateUserPassword(
  currentPassword: string,
  nextPassword: string
) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw { code: 'auth/not-authenticated' };
  }

  if (!currentUser.email) {
    throw { code: 'auth/missing-email' };
  }

  const credential = EmailAuthProvider.credential(
    currentUser.email,
    currentPassword
  );

  await reauthenticateWithCredential(currentUser, credential);

  await updatePassword(currentUser, nextPassword);
}

export async function deleteCurrentUserAccount() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw { code: 'auth/not-authenticated' };
  }

  await deleteDoc(doc(db, "users", currentUser.uid));
  await deleteUser(currentUser);
}

export async function saveExpoPushToken(uid: string, token: string) {
  const normalizedToken = token.trim();

  if (!normalizedToken) {
    return;
  }

  await setDoc(
    doc(db, "users", uid),
    {
      expoPushTokens: arrayUnion(normalizedToken),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function resendVerificationEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  if (!credential.user.emailVerified) {
    await sendEmailVerification(credential.user);
    await signOut(auth);
  }
}

export function getAuthErrorMessage(code: string): string {
  const safeMessages: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 8 characters and include 1 uppercase letter and 1 number.",
    "auth/requires-recent-login":
      "For security, please log in again before changing your password.",
    "auth/not-authenticated": "Please log in again and try once more.",
    "auth/missing-email": "This account is missing an email address.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential":
      "Google Sign-In failed. Please try again.",
    "auth/email-not-verified": "Please verify your email before logging in.",
    "auth/account-pending": "Your account is pending approval.",
    "auth/account-rejected": "Your account has been rejected.",
    "auth/unauthorized-domain": "Please use your SDCA email address.",
    "auth/google-native-only":
      "Google Sign-In is only available in the native development build.",
    "auth/google-requires-dev-build":
      "Google Sign-In is unavailable in Expo Go. Use the installed development build instead.",
    "auth/google-misconfigured":
      "Google Sign-In is unavailable right now. Please try again later.",
    "auth/popup-closed-by-user": "Google Sign-In was cancelled.",
    "auth/missing-id-token":
      "Google Sign-In did not return an ID token. Please try again.",
    "PLAY_SERVICES_NOT_AVAILABLE":
      "Google Play Services is required on this device.",
    "SIGN_IN_CANCELLED": "Google Sign-In was cancelled.",
    "IN_PROGRESS": "Google Sign-In is already in progress.",
    "DEVELOPER_ERROR": "Google Sign-In is unavailable right now. Please try again later.",
    "10": "Google Sign-In is unavailable right now. Please try again later.",
  };

  if (safeMessages[code]) {
    return safeMessages[code];
  }

  if (code) {
    return `Invalid email or password.`;
  }

  return "Sign-in failed.";
}
