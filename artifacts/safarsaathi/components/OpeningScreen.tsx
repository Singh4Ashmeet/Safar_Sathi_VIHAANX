import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';

interface OpeningScreenProps {
  onFinish: () => void;
  autoAdvanceMs?: number;
}

export default function OpeningScreen({
  onFinish,
  autoAdvanceMs = 2800,
}: OpeningScreenProps) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.97)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);

  const handleDone = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      onFinish();
    });
  };

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: autoAdvanceMs,
        useNativeDriver: false,
      }),
    ]).start();

    const timer = setTimeout(() => {
      handleDone();
    }, autoAdvanceMs);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleDone}
      style={styles.container}
    >
      {/* Full screen background artwork */}
      <Animated.View
        style={[
          styles.imageContainer,
          {
            opacity: fadeAnim,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <Image
          source={require('@/assets/images/splash-art.png')}
          style={styles.artwork}
          resizeMode="cover"
        />
      </Animated.View>

      {/* Top spacer for status bar */}
      <View style={[styles.topSpacer, { height: insets.top + 8 }]} />

      {/* Bottom Action Area */}
      <View style={[styles.bottomArea, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.enterButton}
            onPress={handleDone}
            activeOpacity={0.8}
          >
            <Text style={styles.enterButtonText}>Get Started</Text>
            <Feather name="arrow-right" size={15} color="#FFFFFF" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        </View>

        {/* Minimalist animated progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressBar,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#070B16',
    justifyContent: 'space-between',
  },
  imageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#070B16',
  },
  artwork: {
    width: '100%',
    height: '100%',
  },
  topSpacer: {
    width: '100%',
  },
  bottomArea: {
    paddingHorizontal: 28,
    alignItems: 'center',
    zIndex: 10,
  },
  actionRow: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  enterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 91, 255, 0.92)',
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(167, 180, 255, 0.4)',
    shadowColor: '#635BFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
  enterButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#635BFF',
  },
});
