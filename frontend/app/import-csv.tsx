import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Portfolio {
  id: string;
  name: string;
}

interface ImportedHolding {
  symbol: string;
  shares: number;
  avg_price: number;
}

export default function ImportFile() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; holdings: ImportedHolding[]; message?: string } | null>(null);
  const [selectedType, setSelectedType] = useState<'csv' | 'pdf' | 'excel'>('csv');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/portfolios`);
        const data = await res.json();
        setPortfolios(data);
        if (data.length > 0) setSelectedPortfolio(data[0].id);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const handlePickFile = async () => {
    if (!selectedPortfolio) {
      Alert.alert('Error', 'Select a portfolio first');
      return;
    }

    try {
      let mimeTypes: string[];
      if (selectedType === 'csv') {
        mimeTypes = ['text/csv', 'text/comma-separated-values', 'application/vnd.ms-excel', '*/*'];
      } else if (selectedType === 'excel') {
        mimeTypes = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', '*/*'];
      } else {
        mimeTypes = ['application/pdf', '*/*'];
      }

      const docResult = await DocumentPicker.getDocumentAsync({
        type: mimeTypes,
        copyToCacheDirectory: true,
      });

      if (docResult.canceled) return;
      const file = docResult.assets[0];
      if (!file) return;

      setImporting(true);
      setResult(null);

      const formData = new FormData();
      formData.append('portfolio_id', selectedPortfolio);
      
      let fileName = file.name || 'import';
      let mimeType = file.mimeType || 'application/octet-stream';
      if (selectedType === 'csv') {
        fileName = fileName.endsWith('.csv') ? fileName : 'import.csv';
        mimeType = 'text/csv';
      } else if (selectedType === 'excel') {
        fileName = fileName.endsWith('.xlsx') ? fileName : 'import.xlsx';
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      } else {
        fileName = fileName.endsWith('.pdf') ? fileName : 'statement.pdf';
        mimeType = 'application/pdf';
      }
      
      const fileBlob = {
        uri: file.uri,
        name: fileName,
        type: mimeType,
      } as any;
      formData.append('file', fileBlob);

      const endpoint = selectedType === 'csv' ? '/api/holdings/import-csv' : selectedType === 'excel' ? '/api/holdings/import-excel' : '/api/holdings/import-pdf';
      const res = await fetch(`${API_URL}${endpoint}`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        Alert.alert('Import Failed', err.detail || 'Unknown error');
        return;
      }

      const data = await res.json();
      setResult({ count: data.imported_count, holdings: data.holdings, message: data.message });
    } catch (err) {
      console.error('Import error:', err);
      Alert.alert('Error', 'Failed to import file');
    } finally {
      setImporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity testID="back-from-import" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
            <Feather name="arrow-left" size={24} color="#FAFAFA" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Import Holdings</Text>
          <View style={{ width: 44 }} />
        </View>

        {/* File Type Toggle */}
        <View style={styles.toggleRow}>
          <TouchableOpacity
            testID="toggle-csv"
            style={[styles.toggleBtn, selectedType === 'csv' && styles.toggleBtnActive]}
            onPress={() => setSelectedType('csv')}
            activeOpacity={0.7}
          >
            <Feather name="file-text" size={16} color={selectedType === 'csv' ? '#FAFAFA' : '#52525B'} />
            <Text style={[styles.toggleText, selectedType === 'csv' && styles.toggleTextActive]}>CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="toggle-excel"
            style={[styles.toggleBtn, selectedType === 'excel' && styles.toggleBtnActive]}
            onPress={() => setSelectedType('excel')}
            activeOpacity={0.7}
          >
            <Feather name="grid" size={16} color={selectedType === 'excel' ? '#FAFAFA' : '#52525B'} />
            <Text style={[styles.toggleText, selectedType === 'excel' && styles.toggleTextActive]}>Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="toggle-pdf"
            style={[styles.toggleBtn, selectedType === 'pdf' && styles.toggleBtnActive]}
            onPress={() => setSelectedType('pdf')}
            activeOpacity={0.7}
          >
            <Feather name="file" size={16} color={selectedType === 'pdf' ? '#FAFAFA' : '#52525B'} />
            <Text style={[styles.toggleText, selectedType === 'pdf' && styles.toggleTextActive]}>PDF</Text>
          </TouchableOpacity>
        </View>

        {/* Info Card */}
        {selectedType === 'csv' ? (
          <View style={styles.infoCard}>
            <Feather name="info" size={20} color="#60A5FA" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>CSV Format</Text>
              <Text style={styles.infoText}>Your CSV should have columns for:</Text>
              <Text style={styles.infoColumns}>Symbol, Shares, Avg Price</Text>
              <Text style={styles.infoText}>Also supports: Ticker, Quantity, Cost, Book Cost Per Share</Text>
            </View>
          </View>
        ) : selectedType === 'excel' ? (
          <View style={styles.infoCard}>
            <Feather name="info" size={20} color="#4ADE80" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>Excel Format (.xlsx)</Text>
              <Text style={styles.infoText}>Your Excel file should have columns for:</Text>
              <Text style={styles.infoColumns}>Symbol, Shares, Avg Price</Text>
              <Text style={styles.infoText}>Optional columns: Currency, Asset Type, Exchange</Text>
            </View>
          </View>
        ) : (
          <View style={styles.infoCard}>
            <Feather name="info" size={20} color="#A78BFA" />
            <View style={styles.infoContent}>
              <Text style={styles.infoTitle}>AI-Powered PDF Parsing</Text>
              <Text style={styles.infoText}>Upload any brokerage statement — our AI reads and extracts holdings automatically.</Text>
              <Text style={styles.infoText}>Works with any format: Wealthsimple, Fidelity, Schwab, Questrade, and more.</Text>
              <Text style={[styles.infoText, { color: '#4ADE80', marginTop: 6 }]}>Powered by GPT — handles messy tables, currency formats, and non-standard layouts.</Text>
            </View>
          </View>
        )}

        {/* Brokerage Tips */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>
            {selectedType === 'csv' ? 'Export CSV from:' : selectedType === 'excel' ? 'Export Excel from:' : 'Download PDF from:'}
          </Text>
          {selectedType === 'csv' || selectedType === 'excel' ? (
            [
              { name: 'Wealthsimple', steps: 'Activity → Export' },
              { name: 'Fidelity', steps: 'Positions → Download' },
              { name: 'Schwab', steps: 'Accounts → Export' },
              { name: 'TD Ameritrade', steps: 'My Account → Export Positions' },
              { name: 'Interactive Brokers', steps: 'Reports → Flex Queries' },
            ].map((b, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBrokerage}>{b.name}</Text>
                <Text style={styles.tipSteps}>{b.steps}</Text>
              </View>
            ))
          ) : (
            [
              { name: 'Wealthsimple', steps: 'Documents → Account Statements' },
              { name: 'Fidelity', steps: 'Statements → Download PDF' },
              { name: 'Schwab', steps: 'Statements → Brokerage Statement' },
              { name: 'TD Ameritrade', steps: 'Statements → Account Statement' },
              { name: 'Interactive Brokers', steps: 'Reports → Statements → PDF' },
              { name: 'Questrade', steps: 'Reports → Account Statements' },
            ].map((b, i) => (
              <View key={i} style={styles.tipRow}>
                <Text style={styles.tipBrokerage}>{b.name}</Text>
                <Text style={styles.tipSteps}>{b.steps}</Text>
              </View>
            ))
          )}
        </View>

        {/* Portfolio Selector */}
        <Text style={styles.sectionLabel}>Import into portfolio:</Text>
        <View style={styles.portfolioSelector}>
          {portfolios.map((p) => (
            <TouchableOpacity
              key={p.id}
              testID={`select-portfolio-${p.id}`}
              style={[styles.portfolioOption, selectedPortfolio === p.id && styles.portfolioOptionActive]}
              onPress={() => setSelectedPortfolio(p.id)}
              activeOpacity={0.7}
            >
              <Feather name={selectedPortfolio === p.id ? 'check-circle' : 'circle'} size={18} color={selectedPortfolio === p.id ? '#6366F1' : '#52525B'} />
              <Text style={[styles.portfolioOptionText, selectedPortfolio === p.id && styles.portfolioOptionTextActive]}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Import Button */}
        <TouchableOpacity testID="pick-file-btn" style={styles.importBtn} onPress={handlePickFile} activeOpacity={0.7} disabled={importing}>
          {importing ? (
            <ActivityIndicator color="#09090B" />
          ) : (
            <View style={styles.importBtnInner}>
              <Feather name="upload" size={20} color="#09090B" />
              <Text style={styles.importBtnText}>
                {selectedType === 'csv' ? 'Select CSV File' : selectedType === 'excel' ? 'Select Excel File' : 'Select PDF Statement'}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={styles.resultCard}>
            {result.count > 0 ? (
              <>
                <Feather name="check-circle" size={24} color="#4ADE80" />
                <Text style={styles.resultTitle}>Imported {result.count} holdings!</Text>
                {result.holdings.map((h, i) => (
                  <View key={i} style={styles.resultRow}>
                    <Text style={styles.resultSymbol}>{h.symbol}</Text>
                    <Text style={styles.resultDetail}>{h.shares} shares @ ${h.avg_price.toFixed(2)}</Text>
                  </View>
                ))}
              </>
            ) : (
              <>
                <Feather name="alert-circle" size={24} color="#FACC15" />
                <Text style={styles.resultTitleWarn}>No holdings detected</Text>
                <Text style={styles.resultMessage}>
                  {result.message || 'The file format may not be supported. Try CSV format or add holdings manually.'}
                </Text>
              </>
            )}
            <TouchableOpacity testID="go-to-dashboard-btn" style={styles.doneBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.doneBtnText}>Back to Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace' });

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FAFAFA' },
  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  toggleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 48, borderRadius: 12, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A' },
  toggleBtnActive: { backgroundColor: '#6366F1', borderColor: '#6366F1' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#52525B' },
  toggleTextActive: { color: '#FAFAFA' },
  infoCard: { flexDirection: 'row', backgroundColor: 'rgba(96, 165, 250, 0.08)', borderRadius: 14, padding: 16, marginTop: 16, gap: 12, borderWidth: 1, borderColor: 'rgba(96, 165, 250, 0.2)' },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 15, fontWeight: '600', color: '#FAFAFA', marginBottom: 6 },
  infoText: { fontSize: 13, color: '#A1A1AA', marginBottom: 4 },
  infoColumns: { fontSize: 13, fontWeight: '600', color: '#60A5FA', fontFamily: MONO, marginBottom: 4 },
  tipsCard: { backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A', padding: 16, marginTop: 16 },
  tipsTitle: { fontSize: 15, fontWeight: '600', color: '#FAFAFA', marginBottom: 12 },
  tipRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  tipBrokerage: { fontSize: 14, fontWeight: '600', color: '#FAFAFA' },
  tipSteps: { fontSize: 13, color: '#52525B', maxWidth: '55%', textAlign: 'right' },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#A1A1AA', marginTop: 24, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  portfolioSelector: { gap: 8 },
  portfolioOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#18181B', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#27272A' },
  portfolioOptionActive: { borderColor: '#6366F1' },
  portfolioOptionText: { fontSize: 15, color: '#52525B', fontWeight: '500' },
  portfolioOptionTextActive: { color: '#FAFAFA' },
  importBtn: { height: 56, borderRadius: 100, backgroundColor: '#FAFAFA', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  importBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#09090B' },
  resultCard: { backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A', padding: 20, marginTop: 24, alignItems: 'center' },
  resultTitle: { fontSize: 18, fontWeight: '700', color: '#4ADE80', marginTop: 8, marginBottom: 16 },
  resultTitleWarn: { fontSize: 18, fontWeight: '700', color: '#FACC15', marginTop: 8, marginBottom: 8 },
  resultMessage: { fontSize: 14, color: '#A1A1AA', textAlign: 'center', marginBottom: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  resultSymbol: { fontSize: 14, fontWeight: '700', color: '#FAFAFA' },
  resultDetail: { fontSize: 13, color: '#A1A1AA', fontFamily: MONO },
  doneBtn: { height: 44, borderRadius: 22, backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 16 },
  doneBtnText: { fontSize: 14, fontWeight: '600', color: '#FAFAFA' },
});
