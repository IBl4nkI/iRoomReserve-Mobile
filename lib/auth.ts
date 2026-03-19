import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendEmailVerification,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithCredential,
} from "firebase/auth";
import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  serverTimestamp,
  onSnapshot,
  Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "./firebase";

WebBrowser.maybeCompleteAuthSession();

const ALLOWED_DOMAIN = "sdca.edu.ph";
const SUPERADMIN_EMAIL = "johncyrus.agoncillo@sdca.edu.ph";

export function isAllowedEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`);
}

export function useGoogleSignIn() {
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });

  return { request, response, promptAsync };
}

export async function handleGoogleSignInResponse(response: any) {
  if (response?.type === "success") {
    const { id_token } = response.params;
    const credential = GoogleAuthProvider.credential(id_token);
    const result = await signInWithCredential(auth, credential);

    if (!result.user.email || !isAllowedEmail(result.user.email)) {
      await signOut(auth);
      throw { code: "auth/unauthorized-domain" };
    }

    const { uid, displayName, email } = result.user;
    const nameParts = (displayName ?? "").split(" ");
    const existingProfile = await getUserProfile(uid);
    const finalRole = existingProfile?.role || "Student";
    const status = existingProfile?.status || "approved";

    await saveUserProfile(uid, {
      firstName: nameParts[0] || "",
      lastName: nameParts.slice(1).join(" ") || "",
      email: email || "",
      role: finalRole,
      status,
    });

    if (finalRole === "Faculty" || finalRole === "Administrator" || finalRole === "Utility Staff") {
      if (status === "pending") {
        await signOut(auth);
        throw { code: "auth/account-pending" };
      }
      if (status === "rejected") {
        await signOut(auth);
        throw { code: "auth/account-rejected" };
      }
    }

    return result;
  }
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
      lastName: credential.user.displayName?.split(" ").slice(1).join(" ") || "Admin",
      email: credential.user.email,
      role: "Super Admin",
      status: "approved",
    });
    return credential;
  }

  const profile = await getUserProfile(credential.user.uid);
  if (profile && (profile.role === "Faculty" || profile.role === "Administrator" || profile.role === "Utility Staff")) {
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
  const actualRole = (role === "Faculty" && !isAllowedEmail(email))
    ? "Utility Staff"
    : role;

  if (actualRole !== "Utility Staff" && !isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, {
    displayName: `${firstName} ${lastName}`,
  });

  const status = actualRole === "Student" ? "approved" : "pending";

  await saveUserProfile(credential.user.uid, { firstName, lastName, email, role: actualRole, status });

  await sendEmailVerification(credential.user);

  await signOut(auth);

  return { credential, actualRole };
}

export async function getUserProfile(uid: string) {
  const snap = await getDoc(doc(db, "users", uid));
  if (snap.exists()) {
    return snap.data() as {
      firstName: string;
      lastName: string;
      email: string;
      role?: string;
      status?: string;
    };
  }
  return null;
}

export async function logout() {
  return signOut(auth);
}

export async function resetPassword(email: string) {
  if (!isAllowedEmail(email)) {
    throw { code: "auth/unauthorized-domain" };
  }
  await sendPasswordResetEmail(auth, email);
}

export async function saveUserProfile(
  uid: string,
  data: { firstName: string; lastName: string; email: string; role?: string; status?: string }
) {
  await setDoc(
    doc(db, "users", uid),
    {
      ...data,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function getAuthErrorMessage(code: string): string {
  const safeMessages: Record<string, string> = {
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/email-not-verified": "Please verify your email before logging in.",
    "auth/account-pending": "Your account is pending approval.",
    "auth/account-rejected": "Your account has been rejected.",
    "auth/unauthorized-domain": "Please use your SDCA email address.",
  };

  return safeMessages[code] ?? "Invalid email or password.";
}