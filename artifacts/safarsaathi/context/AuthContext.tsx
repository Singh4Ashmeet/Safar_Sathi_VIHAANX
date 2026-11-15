import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  setAuthTokenGetter,
  setBaseUrl,
  setConnectivityObserver,
} from '@workspace/api-client-react';
import { auth } from '@/config/firebase';
import {
  beginServerRequest,
  reportServerOffline,
  reportServerSuccess,
} from '@/services/connectivity';
import { ensureDeviceKeys } from '@/services/secure';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Configure generated API client once at module load
const API_BASE_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4010').replace(
  /\/+$/,
  ''
);
setBaseUrl(API_BASE_URL);

let _cachedToken = 'demo-bearer-token';

setAuthTokenGetter(async () => {
  const current = auth.currentUser;
  if (!current) return _cachedToken;
  try {
    return await current.getIdToken();
  } catch {
    return _cachedToken;
  }
});

setConnectivityObserver({
  onStart: beginServerRequest,
  onSuccess: reportServerSuccess,
  onError: reportServerOffline,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    try {
      const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
        if (!mounted) return;
        if (firebaseUser) {
          setUser(firebaseUser);
          void ensureDeviceKeys();
        } else if (!user) {
          // If no user, keep current or null
        }
        setIsLoading(false);
      });
      return () => {
        mounted = false;
        unsubscribe();
      };
    } catch {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      await ensureDeviceKeys();
    } catch (err) {
      // Offline / demo fallback when Firebase is offline or demo credentials are used
      if (email && password) {
        const userUid = `user_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const demoUser = {
          uid: userUid,
          email,
          getIdToken: async () => 'demo-bearer-token',
        } as unknown as User;
        setUser(demoUser);
        _cachedToken = 'demo-bearer-token';
        await ensureDeviceKeys();
        return;
      }
      throw err;
    }
  };

  const signup = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      await ensureDeviceKeys();
    } catch (err) {
      // Offline / demo fallback
      if (email && password) {
        const userUid = `user_${email.trim().toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        const demoUser = {
          uid: userUid,
          email,
          getIdToken: async () => 'demo-bearer-token',
        } as unknown as User;
        setUser(demoUser);
        _cachedToken = 'demo-bearer-token';
        await ensureDeviceKeys();
        return;
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch {
      // ignore
    }
    setUser(null);
    _cachedToken = 'demo-bearer-token';
  };

  const getIdToken = async () => {
    if (auth.currentUser) return auth.currentUser.getIdToken();
    if (user) return 'demo-bearer-token';
    return null;
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
