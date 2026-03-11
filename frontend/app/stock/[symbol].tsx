import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LineChart } from 'react-native-gifted-charts';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const PERIODS = [
  { label: '1W', value: '5d' },
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
];

interface Holding {
  id: string;
  symbol: string;
  shares: number;
  avg_price: number;
}

interface Quote {
  price: number;
  previous_close: number;
  day_high: number;
  day_low: number;
  market_cap: number;
}

interface ChartPoint {
  value: number;
  label?: string;
  dataPointText?: string;
}

export default function StockDetail() {
  const router = useRouter();
  const { symbol, holdingId, portfolioId } = useLocalSearchParams<{ symbol: string; holdingId: string; portfolioId: string }>();
  const [holding, setHolding] = useState<Holding | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState('1mo');
  const [loading, setLoading] = useState(true);
  const [chartLoading, setChartLoading] = useState(false);

  const fetchHolding = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/holdings`);
      const data: Holding[] = await res.json();
      const found = data.find((h) => h.id === holdingId || h.symbol === symbol);
      if (found) setHolding(found);
    } catch (err) {
      console.error('Error fetching holding:', err);
    }
  }, [holdingId, symbol]);

  const fetchQuote = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/stocks/quotes?symbols=${symbol}`);
      const data = await res.json();
      if (data[symbol as string]) setQuote(data[symbol as string]);
    } catch (err) {
      console.error('Error fetching quote:', err);
    }
  }, [symbol]);

  const fetchHistory = useCallback(async (period: string) => {
    setChartLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/stocks/history/${symbol}?period=${period}`);
      const data = await res.json();
      if (data.data && data.data.length > 0) {
        const step = Math.max(1, Math.floor(data.data.length / 20));
        const points: ChartPoint[] = data.data
          .filter((_: unknown, i: number) => i % step === 0 || i === data.data.length - 1)
          .map((d: { close: number; date: string }, i: number) => ({
            value: d.close,
            label: i % 4 === 0 ? d.date.slice(5) : '',
          }));
        setChartData(points);
      }
    } catch (err) {
      console.error('Error fetching history:', err);
    } finally {
      setChartLoading(false);
    }
  }, [symbol]);

  useEffect(() => {
    Promise.all([fetchHolding(), fetchQuote(), fetchHistory(selectedPeriod)]).then(() =>
      setLoading(false)
    );
  }, [fetchHolding, fetchQuote, fetchHistory, selectedPeriod]);

  const handleDelete = () => {
    Alert.alert('Delete Holding', `Remove ${symbol} from portfolio?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await fetch(`${API_URL}/api/holdings/${holdingId}`, { method: 'DELETE' });
            router.back();
          } catch (err) {
            console.error(err);
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
      </SafeAreaView>
    );
  }

  const price = quote?.price || 0;
  const prevClose = quote?.previous_close || 0;
  const dayChange = price - prevClose;
  const dayChangePct = prevClose > 0 ? (dayChange / prevClose) * 100 : 0;
  const isDayPositive = dayChange >= 0;

  const currentValue = holding ? price * holding.shares : 0;
  const costBasis = holding ? holding.avg_price * holding.shares : 0;
  const totalGain = currentValue - costBasis;
  const totalGainPct = costBasis > 0 ? (totalGain / costBasis) * 100 : 0;
  const isGainPositive = totalGain >= 0;

  const chartColor = isDayPositive ? '#4ADE80' : '#F87171';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            testID="back-btn"
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={24} color="#FAFAFA" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerSymbol}>{symbol}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              testID="edit-holding-btn"
              style={styles.actionBtn}
              activeOpacity={0.7}
              onPress={() =>
                router.push({
                  pathname: '/add-holding',
                  params: { editId: holdingId, editSymbol: symbol, editShares: String(holding?.shares), editAvgPrice: String(holding?.avg_price), portfolioId: portfolioId },
                })
              }
            >
              <Feather name="edit-2" size={18} color="#A1A1AA" />
            </TouchableOpacity>
            <TouchableOpacity
              testID="delete-holding-btn"
              style={styles.actionBtn}
              activeOpacity={0.7}
              onPress={handleDelete}
            >
              <Feather name="trash-2" size={18} color="#F87171" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Price Section */}
        <View style={styles.priceSection}>
          <Text style={styles.currentPrice}>${price.toFixed(2)}</Text>
          <View style={[styles.changeBadge, isDayPositive ? styles.greenBg : styles.redBg]}>
            <Feather
              name={isDayPositive ? 'trending-up' : 'trending-down'}
              size={14}
              color={isDayPositive ? '#4ADE80' : '#F87171'}
            />
            <Text style={[styles.changeVal, isDayPositive ? styles.greenText : styles.redText]}>
              {isDayPositive ? '+' : ''}${Math.abs(dayChange).toFixed(2)} ({dayChangePct >= 0 ? '+' : ''}{dayChangePct.toFixed(2)}%)
            </Text>
          </View>
        </View>

        {/* Chart */}
        <View style={styles.chartContainer}>
          {chartLoading ? (
            <View style={styles.chartPlaceholder}>
              <ActivityIndicator size="small" color="#6366F1" />
            </View>
          ) : chartData.length > 0 ? (
            <LineChart
              data={chartData}
              width={320}
              height={180}
              color={chartColor}
              thickness={2}
              hideDataPoints
              curved
              startFillColor={chartColor}
              endFillColor="transparent"
              startOpacity={0.2}
              endOpacity={0}
              areaChart
              yAxisColor="transparent"
              xAxisColor="#27272A"
              yAxisTextStyle={{ color: '#52525B', fontSize: 10, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) }}
              xAxisLabelTextStyle={{ color: '#52525B', fontSize: 9 }}
              noOfSections={4}
              rulesColor="#1a1a1d"
              spacing={16}
            />
          ) : (
            <View style={styles.chartPlaceholder}>
              <Text style={styles.noDataText}>No chart data</Text>
            </View>
          )}
        </View>

        {/* Period Selector */}
        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <TouchableOpacity
              key={p.value}
              testID={`period-${p.value}`}
              style={[styles.periodBtn, selectedPeriod === p.value && styles.periodBtnActive]}
              activeOpacity={0.7}
              onPress={() => {
                setSelectedPeriod(p.value);
                fetchHistory(p.value);
              }}
            >
              <Text style={[styles.periodText, selectedPeriod === p.value && styles.periodTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Position Details */}
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Your Position</Text>
          <View style={styles.detailGrid}>
            <DetailRow label="Shares" value={holding ? String(holding.shares) : '-'} />
            <DetailRow label="Avg Cost" value={holding ? `$${holding.avg_price.toFixed(2)}` : '-'} />
            <DetailRow label="Cost Basis" value={`$${costBasis.toFixed(2)}`} />
            <DetailRow label="Current Value" value={`$${currentValue.toFixed(2)}`} />
            <DetailRow
              label="Total Gain/Loss"
              value={`${isGainPositive ? '+' : ''}$${totalGain.toFixed(2)}`}
              valueColor={isGainPositive ? '#4ADE80' : '#F87171'}
            />
            <DetailRow
              label="Return"
              value={`${isGainPositive ? '+' : ''}${totalGainPct.toFixed(2)}%`}
              valueColor={isGainPositive ? '#4ADE80' : '#F87171'}
            />
          </View>
        </View>

        {/* Market Data */}
        {quote && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>Market Data</Text>
            <View style={styles.detailGrid}>
              <DetailRow label="Previous Close" value={`$${quote.previous_close.toFixed(2)}`} />
              <DetailRow label="Day High" value={`$${quote.day_high.toFixed(2)}`} />
              <DetailRow label="Day Low" value={`$${quote.day_low.toFixed(2)}`} />
              {quote.market_cap > 0 && (
                <DetailRow
                  label="Market Cap"
                  value={
                    quote.market_cap >= 1e12
                      ? `$${(quote.market_cap / 1e12).toFixed(2)}T`
                      : `$${(quote.market_cap / 1e9).toFixed(2)}B`
                  }
                />
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function DetailRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#09090B',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#09090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerSymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FAFAFA',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceSection: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  currentPrice: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FAFAFA',
    fontFamily: MONO,
  },
  changeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
    marginTop: 8,
  },
  greenBg: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
  },
  redBg: {
    backgroundColor: 'rgba(248, 113, 113, 0.1)',
  },
  changeVal: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: MONO,
  },
  greenText: {
    color: '#4ADE80',
  },
  redText: {
    color: '#F87171',
  },
  chartContainer: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 16,
    marginTop: 16,
    overflow: 'hidden',
  },
  chartPlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noDataText: {
    color: '#52525B',
    fontSize: 14,
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    gap: 8,
  },
  periodBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  periodBtnActive: {
    backgroundColor: '#6366F1',
    borderColor: '#6366F1',
  },
  periodText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#52525B',
  },
  periodTextActive: {
    color: '#FAFAFA',
  },
  detailCard: {
    backgroundColor: '#18181B',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#27272A',
    padding: 16,
    marginTop: 16,
  },
  detailTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FAFAFA',
    marginBottom: 12,
  },
  detailGrid: {},
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f23',
  },
  detailLabel: {
    fontSize: 14,
    color: '#A1A1AA',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FAFAFA',
    fontFamily: MONO,
  },
});
