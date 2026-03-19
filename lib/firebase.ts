import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyAloRS-cQZ0jJvN3JrA3m_5Wm4xXrMwYFE",
  authDomain: "iroomreserve.firebaseapp.com",
  projectId: "iroomreserve",
  storageBucket: "iroomreserve.firebasestorage.app",
  messagingSenderId: "735804203844",
  appId: "1:735804203844:web:b166e2f182e29d367b6d11",
  measurementId: "G-6PQBSMRE8L",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];

const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);

export { app, auth, db, rtdb };