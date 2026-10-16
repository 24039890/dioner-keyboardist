import { router } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { SongForm } from '@/features/songs/components/SongForm';
import { useRepositories } from '@/providers/data';

export default function CreateSongScreen() {
  const { songs } = useRepositories();
  return (
    <Screen>
      <ScreenHeader back subtitle="Saved on this device" title="New song" />
      <SongForm
        onSubmit={async (input) => {
          const song = await songs.create(input);
          router.replace({ pathname: '/songs/[id]', params: { id: song.id } });
        }}
        submitLabel="Save song"
      />
    </Screen>
  );
}
