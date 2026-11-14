import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  createTripShareLink,
  endTrip,
  revokeTripShareLinks,
} from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import OfflineBanner from '@/components/OfflineBanner';
import SafetyMapView from '@/components/SafetyMapView';
import SOSButton from '@/components/SOSButton';
import StatusChip from '@/components/StatusChip';
import Colors, { Palette } from '@/constants/colors';
import { FEATURES } from '@/constants/features';
import { useTripContext } from '@/context/TripContext';
import { useRiskState } from '@/services/risk';
import { getLatestLocation, useTrackingStatus } from '@/services/tracking';
import { watchLiveLocation, type LocationFix } from '@/services/location.service';
import { t, useLanguage } from '@/i18n';

export default function LiveTripScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const {
    activeTrip,
    routePoints,
    shareUrl,
    setShareUrl,
    stopProtectedTrip,
    triggerSosFlow,
  } = useTripContext();

  const tracking = useTrackingStatus();
  const risk = useRiskState();
  const [busy, setBusy] = useState(false);

  // Live Location stream for real-time map movement
  const [liveLocation, setLiveLocation] = useState<LocationFix | null>(null);

  // Automated Periodic Timed Safety Check-In (every 3 minutes)
  const CHECKIN_INTERVAL_SEC = 180;
  const [secondsUntilCheckIn, setSecondsUntilCheckIn] = useState(CHECKIN_INTERVAL_SEC);
  const [checkInModalVisible, setCheckInModalVisible] = useState(false);
  const [checkInCountdown, setCheckInCountdown] = useState(30);

  // 1. Continuous live GPS stream for real-time movement on map
  useEffect(() => {
    const unsub = watchLiveLocation((fix) => {
      setLiveLocation(fix);
    }, 1500);
    return unsub;
  }, []);

  // 2. Automated periodic timed safety check-in countdown
  useEffect(() => {
    if (checkInModalVisible) return;

    const timer = setInterval(() => {
      setSecondsUntilCheckIn((prev) => {
        if (prev <= 1) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
          setCheckInModalVisible(true);
          setCheckInCountdown(30);
          return CHECKIN_INTERVAL_SEC;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [checkInModalVisible]);

  // 3. Safety Check-In Alert Modal Countdown (30s window to confirm "I AM SAFE")
  useEffect(() => {
    if (!checkInModalVisible) return;

    const timer = setInterval(() => {
      setCheckInCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setCheckInModalVisible(false);
          // Auto-escalate to SOS if user does not respond within countdown!
          void handleSos();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [checkInModalVisible]);

  const handleConfirmSafe = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setCheckInModalVisible(false);
    setSecondsUntilCheckIn(CHECKIN_INTERVAL_SEC);
  };

  const latest = getLatestLocation();
  const activeUserCoord = liveLocation
    ? { lat: liveLocation.lat, lng: liveLocation.lng, accuracy: liveLocation.accuracy, ts: liveLocation.timestamp }
    : (latest ? { lat: latest.lat, lng: latest.lng, accuracy: latest.acc, ts: latest.ts } : null);

  const center = activeUserCoord
    ? { lat: activeUserCoord.lat, lng: activeUserCoord.lng }
    : routePoints[0] ?? { lat: 28.6139, lng: 77.209 };

  const chipStatus = !tracking.online
    ? 'signal_lost'
    : risk.level;

  const handleShare = async () => {
    if (!activeTrip) return;
    setBusy(true);
    try {
      const res = await createTripShareLink(activeTrip.id, {});
      setShareUrl(res.url);
      await Share.share({
        message: `Track my SafarSaathi journey live: ${res.url}`,
      });
    } catch {
      // Demo share link fallback
      const fallback = `https://safarsaathi.in/t/${activeTrip.id.slice(0, 8)}`;
      setShareUrl(fallback);
      await Share.share({ message: `Track my SafarSaathi journey live: ${fallback}` }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!activeTrip) return;
    setBusy(true);
    try {
      await revokeTripShareLinks(activeTrip.id);
      setShareUrl(null);
    } catch {
      setShareUrl(null);
    } finally {
      setBusy(false);
    }
  };

  const handleEndTrip = async () => {
    setBusy(true);
    try {
      if (activeTrip) {
        await endTrip(activeTrip.id).catch(() => undefined);
      }
      await stopProtectedTrip();
      router.replace('/');
    } finally {
      setBusy(false);
    }
  };

  const handleSos = async () => {
    const sosId = await triggerSosFlow('button');
    router.push({ pathname: '/sos', params: { sosId } });
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <BrandHeader 
        showBack 
        subtitle={t('trip.liveJourney')}
        rightElement={<StatusChip status={chipStatus} score={risk.score} />} 
      />

      <View style={styles.bannerWrap}>
        <OfflineBanner />
      </View>

      {/* Map View with Continuous Live GPS Movement */}
      <View style={styles.mapContainer}>
        <SafetyMapView
          center={center}
          userLocation={activeUserCoord}
          routePoints={routePoints}
          destination={
            activeTrip
              ? { lat: activeTrip.destLat, lng: activeTrip.destLng }
              : null
          }
          style={{ height: '100%' }}
        />
      </View>

      {/* Bottom Control Panel */}
      <View style={styles.controlPanel}>
        {/* Automated Timed Safety Check-In Bar */}
        <View style={styles.checkInRow}>
          <View style={styles.checkInInfo}>
            <Feather name="clock" size={15} color={Palette.warningAmber} />
            <Text style={styles.checkInLabel}>
              Safety Check-In in{' '}
              <Text style={styles.checkInTime}>
                {Math.floor(secondsUntilCheckIn / 60)}:{(secondsUntilCheckIn % 60).toString().padStart(2, '0')}
              </Text>
            </Text>
          </View>
          <TouchableOpacity
            style={styles.checkInQuickBtn}
            onPress={handleConfirmSafe}
            activeOpacity={0.8}
          >
            <Feather name="check" size={14} color="#FFFFFF" />
            <Text style={styles.checkInQuickText}>I'm Safe</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.destTitle} numberOfLines={1}>
          {activeTrip?.destination ?? t('trip.protectedTrip')}
        </Text>
        <Text style={styles.metaText}>
          {tracking.online ? '● Cloud Sync Active' : '⚡ BLE Mesh Relay Active'} ·{' '}
          {t('trip.gpsFixes')}: {tracking.pendingPoints} {t('trip.pending')} ·{' '}
          {tracking.lastFixAt
            ? `${t('trip.fixUpdated')} ${Math.max(0, Math.round((Date.now() - tracking.lastFixAt) / 1000))}s ago`
            : t('trip.acquiring')}
        </Text>

        {shareUrl && (
          <Text style={styles.shareActiveText} numberOfLines={1}>
            {t('trip.liveSharing')} {shareUrl}
          </Text>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={() => void (shareUrl ? handleRevoke() : handleShare())}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Feather name={shareUrl ? 'eye-off' : 'share-2'} size={18} color={Palette.primaryText} />
            <Text style={styles.shareBtnText}>{shareUrl ? t('trip.stopSharing') : t('trip.shareLive')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.endTripBtn}
            onPress={() => void handleEndTrip()}
            disabled={busy}
            activeOpacity={0.8}
          >
            <Text style={styles.endTripText}>{t('trip.endSafe')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sosRow}>
          <SOSButton onTrigger={() => void handleSos()} size={88} />
          {FEATURES.demo && (
            <TouchableOpacity
              style={styles.demoPromptBtn}
              onPress={() => router.push('/prompt')}
              activeOpacity={0.8}
            >
              <Text style={styles.demoPromptText}>{t('trip.testPrompt')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* High-Priority Safety Check-In Modal */}
      {checkInModalVisible && (
        <View style={styles.modalBackdrop}>
          <View style={styles.checkInModalCard}>
            <View style={styles.warningIconCircle}>
              <Feather name="alert-triangle" size={32} color="#EF4444" />
            </View>
            <Text style={styles.checkInModalTitle}>Safety Check-In</Text>
            <Text style={styles.checkInModalSubtitle}>
              Periodic safety check-in required. Confirm you are safe or emergency guardians will be alerted with your live location.
            </Text>
            <View style={styles.countdownBox}>
              <Text style={styles.countdownSeconds}>{checkInCountdown}s</Text>
              <Text style={styles.countdownLabel}>Auto-SOS in</Text>
            </View>
            <TouchableOpacity
              style={styles.confirmSafeBtn}
              onPress={handleConfirmSafe}
              activeOpacity={0.85}
            >
              <Feather name="check-circle" size={20} color="#FFFFFF" />
              <Text style={styles.confirmSafeBtnText}>I AM SAFE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <BottomNav activeTab="trip" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
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
  bannerWrap: {
    paddingHorizontal: 20,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: 16,
    borderRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Palette.borders,
  },
  mapWatermark: {
    position: 'absolute',
    bottom: 8,
    left: 12,
    backgroundColor: 'rgba(6, 8, 15, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  watermarkText: {
    fontSize: 10,
    fontWeight: '500',
    color: Palette.secondaryText,
  },
  controlPanel: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    margin: 16,
    padding: 18,
  },
  checkInRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(232, 155, 21, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(232, 155, 21, 0.3)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  checkInInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkInLabel: {
    fontSize: 12,
    color: Palette.secondaryText,
    fontWeight: '500',
  },
  checkInTime: {
    fontWeight: '800',
    color: Palette.warningAmber,
  },
  checkInQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  checkInQuickText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 9999,
  },
  checkInModalCard: {
    width: '100%',
    backgroundColor: '#161B2F',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.6)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 12,
  },
  warningIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  checkInModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.primaryText,
    marginBottom: 8,
    textAlign: 'center',
  },
  checkInModalSubtitle: {
    fontSize: 13,
    color: Palette.secondaryText,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  countdownBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 28,
    marginBottom: 20,
  },
  countdownSeconds: {
    fontSize: 36,
    fontWeight: '900',
    color: '#EF4444',
  },
  countdownLabel: {
    fontSize: 11,
    color: Palette.mutedText,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  confirmSafeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: Palette.successGreen,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: Palette.successGreen,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  confirmSafeBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  destTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  metaText: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 4,
    fontWeight: '500',
  },
  shareActiveText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.successGreen,
    marginTop: 6,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  shareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingVertical: 14,
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  endTripBtn: {
    flex: 1,
    backgroundColor: 'rgba(0, 184, 135, 0.18)',
    borderWidth: 1,
    borderColor: Palette.successGreen,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endTripText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.successGreen,
  },
  sosRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Palette.borders,
  },
  demoPromptBtn: {
    backgroundColor: 'rgba(232, 155, 21, 0.15)',
    borderWidth: 1,
    borderColor: Palette.warningAmber,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  demoPromptText: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.warningAmber,
  },
});
