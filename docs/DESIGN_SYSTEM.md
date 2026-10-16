# Design system

The source reference was the owner-supplied web prototype (`App.tsx` and `index.css`). Its CSS custom properties were
translated into React Native tokens. No Figma file was available or inspected.

## Tokens (`src/theme/tokens.ts`)

| Token | Value | Use |
| --- | --- | --- |
| `white` | `#FFFFFF` | Screen background, cards |
| `primary` | `#2563EB` | Primary buttons, active tab, highlights |
| `primaryDark` | `#1D4ED8` | Pressed state, emphasis text, status text |
| `light` | `#EFF6FF` | Tinted cards, ghost buttons, chips |
| `pale` | `#DBEAFE` | Borders, tracks, inactive meters |
| `text` | `#172554` | Primary text, black piano keys |
| `textSecondary` | `#475569` | Secondary text, inactive icons |
| `border` | `#DBEAFE` | Dividers |
| `surface` | `#F8FAFC` | Neutral near-white panels and inputs (used sparingly) |
| `scrim` | `rgba(23,37,84,.28)` | Modal backdrop (the text colour) |

The theme is light only (`userInterfaceStyle: "light"`). No other hues are used. **Status** is shown through icon and
wording, never through colour:

| Status | Icon | Border |
| --- | --- | --- |
| Info | `information-circle` | Tinted |
| Warning | `warning` | 1.5 px primary |
| Error | `alert-circle` | 1.5 px primary |
| Success | `checkmark-circle` | Tinted |
| Offline | `cloud-offline` | Tinted |

**Exercise feedback:** a correct answer gets a pale fill and a check. A wrong answer gets a dashed text-colour border
and a cross.

**Spacing** is 4, 8, 12, 16, 20, 24 and 32. **Radii** are 10, 12, 16 and 20, plus pill. The minimum **touch target**
is 48 dp: icon buttons are 48 × 48, buttons are at least 50 tall, and chips are 40 tall with hit slop.

**Typography** (system font):

| Style | Size / weight |
| --- | --- |
| display | 44 / 800 (key result, timers) |
| title | 27 / 700 |
| heading | 18 / 700 |
| body | 15 |
| small | 13 |
| caption | 12 |
| eyebrow | 11 / 700, uppercase, tracked |
| chord | 20 / 700 |

## Components

| Component | File | Notes |
| --- | --- | --- |
| `AppText` | ui/primitives | Typography variants |
| `Button` | ui/primitives | primary / secondary / ghost; loading and disabled states; a11y state |
| `IconButton` | ui/primitives | Circular, 48 dp by default, optional filled |
| `Card` | ui/primitives | Bordered or tinted |
| `Segmented` | ui/primitives | Tablist semantics |
| `Chip` | ui/primitives | Filter chip |
| `Banner` | ui/primitives | info / warning / error / success / offline (icon-based) |
| `EmptyState`, `LoadingState` | ui/primitives | Every list has empty, loading and error states |
| `SectionHeading`, `Eyebrow`, `ProgressBar` | ui/primitives | |
| `Screen`, `ScreenHeader`, `ListRow` | ui/layout | Safe area, scroll, sticky footer, back button |
| `TextField`, `SearchField` | ui/forms | Label, hint, inline error with icon |
| `KeyPickerSheet` | music | 12 tonics × major/minor bottom sheet |
| `PianoKeys` | music | One octave with highlighted pitch classes |
| `KeyPanel`, `PitchPanel` | live-keys | Song key and current pitch are deliberately separate panels |
| `TranspositionWorkspace` | songs | Original / offset / target, chord or number view |

## Accessibility

- Every interactive element has a role and a label. Live key changes are announced through `accessibilityLiveRegion`.
- Key names have spoken forms ("F sharp major").
- The progress, level and seek bars expose `accessibilityValue`.
