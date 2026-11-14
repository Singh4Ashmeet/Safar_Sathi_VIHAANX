import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Colors, { Palette } from '@/constants/colors';
import { t, useLanguage } from '@/i18n';

interface SOSButtonProps {
  onTrigger: () => void;
  size?: number;
  pulsing?: boolean;
  holdMs?: number;
  discreet?: boolean;
}

export default function SOSButton({
  onTrigger,
  size = 132,
  pulsing = true,
  holdMs = 1500,
  discreet = false,
}: SOSButtonProps) {
  useLanguage();
  const [holding, setHolding] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const triggeredRef = useRef(false);

  const scale = useSharedValue(1);
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.35);

  useEffect(() => {
    if (pulsing || holding) {
      ringScale.value = withRepeat(
        withSequence(withTiming(1.12, { duration: 1100 }), withTiming(1.02, { duration: 1100 })),
        -1,
        true
      );
      ringOpacity.value = withRepeat(
        withSequence(withTiming(0.55, { duration: 1100 }), withTiming(0.2, { duration: 1100 })),
        -1,
        true
      );
    } else {
      cancelAnimation(ringScale);
      cancelAnimation(ringOpacity);
      ringScale.value = 1;
      ringOpacity.value = 0;
    }
  }, [pulsing, holding]);

  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    };
  }, []);

  const buttonStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  const startHold = () => {
    triggeredRef.current = false;
    setHolding(true);
    setProgressPct(0);
    scale.value = withTiming(0.96, { duration: 120 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);

    const startedAt = Date.now();
    let lastTickPct = 0;

    if (holdTimerRef.current) clearInterval(holdTimerRef.current);
    holdTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const pct = Math.min(100, Math.round((elapsed / holdMs) * 100));
      setProgressPct(pct);

      if (pct - lastTickPct >= 25 && pct < 100) {
        lastTickPct = pct;
        Haptics.selectionAsync().catch(() => undefined);
      }

      if (elapsed >= holdMs && !triggeredRef.current) {
        triggeredRef.current = true;
        if (holdTimerRef.current) {
          clearInterval(holdTimerRef.current);
          holdTimerRef.current = null;
        }
        setHolding(false);
        setProgressPct(0);
        scale.value = withTiming(1, { duration: 120 });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
        onTrigger();
      }
    }, 50);
  };

  const cancelHold = () => {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setHolding(false);
    setProgressPct(0);
    scale.value = withTiming(1, { duration: 120 });
  };

  const handleTap = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    onTrigger();
  };

  const outerRingDim = size * 1.18;
  const midRingDim = size * 1.08;

  return (
    <View style={[styles.wrapper, { width: outerRingDim * 1.14, height: outerRingDim * 1.14 }]}>
      {/* Outer Glow Ring - Contained within bounded wrapper */}
      <Animated.View
        style={[
          styles.glowRing,
          discreet ? styles.glowRingDiscreet : styles.glowRingNormal,
          {
            width: outerRingDim,
            height: outerRingDim,
            borderRadius: outerRingDim / 2,
          },
          ringStyle,
        ]}
      />

      {/* Mid Accent Ring */}
      <View
        style={[
          styles.midRing,
          discreet ? styles.midRingDiscreet : styles.midRingNormal,
          {
            width: midRingDim,
            height: midRingDim,
            borderRadius: midRingDim / 2,
          },
        ]}
      />

      {/* Core Button */}
      <Animated.View style={buttonStyle}>
        <Pressable
          onPress={handleTap}
          onPressIn={startHold}
          onPressOut={cancelHold}
          accessibilityRole="button"
          accessibilityLabel={discreet ? 'Safe Check: Tap or hold' : 'SOS: Tap or hold for help'}
          accessibilityHint="Tap or press and hold for 1.5 seconds to trigger emergency alert"
          style={[
            styles.button,
            discreet ? styles.buttonDiscreet : styles.buttonNormal,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: holding ? 3 : discreet ? 1.5 : 0,
              borderColor: holding ? '#FFFFFF' : discreet ? '#3D4668' : 'transparent',
            },
          ]}
        >
          <View style={styles.iconRow}>
            <Feather
              name={discreet ? 'shield' : 'alert-triangle'}
              size={Math.round(size * 0.17)}
              color={discreet ? Palette.softLavender : '#FFFFFF'}
            />
            <Text
              style={[
                styles.label,
                discreet ? styles.labelDiscreet : styles.labelNormal,
                { fontSize: Math.round(size * 0.18) },
              ]}
            >
              {holding ? `${progressPct}%` : discreet ? 'CHECK-IN' : 'SOS'}
            </Text>
          </View>
          <Text
            style={[
              styles.subLabel,
              discreet ? styles.subLabelDiscreet : styles.subLabelNormal,
              { fontSize: Math.round(size * 0.075) },
            ]}
          >
            {holding
              ? 'KEEP HOLDING'
              : discreet
                ? 'TAP OR HOLD FOR SILENT SOS'
                : 'TAP OR HOLD FOR HELP'}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    overflow: 'hidden',
  },
  glowRing: {
    position: 'absolute',
  },
  glowRingNormal: {
    backgroundColor: Palette.deepSosRed,
    opacity: 0.35,
  },
  glowRingDiscreet: {
    backgroundColor: 'rgba(124, 77, 255, 0.2)',
    opacity: 0.25,
  },
  midRing: {
    position: 'absolute',
  },
  midRingNormal: {
    backgroundColor: 'rgba(185, 14, 60, 0.45)',
  },
  midRingDiscreet: {
    backgroundColor: 'rgba(45, 52, 80, 0.55)',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonNormal: {
    backgroundColor: Palette.sosRed,
    shadowColor: Palette.sosRed,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
  buttonDiscreet: {
    backgroundColor: '#1E2438',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: {
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.2,
  },
  labelNormal: {
    color: '#FFFFFF',
  },
  labelDiscreet: {
    color: Palette.softLavender,
  },
  subLabel: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.6,
    textAlign: 'center',
  },
  subLabelNormal: {
    color: 'rgba(255, 255, 255, 0.9)',
  },
  subLabelDiscreet: {
    color: Palette.secondaryText,
  },
});

