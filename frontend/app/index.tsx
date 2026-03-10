import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Portfolio {
  id: string;
  name: string;
  created_at: string;
}

interface Holding {
  id: string;
  symbol: string;
  shares: number;
  avg_price: number;
  portfolio_id: string;
}

interface Quote {
  price: number;
  previous_close: number;
}

export default function Dashboard() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('all');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/portfolios`);
      const data: Portfolio[] = await res.json();
      setPortfolios(data);
    } catch (err) {
      console.error('Error fetching portfolios:', err);
    }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const url = selectedPortfolio === 'all'
        ? `${API_URL}/api/holdings`
        : `${API_URL}/api/holdings?portfolio_id=${selectedPortfolio}`;
      const holdingsRes = await fetch(url);
      const holdingsData: Holding[] = await holdingsRes.json();
      setHoldings(holdingsData);

      if (holdingsData.length > 0) {
        const uniqueSymbols = [...new Set(holdingsData.map((h) => h.symbol))];
        const symbols = uniqueSymbols.join(',');
        const quotesRes = await fetch(`${API_URL}/api/stocks/quotes?symbols=${symbols}`);
        const quotesData = await quotesRes.json();
        setQuotes(quotesData);
      } else {
        setQuotes({});
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPortfolio]);

  useEffect(() => {
    fetchPortfolios();
  }, [fetchPortfolios]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPortfolios();
    fetchData();
  };

  const getTotalValue = () =>
    holdings.reduce((sum, h) => sum + (quotes[h.symbol]?.price || 0) * h.shares, 0);

  const getTotalCost = () =>
    holdings.reduce((sum, h) => sum + h.avg_price * h.shares, 0);

  const getTotalDayChange = () =>
    holdings.reduce((sum, h) => {
      const q = quotes[h.symbol];
      return q ? sum + (q.price - q.previous_close) * h.shares : sum;
    }, 0);

  const formatCurrency = (val: number) => {
    if (Math.abs(val) >= 1000000) return `$${(val / 1000000).toFixed(2)}m`;
    if (Math.abs(val) >= 1000) return `$${(val / 1000).toFixed(1)}k`;
    return `$${val.toFixed(2)}`;
  };

  const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

  const totalValue = getTotalValue();
  const totalCost = getTotalCost();
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
  const dayChange = getTotalDayChange();
  const dayChangePct = totalValue - dayChange > 0 ? (dayChange / (totalValue - dayChange)) * 100 : 0;

  const getPortfolioName = (id: string) => portfolios.find((p) => p.id === id)?.name || '';

  const renderHolding = ({ item }: { item: Holding }) => {
    const q = quotes[item.symbol];
    const price = q?.price || 0;
    const prevClose = q?.previous_close || 0;
    const currentValue = price * item.shares;
    const costBasis = item.avg_price * item.shares;
    const gain = currentValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const dayChgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const isPositive = gain >= 0;
    const isDayPositive = dayChgPct >= 0;

    return (
      <TouchableOpacity
        testID={`holding-card-${item.symbol}`}
        style={styles.holdingCard}
        activeOpacity={0.7}
        onPress={() =>
          router.push({
            pathname: '/stock/[symbol]',
            params: { symbol: item.symbol, holdingId: item.id, portfolioId: item.portfolio_id },
          })
        }
      >
        <View style={styles.holdingTop}>
          <View style={styles.holdingLeft}>
            <Text style={styles.symbolText}>{item.symbol}</Text>
            <Text style={styles.sharesText}>
              {item.shares} shares{selectedPortfolio === 'all' ? ` · ${getPortfolioName(item.portfolio_id)}` : ''}
            </Text>
          </View>
          <View style={styles.holdingRight}>
            <Text style={styles.priceText}>{price > 0 ? `$${price.toFixed(2)}` : '...'}</Text>
            <View style={[styles.changeBadge, isDayPositive ? styles.greenBg : styles.redBg]}>
              <Feather name={isDayPositive ? 'trending-up' : 'trending-down'} size={12} color={isDayPositive ? '#4ADE80' : '#F87171'} />
              <Text style={[styles.changeText, isDayPositive ? styles.greenText : styles.redText]}>{formatPct(dayChgPct)}</Text>
            </View>
          </View>
        </View>
        <View style={styles.holdingBottom}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Value</Text>
            <Text style={styles.metricValue}>{formatCurrency(currentValue)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Avg Cost</Text>
            <Text style={styles.metricValue}>${item.avg_price.toFixed(2)}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Total G/L</Text>
            <Text style={[styles.metricValue, isPositive ? styles.greenText : styles.redText]}>
              {isPositive ? '+' : ''}{formatCurrency(gain)}
            </Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>Return</Text>
            <Text style={[styles.metricValue, isPositive ? styles.greenText : styles.redText]}>{formatPct(gainPct)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading && holdings.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#6366F1" />
        <Text style={styles.loadingText}>Loading portfolio...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        testID="holdings-list"
        data={holdings}
        keyExtractor={(item) => item.id}
        renderItem={renderHolding}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366F1" />}
        ListHeaderComponent={
          <View>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.headerTitle}>Portfolio</Text>
              <View style={styles.headerActions}>
                <TouchableOpacity testID="manage-portfolios-btn" onPress={() => router.push('/portfolios')} style={styles.iconBtn} activeOpacity={0.7}>
                  <Feather name="layers" size={20} color="#A1A1AA" />
                </TouchableOpacity>
                <TouchableOpacity testID="import-csv-btn" onPress={() => router.push('/import-csv')} style={styles.iconBtn} activeOpacity={0.7}>
                  <Feather name="upload" size={20} color="#A1A1AA" />
                </TouchableOpacity>
                <TouchableOpacity testID="refresh-btn" onPress={onRefresh} style={styles.iconBtn} activeOpacity={0.7}>
                  <Feather name="refresh-cw" size={20} color="#A1A1AA" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Portfolio Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabContainer}>
              <TouchableOpacity
                testID="tab-all"
                style={[styles.tab, selectedPortfolio === 'all' && styles.tabActive]}
                onPress={() => setSelectedPortfolio('all')}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabText, selectedPortfolio === 'all' && styles.tabTextActive]}>All</Text>
              </TouchableOpacity>
              {portfolios.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  testID={`tab-${p.id}`}
                  style={[styles.tab, selectedPortfolio === p.id && styles.tabActive]}
                  onPress={() => setSelectedPortfolio(p.id)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, selectedPortfolio === p.id && styles.tabTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>
                {selectedPortfolio === 'all' ? 'Total Value' : portfolios.find((p) => p.id === selectedPortfolio)?.name || 'Portfolio'}
              </Text>
              <Text style={styles.summaryValue}>{formatCurrency(totalValue)}</Text>
              <View style={styles.summaryRow}>
                <View style={styles.summaryChip}>
                  <Text style={[styles.summaryChipText, totalGain >= 0 ? styles.greenText : styles.redText]}>
                    {totalGain >= 0 ? '+' : ''}{formatCurrency(totalGain)} ({formatPct(totalGainPct)})
                  </Text>
                  <Text style={styles.summaryChipLabel}> All Time</Text>
                </View>
                <View style={styles.summaryChip}>
                  <Text style={[styles.summaryChipText, dayChange >= 0 ? styles.greenText : styles.redText]}>
                    {dayChange >= 0 ? '+' : ''}{formatCurrency(dayChange)} ({formatPct(dayChangePct)})
                  </Text>
                  <Text style={styles.summaryChipLabel}> Today</Text>
                </View>
              </View>
            </View>

            {/* Section Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Holdings</Text>
              <Text style={styles.holdingCount}>{holdings.length} stocks</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="#3F3F46" />
            <Text style={styles.emptyText}>No holdings yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add or import from CSV</Text>
          </View>
        }
      />

      {/* FAB Add */}
      <TouchableOpacity
        testID="add-holding-btn"
        style={styles.fab}
        activeOpacity={0.7}
        onPress={() => {
          const pid = selectedPortfolio === 'all' ? (portfolios[0]?.id || '') : selectedPortfolio;
          router.push({ pathname: '/add-holding', params: { portfolioId: pid } });
        }}
      >
        <Feather name="plus" size={28} color="#09090B" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  loadingContainer: { flex: 1, backgroundColor: '#09090B', alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: '#A1A1AA', marginTop: 12, fontSize: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 32, fontWeight: '700', color: '#FAFAFA' },
  headerActions: { flexDirection: 'row', gap: 8 },
  iconBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  tabScroll: { marginBottom: 16 },
  tabContainer: { gap: 8, paddingRight: 20 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  tabActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#52525B' },
  tabTextActive: { color: '#FAFAFA' },
  summaryCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 20, marginBottom: 24 },
  summaryLabel: { fontSize: 14, color: '#A1A1AA', marginBottom: 4 },
  summaryValue: { fontSize: 36, fontWeight: '700', color: '#FAFAFA', fontFamily: MONO, marginBottom: 16 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryChip: { flexDirection: 'row', alignItems: 'center' },
  summaryChipText: { fontSize: 14, fontWeight: '600', fontFamily: MONO },
  summaryChipLabel: { fontSize: 12, color: '#52525B' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#FAFAFA' },
  holdingCount: { fontSize: 14, color: '#52525B' },
  holdingCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 16, marginBottom: 12 },
  holdingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  holdingLeft: {},
  holdingRight: { alignItems: 'flex-end' },
  symbolText: { fontSize: 18, fontWeight: '700', color: '#FAFAFA', marginBottom: 2 },
  sharesText: { fontSize: 13, color: '#52525B' },
  priceText: { fontSize: 18, fontWeight: '600', color: '#FAFAFA', fontFamily: MONO, marginBottom: 4 },
  changeBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 4 },
  greenBg: { backgroundColor: 'rgba(74, 222, 128, 0.1)' },
  redBg: { backgroundColor: 'rgba(248, 113, 113, 0.1)' },
  changeText: { fontSize: 13, fontWeight: '600', fontFamily: MONO },
  greenText: { color: '#4ADE80' },
  redText: { color: '#F87171' },
  holdingBottom: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#27272A', paddingTop: 12 },
  metricCol: { alignItems: 'center', flex: 1 },
  metricLabel: { fontSize: 11, color: '#52525B', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricValue: { fontSize: 13, fontWeight: '600', color: '#FAFAFA', fontFamily: MONO },
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontSize: 18, color: '#A1A1AA', marginTop: 16, fontWeight: '600' },
  emptySubtext: { fontSize: 14, color: '#52525B', marginTop: 4 },
  fab: {
    position: 'absolute', right: 20, bottom: 32, width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
});
