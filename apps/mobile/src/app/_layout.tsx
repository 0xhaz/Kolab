import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { StatusBar } from 'expo-status-bar';
import { PrivyProvider, usePrivy } from '@privy-io/expo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@/components/toast';
import { RealtimeProvider } from '@/lib/realtime';
import { env } from '@/lib/env';
import { c, ui } from '@/lib/theme';

void SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { isReady, user } = usePrivy();
  if (!isReady) return <View style={ui.screen} />;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: c.background },
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.foreground,
        headerShadowVisible: false,
        headerTransparent: true,
        headerTitleStyle: { fontFamily: 'Outfit_600SemiBold' },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)/login" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(creator)" />
        <Stack.Screen name="campaign/[id]" options={{ headerShown: true, title: 'Campaign' }} />
        <Stack.Screen name="enrollment/[id]" options={{ headerShown: true, title: 'Your campaign' }} />
        <Stack.Screen name="slot/[id]" options={{ headerShown: true, title: 'Deliverable' }} />
        <Stack.Screen name="kit/[id]" options={{ headerShown: true, title: 'Creator kit' }} />
        <Stack.Screen name="studio/[id]" options={{ headerShown: true, title: 'Create content' }} />
        <Stack.Screen name="editor/[id]" options={{ headerShown: true, title: 'Video editor' }} />
        <Stack.Screen name="cashout" options={{ headerShown: true, title: 'Cash out' }} />
        <Stack.Screen name="withdraw" options={{ headerShown: true, title: 'Withdraw USDC' }} />
        <Stack.Screen name="delete-account" options={{ headerShown: true, title: 'Delete account' }} />
        <Stack.Screen name="profile/edit" options={{ headerShown: true, title: 'Edit profile' }} />
        <Stack.Screen
          name="submit/[id]"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.62, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: c.surface } }}
        />
        <Stack.Screen
          name="apply/[id]"
          options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true, sheetCornerRadius: 28, contentStyle: { backgroundColor: c.surface } }}
        />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 5_000 } } }));
  const [fontsLoaded] = useFonts({ Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });
  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);
  if (!fontsLoaded) return null;

  if (!env.privyAppId || !env.privyClientId) {
    return (
      <View style={[ui.screen, { justifyContent: 'center' }]}>
        <Text style={ui.title}>Missing Privy config</Text>
        <Text style={ui.body}>
          Set EXPO_PUBLIC_PRIVY_APP_ID and EXPO_PUBLIC_PRIVY_CLIENT_ID in apps/mobile/.env, then restart Metro.
        </Text>
      </View>
    );
  }

  return (
    <PrivyProvider
      appId={env.privyAppId}
      clientId={env.privyClientId}
      config={{ embedded: { solana: { createOnLogin: 'users-without-wallets' } } }}
    >
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <RealtimeProvider>
            <StatusBar style="light" />
            <RootStack />
          </RealtimeProvider>
        </ToastProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
