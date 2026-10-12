import { react } from '@adonisjs/eslint-config/react'
import eslintReact from '@eslint-react/eslint-plugin'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import { plugin as shadcn } from '@shadcn/lint'

/**
 * Default contracts: what each registry component lets the screen decide.
 * Everything else belongs to the component; for another look, add a variant to it.
 */
export const CONTRACTS = [
  // Density and typography of a card's content belong to the screen.
  { pattern: '^Card(Header|Content|Footer)?$', allow: ['layout', 'spacing', 'typography'] },
  { pattern: '^Card(Title|Description)$', allow: ['layout', 'spacing', 'typography', 'color'] },
  // A skeleton imitates the shape of the content it replaces.
  { pattern: '^Skeleton$', allow: ['layout', 'shape'] },
  // Short codes and numbers: monospace and tabular figures belong to the content.
  { pattern: '^Input$', allow: ['layout', 'typography'] },
  { pattern: '^Table(Head|Cell|Row)$', allow: ['layout', 'spacing', 'typography', 'color'] },
]

/**
 * UI lint: strict React with react-hooks (React Compiler rules),
 * accessibility, and design system checks with @shadcn/lint.
 *
 * @param {object} [options]
 * @param {string[]} [options.files] screens to check
 * @param {string[]} [options.registry] registry components: they define the styles, so the design system rules skip them
 * @param {string} [options.ui] import alias of the components
 * @param {string} [options.note] text appended to every design system error
 * @param {object[]} [options.contracts] no-restyle contracts
 */
export function ui({
  files = ['inertia/**/*.{ts,tsx}'],
  registry = ['inertia/components/ui/**'],
  ui = '~/components/ui',
  note,
  contracts = CONTRACTS,
} = {}) {
  return [
    ...react,
    {
      // The preset targets `inertia/**` with `*.ts` only; this glob adds tsx.
      files,
      rules: {
        // `#enums/*` are plain constants, the single source of the labels both
        // server and screens show. The rest of the backend stays out of the frontend.
        '@adonisjs/no-backend-import-in-frontend': ['error', { allowed: ['#enums/*'] }],
      },
    },
    { ...eslintReact.configs['disable-conflict-eslint-plugin-react'], files },
    { ...eslintReact.configs['strict-typescript'], files },
    { ...jsxA11y.flatConfigs.recommended, files },
    {
      files,
      ignores: registry,
      plugins: { shadcn },
      settings: { shadcn: { ui, ...(note ? { note } : {}) } },
      rules: {
        'shadcn/no-inline-styles': 'error',
        'shadcn/no-unknown-classes': 'error',
        'shadcn/no-raw-colors': 'error',
        'shadcn/require-static-classes': 'error',
        'shadcn/no-restyle': ['error', { allow: ['layout'], contracts }],
        'shadcn/no-arbitrary-values': [
          'error',
          // Layout math, not design values.
          { allow: ['grid-cols-*', 'grid-rows-*', '*-[calc(*', 'max-h-*', 'max-w-*', '*-[*%]'] },
        ],
      },
    },
  ]
}
