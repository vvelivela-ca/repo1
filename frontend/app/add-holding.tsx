import React, { useState } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const [currency, setCurrency] = useState('USD');
  const [saving, setSaving] = useState(false);

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
          body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), shares: parseFloat(shares), avg_price: parseFloat(avgPrice) }),
        });
      } else {
        await fetch(`${API_URL}/api/holdings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: symbol.trim().toUpperCase(), shares: parseFloat(shares), avg_price: parseFloat(avgPrice), portfolio_id: portfolioId, currency }),
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.inner}>
            <View style={styles.header}>
              <TouchableOpacity testID="close-form-btn" onPress={() => router.back()} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={24} color="#FAFAFA" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>{isEditing ? 'Edit Holding' : 'Add Holding'}</Text>
              <View style={{ width: 44 }} />
            </View>

            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Stock Symbol</Text>
                <TextInput testID="symbol-input" style={styles.input} value={symbol} onChangeText={setSymbol} placeholder="e.g. AAPL" placeholderTextColor="#3F3F46" autoCapitalize="characters" autoCorrect={false} editable={!isEditing} />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Number of Shares</Text>
                <TextInput testID="shares-input" style={styles.input} value={shares} onChangeText={setShares} placeholder="e.g. 100" placeholderTextColor="#3F3F46" keyboardType="decimal-pad" />
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Average Price per Share</Text>
                <TextInput testID="avg-price-input" style={styles.input} value={avgPrice} onChangeText={setAvgPrice} placeholder="e.g. 150.00" placeholderTextColor="#3F3F46" keyboardType="decimal-pad" />
              </View>
              {!isEditing && (
                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Currency</Text>
                  <View style={styles.currRow}>
                    {['USD', 'CAD', 'INR'].map((c) => (
                      <TouchableOpacity key={c} testID={`currency-btn-${c}`} style={[styles.currBtn, currency === c && styles.currBtnActive]} onPress={() => setCurrency(c)} activeOpacity={0.7}>
                        <Text style={[styles.currBtnText, currency === c && styles.currBtnTextActive]}>{c === 'USD' ? '$ USD' : c === 'CAD' ? 'C$ CAD' : '₹ INR'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            <TouchableOpacity testID="save-holding-btn" style={[styles.saveBtn, saving && styles.saveBtnDisabled]} activeOpacity={0.7} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#09090B" /> : <Text style={styles.saveBtnText}>{isEditing ? 'Update Holding' : 'Add to Portfolio'}</Text>}
            </TouchableOpacity>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  flex: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  closeBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FAFAFA' },
  form: { marginTop: 32, gap: 24 },
  fieldGroup: {},
  fieldLabel: { fontSize: 14, fontWeight: '600', color: '#A1A1AA', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 56, borderRadius: 12, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', color: '#FAFAFA', paddingHorizontal: 16, fontSize: 18, fontWeight: '500' },
  saveBtn: { height: 56, borderRadius: 100, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { fontSize: 16, fontWeight: '700', color: '#09090B' },
  currRow: { flexDirection: 'row', gap: 10 },
  currBtn: { flex: 1, height: 48, borderRadius: 12, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', alignItems: 'center', justifyContent: 'center' },
  currBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  currBtnText: { fontSize: 14, fontWeight: '600', color: '#52525B' },
  currBtnTextActive: { color: '#FAFAFA' },
});
