import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { parse, parseAllDocuments } from 'yaml'
import { adonis, LAYOUTS, layoutOf, RULES_DIR } from '../presets/adonis.js'

const NAMESPACE = 'adonis'
const ROOT = '/project'

/** One ESLint per layout, each with the full `adonis({ layout })` preset. */
const linters = Object.fromEntries(
  LAYOUTS.map((layout) => [
    layout,
    new ESLint({
      cwd: ROOT,
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser, ecmaVersion: 'latest', sourceType: 'module' },
        },
        {
          files: ['**/*.tsx'],
          languageOptions: {
            parser: tseslint.parser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: { ecmaFeatures: { jsx: true } },
          },
        },
        ...adonis({ layout, namespace: NAMESPACE }),
      ],
    }),
  ]),
)

const files = readdirSync(RULES_DIR, { recursive: true, encoding: 'utf8' }).sort()
const suites = files.filter((file) => file.endsWith('.test.yml'))
const rules = files.filter((file) => (file.endsWith('.yml') && !file.endsWith('.test.yml')) || file.endsWith('.js'))

// Every rule has its cases, and every YAML rule parses cleanly: a duplicated
// key (two `any:` in one mapping) silently drops half the rule.
describe('rule files', () => {
  for (const file of rules) {
    test(`${file} has a test file`, () => {
      const cases = file.replace(/\.(yml|js)$/, '.test.yml')
      assert.ok(suites.includes(cases), `missing ${cases}`)
    })
    if (!file.endsWith('.yml')) continue
    test(`${file} is valid YAML`, () => {
      for (const doc of parseAllDocuments(readFileSync(join(RULES_DIR, file), 'utf8'))) {
        assert.deepEqual(doc.errors.map(String), [])
        assert.equal(doc.toJS().id, basename(file, '.yml'), 'the rule id matches the file name')
      }
    })
  }
})

// A layout rule is configured only by its own layout's preset.
test('adonis() loads each layout rule only in its layout', () => {
  const configured = (layout) =>
    adonis({ layout, namespace: NAMESPACE })
      .filter((block) => block.files)
      .map((block) => block.name)
  assert.ok(configured('flat').includes(`${NAMESPACE}/app-allowed-layers`))
  assert.ok(!configured('flat').includes(`${NAMESPACE}/module-allowed-dirs`))
  assert.ok(configured('modules').includes(`${NAMESPACE}/module-allowed-dirs`))
  assert.ok(!configured('modules').includes(`${NAMESPACE}/app-allowed-layers`))
  assert.ok(!configured('modules').includes(`${NAMESPACE}/inertia-allowed-folders`))
})

test('adonis() rejects an unknown layout', () => {
  assert.throws(() => adonis({ layout: 'nested' }), /Unknown layout "nested"/)
})

async function messagesFor(layout, id, { file, code }) {
  const [result] = await linters[layout].lintText(code, { filePath: `${ROOT}/${file}` })
  const fatal = result.messages.filter((m) => m.fatal)
  assert.deepEqual(fatal, [], `parse error in ${file}`)
  return result.messages.filter((m) => m.ruleId === `${NAMESPACE}/${id}`)
}

// A suite runs with the layout it declares (`layout: modules` at the top of
// the file), else the layout of its folder (`<area>/flat/`, `<area>/modules/`).
// Layout-agnostic suites run with every layout.
for (const suite of suites) {
  const id = basename(suite, '.test.yml')
  const { layout, valid = [], invalid = [] } = parse(readFileSync(join(RULES_DIR, suite), 'utf8'))
  const layouts = layout ? [layout] : layoutOf(suite) ? [layoutOf(suite)] : LAYOUTS
  for (const l of layouts) assert.ok(LAYOUTS.includes(l), `${suite}: unknown layout "${l}"`)

  for (const l of layouts) {
    describe(`${id} (${l})`, () => {
      for (const c of valid) {
        test(`${id} valid: ${c.file}`, async () => {
          const found = await messagesFor(l, id, c)
          assert.deepEqual(
            found.map((m) => m.message),
            [],
            `expected no ${id} report in ${c.file}`,
          )
        })
      }
      for (const c of invalid) {
        test(`${id} invalid: ${c.file}`, async () => {
          const found = await messagesFor(l, id, c)
          if (c.errors === undefined) assert.ok(found.length > 0, `expected ${id} to report in ${c.file}`)
          else assert.equal(found.length, c.errors, `expected ${c.errors} ${id} report(s) in ${c.file}`)
        })
      }
    })
  }
}
