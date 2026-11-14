import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRegisterRide } from '@workspace/api-client-react';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { getCurrentLocation, type LocationFix } from '@/services/location.service';
import { t, useLanguage } from '@/i18n';

const PROVIDERS = ['Uber', 'Ola', 'Rapido', 'Auto / Taxi', 'Private Vehicle'];

export default function RideVerificationScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { activeTrip, triggerSosFlow } = useTripContext();
  const registerRideMutation = useRegisterRide();

  const [plate, setPlate] = useState('');
  const [driverName, setDriverName] = useState('');
  const [provider, setProvider] = useState('Uber');
  const [registeredPlate, setRegisteredPlate] = useState<string | null>(null);
  const [verifiedMatch, setVerifiedMatch] = useState<boolean | null>(null);
  const [currentCoord, setCurrentCoord] = useState<{ lat: number; lng: number }>({
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

  const handleRegister = async () => {
    const clean = plate.trim().toUpperCase();
    if (clean.length < 2) return;
    try {
      await registerRideMutation.mutateAsync({
        data: {
          plate: clean,
          ...(driverName.trim() ? { driverName: driverName.trim() } : {}),
          ...(activeTrip?.id ? { tripId: activeTrip.id } : {}),
        },
      });
    } catch {
      // Offline/demo continuity
    }
    setRegisteredPlate(clean);
  };

  const handleMismatch = async () => {
    const sosId = await triggerSosFlow('button');
    router.push({ pathname: '/sos', params: { sosId } });
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Top Header */}
      <BrandHeader showBack subtitle={t('ride.header')} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('ride.title')}</Text>
          <Text style={styles.cardDesc}>{t('ride.desc')}</Text>

          {/* Ride Provider Pills */}
          <Text style={styles.inputLabel}>{t('ride.service')}</Text>
          <View style={styles.providerRow}>
            {PROVIDERS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.providerPill, provider === p && styles.providerPillActive]}
                onPress={() => setProvider(p)}
              >
                <Text style={[styles.providerText, provider === p && styles.providerTextActive]}>
                  {p}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Plate Input */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('ride.plate')}</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              value={plate}
              onChangeText={setPlate}
              autoCapitalize="characters"
              placeholder={t('ride.platePlaceholder')}
              placeholderTextColor={Palette.mutedText}
            />
          </View>

          {/* Driver Name Input */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('ride.driver')}</Text>
          <View style={styles.inputBox}>
            <TextInput
              style={styles.textInput}
              value={driverName}
              onChangeText={setDriverName}
              placeholder={t('ride.driverPlaceholder')}
              placeholderTextColor={Palette.mutedText}
            />
          </View>

          <TouchableOpacity
            style={styles.shareRideBtn}
            onPress={() => void handleRegister()}
            disabled={registerRideMutation.isPending}
            activeOpacity={0.85}
          >
            <Text style={styles.shareRideText}>{t('ride.share')}</Text>
          </TouchableOpacity>
        </View>

        {registeredPlate && (
          <View style={styles.verifyCard}>
            <View style={styles.alertIconWrap}>
              <MaterialCommunityIcons name="shield-check-outline" size={28} color={Palette.softLavender} />
            </View>
            <Text style={styles.verifyTitle}>{t('ride.verification')}</Text>
            <Text style={styles.verifyQuestion}>
              {t('ride.question')} <Text style={{ color: Palette.primaryViolet, fontWeight: '800' }}>{registeredPlate}</Text>?
            </Text>

            <View style={styles.choiceRow}>
              <TouchableOpacity
                style={styles.yesBtn}
                onPress={() => setVerifiedMatch(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.yesText}>{t('ride.yes')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.noBtn}
                onPress={() => void handleMismatch()}
                activeOpacity={0.8}
              >
                <Text style={styles.noText}>{t('ride.no')}</Text>
              </TouchableOpacity>
            </View>

            {verifiedMatch && (
              <>
                <View style={styles.confirmedBox}>
                  <Feather name="check-circle" size={18} color={Palette.successGreen} />
                  <Text style={styles.confirmedText}>
                    {t('ride.confirmed')}
                  </Text>
                </View>
                <View style={styles.rideMapCard}>
                  <SafetyMapView
                    center={currentCoord}
                    userLocation={currentCoord}
                    destination={
                      activeTrip?.destLat && activeTrip?.destLng
                        ? { lat: activeTrip.destLat, lng: activeTrip.destLng }
                        : null
                    }
                  />
                </View>
              </>
            )}
          </View>
        )}
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
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.secondaryText,
    marginTop: 6,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
    marginBottom: 8,
  },
  providerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  providerPill: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 16,
  },
  providerPillActive: {
    backgroundColor: 'rgba(99, 91, 255, 0.2)',
    borderColor: Palette.primaryViolet,
  },
  providerText: {
    fontSize: 13,
    color: Palette.secondaryText,
    fontWeight: '600',
  },
  providerTextActive: {
    color: Palette.softLavender,
    fontWeight: '700',
  },
  inputBox: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 50,
    justifyContent: 'center',
  },
  textInput: {
    color: Palette.primaryText,
    fontSize: 15,
  },
  shareRideBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  shareRideText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  verifyCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
  },
  alertIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(99, 91, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  verifyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  verifyQuestion: {
    fontSize: 14,
    color: Palette.secondaryText,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
    lineHeight: 20,
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  yesBtn: {
    flex: 1,
    backgroundColor: Palette.successGreen,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  yesText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  noBtn: {
    flex: 1,
    backgroundColor: Palette.sosRed,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  noText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  confirmedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 184, 135, 0.12)',
    borderWidth: 1,
    borderColor: Palette.successGreen,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 16,
  },
  confirmedText: {
    fontSize: 13,
    color: Palette.successGreen,
    fontWeight: '600',
    flex: 1,
  },
  rideMapCard: {
    height: 150,
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Palette.borders,
    marginTop: 14,
  },
});
