import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, radius, spacing, type Palette } from '../lib/theme';

export default function TitleScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.brand}>
        <Text style={styles.title}>Tweezy</Text>
        <Text style={styles.subtitle}>한국 주식 스크리너</Text>
      </View>
      <Pressable style={styles.button} onPress={() => router.replace('/screener')}>
        <Text style={styles.buttonText}>시작하기</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    brand: {
      alignItems: 'center',
      marginBottom: spacing.xl,
    },
    title: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -1,
    },
    subtitle: {
      fontSize: 15,
      color: colors.textMuted,
      marginTop: spacing.sm,
    },
    button: {
      paddingVertical: 16,
      paddingHorizontal: 40,
      borderRadius: radius.md,
      backgroundColor: colors.accent,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
    },
  });
