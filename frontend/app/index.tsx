import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { PieChart } from 'react-native-gifted-charts';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

interface Holding {
  id: string;
  name: string;
  symbol: string;
  quantity: number;
  purchase_price: number;
  current_price: number;
  category: string;
  purchase_date?: string;
  notes?: string;
}

interface PortfolioSummary {
  total_value: number;
  total_cost: number;
  total_gain_loss: number;
  gain_loss_percentage: number;
  holdings_count: number;
  category_breakdown: Record<string, { value: number; count: number }>;
}

const CATEGORY_COLORS: Record<string, string> = {
  Stock: '#4ECDC4',
  Crypto: '#FFE66D',
  ETF: '#95E1D3',
  'Mutual Fund': '#F38181',
  Bond: '#AA96DA',
  'Real Estate': '#FCBAD3',
  Other: '#A8D8EA',
};

export default function HomeScreen() {
  const router = useRouter();
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [holdingsRes, summaryRes] = await Promise.all([
        axios.get(`${API_URL}/api/holdings`),
        axios.get(`${API_URL}/api/portfolio/summary`),
      ]);
      setHoldings(holdingsRes.data);
      setSummary(summaryRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to fetch portfolio data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const getPieChartData = () => {
    if (!summary?.category_breakdown) return [];
    return Object.entries(summary.category_breakdown).map(([category, data]) => ({
      value: data.value,
      color: CATEGORY_COLORS[category] || '#888',
      text: category,
    }));
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const calculateGainLoss = (holding: Holding) => {
    const currentValue = holding.quantity * holding.current_price;
    const cost = holding.quantity * holding.purchase_price;
    return currentValue - cost;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ECDC4" />
        <Text style={styles.loadingText}>Loading portfolio...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#4ECDC4"
          />
        }
      >
        {/* Portfolio Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Portfolio Value</Text>
          <Text style={styles.summaryValue}>
            {formatCurrency(summary?.total_value || 0)}
          </Text>
          <View style={styles.gainLossRow}>
            <View
              style={[
                styles.gainLossBadge,
                {
                  backgroundColor:
                    (summary?.total_gain_loss || 0) >= 0
                      ? 'rgba(78, 205, 196, 0.2)'
                      : 'rgba(255, 107, 107, 0.2)',
                },
              ]}
            >
              <Ionicons
                name={(summary?.total_gain_loss || 0) >= 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={(summary?.total_gain_loss || 0) >= 0 ? '#4ECDC4' : '#FF6B6B'}
              />
              <Text
                style={[
                  styles.gainLossText,
                  {
                    color:
                      (summary?.total_gain_loss || 0) >= 0 ? '#4ECDC4' : '#FF6B6B',
                  },
                ]}
              >
                {formatCurrency(summary?.total_gain_loss || 0)} (
                {(summary?.gain_loss_percentage || 0).toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>

        {/* Pie Chart Section */}
        {holdings.length > 0 && (
          <View style={styles.chartCard}>
            <Text style={styles.sectionTitle}>Asset Allocation</Text>
            <View style={styles.chartContainer}>
              <PieChart
                data={getPieChartData()}
                donut
                radius={80}
                innerRadius={50}
                innerCircleColor="#1a1a2e"
                centerLabelComponent={() => (
                  <View style={styles.centerLabel}>
                    <Text style={styles.centerLabelText}>
                      {summary?.holdings_count || 0}
                    </Text>
                    <Text style={styles.centerLabelSubtext}>Holdings</Text>
                  </View>
                )}
              />
              <View style={styles.legendContainer}>
                {Object.entries(summary?.category_breakdown || {}).map(
                  ([category, data]) => (
                    <View key={category} style={styles.legendItem}>
                      <View
                        style={[
                          styles.legendDot,
                          { backgroundColor: CATEGORY_COLORS[category] || '#888' },
                        ]}
                      />
                      <Text style={styles.legendText}>{category}</Text>
                      <Text style={styles.legendValue}>
                        {formatCurrency(data.value)}
                      </Text>
                    </View>
                  )
                )}
              </View>
            </View>
          </View>
        )}

        {/* Holdings List */}
        <View style={styles.holdingsSection}>
          <View style={styles.holdingsHeader}>
            <Text style={styles.sectionTitle}>Your Holdings</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => router.push('/add-holding')}
            >
              <Ionicons name="add" size={20} color="#fff" />
              <Text style={styles.addButtonText}>Add</Text>
            </TouchableOpacity>
          </View>

          {holdings.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="briefcase-outline" size={64} color="#444" />
              <Text style={styles.emptyStateText}>No holdings yet</Text>
              <Text style={styles.emptyStateSubtext}>
                Tap the + button to add your first holding
              </Text>
            </View>
          ) : (
            holdings.map((holding) => {
              const gainLoss = calculateGainLoss(holding);
              const currentValue = holding.quantity * holding.current_price;
              return (
                <TouchableOpacity
                  key={holding.id}
                  style={styles.holdingCard}
                  onPress={() =>
                    router.push({
                      pathname: '/holding-details',
                      params: { id: holding.id },
                    })
                  }
                >
                  <View style={styles.holdingLeft}>
                    <View
                      style={[
                        styles.categoryBadge,
                        {
                          backgroundColor:
                            CATEGORY_COLORS[holding.category] || '#888',
                        },
                      ]}
                    >
                      <Text style={styles.categoryBadgeText}>
                        {holding.category.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.holdingInfo}>
                      <Text style={styles.holdingName}>{holding.name}</Text>
                      <Text style={styles.holdingSymbol}>
                        {holding.symbol} • {holding.quantity} shares
                      </Text>
                    </View>
                  </View>
                  <View style={styles.holdingRight}>
                    <Text style={styles.holdingValue}>
                      {formatCurrency(currentValue)}
                    </Text>
                    <Text
                      style={[
                        styles.holdingGainLoss,
                        { color: gainLoss >= 0 ? '#4ECDC4' : '#FF6B6B' },
                      ]}
                    >
                      {gainLoss >= 0 ? '+' : ''}
                      {formatCurrency(gainLoss)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/add-holding')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  loadingText: {
    color: '#888',
    marginTop: 12,
    fontSize: 16,
  },
  summaryCard: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  summaryValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: 'bold',
  },
  gainLossRow: {
    marginTop: 12,
  },
  gainLossBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  gainLossText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  chartCard: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  chartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  centerLabel: {
    alignItems: 'center',
  },
  centerLabelText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  centerLabelSubtext: {
    color: '#888',
    fontSize: 12,
  },
  legendContainer: {
    flex: 1,
    marginLeft: 20,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    color: '#888',
    fontSize: 12,
    flex: 1,
  },
  legendValue: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '500',
  },
  holdingsSection: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  holdingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#4ECDC4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyStateText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptyStateSubtext: {
    color: '#666',
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
  holdingCard: {
    backgroundColor: '#1a1a2e',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  holdingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadgeText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 16,
  },
  holdingInfo: {
    marginLeft: 12,
    flex: 1,
  },
  holdingName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  holdingSymbol: {
    color: '#888',
    fontSize: 12,
    marginTop: 2,
  },
  holdingRight: {
    alignItems: 'flex-end',
  },
  holdingValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  holdingGainLoss: {
    fontSize: 12,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#4ECDC4',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
});
