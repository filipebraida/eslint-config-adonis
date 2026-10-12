// Writes the rule catalog into README.md from the rules themselves: the
// `metadata.description` of each YAML rule and the `meta.docs.description` of
// each JS rule. `pnpm catalog` rewrites it; the test fails when it is stale.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse } from 'yaml'
import { layoutOf, RULES_DIR } from '../presets/adonis.js'

export const README = join(import.meta.dirname, '..', 'README.md')
const START = '<!-- catalog:start -->'
const END = '<!-- catalog:end -->'

const AREAS = [
  'structure',
  'actions',
  'queries',
  'controllers',
  'http',
  'routes',
  'database',
  'events',
  'comments',
  'tests',
  'ui',
  'size',
]

/** Every rule as `{ id, area, layout, description }`, in the order of the catalog. */
export async function rules() {
  const files = readdirSync(RULES_DIR, { recursive: true, encoding: 'utf8' }).filter(
    (file) => (file.endsWith('.yml') && !file.endsWith('.test.yml')) || file.endsWith('.js'),
  )
  const all = []
  for (const file of files) {
    const description = file.endsWith('.yml')
      ? parse(readFileSync(join(RULES_DIR, file), 'utf8')).metadata?.description
      : (await import(pathToFileURL(join(RULES_DIR, file)).href)).default.meta.docs.description
    all.push({
      id: basename(file).replace(/\.(yml|js)$/, ''),
      area: file.split(/[\\/]/)[0],
      layout: layoutOf(dirname(file)),
      description,
    })
  }
  const rank = (rule) => AREAS.indexOf(rule.area)
  return all.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

function table(list) {
  return [
    '| Area | Rule | What it enforces |',
    '|---|---|---|',
    ...list.map((r) => `| ${r.area} | \`${r.id}\` | ${r.description} |`),
  ].join('\n')
}

/** The catalog section, as it must appear between the markers. */
export async function catalog() {
  const all = await rules()
  return [
    START,
    '### Both layouts',
    '',
    table(all.filter((r) => !r.layout)),
    '',
    '### `flat` only',
    '',
    table(all.filter((r) => r.layout === 'flat')),
    '',
    '### `modules` only',
    '',
    table(all.filter((r) => r.layout === 'modules')),
    END,
  ].join('\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const readme = readFileSync(README, 'utf8')
  const start = readme.indexOf(START)
  const end = readme.indexOf(END)
  if (start < 0 || end < 0) throw new Error(`README.md needs the ${START} and ${END} markers`)
  writeFileSync(README, readme.slice(0, start) + (await catalog()) + readme.slice(end + END.length))
}
