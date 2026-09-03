import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Stock } from '@tweezy/core';

/**
 * Colours this component needs. Kept as a prop rather than importing an app's
 * theme module, so /ui stays independent of any single app's setup.
 */
export interface StockListItemPalette {
  text: string;
  textMuted: string;
  surfaceMuted: string;
  positive: string;
  negative: string;
}

const DEFAULT_PALETTE: StockListItemPalette = {
  text: '#191F28',
  textMuted: '#8B95A1',
  surfaceMuted: '#F9FAFB',
  positive: '#F04452',
  negative: '#3182F6',
};

export interface StockListItemProps {
  stock: Stock;
  onPress?: (stock: Stock) => void;
  palette?: StockListItemPalette;
}

function formatChangePct(changePct: number | null): string {
  if (changePct == null) return '-';
  const sign = changePct > 0 ? '+' : '';
  return `${sign}${changePct.toFixed(2)}%`;
}

export function StockListItem({ stock, onPress, palette = DEFAULT_PALETTE }: StockListItemProps) {
  const changeColor =
    stock.changePct == null || stock.changePct === 0
      ? palette.textMuted
      : stock.changePct > 0
        ? palette.positive
        : palette.negative;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && { backgroundColor: palette.surfaceMuted }]}
      onPress={onPress ? () => onPress(stock) : undefined}
    >
      <View>
        <Text style={[styles.name, { color: palette.text }]}>{stock.name}</Text>
        <Text style={[styles.ticker, { color: palette.textMuted }]}>
          {stock.market} · {stock.ticker}
        </Text>
      </View>
      <View style={styles.priceBlock}>
        <Text style={[styles.price, { color: palette.text }]}>{stock.price.toLocaleString('ko-KR')}원</Text>
        <Text style={[styles.change, { color: changeColor }]}>{formatChangePct(stock.changePct)}</Text>
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
  name: {
    fontSize: 16,
    fontWeight: '700',
  },
  ticker: {
    fontSize: 12,
    marginTop: 2,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: '600',
  },
  change: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
});
