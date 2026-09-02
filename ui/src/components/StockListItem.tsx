import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';

export interface StockListItemProps {
  stock: Stock;
  onPress?: (stock: Stock) => void;
}

function formatChangePct(changePct: number | null): string {
  if (changePct == null) return '-';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${changePct.toFixed(2)}%`;
}

export function StockListItem({ stock, onPress }: StockListItemProps) {
  const changeStyle =
    stock.changePct == null
      ? styles.changeFlat
      : stock.changePct > 0
        ? styles.changeUp
        : stock.changePct < 0
          ? styles.changeDown
          : styles.changeFlat;

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
      <View style={styles.priceBlock}>
        <Text style={styles.price}>{stock.price.toLocaleString('ko-KR')}원</Text>
        <Text style={[styles.change, changeStyle]}>{formatChangePct(stock.changePct)}</Text>
      </View>
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
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
    color: '#191F28',
  },
  change: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  changeUp: {
    color: '#F04452',
  },
  changeDown: {
    color: '#3182F6',
  },
  changeFlat: {
    color: '#8B95A1',
  },
});
