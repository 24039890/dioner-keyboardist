/**
 * Supabase configuration from EXPO_PUBLIC_* variables (inlined at build time).
 * Cloud features stay off unless both values are present and valid. A secret
 * (service-role) key is rejected so it can never ship in the app.
 */
export type SupabaseEnv =
  { status: 'configured'; url: string; key: string } | { status: 'missing' } | { status: 'invalid'; problems: string[] };

function decodeJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const json = globalThis.atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    return typeof payload === 'object' && payload !== null && 'role' in payload ? String((payload as { role: unknown }).role) : null;
  } catch {
    return null;
  }
}

export function validateSupabaseEnv(url: string | undefined, key: string | undefined): SupabaseEnv {
  const u = url?.trim() ?? '';
  const k = key?.trim() ?? '';
  if (!u && !k) return { status: 'missing' };
  const problems: string[] = [];
  if (!u) problems.push('EXPO_PUBLIC_SUPABASE_URL is empty.');
  else if (
    !/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(u) &&
    !/^http:\/\/(localhost|127\.0\.0\.1|10\.0\.2\.2|192\.168\.\d+\.\d+)(:\d+)?\/?$/.test(u)
  ) {
    problems.push('EXPO_PUBLIC_SUPABASE_URL must look like https://<project-ref>.supabase.co');
  }
  if (!k) problems.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or EXPO_PUBLIC_SUPABASE_ANON_KEY) is empty.');
  else if (k.startsWith('sb_secret_') || decodeJwtRole(k) === 'service_role') {
    problems.push('The key is a secret/service-role key. Use the publishable (anon) key — secret keys must never be put in the app.');
  } else if (u.includes('your-project-ref') || k.includes('your-public')) {
    problems.push('The .env still contains the placeholder values from .env.example.');
  }
  if (problems.length) return { status: 'invalid', problems };
  return { status: 'configured', url: u.replace(/\/$/, ''), key: k };
}

/** Values must be read with literal process.env.EXPO_PUBLIC_* access so Expo inlines them. */
export const supabaseEnv: SupabaseEnv = validateSupabaseEnv(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
);
