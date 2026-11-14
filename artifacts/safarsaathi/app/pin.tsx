import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cancelSos } from '@workspace/api-client-react';
import BigButton from '@/components/BigButton';
import PinPad from '@/components/PinPad';
import Colors from '@/constants/colors';
import { useTripContext } from '@/context/TripContext';
import { t, useLanguage } from '@/i18n';
import * as pinService from '@/services/pin';

export default function PinScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ sosId?: string; completedDuress?: string }>();
  const { activeSosId, setActiveSosId } = useTripContext();
  const sosId = params.sosId ?? activeSosId ?? '';

  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  // Visually identical "Alert Cancelled" screen for BOTH cancel and duress PINs (FR-07)
  const [cancelledDone, setCancelledDone] = useState(params.completedDuress === '1');

  const handleSubmit = async (entered: string) => {
    setErrorMsg(null);
    const verdict = await pinService.verify(entered);
    if (verdict === 'cancel' || verdict === 'duress') {
      if (sosId) {
        await cancelSos(sosId, { pinKind: verdict }).catch(() => undefined);
      }
      setActiveSosId(null);
      setCancelledDone(true);
      return;
    }

    setPin('');
    if (verdict === 'throttled') {
      setLocked(true);
      setErrorMsg(t('sos.throttledPin'));
    } else {
      setErrorMsg(t('sos.wrongPin'));
    }
  };

  if (cancelledDone) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
        <Text style={styles.doneIcon}>✓</Text>
        <Text style={styles.doneTitle}>{t('sos.cancelledTitle')}</Text>
        <Text style={styles.doneBody}>{t('sos.cancelledBody')}</Text>
        <BigButton
          label={t('common.back')}
          variant="safe"
          onPress={() => router.replace('/')}
          style={{ width: '100%', marginTop: 28 }}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backText}>← {t('common.back')}</Text>
      </TouchableOpacity>

      <Text style={styles.title}>{t('sos.cancelWithPin')}</Text>
      {errorMsg && <Text style={styles.error}>{errorMsg}</Text>}

      <View style={styles.padWrap}>
        <PinPad
          value={pin}
          onChange={setPin}
          onSubmit={(p) => void handleSubmit(p)}
          disabled={locked}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  backBtn: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: 'Inter_600SemiBold', fontSize: 16, color: Colors.primary },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 22,
    color: Colors.textPrimary,
    marginTop: 24,
    marginBottom: 14,
  },
  error: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: Colors.danger,
    marginBottom: 12,
  },
  padWrap: { marginTop: 12 },
  doneIcon: {
    fontSize: 56,
    color: Colors.safe,
    fontFamily: 'Inter_700Bold',
  },
  doneTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 26,
    color: Colors.textPrimary,
    marginTop: 14,
  },
  doneBody: {
    fontFamily: 'Inter_400Regular',
    fontSize: 16,
    color: Colors.textSecondary,
    marginTop: 8,
    textAlign: 'center',
  },
});

