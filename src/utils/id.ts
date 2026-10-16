import { randomUUID } from 'expo-crypto';

/** RFC 4122 v4 UUID. UUIDs keep local records stable for later cloud sync. */
export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
