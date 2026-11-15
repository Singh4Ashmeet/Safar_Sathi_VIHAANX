import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  useListGuardians,
  useAddGuardian,
  useRemoveGuardian,
  type Guardian,
  type AddGuardianRequestChannelsItem,
} from '@workspace/api-client-react';
import { useAuth } from './AuthContext';

interface GuardianContextValue {
  guardians: Guardian[];
  isLoading: boolean;
  addGuardian: (data: {
    name: string;
    phoneE164: string;
    relationship?: string;
    channels?: AddGuardianRequestChannelsItem[];
  }) => Promise<Guardian>;
  removeGuardian: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

const GuardianContext = createContext<GuardianContextValue | null>(null);

export function GuardianProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.uid || (user?.email ? `user_${user.email.replace(/[^a-zA-Z0-9]/g, '_')}` : 'guest_user');
  const storageKey = `@safarsaathi_guardians_${userId}`;

  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [localLoaded, setLocalLoaded] = useState(false);

  const { data: serverGuardians, isLoading: serverLoading, refetch: serverRefetch } = useListGuardians();

  const addMutation = useAddGuardian();
  const removeMutation = useRemoveGuardian();

  // Load user-specific guardians from persistent storage on mount / user change
  useEffect(() => {
    let active = true;
    setLocalLoaded(false);

    AsyncStorage.getItem(storageKey)
      .then((stored) => {
        if (!active) return;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
              setGuardians(parsed);
            } else {
              setGuardians([]);
            }
          } catch {
            setGuardians([]);
          }
        } else {
          // Fresh account: completely empty list, no hardcoded contacts!
          setGuardians([]);
        }
        setLocalLoaded(true);
      })
      .catch(() => {
        if (active) {
          setGuardians([]);
          setLocalLoaded(true);
        }
      });

    return () => {
      active = false;
    };
  }, [storageKey]);

  // Sync server guardians when available
  useEffect(() => {
    if (serverGuardians && Array.isArray(serverGuardians) && serverGuardians.length > 0) {
      setGuardians(serverGuardians);
      AsyncStorage.setItem(storageKey, JSON.stringify(serverGuardians)).catch(() => undefined);
    }
  }, [serverGuardians, storageKey]);

  const addGuardian = useCallback(
    async (data: {
      name: string;
      phoneE164: string;
      relationship?: string;
      channels?: AddGuardianRequestChannelsItem[];
    }): Promise<Guardian> => {
      const newGuardian: Guardian = {
        id: `g_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: data.name.trim(),
        phoneE164: data.phoneE164.trim(),
        relationship: data.relationship || 'Guardian',
        channels: data.channels && data.channels.length > 0 ? data.channels : ['sms'],
        consentStatus: 'granted',
        createdAt: Date.now(),
      };

      // 1. Immediately persist to local device storage scoped to this user
      setGuardians((prev) => {
        const next = [...prev, newGuardian];
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      });

      // 2. Sync to backend API if reachable
      try {
        const res = await addMutation.mutateAsync({
          data: {
            name: newGuardian.name,
            phoneE164: newGuardian.phoneE164,
            relationship: newGuardian.relationship,
            channels: newGuardian.channels,
          },
        });
        if (res && res.guardian && res.guardian.id) {
          setGuardians((prev) => {
            const next = prev.map((g) => (g.id === newGuardian.id ? { ...g, id: res.guardian.id } : g));
            AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
            return next;
          });
        }
      } catch {
        // Offline or server unavailable: already persisted locally!
      }

      return newGuardian;
    },
    [storageKey, addMutation]
  );

  const removeGuardian = useCallback(
    async (id: string) => {
      // 1. Immediately remove from local device storage
      setGuardians((prev) => {
        const next = prev.filter((g) => g.id !== id);
        AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => undefined);
        return next;
      });

      // 2. Notify backend if online
      try {
        if (!id.startsWith('g_')) {
          await removeMutation.mutateAsync({ id });
        }
      } catch {
        // Ignore server error when offline
      }
    },
    [storageKey, removeMutation]
  );

  const refetch = useCallback(async () => {
    try {
      const res = await serverRefetch();
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setGuardians(res.data);
        await AsyncStorage.setItem(storageKey, JSON.stringify(res.data));
      }
    } catch {
      // Offline fallback
    }
  }, [serverRefetch, storageKey]);

  return (
    <GuardianContext.Provider
      value={{
        guardians,
        isLoading: !localLoaded || (serverLoading && guardians.length === 0),
        addGuardian,
        removeGuardian,
        refetch,
      }}
    >
      {children}
    </GuardianContext.Provider>
  );
}

export function useGuardians() {
  const context = useContext(GuardianContext);
  if (!context) {
    throw new Error('useGuardians must be used within a GuardianProvider');
  }
  return context;
}
