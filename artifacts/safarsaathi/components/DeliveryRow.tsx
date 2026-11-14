import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Colors from '@/constants/colors';
import { t, useLanguage } from '@/i18n';

interface DeliveryRowProps {
  guardianName: string;
  channel: string;
  status: string;
  onCallGuardian?: () => void;
  onCall112?: () => void;
}

export default function DeliveryRow({
  guardianName,
  channel,
  status,
  onCallGuardian,
  onCall112,
}: DeliveryRowProps) {
  useLanguage();
  const badgeColor =
    status === 'acknowledged'
      ? Colors.safe
      : status === 'sent'
        ? Colors.primary
        : status === 'failed'
          ? Colors.danger
          : Colors.warning;

  return (
    <View
      style={styles.row}
      accessibilityLabel={`${guardianName}, ${channel}, status ${status}`}
    >
      <View style={styles.top}>
        <View>
          <Text style={styles.name}>{guardianName}</Text>
          <Text style={styles.channel}>{channel.toUpperCase()}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: badgeColor + '22', borderColor: badgeColor }]}>
          <Text style={[styles.badgeText, { color: badgeColor }]}>{status.toUpperCase()}</Text>
        </View>
      </View>

      {status === 'failed' && (onCallGuardian || onCall112) && (
        <View style={styles.actions}>
          {onCallGuardian && (
            <TouchableOpacity style={styles.actionBtn} onPress={onCallGuardian}>
              <Text style={styles.actionText}>{t('sos.callGuardian')}</Text>
            </TouchableOpacity>
          )}
          {onCall112 && (
            <TouchableOpacity style={[styles.actionBtn, styles.call112Btn]} onPress={onCall112}>
              <Text style={styles.call112Text}>{t('sos.call112')}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.textPrimary,
  },
  channel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  call112Btn: {
    backgroundColor: Colors.danger,
  },
  actionText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#FFFFFF',
  },
  call112Text: {
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

