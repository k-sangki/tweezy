import { StatusBar } from 'expo-status-bar';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { applyFilters, type Stock } from '@tweezy/core';
import { StockListItem } from '@tweezy/ui';

const sampleStocks: Stock[] = [
  {
    ticker: '005930',
    name: '삼성전자',
    market: 'KOSPI',
    price: 71500,
    marketCap: 426_000_000_000_000,
    per: 12.4,
    pbr: 1.3,
    dividendYield: 2.1,
  },
  {
    ticker: '035420',
    name: 'NAVER',
    market: 'KOSPI',
    price: 198000,
    marketCap: 32_000_000_000_000,
    per: 21.8,
    pbr: 2.0,
    dividendYield: 0.6,
  },
  {
    ticker: '247540',
    name: '에코프로비엠',
    market: 'KOSDAQ',
    price: 152000,
    marketCap: 14_500_000_000_000,
    per: 45.2,
    pbr: 5.1,
    dividendYield: null,
  },
];

const screenedStocks = applyFilters(sampleStocks, { maxPer: 25 });

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Tweezy 스크리너</Text>
      <FlatList
        data={screenedStocks}
        keyExtractor={(stock) => stock.ticker}
        renderItem={({ item }) => <StockListItem stock={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: 60,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
});
