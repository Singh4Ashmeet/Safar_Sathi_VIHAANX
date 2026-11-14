import { router } from 'expo-router';
import React from 'react';
import OpeningScreen from '@/components/OpeningScreen';
import { useAuth } from '@/context/AuthContext';

export default function WelcomeScreen() {
  const { user } = useAuth();

  const handleFinish = () => {
    if (user) {
      router.replace('/');
    } else {
      router.replace('/login');
    }
  };

  return <OpeningScreen onFinish={handleFinish} autoAdvanceMs={3500} />;
}

