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
  },

  components: {
    // 44px+ touch targets everywhere.
    'list-item': {base: {minHeight: '48px'}},
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
