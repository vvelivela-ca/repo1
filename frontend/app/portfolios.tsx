import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
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

export default function Portfolios() {
  const router = useRouter();
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchPortfolios = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/portfolios`);
      const data = await res.json();
      setPortfolios(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPortfolios(); }, [fetchPortfolios]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await fetch(`${API_URL}/api/portfolios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      setNewName('');
      Keyboard.dismiss();
      fetchPortfolios();
    } catch (err) {
      Alert.alert('Error', 'Failed to create portfolio');
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    try {
      await fetch(`${API_URL}/api/portfolios/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingId(null);
      setEditName('');
      fetchPortfolios();
    } catch (err) {
      Alert.alert('Error', 'Failed to rename');
    }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Portfolio', `Delete "${name}" and all its holdings?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await fetch(`${API_URL}/api/portfolios/${id}`, { method: 'DELETE' });
            if (!res.ok) {
              const data = await res.json();
              Alert.alert('Error', data.detail || 'Failed to delete');
              return;
            }
            fetchPortfolios();
          } catch (err) {
            Alert.alert('Error', 'Failed to delete');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: Portfolio }) => {
    const isEditing = editingId === item.id;
    return (
      <View style={styles.portfolioCard}>
        {isEditing ? (
          <View style={styles.editRow}>
            <TextInput
              testID={`edit-name-input-${item.id}`}
              style={styles.editInput}
              value={editName}
              onChangeText={setEditName}
              autoFocus
              placeholderTextColor="#3F3F46"
            />
            <TouchableOpacity testID={`save-rename-${item.id}`} onPress={() => handleRename(item.id)} style={styles.smallBtn} activeOpacity={0.7}>
              <Feather name="check" size={18} color="#4ADE80" />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingId(null); setEditName(''); }} style={styles.smallBtn} activeOpacity={0.7}>
              <Feather name="x" size={18} color="#F87171" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardRow}>
            <View style={styles.cardInfo}>
              <Feather name="briefcase" size={20} color="#6366F1" />
              <Text style={styles.portfolioName}>{item.name}</Text>
            </View>
            <View style={styles.cardActions}>
              <TouchableOpacity testID={`rename-btn-${item.id}`} onPress={() => { setEditingId(item.id); setEditName(item.name); }} style={styles.smallBtn} activeOpacity={0.7}>
                <Feather name="edit-2" size={16} color="#A1A1AA" />
              </TouchableOpacity>
              <TouchableOpacity testID={`delete-portfolio-btn-${item.id}`} onPress={() => handleDelete(item.id, item.name)} style={styles.smallBtn} activeOpacity={0.7}>
                <Feather name="trash-2" size={16} color="#F87171" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={{ flex: 1 }}>
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity testID="back-from-portfolios" onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                <Feather name="arrow-left" size={24} color="#FAFAFA" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Portfolios</Text>
              <View style={{ width: 44 }} />
            </View>

            {/* Create New */}
            <View style={styles.createRow}>
              <TextInput
                testID="new-portfolio-name-input"
                style={styles.createInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="New portfolio name..."
                placeholderTextColor="#3F3F46"
              />
              <TouchableOpacity testID="create-portfolio-btn" style={[styles.createBtn, !newName.trim() && styles.createBtnDisabled]} onPress={handleCreate} activeOpacity={0.7} disabled={!newName.trim() || creating}>
                {creating ? <ActivityIndicator size="small" color="#09090B" /> : <Feather name="plus" size={20} color="#09090B" />}
              </TouchableOpacity>
            </View>

            <Text style={styles.hint}>Create portfolios for each brokerage: Wealthsimple, Fidelity, Schwab, etc.</Text>

            {loading ? (
              <ActivityIndicator size="large" color="#6366F1" style={{ marginTop: 40 }} />
            ) : (
              <FlatList
                testID="portfolios-list"
                data={portfolios}
                keyExtractor={(item) => item.id}
                renderItem={renderItem}
                contentContainerStyle={styles.listContent}
                ListEmptyComponent={
                  <View style={styles.empty}>
                    <Text style={styles.emptyText}>No portfolios yet</Text>
                  </View>
                }
              />
            )}
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#09090B' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#18181B', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#FAFAFA' },
  createRow: { flexDirection: 'row', paddingHorizontal: 20, gap: 10, marginTop: 16 },
  createInput: { flex: 1, height: 50, borderRadius: 12, backgroundColor: '#18181B', borderWidth: 1, borderColor: '#27272A', color: '#FAFAFA', paddingHorizontal: 16, fontSize: 16 },
  createBtn: { width: 50, height: 50, borderRadius: 12, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
  createBtnDisabled: { opacity: 0.4 },
  hint: { fontSize: 13, color: '#52525B', paddingHorizontal: 20, marginTop: 8, marginBottom: 20 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  portfolioCard: { backgroundColor: '#18181B', borderRadius: 14, borderWidth: 1, borderColor: '#27272A', padding: 16, marginBottom: 10 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  portfolioName: { fontSize: 16, fontWeight: '600', color: '#FAFAFA' },
  cardActions: { flexDirection: 'row', gap: 8 },
  smallBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#27272A', alignItems: 'center', justifyContent: 'center' },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editInput: { flex: 1, height: 44, borderRadius: 10, backgroundColor: '#27272A', color: '#FAFAFA', paddingHorizontal: 12, fontSize: 16 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyText: { fontSize: 16, color: '#52525B' },
});
