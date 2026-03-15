import { useEffect, useRef } from 'react';
import { View, Text, AppState } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import { useMessageStore } from '../../stores/messageStore';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { OnboardingOverlay } from '../../components/ui/OnboardingOverlay';

const UNREAD_POLL = 10_000;

export default function TabLayout() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { totalUnreadCount, fetchUnreadCount } = useMessageStore();
  const { hasSeenOnboarding, setHasSeenOnboarding } = useSettingsStore();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll unread count when logged in
  useEffect(() => {
    if (!user) return;
    fetchUnreadCount();

    pollRef.current = setInterval(fetchUnreadCount, UNREAD_POLL);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchUnreadCount();
    });

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      sub.remove();
    };
  }, [user?.id]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }} edges={['top']}>
      {!hasSeenOnboarding && !user && (
        <OnboardingOverlay onComplete={() => setHasSeenOnboarding(true)} />
      )}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { backgroundColor: Colors.surface, borderTopColor: Colors.border },
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textMuted,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.library'),
            tabBarIcon: ({ color, size }) => <Ionicons name="library" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="player"
          options={{
            title: t('tabs.player'),
            tabBarIcon: ({ color, size }) => <Ionicons name="play-circle" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: t('tabs.community'),
            tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="messages"
          options={{
            title: t('tabs.messages'),
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="chatbubbles" size={size} color={color} />
                {totalUnreadCount > 0 && (
                  <View style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    backgroundColor: Colors.error,
                    borderRadius: 8,
                    minWidth: 16,
                    height: 16,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 3,
                  }}>
                    <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '700' }}>
                      {totalUnreadCount > 99 ? '99+' : totalUnreadCount}
                    </Text>
                  </View>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="taptempo"
          options={{ href: null }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: t('tabs.settings'),
            tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
