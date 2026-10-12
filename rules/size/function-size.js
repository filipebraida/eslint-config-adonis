// Kept in JS: the limit and the advice change with the layer of the file, and
// counting lines without blanks and comments needs the source, which ast-grep
// does not expose.

/** Lines of `node` that hold code: blank lines and comment-only lines do not count. */
function codeLines(sourceCode, node) {
  const commentLines = new Set()
  for (const comment of sourceCode.getAllComments()) {
    for (let line = comment.loc.start.line; line <= comment.loc.end.line; line++) commentLines.add(line)
  }
  let count = 0
  for (let line = node.loc.start.line; line <= node.loc.end.line; line++) {
    const text = sourceCode.lines[line - 1].trim()
    if (text && !isCommentOnly(text, line, commentLines)) count++
  }
  return count
}

function isCommentOnly(text, line, commentLines) {
  return commentLines.has(line) && /^(\/\/|\/\*|\*)/.test(text)
}

/** The name a reader looks for: the method, the variable or the function. */
function nameOf(node) {
  const parent = node.parent
  if (node.id?.name) return node.id.name
  if (parent?.type === 'MethodDefinition' || parent?.type === 'Property') return parent.key.name ?? 'function'
  if (parent?.type === 'VariableDeclarator') return parent.id.name ?? 'function'
  return null
}

export default {
  meta: {
    type: 'suggestion',
    docs: { description: 'A function stays within the line limit of its layer' },
    messages: {
      long: '`{{name}}` has {{lines}} lines of code (max {{max}} here). {{advice}}',
    },
    schema: [
      {
        type: 'object',
        properties: { max: { type: 'integer', minimum: 1 }, advice: { type: 'string' } },
        required: ['max', 'advice'],
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const [{ max, advice }] = context.options
    const sourceCode = context.sourceCode
    const check = (node) => {
      const name = nameOf(node)
      // Anonymous callbacks count inside the function that holds them.
      if (!name) return
      const lines = codeLines(sourceCode, node)
      if (lines > max)
        context.report({
          node: node.parent?.type === 'MethodDefinition' ? node.parent.key : node,
          messageId: 'long',
          data: { name, lines, max, advice },
        })
    }
    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check }
  },
}
