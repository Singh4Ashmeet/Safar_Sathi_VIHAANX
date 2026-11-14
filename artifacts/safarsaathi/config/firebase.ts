import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';

const firebaseConfig = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
    'AIzaSyBBOOIuVZRNR7yumU134Lko6gjrTjJ_W0I',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'safarsaathi-7a901.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'safarsaathi-7a901',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'safarsaathi-7a901.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '400505399239',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ??
    '1:400505399239:web:2d4e0e81a657f5f5de1be2',
};

const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

function createAuth(firebaseApp: FirebaseApp): Auth {
  const getRnPersistence = (
    firebaseAuth as unknown as {
      getReactNativePersistence?: (storage: typeof AsyncStorage) => firebaseAuth.Persistence;
    }
  ).getReactNativePersistence;

  if (typeof getRnPersistence === 'function') {
    try {
      return initializeAuth(firebaseApp, {
        persistence: getRnPersistence(AsyncStorage),
      });
    } catch {
      return getAuth(firebaseApp);
    }
  }
  return getAuth(firebaseApp);
}

export const auth: Auth = createAuth(app);
export default app;
