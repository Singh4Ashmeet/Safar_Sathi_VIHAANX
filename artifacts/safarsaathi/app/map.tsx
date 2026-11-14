import * as Location from 'expo-location';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import {
  useListSafetyZones,
  useSubmitSafetyReport,
  type SafetyReportRequestCategory,
} from '@workspace/api-client-react';
import type { LatLng } from '@workspace/safety-core';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import SafetyMapView from '@/components/SafetyMapView';
import Colors, { Palette } from '@/constants/colors';
import { t, useLanguage } from '@/i18n';
import { searchRealPlaces, type GeocodedPlace } from '@/services/geocoding.service';
import { watchLiveLocation, type LocationFix } from '@/services/location.service';

const CATEGORIES: { key: SafetyReportRequestCategory; label: string }[] = [
  { key: 'poor_lighting', label: 'map.poorLighting' },
  { key: 'harassment', label: 'map.harassment' },
  { key: 'isolation', label: 'map.isolation' },
  { key: 'theft_snatch', label: 'map.theft' },
  { key: 'safe_patrol', label: 'map.patrol' },
];

export default function SafetyMapScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const [center, setCenter] = useState<LatLng>({ lat: 28.6139, lng: 77.209 });
  const [userLoc, setUserLoc] = useState<LatLng | null>(null);
  const [viewFilter, setViewFilter] = useState<'day' | 'night' | 'all'>('day');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [category, setCategory] = useState<SafetyReportRequestCategory>('poor_lighting');
  const [note, setNote] = useState('');
  const [submittedMessage, setSubmittedMessage] = useState(false);

  // Search places / location state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPlaceName, setSelectedPlaceName] = useState('');

  // Continuous real-time GPS live tracking
  useEffect(() => {
    const unsub = watchLiveLocation((fix: LocationFix) => {
      const pt = { lat: fix.lat, lng: fix.lng };
      setUserLoc(pt);
      // Center initially if user hasn't searched a different place
      if (!selectedPlaceName) {
        setCenter(pt);
      }
    });
    return unsub;
  }, [selectedPlaceName]);

  // Autocomplete location search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const places = await searchRealPlaces(q, userLoc);
        setSearchResults(places);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, userLoc]);

  const handleSelectPlace = (place: GeocodedPlace) => {
    setCenter({ lat: place.lat, lng: place.lng });
    setSelectedPlaceName(place.name);
    setSearchQuery(place.name);
    setSearchResults([]);
  };

  const { data: zones = [], isLoading, refetch } = useListSafetyZones({
    lat: center.lat,
    lng: center.lng,
    radius: 5000,
    timeOfDay: viewFilter === 'all' ? undefined : viewFilter,
  });

  const submitMutation = useSubmitSafetyReport();

  const handleSubmitReport = async () => {
    try {
      await submitMutation.mutateAsync({
        data: {
          lat: center.lat,
          lng: center.lng,
          category,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      });
      setSubmittedMessage(true);
      setTimeout(() => {
        setSubmittedMessage(false);
        setNote('');
        setReportModalOpen(false);
      }, 1200);
      await refetch();
    } catch {
      setSubmittedMessage(true);
      setTimeout(() => {
        setSubmittedMessage(false);
        setReportModalOpen(false);
      }, 1200);
    }
  };

  const mappedZones = (zones || []).map((z) => ({
    id: z.id,
    lat: z.lat,
    lng: z.lng,
    radiusM: z.radiusM,
    severity: z.severity as 'low' | 'medium' | 'high',
    category: z.category,
  }));

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Brand Header */}
      <BrandHeader subtitle="Live Safety Navigation" isReady />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Screen Title */}
        <View style={styles.titleWrap}>
          <Text style={styles.screenTitle}>{t('map.title')}</Text>
          <Text style={styles.screenSubtitle}>{t('map.subtitle')}</Text>
        </View>

        {/* Location Search Bar */}
        <View style={styles.searchBarBox}>
          <Feather name="search" size={18} color={Palette.softLavender} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={(txt) => {
              setSearchQuery(txt);
              if (selectedPlaceName && txt !== selectedPlaceName) {
                setSelectedPlaceName('');
              }
            }}
            placeholder="Search city, area, or landmark..."
            placeholderTextColor={Palette.mutedText}
          />
          {searching && <ActivityIndicator size="small" color={Palette.primaryViolet} />}
          {searchQuery.length > 0 && !searching && (
            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSelectedPlaceName('');
                setSearchResults([]);
                if (userLoc) setCenter(userLoc);
              }}
            >
              <Feather name="x" size={16} color={Palette.mutedText} />
            </TouchableOpacity>
          )}
        </View>

        {/* Autocomplete Suggestions Dropdown */}
        {searchResults.length > 0 && (
          <View style={styles.searchResultsDropdown}>
            {searchResults.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.searchResultItem}
                onPress={() => handleSelectPlace(item)}
                activeOpacity={0.7}
              >
                <Ionicons name="location-sharp" size={18} color={Palette.primaryViolet} />
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

        {/* Explore Areas Card */}
        <View style={styles.exploreCard}>
          <View style={styles.exploreHeader}>
            <View>
              <Text style={styles.exploreTitle}>{t('map.explore')}</Text>
              <Text style={styles.exploreSubtitle}>
                {selectedPlaceName ? `Viewing ${selectedPlaceName}` : 'Viewing your current area'}
              </Text>
            </View>
            <View style={styles.liveIndicatorBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.liveIndicatorText}>Live Map</Text>
            </View>
          </View>

          {/* Filter Pills */}
          <View style={styles.pillsRow}>
            <TouchableOpacity
              style={[styles.pill, viewFilter === 'day' && styles.pillActive]}
              onPress={() => setViewFilter('day')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, viewFilter === 'day' && styles.pillTextActive]}>
                {t('map.day')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, viewFilter === 'night' && styles.pillActive]}
              onPress={() => setViewFilter('night')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, viewFilter === 'night' && styles.pillTextActive]}>
                {t('map.night')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, viewFilter === 'all' && styles.pillActive]}
              onPress={() => setViewFilter('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.pillText, viewFilter === 'all' && styles.pillTextActive]}>
                {t('map.all')}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Real Interactive Map */}
          <View style={styles.mapWrap}>
            <SafetyMapView
              center={center}
              userLocation={userLoc}
              zones={mappedZones}
              nightMode={viewFilter === 'night'}
              style={{ height: 320 }}
            />
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>High risk</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendText}>Caution</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Patrolled / Safe</Text>
            </View>
          </View>
        </View>

        {/* Community Safety Notes Card */}
        <View style={styles.communityCard}>
          <Text style={styles.communityTitle}>{t('map.notes')}</Text>
          <Text style={styles.communitySubtitle}>{t('map.notesSubtitle')}</Text>

          <TouchableOpacity
            style={styles.reportBtn}
            onPress={() => setReportModalOpen(true)}
            activeOpacity={0.85}
          >
            <Text style={styles.reportBtnText}>{t('map.report')}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Report Modal */}
      <Modal visible={reportModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{t('map.reportTitle')}</Text>
              <TouchableOpacity onPress={() => setReportModalOpen(false)}>
                <Feather name="x" size={22} color={Palette.secondaryText} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalLabel}>{t('map.category')}</Text>
            <View style={styles.categoryPicker}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.categoryOption, category === cat.key && styles.categoryOptionActive]}
                  onPress={() => setCategory(cat.key)}
                >
                  <Text style={[styles.categoryText, category === cat.key && styles.categoryTextActive]}>
                    {t(cat.label)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { marginTop: 12 }]}>{t('map.note')}</Text>
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={setNote}
              placeholder={t('map.notePlaceholder')}
              placeholderTextColor={Palette.mutedText}
              multiline
            />

            {submittedMessage ? (
              <View style={styles.successMessage}>
                <Feather name="check-circle" size={18} color={Palette.successGreen} />
                <Text style={styles.successText}>{t('map.success')}</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.submitReportBtn}
                onPress={() => void handleSubmitReport()}
                activeOpacity={0.85}
              >
                <Text style={styles.submitReportText}>{t('map.submit')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNav activeTab="map" />
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
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: '#2D3450',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    color: Palette.primaryText,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  searchResultsDropdown: {
    backgroundColor: '#161B2F',
    borderWidth: 1,
    borderColor: '#2D3450',
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: -8,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  exploreCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 18,
  },
  exploreHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  exploreTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  exploreSubtitle: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  liveIndicatorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 184, 135, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 135, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.successGreen,
  },
  liveIndicatorText: {
    fontSize: 11,
    fontWeight: '700',
    color: Palette.successGreen,
  },
  sampleDataBadge: {
    backgroundColor: 'rgba(99, 91, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  sampleDataText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.softLavender,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  pill: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillActive: {
    backgroundColor: 'rgba(99, 91, 255, 0.25)',
    borderColor: Palette.primaryViolet,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
  },
  pillTextActive: {
    color: Palette.softLavender,
  },
  mapWrap: {
    height: 320,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: Palette.borders,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.06)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.secondaryText,
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
  captionText: {
    fontSize: 12,
    color: Palette.secondaryText,
    marginTop: 12,
    fontWeight: '500',
  },
  communityCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 18,
  },
  communityTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  communitySubtitle: {
    fontSize: 13,
    color: Palette.secondaryText,
    marginTop: 4,
    marginBottom: 16,
  },
  reportBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Palette.primaryViolet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 6,
  },
  reportBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(6, 8, 15, 0.85)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: Palette.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: Palette.borders,
    padding: 22,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
    marginBottom: 8,
  },
  categoryPicker: {
    gap: 8,
  },
  categoryOption: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  categoryOptionActive: {
    borderColor: Palette.primaryViolet,
    backgroundColor: 'rgba(99, 91, 255, 0.2)',
  },
  categoryText: {
    fontSize: 14,
    color: Palette.secondaryText,
    fontWeight: '500',
  },
  categoryTextActive: {
    color: Palette.primaryText,
    fontWeight: '700',
  },
  noteInput: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    padding: 12,
    minHeight: 80,
    color: Palette.primaryText,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  submitReportBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitReportText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  successMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    paddingVertical: 14,
  },
  successText: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.successGreen,
  },
});
