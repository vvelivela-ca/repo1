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

const CURRENCIES = ['USD', 'CAD', 'INR'] as const;
type CurrencyCode = (typeof CURRENCIES)[number];
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { USD: '$', CAD: 'C$', INR: '₹' };

interface Portfolio { id: string; name: string; }
interface Holding { id: string; symbol: string; shares: number; avg_price: number; portfolio_id: string; currency: string; }
interface Quote { price: number; previous_close: number; quote_currency: string; }

export default function Dashboard() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('all');
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [fxRates, setFxRates] = useState<Record<string, number>>({ USD: 1, CAD: 1.36, INR: 84.5 });
  const [displayCurrency, setDisplayCurrency] = useState<CurrencyCode>('USD');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/portfolios`);
      setPortfolios(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  const fetchFxRates = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/fx-rates`);
      setFxRates(await res.json());
    } catch (err) { console.error(err); }
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const url = selectedPortfolio === 'all' ? `${API_URL}/api/holdings` : `${API_URL}/api/holdings?portfolio_id=${selectedPortfolio}`;
      const holdingsRes = await fetch(url);
      const holdingsData: Holding[] = await holdingsRes.json();
      setHoldings(holdingsData);
      if (holdingsData.length > 0) {
        const uniqueSymbols = [...new Set(holdingsData.map((h) => h.symbol))];
        const symbols = uniqueSymbols.join(',');
        // Pass currencies so backend can resolve exchange suffixes (e.g., .TO for CAD)
        const currencyMap: Record<string, string> = {};
        holdingsData.forEach((h) => { currencyMap[h.symbol] = h.currency || 'USD'; });
        const currencies = uniqueSymbols.map((s) => currencyMap[s] || 'USD').join(',');
        const quotesRes = await fetch(`${API_URL}/api/stocks/quotes?symbols=${symbols}&currencies=${currencies}`);
        setQuotes(await quotesRes.json());
      } else { setQuotes({}); }
    } catch (err) { console.error(err); }
    finally { setLoading(false); setRefreshing(false); }
  }, [selectedPortfolio]);

  useEffect(() => { fetchPortfolios(); fetchFxRates(); }, []);
  useEffect(() => { setLoading(true); fetchData(); const i = setInterval(fetchData, 60000); return () => clearInterval(i); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchPortfolios(); fetchFxRates(); fetchData(); };

  // Convert value from native currency to display currency
  const convert = (amount: number, fromCurrency: string): number => {
    const from = fromCurrency.toUpperCase();
    const to = displayCurrency;
    if (from === to) return amount;
    // Convert to USD first, then to target
    const usdAmount = from === 'USD' ? amount : amount / (fxRates[from] || 1);
    return to === 'USD' ? usdAmount : usdAmount * (fxRates[to] || 1);
  };

  const cs = CURRENCY_SYMBOLS[displayCurrency];

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${cs}${(val / 1000000).toFixed(2)}m`;
    if (abs >= 1000) return `${cs}${(val / 1000).toFixed(1)}k`;
    return `${cs}${val.toFixed(2)}`;
  };
  const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

  const getTotalValue = () => holdings.reduce((sum, h) => {
    const q = quotes[h.symbol];
    const price = q?.price || 0;
    const quoteCur = q?.quote_currency || 'USD';
    // Price is in quote_currency (e.g. USD for US stocks, CAD for TSX stocks)
    return sum + convert(price * h.shares, quoteCur);
  }, 0);

  const getTotalCost = () => holdings.reduce((sum, h) => sum + convert(h.avg_price * h.shares, h.currency || 'USD'), 0);

  const getTotalDayChange = () => holdings.reduce((sum, h) => {
    const q = quotes[h.symbol];
    if (!q) return sum;
    const quoteCur = q.quote_currency || 'USD';
    return sum + convert((q.price - q.previous_close) * h.shares, quoteCur);
  }, 0);

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
    const nativeCur = (item.currency || 'USD').toUpperCase() as CurrencyCode;
    const nativeCs = CURRENCY_SYMBOLS[nativeCur] || '$';

    // Price is in the stock's quote currency (USD for US, CAD for TSX, etc.)
    const quoteCur = (q?.quote_currency || 'USD').toUpperCase();
    const quoteCs = CURRENCY_SYMBOLS[quoteCur as CurrencyCode] || '$';

    // Convert to display currency for totals
    const currentValue = convert(price * item.shares, quoteCur);
    const costBasis = convert(item.avg_price * item.shares, nativeCur);
    const gain = currentValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const dayChgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const isPositive = gain >= 0;
    const isDayPositive = dayChgPct >= 0;

    return (
      <TouchableOpacity testID={`holding-card-${item.symbol}`} style={styles.holdingCard} activeOpacity={0.7}
        onPress={() => router.push({ pathname: '/stock/[symbol]', params: { symbol: item.symbol, holdingId: item.id, portfolioId: item.portfolio_id } })}>
        <View style={styles.holdingTop}>
          <View style={styles.holdingLeft}>
            <View style={styles.symbolRow}>
              <Text style={styles.symbolText}>{item.symbol}</Text>
              {nativeCur !== 'USD' && <View style={styles.currBadge}><Text style={styles.currBadgeText}>{nativeCur}</Text></View>}
            </View>
            <Text style={styles.sharesText}>
              {item.shares} shares{selectedPortfolio === 'all' ? ` · ${getPortfolioName(item.portfolio_id)}` : ''}
            </Text>
          </View>
          <View style={styles.holdingRight}>
            <Text style={styles.priceText}>{price > 0 ? `${quoteCs}${price.toFixed(2)}` : '...'}</Text>
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
            <Text style={styles.metricValue}>{nativeCs}{item.avg_price.toFixed(2)}</Text>
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
      <FlatList testID="holdings-list" data={holdings} keyExtractor={(item) => item.id} renderItem={renderHolding}
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
              <TouchableOpacity testID="tab-all" style={[styles.tab, selectedPortfolio === 'all' && styles.tabActive]} onPress={() => setSelectedPortfolio('all')} activeOpacity={0.7}>
                <Text style={[styles.tabText, selectedPortfolio === 'all' && styles.tabTextActive]}>All</Text>
              </TouchableOpacity>
              {portfolios.map((p) => (
                <TouchableOpacity key={p.id} testID={`tab-${p.id}`} style={[styles.tab, selectedPortfolio === p.id && styles.tabActive]} onPress={() => setSelectedPortfolio(p.id)} activeOpacity={0.7}>
                  <Text style={[styles.tabText, selectedPortfolio === p.id && styles.tabTextActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <Text style={styles.summaryLabel}>
                  {selectedPortfolio === 'all' ? 'Total Value' : portfolios.find((p) => p.id === selectedPortfolio)?.name || 'Portfolio'}
                </Text>
                {/* Currency Toggle */}
                <View style={styles.currToggle}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity key={c} testID={`currency-toggle-${c}`}
                      style={[styles.currToggleBtn, displayCurrency === c && styles.currToggleBtnActive]}
                      onPress={() => setDisplayCurrency(c)} activeOpacity={0.7}>
                      <Text style={[styles.currToggleText, displayCurrency === c && styles.currToggleTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
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
            <Text style={styles.emptySubtext}>Tap + to add or import from CSV/PDF</Text>
          </View>
        }
      />
      {/* FAB */}
      <TouchableOpacity testID="add-holding-btn" style={styles.fab} activeOpacity={0.7}
        onPress={() => { const pid = selectedPortfolio === 'all' ? (portfolios[0]?.id || '') : selectedPortfolio; router.push({ pathname: '/add-holding', params: { portfolioId: pid } }); }}>
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
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: '#A1A1AA' },
  currToggle: { flexDirection: 'row', backgroundColor: '#09090B', borderRadius: 8, padding: 2 },
  currToggleBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  currToggleBtnActive: { backgroundColor: '#6366F1' },
  currToggleText: { fontSize: 12, fontWeight: '700', color: '#52525B' },
  currToggleTextActive: { color: '#FAFAFA' },
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
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  symbolText: { fontSize: 18, fontWeight: '700', color: '#FAFAFA', marginBottom: 2 },
  currBadge: { backgroundColor: '#27272A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  currBadgeText: { fontSize: 10, fontWeight: '700', color: '#A1A1AA' },
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
