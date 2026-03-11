import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface TickerInfo {
  symbol: string;
  exchange: string | null;
  currency: string;
  asset_type: string;
  price: number;
}

export default function AddHolding() {
  const router = useRouter();
  const { editId, editSymbol, editShares, editAvgPrice, portfolioId } = useLocalSearchParams<{
    editId?: string;
    editSymbol?: string;
    editShares?: string;
    editAvgPrice?: string;
    portfolioId?: string;
  }>();

  const isEditing = !!editId;

  const [symbol, setSymbol] = useState(editSymbol || '');
  const [shares, setShares] = useState(editShares || '');
  const [avgPrice, setAvgPrice] = useState(editAvgPrice || '');
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [tickerInfo, setTickerInfo] = useState<TickerInfo | null>(null);

  // Look up ticker when symbol changes (debounced)
  useEffect(() => {
    if (!symbol.trim() || symbol.length < 1 || isEditing) {
      setTickerInfo(null);
      return;
    }

    const timer = setTimeout(async () => {
      setLookingUp(true);
      try {
        const res = await fetch(`${API_URL}/api/ticker/lookup/${symbol.trim().toUpperCase()}`);
        const data = await res.json();
        setTickerInfo(data);
        // Auto-fill current price as avg price if empty
        if (!avgPrice && data.price > 0) {
          setAvgPrice(data.price.toFixed(2));
        }
      } catch (err) {
        console.error('Lookup error:', err);
        setTickerInfo(null);
      } finally {
        setLookingUp(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [symbol]);

  const handleSave = async () => {
    if (!symbol.trim()) { Alert.alert('Error', 'Please enter a stock symbol'); return; }
    if (!shares.trim() || isNaN(Number(shares)) || Number(shares) <= 0) { Alert.alert('Error', 'Please enter valid shares'); return; }
    if (!avgPrice.trim() || isNaN(Number(avgPrice)) || Number(avgPrice) <= 0) { Alert.alert('Error', 'Please enter valid avg price'); return; }

    setSaving(true);
    try {
      if (isEditing) {
        await fetch(`${API_URL}/api/holdings/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol: symbol.trim().toUpperCase(), 
            shares: parseFloat(shares), 
            avg_price: parseFloat(avgPrice)
          }),
        });
      } else {
        // Use auto-detected info
        await fetch(`${API_URL}/api/holdings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            symbol: symbol.trim().toUpperCase(), 
            shares: parseFloat(shares), 
            avg_price: parseFloat(avgPrice), 
            portfolio_id: portfolioId,
            // Let backend auto-detect currency, exchange, and asset_type
          }),
        });
      }
      router.back();
    } catch (err) {
      console.error('Error saving:', err);
      Alert.alert('Error', 'Failed to save holding');
    } finally {
      setSaving(false);
    }
  };

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = { USD: '$', CAD: 'C$', INR: '₹', GBP: '£', EUR: '€' };
    return symbols[currency] || '$';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <TouchableOpacity testID="close-form-btn" onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={24} color="#FAFAFA" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{isEditing ? 'Edit Holding' : 'Add Holding'}</Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.form}>
              {/* Symbol Input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Stock Symbol</Text>
                <View style={styles.symbolInputRow}>
                  <TextInput 
                    testID="symbol-input" 
                    style={[styles.input, styles.symbolInput]} 
                    value={symbol} 
                    onChangeText={setSymbol} 
                    placeholder="e.g. AAPL, SHOP.TO, BTC" 
                    placeholderTextColor="#3F3F46" 
                    autoCapitalize="characters" 
                    autoCorrect={false} 
                    editable={!isEditing} 
                  />
                  {lookingUp && <ActivityIndicator size="small" color="#6366F1" style={styles.lookupSpinner} />}
                </View>
                {!isEditing && (
                  <Text style={styles.hintText}>
                    Enter any ticker - we'll auto-detect exchange and currency
                  </Text>
                )}
              </View>

              {/* Auto-detected Info Card */}
              {tickerInfo && tickerInfo.price > 0 && !isEditing && (
                <View style={styles.infoCard}>
                  <View style={styles.infoRow}>
                    <Feather name="check-circle" size={16} color="#4ADE80" />
                    <Text style={styles.infoText}>Found: {tickerInfo.symbol}</Text>
                  </View>
                  <View style={styles.infoDetails}>
                    <View style={styles.infoChip}>
                      <Feather name="globe" size={12} color="#A1A1AA" />
                      <Text style={styles.infoChipText}>{tickerInfo.exchange || 'Unknown'}</Text>
                    </View>
                    <View style={styles.infoChip}>
                      <Feather name="dollar-sign" size={12} color="#A1A1AA" />
                      <Text style={styles.infoChipText}>{tickerInfo.currency}</Text>
                    </View>
                    <View style={styles.infoChip}>
                      <Feather name="layers" size={12} color="#A1A1AA" />
                      <Text style={styles.infoChipText}>{tickerInfo.asset_type}</Text>
                    </View>
                  </View>
                  <View style={styles.priceRow}>
                    <Text style={styles.priceLabel}>Current Price:</Text>
                    <Text style={styles.priceValue}>
                      {getCurrencySymbol(tickerInfo.currency)}{tickerInfo.price.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              {/* Shares Input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Number of Shares</Text>
                <TextInput 
                  testID="shares-input" 
                  style={styles.input} 
                  value={shares} 
                  onChangeText={setShares} 
                  placeholder="e.g. 100" 
                  placeholderTextColor="#3F3F46" 
                  keyboardType="decimal-pad" 
                />
              </View>

              {/* Avg Price Input */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Average Price per Share</Text>
                <View style={styles.priceInputContainer}>
                  <Text style={styles.currencySymbol}>
                    {tickerInfo ? getCurrencySymbol(tickerInfo.currency) : '$'}
                  </Text>
                  <TextInput 
                    testID="avg-price-input" 
                    style={styles.priceInput} 
                    value={avgPrice} 
                    onChangeText={setAvgPrice} 
                    placeholder="0.00" 
                    placeholderTextColor="#3F3F46" 
                    keyboardType="decimal-pad" 
                  />
                </View>
                {tickerInfo && tickerInfo.price > 0 && (
                  <TouchableOpacity 
                    style={styles.usePriceBtn} 
                    onPress={() => setAvgPrice(tickerInfo.price.toFixed(2))}
                  >
                    <Text style={styles.usePriceBtnText}>
                      Use current price ({getCurrencySymbol(tickerInfo.currency)}{tickerInfo.price.toFixed(2)})
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Submit Button */}
            <TouchableOpacity 
              testID="save-holding-btn" 
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]} 
              activeOpacity={0.7} 
              onPress={handleSave} 
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#09090B" />
              ) : (
                <Text style={styles.saveBtnText}>{isEditing ? 'Update Holding' : 'Add to Portfolio'}</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  flex: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FAFAFA' },
  form: { marginTop: 24, gap: 20 },
  fieldGroup: {},
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#A1A1AA', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  symbolInputRow: { flexDirection: 'row', alignItems: 'center' },
  symbolInput: { flex: 1 },
  lookupSpinner: { position: 'absolute', right: 16 },
  input: { height: 56, borderRadius: 12, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', color: '#FAFAFA', paddingHorizontal: 16, fontSize: 18, fontWeight: '500' },
  hintText: { fontSize: 12, color: '#52525B', marginTop: 8 },
  infoCard: { backgroundColor: 'rgba(74, 222, 128, 0.08)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(74, 222, 128, 0.2)', padding: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  infoText: { fontSize: 15, fontWeight: '600', color: '#4ADE80' },
  infoDetails: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  infoChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#18181B', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  infoChipText: { fontSize: 12, color: '#A1A1AA', fontWeight: '500' },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceLabel: { fontSize: 13, color: '#A1A1AA' },
  priceValue: { fontSize: 16, fontWeight: '700', color: '#FAFAFA', fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },
  priceInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181B', borderRadius: 12, borderWidth: 1, borderColor: '#27272A' },
  currencySymbol: { color: '#52525B', fontSize: 18, paddingLeft: 16, fontWeight: '500' },
  priceInput: { flex: 1, height: 56, color: '#FAFAFA', paddingHorizontal: 8, fontSize: 18, fontWeight: '500' },
  usePriceBtn: { marginTop: 8 },
  usePriceBtnText: { fontSize: 13, color: '#6366F1', fontWeight: '500' },
  saveBtn: { height: 56, borderRadius: 100, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', marginTop: 32 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#09090B' },
});
