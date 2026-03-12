import { Stack } from 'expo-router';
import { Colors } from '../../constants/theme';

export default function CommunityLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: Colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
