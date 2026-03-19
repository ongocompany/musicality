import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { getLocales } from 'expo-localization';
import { useCommunityStore } from '../../stores/communityStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import type { CrewType } from '../../types/community';

const DANCE_STYLES = ['bachata', 'salsa', 'kizomba', 'zouk', 'mixed'];

/** Get device country code (e.g. 'KR', 'US') */
function getDeviceCountry(): string {
  try {
    const locales = getLocales();
    return locales[0]?.regionCode?.toUpperCase() ?? 'US';
  } catch {
    return 'US';
  }
}

/** Convert country code to flag emoji */
function countryToFlag(code: string): string {
  if (code === 'global') return '🌐';
  return code
    .toUpperCase()
    .split('')
    .map((ch) => String.fromCodePoint(ch.charCodeAt(0) + 127397))
    .join('');
}

export default function CreateCrewScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { createCrew, loading } = useCommunityStore();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [crewType, setCrewType] = useState<CrewType>('open');
  const [danceStyle, setDanceStyle] = useState('bachata');
  const [region, setRegion] = useState(() => {
    const locales = getLocales();
    return locales?.[0]?.regionCode ?? 'global';
  });
  const [memberLimit, setMemberLimit] = useState('50');

  const deviceCountry = getDeviceCountry();

  const isCreating = loading.createCrew;
  const canSubmit = name.trim().length >= 2 && !isCreating;

  const handleCreate = async () => {
    if (!canSubmit) return;

    try {
      const crewId = await createCrew({
        name: name.trim(),
        description: description.trim(),
        crewType,
        danceStyle,
        region,
        memberLimit: Math.max(2, Math.min(200, parseInt(memberLimit) || 50)),
      });

      if (crewId) {
        Alert.alert(t('community.crewCreated'), t('community.crewReady', { name: name.trim() }), [
          { text: t('common.ok'), onPress: () => router.back() },
        ]);
      }
    } catch (err: any) {
      Alert.alert(t('common.error'), err.message || t('community.failedCreateCrew'));
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: t('community.createCrew') }} />
      <View style={styles.container}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.crewNameRequired')}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder={t('community.crewNamePlaceholder')}
              placeholderTextColor={Colors.textMuted}
              maxLength={40}
              autoFocus
            />
            <Text style={styles.charCount}>{name.length}/40</Text>
          </View>

          {/* Description */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.descriptionLabel')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('community.descriptionPlaceholder')}
              placeholderTextColor={Colors.textMuted}
              maxLength={200}
              multiline
              numberOfLines={3}
            />
            <Text style={styles.charCount}>{description.length}/200</Text>
          </View>

          {/* Crew Type */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.crewType')}</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, crewType === 'open' && styles.toggleActive]}
                onPress={() => setCrewType('open')}
                activeOpacity={0.7}
              >
                <Ionicons name="globe-outline" size={18} color={crewType === 'open' ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleText, crewType === 'open' && styles.toggleTextActive]}>{t('community.crewTypeOpen')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, crewType === 'closed' && styles.toggleActive]}
                onPress={() => setCrewType('closed')}
                activeOpacity={0.7}
              >
                <Ionicons name="lock-closed-outline" size={18} color={crewType === 'closed' ? '#FFF' : Colors.textSecondary} />
                <Text style={[styles.toggleText, crewType === 'closed' && styles.toggleTextActive]}>{t('community.crewTypeClosed')}</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              {crewType === 'open'
                ? t('community.crewTypeOpenHint')
                : t('community.crewTypeClosedHint')}
            </Text>
          </View>

          {/* Dance Style */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.danceStyle')}</Text>
            <View style={styles.chipRow}>
              {DANCE_STYLES.map((style) => (
                <TouchableOpacity
                  key={style}
                  style={[styles.chip, danceStyle === style && styles.chipActive]}
                  onPress={() => setDanceStyle(style)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, danceStyle === style && styles.chipTextActive]}>
                    {style.charAt(0).toUpperCase() + style.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Region */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.region')}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, region === 'global' && styles.chipActive]}
                onPress={() => setRegion('global')}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, region === 'global' && styles.chipTextActive]}>
                  🌐 Global
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, region === deviceCountry && styles.chipActive]}
                onPress={() => setRegion(deviceCountry)}
                activeOpacity={0.7}
              >
                <Text style={[styles.chipText, region === deviceCountry && styles.chipTextActive]}>
                  {countryToFlag(deviceCountry)} {deviceCountry}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>
              {region === 'global'
                ? t('community.regionGlobalHint')
                : t('community.regionLocalHint', { region })}
            </Text>
          </View>

          {/* Member Limit */}
          <View style={styles.field}>
            <Text style={styles.label}>{t('community.memberLimitLabel')}</Text>
            <TextInput
              style={[styles.input, { width: 100 }]}
              value={memberLimit}
              onChangeText={setMemberLimit}
              keyboardType="number-pad"
              maxLength={3}
            />
          </View>
          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.createButton, !canSubmit && styles.createButtonDisabled]}
            onPress={() => { Keyboard.dismiss(); handleCreate(); }}
            disabled={!canSubmit}
            activeOpacity={0.8}
          >
            {isCreating ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <>
                <Ionicons name="add-circle" size={20} color="#FFF" />
                <Text style={styles.createButtonText}>{t('community.createCrew')}</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>{t('common.cancel', '취소')}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.md,
    paddingBottom: 40,
    gap: Spacing.lg,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 10,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  textArea: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    alignSelf: 'flex-end',
  },
  hint: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    fontStyle: 'italic',
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  toggleText: {
    fontSize: FontSize.md,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  toggleTextActive: {
    color: '#FFF',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary + '30',
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
  cancelButton: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    borderRadius: 12,
    marginTop: Spacing.sm,
  },
  cancelButtonText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
});
