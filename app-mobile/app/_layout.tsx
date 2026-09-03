import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text } from 'react-native';
import { ThemeProvider, radius, useTheme } from '../lib/theme';
import { ScreenerProvider } from '../lib/ScreenerContext';

function ThemeToggle() {
  const { theme, toggleTheme, colors } = useTheme();
  return (
    <Pressable
      onPress={toggleTheme}
      hitSlop={12}
      accessibilityLabel={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
      style={[styles.toggle, { backgroundColor: colors.surfaceMuted, borderColor: colors.border }]}
    >
      <Text style={[styles.toggleIcon, { color: colors.text }]}>◐</Text>
    </Pressable>
  );
}

function RootStack() {
  const { theme, colors } = useTheme();

  return (
    <>
      <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text, fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
          headerRight: () => <ThemeToggle />,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="screener" options={{ title: 'Tweezy 스크리너' }} />
        <Stack.Screen name="stock/[ticker]" options={{ title: '종목 상세' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ScreenerProvider>
        <RootStack />
      </ScreenerProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  toggle: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleIcon: {
    fontSize: 16,
  },
});
