import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';
import { StockListItem } from '@tweezy/ui';
import { ScreenerFilters } from '../components/ScreenerFilters';
import { useTheme, spacing, type Palette } from '../lib/theme';
import { sessionChangeLabel } from '../lib/sessionLabel';
import { useScreener } from '../lib/ScreenerContext';

export default function ScreenerListScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { filteredStocks, isLiveData, isLoading, feedDate } = useScreener();

  const openStock = (stock: Stock) => router.push(`/stock/${stock.ticker}`);

  return (
    <View style={styles.container}>
      <FlatList
        data={filteredStocks}
        keyExtractor={(stock) => stock.ticker}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => <StockListItem stock={item} onPress={openStock} palette={colors} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.empty}>조건에 맞는 종목이 없습니다.</Text>}
        ListHeaderComponent={
          <>
            {feedDate ? <Text style={styles.sessionLabel}>{sessionChangeLabel(feedDate)}</Text> : null}
            <ScreenerFilters />
            <View style={styles.countRow}>
              <Text style={styles.count}>
                <Text style={styles.countNumber}>{filteredStocks.length}</Text>개 종목
                {isLoading ? ' · 불러오는 중' : !isLiveData ? ' · 샘플 데이터' : ''}
              </Text>
            </View>
          </>
        }
      />
    </View>
  );
}

const createStyles = (colors: Palette) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    sessionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textMuted,
      textAlign: 'center',
      paddingTop: spacing.sm,
    },
    countRow: {
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
