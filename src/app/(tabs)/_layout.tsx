import { Tabs } from 'expo-router/tabs';

import { Icon, type IconName } from '@/components/ui/primitives';
import { colors } from '@/theme/tokens';

const TAB_ICONS: Record<string, IconName> = {
  'live-keys': 'pulse',
  songs: 'musical-notes',
  rehearsals: 'mic',
  learn: 'book',
};

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border, minHeight: 64 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarIcon: ({ color, size }) => (
          <Icon color={typeof color === 'string' ? color : colors.textSecondary} name={TAB_ICONS[route.name] ?? 'ellipse'} size={size} />
        ),
        sceneStyle: { backgroundColor: colors.white },
      })}
    >
      <Tabs.Screen name="live-keys" options={{ title: 'Live Keys' }} />
      <Tabs.Screen name="songs" options={{ title: 'Songs' }} />
      <Tabs.Screen name="rehearsals" options={{ title: 'Rehearsals' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
    </Tabs>
  );
}
