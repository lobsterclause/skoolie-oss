/**
 * skoolie theme — "ruled paper and ink".
 * Reference sketch for docs/design-ui.md; not wired into
 * apps/web yet. Build-checked with `npx astryx theme build` against
 * @astryxdesign/core 0.5.0 + @astryxdesign/theme-neutral 0.5.0.
 *
 * Fonts: Astryx only sets --font-family-*; the app must load Nunito itself
 * (recommended: `import '@fontsource-variable/nunito'` in main.tsx).
 */
import {defineTheme} from '@astryxdesign/core/theme';
import {neutralTheme} from '@astryxdesign/theme-neutral';

export const skoolieTheme = defineTheme({
  name: 'skoolie',
  extends: neutralTheme,

  // Cool greys regenerated from a fountain-pen-blue seed. The HCT generator
  // re-tones the seed to hold ≥ 4.5:1 as text; the resolved values are
  // recorded in §4 of the design doc. Status colours are NOT derived.
  color: {
    accent: ['#2A48C9', '#9DB1FF'],
    neutralStyle: 'cool',
    contrast: 'standard',
  },

  // 17px base for parents glancing at a phone; 1.2 ratio keeps supporting
  // text at ~14px. Nunito for its friendly forms + tabular figures.
  typography: {
    scale: {base: 17, ratio: 1.2},
    body: {
      family: 'Nunito Variable',
      fallbacks: 'Figtree, -apple-system, system-ui, sans-serif',
    },
    heading: {weight: 'bold', weights: {1: 'bold', 2: 'bold'}},
  },

  // Astryx defaults (inner 4 / element 8 / container 12 / page 28):
  // crisp, not bubbly. Avatars and badges still use --radius-full.
  radius: {base: 4, multiplier: 1},

  motion: {fast: 175, medium: 410, slow: 975, ratio: 0.75},

  tokens: {
    '--color-on-accent': ['#FFFFFF', '#0B1230'],
    // Paper: a cool near-white with the faint blue-grey of ruled paper.
    // Night: deep ink, not pure black.
    '--color-background-body': ['#F3F5F8', '#0F1319'],
    '--color-background-surface': ['#FFFFFF', '#181D26'],
    // Status hues from the same desk: margin-line red, pencil ochre,
    // slate green. Contrast-checked in both modes (design doc §4.6).
    '--color-error': ['#B8232F', '#FF8B8B'],
    '--color-warning': ['#8A5A00', '#F2C14E'],
    '--color-success': ['#1F6B45', '#6CCB94'],
    '--color-on-error': ['#FFFFFF', '#3A0006'],
    '--color-on-warning': ['#FFFFFF', '#2A1B00'],
    '--color-on-success': ['#FFFFFF', '#04240F'],
    // Data-viz domain tokens. Built themes skip runtime injection, so the domain defaults never reach
    // the page unless the theme sets them; these are Astryx's own values, validated for skoolie's
    // surfaces with the dataviz palette validator (see docs §3.10). Single series wears the accent.
    '--color-data-neutral': ['#8494A3', '#8C939B'],
    '--color-data-categorical-orange': ['#EB6E00', '#EB6E00'],
    '--color-data-categorical-teal': ['#08A3A3', '#08A3A3'],
    '--color-data-categorical-purple': ['#6B1EFD', '#6B1EFD'],
    '--color-data-blue-1': ['#DBECFF', '#DBECFF'],
    '--color-data-blue-2': ['#78BEFF', '#78BEFF'],
    '--color-data-blue-3': ['#2694FE', '#2694FE'],
    '--color-data-blue-4': ['#004CBC', '#004CBC'],
    '--color-data-blue-5': ['#02165E', '#02165E'],
  },

  components: {
    // 44px+ touch targets everywhere.
    'list-item': {base: {minHeight: '48px'}},
    // Five primary tabs must fit a 390px phone: tighter inline padding, label at the small step.
    tab: {base: {paddingInline: 'var(--spacing-2)', fontSize: 'var(--font-size-sm)'}},
    button: {base: {minHeight: '44px'}},
    // The active student's categorical hue as a thin rail on the shell header.
    // --student-accent is set on the AppShell element by the app.
    'app-shell-header': {
      base: {
        borderTopWidth: '3px',
        borderTopStyle: 'solid',
        borderTopColor: 'var(--student-accent, var(--color-accent))',
      },
    },
  },
});
