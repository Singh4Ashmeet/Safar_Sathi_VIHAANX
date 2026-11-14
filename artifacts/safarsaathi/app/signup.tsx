import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { upsertMe } from '@workspace/api-client-react';
import { normalizePhoneE164 } from '@workspace/safety-core';
import BigButton from '@/components/BigButton';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import Colors, { Palette } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { getLanguage, t, useLanguage } from '@/i18n';
import { ensureDeviceKeys } from '@/services/secure';

export default function SignupScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { signup } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adultConsent, setAdultConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignup = async () => {
    setError(null);
    if (!name.trim() || !phone.trim() || !email.trim() || password.length < 6) {
      setError('Please fill in your name, phone, email, and password (6+ chars).');
      return;
    }
    if (!adultConsent) {
      setError('Please confirm you are 18+ and agree to the safety terms.');
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizePhoneE164(phone);
    } catch {
      phoneE164 = phone.startsWith('+') ? phone : `+91${phone.replace(/\D/g, '')}`;
    }

    setLoading(true);
    try {
      await signup(email.trim(), password);
      const keys = await ensureDeviceKeys();
      await upsertMe({
        name: name.trim(),
        phone: phoneE164,
        lang: getLanguage(),
        boxPub: keys.box.publicKey,
        signPub: keys.sign.publicKey,
        adultConfirmedAt: Date.now(),
      }).catch(() => undefined);
      router.replace('/onboarding');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.container, { paddingTop: insets.top + 20 }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.brandRow}>
        <View style={styles.logoBadge}>
          <Image
            source={require('@/assets/images/logo.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </View>
        <Text style={styles.brandText}>
          Safar<Text style={styles.brandHighlight}>Saathi</Text>
        </Text>
      </View>

      <Text style={styles.screenTitle}>Create account</Text>
      <Text style={styles.screenSubtitle}>{t('auth.signupSubtitle')}</Text>

      {error && (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{error}</Text>
        </View>
      )}

      <Text style={styles.label}>{t('auth.nameLabel')}</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Priya Sharma"
        placeholderTextColor={Palette.mutedText}
      />

      <Text style={styles.label}>{t('auth.phoneLabel')}</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        placeholder="98765 43210"
        placeholderTextColor={Palette.mutedText}
      />

      <Text style={styles.label}>{t('auth.emailLabel')}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="priya@example.com"
        placeholderTextColor={Palette.mutedText}
      />

      <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder={t('auth.passwordHint')}
        placeholderTextColor={Palette.mutedText}
      />

      <Pressable
        style={styles.checkRow}
        onPress={() => setAdultConsent((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: adultConsent }}
      >
        <View style={[styles.checkbox, adultConsent && styles.checkboxChecked]}>
          {adultConsent && <Text style={styles.checkMark}>✓</Text>}
        </View>
        <Text style={styles.checkLabel}>
          {t('auth.consent')}
        </Text>
      </Pressable>

      <BigButton
        label={t('auth.setupCta')}
        onPress={handleSignup}
        loading={loading}
        style={styles.cta}
      />

      <TouchableOpacity style={styles.linkBtn} onPress={() => router.back()}>
        <Text style={styles.linkText}>
          {t('auth.existingUser')} <Text style={{ color: Palette.softLavender, fontWeight: '700' }}>{t('auth.loginCta')}</Text>
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScrollViewCompat>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  content: {
    padding: 24,
    paddingBottom: 40,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  logoBadge: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#0F1222',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 77, 255, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoImage: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  brandText: {
    fontSize: 26,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: -0.5,
  },
  brandHighlight: {
    color: Palette.softLavender,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: Palette.primaryText,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    color: Palette.secondaryText,
    marginTop: 4,
    marginBottom: 20,
  },
  errBox: {
    backgroundColor: 'rgba(241, 60, 92, 0.12)',
    borderWidth: 1,
    borderColor: Palette.sosRed,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  errText: {
    fontSize: 14,
    color: Palette.sosRed,
    fontWeight: '600',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: Palette.secondaryText,
    marginBottom: 6,
  },
  input: {
    minHeight: 50,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Palette.primaryText,
    marginBottom: 14,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginVertical: 10,
    minHeight: 48,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Palette.borders,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: Palette.insetSurfaces,
  },
  checkboxChecked: {
    backgroundColor: Palette.primaryViolet,
    borderColor: Palette.primaryViolet,
  },
  checkMark: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    color: Palette.secondaryText,
    lineHeight: 18,
  },
  cta: {
    marginTop: 14,
  },
  linkBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  linkText: {
    fontSize: 14,
    color: Palette.secondaryText,
  },
});
