import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons, Feather, Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';

export type NavTab = 'home' | 'trip' | 'map' | 'circle' | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
}

export default function BottomNav({ activeTab }: BottomNavProps) {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { activeTrip } = useTripContext();

  const handleNavigate = (tab: NavTab) => {
    if (tab === activeTab) return;

    switch (tab) {
      case 'home':
        router.replace('/');
        break;
      case 'trip':
        router.replace(activeTrip ? '/trip' : '/start-trip');
        break;
      case 'map':
        router.replace('/map');
        break;
      case 'circle':
        router.replace('/guardians');
        break;
      case 'profile':
        router.replace('/settings');
        break;
    }
  };

  return (
    <View style={[styles.navContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleNavigate('home')}
        activeOpacity={0.7}
      >
        <Feather
          name="home"
          size={22}
          color={activeTab === 'home' ? Palette.primaryViolet : Palette.mutedText}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'home' && styles.navLabelActive,
          ]}
        >
          {t('home.homeNav')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleNavigate('trip')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="crosshairs-gps"
          size={22}
          color={activeTab === 'trip' ? Palette.primaryViolet : Palette.mutedText}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'trip' && styles.navLabelActive,
          ]}
        >
          {t('home.tripNav')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleNavigate('map')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="rhombus-outline"
          size={22}
          color={activeTab === 'map' ? Palette.primaryViolet : Palette.mutedText}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'map' && styles.navLabelActive,
          ]}
        >
          {t('home.mapNav')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleNavigate('circle')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="heart-outline"
          size={22}
          color={activeTab === 'circle' ? Palette.primaryViolet : Palette.mutedText}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'circle' && styles.navLabelActive,
          ]}
        >
          {t('home.circleNav')}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.navItem}
        onPress={() => handleNavigate('profile')}
        activeOpacity={0.7}
      >
        <MaterialCommunityIcons
          name="view-grid-outline"
          size={22}
          color={activeTab === 'profile' ? Palette.primaryViolet : Palette.mutedText}
        />
        <Text
          style={[
            styles.navLabel,
            activeTab === 'profile' && styles.navLabelActive,
          ]}
        >
          {t('home.profileNav')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navContainer: {
    flexDirection: 'row',
    backgroundColor: Palette.secondaryBackground,
    borderTopWidth: 1,
    borderTopColor: Palette.borders,
    paddingTop: 10,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    gap: 4,
  },
  navLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: Palette.mutedText,
  },
  navLabelActive: {
    color: Palette.primaryViolet,
    fontWeight: '700',
  },
});

