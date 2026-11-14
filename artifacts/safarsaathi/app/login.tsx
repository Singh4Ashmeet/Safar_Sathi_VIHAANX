import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import BigButton from '@/components/BigButton';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import Colors, { Palette } from '@/constants/colors';
import { useAuth } from '@/context/AuthContext';
import { t, useLanguage } from '@/i18n';

export default function LoginScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Quick student demo bypass button
  const handleQuickDemo = async () => {
    setLoading(true);
    try {
      await login('student@safarsaathi.in', 'SafeSafar2026!');
      router.replace('/');
    } catch {
      router.replace('/');
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

      <Text style={styles.screenTitle}>Welcome back</Text>
      <Text style={styles.screenSubtitle}>{t('auth.loginSubtitle')}</Text>

      {error && (
        <View style={styles.errBox}>
          <Text style={styles.errText}>{error}</Text>
        </View>
      )}

      <Text style={styles.label}>{t('auth.emailLabel')}</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="student@safarsaathi.in"
        placeholderTextColor={Palette.mutedText}
      />

      <Text style={styles.label}>{t('auth.passwordLabel')}</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={Palette.mutedText}
      />

      <BigButton
        label={t('auth.loginCta')}
        onPress={handleLogin}
        loading={loading}
        style={styles.cta}
      />

      <TouchableOpacity
        style={styles.quickDemoBtn}
        onPress={() => void handleQuickDemo()}
        activeOpacity={0.8}
      >
        <Text style={styles.quickDemoText}>{t('auth.quickDemo')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/signup')}>
        <Text style={styles.linkText}>{t('auth.newUser')} <Text style={{ color: Palette.softLavender, fontWeight: '700' }}>{t('auth.createAccount')}</Text></Text>
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
    marginBottom: 24,
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
    shadowColor: Palette.primaryViolet,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
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
    marginBottom: 24,
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
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Palette.primaryText,
    marginBottom: 16,
  },
  cta: {
    marginTop: 8,
  },
  quickDemoBtn: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  quickDemoText: {
    color: Palette.softLavender,
    fontSize: 14,
    fontWeight: '700',
  },
  linkBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  linkText: {
    fontSize: 14,
    color: Palette.secondaryText,
  },
});
