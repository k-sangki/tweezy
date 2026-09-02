import { useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';
import { StockListItem } from '@tweezy/ui';
import { useScreener } from '../lib/ScreenerContext';

export default function ScreenerListScreen() {
  const router = useRouter();
  const { filteredStocks, isLiveData, isLoading } = useScreener();

  const openStock = (stock: Stock) => router.push(`/stock/${stock.ticker}`);

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <Text style={styles.count}>
          {filteredStocks.length}개 종목
          {isLoading ? ' · 불러오는 중' : !isLiveData ? ' · 샘플 데이터' : ''}
        </Text>
        <Pressable onPress={() => router.push('/filters')} hitSlop={8}>
          <Text style={styles.filterLink}>필터</Text>
        </Pressable>
      </View>
      <FlatList
        data={filteredStocks}
        keyExtractor={(stock) => stock.ticker}
        renderItem={({ item }) => <StockListItem stock={item} onPress={openStock} />}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.empty}>조건에 맞는 종목이 없습니다.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  count: {
    fontSize: 14,
    color: '#666',
  },
  filterLink: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a7ea4',
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
    marginLeft: 16,
  },
  empty: {
    textAlign: 'center',
    marginTop: 40,
    color: '#888',
  },
});
