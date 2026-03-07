import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect, useCallback } from 'react';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import { checkServerHealth } from '../../services/analysisApi';
import { API_BASE_URL } from '../../constants/config';
import { useSettingsStore } from '../../stores/settingsStore';
import { DanceStyle } from '../../utils/beatCounter';

const LOOK_AHEAD_STEP = 25; // ms per tap

export default function SettingsScreen() {
  const { danceStyle, setDanceStyle, lookAheadMs, setLookAheadMs } = useSettingsStore();
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
          <Text style={styles.value}>1.0.0 (M2)</Text>
        </View>
      </View>

      {/* Dance Style */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dance Style</Text>
        {([
          { key: 'bachata' as DanceStyle, label: 'Bachata', desc: '1-2-3-TAP-5-6-7-TAP' },
          { key: 'salsa-on1' as DanceStyle, label: 'Salsa On1', desc: '1-2-3-pause-5-6-7-pause' },
          { key: 'salsa-on2' as DanceStyle, label: 'Salsa On2', desc: '1-2-3-pause-5-6-7-pause' },
        ]).map((item) => (
          <TouchableOpacity
            key={item.key}
            style={[styles.row, danceStyle === item.key && styles.rowActive]}
            onPress={() => setDanceStyle(item.key)}
          >
            <Ionicons
              name={danceStyle === item.key ? 'radio-button-on' : 'radio-button-off'}
              size={20}
              color={danceStyle === item.key ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.label, danceStyle === item.key && styles.labelActive]}>
              {item.label}
            </Text>
            <Text style={styles.styleDesc}>{item.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count Timing */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Count Timing</Text>
        <View style={styles.row}>
          <Ionicons name="timer-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Look-ahead</Text>
          <View style={styles.lookAheadControls}>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setLookAheadMs(lookAheadMs - LOOK_AHEAD_STEP)}
            >
              <Ionicons name="remove" size={18} color={Colors.text} />
            </TouchableOpacity>
            <Text style={styles.lookAheadValue}>{lookAheadMs}ms</Text>
            <TouchableOpacity
              style={styles.lookAheadBtn}
              onPress={() => setLookAheadMs(lookAheadMs + LOOK_AHEAD_STEP)}
            >
              <Ionicons name="add" size={18} color={Colors.text} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.lookAheadHint}>
          카운트가 느리면 ↑, 빠르면 ↓ (0~300ms)
        </Text>
      </View>

      {/* Coming Soon */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Coming Soon</Text>
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
  rowActive: {
    backgroundColor: Colors.surfaceLight,
    borderBottomColor: Colors.primary,
  },
  labelActive: {
    color: Colors.primary,
    fontWeight: '700',
  },
  styleDesc: {
    color: Colors.textMuted,
    fontSize: FontSize.sm,
  },
  lookAheadControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  lookAheadBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  lookAheadValue: {
    color: Colors.text,
    fontSize: FontSize.md,
    fontWeight: '700',
    minWidth: 56,
    textAlign: 'center',
  },
  lookAheadHint: {
    color: Colors.textMuted,
    fontSize: FontSize.xs,
    marginTop: Spacing.xs,
    paddingLeft: Spacing.xl + Spacing.md,
  },
});
