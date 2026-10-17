import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { TextField } from '@/components/ui/forms';
import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, Banner, Button, LoadingState } from '@/components/ui/primitives';
import { parseRecoveryLink, validateNewPassword } from '@/features/auth/recoveryLink';
import { getSupabase } from '@/services/supabase/client';
import { colors, spacing } from '@/theme/tokens';

type Stage = 'checking' | 'ready' | 'invalid' | 'done';

/** Opened from the password-reset email. Establishes the recovery session, then sets a new password. */
export default function ResetPasswordScreen() {
  const url = Linking.useURL();
  const [stage, setStage] = useState<Stage>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getSupabase();
    let active = true;
    const handle = async (link: string | null) => {
      if (!client) {
        setStage('invalid');
        setMessage('Cloud accounts are not configured in this build.');
        return;
      }
      const parsed = parseRecoveryLink(link);
      if (parsed.kind === 'error') {
        setStage('invalid');
        setMessage(parsed.message);
        return;
      }
      if (parsed.kind === 'session') {
        const { error } = await client.auth.setSession({ access_token: parsed.accessToken, refresh_token: parsed.refreshToken });
        if (!active) return;
        if (error) {
          setStage('invalid');
          setMessage('This reset link is no longer valid. Request a new one from Settings → Account.');
        } else {
          setStage('ready');
        }
        return;
      }
      // Opened without tokens: allow it only if a recovery session already exists.
      const { data } = await client.auth.getSession();
      if (!active) return;
      if (data.session) setStage('ready');
      else {
        setStage('invalid');
        setMessage('Open this screen from the link in your password-reset email.');
      }
    };
    if (url !== null) void handle(url);
    else
      Linking.getInitialURL().then(
        (u) => {
          if (active) void handle(u);
        },
        () => {
          if (active) void handle(null);
        },
      );
    return () => {
      active = false;
    };
  }, [url]);

  const save = async () => {
    const problem = validateNewPassword(password, confirm);
    if (problem) {
      setMessage(problem);
      return;
    }
    const client = getSupabase();
    if (!client) return;
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setPassword('');
    setConfirm('');
    setMessage(null);
    setStage('done');
  };

  return (
    <Screen>
      <ScreenHeader back subtitle="DIONER account" title="Set a new password" />
      {stage === 'checking' ? (
        <LoadingState label="Checking your reset link…" />
      ) : stage === 'invalid' ? (
        <View style={{ gap: spacing.sm }}>
          <Banner title="Reset link not usable" tone="warning">
            {message ?? 'This reset link is not valid.'}
          </Banner>
          <Button label="Go to account settings" onPress={() => router.replace('/settings/account')} variant="secondary" />
        </View>
      ) : stage === 'done' ? (
        <View style={{ gap: spacing.sm }}>
          <Banner tone="success">Your password has been changed and you are signed in.</Banner>
          <Button label="Continue" onPress={() => router.replace('/settings/account')} />
        </View>
      ) : (
        <View>
          {message ? (
            <View style={{ marginBottom: spacing.sm }}>
              <Banner tone="error">{message}</Banner>
            </View>
          ) : null}
          <TextField
            autoCapitalize="none"
            autoComplete="new-password"
            hint="At least 8 characters."
            label="New password"
            onChangeText={setPassword}
            secureTextEntry
            value={password}
          />
          <TextField
            autoCapitalize="none"
            autoComplete="new-password"
            label="Repeat new password"
            onChangeText={setConfirm}
            secureTextEntry
            value={confirm}
          />
          <Button label="Save new password" loading={busy} onPress={save} />
          <AppText color={colors.textSecondary} style={{ marginTop: spacing.md }} variant="caption">
            Your songs and recordings on this phone are not affected.
          </AppText>
        </View>
      )}
    </Screen>
  );
}
