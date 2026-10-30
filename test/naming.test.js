import { resolve } from 'node:path'
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { configApp } from '@adonisjs/eslint-config'
import { ESLint } from 'eslint'
import { adonis } from '../presets/adonis.js'

const ROOT = resolve('/project')
const FILE = resolve(ROOT, 'app/shop/tests/unit/actions/archive_order.spec.ts')

// The block only overrides the AdonisJS rule, so it is checked the way an app
// loads it: after `configApp`.
const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: true,
  overrideConfig: configApp(...adonis({ layout: 'modules' })),
})

async function namingMessages(code) {
  const [result] = await eslint.lintText(code, { filePath: FILE })
  assert.deepEqual(
    result.messages.filter((m) => m.fatal),
    [],
    'parse error',
  )
  return result.messages.filter((m) => m.ruleId === '@typescript-eslint/naming-convention')
}

describe('naming of unused variables', () => {
  test('an unused `using` fake may start with an underscore', async () => {
    const code = "import drive from 'x'\nexport function f() {\n  using _disk = drive.fake()\n}\n"
    assert.deepEqual(await namingMessages(code), [])
  })

  test('a variable that is read keeps the AdonisJS format', async () => {
    const code = 'export function f() {\n  const _total = 1\n  return _total\n}\n'
    assert.equal((await namingMessages(code)).length, 1)
  })

  test('a plain camelCase variable still passes', async () => {
    const code = 'export function f() {\n  const total = 1\n  return total\n}\n'
    assert.deepEqual(await namingMessages(code), [])
  })
})
