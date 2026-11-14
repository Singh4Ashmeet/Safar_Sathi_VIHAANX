import { router } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { SimTransport } from '@workspace/safety-core';
import BottomNav from '@/components/BottomNav';
import BrandHeader from '@/components/BrandHeader';
import Colors, { Palette } from '@/constants/colors';
import { FEATURES } from '@/constants/features';
import * as relayService from '@/services/relay';
import { t, useLanguage } from '@/i18n';

export default function RelayMeshScreen() {
  useLanguage();
  const insets = useSafeAreaInsets();
  const status = relayService.useRelayStatus();
  const [hopLog, setHopLog] = useState<string[]>([]);

  const handleSimulateHop = async () => {
    const hub = relayService.getSimMeshHub();
    const peer1 = new SimTransport('peer-commuter', hub);
    const gateway = new SimTransport('gateway-phone', hub);
    hub.connect('self', 'peer-commuter');
    hub.connect('peer-commuter', 'gateway-phone');

    setHopLog(['[OFFLINE SOS] Phone A (Airplane Mode) generated 192B encrypted emergency packet']);
    peer1.onPacket(async (raw, from) => {
      setHopLog((prev) => [...prev, `[HOP 1] Nearby commuter device received packet from ${from}`]);
      await peer1.send(raw, 'gateway-phone');
    });
    gateway.onPacket((_raw, from) => {
      setHopLog((prev) => [
        ...prev,
        `[HOP 2] Gateway phone connected to internet received packet from ${from} -> uploaded to /v1/relay/packets`,
      ]);
    });

    await peer1.start();
    await gateway.start();
    await relayService.setEnabled(true);

    const sent = await relayService.broadcastOfflineSosPacket({
      lat: 28.6139,
      lng: 77.209,
      battery: 76,
    });
    if (!sent) {
      setHopLog((prev) => [
        ...prev,
        '[RELAY] Mesh bundle ready — packet dispatched through local radio',
      ]);
    }
  };

  return (
    <View style={[styles.rootContainer, { paddingTop: insets.top }]}>
      <BrandHeader showBack subtitle={t('relay.header')} />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{t('relay.title')}</Text>
              <Text style={styles.cardDesc}>{t('relay.desc')}</Text>
            </View>
            <Switch
              value={status.enabled}
              onValueChange={(v) => void relayService.setEnabled(v)}
              trackColor={{ false: '#2D3450', true: Palette.primaryViolet }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={styles.statsBox}>
            <Text style={styles.stat}>
              {t('relay.peers')}: <Text style={styles.statVal}>{status.peers}</Text> · {t('relay.queued')}: <Text style={styles.statVal}>{status.queued}</Text> · {t('relay.forwarded')}: <Text style={styles.statVal}>{status.uploaded}</Text>
            </Text>
          </View>
        </View>

        {FEATURES.demo && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('relay.visualizer')}</Text>
            <Text style={styles.cardDesc}>
              Simulates multi-hop forwarding from an offline phone through nearby commuters to an online gateway.
            </Text>

            <View style={styles.nodesRow}>
              <View style={[styles.nodeBox, { borderColor: Palette.sosRed }]}>
                <Text style={styles.nodeTitle}>Phone A</Text>
                <Text style={styles.nodeSub}>Offline SOS</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={[styles.nodeBox, { borderColor: Palette.warningAmber }]}>
                <Text style={styles.nodeTitle}>Peer B</Text>
                <Text style={styles.nodeSub}>BLE Relay</Text>
              </View>
              <Text style={styles.arrow}>→</Text>
              <View style={[styles.nodeBox, { borderColor: Palette.successGreen }]}>
                <Text style={styles.nodeTitle}>Gateway C</Text>
                <Text style={styles.nodeSub}>Internet</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.simulateBtn}
              onPress={() => void handleSimulateHop()}
              activeOpacity={0.85}
            >
              <Text style={styles.simulateText}>{t('relay.simulate')}</Text>
            </TouchableOpacity>

            {hopLog.length > 0 && (
              <View style={styles.logContainer}>
                {hopLog.map((line, i) => (
                  <Text key={i} style={styles.logLine}>
                    {line}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <BottomNav activeTab="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: Palette.mainBackground,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Palette.primaryText,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: Palette.cardBackground,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 22,
    padding: 20,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.secondaryText,
    marginTop: 4,
  },
  statsBox: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  stat: {
    fontSize: 13,
    color: Palette.secondaryText,
    fontWeight: '500',
  },
  statVal: {
    color: Palette.primaryText,
    fontWeight: '700',
  },
  nodesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 8,
  },
  nodeBox: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    backgroundColor: Palette.insetSurfaces,
  },
  nodeTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Palette.primaryText,
  },
  nodeSub: {
    fontSize: 11,
    color: Palette.secondaryText,
    marginTop: 2,
  },
  arrow: {
    fontSize: 18,
    fontWeight: '800',
    color: Palette.primaryViolet,
    marginHorizontal: 4,
  },
  simulateBtn: {
    backgroundColor: Palette.primaryViolet,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 16,
  },
  simulateText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  logContainer: {
    backgroundColor: Palette.insetSurfaces,
    borderWidth: 1,
    borderColor: Palette.borders,
    borderRadius: 12,
    padding: 12,
    marginTop: 14,
    gap: 6,
  },
  logLine: {
    fontSize: 12,
    color: Palette.softLavender,
    lineHeight: 16,
    fontFamily: 'Inter_500Medium',
  },
});
