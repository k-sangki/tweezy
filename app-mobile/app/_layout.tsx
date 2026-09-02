import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ScreenerProvider } from '../lib/ScreenerContext';

export default function RootLayout() {
  return (
    <ScreenerProvider>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Tweezy 스크리너' }} />
        <Stack.Screen name="stock/[ticker]" options={{ title: '종목 상세' }} />
        <Stack.Screen name="filters" options={{ title: '필터', presentation: 'modal' }} />
      </Stack>
    </ScreenerProvider>
  );
}
