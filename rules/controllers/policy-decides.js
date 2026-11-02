// Kept in JS: the rule has to know which names are the method's parameters and
// whether the body reads them where it decides. ast-grep can capture one
// parameter but cannot check every reference of every parameter.

/** Positions where a read decides the answer. */
const DECIDING = new Set([
  'IfStatement',
  'ConditionalExpression',
  'ReturnStatement',
  'LogicalExpression',
  'BinaryExpression',
  'UnaryExpression',
  'SwitchStatement',
])

/** The root object of `a.b.c(...)`. */
function rootOf(node) {
  let n = node
  while (n.type === 'MemberExpression' || n.type === 'ChainExpression')
    n = n.type === 'ChainExpression' ? n.expression : n.object
  return n
}

/** `this.authz.can(...)`, `this.isOwner(user)`: a call on the policy, which holds the authorizer. */
function callsAuthorizer(node) {
  let found = false
  const visit = (n) => {
    if (found || !n || typeof n.type !== 'string') return
    if (n.type === 'CallExpression' && rootOf(n.callee).type === 'ThisExpression') {
      found = true
      return
    }
    for (const [key, value] of Object.entries(n)) {
      if (key === 'parent') continue
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value.type === 'string') visit(value)
    }
  }
  visit(node)
  return found
}

/** A read of the parameter inside a condition or the returned expression. */
function decidesOn(reference, fn) {
  for (let n = reference.identifier.parent; n && n !== fn; n = n.parent) {
    if (DECIDING.has(n.type)) return true
  }
  return false
}

function isPublicMethod(node) {
  return (
    node.kind === 'method' &&
    !node.static &&
    node.key.type !== 'PrivateIdentifier' &&
    !['private', 'protected'].includes(node.accessibility)
  )
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'A policy method decides: it calls the authorizer (`this.authz.can`) or reads a parameter in a condition; a method open to every signed-in user takes no parameters and has a `/** */` above it saying who',
    },
    messages: {
      undecided:
        '`{{name}}()` allows without deciding. Check the capability (`this.authz.can(user, CAPABILITIES_DELIVERIES.move)`), then the record (membership, state). A verb open to every signed-in user takes no parameters and has a `/** */` directly above it saying who it is for (`/** Every signed-in user, on their own notifications. */`).',
    },
    schema: [],
  },
  create(context) {
    const source = context.sourceCode
    return {
      MethodDefinition(node) {
        if (!isPublicMethod(node) || node.key.name === 'constructor') return
        const fn = node.value
        if (!fn.body) return
        if (callsAuthorizer(fn.body)) return
        const params = source.getDeclaredVariables(fn)
        if (params.some((variable) => variable.references.some((reference) => decidesOn(reference, fn)))) return
        if (fn.params.length === 0) {
          const comment = source.getCommentsBefore(node).at(-1)
          const above = comment && comment.type === 'Block' && comment.value.startsWith('*')
          if (above && comment.loc.end.line >= node.loc.start.line - 1) return
        }
        context.report({ node: node.key, messageId: 'undecided', data: { name: source.getText(node.key) } })
      },
    }
  },
}
