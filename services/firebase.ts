import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp, getApps } from "firebase/app";
import { getAuth, initializeAuth, type Persistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
};

function createReactNativePersistence(storage: typeof AsyncStorage): Persistence {
  const availabilityKey = "firebase-auth-availability";

  return class {
    static type = "LOCAL";
    readonly type = "LOCAL";

    async _isAvailable() {
      try {
        await storage.setItem(availabilityKey, "1");
        await storage.removeItem(availabilityKey);
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return storage.setItem(key, JSON.stringify(value));
    }

    async _get<T>(key: string): Promise<T | null> {
      const value = await storage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    }

    _remove(key: string) {
      return storage.removeItem(key);
    }

    _addListener() {}

    _removeListener() {}
  } as unknown as Persistence;
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
const auth = (() => {
  try {
    return initializeAuth(app, {
      persistence: createReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(app);
  }
})();
const db = getFirestore(app);
const rtdb = getDatabase(app);

export { app, auth, db, rtdb };
