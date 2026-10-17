import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { TextField } from '@/components/ui/forms';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, Card, Icon, LoadingState, SectionHeading, Segmented } from '@/components/ui/primitives';
import { type AuthResult, useCloud } from '@/features/auth/CloudProvider';
import { colors, spacing } from '@/theme/tokens';

const GUEST_POINTS = [
  'Every feature works without an account or internet connection.',
  'Your songs, rehearsals, recordings and progress are saved on this phone.',
  'An account is only for backup and using your library on another phone.',
];

export default function AccountScreen() {
  const cloud = useCloud();

  return (
    <Screen>
      <ScreenHeader back subtitle="Optional — not required for any feature" title="Account & cloud sync" />
      {cloud.env.status !== 'configured' ? (
        <NotConfigured />
      ) : !cloud.ready ? (
        <LoadingState label="Checking your account…" />
      ) : cloud.session ? (
        <SignedIn />
      ) : (
        <SignedOut />
      )}
    </Screen>
  );
}

function NotConfigured() {
  const { env } = useCloud();
  return (
    <View style={{ gap: spacing.md }}>
      <GuestCard />
      <Banner title="Cloud accounts are not set up in this build" tone="info">
        {env.status === 'invalid'
          ? `The cloud settings are invalid: ${env.problems.join(' ')}`
          : 'No cloud project is configured, so there is nothing to sign in to. No data leaves this phone.'}
      </Banner>
    </View>
  );
}

function GuestCard() {
  return (
    <Card style={{ gap: spacing.sm }} tinted>
      <AppText variant="heading">Using DIONER as a guest</AppText>
      {GUEST_POINTS.map((p) => (
        <View key={p} style={{ flexDirection: 'row', gap: spacing.xs }}>
          <Icon name="checkmark-circle-outline" size={20} />
          <AppText style={{ flex: 1 }} variant="small">
            {p}
          </AppText>
        </View>
      ))}
    </Card>
  );
}

function ResultBanner({ result }: { result: AuthResult | null }) {
  if (!result?.message) return null;
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Banner tone={result.ok ? 'success' : 'error'}>{result.message}</Banner>
    </View>
  );
}

function SignedOut() {
  const cloud = useCloud();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AuthResult | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = password.length >= 8;

  const submit = async () => {
    setBusy(true);
    setResult(null);
    const r = mode === 'signin' ? await cloud.signIn(email, password) : await cloud.signUp(email, password);
    setResult(r);
    setBusy(false);
    if (r.ok) setPassword('');
  };

  const reset = async () => {
    if (!emailOk) {
      setResult({ ok: false, message: 'Enter your email address first, then tap “Forgot password”.' });
      return;
    }
    setBusy(true);
    setResult(await cloud.resetPassword(email));
    setBusy(false);
  };

  return (
    <View>
      <GuestCard />
      <SectionHeading detail="Back up your library and use it on another phone" title="Cloud account" />
      <Segmented
        items={['signin', 'signup'] as const}
        labels={{ signin: 'Sign in', signup: 'Create account' }}
        onChange={setMode}
        value={mode}
      />
      <View style={{ height: spacing.md }} />
      <ResultBanner result={result} />
      <TextField
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        label="Email"
        onChangeText={setEmail}
        value={email}
      />
      <TextField
        autoCapitalize="none"
        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
        hint={mode === 'signup' ? 'At least 8 characters.' : undefined}
        label="Password"
        onChangeText={setPassword}
        secureTextEntry
        value={password}
      />
      <Button disabled={!emailOk || !passwordOk} label={mode === 'signin' ? 'Sign in' : 'Create account'} loading={busy} onPress={submit} />
      {mode === 'signin' ? <Button label="Forgot password?" onPress={reset} style={{ marginTop: spacing.xs }} variant="ghost" /> : null}
      <AppText color={colors.textSecondary} style={{ marginTop: spacing.md }} variant="caption">
        Signing in does not upload anything by itself. You will be asked before this phone’s library is backed up.
      </AppText>
    </View>
  );
}

