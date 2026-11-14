import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
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
import { useConnectivityMode } from '@/services/connectivity';
import { useRelayStatus } from '@/services/relay';
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
  const relay = useRelayStatus();
  const { isInternetOnline } = useConnectivityMode();
  const [busy, setBusy] = useState(false);

  // Live Location stream for real-time map movement
  const [liveLocation, setLiveLocation] = useState<LocationFix | null>(null);

  // 1. Continuous live GPS stream for real-time movement on map
  useEffect(() => {
    const unsub = watchLiveLocation((fix) => {
      setLiveLocation(fix);
    }, 1500);
    return unsub;
  }, []);

  const latest = getLatestLocation();
  const activeUserCoord = liveLocation
    ? { lat: liveLocation.lat, lng: liveLocation.lng, accuracy: liveLocation.accuracy, ts: liveLocation.timestamp }
    : (latest ? { lat: latest.lat, lng: latest.lng, accuracy: latest.acc, ts: latest.ts } : null);

  const center = activeUserCoord
    ? { lat: activeUserCoord.lat, lng: activeUserCoord.lng }
    : routePoints[0] ?? { lat: 28.6139, lng: 77.209 };

  const chipStatus = !isInternetOnline && !relay.enabled
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
        <Text style={styles.destTitle} numberOfLines={1}>
          {activeTrip?.destination ?? t('trip.protectedTrip')}
        </Text>
        <Text style={styles.metaText}>
          {relay.enabled
            ? `⚡ BLE Relay Active · ${relay.peers} peer${relay.peers === 1 ? '' : 's'}`
            : isInternetOnline
              ? (tracking.online ? '● Cloud Sync Active' : `● Cloud Syncing (${tracking.pendingPoints} queued)`)
              : `⚠️ Offline Mode · ${tracking.pendingPoints} ${t('trip.pending')}`}
          {' · '}
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
