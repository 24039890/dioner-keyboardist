import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { createElement } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';

import { Screen, ScreenHeader } from '@/components/ui/layout';
import { AppText, EmptyState } from '@/components/ui/primitives';
import { colors, radius, spacing } from '@/theme/tokens';

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
/** Origin the player page is loaded from; YouTube's embed refuses to play without one (error 153). */
const PLAYER_ORIGIN = 'https://dioner.app/';

export function embedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}?playsinline=1&rel=0&modestbranding=1`;
}

function playerHtml(id: string): string {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head>
<body><iframe src="${embedUrl(id)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen
referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
}

/** Keeps the player page in place; links out of the player (e.g. "Watch on YouTube") open outside the app. */
function allowNavigation(req: WebViewNavigation & { isTopFrame?: boolean }): boolean {
  if (req.isTopFrame === false) return true;
  if (req.url.startsWith(PLAYER_ORIGIN) || req.url.startsWith('about:') || req.url.startsWith('data:')) return true;
  if (/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(req.url)) return true;
  Linking.openURL(req.url).catch(() => undefined);
  return false;
}

/** Plays one YouTube tutorial inside the app with YouTube's official embedded player. */
export default function WatchVideoScreen() {
  const { id, title, channel } = useLocalSearchParams<{ id: string; title?: string; channel?: string }>();
  const valid = typeof id === 'string' && VIDEO_ID.test(id);

  if (!valid) {
    return (
      <Screen>
        <ScreenHeader back title="Video" />
        <EmptyState body="This video link is not valid." icon="videocam-off-outline" title="Video not found" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScreenHeader back title="Video" />
      <View style={styles.player}>
        {Platform.OS === 'web' ? (
          createElement('iframe', {
            src: embedUrl(id),
            title: title ?? 'YouTube video',
            allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
            allowFullScreen: true,
            style: { width: '100%', height: '100%', border: 0 },
          })
        ) : (
          <WebView
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onShouldStartLoadWithRequest={allowNavigation}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            source={{ html: playerHtml(id), baseUrl: PLAYER_ORIGIN }}
            style={styles.webview}
          />
        )}
      </View>
      {title ? (
        <AppText style={{ marginTop: spacing.md }} variant="subheading">
          {title}
        </AppText>
      ) : null}
      {channel ? (
        <AppText color={colors.textSecondary} variant="small">
          {`${channel} on YouTube`}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${id}`).catch(() => undefined)}
        style={styles.link}
      >
        <AppText color={colors.primary} variant="bodyStrong">
          Open in YouTube
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  player: { width: '100%', aspectRatio: 16 / 9, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  webview: { flex: 1, backgroundColor: '#000' },
  link: { minHeight: 44, justifyContent: 'center', marginTop: spacing.xs },
});
