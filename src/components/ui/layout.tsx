import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme/tokens';

import { AppText, Icon, IconButton, type IconName } from './primitives';

/** Standard screen: safe area, white background, scrollable padded content. */
export function Screen({
  children,
  scroll = true,
  footer,
  withTabBar,
}: {
  children: ReactNode;
  scroll?: boolean;
  footer?: ReactNode;
  /** Tab screens: the tab bar already handles the bottom inset. */
  withTabBar?: boolean;
}) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" style={styles.flex}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content]}>{children}</View>
  );
  return (
    <SafeAreaView edges={withTabBar ? ['top', 'left', 'right'] : ['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {body}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  /** Show a back button (uses router.back(), falling back to the tabs). */
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {back ? (
        <IconButton
          icon="chevron-back"
          label="Go back"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/live-keys'))}
        />
      ) : null}
      <View style={styles.headerCopy}>
        <AppText accessibilityLabel={title} numberOfLines={2} variant="title">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={colors.textSecondary} variant="small">
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function ListRow({
  title,
  subtitle,
  detail,
  icon,
  leading,
  trailing,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string | null;
  detail?: string | null;
  icon?: IconName;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? [title, subtitle, detail].filter(Boolean).join(', ')}
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.light }]}
    >
      {leading ??
        (icon ? (
          <View style={styles.rowIcon}>
            <Icon name={icon} size={20} />
          </View>
        ) : null)}
      <View style={styles.rowCopy}>
        <AppText numberOfLines={1} variant="bodyStrong">
          {title}
        </AppText>
        {subtitle ? (
          <AppText color={colors.textSecondary} numberOfLines={1} variant="caption">
            {subtitle}
          </AppText>
        ) : null}
        {detail ? (
          <AppText color={colors.primaryDark} numberOfLines={1} style={{ marginTop: 4 }} variant="small">
            {detail}
          </AppText>
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name="chevron-forward" size={18} /> : null)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, paddingTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
    gap: spacing.xs,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 64, marginBottom: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 72,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: { flex: 1, minWidth: 0 },
});
