import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Linking,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BigButton from '@/components/BigButton';
import BrandHeader from '@/components/BrandHeader';
import Colors, { Palette } from '@/constants/colors';
import * as pinService from '@/services/pin';
import { t, useLanguage } from '@/i18n';

export default function OnboardingScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cancelPin, setCancelPin] = useState('');
  const [duressPin, setDuressPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [permDone, setPermDone] = useState(false);

  const handleSavePins = async () => {
    setPinError(null);
    if (cancelPin.length < 4 || duressPin.length < 4) {
      setPinError('Both PINs must be 4–6 digits.');
      return;
    }
    if (cancelPin === duressPin) {
      setPinError('Safe Cancel PIN and Duress PIN must be different.');
      return;
    }
    try {
      await pinService.set('cancel', cancelPin);
      await pinService.set('duress', duressPin);
      setStep(2);
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'Failed to save PINs');
    }
  };

  const handleRequestPermissions = async () => {
    await Location.requestForegroundPermissionsAsync().catch(() => undefined);
    await Location.requestBackgroundPermissionsAsync().catch(() => undefined);
    await Notifications.requestPermissionsAsync().catch(() => undefined);
    if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
      await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]).catch(() => undefined);
    }
    setPermDone(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <BrandHeader subtitle={`${t('onboarding.setup')} (${step}/3)`} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
      >
        <Text style={styles.title}>{t('onboarding.welcome')}</Text>

      {step === 1 && (
        <View style={styles.card}>
          <Text style={styles.stepTitle}>{t('onboarding.pinStep')}</Text>
          <Text style={styles.desc}>
            Your Safe Cancel PIN stops an emergency alert normally. Your Silent Duress PIN displays the exact same "Alert Cancelled" confirmation screen but silently escalates to guardians and dispatch.
          </Text>

          {pinError && <Text style={styles.err}>{pinError}</Text>}

          <Text style={styles.label}>{t('onboarding.safePin')}</Text>
          <TextInput
            style={styles.input}
            value={cancelPin}
            onChangeText={setCancelPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="e.g. 1234"
            placeholderTextColor={Palette.mutedText}
          />

          <Text style={styles.label}>{t('onboarding.duressPin')}</Text>
          <TextInput
            style={styles.input}
            value={duressPin}
            onChangeText={setDuressPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            placeholder="e.g. 9999"
            placeholderTextColor={Palette.mutedText}
          />

          <BigButton label={t('onboarding.savePins')} onPress={handleSavePins} />
        </View>
      )}

      {step === 2 && (
        <View style={styles.card}>
          <Text style={styles.stepTitle}>{t('onboarding.permissions')}</Text>
          <Text style={styles.desc}>
            Allow "Always" background location and high-priority emergency notifications so monitoring never stops when your screen locks.
          </Text>
          <BigButton
            label={permDone ? `${t('onboarding.grant')} ✓` : t('onboarding.grant')}
            variant="safe"
            onPress={handleRequestPermissions}
            style={styles.btnGap}
          />
          <BigButton
            label={t('onboarding.battery')}
            variant="secondary"
            onPress={() => Linking.openSettings()}
            style={styles.btnGap}
          />
          <BigButton label={t('onboarding.next')} onPress={() => setStep(3)} />
        </View>
      )}

      {step === 3 && (
        <View style={styles.card}>
          <Text style={styles.stepTitle}>{t('onboarding.guardians')}</Text>
          <Text style={styles.desc}>
            Connect trusted guardians who will receive live journey links and priority alerts during emergencies.
          </Text>
          <BigButton
            label={t('onboarding.openGuardians')}
            onPress={() => router.replace('/guardians')}
            style={styles.btnGap}
          />
          <BigButton
            label={t('onboarding.complete')}
            variant="secondary"
            onPress={() => router.replace('/')}
          />
        </View>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Palette.softLavender,
    marginBottom: 16,
  },
  card: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Palette.primaryText,
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    lineHeight: 20,
    color: Palette.secondaryText,
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
    marginBottom: 6,
  },
  input: {
    minHeight: 50,
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 18,
    color: Palette.primaryText,
    marginBottom: 16,
  },
  err: {
    fontSize: 14,
    fontWeight: '600',
    color: Palette.sosRed,
    marginBottom: 12,
  },
  btnGap: {
    marginBottom: 12,
  },
});
