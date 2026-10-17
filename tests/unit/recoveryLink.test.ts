import { parseRecoveryLink, validateNewPassword } from '@/features/auth/recoveryLink';

describe('password-reset links', () => {
  test('session tokens in the fragment', () => {
    expect(
      parseRecoveryLink('dioner://reset-password#access_token=AT&expires_in=3600&refresh_token=RT&token_type=bearer&type=recovery'),
    ).toEqual({
      kind: 'session',
      accessToken: 'AT',
      refreshToken: 'RT',
    });
    expect(parseRecoveryLink('exp://10.0.0.2:8081/--/reset-password#access_token=A&refresh_token=R&type=recovery').kind).toBe('session');
  });

  test('expired and other errors', () => {
    expect(
      parseRecoveryLink('dioner://reset-password#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'),
    ).toEqual({
      kind: 'error',
      message: 'This reset link has expired or was already used. Request a new one.',
    });
    const other = parseRecoveryLink('dioner://reset-password?error=server_error&error_description=Something+broke');
    expect(other).toEqual({ kind: 'error', message: 'Something broke' });
  });

  test('missing or non-recovery links', () => {
    expect(parseRecoveryLink(null).kind).toBe('none');
    expect(parseRecoveryLink('dioner://reset-password').kind).toBe('none');
    expect(parseRecoveryLink('dioner://x#access_token=A&refresh_token=R&type=signup').kind).toBe('none');
  });

  test('new password validation', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/8 characters/);
    expect(validateNewPassword('longenough1', 'different1')).toMatch(/do not match/);
    expect(validateNewPassword('longenough1', 'longenough1')).toBeNull();
  });
});
