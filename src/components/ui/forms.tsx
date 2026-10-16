import { StyleSheet, TextInput, type TextInputProps, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme/tokens';

import { AppText, Icon } from './primitives';

export function TextField({
  label,
  value,
  onChangeText,
  error,
  hint,
  multiline,
  ...rest
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
} & Omit<TextInputProps, 'value' | 'onChangeText' | 'multiline'>) {
  return (
    <View style={styles.field}>
      <AppText variant="caption">{label}</AppText>
      <TextInput
        accessibilityHint={hint}
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, multiline && styles.multiline, !!error && styles.inputError]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        {...rest}
      />
      {error ? (
        <View accessibilityRole="alert" style={styles.errorRow}>
          <Icon color={colors.primaryDark} name="alert-circle-outline" size={16} />
          <AppText color={colors.primaryDark} variant="caption">
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText color={colors.textSecondary} variant="caption">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function SearchField({
  value,
  onChangeText,
  placeholder,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.search}>
      <Icon name="search" size={20} />
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        returnKeyType="search"
        style={styles.searchInput}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: 6, marginBottom: spacing.md },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.pale,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: typography.body.fontSize,
  },
  multiline: { minHeight: 110, paddingTop: spacing.sm },
  inputError: { borderColor: colors.primaryDark, borderWidth: 2 },
  errorRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  search: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.pale,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: typography.body.fontSize, paddingVertical: 10 },
});
