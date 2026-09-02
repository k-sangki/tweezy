import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { DartClient, DartApiError, type Disclosure } from '@tweezy/core';
import { useScreener } from '../../lib/ScreenerContext';

// EXPO_PUBLIC_* vars are inlined into the client bundle at build time, so
// this key is not actually secret once the app ships - fine for local dev,
// but a production build should route disclosure search through a small
// server-side proxy that holds DART_API_KEY instead of embedding it here.
const DART_API_KEY = process.env.EXPO_PUBLIC_DART_API_KEY;

function useDisclosures(corpCode: string | null | undefined) {
  const [disclosures, setDisclosures] = useState<Disclosure[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'done'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!corpCode || !DART_API_KEY) {
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const client = new DartClient({ apiKey: DART_API_KEY });
    client
      .searchDisclosures({ corpCode, pageCount: 20 })
      .then((result) => {
        if (cancelled) return;
        setDisclosures(result.items);
        setStatus('done');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(error instanceof DartApiError ? error.message : '공시를 불러오지 못했습니다.');
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [corpCode]);

  return { disclosures, status, errorMessage };
}

export default function StockDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { stocks } = useScreener();
  const stock = stocks.find((item) => item.ticker === ticker);
  const { disclosures, status, errorMessage } = useDisclosures(stock?.corpCode);

  if (!stock) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>종목을 찾을 수 없습니다.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{stock.name}</Text>
        <Text style={styles.subtitle}>
          {stock.market} · {stock.ticker}
        </Text>
        <Text style={styles.price}>{stock.price.toLocaleString('ko-KR')}원</Text>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="PER" value={stock.per} />
        <Metric label="PBR" value={stock.pbr} />
        <Metric label="배당수익률" value={stock.dividendYield} suffix="%" />
      </View>

      <Text style={styles.sectionTitle}>공시</Text>
      {!stock.corpCode ? (
        <Text style={styles.empty}>이 종목의 corpCode 정보가 없어 공시를 불러올 수 없습니다.</Text>
      ) : !DART_API_KEY ? (
        <Text style={styles.empty}>
          EXPO_PUBLIC_DART_API_KEY가 설정되지 않아 공시를 불러올 수 없습니다.
        </Text>
      ) : status === 'loading' ? (
        <Text style={styles.empty}>불러오는 중...</Text>
      ) : status === 'error' ? (
        <Text style={styles.empty}>{errorMessage}</Text>
      ) : (
        <FlatList
          data={disclosures}
          keyExtractor={(item) => item.receiptNo}
          renderItem={({ item }) => <DisclosureRow disclosure={item} />}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.empty}>최근 공시가 없습니다.</Text>}
        />
      )}
    </View>
  );
}

function Metric({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value == null ? '-' : `${value}${suffix ?? ''}`}</Text>
    </View>
  );
}

function DisclosureRow({ disclosure }: { disclosure: Disclosure }) {
  return (
    <View style={styles.disclosureRow}>
      <Text style={styles.disclosureReport} numberOfLines={2}>
        {disclosure.reportName}
      </Text>
      <Text style={styles.disclosureMeta}>
        {disclosure.receivedDate} · {disclosure.filerName}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  header: {
    marginBottom: 20,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
  },
  price: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#888',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  separator: {
    height: 1,
    backgroundColor: '#eee',
  },
  disclosureRow: {
    paddingVertical: 10,
  },
  disclosureReport: {
    fontSize: 14,
    fontWeight: '500',
  },
  disclosureMeta: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  empty: {
    color: '#888',
    marginTop: 8,
  },
});
