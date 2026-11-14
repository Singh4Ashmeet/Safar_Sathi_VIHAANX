import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useListGuardians } from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import DeliveryRow from '@/components/DeliveryRow';
import OfflineBanner from '@/components/OfflineBanner';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';
import { getCurrentLocation, type LocationFix } from '@/services/location.service';
import { openDeviceSmsFallback, useSosStatus } from '@/services/sos';

export default function SosActiveScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sosId?: string }>();
  const { activeSosId, discreetMode, activeRide } = useTripContext();
  const { user } = useAuth();
  const sosId = params.sosId ?? activeSosId ?? '';

  const sosState = useSosStatus(sosId);
  const { data: guardians } = useListGuardians();
  const [currentCoord, setCurrentCoord] = React.useState<{ lat: number; lng: number }>({
    lat: 28.6139,
    lng: 77.209,
  });

  React.useEffect(() => {
    getCurrentLocation()
      .then((loc: LocationFix | null) => {
        if (loc) setCurrentCoord({ lat: loc.lat, lng: loc.lng });
      })
      .catch(() => undefined);
  }, []);

  const guardianPhones = (guardians ?? []).map((g) => g.phoneE164);

  const handleCallGuardian = () => {
    if (guardianPhones.length > 0) {
      void Linking.openURL(`tel:${guardianPhones[0]}`);
    }
  };

  const handleCall112 = () => {
    void Linking.openURL('tel:112');
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      <BrandHeader showBack subtitle={t('sos.activeTitle')} rightBadgeText={t('sos.activeTitle')} isReady={false} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.alertHeaderRow}>
            <View style={styles.alertIconPulse}>
              <Feather name="alert-triangle" size={24} color="#FFFFFF" />
            </View>
            <View>
              <Text style={styles.title}>
                {discreetMode ? 'Discreet Alert Active' : 'EMERGENCY SOS ACTIVE'}
              </Text>
              <Text style={styles.subTitle}>
                Alert broadcasts dispatched to guardians
              </Text>
            </View>
          </View>

          {discreetMode && (
            <TouchableOpacity
              style={styles.quickExit}
              onPress={() => router.replace('/calculator')}
            >
              <Text style={styles.quickExitText}>{t('sos.quickExit')}</Text>
            </TouchableOpacity>
          )}
        </View>

        <OfflineBanner />

        {sosState.status === 'sending' && (
          <View style={styles.sendingBox}>
            <Text style={styles.sendingText}>{t('sos.notDelivered')}</Text>
            <TouchableOpacity
              style={styles.smsFallbackBtn}
              onPress={() =>
                void openDeviceSmsFallback(
                  guardianPhones,
                  user?.email?.split('@')[0] ?? 'SafarSaathi User',
                  undefined,
                  activeRide
                )
              }
            >
              <Text style={styles.smsFallbackText}>{t('sos.smsFallbackCta')}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Live Distress Map Beacon */}
        <View style={styles.sosMapWrap}>
          <SafetyMapView
            center={currentCoord}
            userLocation={currentCoord}
            sosState={{
              active: true,
              lat: currentCoord.lat,
              lng: currentCoord.lng,
              source: sosState.viaRelay ? 'BLE Mesh Relay' : 'Direct GPS',
              ts: Date.now(),
            }}
            style={{ height: 220 }}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>
            Live Status: {sosState.status.toUpperCase()}
            {sosState.viaRelay ? ' · via BLE Mesh Relay' : ''}
          </Text>

          {sosState.deliveries.length > 0 ? (
            sosState.deliveries.map((d, idx) => {
              const g = (guardians ?? []).find((item) => item.id === d.guardianId);
              return (
                <DeliveryRow
                  key={`${d.guardianId}-${d.channel}-${idx}`}
                  guardianName={g?.name ?? 'Guardian'}
                  channel={d.channel}
                  status={d.status}
                  onCallGuardian={handleCallGuardian}
                  onCall112={handleCall112}
                />
              );
            })
          ) : (
            <View style={styles.demoDeliveryBox}>
              <View style={styles.demoRow}>
                <Text style={styles.demoGuardian}>Mom (SMS · Push)</Text>
                <Text style={styles.demoStatus}>DISPATCHED</Text>
              </View>
              <View style={styles.demoRow}>
                <Text style={styles.demoGuardian}>Aanya (SMS · Telegram)</Text>
                <Text style={styles.demoStatus}>DELIVERED</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.call112Btn}
            onPress={handleCall112}
            activeOpacity={0.85}
          >
            <Feather name="phone-call" size={20} color="#FFFFFF" />
            <Text style={styles.call112Text}>Direct Call 112 Police</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => router.push({ pathname: '/pin', params: { sosId } })}
            activeOpacity={0.85}
          >
            <Text style={styles.cancelBtnText}>Deactivate With Safety PIN</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <BottomNav activeTab="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  alertIconPulse: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Palette.sosRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.sosRed,
    letterSpacing: 0.5,
  },
  subTitle: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  quickExit: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
  },
  quickExitText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  sendingBox: {
    backgroundColor: 'rgba(232, 155, 21, 0.12)',
    borderWidth: 1,
    borderColor: Palette.warningAmber,
    borderRadius: 16,
    padding: 16,
  },
  sosMapWrap: {
    height: 220,
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  sendingText: {
    fontSize: 14,
    color: Palette.warningAmber,
    fontWeight: '600',
  },
  smsFallbackBtn: {
    backgroundColor: Palette.sosRed,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  smsFallbackText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  card: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 14,
  },
  demoDeliveryBox: {
    gap: 12,
  },
  demoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Palette.borders,
  },
  demoGuardian: {
    fontSize: 15,
    fontWeight: '600',
    color: Palette.primaryText,
  },
  demoStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.successGreen,
  },
  actions: {
    gap: 12,
    marginTop: 6,
  },
  call112Btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Palette.deepSosRed,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: Palette.deepSosRed,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  call112Text: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  cancelBtn: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: Palette.primaryText,
    fontSize: 15,
    fontWeight: '700',
  },
});
