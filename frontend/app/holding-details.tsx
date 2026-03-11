import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORY_COLORS: Record<string, string> = {
  Stock: '#4ECDC4',
  Crypto: '#FFE66D',
  ETF: '#95E1D3',
  'Mutual Fund': '#F38181',
  Bond: '#AA96DA',
  'Real Estate': '#FCBAD3',
  Other: '#A8D8EA',
};

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
  created_at: string;
  updated_at: string;
}

export default function HoldingDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [holding, setHolding] = useState<Holding | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const fetchHolding = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/holdings/${id}`);
      setHolding(response.data);
    } catch (error) {
      console.error('Error fetching holding:', error);
      Alert.alert('Error', 'Failed to fetch holding details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchHolding();
    }, [id])
  );

  const handleDelete = () => {
    Alert.alert(
      'Delete Holding',
      'Are you sure you want to delete this holding? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await axios.delete(`${API_URL}/api/holdings/${id}`);
              router.back();
            } catch (error) {
              console.error('Error deleting holding:', error);
              Alert.alert('Error', 'Failed to delete holding');
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ECDC4" />
      </View>
    );
  }

  if (!holding) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Holding not found</Text>
      </View>
    );
  }

  const currentValue = holding.quantity * holding.current_price;
  const totalCost = holding.quantity * holding.purchase_price;
  const gainLoss = currentValue - totalCost;
  const gainLossPercentage = (gainLoss / totalCost) * 100;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        {/* Header Card */}
        <View style={styles.headerCard}>
          <View style={styles.headerTop}>
            <View
              style={[
                styles.categoryBadge,
                { backgroundColor: CATEGORY_COLORS[holding.category] || '#888' },
              ]}
            >
              <Text style={styles.categoryBadgeText}>
                {holding.category.charAt(0)}
              </Text>
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.holdingName}>{holding.name}</Text>
              <Text style={styles.holdingSymbol}>{holding.symbol}</Text>
            </View>
          </View>

          <View style={styles.valueSection}>
            <Text style={styles.currentValue}>{formatCurrency(currentValue)}</Text>
            <View
              style={[
                styles.gainLossBadge,
                {
                  backgroundColor:
                    gainLoss >= 0
                      ? 'rgba(78, 205, 196, 0.2)'
                      : 'rgba(255, 107, 107, 0.2)',
                },
              ]}
            >
              <Ionicons
                name={gainLoss >= 0 ? 'trending-up' : 'trending-down'}
                size={16}
                color={gainLoss >= 0 ? '#4ECDC4' : '#FF6B6B'}
              />
              <Text
                style={[
                  styles.gainLossText,
                  { color: gainLoss >= 0 ? '#4ECDC4' : '#FF6B6B' },
                ]}
              >
                {gainLoss >= 0 ? '+' : ''}
                {formatCurrency(gainLoss)} ({gainLossPercentage.toFixed(2)}%)
              </Text>
            </View>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Position Details</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Quantity</Text>
            <Text style={styles.detailValue}>{holding.quantity}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Purchase Price</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(holding.purchase_price)}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Price</Text>
            <Text style={styles.detailValue}>
              {formatCurrency(holding.current_price)}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Cost</Text>
            <Text style={styles.detailValue}>{formatCurrency(totalCost)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Current Value</Text>
            <Text style={styles.detailValue}>{formatCurrency(currentValue)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Gain/Loss</Text>
            <Text
              style={[
                styles.detailValue,
                { color: gainLoss >= 0 ? '#4ECDC4' : '#FF6B6B' },
              ]}
            >
              {gainLoss >= 0 ? '+' : ''}
              {formatCurrency(gainLoss)}
            </Text>
          </View>
        </View>

        {/* Additional Info Card */}
        <View style={styles.detailsCard}>
          <Text style={styles.sectionTitle}>Additional Information</Text>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Category</Text>
            <View style={styles.categoryTag}>
              <View
                style={[
                  styles.categoryDot,
                  { backgroundColor: CATEGORY_COLORS[holding.category] || '#888' },
                ]}
              />
              <Text style={styles.categoryTagText}>{holding.category}</Text>
            </View>
          </View>

          {holding.purchase_date && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Purchase Date</Text>
              <Text style={styles.detailValue}>{holding.purchase_date}</Text>
            </View>
          )}

          {holding.notes && (
            <View style={styles.notesSection}>
              <Text style={styles.detailLabel}>Notes</Text>
              <Text style={styles.notesText}>{holding.notes}</Text>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() =>
              router.push({
                pathname: '/edit-holding',
                params: { id: holding.id },
              })
            }
          >
            <Ionicons name="pencil" size={20} color="#fff" />
            <Text style={styles.editButtonText}>Edit Holding</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#FF6B6B" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={20} color="#FF6B6B" />
                <Text style={styles.deleteButtonText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  errorText: {
    color: '#888',
    fontSize: 16,
  },
  headerCard: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    padding: 20,
    borderRadius: 16,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  categoryBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadgeText: {
    color: '#000',
    fontWeight: 'bold',
    fontSize: 20,
  },
  headerInfo: {
    marginLeft: 16,
  },
  holdingName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  holdingSymbol: {
    color: '#888',
    fontSize: 14,
    marginTop: 4,
  },
  valueSection: {
    alignItems: 'center',
  },
  currentValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
  },
  gainLossBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 12,
  },
  gainLossText: {
    marginLeft: 6,
    fontSize: 14,
    fontWeight: '600',
  },
  detailsCard: {
    backgroundColor: '#1a1a2e',
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  detailLabel: {
    color: '#888',
    fontSize: 14,
  },
  detailValue: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#3a3a4e',
    marginVertical: 8,
  },
  categoryTag: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  categoryTagText: {
    color: '#fff',
    fontSize: 14,
  },
  notesSection: {
    paddingTop: 12,
  },
  notesText: {
    color: '#fff',
    fontSize: 14,
    marginTop: 8,
    lineHeight: 20,
  },
  actionButtons: {
    flexDirection: 'row',
    padding: 16,
    paddingBottom: 32,
    gap: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.1)',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FF6B6B',
  },
  deleteButtonText: {
    color: '#FF6B6B',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
