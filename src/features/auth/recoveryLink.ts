/**
 * Parses the URL a Supabase password-reset email opens the app with.
 * Supabase appends the session in the URL fragment:
 *   dioner://reset-password#access_token=…&refresh_token=…&type=recovery
 * or an error:
 *   dioner://reset-password#error=access_denied&error_code=otp_expired&error_description=…
 */
export type RecoveryLink =
  { kind: 'session'; accessToken: string; refreshToken: string } | { kind: 'error'; message: string } | { kind: 'none' };

export function parseRecoveryLink(url: string | null | undefined): RecoveryLink {
  if (!url) return { kind: 'none' };
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const raw = hashIndex >= 0 ? url.slice(hashIndex + 1) : queryIndex >= 0 ? url.slice(queryIndex + 1) : '';
  if (!raw) return { kind: 'none' };
  const params = new URLSearchParams(raw);
  const error = params.get('error_description') ?? params.get('error');
  if (error) {
    const expired = params.get('error_code') === 'otp_expired';
    return {
      kind: 'error',
      message: expired ? 'This reset link has expired or was already used. Request a new one.' : error.replace(/\+/g, ' '),
    };
  }
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken && (params.get('type') ?? 'recovery') === 'recovery') {
    return { kind: 'session', accessToken, refreshToken };
  }
  return { kind: 'none' };
}

export function validateNewPassword(password: string, confirm: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}
