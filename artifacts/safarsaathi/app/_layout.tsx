import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@workspace/api-client-react';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import OpeningScreen from '@/components/OpeningScreen';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { GuardianProvider } from '@/context/GuardianContext';
import { TripProvider } from '@/context/TripContext';
import { loadLanguage } from '@/i18n';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const segments = useSegments();

  useEffect(() => {
    void loadLanguage();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    const isAuthScreen = segments[0] === 'login' || segments[0] === 'signup';
    if (!user && !isAuthScreen) {
      router.replace('/login');
    } else if (user && isAuthScreen) {
      router.replace('/');
    }
  }, [user, isLoading, segments]);

  return <>{children}</>;
}

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="welcome" />
      <Stack.Screen name="index" />
      <Stack.Screen name="login" />
      <Stack.Screen name="signup" />
      <Stack.Screen name="onboarding" />
      <Stack.Screen name="start-trip" />
      <Stack.Screen name="trip" />
      <Stack.Screen name="prompt" />
      <Stack.Screen name="sos" />
      <Stack.Screen name="pin" />
      <Stack.Screen name="guardians" />
      <Stack.Screen name="watch" />
      <Stack.Screen name="map" />
      <Stack.Screen name="ride" />
      <Stack.Screen name="fake-call" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="relay" />
      <Stack.Screen name="calculator" />
    </Stack>
  );
}

export default function RootLayout() {
  const [hasShownOpening, setHasShownOpening] = React.useState(false);
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GuardianProvider>
              <TripProvider>
                <GestureHandlerRootView style={{ flex: 1 }}>
                  <KeyboardProvider>
                    {!hasShownOpening ? (
                      <OpeningScreen onFinish={() => setHasShownOpening(true)} />
                    ) : (
                      <AuthGate>
                        <RootLayoutNav />
                      </AuthGate>
                    )}
                  </KeyboardProvider>
                </GestureHandlerRootView>
              </TripProvider>
            </GuardianProvider>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
