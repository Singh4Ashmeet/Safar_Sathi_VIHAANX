import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Colors, { Palette } from '@/constants/colors';
import { t, useLanguage } from '@/i18n';

export type TripChipStatus = 'safe' | 'warning' | 'danger' | 'signal_lost';

interface StatusChipProps {
  status: TripChipStatus;
  score?: number;
}

export default function StatusChip({ status, score }: StatusChipProps) {
  useLanguage();
  const cfg =
    status === 'danger'
      ? { bg: 'rgba(241, 60, 92, 0.15)', fg: Palette.sosRed, dot: Palette.sosRed, label: t('trip.statusDanger') }
      : status === 'warning'
        ? { bg: 'rgba(232, 155, 21, 0.15)', fg: Palette.warningAmber, dot: Palette.warningAmber, label: t('trip.statusWarning') }
        : status === 'signal_lost'
          ? { bg: 'rgba(105, 117, 140, 0.2)', fg: Palette.mutedText, dot: Palette.mutedText, label: t('trip.statusSignalLost') }
          : { bg: 'rgba(0, 184, 135, 0.15)', fg: Palette.successGreen, dot: Palette.successGreen, label: t('trip.statusSafe') };

  return (
    <View style={[styles.chip, { backgroundColor: cfg.bg, borderColor: cfg.dot }]} accessibilityLabel={cfg.label}>
      <View style={[styles.dot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.text, { color: cfg.fg }]}>
        {cfg.label}
        {typeof score === 'number' && score > 0 ? ` (${score})` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  text: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
  },
});
