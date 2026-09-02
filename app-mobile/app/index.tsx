import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export default function TitleScreen() {
  const router = useRouter();

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  brand: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 40,
    fontWeight: '800',
    color: '#0a7ea4',
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginTop: 8,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 8,
    backgroundColor: '#0a7ea4',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
