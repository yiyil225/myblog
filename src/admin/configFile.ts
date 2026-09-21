/**
 * 解析并原地编辑 src/config.ts。
 *
 * 主题配置是一个 TypeScript 模块，不是 JSON，`JSON.parse` 用不了。为了不破坏
 * 文件里大量解释性注释和原有排版，这里只做两件事：
 *
 *   1. 把 `export default { ... }` 解析成一棵带源码区间的字面量树
 *   2. 保存时只替换真正变化的值所在的源码区间
 *
 * 结果是：没动过的地方逐字节保持原样，注释全部保留。
 */

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type LiteralNode =
  | { kind: 'string'; value: string; start: number; end: number }
  | { kind: 'number'; value: number; start: number; end: number }
  | { kind: 'boolean'; value: boolean; start: number; end: number }
  | { kind: 'null'; value: null; start: number; end: number }
  | { kind: 'array'; items: LiteralNode[]; start: number; end: number }
  | { kind: 'object'; entries: ObjectEntry[]; start: number; end: number }

export type ObjectEntry = {
  key: string
  keyStart: number
  keyEnd: number
  value: LiteralNode
  /** 包含行首缩进和前一行的换行，删掉它不会留下空行 */
  entryStart: number
  /** 值之后的逗号（如果有）之后的位置 */
  entryEnd: number
}

export type ParsedConfig = {
  /** 源码里 `export default` 之前的内容 */
  prefix: string
  node: LiteralNode
  /** 根对象 `}` 之后的内容 */
  suffix: string
}

function isWhitespace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\n' || char === '\r'
}

class Parser {
  pos: number
  private readonly source: string

  constructor(source: string, start = 0) {
    this.source = source
    this.pos = start
  }

  /** 跳过空白、行注释和块注释。 */
  skipTrivia(): void {
    for (;;) {
      while (this.pos < this.source.length && isWhitespace(this.source[this.pos])) this.pos += 1

      if (this.source.startsWith('//', this.pos)) {
        const lineEnd = this.source.indexOf('\n', this.pos)
        this.pos = lineEnd === -1 ? this.source.length : lineEnd + 1
        continue
      }

      if (this.source.startsWith('/*', this.pos)) {
        const close = this.source.indexOf('*/', this.pos + 2)
        this.pos = close === -1 ? this.source.length : close + 2
        continue
      }

      return
    }
  }

  parseValue(): LiteralNode {
    this.skipTrivia()
    const char = this.source[this.pos]

    if (char === undefined) throw new Error(`配置在第 ${this.pos} 个字符处意外结束`)
    if (char === '{') return this.parseObject()
    if (char === '[') return this.parseArray()
    if (char === '"' || char === "'" || char === '`') return this.parseString()
    if (char === '-' || char === '+' || (char >= '0' && char <= '9')) return this.parseNumber()

    const start = this.pos
    const word = this.parseIdentifier()
    if (word === 'true' || word === 'false') {
      return { kind: 'boolean', value: word === 'true', start, end: this.pos }
    }
    if (word === 'null' || word === 'undefined') {
      return { kind: 'null', value: null, start, end: this.pos }
    }
    throw new Error(`不支持的字面量 "${word}"（第 ${start} 个字符）。配置里请只写字面量。`)
  }

  parseIdentifier(): string {
    const start = this.pos
    while (this.pos < this.source.length && /[A-Za-z0-9_$]/.test(this.source[this.pos])) this.pos += 1
    if (this.pos === start) throw new Error(`第 ${start} 个字符处期望一个标识符`)
    return this.source.slice(start, this.pos)
  }

  parseString(): LiteralNode {
    const start = this.pos
    const quote = this.source[this.pos]
    this.pos += 1
    let value = ''

    while (this.pos < this.source.length) {
      const char = this.source[this.pos]
      if (char === '\\') {
        const next = this.source[this.pos + 1]
        const escapes: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }
        if (next === 'u') {
          value += String.fromCharCode(Number.parseInt(this.source.slice(this.pos + 2, this.pos + 6), 16))
          this.pos += 6
          continue
        }
        value += escapes[next] ?? next
        this.pos += 2
        continue
      }
      if (char === quote) {
        this.pos += 1
        return { kind: 'string', value, start, end: this.pos }
      }
      value += char
      this.pos += 1
    }

