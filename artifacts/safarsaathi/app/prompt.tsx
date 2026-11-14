import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PinPad from '@/components/PinPad';
import Colors, { Palette } from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';
import * as pinService from '@/services/pin';

export default function PromptScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { triggerSosFlow, confirmSafetyCheck } = useTripContext();
  const { check } = useLocalSearchParams<{ check?: string }>();
  const [isFinalCheck, setIsFinalCheck] = useState(false);
  const [countdown, setCountdown] = useState(30);
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!isFinalCheck) {
            setIsFinalCheck(true);
            return 0;
          }
          void (async () => {
            const sosId = await triggerSosFlow('prompt_timeout');
            router.replace({ pathname: '/sos', params: { sosId } });
          })();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isFinalCheck, triggerSosFlow]);

  useEffect(() => {
    if (!isFinalCheck) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    setCountdown(10);
  }, [isFinalCheck]);

  const handleVerify = async (entered: string) => {
    setErrorMsg(null);
    const result = await pinService.verify(entered);
    if (result === 'cancel') {
      confirmSafetyCheck();
      router.replace('/trip');
      return;
    }
    if (result === 'duress') {
      await triggerSosFlow('prompt_timeout');
      router.replace({ pathname: '/pin', params: { completedDuress: '1' } });
      return;
    }
    setPin('');
    if (result === 'throttled') {
      setLocked(true);
      setErrorMsg('Too many failed attempts. Locked for 30s.');
    } else {
      setErrorMsg('Incorrect PIN. Try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 28 }]}>
      <Text style={styles.title}>{isFinalCheck ? 'Final safety check' : 'Are you safe?'}</Text>
      <Text style={styles.subtitle}>
        {isFinalCheck
          ? 'Please enter your safety PIN within 10 seconds. SOS will trigger immediately if there is no response.'
          : `Scheduled safety check${check ? ` ${check} of 6` : ''}. Enter your safety PIN within 30 seconds to confirm.`}
      </Text>

      <View style={styles.timerBox}>
        <Text style={styles.timer}>{countdown}s</Text>
      </View>

      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      <PinPad
        value={pin}
        onChange={setPin}
        onSubmit={(p) => void handleVerify(p)}
        disabled={locked}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Palette.primaryText,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: Palette.secondaryText,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  timerBox: {
    backgroundColor: 'rgba(232, 155, 21, 0.15)',
    borderWidth: 1,
    borderColor: Palette.warningAmber,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 20,
  },
  timer: {
    fontSize: 40,
    fontWeight: '800',
    color: Palette.warningAmber,
  },
  error: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.sosRed,
    marginBottom: 14,
  },
});
