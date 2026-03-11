import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL || '';

const CATEGORIES = [
  'Stock',
  'Crypto',
  'ETF',
  'Mutual Fund',
  'Bond',
  'Real Estate',
  'Other',
];

const CATEGORY_COLORS: Record<string, string> = {
  Stock: '#4ECDC4',
  Crypto: '#FFE66D',
  ETF: '#95E1D3',
  'Mutual Fund': '#F38181',
  Bond: '#AA96DA',
  'Real Estate': '#FCBAD3',
  Other: '#A8D8EA',
};

export default function EditHoldingScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [quantity, setQuantity] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [category, setCategory] = useState('Stock');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchHolding();
  }, [id]);

  const fetchHolding = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/holdings/${id}`);
      const holding = response.data;
      setName(holding.name);
      setSymbol(holding.symbol);
      setQuantity(holding.quantity.toString());
      setPurchasePrice(holding.purchase_price.toString());
      setCurrentPrice(holding.current_price.toString());
      setCategory(holding.category || 'Stock');
      setPurchaseDate(holding.purchase_date || '');
      setNotes(holding.notes || '');
    } catch (error) {
      console.error('Error fetching holding:', error);
      Alert.alert('Error', 'Failed to fetch holding details');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for the holding');
      return;
    }
    if (!symbol.trim()) {
      Alert.alert('Error', 'Please enter a symbol');
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      Alert.alert('Error', 'Please enter a valid quantity');
      return;
    }
    if (!purchasePrice || parseFloat(purchasePrice) <= 0) {
      Alert.alert('Error', 'Please enter a valid purchase price');
      return;
    }
    if (!currentPrice || parseFloat(currentPrice) <= 0) {
      Alert.alert('Error', 'Please enter a valid current price');
      return;
    }

    setSaving(true);
    try {
      await axios.put(`${API_URL}/api/holdings/${id}`, {
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        quantity: parseFloat(quantity),
        purchase_price: parseFloat(purchasePrice),
        current_price: parseFloat(currentPrice),
        category,
        purchase_date: purchaseDate || null,
        notes: notes.trim() || null,
      });
      router.back();
    } catch (error) {
      console.error('Error updating holding:', error);
      Alert.alert('Error', 'Failed to update holding. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4ECDC4" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            {/* Name Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Apple Inc."
                placeholderTextColor="#666"
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Symbol Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Symbol *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., AAPL"
                placeholderTextColor="#666"
                value={symbol}
                onChangeText={setSymbol}
                autoCapitalize="characters"
              />
            </View>

            {/* Category Selection */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Category</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoryScroll}
              >
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryChip,
                      {
                        backgroundColor:
                          category === cat
                            ? CATEGORY_COLORS[cat]
                            : 'transparent',
                        borderColor: CATEGORY_COLORS[cat],
                      },
                    ]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        { color: category === cat ? '#000' : CATEGORY_COLORS[cat] },
                      ]}
                    >
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Quantity Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Quantity *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 10"
                placeholderTextColor="#666"
                value={quantity}
                onChangeText={setQuantity}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Purchase Price Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purchase Price (per unit) *</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="0.00"
                  placeholderTextColor="#666"
                  value={purchasePrice}
                  onChangeText={setPurchasePrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Current Price Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Current Price (per unit) *</Text>
              <View style={styles.priceInputContainer}>
                <Text style={styles.currencySymbol}>$</Text>
                <TextInput
                  style={styles.priceInput}
                  placeholder="0.00"
                  placeholderTextColor="#666"
                  value={currentPrice}
                  onChangeText={setCurrentPrice}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            {/* Purchase Date Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Purchase Date (optional)</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#666"
                value={purchaseDate}
                onChangeText={setPurchaseDate}
              />
            </View>

            {/* Notes Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                placeholder="Add any notes about this holding..."
                placeholderTextColor="#666"
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
            </View>
          </View>
        </ScrollView>

        {/* Submit Button */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark" size={20} color="#fff" />
                <Text style={styles.submitButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f1a',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f1a',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  form: {
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1,
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '500',
  },
  priceInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  currencySymbol: {
    color: '#888',
    fontSize: 18,
    paddingLeft: 16,
  },
  priceInput: {
    flex: 1,
    padding: 16,
    color: '#fff',
    fontSize: 16,
  },
  notesInput: {
    height: 100,
    paddingTop: 16,
  },
  buttonContainer: {
    padding: 20,
    paddingBottom: 32,
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
