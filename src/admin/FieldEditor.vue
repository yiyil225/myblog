<script setup lang="ts">
/**
 * 递归渲染一个配置字段。
 *
 * 它不通过 v-model 向上冒事件，而是直接读写传进来的 reactive 容器
 * （`container[fieldKey]`）。配置表单嵌套很深，这样能省掉一长串 emit 链。
 */
import { computed, ref } from 'vue'
import type { JsonValue } from './configFile'
import { metaFor } from './fieldMeta'

const props = defineProps<{
  container: Record<string, JsonValue> | JsonValue[]
  fieldKey: string | number
  path: string[]
  depth: number
  hideLabel?: boolean
}>()

const value = computed(() => (props.container as Record<string | number, JsonValue>)[props.fieldKey])
const meta = computed(() => metaFor(props.path, String(props.fieldKey)))

function write(next: JsonValue) {
  ;(props.container as Record<string | number, JsonValue>)[props.fieldKey] = next
}

type Kind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

const kind = computed<Kind>(() => {
  const current = value.value
  if (Array.isArray(current)) return 'array'
  if (current === null || current === undefined) return 'null'
  return typeof current as 'object' | 'string' | 'number' | 'boolean'
})

const label = computed(() => (props.hideLabel ? '' : meta.value.label ?? String(props.fieldKey)))

// ── 标量 ────────────────────────────────────────────────
const checkbox = computed({
  get: () => value.value === true,
  set: (next: boolean) => write(next),
})

const numberField = computed({
  get: () => (typeof value.value === 'number' ? value.value : 0),
  set: (next: number | string) => write(Number(next) || 0),
})

const textField = computed({
  get: () => (typeof value.value === 'string' ? value.value : ''),
  set: (next: string) => write(next),
})

/** 统计 ID 这类字段：留空表示 false，填了就是字符串。 */
const idField = computed({
  get: () => (typeof value.value === 'string' ? value.value : ''),
  set: (next: string) => write(next.trim() ? next.trim() : false),
})

// ── JSON 直编 ───────────────────────────────────────────
const jsonError = ref('')
const jsonField = computed({
  get: () => JSON.stringify(value.value ?? null, null, 2),
  set: (text: string) => {
    if (!text.trim()) {
      jsonError.value = ''
      write({})
      return
    }
    try {
      write(JSON.parse(text) as JsonValue)
      jsonError.value = ''
    } catch (error) {
      jsonError.value = (error as Error).message
    }
  },
})

// ── 多选（数组 + 固定选项）─────────────────────────────
const choices = computed(() =>
  meta.value.control === 'multi' && meta.value.choices?.length ? meta.value.choices : null,
)

const selected = computed<string[]>(() =>
  Array.isArray(value.value) ? (value.value as string[]) : [],
)

function toggle(choice: string, checked: boolean): void {
  const next = [...selected.value]
  const at = next.indexOf(choice)
  if (checked && at === -1) next.push(choice)
  if (!checked && at !== -1) next.splice(at, 1)
  write(next)
}

// ── 数组 ────────────────────────────────────────────────
function isPlainObject(input: unknown): input is Record<string, JsonValue> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/** 对象数组的模板：优先用现有第一项，其次用 fieldMeta 里登记的 shape。 */
const itemShape = computed<Record<string, JsonValue> | null>(() => {
  const current = value.value
  if (!Array.isArray(current)) return null
  if (current.length && isPlainObject(current[0])) return current[0]
  if (meta.value.shape) return meta.value.shape
  return null
})

const isObjectArray = computed(() => itemShape.value !== null)

/** 按模板造一个空项，保留原有的键集合。 */
function emptyLike(template: JsonValue): JsonValue {
  if (Array.isArray(template)) return []
  if (isPlainObject(template)) {
    const out: Record<string, JsonValue> = {}
    for (const key of Object.keys(template)) out[key] = emptyLike(template[key])
    return out
  }
  if (typeof template === 'number') return 0
  if (typeof template === 'boolean') return false
  return ''
}

const items = computed<JsonValue[]>(() => (Array.isArray(value.value) ? value.value : []))

function addItem(): void {
  const next = [...items.value, emptyLike(itemShape.value ?? {})]
  write(next)
}

function removeItem(index: number): void {
  const next = [...items.value]
  next.splice(index, 1)
  write(next)
}

/** 原始值数组用「一行一项」编辑。 */
const lineField = computed({
  get: () => items.value.map((item) => String(item)).join('\n'),
  set: (text: string) => {
    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    // 原本是数字数组就保持数字，避免写回后配置类型变了。
    const allNumbers = items.value.length > 0 && items.value.every((item) => typeof item === 'number')
    write(allNumbers ? lines.map(Number) : lines)
  },
})

const objectKeys = computed(() =>
  isPlainObject(value.value) ? Object.keys(value.value).filter((key) => !key.startsWith('_')) : [],
)

function childPath(key: string | number): string[] {
  return [...props.path, String(key)]
}
</script>

