import * as Location from 'expo-location';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { createTrip } from '@workspace/api-client-react';
import { type LatLng } from '@workspace/safety-core';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import OfflineBanner from '@/components/OfflineBanner';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { searchRealPlaces, reverseGeocodeReal, type GeocodedPlace } from '@/services/geocoding.service';
import { watchLiveLocation, type LocationFix } from '@/services/location.service';
import { fetchSafeRoute } from '@/services/route.service';
import { generateUuidV4 } from '@/services/secure';
import { t, useLanguage } from '@/i18n';

export default function StartTripScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { startProtectedTrip } = useTripContext();

  const [origin, setOrigin] = useState<LatLng>({ lat: 28.6139, lng: 77.209 });
  const [startingPointText, setStartingPointText] = useState('My current location');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);

  const [selectedPlace, setSelectedPlace] = useState<GeocodedPlace | null>(null);
  const [polyline, setPolyline] = useState('');
  const [routePts, setRoutePts] = useState<LatLng[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [distanceM, setDistanceM] = useState(0);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [starting, setStarting] = useState(false);

  // Continuous real-time GPS tracking for origin
  useEffect(() => {
    const unsub = watchLiveLocation((fix: LocationFix) => {
      const pt = { lat: fix.lat, lng: fix.lng };
      setOrigin(pt);
      // Reverse geocode to get current address label if not manually changed
      if (startingPointText === 'My current location') {
        void reverseGeocodeReal(pt.lat, pt.lng).then((addr) => {
          if (addr && startingPointText === 'My current location') {
            setStartingPointText(`Current: ${addr}`);
          }
        });
      }
    });
    return unsub;
  }, []);

  // Real place search with debounce
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchRealPlaces(q, origin);
        setResults(res);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [query, origin.lat, origin.lng]);

  const handleSelectPlace = async (place: GeocodedPlace) => {
    setSelectedPlace(place);
    setResults([]);
    setQuery(place.name);

    const dest: LatLng = { lat: place.lat, lng: place.lng };
    setCalculatingRoute(true);
    try {
      const routeRes = await fetchSafeRoute(origin, dest);
      setPolyline(routeRes.polyline);
      setRoutePts(routeRes.routePoints);
      setDistanceM(routeRes.distanceM);
      setDurationSec(routeRes.durationSec);
    } finally {
      setCalculatingRoute(false);
    }
  };

  const handleStartTrip = async () => {
    const destinationLabel = query.trim() || selectedPlace?.name || 'Selected Destination';
    const destLat = selectedPlace ? selectedPlace.lat : origin.lat + 0.03;
    const destLng = selectedPlace ? selectedPlace.lng : origin.lng + 0.04;

    setStarting(true);
    const tripId = generateUuidV4();
    const now = Date.now();
    const etaSec = durationSec > 0 ? durationSec : 1200;
    const etaAt = now + etaSec * 1000;

    const finalPts = routePts.length >= 2 ? routePts : [origin, { lat: destLat, lng: destLng }];

    try {
      const trip = await createTrip({
        tripId,
        destination: destinationLabel,
        destLat,
        destLng,
        routePolyline: polyline,
        startedAt: now,
        etaAt,
      });
      await startProtectedTrip(trip, finalPts);
      router.replace('/trip');
    } catch {
      await startProtectedTrip(
        {
          id: tripId,
          destination: destinationLabel,
          destLat,
          destLng,
          routePolyline: polyline,
          status: 'active',
          startedAt: now,
          etaAt,
        },
        finalPts
      );
      router.replace('/trip');
    } finally {
      setStarting(false);
    }
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      <BrandHeader showBack subtitle={t('trip.planSafe')} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Screen Title */}
        <View style={styles.titleWrap}>
          <Text style={styles.screenTitle}>{t('trip.startTitle')}</Text>
          <Text style={styles.screenSubtitle}>{t('trip.startSubtitle')}</Text>
        </View>

        <OfflineBanner />

        {/* Destination Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.cardEyebrow}>{t('trip.destinationDetails')}</Text>

          {/* Where are you going? */}
          <Text style={styles.inputLabel}>{t('trip.whereGoing')}</Text>
          <View style={styles.inputBox}>
            <Ionicons name="location" size={18} color={Palette.primaryViolet} style={styles.fieldIcon} />
            <TextInput
              style={styles.textInput}
              value={query}
              onChangeText={(txt) => {
                setQuery(txt);
                if (selectedPlace && txt !== selectedPlace.name) {
                  setSelectedPlace(null);
                }
              }}
              placeholder={t('trip.enterDestination')}
              placeholderTextColor={Palette.mutedText}
            />
            {searching && <ActivityIndicator color={Palette.primaryViolet} size="small" />}
            {query.length > 0 && !searching && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setSelectedPlace(null);
                  setResults([]);
                  setRoutePts([]);
                  setDistanceM(0);
                  setDurationSec(0);
                }}
              >
                <Feather name="x" size={16} color={Palette.mutedText} />
              </TouchableOpacity>
            )}
          </View>

          {/* Autocomplete Results Dropdown */}
          {results.length > 0 && (
            <View style={styles.resultsList}>
              {results.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.resultItem}
                  onPress={() => void handleSelectPlace(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="location-outline" size={18} color={Palette.primaryViolet} />
                  <View style={styles.resultTextCol}>
                    <Text style={styles.resultNameText}>{item.name}</Text>
                    <Text style={styles.resultLabelText} numberOfLines={1}>
                      {item.label}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Starting point */}
          <Text style={[styles.inputLabel, { marginTop: 14 }]}>{t('trip.startingPoint')}</Text>
          <View style={styles.inputBox}>
            <Ionicons name="navigate-circle" size={18} color={Palette.successGreen} style={styles.fieldIcon} />
            <TextInput
              style={styles.textInput}
              value={startingPointText}
              onChangeText={setStartingPointText}
              placeholder={t('trip.currentLocation')}
              placeholderTextColor={Palette.mutedText}
            />
          </View>

          {/* Stats Row */}
          {distanceM > 0 && (
            <>
              <View style={styles.statsRow}>
                <Text style={styles.statLabel}>{t('trip.estimatedDistance')}</Text>
                <Text style={styles.statValue}>{(distanceM / 1000).toFixed(1)} km</Text>
              </View>

              <View style={styles.statsRow}>
                <Text style={styles.statLabel}>{t('trip.estimatedArrival')}</Text>
                <Text style={[styles.statValue, styles.arrivalHighlight]}>
                  {calculatingRoute
                    ? 'Calculating...'
                    : `${Math.max(1, Math.round(durationSec / 60))} mins`}
                </Text>
              </View>
            </>
          )}

          {/* CTA Button */}
          <TouchableOpacity
            style={[
              styles.beginTripBtn,
              (!selectedPlace && !query.trim()) && styles.beginTripBtnDisabled,
            ]}
            onPress={() => void handleStartTrip()}
            disabled={starting || (!selectedPlace && !query.trim())}
            activeOpacity={0.85}
          >
            {starting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.beginTripText}>{t('trip.begin')}</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Route Preview Card */}
        <View style={styles.routePreviewCard}>
          <View style={styles.previewHeader}>
            <View>
              <Text style={styles.previewTitle}>{t('trip.routePreview')}</Text>
              <Text style={styles.previewSubtitle}>
                {selectedPlace ? `Navigating to ${selectedPlace.name}` : 'Explore map or enter destination'}
              </Text>
            </View>
            <View style={styles.liveBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveBadgeText}>Live GPS</Text>
            </View>
          </View>

          {/* Interactive Map Visual */}
          <View style={styles.mapContainer}>
            <SafetyMapView
              center={origin}
              userLocation={origin}
              routePoints={routePts}
              destination={selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null}
              style={{ height: 280 }}
            />
          </View>
        </View>
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNav activeTab="trip" />
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
    paddingTop: 10,
    paddingBottom: 20,
    gap: 16,
  },
  titleWrap: {
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: Palette.secondaryText,
    marginTop: 4,
  },
  detailsCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  cardEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    color: Palette.softLavender,
    letterSpacing: 0.8,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: Palette.secondaryText,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  fieldIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    color: Palette.primaryText,
    fontSize: 15,
    fontWeight: '500',
  },
  resultsList: {
    backgroundColor: '#161B2F',
    borderWidth: 1,
    borderColor: '#2D3450',
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
  },
  resultTextCol: {
    flex: 1,
  },
  resultNameText: {
    fontSize: 14,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  resultLabelText: {
    fontSize: 11,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
  },
  statLabel: {
    fontSize: 13,
    color: Palette.secondaryText,
    fontWeight: '500',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  arrivalHighlight: {
    color: Palette.successGreen,
  },
  beginTripBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: Palette.primaryViolet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  beginTripBtnDisabled: {
    opacity: 0.5,
  },
  beginTripText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  routePreviewCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 18,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  previewSubtitle: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 184, 135, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 135, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.successGreen,
  },
  liveBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.successGreen,
  },
  mapContainer: {
    height: 280,
    borderRadius: 16,
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
});
