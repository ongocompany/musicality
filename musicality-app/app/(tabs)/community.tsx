import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../stores/authStore';
import { useCommunityStore } from '../../stores/communityStore';
import { Colors, Spacing, FontSize } from '../../constants/theme';
import CrewCard from '../../components/community/CrewCard';

export default function CommunityScreen() {
  const router = useRouter();
  const { user, guestMode } = useAuthStore();
  const {
    myCrewIds,
    crewCache,
    discoverCrews,
    loading,
    fetchMyCrews,
    fetchDiscoverCrews,
  } = useCommunityStore();

  const [searchText, setSearchText] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const isAuthenticated = user !== null;

  // Fetch data on mount
  useEffect(() => {
    if (isAuthenticated) {
      fetchMyCrews();
      fetchDiscoverCrews();
    }
  }, [isAuthenticated]);

  // Debounced search for discover crews
  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setTimeout(() => {
      fetchDiscoverCrews(searchText.trim() || undefined);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchText]);

  const myCrews = myCrewIds.map((id) => crewCache[id]).filter(Boolean);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchMyCrews(), fetchDiscoverCrews(searchText.trim() || undefined)]);
    setRefreshing(false);
  }, [searchText]);

  // Guest mode — prompt to sign in
  if (!isAuthenticated && guestMode) {
    return (
      <View style={styles.container}>
        <View style={styles.guestCard}>
          <Ionicons name="people" size={64} color={Colors.textMuted} />
          <Text style={styles.guestTitle}>Community</Text>
          <Text style={styles.guestDesc}>
            Join a crew to share PhraseNotes{'\n'}and practice together!
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => {
              // Exit guest mode to trigger AuthGuard redirect to login
              useAuthStore.getState().signOut();
            }}
            activeOpacity={0.8}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFF" />
            <Text style={styles.signInButtonText}>Sign In to Join</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Community</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push('/community/create-crew')}
          activeOpacity={0.7}
        >
          <Ionicons name="add" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
      >
        {/* My Crews Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Crews</Text>
          {loading.myCrews ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: Spacing.lg }} />
          ) : myCrews.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No crews yet</Text>
              <Text style={styles.emptySubtext}>
                Create or join a crew to get started
              </Text>
            </View>
          ) : (
            <View style={styles.crewList}>
              {myCrews.map((crew) => (
                <CrewCard
                  key={crew.id}
                  crew={crew}
                  isMember
                  isCaptain={crew.captainId === user?.id}
                  onPress={() => router.push({ pathname: '/community/crew-detail', params: { id: crew.id } })}
                />
              ))}
            </View>
          )}
        </View>

        {/* Discover Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Discover Crews</Text>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={Colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search crews..."
              placeholderTextColor={Colors.textMuted}
              value={searchText}
              onChangeText={setSearchText}
              returnKeyType="search"
            />
            {searchText.length > 0 && (
              <TouchableOpacity onPress={() => setSearchText('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {loading.discover ? (
            <ActivityIndicator size="small" color={Colors.primary} style={{ paddingVertical: Spacing.lg }} />
          ) : discoverCrews.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="globe-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyText}>No crews found</Text>
              <Text style={styles.emptySubtext}>
                {searchText ? 'Try a different search' : 'Be the first to create a crew!'}
              </Text>
            </View>
          ) : (
            <View style={styles.crewList}>
              {discoverCrews.map((crew) => (
                <CrewCard
                  key={crew.id}
                  crew={crew}
                  isMember={myCrewIds.includes(crew.id)}
                  isCaptain={crew.captainId === user?.id}
                  onPress={() => router.push({ pathname: '/community/crew-detail', params: { id: crew.id } })}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
  },
  createButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  // Scroll
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.xxl,
  },
  // Sections
  section: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  crewList: {
    gap: 10,
  },
  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.sm,
    height: 40,
    gap: 8,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
    paddingVertical: 0,
  },
  // Empty states
  emptyState: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    gap: 8,
  },
  emptyText: {
    fontSize: FontSize.lg,
    fontWeight: '500',
    color: Colors.textSecondary,
  },
  emptySubtext: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  // Guest card
  guestCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: 12,
  },
  guestTitle: {
    fontSize: FontSize.xxl,
    fontWeight: '700',
    color: Colors.text,
    marginTop: Spacing.md,
  },
  guestDesc: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    height: 48,
    borderRadius: 12,
    gap: 8,
  },
  signInButtonText: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: '#FFF',
  },
});