    throw new Error(`第 ${start} 个字符处的字符串没有闭合`)
  }

  parseNumber(): LiteralNode {
    const start = this.pos
    const match = /^[+-]?(?:0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(
      this.source.slice(this.pos),
    )
    if (!match) throw new Error(`第 ${start} 个字符处的数字格式不对`)
    this.pos += match[0].length
    return { kind: 'number', value: Number(match[0]), start, end: this.pos }
  }

  parseArray(): LiteralNode {
    const start = this.pos
    this.pos += 1
    const items: LiteralNode[] = []

    for (;;) {
      this.skipTrivia()
      if (this.source[this.pos] === ']') {
        this.pos += 1
        return { kind: 'array', items, start, end: this.pos }
      }
      if (this.pos >= this.source.length) throw new Error(`第 ${start} 个字符处的数组没有闭合`)

      items.push(this.parseValue())
      this.skipTrivia()
      if (this.source[this.pos] === ',') this.pos += 1
    }
  }

  parseObject(): LiteralNode {
    const start = this.pos
    this.pos += 1
    const entries: ObjectEntry[] = []

    for (;;) {
      this.skipTrivia()
      if (this.source[this.pos] === '}') {
        this.pos += 1
        return { kind: 'object', entries, start, end: this.pos }
      }
      if (this.pos >= this.source.length) throw new Error(`第 ${start} 个字符处的对象没有闭合`)

      const keyStart = this.pos
      const char = this.source[this.pos]
      const key =
        char === '"' || char === "'" || char === '`'
          ? (this.parseString().value as string)
          : this.parseIdentifier()
      const keyEnd = this.pos

      this.skipTrivia()
      if (this.source[this.pos] !== ':') throw new Error(`第 ${this.pos} 个字符处期望 ":"`)
      this.pos += 1

      const value = this.parseValue()

      // 删一个键时要连着缩进和换行一起删，否则会留下空行。
      const lineStart = this.source.lastIndexOf('\n', keyStart - 1) + 1
      const indentOnly = /^[ \t]*$/.test(this.source.slice(lineStart, keyStart))
      const entryStart =
        indentOnly && lineStart > 0 && this.source[lineStart - 1] === '\n' ? lineStart - 1 : keyStart

      let entryEnd = value.end
      this.skipTrivia()
      if (this.source[this.pos] === ',') {
        this.pos += 1
        entryEnd = this.pos
      }

      entries.push({ key, keyStart, keyEnd, value, entryStart, entryEnd })
    }
  }
}

export function parseConfigSource(source: string): ParsedConfig {
  const marker = source.indexOf('export default')
  if (marker === -1) throw new Error('src/config.ts 里找不到 "export default"')

  const parser = new Parser(source, marker + 'export default'.length)
  const node = parser.parseValue()

  return { prefix: source.slice(0, node.start), node, suffix: source.slice(node.end) }
}

/** 去掉源码位置信息，得到可以直接绑定到表单的普通对象。 */
export function toPlain(node: LiteralNode): JsonValue {
  switch (node.kind) {
    case 'array':
      return node.items.map(toPlain)
    case 'object': {
      const out: { [key: string]: JsonValue } = {}
      for (const entry of node.entries) out[entry.key] = toPlain(entry.value)
      return out
    }
    default:
      return node.value
  }
}

function locate(root: LiteralNode, path: string[]): LiteralNode | undefined {
  let node: LiteralNode = root
  for (const key of path) {
    if (node.kind !== 'object') return undefined
    const entry = node.entries.find((candidate) => candidate.key === key)
    if (!entry) return undefined
    node = entry.value
  }
  return node
}

function indentAt(source: string, position: number): string {
  const lineStart = source.lastIndexOf('\n', position - 1) + 1
  const match = /^[ \t]*/.exec(source.slice(lineStart, position))
  return match ? match[0] : ''
}

function quoteString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
  // 跟文件里的主流风格保持一致：优先双引号，值里含双引号时改用单引号。
  if (!escaped.includes('"')) return `"${escaped}"`
  if (!escaped.includes("'")) return `'${escaped}'`
  return `"${escaped.replace(/"/g, '\\"')}"`
}

function quoteKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : quoteString(key)
}

export function serializeValue(value: JsonValue, indent: string): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return quoteString(value)
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0'
  if (typeof value === 'boolean') return value ? 'true' : 'false'

  const inner = `${indent}  `

  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    const items = value.map((item) => `${inner}${serializeValue(item, inner)}`)
    return `[\n${items.join(',\n')}\n${indent}]`
  }

  const keys = Object.keys(value)
  if (!keys.length) return '{}'
  const entries = keys.map(
    (key) => `${inner}${quoteKey(key)}: ${serializeValue(value[key], inner)}`,
  )
  return `{\n${entries.join(',\n')}\n${indent}}`
}

export type Change =
  | { path: string[]; value: JsonValue }
  /** 从配置里删掉这个键。键本来就不存在时是空操作。 */
  | { path: string[]; remove: true }

type EditOp = { start: number; end: number; text: string }

/**
 * 只把发生变化的路径写回源码。返回新的文件内容。
 *
 * 多个改动按位置从后往前应用，避免前面的替换让后面的偏移失效。
 */
export function applyChanges(
  source: string,
  parsed: ParsedConfig,
  changes: Change[],
): string {
  const operations: EditOp[] = []

  for (const change of changes) {
    const existing = locate(parsed.node, change.path)

    if ('remove' in change) {
      const parentPath = change.path.slice(0, -1)
      const parent = locate(parsed.node, parentPath)
      const key = change.path[change.path.length - 1]
      if (!parent || parent.kind !== 'object' || key === undefined) continue
      const entry = parent.entries.find((candidate) => candidate.key === key)
      // 键在文件里本来就不存在（比如 social 里被注释掉的那些），不用动。
      if (!entry) continue
      operations.push({ start: entry.entryStart, end: entry.entryEnd, text: '' })
      continue
    }

    if (existing) {
      operations.push({
        start: existing.start,
        end: existing.end,
        text: serializeValue(change.value, indentAt(source, existing.start)),
      })
      continue
    }

    // 键还不存在（例如 social 下面全是被注释掉的键）。挂到最近的已存在父对象上。
    const parentPath = change.path.slice(0, -1)
    const parent = locate(parsed.node, parentPath)
    const key = change.path[change.path.length - 1]
    if (!parent || parent.kind !== 'object' || key === undefined) continue

    const firstEntry = parent.entries[0]
    const innerIndent = firstEntry
      ? indentAt(source, firstEntry.keyStart)
      : `${indentAt(source, parent.start)}  `
    const body = `${quoteKey(key)}: ${serializeValue(change.value, innerIndent)},`

    // 两种情况都是「插到一个已有换行之前」：
    //   空对象 → 锚在 `{` 之后，那个换行是原有内容的开头
    //   非空对象 → 锚在第一个键前面的换行上
    // 所以统一只需要一个前导换行，不能再补尾部换行，否则会多出空行。
    const anchor = firstEntry ? firstEntry.entryStart : parent.start + 1
    operations.push({ start: anchor, end: anchor, text: `\n${innerIndent}${body}` })
  }

  operations.sort((a, b) => b.start - a.start || b.end - a.end)

  let output = source
  for (const operation of operations) {
    output = output.slice(0, operation.start) + operation.text + output.slice(operation.end)
  }
  return output
}

/** 逐个路径比较，返回真正变化的那些。 */
export function diffPaths(
  before: JsonValue,
  after: JsonValue,
  path: string[] = [],
): Change[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return []

  const bothObjects =
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)

  if (!bothObjects) {
    // 数组整体替换：元素的增删改对主题配置来说语义就是「换掉这一项」。
    return [{ path, value: after }]
  }

  const keys = new Set([...Object.keys(before), ...Object.keys(after)])
  const changes: Change[] = []
  for (const key of keys) {
    const inBefore = key in before
    const inAfter = key in after

    if (inBefore && !inAfter) {
      changes.push({ path: [...path, key], remove: true })
      continue
    }
    changes.push(...diffPaths(before[key], after[key], [...path, key]))
  }
  return changes
}
