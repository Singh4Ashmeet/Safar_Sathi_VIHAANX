import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, Vibration, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Palette } from '@/constants/colors';

export default function FakeCallScreen() {
  const insets = useSafeAreaInsets();
  const [answered, setAnswered] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (answered) {
      Vibration.cancel();
      const id = setInterval(() => setElapsedSec((s) => s + 1), 1000);
      return () => clearInterval(id);
    }

    Vibration.vibrate([500, 700, 500, 700], true);
    const hapticId = setInterval(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }, 1500);

    return () => {
      Vibration.cancel();
      clearInterval(hapticId);
    };
  }, [answered]);

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
  const ss = String(elapsedSec % 60).padStart(2, '0');

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
      <View style={styles.top}>
        <Text style={styles.sub}>{answered ? `${mm}:${ss}` : 'Incoming mobile call'}</Text>
        <Text style={styles.caller}>Mom</Text>
        <Text style={styles.phone}>+91 98765 •••••</Text>
      </View>

      {answered ? (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.circleBtn, styles.decline]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Feather name="phone-off" size={28} color="#FFFFFF" />
            <Text style={styles.btnLabel}>End</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.circleBtn, styles.decline]}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Feather name="phone-off" size={28} color="#FFFFFF" />
            <Text style={styles.btnLabel}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.circleBtn, styles.accept]}
            onPress={() => setAnswered(true)}
            activeOpacity={0.8}
          >
            <Feather name="phone" size={28} color="#FFFFFF" />
            <Text style={styles.btnLabel}>Accept</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  top: { alignItems: 'center' },
  sub: { fontSize: 16, color: Palette.secondaryText, fontWeight: '500' },
  caller: { fontSize: 38, fontWeight: '800', color: Palette.primaryText, marginTop: 12 },
  phone: { fontSize: 18, color: Palette.secondaryText, marginTop: 6 },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
  },
  circleBtn: {
    width: 86,
    height: 86,
    borderRadius: 43,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  decline: { backgroundColor: Palette.sosRed },
  accept: { backgroundColor: Palette.successGreen },
  btnLabel: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
});
