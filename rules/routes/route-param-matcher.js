// Kept in JS: the rule has to pull every `:param` out of the route string and
// compare each name with the `.where()` calls on the route and on every
// enclosing group. ast-grep can match the calls but cannot compare a name
// extracted from one string with the arguments of another node.

const VERBS = new Set(['get', 'post', 'put', 'patch', 'delete', 'any'])

/** Names passed to `.where(name, ...)` along the method chain that starts at `call`. */
function chainedWheres(call) {
  const names = new Set()
  let node = call
  while (node.parent?.type === 'MemberExpression' && node.parent.object === node) {
    const outer = node.parent.parent
    if (outer?.type !== 'CallExpression' || outer.callee !== node.parent) break
    const first = outer.arguments[0]
    if (node.parent.property.name === 'where' && first?.type === 'Literal') names.add(first.value)
    node = outer
  }
  return names
}

/** Names covered by `.where()` on any enclosing `router.group()`. */
function groupWheres(node) {
  const names = new Set()
  for (let n = node.parent; n; n = n.parent) {
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'group') {
      for (const name of chainedWheres(n)) names.add(name)
    }
  }
  return names
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Every route `:param` has a `.where()` matcher' },
    messages: {
      missing:
        "`:{{param}}` has no matcher. Add `.where('{{param}}', router.matchers.number())` (or `uuid()`); without it an invalid value reaches the database and becomes a 500.",
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee
        if (callee.type !== 'MemberExpression' || !VERBS.has(callee.property.name)) return
        const path = node.arguments[0]
        if (path?.type !== 'Literal' || typeof path.value !== 'string') return
        const params = [...path.value.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1])
        if (!params.length) return
        const covered = new Set([...chainedWheres(node), ...groupWheres(node)])
        for (const param of params) {
          if (!covered.has(param)) context.report({ node: path, messageId: 'missing', data: { param } })
        }
      },
    }
  },
}