function SignedIn() {
  const cloud = useCloud();
  const [result, setResult] = useState<AuthResult | null>(null);
  const email = cloud.session?.user.email ?? 'your account';
  const link = cloud.link;

  const confirmBackup = (title: string, body: string) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Back up', onPress: () => void cloud.linkAndSync() },
    ]);

  const signOut = () =>
    Alert.alert('Sign out?', 'Your songs, rehearsals and recordings stay on this phone. Cloud backup stops until you sign in again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', onPress: async () => setResult(await cloud.signOut()) },
    ]);

  return (
    <View style={{ gap: spacing.md }}>
      <ResultBanner result={result} />
      <Card style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }} tinted>
        <Icon name="person-circle-outline" size={36} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong">{email}</AppText>
          <AppText color={colors.textSecondary} variant="caption">
            Signed in
          </AppText>
        </View>
      </Card>

      {link?.kind === 'unlinked' ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Back up this phone’s library?</AppText>
          <AppText color={colors.textSecondary} variant="small">
            {`${cloud.unsynced} item${cloud.unsynced === 1 ? '' : 's'} (songs, rehearsals, recording details and lesson progress) will be uploaded to ${email}. Your data on this phone is kept either way.`}
          </AppText>
          <AudioToggle />
          <Button
            icon="cloud-upload-outline"
            label="Back up now"
            loading={cloud.syncing}
            onPress={() => confirmBackup('Back up to this account?', `This phone’s library will be uploaded to ${email} and kept in sync.`)}
          />
        </Card>
      ) : link?.kind === 'linked-other' ? (
        <Card style={{ gap: spacing.sm }}>
          <Banner title="This library belongs to another account" tone="warning">
            This phone’s library was backed up to a different account. To avoid mixing two people’s data, nothing is synced while you are
            signed in here.
          </Banner>
          <Button label="Sign out" onPress={signOut} variant="secondary" />
          <Button
            label="Back up to this account instead…"
            onPress={() =>
              confirmBackup(
                'Switch backup account?',
                `Everything on this phone will be uploaded to ${email}. The other account’s cloud copy is not changed or deleted.`,
              )
            }
            variant="ghost"
          />
        </Card>
      ) : link?.kind === 'linked-same' ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Cloud sync is on</AppText>
          <AppText color={colors.textSecondary} variant="small">
            {cloud.syncing
              ? (cloud.progress ?? 'Syncing…')
              : `${cloud.lastSyncAt ? `Last synced ${new Date(cloud.lastSyncAt).toLocaleString()}` : 'Not synced yet'} · ${cloud.unsynced} change${cloud.unsynced === 1 ? '' : 's'} waiting`}
          </AppText>
          <AudioToggle />
          <Button icon="sync" label="Sync now" loading={cloud.syncing} onPress={() => void cloud.syncNow()} />
          {cloud.lastReport ? (
            cloud.lastReport.errors.length ? (
              <Banner title="Some items did not sync" tone="warning">
                {`${cloud.lastReport.errors.slice(0, 4).join('\n')}${cloud.lastReport.errors.length > 4 ? `\n…and ${cloud.lastReport.errors.length - 4} more` : ''}\nThey will be retried on the next sync.`}
              </Banner>
            ) : (
              <Banner tone="success">
                {`Synced: ${cloud.lastReport.pushed} uploaded, ${cloud.lastReport.pulled} downloaded${cloud.lastReport.audioUploaded ? `, ${cloud.lastReport.audioUploaded} recording file(s) backed up` : ''}.`}
              </Banner>
            )
          ) : null}
        </Card>
      ) : (
        <LoadingState />
      )}

      <Button icon="log-out-outline" label="Sign out" onPress={signOut} variant="secondary" />
      <AppText color={colors.textSecondary} variant="caption">
        Your cloud data is private to your account. Recordings are stored in a private bucket and are only reachable through your signed-in
        session.
      </AppText>
    </View>
  );
}

function AudioToggle() {
  const cloud = useCloud();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">Also back up recording audio</AppText>
        <AppText color={colors.textSecondary} variant="caption">
          Uses mobile data or Wi-Fi. Off: only names, durations and links are synced.
        </AppText>
      </View>
      <Switch
        accessibilityLabel="Also back up recording audio"
        onValueChange={(v) => void cloud.setUploadAudio(v)}
        thumbColor={colors.white}
        trackColor={{ false: colors.pale, true: colors.primary }}
        value={cloud.uploadAudio}
      />
    </View>
  );
}
