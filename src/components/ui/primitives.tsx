import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, Pressable, type StyleProp, StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';

import { colors, radius, spacing, touch, typography } from '@/theme/tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 22, color = colors.primary }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons accessibilityElementsHidden importantForAccessibility="no" color={color} name={name} size={size} />;
}

type TextVariant = keyof typeof typography;

export function AppText({
  variant = 'body',
  color = colors.text,
  style,
  children,
  numberOfLines,
  accessibilityLabel,
  adjustsFontSizeToFit,
}: {
  adjustsFontSizeToFit?: boolean;
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
  accessibilityLabel?: string;
}) {
  return (
    <Text
      accessibilityLabel={accessibilityLabel}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      numberOfLines={numberOfLines}
      style={[typography[variant] as TextStyle, { color }, style]}
    >
      {children}
    </Text>
  );
}

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}) {
  const inactive = disabled || loading;
  const fg = inactive ? colors.textSecondary : variant === 'primary' ? colors.white : colors.primaryDark;
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        pressed && !inactive && (variant === 'primary' ? styles.buttonPrimaryPressed : styles.buttonPressed),
        inactive && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Icon color={fg} name={icon} size={20} /> : null}
      <Text style={[typography.bodyStrong as TextStyle, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  filled,
  disabled,
  size = touch.min,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  filled?: boolean;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconButton,
        { width: size, height: size, borderRadius: size / 2 },
        filled && styles.iconButtonFilled,
        pressed && (filled ? styles.buttonPrimaryPressed : styles.buttonPressed),
        disabled && styles.buttonDisabled,
      ]}
    >
      <Icon color={disabled ? colors.textSecondary : filled ? colors.white : colors.primary} name={icon} size={size > 56 ? 28 : 22} />
    </Pressable>
  );
}

export function Card({ children, tinted, style }: { children: ReactNode; tinted?: boolean; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, tinted && styles.cardTinted, style]}>{children}</View>;
}

export function Segmented<T extends string>({
  items,
  value,
  onChange,
  labels,
}: {
  items: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.segmented}>
      {items.map((item) => {
        const selected = item === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={item}
            onPress={() => onChange(item)}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[typography.small as TextStyle, styles.segmentText, selected && styles.segmentTextSelected]}>
              {labels?.[item] ?? item}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[typography.caption as TextStyle, { color: selected ? colors.white : colors.textSecondary, fontWeight: '600' }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export type BannerTone = 'info' | 'warning' | 'error' | 'success' | 'offline';

const BANNER_ICON: Record<BannerTone, IconName> = {
  info: 'information-circle-outline',
  warning: 'warning-outline',
  error: 'alert-circle-outline',
  success: 'checkmark-circle-outline',
  offline: 'cloud-offline-outline',
};

/** Status banner. Tone changes the icon and border weight, never the hue. */
export function Banner({ tone = 'info', title, children }: { tone?: BannerTone; title?: string; children?: ReactNode }) {
  const strong = tone === 'error' || tone === 'warning';
  return (
    <View accessibilityRole={strong ? 'alert' : undefined} style={[styles.banner, strong && styles.bannerStrong]}>
      <Icon color={colors.primaryDark} name={BANNER_ICON[tone]} size={20} />
      <View style={{ flex: 1, gap: 2 }}>
        {title ? (
          <AppText color={colors.primaryDark} variant="bodyStrong">
            {title}
          </AppText>
        ) : null}
        {children ? (
          typeof children === 'string' ? (
            <AppText color={colors.primaryDark} variant="small">
              {children}
            </AppText>
          ) : (
            children
          )
        ) : null}
      </View>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={30} />
      </View>
      <AppText style={{ textAlign: 'center' }} variant="heading">
        {title}
      </AppText>
      <AppText color={colors.textSecondary} style={{ textAlign: 'center' }} variant="small">
        {body}
      </AppText>
      {action ? <Button icon={action.icon} label={action.label} onPress={action.onPress} style={{ marginTop: spacing.xs }} /> : null}
    </View>
  );
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.empty}>
      <ActivityIndicator color={colors.primary} />
      <AppText color={colors.textSecondary} variant="small">
        {label}
      </AppText>
    </View>
  );
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return (
    <View style={styles.sectionHeading}>
      <View style={{ flex: 1 }}>
        <AppText accessibilityLabel={title} variant="heading">
          {title}
        </AppText>
        {detail ? (
          <AppText color={colors.textSecondary} variant="caption">
            {detail}
          </AppText>
        ) : null}
      </View>
      {action}
    </View>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <AppText color={colors.primaryDark} variant="eyebrow">
      {children}
    </AppText>
  );
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(v * 100) }}
      style={styles.track}
    >
      <View style={[styles.trackFill, { width: `${v * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonPrimary: { backgroundColor: colors.primary },
  buttonPrimaryPressed: { backgroundColor: colors.primaryDark },
  buttonSecondary: { backgroundColor: colors.white, borderColor: colors.pale },
  buttonGhost: { backgroundColor: colors.light },
  buttonPressed: { backgroundColor: colors.pale },
  buttonDisabled: { backgroundColor: colors.pale, borderColor: colors.pale },
  iconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.pale,
  },
  iconButtonFilled: { backgroundColor: colors.primary, borderColor: colors.primary },
  card: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  cardTinted: { backgroundColor: colors.light },
  segmented: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    borderRadius: radius.md,
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.pale,
  },
  segment: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: {
    backgroundColor: colors.white,
    shadowColor: colors.primaryDark,
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  segmentText: { color: colors.textSecondary, fontWeight: '600' },
  segmentTextSelected: { color: colors.primaryDark },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.white,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  banner: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.light,
    borderWidth: 1,
    borderColor: colors.light,
    alignItems: 'flex-start',
  },
  bannerStrong: { borderColor: colors.primary, backgroundColor: colors.white, borderWidth: 1.5 },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xxl, paddingHorizontal: spacing.lg },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.light,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.sm },
  track: { height: 6, borderRadius: radius.pill, backgroundColor: colors.pale, overflow: 'hidden', flex: 1 },
  trackFill: { height: '100%', backgroundColor: colors.primary, borderRadius: radius.pill },
});
