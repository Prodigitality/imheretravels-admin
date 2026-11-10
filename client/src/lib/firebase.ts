// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Local testing only: NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ("127.0.0.1:8080")
// points the browser SDK at a Firestore emulator, e.g. to try firestore.rules
// against the real app. Ignored outside `next dev`. Server code follows
// FIRESTORE_EMULATOR_HOST through firebase-admin.
const firestoreEmulatorHost = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
if (firestoreEmulatorHost && process.env.NODE_ENV === "development") {
  const [host, port] = firestoreEmulatorHost.split(":");
  try {
    connectFirestoreEmulator(db, host, Number(port));
  } catch {
    // Already connected (hot reload re-runs this module).
  }
}
export const storage = getStorage(app);

// Initialize Functions with correct regions
export const functions = getFunctions(app, "asia-southeast1");
export const functionsUsCentral = getFunctions(app, "us-central1");

// Helper functions for migration scripts (with different names to avoid conflicts)
export const getDbInstance = () => db;
export const getAuthInstance = () => auth;
export const getStorageInstance = () => storage;

// export const analytics = getAnalytics(app);
