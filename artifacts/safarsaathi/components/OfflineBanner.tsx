import React, { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Colors, { Palette } from '@/constants/colors';
import { t, useLanguage } from '@/i18n';
import { probeInternet, useConnectivityMode } from '@/services/connectivity';
import { setEnabled as setRelayEnabled, useRelayStatus } from '@/services/relay';

export default function OfflineBanner() {
  useLanguage();
  const { isInternetOnline, serverState, isWaking } = useConnectivityMode();
  const relay = useRelayStatus();
  const [probing, setProbing] = useState(false);

  // Active mode resolution:
  // If user enabled BLE relay, show BLE Mesh mode.
  // Else if internet is active, show Internet mode.
  // Otherwise, show Offline (SMS Fallback) mode.
  const isBleMode = relay.enabled;
  const isInternetMode = !isBleMode && isInternetOnline;
  const isOfflineMode = !isBleMode && !isInternetOnline;

  const handleToggleMode = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setProbing(true);
    try {
      if (isBleMode) {
        // Switch back to Internet mode
        await setRelayEnabled(false);
        await probeInternet();
      } else {
        // Switch to BLE Relay mode
        await setRelayEnabled(true);
      }
    } finally {
      setProbing(false);
    }
  };

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setProbing(true);
    try {
      await probeInternet();
    } finally {
      setProbing(false);
    }
  };

  if (isWaking) {
    return (
      <View style={[styles.banner, styles.wakingBanner]}>
        <View style={styles.iconCircleAmber}>
          <ActivityIndicator size="small" color={Palette.warningAmber} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.titleAmber}>Server Waking Up...</Text>
          <Text style={styles.subAmber}>Free-tier cloud warm up (approx 15-30s)</Text>
        </View>
      </View>
    );
  }

  if (isInternetMode) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.internetBanner]}
        onPress={handleRefresh}
        activeOpacity={0.8}
      >
        <View style={styles.leftRow}>
          <View style={styles.iconCircleGreen}>
            <Feather name="wifi" size={16} color={Palette.successGreen} />
          </View>
          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.titleGreen}>Internet Mode Active</Text>
              <View style={styles.liveGreenDot} />
            </View>
            <Text style={styles.subGreen}>Cloud Sync & Live SOS Stream Online</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.modeSwitchBtn}
          onPress={handleToggleMode}
          activeOpacity={0.7}
        >
          {probing ? (
            <ActivityIndicator size="small" color={Palette.softLavender} />
          ) : (
            <Text style={styles.modeSwitchText}>Use BLE</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  if (isBleMode) {
    return (
      <TouchableOpacity
        style={[styles.banner, styles.bleBanner]}
        onPress={handleToggleMode}
        activeOpacity={0.8}
      >
        <View style={styles.leftRow}>
          <View style={styles.iconCircleViolet}>
            <MaterialCommunityIcons
              name="bluetooth-connect"
              size={18}
              color={Palette.primaryViolet}
            />
          </View>
          <View style={styles.textWrap}>
            <View style={styles.titleRow}>
              <Text style={styles.titleViolet}>BLE Relay Mode Active</Text>
              <View style={styles.liveVioletDot} />
            </View>
            <Text style={styles.subViolet}>
              Mesh forwarding active ({relay.peers} peer{relay.peers === 1 ? '' : 's'})
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.modeSwitchBtnViolet}
          onPress={handleToggleMode}
          activeOpacity={0.7}
        >
          {probing ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.modeSwitchTextViolet}>Use Internet</Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  // Pure Offline fallback
  return (
    <View style={[styles.banner, styles.offlineBanner]}>
      <View style={styles.leftRow}>
        <View style={styles.iconCircleAmber}>
          <Feather name="alert-triangle" size={16} color={Palette.warningAmber} />
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.titleAmber}>Offline Mode · SMS Fallback</Text>
          <Text style={styles.subAmber}>No internet detected. Tap to switch to BLE.</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.enableBleBtn}
        onPress={handleToggleMode}
        activeOpacity={0.7}
      >
        <Text style={styles.enableBleText}>Enable BLE</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    marginBottom: 4,
    borderWidth: 1,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  textWrap: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  // Internet Mode Styles (Green)
  internetBanner: {
    backgroundColor: 'rgba(0, 184, 135, 0.08)',
    borderColor: 'rgba(0, 184, 135, 0.35)',
  },
  iconCircleGreen: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 184, 135, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleGreen: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Palette.successGreen,
  },
  subGreen: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 1,
  },
  liveGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.successGreen,
  },
  // BLE Mode Styles (Violet)
  bleBanner: {
    backgroundColor: 'rgba(124, 77, 255, 0.12)',
    borderColor: 'rgba(124, 77, 255, 0.45)',
  },
  iconCircleViolet: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(124, 77, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleViolet: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Palette.softLavender,
  },
  subViolet: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 1,
  },
  liveVioletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Palette.primaryViolet,
  },
  // Offline & Waking Banner Styles (Amber)
  offlineBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  wakingBanner: {
    backgroundColor: 'rgba(232, 155, 21, 0.12)',
    borderColor: Palette.warningAmber,
  },
  iconCircleAmber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleAmber: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
    color: Palette.warningAmber,
  },
  subAmber: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
    marginTop: 1,
  },
  // Buttons
  modeSwitchBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 8,
  },
  modeSwitchText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: Palette.softLavender,
  },
  modeSwitchBtnViolet: {
    backgroundColor: 'rgba(124, 77, 255, 0.25)',
    borderWidth: 1,
    borderColor: Palette.primaryViolet,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginLeft: 8,
  },
  modeSwitchTextViolet: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#FFFFFF',
  },
  enableBleBtn: {
    backgroundColor: Palette.warningAmber,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  enableBleText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    color: '#0A0D18',
  },
});

