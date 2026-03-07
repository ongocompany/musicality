import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { checkServerHealth } from '../../services/analysisApi';
import { API_BASE_URL } from '../../constants/config';

export default function SettingsScreen() {
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkServer = useCallback(async () => {
    setChecking(true);
    const online = await checkServerHealth();
    setServerOnline(online);
    setChecking(false);
  }, []);

  useEffect(() => {
    checkServer();
  }, [checkServer]);

  return (
    <View style={styles.container}>
      {/* Server Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Analysis Server</Text>
        <View style={styles.row}>
          <View style={[styles.statusDot, serverOnline === true && styles.statusOnline, serverOnline === false && styles.statusOffline]} />
          <Text style={styles.label}>
            {serverOnline === null ? 'Checking...' : serverOnline ? 'Connected' : 'Disconnected'}
          </Text>
          <TouchableOpacity onPress={checkServer} disabled={checking}>
            <Ionicons name="refresh" size={20} color={checking ? Colors.textMuted : Colors.primary} />
          </TouchableOpacity>
        </View>
        <View style={styles.row}>
          <Ionicons name="server-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.serverUrl}>{API_BASE_URL}</Text>
        </View>
      </View>

      {/* App Info */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0 (M1)</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coming Soon</Text>
        <View style={styles.row}>
          <Ionicons name="fitness-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.comingSoon}>Dance Style (Bachata / Salsa)</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="pulse-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.comingSoon}>Count Visualization</Text>
        </View>
        <View style={styles.row}>
          <Ionicons name="notifications-outline" size={20} color={Colors.textMuted} />
          <Text style={styles.comingSoon}>Cue Sounds</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, padding: Spacing.lg },
  section: { marginBottom: Spacing.xl },
  sectionTitle: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '700', marginBottom: Spacing.md, textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  label: { flex: 1, color: Colors.text, fontSize: FontSize.lg },
  value: { color: Colors.textSecondary, fontSize: FontSize.md },
  comingSoon: { color: Colors.textMuted, fontSize: FontSize.lg },
  serverUrl: { flex: 1, color: Colors.textMuted, fontSize: FontSize.sm },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.textMuted,
  },
  statusOnline: { backgroundColor: '#4CAF50' },
  statusOffline: { backgroundColor: Colors.error },
});
