import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../lib/theme';
import { ScreenerProvider } from '../lib/ScreenerContext';

const screenOptions = {
  headerStyle: { backgroundColor: colors.surface },
  headerShadowVisible: false,
  headerTintColor: colors.text,
  headerTitleStyle: { color: colors.text, fontWeight: '700' as const },
  contentStyle: { backgroundColor: colors.background },
};

export default function RootLayout() {
  return (
    <ScreenerProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={screenOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="screener" options={{ title: 'Tweezy 스크리너' }} />
        <Stack.Screen name="stock/[ticker]" options={{ title: '종목 상세' }} />
        <Stack.Screen name="filters" options={{ title: '필터', presentation: 'modal' }} />
      </Stack>
    </ScreenerProvider>
  );
}
