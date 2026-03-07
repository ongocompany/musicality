import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, FontSize } from '../../constants/theme';

export default function SettingsScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.row}>
          <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
          <Text style={styles.label}>Version</Text>
          <Text style={styles.value}>1.0.0 (M0)</Text>
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
          <Text style={styles.comingSoon}>Auto Beat Analysis</Text>
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
});
