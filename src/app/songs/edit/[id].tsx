import { useCallback } from 'react';
import { router, useLocalSearchParams } from 'expo-router';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { Banner, EmptyState, LoadingState } from '@/components/ui/primitives';
import { SongForm } from '@/features/songs/components/SongForm';
import { useFocusedQuery } from '@/hooks/useAsync';
import { useRepositories } from '@/providers/data';

export default function EditSongScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { songs } = useRepositories();
  const result = useFocusedQuery(useCallback(() => songs.get(id), [songs, id]));

  return (
    <Screen>
      <ScreenHeader back title="Edit song" />
      {result.status === 'error' ? (
        <Banner title="This song could not be loaded" tone="error">
          {result.error.message}
        </Banner>
      ) : result.status === 'loading' && !result.data ? (
        <LoadingState />
      ) : !result.data ? (
        <EmptyState body="It may have been deleted." icon="musical-notes-outline" title="Song not found" />
      ) : (
        <SongForm
          initial={result.data}
          key={result.data.updatedAt}
          onSubmit={async (input) => {
            await songs.update(id, input);
            router.back();
          }}
          submitLabel="Save changes"
        />
      )}
    </Screen>
  );
}
