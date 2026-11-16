import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'yaml'
import { RULES_DIR } from '../presets/adonis.js'

// The folders a rule accepts are the last segment of each `ignores` glob:
// `app/*/{actions,queries}/**`, `app/core/utils/**`. Grouped by the glob with
// that segment replaced by `%`, so `app/core/utils/**` and
// `app/core/{authz,hooks}/**` land in the same group.
function folders(rule) {
  const { ignores } = parse(readFileSync(join(RULES_DIR, rule), 'utf8'))
  const groups = {}
  for (const glob of ignores) {
    const match = glob.match(/^(.*\/)(?:\{([^}]+)\}|([a-z_]+))\/\*\*$/)
    assert.ok(match, `${rule}: cannot read the folders of "${glob}"`)
    const [, prefix, list, single] = match
    groups[`${prefix}%`] = [...(groups[`${prefix}%`] ?? []), ...(list ? list.split(',') : [single])]
  }
  return groups
}

// A folder accepted for code and not for its unit test (or the reverse) makes
// the app that follows one rule break the other. Each pair below is a scope of
// the folder rule and the scope of the test rule that mirrors it; `without`
// are the folders that hold no code to unit test.
const MIRRORS = [
  {
    layout: 'flat',
    source: ['structure/flat/app-allowed-layers.yml', 'app/%'],
    mirror: ['tests/flat/unit-test-mirrors-layer.yml', 'tests/unit/%'],
    without: [],
  },
  {
    layout: 'modules',
    source: ['structure/modules/module-allowed-dirs.yml', 'app/*/%'],
    mirror: ['tests/modules/unit-test-mirrors-layer.yml', 'app/*/tests/unit/%'],
    // `start/` boots the module and `tests/` is the tests themselves.
    without: ['start', 'tests'],
  },
  {
    layout: 'modules, core only',
    source: ['structure/modules/module-allowed-dirs.yml', 'app/core/%'],
    mirror: ['tests/modules/unit-test-mirrors-layer.yml', 'app/core/tests/unit/%'],
    without: [],
  },
]

for (const { layout, source, mirror, without } of MIRRORS) {
  test(`unit tests mirror every folder that holds code (${layout})`, () => {
    const code = folders(source[0])[source[1]].filter((folder) => !without.includes(folder))
    const tests = folders(mirror[0])[mirror[1]]
    assert.deepEqual(tests.toSorted(), code.toSorted(), `${mirror[0]} and ${source[0]} list different folders`)
  })
}