<template>
  <!-- 布尔 -->
  <label v-if="kind === 'boolean'" class="row check">
    <input type="checkbox" v-model="checkbox" />
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
  </label>

  <!-- JSON 直编 -->
  <label v-else-if="meta.control === 'json'" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <textarea v-model="jsonField" rows="10" spellcheck="false" />
    <span v-if="jsonError" class="err">JSON 格式错误：{{ jsonError }}</span>
  </label>

  <!-- 下拉选择 -->
  <label v-else-if="meta.control === 'select' && meta.options" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <select v-model="textField">
      <option v-for="option in meta.options" :key="option" :value="option">{{ option }}</option>
    </select>
  </label>

  <!-- 统计 ID：留空即关闭 -->
  <label v-else-if="meta.control === 'idOrFalse'" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <input v-model="idField" placeholder="留空表示关闭" />
  </label>

  <!-- 数字 -->
  <label v-else-if="kind === 'number'" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <input type="number" v-model="numberField" />
  </label>

  <!-- 字符串 -->
  <label v-else-if="kind === 'string'" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <textarea v-if="meta.long" v-model="textField" rows="4" />
    <input v-else v-model="textField" />
  </label>

  <!-- 数组：固定选项多选 -->
  <fieldset v-else-if="kind === 'array' && choices" class="group">
    <legend>{{ label }}</legend>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <label v-for="choice in choices" :key="choice" class="row check">
      <input
        type="checkbox"
        :checked="selected.includes(choice)"
        @change="toggle(choice, ($event.target as HTMLInputElement).checked)"
      />
      <span class="name mono">{{ choice }}</span>
    </label>
  </fieldset>

  <!-- 数组：一行一项 -->
  <label v-else-if="kind === 'array' && !isObjectArray" class="field">
    <span class="name">{{ label }}</span>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <textarea v-model="lineField" rows="4" spellcheck="false" />
    <span class="help">一行一项。清空某行即可删除该项。</span>
  </label>

  <!-- 数组：对象列表 -->
  <fieldset v-else-if="kind === 'array'" class="group">
    <legend>{{ label }}</legend>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <div v-for="(item, index) in items" :key="index" class="item">
      <div class="item-head">
        <span class="index">#{{ Number(index) + 1 }}</span>
        <button type="button" class="mini" @click="removeItem(Number(index))">删除</button>
      </div>
      <FieldEditor
        v-for="key in Object.keys(item as object)"
        :key="key"
        :container="item as Record<string, JsonValue>"
        :field-key="key"
        :path="childPath(index)"
        :depth="depth + 1"
      />
    </div>
    <button type="button" class="mini" @click="addItem">+ 添加一项</button>
  </fieldset>

  <!-- 对象 -->
  <fieldset v-else-if="kind === 'object'" class="group" :class="{ nested: depth > 0 }">
    <legend v-if="label">{{ label }}</legend>
    <span v-if="meta.help" class="help">{{ meta.help }}</span>
    <p v-if="!objectKeys.length" class="help">（空对象，暂时没有可填的字段）</p>
    <FieldEditor
      v-for="key in objectKeys"
      :key="key"
      :container="value as Record<string, JsonValue>"
      :field-key="key"
      :path="childPath(key)"
      :depth="depth + 1"
    />
  </fieldset>

  <span v-else class="help">{{ label }}：无法识别的值（{{ String(value) }}）</span>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 14px;
}
.row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.check {
  margin-bottom: 8px;
}
.name {
  font-size: 0.86rem;
  font-weight: 500;
}
.mono {
  font-family: var(--mono);
  font-size: 0.82rem;
  font-weight: 400;
}
.help {
  font-size: 0.76rem;
  color: var(--muted);
  line-height: 1.5;
}
.err {
  font-size: 0.76rem;
  color: var(--err-fg);
}
input[type='text'],
input:not([type]),
input[type='number'],
select,
textarea {
  padding: 8px 10px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--field);
  color: inherit;
  font: inherit;
  font-size: 0.87rem;
  width: 100%;
}
textarea {
  font-family: var(--mono);
  font-size: 0.8rem;
  line-height: 1.6;
  resize: vertical;
}
input:focus,
select:focus,
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
input[type='checkbox'] {
  width: auto;
  flex: none;
  margin: 0;
}
.group {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px 14px 4px;
  margin: 0 0 14px;
}
.group.nested {
  border-color: transparent;
  border-left: 2px solid var(--line);
  border-radius: 0;
  padding-left: 12px;
  padding-right: 0;
}
legend {
  font-size: 0.86rem;
  font-weight: 600;
  padding: 0 6px;
}
.item {
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 10px;
}
.item-head {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}
.index {
  font-size: 0.76rem;
  color: var(--muted);
  font-family: var(--mono);
}
button.mini {
  margin-left: auto;
  font: inherit;
  font-size: 0.76rem;
  padding: 3px 9px;
  border-radius: 6px;
  border: 1px solid var(--line);
  background: var(--field);
  color: inherit;
  cursor: pointer;
}
button.mini:hover {
  border-color: var(--accent);
}
</style>
