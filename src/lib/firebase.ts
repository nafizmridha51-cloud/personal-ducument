
import { initializeApp, getApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, Auth, signInWithEmailAndPassword, deleteUser, setPersistence, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore, Firestore, terminate } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = 
  !!import.meta.env.VITE_FIREBASE_API_KEY && 
  !!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN && 
  !!import.meta.env.VITE_FIREBASE_PROJECT_ID;

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

const getFirebaseApp = () => {
  if (!isFirebaseConfigured) {
    throw new Error("Firebase configuration is incomplete. Please check your environment variables.");
  }
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  return app;
};

export const getFirebaseAuth = () => {
  if (!auth) {
    auth = getAuth(getFirebaseApp());
    // Set persistence to local so the session is remembered across browser restarts
    setPersistence(auth, browserLocalPersistence).catch(err => {
      console.error("Error setting persistence:", err);
    });
  }
  return auth;
};

export const getFirebaseDb = () => {
  if (!db) {
    // Force long polling to avoid "WebChannelConnection transport errored" in restricted networks
    db = initializeFirestore(getFirebaseApp(), {
      experimentalForceLongPolling: true,
    });
  }
  return db;
};

export const googleProvider = new GoogleAuthProvider();
// Use 'select_account' to ensure the account selection screen appears automatically
// if the user has multiple accounts, or it will use the default session if only one.
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export const loginWithGoogle = async () => {
  try {
    const authInstance = getFirebaseAuth();
    const result = await signInWithPopup(authInstance, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google", error);
    throw error;
  }
};

export const logout = async () => {
  try {
    const authInstance = getFirebaseAuth();
    await signOut(authInstance);
  } catch (error) {
    console.error("Error signing out", error);
    throw error;
  }
};

export const getSecondaryAuthAndDb = async (email: string, pass: string) => {
  try {
    const secondaryAppName = `SecondaryApp_${Date.now()}`;
    const secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
    const secondaryAuth = getAuth(secondaryApp);
    const secondaryDb = initializeFirestore(secondaryApp, {
      experimentalForceLongPolling: true,
    });
    
    const result = await signInWithEmailAndPassword(secondaryAuth, email, pass);
    return { auth: secondaryAuth, db: secondaryDb, user: result.user, app: secondaryApp };
  } catch (error) {
    console.error("Error in secondary auth", error);
    throw error;
  }
};

export const closeSecondaryApp = async (app: FirebaseApp) => {
  try {
    const db = initializeFirestore(app, { 
      experimentalForceLongPolling: true,
    });
    await terminate(db);
    const auth = getAuth(app);
    await signOut(auth);
  } catch (error) {
    console.error("Error closing secondary app", error);
  }
};
