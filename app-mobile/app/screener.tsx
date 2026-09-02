import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';
import { StockListItem } from '@tweezy/ui';
import { colors, radius, spacing } from '../lib/theme';
import { useScreener } from '../lib/ScreenerContext';

export default function ScreenerListScreen() {
  const router = useRouter();
  const { filteredStocks, isLiveData, isLoading } = useScreener();

  const openStock = (stock: Stock) => router.push(`/stock/${stock.ticker}`);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>
          <Text style={styles.countNumber}>{filteredStocks.length}</Text>개 종목
          {isLoading ? ' · 불러오는 중' : !isLiveData ? ' · 샘플 데이터' : ''}
        </Text>
        <Pressable style={styles.filterButton} onPress={() => router.push('/filters')} hitSlop={8}>
          <Text style={styles.filterButtonText}>필터</Text>
        </Pressable>
      </View>
      <View style={styles.listCard}>
        <FlatList
          data={filteredStocks}
          keyExtractor={(stock) => stock.ticker}
          renderItem={({ item }) => <StockListItem stock={item} onPress={openStock} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>조건에 맞는 종목이 없습니다.</Text>}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  count: {
    fontSize: 14,
    color: colors.textMuted,
  },
  countNumber: {
    color: colors.text,
    fontWeight: '700',
  },
  filterButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  listCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.md,
  },
  separator: {
    height: 1,
    backgroundColor: colors.border,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: colors.textMuted,
  },
});
