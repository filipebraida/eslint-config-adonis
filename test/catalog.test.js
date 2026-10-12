import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { catalog, README, rules } from '../scripts/catalog.js'

test('every rule has a description for the catalog', async () => {
  const missing = (await rules()).filter((rule) => !rule.description).map((rule) => rule.id)
  assert.deepEqual(missing, [], 'add metadata.description to these rules')
})

test('the README catalog matches the rules (run `pnpm catalog`)', async () => {
  // A checkout on Windows may turn the README into CRLF.
  const readme = readFileSync(README, 'utf8').replace(/\r\n/g, '\n')
  assert.ok(readme.includes(await catalog()))
})
