import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';

export interface StockListItemProps {
  stock: Stock;
  onPress?: (stock: Stock) => void;
}

export function StockListItem({ stock, onPress }: StockListItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={onPress ? () => onPress(stock) : undefined}
    >
      <View>
        <Text style={styles.name}>{stock.name}</Text>
        <Text style={styles.ticker}>
          {stock.market} · {stock.ticker}
        </Text>
      </View>
      <Text style={styles.price}>{stock.price.toLocaleString('ko-KR')}원</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  containerPressed: {
    backgroundColor: '#F9FAFB',
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: '#191F28',
  },
  ticker: {
    fontSize: 12,
    color: '#8B95A1',
    marginTop: 2,
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#191F28',
  },
});
