import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { astGrep } from '@adonisjs/eslint-ast-grep'
import routeParamMatcher from '../rules/routes/route-param-matcher.js'
import functionSize from '../rules/size/function-size.js'

export const RULES_DIR = join(import.meta.dirname, '..', 'rules')

/**
 * App layouts. Rules in a `<area>/<layout>/` folder only apply to that layout;
 * every other rule is layout-agnostic.
 *
 * - flat: one layer per folder, `app/<layer>/`, `tests/`, `inertia/`.
 * - modules: one folder per module, `app/<module>/<folder>/`, with its own
 *   `routes.ts`, `tests/` and `ui/`.
 */
export const LAYOUTS = ['flat', 'modules']

/** The layout a rule file belongs to, or `undefined` when it applies to all. */
export const layoutOf = (file) => file.split(/[\\/]/).find((segment) => LAYOUTS.includes(segment))

/** Rule files only: the `*.test.yml` cases live next to them. */
const ruleFiles = (layout) =>
  readdirSync(RULES_DIR, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.yml') && !file.endsWith('.test.yml'))
    .filter((file) => [undefined, layout].includes(layoutOf(file)))
    .sort()
    .map((file) => join(RULES_DIR, file))

/** Both layouts: `app/<layer>/` and `app/<module>/<layer>/`. */
const layer = (name, ext = 'ts') => [`app/${name}/**/*.${ext}`, `app/*/${name}/**/*.${ext}`]

const SCREENS = ['inertia/{pages,components,layouts}/**/*.tsx', 'app/*/ui/{pages,components,layouts}/**/*.tsx']
const REGISTRY = ['inertia/components/ui/**', 'app/*/ui/components/ui/**']

/**
 * Lines of code per function, by layer: blank and comment lines do not count.
 * The limits sit above what the model projects write, so a function past
 * them is doing the work of another layer; the advice says which. Screens
 * only warn: a page is a tree of markup before it is logic.
 */
export const SIZE_LIMITS = [
  {
    files: layer('actions'),
    max: 80,
    advice:
      'Move domain rules to the model, the reads that decide to a query, the effects to an event; split independent writes into their own actions; name the remaining steps as private methods after the domain step (`#reserveSeat()`, never `#processData()`). If none applies, disable it on this function with the reason.',
  },
  {
    files: layer('controllers'),
    max: 100,
    advice:
      'A controller method authorizes, validates, delegates, transforms and responds. Domain logic goes to the action or the query, the shape of the data to the transformer, a second verb to another controller named by its noun.',
  },
  {
    files: layer('queries'),
    max: 130,
    advice:
      'Split the read: a filter repeated elsewhere becomes a scope on the model, a block of the screen its own query, the row shape the transformer. If it is one statement that cannot be split, disable it on this function with the reason.',
  },
  {
    files: layer('services'),
    max: 120,
    advice: 'A service function does one thing: split it by step, and move domain rules to the model.',
  },
  {
    files: layer('jobs'),
    max: 60,
    advice: 'A job performs one effect: the decision goes to a query, the write to an action.',
  },
  { files: layer('listeners'), max: 20, advice: 'A listener only dispatches a job with the ids of the event.' },
  {
    files: [...layer('models'), ...layer('policies')],
    max: 40,
    advice:
      'One method per rule (or per verb in a policy): split it by rule, and keep each one on the model it is about.',
  },
  {
    files: layer('transformers'),
    max: 40,
    advice: 'One variant per screen: a variant that grows is another screen, or a computed field on the model.',
  },
  {
    files: SCREENS,
    ignores: REGISTRY,
    max: 200,
    severity: 'warn',
    advice:
      'Split the screen into components in `components/<resource>/`, one per block (the table, the filters, a form section); the state the blocks share stays in the page.',
  },
]

/** Nesting depth: past three levels, invert the condition and return early. */
const DEPTH = {
  name: 'adonis/max-depth',
  files: ['app/**/*.{ts,tsx}', 'inertia/**/*.{ts,tsx}', 'start/**/*.ts'],
  ignores: REGISTRY,
  rules: { 'max-depth': ['error', 3] },
}

/** Rules that ast-grep YAML cannot express, as plain ESLint rules. */
const JS_RULES = [
  {
    id: 'route-param-matcher',
    rule: routeParamMatcher,
    blocks: [{ files: ['start/**/routes.ts', 'app/*/routes.ts'] }],
  },
  {
    id: 'function-size',
    rule: functionSize,
    blocks: SIZE_LIMITS.map(({ files, ignores, max, advice, severity = 'error' }) => ({
      files,
      ignores,
      options: [{ max, advice }],
      severity,
    })),
  },
]

/**
 * Architecture rules for an AdonisJS app, as flat-config blocks. Globs are
 * relative to the ESLint working directory (the app root).
 *
 *   export default configApp(...adonis())
 *   export default configApp(...adonis({ layout: 'modules' }))
 *
 * @param {object} [options]
 * @param {'flat' | 'modules'} [options.layout] how `app/` is organized
 * @param {string} [options.namespace] prefix of the rule ids
 */
export function adonis({ layout = 'flat', namespace = 'adonis' } = {}) {
  if (!LAYOUTS.includes(layout)) {
    throw new Error(`Unknown layout "${layout}". Use one of: ${LAYOUTS.join(', ')}.`)
  }
  const [pluginBlock, ...ruleBlocks] = astGrep(ruleFiles(layout), { namespace })
  const plugin = pluginBlock.plugins[namespace]
  for (const { id, rule } of JS_RULES) plugin.rules[id] = rule
  return [
    pluginBlock,
    ...ruleBlocks,
    ...JS_RULES.flatMap(({ id, blocks }) =>
      blocks.map(({ files, ignores, options = [], severity = 'error' }) => ({
        name: `${namespace}/${id}`,
        files,
        ...(ignores ? { ignores } : {}),
        rules: { [`${namespace}/${id}`]: [severity, ...options] },
      })),
    ),
    DEPTH,
  ]
}
