import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Alert, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { confirmWatchMe, startWatchMe, createTripShareLink } from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import OfflineBanner from '@/components/OfflineBanner';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { useGuardians } from '@/context/GuardianContext';
import { getCurrentLocation, type LocationFix } from '@/services/location.service';
import { getLatestLocation } from '@/services/tracking';
import { t, useLanguage } from '@/i18n';

const PRESETS = [15, 30, 45, 60] as const;

export default function WatchMeScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { activeWatchId, setActiveWatchId } = useTripContext();
  const { guardians } = useGuardians();
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [remainingSec, setRemainingSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
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
      setShareUrl(null);
    } finally {
      setBusy(false);
    }
  };

  const handleShareLocation = async () => {
    setBusy(true);
    try {
      // Get a live location link
      const loc = getLatestLocation() ?? currentCoord;
      const mapLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;

      // Try to create a proper tracking share link if we have a watchId
      let trackUrl = mapLink;
      if (activeWatchId) {
        try {
          const res = await createTripShareLink(activeWatchId);
          if (res && res.url) trackUrl = res.url;
        } catch {
          // Fall back to google maps link
        }
      }

      setShareUrl(trackUrl);

      const guardianNames = guardians.length > 0
        ? guardians.map((g) => g.name).join(', ')
        : 'your guardians';
      const mmLeft = String(Math.floor(remainingSec / 60)).padStart(2, '0');
      const ssLeft = String(remainingSec % 60).padStart(2, '0');

      await Share.share({
        title: 'SafarSaathi – Watch Me Session Active',
        message:
          `I am sharing my live location via SafarSaathi Watch Me session.\n` +
          `Time remaining: ${mmLeft}:${ssLeft}\n` +
          `My live location: ${trackUrl}\n\n` +
          `If I don't check in, please contact me or call 112 for emergency.\n\n` +
          `Shared with: ${guardianNames}`,
        url: trackUrl,
      });
    } catch (err) {
      if (err instanceof Error && err.message !== 'User did not share') {
        Alert.alert('Share Error', 'Could not open share sheet. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSendSmsToGuardians = () => {
    const loc = getLatestLocation() ?? currentCoord;
    const mapLink = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
    const mmLeft = String(Math.floor(remainingSec / 60)).padStart(2, '0');
    const ssLeft = String(remainingSec % 60).padStart(2, '0');

    if (guardians.length === 0) {
      Alert.alert(
        'No Guardians',
        'You have not added any guardian contacts. Add them in the Guardians screen.',
        [
          { text: 'Add Guardians', onPress: () => router.push('/guardians') },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
      return;
    }

    const phone = guardians[0]?.phoneE164 ?? '';
    const body = encodeURIComponent(
      `SafarSaathi Watch Me Alert: I started a timed check-in session. Time remaining: ${mmLeft}:${ssLeft}. My location: ${mapLink}. If I don't check in, please verify I am safe or call 112.`
    );
    const smsUrl = `sms:${phone}?body=${body}`;
    import('react-native').then(({ Linking }) => {
      Linking.openURL(smsUrl).catch(() => {
        Alert.alert('SMS Failed', 'Could not open SMS app. Please send the location manually.');
      });
    });
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

            {/* Share Live Location — PROMINENT */}
            <View style={styles.shareActionsRow}>
              <TouchableOpacity
                style={styles.shareLivBtn}
                onPress={() => void handleShareLocation()}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Feather name="share-2" size={18} color="#FFFFFF" />
                <Text style={styles.shareLivText}>Share Live Location</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.smsGuardiansBtn}
                onPress={handleSendSmsToGuardians}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Feather name="message-square" size={18} color={Palette.primaryText} />
                <Text style={styles.smsGuardiansText}>SMS Guardians</Text>
              </TouchableOpacity>
            </View>

            {shareUrl && (
              <Text style={styles.shareActiveText} numberOfLines={1}>
                📡 Sharing active: {shareUrl}
              </Text>
            )}

            {guardians.length > 0 && (
              <View style={styles.guardianPreview}>
                <Feather name="shield" size={14} color={Palette.successGreen} />
                <Text style={styles.guardianPreviewText}>
                  Alerting: {guardians.map((g) => g.name).join(', ')}
                </Text>
              </View>
            )}

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

            {guardians.length === 0 && (
              <TouchableOpacity
                style={styles.addGuardiansBanner}
                onPress={() => router.push('/guardians')}
                activeOpacity={0.8}
              >
                <Feather name="user-plus" size={16} color={Palette.warningAmber} />
                <Text style={styles.addGuardiansText}>
                  Add guardians to receive SMS alerts when you start Watch Me
                </Text>
              </TouchableOpacity>
            )}

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
    gap: 8,
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
    marginTop: 4,
    marginBottom: 16,
  },
  addGuardiansBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(232, 155, 21, 0.1)',
    borderWidth: 1,
    borderColor: Palette.warningAmber,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  addGuardiansText: {
    flex: 1,
    fontSize: 13,
    color: Palette.warningAmber,
    fontWeight: '600',
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
    gap: 10,
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
    lineHeight: 18,
  },
  timerBox: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  timerDigits: {
    fontSize: 48,
    fontWeight: '800',
    color: Palette.warningAmber,
    letterSpacing: 2,
  },
  mapCard: {
    height: 140,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.borders,
  },
  shareActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  shareLivBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Palette.primaryViolet,
    paddingVertical: 13,
    borderRadius: 13,
  },
  shareLivText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  smsGuardiansBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 13,
  },
  smsGuardiansText: {
    color: Palette.primaryText,
    fontWeight: '600',
    fontSize: 14,
  },
  shareActiveText: {
    fontSize: 11,
    color: Palette.successGreen,
    fontWeight: '500',
    textAlign: 'center',
    width: '100%',
  },
  guardianPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(39, 174, 96, 0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(39, 174, 96, 0.25)',
    width: '100%',
  },
  guardianPreviewText: {
    flex: 1,
    fontSize: 12,
    color: Palette.successGreen,
    fontWeight: '600',
  },
  confirmSafeBtn: {
    backgroundColor: Palette.successGreen,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  confirmSafeText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
