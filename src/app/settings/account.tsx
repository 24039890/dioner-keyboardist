import { View } from 'react-native';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Card, Icon, SectionHeading } from '@/components/ui/primitives';
import { colors, spacing } from '@/theme/tokens';

const POINTS = [
  'Guest mode is complete: every feature works without an account or internet connection.',
  'Your songs, rehearsals, recordings and lesson progress are saved only on this phone.',
  'Uninstalling the app or clearing its data deletes them. Back up important recordings by sharing them before you do.',
];

const PLANNED = [
  'Optional sign-up and sign-in with email.',
  'Backup of songs, rehearsals and progress, with recordings uploaded only if you turn that on.',
  'Your data stays private to your account; local data is kept if you sign out.',
];

export default function AccountScreen() {
  return (
    <Screen>
      <ScreenHeader back subtitle="Optional — not required for any feature" title="Account & cloud sync" />
      <Card style={{ gap: spacing.sm }} tinted>
        <AppText variant="heading">You are using DIONER as a guest</AppText>
        {POINTS.map((p) => (
          <View key={p} style={{ flexDirection: 'row', gap: spacing.xs }}>
            <Icon name="checkmark-circle-outline" size={20} />
            <AppText style={{ flex: 1 }} variant="small">
              {p}
            </AppText>
          </View>
        ))}
      </Card>

      <View style={{ marginTop: spacing.md }}>
        <Banner title="Cloud accounts are not connected in this build" tone="info">
          Account creation and cloud backup have not been switched on yet, so there is nothing to sign in to. No data leaves this phone.
        </Banner>
      </View>

      <SectionHeading title="When cloud sync is added" />
      {PLANNED.map((p) => (
        <View key={p} style={{ flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs }}>
          <Icon name="ellipse-outline" size={14} />
          <AppText color={colors.textSecondary} style={{ flex: 1 }} variant="small">
            {p}
          </AppText>
        </View>
      ))}
    </Screen>
  );
}
