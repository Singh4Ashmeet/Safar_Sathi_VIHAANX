import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { confirmWatchMe, startWatchMe } from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import OfflineBanner from '@/components/OfflineBanner';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { getCurrentLocation, type LocationFix } from '@/services/location.service';
import { t, useLanguage } from '@/i18n';

const PRESETS = [15, 30, 45, 60] as const;

export default function WatchMeScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { activeWatchId, setActiveWatchId } = useTripContext();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number }>({
    lat: 28.6139,
    lng: 77.209,
  });

  useEffect(() => {
    getCurrentLocation()
      .then((loc: LocationFix | null) => {
        if (loc) setCurrentCoord({ lat: loc.lat, lng: loc.lng });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!endsAt) {
      setRemainingSec(0);
      return;
    }
    const tick = () => {
      const diff = Math.max(0, Math.floor((endsAt - Date.now()) / 1000));
      setRemainingSec(diff);
      if (diff === 0) {
        // Timer expired
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt]);

  const handleStart = async (minutes: 15 | 30 | 45 | 60) => {
    setBusy(true);
    try {
      const res = await startWatchMe({ minutes });
      setActiveWatchId(res.id);
      setEndsAt(res.endsAt);
    } catch {
      setEndsAt(Date.now() + minutes * 60_000);
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmSafe = async () => {
    setBusy(true);
    try {
      if (activeWatchId) {
        await confirmWatchMe(activeWatchId).catch(() => undefined);
      }
      setActiveWatchId(null);
      setEndsAt(null);
    } finally {
      setBusy(false);
    }
  };

  const mm = String(Math.floor(remainingSec / 60)).padStart(2, '0');
  const ss = String(remainingSec % 60).padStart(2, '0');

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <BrandHeader showBack subtitle={t('watch.header')} />

      <View style={styles.content}>
        <OfflineBanner />

        {endsAt ? (
          <View style={styles.timerCard}>
            <View style={styles.clockIconWrap}>
              <Feather name="clock" size={36} color={Palette.warningAmber} />
            </View>
            <Text style={styles.timerTitle}>{t('watch.active')}</Text>
            <Text style={styles.timerDesc}>{t('watch.activeDesc')}</Text>

            <View style={styles.timerBox}>
              <Text style={styles.timerDigits}>
                {mm}:{ss}
              </Text>
            </View>

            {/* Live Location Map Preview */}
            <View style={styles.mapCard}>
              <SafetyMapView center={currentCoord} userLocation={currentCoord} />
            </View>

            <TouchableOpacity
              style={styles.confirmSafeBtn}
              onPress={() => void handleConfirmSafe()}
              disabled={busy}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmSafeText}>{t('watch.end')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.sessionCard}>
            <Text style={styles.cardTitle}>{t('watch.start')}</Text>
            <Text style={styles.cardDesc}>{t('watch.startDesc')}</Text>

            <View style={styles.presetGrid}>
              {PRESETS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={styles.presetItem}
                  onPress={() => void handleStart(m)}
                  disabled={busy}
                  activeOpacity={0.8}
                >
                  <Text style={styles.presetNumber}>{m}</Text>
                  <Text style={styles.presetLabel}>{t('watch.minutes')}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </View>

      <BottomNav activeTab="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.primaryText,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sessionCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 22,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.secondaryText,
    marginTop: 8,
    marginBottom: 20,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  presetItem: {
    width: '48%',
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 16,
    paddingVertical: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetNumber: {
    fontSize: 32,
    fontWeight: '800',
    color: Palette.warningAmber,
  },
  presetLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.secondaryText,
    marginTop: 2,
  },
  timerCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 24,
    alignItems: 'center',
  },
  clockIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(232, 155, 21, 0.15)',
    borderWidth: 1,
    borderColor: Palette.warningAmber,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  timerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  timerDesc: {
    fontSize: 13,
    color: Palette.secondaryText,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 20,
    lineHeight: 18,
  },
  timerBox: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 14,
    marginBottom: 16,
  },
  mapCard: {
    height: 140,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.borders,
    marginBottom: 20,
  },
  timerDigits: {
    fontSize: 48,
    fontWeight: '800',
    color: Palette.warningAmber,
    letterSpacing: 2,
  },
  confirmSafeBtn: {
    backgroundColor: Palette.successGreen,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmSafeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
