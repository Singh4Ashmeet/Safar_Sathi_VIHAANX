import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import Colors, { Palette } from '@/constants/colors';

interface BrandHeaderProps {
  rightBadgeText?: string;
  isReady?: boolean;
  rightElement?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  subtitle?: string;
}

export default function BrandHeader({ 
  rightBadgeText = 'Demo mode',
  isReady = false,
  rightElement,
  showBack = false,
  onBack,
  subtitle,
}: BrandHeaderProps) {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <View style={styles.header}>
      <View style={styles.brandLeft}>
        {showBack && (
          <TouchableOpacity 
            style={styles.backBtn} 
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="arrow-left" size={20} color={Palette.primaryText} />
          </TouchableOpacity>
        )}
        <View style={styles.logoBadge}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <View style={styles.brandTextWrap}>
          <Text style={styles.brandText}>
            Safar<Text style={styles.brandHighlight}>Saathi</Text>
          </Text>
          {subtitle ? (
            <Text style={styles.subtitleText}>{subtitle}</Text>
          ) : null}
        </View>
      </View>

      {rightElement ? (
        rightElement
      ) : (
        <View style={[styles.statusBadge, isReady && styles.readyBadge]}>
          <View style={[styles.statusDot, isReady && styles.readyDot]} />
          <Text style={[styles.statusText, isReady && styles.readyText]}>
            {isReady ? 'Ready' : rightBadgeText}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brandLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#161B2F',
    borderWidth: 1,
    borderColor: '#2D3450',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  logoBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#0F1222',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: Palette.primaryViolet,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  logoImage: {
    width: 34,
    height: 34,
    borderRadius: 8,
  },
  brandTextWrap: {
    justifyContent: 'center',
  },
  brandText: {
    fontSize: 20,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: -0.4,
  },
  brandHighlight: {
    color: Palette.softLavender,
  },
  subtitleText: {
    fontSize: 11,
    fontWeight: '600',
    color: Palette.mutedText,
    letterSpacing: 0.2,
    marginTop: -1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B2F',
    borderWidth: 1,
    borderColor: '#2D3450',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  readyBadge: {
    borderColor: 'rgba(0, 184, 135, 0.4)',
    backgroundColor: 'rgba(0, 184, 135, 0.08)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#60A5FA',
  },
  readyDot: {
    backgroundColor: Palette.successGreen,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    color: Palette.secondaryText,
  },
  readyText: {
    color: Palette.successGreen,
  },
});

