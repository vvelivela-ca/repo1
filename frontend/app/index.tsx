import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Alert,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const CURRENCIES = ['USD', 'CAD', 'INR'] as const;
type CurrencyCode = (typeof CURRENCIES)[number];
const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', CAD: 'C$', INR: '₹', GBP: '£', EUR: '€' };

interface Portfolio { id: string; name: string; }
interface Holding { 
  id: string; 
  symbol: string; 
  shares: number; 
  avg_price: number; 
  portfolio_id: string; 
  currency: string; 
  asset_type: string; 
  exchange: string | null; 
  notes: string | null; 
}
interface Quote { price: number; previous_close: number; quote_currency: string; }

// Asset type icons
const ASSET_ICONS: Record<string, string> = {
  'Stock': 'trending-up',
  'ETF': 'layers',
  'Mutual Fund': 'pie-chart',
  'Crypto': 'zap',
  'Bond': 'shield',
  'Real Estate': 'home',
  'Other': 'box',
};

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
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  
  // Ref to track if component is mounted and prevent stale updates
  const isMounted = useRef(true);
  const isFetching = useRef(false);

  // Filter by asset type
  const [filterAssetType, setFilterAssetType] = useState<string | null>(null);

  type SortKey = 'value' | 'day' | 'gain' | 'return' | 'symbol' | 'type';
  const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
    { key: 'value',  label: 'Value',   icon: 'dollar-sign' },
    { key: 'day',    label: 'Day %',   icon: 'activity' },
    { key: 'gain',   label: 'G/L',     icon: 'trending-up' },
    { key: 'return', label: 'Return',  icon: 'percent' },
    { key: 'symbol', label: 'Symbol',  icon: 'list' },
    { key: 'type',   label: 'Type',    icon: 'layers' },
  ];
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortAsc, setSortAsc] = useState(false);

  const cycleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(false); }
  };

  // Keep selected portfolio in a ref to avoid stale closure issues
  const selectedPortfolioRef = useRef(selectedPortfolio);
  useEffect(() => {
    selectedPortfolioRef.current = selectedPortfolio;
  }, [selectedPortfolio]);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/portfolios`);
      const data = await res.json();
      if (isMounted.current) setPortfolios(data);
    } catch (err) { console.error('Error fetching portfolios:', err); }
  }, []);

  const fetchFxRates = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/fx-rates`);
      const data = await res.json();
      if (isMounted.current) setFxRates(data);
    } catch (err) { console.error('Error fetching FX rates:', err); }
  }, []);

  // Core data fetching function - uses ref to get current portfolio
  const fetchData = useCallback(async (showLoading = true, forcePortfolio?: string) => {
    // Prevent duplicate fetches
    if (isFetching.current) return;
    isFetching.current = true;
    
    if (showLoading) setLoading(true);
    try {
      // Use forcePortfolio or ref to avoid stale closure
      const currentPortfolio = forcePortfolio ?? selectedPortfolioRef.current;
      
      // Fetch holdings
      const url = currentPortfolio === 'all' 
        ? `${API_URL}/api/holdings` 
        : `${API_URL}/api/holdings?portfolio_id=${currentPortfolio}`;
      const holdingsRes = await fetch(url);
      const holdingsData: Holding[] = await holdingsRes.json();
      
      if (!isMounted.current) return;
      setHoldings(holdingsData);
      
      // Fetch quotes for all holdings
      if (holdingsData.length > 0) {
        const uniqueSymbols = [...new Set(holdingsData.map((h) => h.symbol))];
        const symbols = uniqueSymbols.join(',');
        const quotesRes = await fetch(`${API_URL}/api/stocks/quotes?symbols=${symbols}`);
        const quotesData = await quotesRes.json();
        if (isMounted.current) setQuotes(quotesData);
      } else { 
        if (isMounted.current) setQuotes({}); 
      }
      
      if (isMounted.current) setLastRefresh(new Date());
    } catch (err) { 
      console.error('Error fetching data:', err);
      if (isMounted.current) {
        Alert.alert('Error', 'Failed to fetch data. Pull to refresh.');
      }
    }
    finally { 
      isFetching.current = false;
      if (isMounted.current) {
        setLoading(false); 
        setRefreshing(false); 
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; };
  }, []);

  // Initial load
  useEffect(() => { 
    fetchPortfolios(); 
    fetchFxRates(); 
    fetchData(true, 'all');
  }, []);

  // Fetch data when portfolio changes
  useEffect(() => { 
    fetchData(true, selectedPortfolio); 
  }, [selectedPortfolio]);

  // Refresh when screen comes into focus - FIXED: wait for animations to complete
  useFocusEffect(
    useCallback(() => {
      // Wait for screen transition animation to complete before fetching
      const task = InteractionManager.runAfterInteractions(() => {
        console.log('[Dashboard] Screen focused - refreshing data');
        fetchData(false);
        fetchFxRates();
      });
      
      return () => task.cancel();
    }, [fetchData, fetchFxRates])
  );

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isFetching.current) fetchData(false);
    }, 60000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const onRefresh = useCallback(() => { 
    setRefreshing(true); 
    fetchPortfolios(); 
    fetchFxRates(); 
    fetchData(false); 
  }, [fetchPortfolios, fetchFxRates, fetchData]);

  // Convert value from native currency to display currency
  const convert = useCallback((amount: number, fromCurrency: string): number => {
    const from = (fromCurrency || 'USD').toUpperCase();
    const to = displayCurrency;
    if (from === to) return amount;
    // Convert to USD first, then to target
    const usdAmount = from === 'USD' ? amount : amount / (fxRates[from] || 1);
    return to === 'USD' ? usdAmount : usdAmount * (fxRates[to] || 1);
  }, [displayCurrency, fxRates]);

  const cs = CURRENCY_SYMBOLS[displayCurrency] || '$';

  const formatCurrency = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000000) return `${cs}${(val / 1000000).toFixed(2)}M`;
    if (abs >= 1000) return `${cs}${(val / 1000).toFixed(1)}K`;
    return `${cs}${val.toFixed(2)}`;
  };
  
  const formatPct = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

  // Calculate totals - using useMemo for performance
  const { totalValue, totalCost, totalGain, totalGainPct, dayChange, dayChangePct } = useMemo(() => {
    const tv = holdings.reduce((sum, h) => {
      const q = quotes[h.symbol];
      const price = q?.price || 0;
      const quoteCur = q?.quote_currency || h.currency || 'USD';
      return sum + convert(price * h.shares, quoteCur);
    }, 0);

    const tc = holdings.reduce((sum, h) => {
      return sum + convert(h.avg_price * h.shares, h.currency || 'USD');
    }, 0);

    const dc = holdings.reduce((sum, h) => {
      const q = quotes[h.symbol];
      if (!q || !q.price || !q.previous_close) return sum;
      const quoteCur = q.quote_currency || h.currency || 'USD';
      return sum + convert((q.price - q.previous_close) * h.shares, quoteCur);
    }, 0);

    const tg = tv - tc;
    const tgp = tc > 0 ? (tg / tc) * 100 : 0;
    const dcp = tv - dc > 0 ? (dc / (tv - dc)) * 100 : 0;

    return { 
      totalValue: tv, 
      totalCost: tc, 
      totalGain: tg, 
      totalGainPct: tgp, 
      dayChange: dc, 
      dayChangePct: dcp 
    };
  }, [holdings, quotes, convert]);

  const getPortfolioName = useCallback((id: string) => portfolios.find((p) => p.id === id)?.name || '', [portfolios]);

  // Get unique asset types for filter - memoized
  const assetTypes = useMemo(() => [...new Set(holdings.map(h => h.asset_type || 'Stock'))], [holdings]);

  // Filter and sort holdings - memoized for performance
  const sortedHoldings = useMemo(() => {
    const filtered = filterAssetType 
      ? holdings.filter(h => h.asset_type === filterAssetType)
      : holdings;
    
    return [...filtered].sort((a, b) => {
      const qa = quotes[a.symbol]; 
      const qb = quotes[b.symbol];
      let diff = 0;
      
      if (sortKey === 'symbol') {
        diff = a.symbol.localeCompare(b.symbol);
      } else if (sortKey === 'type') {
        diff = (a.asset_type || 'Stock').localeCompare(b.asset_type || 'Stock');
      } else if (sortKey === 'value') {
        const va = convert((qa?.price || 0) * a.shares, qa?.quote_currency || a.currency || 'USD');
        const vb = convert((qb?.price || 0) * b.shares, qb?.quote_currency || b.currency || 'USD');
        diff = va - vb;
      } else if (sortKey === 'day') {
        const da = qa && qa.previous_close > 0 ? ((qa.price - qa.previous_close) / qa.previous_close) * 100 : 0;
        const db = qb && qb.previous_close > 0 ? ((qb.price - qb.previous_close) / qb.previous_close) * 100 : 0;
        diff = da - db;
      } else if (sortKey === 'gain') {
        const ga = convert((qa?.price || 0) * a.shares, qa?.quote_currency || a.currency || 'USD') - convert(a.avg_price * a.shares, a.currency || 'USD');
        const gb = convert((qb?.price || 0) * b.shares, qb?.quote_currency || b.currency || 'USD') - convert(b.avg_price * b.shares, b.currency || 'USD');
        diff = ga - gb;
      } else if (sortKey === 'return') {
        const costA = convert(a.avg_price * a.shares, a.currency || 'USD');
        const costB = convert(b.avg_price * b.shares, b.currency || 'USD');
        const ra = costA > 0 ? ((convert((qa?.price || 0) * a.shares, qa?.quote_currency || a.currency || 'USD') - costA) / costA) * 100 : 0;
        const rb = costB > 0 ? ((convert((qb?.price || 0) * b.shares, qb?.quote_currency || b.currency || 'USD') - costB) / costB) * 100 : 0;
        diff = ra - rb;
      }
      return sortAsc ? diff : -diff;
    });
  }, [holdings, quotes, filterAssetType, sortKey, sortAsc, convert]);

  const renderHolding = ({ item }: { item: Holding }) => {
    const q = quotes[item.symbol];
    const price = q?.price || 0;
    const prevClose = q?.previous_close || 0;
    const nativeCur = (item.currency || 'USD').toUpperCase();
    const nativeCs = CURRENCY_SYMBOLS[nativeCur] || '$';

    const quoteCur = (q?.quote_currency || item.currency || 'USD').toUpperCase();
    const quoteCs = CURRENCY_SYMBOLS[quoteCur] || '$';

    const currentValue = convert(price * item.shares, quoteCur);
    const costBasis = convert(item.avg_price * item.shares, nativeCur);
    const gain = currentValue - costBasis;
    const gainPct = costBasis > 0 ? (gain / costBasis) * 100 : 0;
    const dayChgPct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
    const isPositive = gain >= 0;
    const isDayPositive = dayChgPct >= 0;

    const assetIcon = ASSET_ICONS[item.asset_type || 'Stock'] || 'box';

    return (
      <TouchableOpacity 
        testID={`holding-card-${item.symbol}`} 
        style={styles.holdingCard} 
        activeOpacity={0.7}
        onPress={() => router.push({ 
          pathname: '/stock/[symbol]', 
          params: { symbol: item.symbol, holdingId: item.id, portfolioId: item.portfolio_id } 
        })}
      >
        <View style={styles.holdingTop}>
          <View style={styles.holdingLeft}>
            <View style={styles.symbolRow}>
              <View style={styles.assetIconContainer}>
                <Feather name={assetIcon as any} size={14} color="#6366F1" />
              </View>
              <Text style={styles.symbolText}>{item.symbol}</Text>
              {nativeCur !== 'USD' && (
                <View style={styles.currBadge}>
                  <Text style={styles.currBadgeText}>{nativeCur}</Text>
                </View>
              )}
            </View>
            <Text style={styles.sharesText}>
              {item.shares} {item.asset_type === 'Mutual Fund' ? 'units' : 'shares'}
              {selectedPortfolio === 'all' && portfolios.length > 1 ? ` · ${getPortfolioName(item.portfolio_id)}` : ''}
            </Text>
            <Text style={styles.typeText}>{item.asset_type || 'Stock'}{item.exchange ? ` · ${item.exchange}` : ''}</Text>
          </View>
          <View style={styles.holdingRight}>
            <Text style={styles.priceText}>{price > 0 ? `${quoteCs}${price.toFixed(2)}` : 'Loading...'}</Text>
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
      <FlatList 
        testID="holdings-list" 
        data={sortedHoldings} 
        keyExtractor={(item) => item.id} 
        renderItem={renderHolding}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl 
            refreshing={refreshing} 
            onRefresh={onRefresh} 
            tintColor="#6366F1" 
            colors={['#6366F1']}
          />
        }
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
                <Text style={[styles.tabText, selectedPortfolio === 'all' && styles.tabTextActive]}>All ({holdings.length})</Text>
              </TouchableOpacity>
              {portfolios.map((p) => {
                const count = holdings.filter(h => h.portfolio_id === p.id).length;
                return (
                  <TouchableOpacity 
                    key={p.id} 
                    testID={`tab-${p.id}`} 
                    style={[styles.tab, selectedPortfolio === p.id && styles.tabActive]} 
                    onPress={() => setSelectedPortfolio(p.id)} 
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tabText, selectedPortfolio === p.id && styles.tabTextActive]}>
                      {p.name} {selectedPortfolio !== 'all' ? '' : `(${count})`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Summary Card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryHeader}>
                <View>
                  <Text style={styles.summaryLabel}>
                    {selectedPortfolio === 'all' ? 'Total Portfolio Value' : portfolios.find((p) => p.id === selectedPortfolio)?.name || 'Portfolio'}
                  </Text>
                  {lastRefresh && (
                    <Text style={styles.lastUpdateText}>
                      Updated {lastRefresh.toLocaleTimeString()}
                    </Text>
                  )}
                </View>
                {/* Currency Toggle */}
                <View style={styles.currToggle}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity 
                      key={c} 
                      testID={`currency-toggle-${c}`}
                      style={[styles.currToggleBtn, displayCurrency === c && styles.currToggleBtnActive]}
                      onPress={() => setDisplayCurrency(c)} 
                      activeOpacity={0.7}
                    >
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

            {/* Asset Type Filter */}
            {assetTypes.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContainer}>
                <TouchableOpacity 
                  style={[styles.filterChip, !filterAssetType && styles.filterChipActive]} 
                  onPress={() => setFilterAssetType(null)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterChipText, !filterAssetType && styles.filterChipTextActive]}>All Types</Text>
                </TouchableOpacity>
                {assetTypes.map(type => (
                  <TouchableOpacity 
                    key={type}
                    style={[styles.filterChip, filterAssetType === type && styles.filterChipActive]} 
                    onPress={() => setFilterAssetType(type)}
                    activeOpacity={0.7}
                  >
                    <Feather name={ASSET_ICONS[type] as any || 'box'} size={12} color={filterAssetType === type ? '#FAFAFA' : '#52525B'} />
                    <Text style={[styles.filterChipText, filterAssetType === type && styles.filterChipTextActive]}>{type}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Section Header + Sort Chips */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Holdings</Text>
              <Text style={styles.holdingCount}>{sortedHoldings.length} items</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll} contentContainerStyle={styles.sortContainer}>
              {SORT_OPTIONS.map((opt) => {
                const active = sortKey === opt.key;
                return (
                  <TouchableOpacity 
                    key={opt.key} 
                    onPress={() => cycleSort(opt.key)}
                    style={[styles.sortChip, active && styles.sortChipActive]} 
                    activeOpacity={0.7}
                  >
                    <Feather name={opt.icon as any} size={12} color={active ? '#6366F1' : '#52525B'} />
                    <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>{opt.label}</Text>
                    {active && (
                      <Feather name={sortAsc ? 'chevron-up' : 'chevron-down'} size={11} color="#6366F1" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="inbox" size={48} color="#3F3F46" />
            <Text style={styles.emptyText}>No holdings yet</Text>
            <Text style={styles.emptySubtext}>Tap + to add stocks, ETFs, mutual funds, or crypto</Text>
          </View>
        }
      />
      
      {/* FAB */}
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
  summaryCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 20, marginBottom: 16 },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  summaryLabel: { fontSize: 14, color: '#A1A1AA' },
  lastUpdateText: { fontSize: 11, color: '#52525B', marginTop: 2 },
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
  filterScroll: { marginBottom: 12 },
  filterContainer: { gap: 8, paddingRight: 20 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  filterChipActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  filterChipText: { fontSize: 12, fontWeight: '600', color: '#52525B' },
  filterChipTextActive: { color: '#FAFAFA' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#FAFAFA' },
  holdingCount: { fontSize: 14, color: '#52525B' },
  sortScroll: { marginBottom: 14 },
  sortContainer: { flexDirection: 'row', gap: 8, paddingRight: 4 },
  sortChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  sortChipActive: { borderColor: '#6366F1', backgroundColor: 'rgba(99,102,241,0.1)' },
  sortChipText: { fontSize: 12, fontWeight: '600', color: '#52525B' },
  sortChipTextActive: { color: '#6366F1' },
  holdingCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 16, marginBottom: 12 },
  holdingTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  holdingLeft: {},
  holdingRight: { alignItems: 'flex-end' },
  symbolRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  assetIconContainer: { width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(99, 102, 241, 0.1)', alignItems: 'center', justifyContent: 'center' },
  symbolText: { fontSize: 18, fontWeight: '700', color: '#FAFAFA', marginBottom: 2 },
  currBadge: { backgroundColor: '#27272A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  currBadgeText: { fontSize: 10, fontWeight: '700', color: '#A1A1AA' },
  sharesText: { fontSize: 13, color: '#71717A' },
  typeText: { fontSize: 11, color: '#52525B', marginTop: 2 },
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
  emptySubtext: { fontSize: 14, color: '#52525B', marginTop: 4, textAlign: 'center' },
  fab: {
    position: 'absolute', right: 20, bottom: 32, width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366F1', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
});
