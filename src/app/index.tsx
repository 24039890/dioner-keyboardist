import { Redirect } from 'expo-router';

import { LoadingState } from '@/components/ui/primitives';
import { useSettings } from '@/providers/data';

/** Entry: first launch goes to onboarding; returning guests go straight to Live Keys. */
export default function Index() {
  const { settings, loaded } = useSettings();
  if (!loaded) return <LoadingState label="Opening your library…" />;
  return <Redirect href={settings.onboardingComplete ? '/live-keys' : '/onboarding'} />;
}
