import { router } from 'expo-router';
import React, { useCallback } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import OfflineBanner from '@/components/OfflineBanner';
import SOSButton from '@/components/SOSButton';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';
import { useShakeSosTrigger } from '@/services/sos';

export default function HomeScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { activeTrip, discreetMode, setDiscreetMode, triggerSosFlow } = useTripContext();

  const handleSos = useCallback(
    async (trigger: 'button' | 'shake') => {
      const sosId = await triggerSosFlow(trigger);
      router.push({ pathname: '/sos', params: { sosId } });
    },
    [triggerSosFlow]
  );

  useShakeSosTrigger(true, () => {
    void handleSos('shake');
  });

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      {/* Top Bar with Brand Logo and Name */}
      <BrandHeader isReady />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <OfflineBanner />

        {/* Active Trip Banner if running */}
        {activeTrip && (
          <TouchableOpacity
            style={styles.activeTripBanner}
            onPress={() => router.push('/trip')}
            activeOpacity={0.85}
          >
            <View style={styles.activeTripHeader}>
              <View style={styles.pulsingDot} />
            <Text style={styles.activeTripLabel}>{t('home.protectedTrip')}</Text>
            </View>
            <Text style={styles.activeTripDest} numberOfLines={1}>
              {activeTrip.destination}
            </Text>
          </TouchableOpacity>
        )}

        {/* Big SOS Card */}
        <View style={styles.sosCard}>
          <SOSButton onTrigger={() => void handleSos('button')} size={164} />
          <Text style={styles.sosFootnote}>
            {t('home.demoFootnote')}
          </Text>
        </View>

        {/* 2x2 Feature Grid */}
        <View style={styles.grid}>
          {/* Start Safe Trip */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push(activeTrip ? '/trip' : '/start-trip')}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="crosshairs-gps"
                size={22}
                color={Palette.softLavender}
              />
            </View>
            <Text style={styles.tileTitle}>{t('home.startTrip')}</Text>
            <Text style={styles.tileSubtitle}>{t('home.routeSharing')}</Text>
          </TouchableOpacity>

          {/* Watch Me */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/watch')}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              <Feather name="clock" size={20} color={Palette.warningAmber} />
            </View>
            <Text style={styles.tileTitle}>{t('home.watchMe')}</Text>
            <Text style={styles.tileSubtitle}>{t('home.timedCheckin')}</Text>
          </TouchableOpacity>

          {/* Safety Map */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/map')}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="rhombus-outline"
                size={22}
                color={Palette.successGreen}
              />
            </View>
            <Text style={styles.tileTitle}>{t('home.safetyMap')}</Text>
            <Text style={styles.tileSubtitle}>{t('home.exploreAreas')}</Text>
          </TouchableOpacity>

          {/* Ride Check */}
          <TouchableOpacity
            style={styles.gridTile}
            onPress={() => router.push('/ride')}
            activeOpacity={0.8}
          >
            <View style={styles.iconContainer}>
              <MaterialCommunityIcons
                name="card-account-details-outline"
                size={22}
                color={Palette.primaryViolet}
              />
            </View>
            <Text style={styles.tileTitle}>{t('home.rideCheck')}</Text>
            <Text style={styles.tileSubtitle}>{t('home.verifyRide')}</Text>
          </TouchableOpacity>
        </View>

        {/* Guardian Circle Preview Card */}
        <View style={styles.guardianCard}>
          <View style={styles.guardianCardHeader}>
            <View>
              <Text style={styles.guardianCardTitle}>{t('home.guardianCircle')}</Text>
              <Text style={styles.guardianCardSubtitle}>{t('home.trustedContacts')}</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => router.push('/guardians')}
              activeOpacity={0.7}
            >
              <Text style={styles.viewAllText}>{t('home.viewAll')}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.guardianAvatarsRow}>
            <View style={styles.avatarBubble}>
              <Text style={styles.avatarLetter}>M</Text>
            </View>
            <View style={[styles.avatarBubble, { marginLeft: -8 }]}>
              <Text style={styles.avatarLetter}>A</Text>
            </View>
            <Text style={styles.guardianCountText}>{t('home.guardiansAdded')}</Text>
          </View>
        </View>

        {/* Discreet Mode Toggle Card */}
        <View style={styles.discreetCard}>
          <View style={styles.discreetTextCol}>
            <Text style={styles.discreetTitle}>{t('settings.discreetMode')}</Text>
            <Text style={styles.discreetSubtitle}>{t('home.discreetAppearance')}</Text>
          </View>
          <Switch
            value={discreetMode}
            onValueChange={setDiscreetMode}
            trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
            thumbColor="#FFFFFF"
          />
        </View>
      </ScrollView>

      {/* Fixed Bottom Navigation */}
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
    paddingTop: 12,
    paddingBottom: 24,
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Palette.softLavender,
    letterSpacing: 0.8,
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 184, 135, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 184, 135, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.successGreen,
  },
  readyText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.successGreen,
  },
  activeTripBanner: {
    backgroundColor: 'rgba(0, 184, 135, 0.15)',
    borderWidth: 1,
    borderColor: Palette.successGreen,
    borderRadius: 16,
    padding: 14,
  },
  activeTripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulsingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Palette.successGreen,
  },
  activeTripLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Palette.successGreen,
    letterSpacing: 0.5,
  },
  activeTripDest: {
    fontSize: 16,
    fontWeight: '600',
    color: Palette.primaryText,
    marginTop: 4,
  },
  sosCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 24,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosFootnote: {
    fontSize: 12,
    color: Palette.mutedText,
    marginTop: 14,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  gridTile: {
    width: '48%',
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 20,
    padding: 16,
    minHeight: 124,
    justifyContent: 'center',
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Palette.insetSurfaces,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  tileTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 4,
  },
  tileSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Palette.secondaryText,
  },
  guardianCard: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 20,
    padding: 18,
  },
  guardianCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  guardianCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  guardianCardSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Palette.secondaryText,
    marginTop: 2,
  },
  viewAllBtn: {
    backgroundColor: 'rgba(99, 91, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(99, 91, 255, 0.4)',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  viewAllText: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.softLavender,
  },
  guardianAvatarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBubble: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#272E49',
    borderWidth: 2,
    borderColor: Palette.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 15,
    fontWeight: '700',
    color: Palette.softLavender,
  },
  guardianCountText: {
    fontSize: 13,
    fontWeight: '500',
    color: Palette.secondaryText,
    marginLeft: 12,
  },
  discreetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 20,
    padding: 18,
  },
  discreetTextCol: {
    flex: 1,
  },
  discreetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  discreetSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: Palette.secondaryText,
    marginTop: 2,
  },
});
