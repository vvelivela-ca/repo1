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
  currency?: string;
  asset_type?: string;
  exchange?: string;
  _action?: string;
}

export default function ImportFile() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>('');
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ count: number; holdings: ImportedHolding[]; message?: string; raw_text_preview?: string } | null>(null);

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
      // Accept any file type - backend will auto-detect
      const docResult = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (docResult.canceled) return;
      const file = docResult.assets[0];
      if (!file) return;

      setImporting(true);
      setResult(null);

      const formData = new FormData();
      formData.append('portfolio_id', selectedPortfolio);
      
      const fileBlob = {
        uri: file.uri,
        name: file.name || 'import_file',
        type: file.mimeType || 'application/octet-stream',
      } as any;
      formData.append('file', fileBlob);

      // Use universal import endpoint
      const res = await fetch(`${API_URL}/api/holdings/import`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        Alert.alert('Import Failed', err.detail || 'Unknown error');
        return;
      }

      const data = await res.json();
      setResult({ 
        count: data.imported_count, 
        holdings: data.holdings, 
        message: data.message,
        raw_text_preview: data.raw_text_preview 
      });
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

        {/* Main Info Card */}
        <View style={styles.mainCard}>
          <View style={styles.iconContainer}>
            <Feather name="upload-cloud" size={48} color="#6366F1" />
          </View>
          <Text style={styles.mainTitle}>Smart Import</Text>
          <Text style={styles.mainSubtitle}>Upload any file - we'll auto-detect the format</Text>
        </View>

        {/* Supported Formats */}
        <View style={styles.formatsCard}>
          <Text style={styles.formatsTitle}>Supported Formats</Text>
          <View style={styles.formatsList}>
            <View style={styles.formatItem}>
              <View style={[styles.formatIcon, { backgroundColor: 'rgba(96, 165, 250, 0.15)' }]}>
                <Feather name="file-text" size={20} color="#60A5FA" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatName}>CSV / TXT</Text>
                <Text style={styles.formatDesc}>Comma or tab separated</Text>
              </View>
            </View>
            <View style={styles.formatItem}>
              <View style={[styles.formatIcon, { backgroundColor: 'rgba(74, 222, 128, 0.15)' }]}>
                <Feather name="grid" size={20} color="#4ADE80" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatName}>Excel (.xlsx)</Text>
                <Text style={styles.formatDesc}>Spreadsheet files</Text>
              </View>
            </View>
            <View style={styles.formatItem}>
              <View style={[styles.formatIcon, { backgroundColor: 'rgba(167, 139, 250, 0.15)' }]}>
                <Feather name="file" size={20} color="#A78BFA" />
              </View>
              <View style={styles.formatInfo}>
                <Text style={styles.formatName}>PDF</Text>
                <Text style={styles.formatDesc}>AI-powered parsing</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Smart Features */}
        <View style={styles.featuresCard}>
          <Text style={styles.featuresTitle}>Smart Features</Text>
          <View style={styles.featureItem}>
            <Feather name="globe" size={18} color="#6366F1" />
            <Text style={styles.featureText}>Auto-detects exchange (NYSE, TSX, NSE, etc.)</Text>
          </View>
          <View style={styles.featureItem}>
            <Feather name="dollar-sign" size={18} color="#6366F1" />
            <Text style={styles.featureText}>Auto-detects currency (USD, CAD, INR, EUR)</Text>
          </View>
          <View style={styles.featureItem}>
            <Feather name="layers" size={18} color="#6366F1" />
            <Text style={styles.featureText}>Auto-detects asset type (Stock, ETF, Crypto)</Text>
          </View>
          <View style={styles.featureItem}>
            <Feather name="zap" size={18} color="#6366F1" />
            <Text style={styles.featureText}>Flexible column names in CSV/Excel</Text>
          </View>
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
              <Text style={styles.importBtnText}>Select File to Import</Text>
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
                {result.holdings.slice(0, 10).map((h, i) => (
                  <View key={i} style={styles.resultRow}>
                    <View style={styles.resultLeft}>
                      <Text style={styles.resultSymbol}>{h.symbol}</Text>
                      <Text style={styles.resultMeta}>
                        {h.exchange || 'Unknown'} • {h.currency || 'USD'} • {h.asset_type || 'Stock'}
                      </Text>
                    </View>
                    <View style={styles.resultRight}>
                      <Text style={styles.resultShares}>{h.shares} shares</Text>
                      {h.avg_price > 0 && <Text style={styles.resultPrice}>@ ${h.avg_price.toFixed(2)}</Text>}
                    </View>
                  </View>
                ))}
                {result.holdings.length > 10 && (
                  <Text style={styles.moreText}>+{result.holdings.length - 10} more...</Text>
                )}
              </>
            ) : (
              <>
                <Feather name="alert-circle" size={24} color="#FACC15" />
                <Text style={styles.resultTitleWarn}>No holdings detected</Text>
                <Text style={styles.resultMessage}>
                  {result.message || 'The file format may not be supported. Make sure your file has Symbol and Shares columns.'}
                </Text>
                {result.raw_text_preview && (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewLabel}>File preview:</Text>
                    <Text style={styles.previewText}>{result.raw_text_preview.substring(0, 300)}...</Text>
                  </View>
                )}
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
  mainCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 24, marginTop: 16, alignItems: 'center' },
  iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(99, 102, 241, 0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  mainTitle: { fontSize: 22, fontWeight: '700', color: '#FAFAFA', marginBottom: 8 },
  mainSubtitle: { fontSize: 14, color: '#A1A1AA', textAlign: 'center' },
  formatsCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 20, marginTop: 16 },
  formatsTitle: { fontSize: 16, fontWeight: '600', color: '#FAFAFA', marginBottom: 16 },
  formatsList: { gap: 12 },
  formatItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  formatIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  formatInfo: { flex: 1 },
  formatName: { fontSize: 15, fontWeight: '600', color: '#FAFAFA' },
  formatDesc: { fontSize: 13, color: '#52525B', marginTop: 2 },
  featuresCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 20, marginTop: 16 },
  featuresTitle: { fontSize: 16, fontWeight: '600', color: '#FAFAFA', marginBottom: 12 },
  featureItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  featureText: { fontSize: 14, color: '#A1A1AA', flex: 1 },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#A1A1AA', marginTop: 24, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  portfolioSelector: { gap: 8 },
  portfolioOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#18181B', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#27272A' },
  portfolioOptionActive: { borderColor: '#6366F1' },
  portfolioOptionText: { fontSize: 15, color: '#52525B', fontWeight: '500' },
  portfolioOptionTextActive: { color: '#FAFAFA' },
  importBtn: { height: 56, borderRadius: 100, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  importBtnInner: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  importBtnText: { fontSize: 16, fontWeight: '700', color: '#FAFAFA' },
  resultCard: { backgroundColor: '#18181B', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', padding: 20, marginTop: 24, alignItems: 'center' },
  resultTitle: { fontSize: 18, fontWeight: '700', color: '#4ADE80', marginTop: 8, marginBottom: 16 },
  resultTitleWarn: { fontSize: 18, fontWeight: '700', color: '#FACC15', marginTop: 8, marginBottom: 8 },
  resultMessage: { fontSize: 14, color: '#A1A1AA', textAlign: 'center', marginBottom: 12 },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1f1f23' },
  resultLeft: {},
  resultRight: { alignItems: 'flex-end' },
  resultSymbol: { fontSize: 15, fontWeight: '700', color: '#FAFAFA' },
  resultMeta: { fontSize: 12, color: '#52525B', marginTop: 2 },
  resultShares: { fontSize: 14, color: '#A1A1AA', fontFamily: MONO },
  resultPrice: { fontSize: 12, color: '#52525B', fontFamily: MONO },
  moreText: { fontSize: 13, color: '#52525B', marginTop: 8 },
  previewBox: { backgroundColor: '#0f0f0f', borderRadius: 8, padding: 12, marginTop: 12, width: '100%' },
  previewLabel: { fontSize: 12, color: '#52525B', marginBottom: 6 },
  previewText: { fontSize: 11, color: '#71717A', fontFamily: MONO },
  doneBtn: { height: 44, borderRadius: 22, backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: 16 },
  doneBtnText: { fontSize: 14, fontWeight: '600', color: '#FAFAFA' },
});
