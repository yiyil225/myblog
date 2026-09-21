<script setup lang="ts">
/**
 * 站点配置表单。
 *
 * 直接编辑 src/config.ts 这个 TypeScript 模块：读原文 → 解析成字面量树 →
 * 表单只改值 → 保存时只把变化的区间写回。注释和排版都保留。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import {
  applyChanges,
  diffPaths,
  parseConfigSource,
  toPlain,
  type Change,
  type JsonValue,
  type ParsedConfig,
} from './configFile'
import { commitFileText, explainError, readFileText, type RepoConfig } from './github'
import { SECTION_LABELS, SECTION_NOTES, SOCIAL_KEYS } from './fieldMeta'
import FieldEditor from './FieldEditor.vue'

const CONFIG_PATH = 'src/config.ts'

const props = defineProps<{ repo: RepoConfig }>()

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const loaded = ref(false)

let parsed: ParsedConfig | null = null
let sourceText = ''
const sha = ref('')

const baseline = ref<Record<string, JsonValue>>({})
const draft = reactive<Record<string, JsonValue>>({})

/** 配置值都是 JSON 安全的，用 JSON 克隆可以避开 reactive 代理的问题。 */
function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/**
 * social 那一节在源码里所有键都是注释状态，解析结果是个空对象。
 * 这里把已知的键补成空串，表单才能渲染；空串在保存时会被翻译成「删除该键」。
 */
function materialize(config: Record<string, JsonValue>): Record<string, JsonValue> {
  const social = { ...((config.social as Record<string, JsonValue>) ?? {}) }
  for (const key of SOCIAL_KEYS) if (!(key in social)) social[key] = ''
  return { ...config, social }
}

async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const file = await readFileText(props.repo, CONFIG_PATH)
    sourceText = file.text
    sha.value = file.sha
    parsed = parseConfigSource(file.text)

    const plain = toPlain(parsed.node) as Record<string, JsonValue>
    baseline.value = materialize(plain)

    for (const key of Object.keys(draft)) delete draft[key]
    Object.assign(draft, clone(baseline.value))
    loaded.value = true
  } catch (cause) {
    loaded.value = false
    error.value = explainError(cause, props.repo)
  } finally {
    loading.value = false
  }
}

onMounted(load)

function reset(): void {
  for (const key of Object.keys(draft)) delete draft[key]
  Object.assign(draft, clone(baseline.value))
  notice.value = ''
  error.value = ''
}

const sections = computed(() => Object.keys(draft))

function isObject(value: JsonValue | undefined): value is Record<string, JsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 空字符串对 social 来说意味着「不显示这个链接」。
 * 但主题会遍历所有存在的键去渲染图标，写空串会产生一个破图链接，
 * 所以把它转成删除操作。
 */
function normalize(changes: Change[]): Change[] {
  return changes.map((change) => {
    const isSocialKey = change.path.length === 2 && change.path[0] === 'social'
    if (isSocialKey && !('remove' in change) && change.value === '') {
      return { path: change.path, remove: true } as Change
    }
    return change
  })
}

const pending = computed<Change[]>(() =>
  loaded.value ? normalize(diffPaths(baseline.value, clone(draft))) : [],
)

const pendingSummary = computed(() =>
  pending.value
    .slice(0, 5)
    .map((change) => change.path.join('.'))
    .join('、'),
)

async function save(): Promise<void> {
  if (!parsed || !pending.value.length) return
  saving.value = true
  error.value = ''
  notice.value = ''

  try {
    const changes = pending.value
    const nextText = applyChanges(sourceText, parsed, changes)

    // 自检：写回的内容必须能重新解析，且解析结果和表单完全一致。
    // 不一致就宁可报错，也不要提交一个改坏了的配置文件。
    const verify = toPlain(parseConfigSource(nextText).node) as Record<string, JsonValue>
    const drift = diffPaths(verify, clone(draft)).filter(
      // social 的空串在文件里表现为「键不存在」，这是预期差异。
      (change) => !(change.path.length === 2 && change.path[0] === 'social'),
    )
    if (drift.length) {
      throw new Error(
        `写回自检失败，有 ${drift.length} 处不一致：${drift
          .slice(0, 3)
          .map((change) => change.path.join('.'))
          .join('、')}。没有提交，请把这条信息反馈。`,
      )
    }

    const result = await commitFileText(props.repo, {
      path: CONFIG_PATH,
      sha: sha.value,
      text: nextText,
      message: `chore(config): update ${changes.length} setting${changes.length > 1 ? 's' : ''}`,
    })

    await load()
    notice.value = `已提交 ${changes.length} 处改动：${result.path}`
  } catch (cause) {
    error.value = cause instanceof Error && cause.message.startsWith('写回自检失败')
      ? cause.message
      : `提交失败：${explainError(cause, props.repo)}`
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="config">
    <div class="toolbar">
      <button
        type="button"
        class="primary"
        :disabled="!loaded || saving || !pending.length"
        @click="save"
      >
        {{ saving ? '提交中…' : pending.length ? `保存 ${pending.length} 处改动` : '保存' }}
      </button>
      <button type="button" :disabled="!loaded || saving || loading" @click="load">
        {{ loading ? '读取中…' : '重新读取' }}
      </button>
      <button type="button" :disabled="!loaded || saving || !pending.length" @click="reset">
        放弃改动
      </button>
      <span class="where">{{ CONFIG_PATH }}</span>
    </div>

    <p v-if="error" class="alert err">{{ error }}</p>
    <p v-else-if="notice" class="alert ok">{{ notice }}</p>

    <p v-if="pending.length" class="pending">
      待提交：{{ pendingSummary }}<span v-if="pending.length > 5"> 等 {{ pending.length }} 处</span>
    </p>

    <p v-if="loading && !loaded" class="note">正在读取 {{ CONFIG_PATH }}…</p>

    <details v-for="(section, index) in sections" :key="section" :open="index === 0">
      <summary>{{ SECTION_LABELS[section] ?? section }}</summary>
      <p v-if="SECTION_NOTES[section]" class="note">{{ SECTION_NOTES[section] }}</p>

      <template v-if="isObject(draft[section])">
        <FieldEditor
          v-for="key in Object.keys(draft[section] as object)"
          :key="key"
          :container="draft[section] as Record<string, JsonValue>"
          :field-key="key"
          :path="[section]"
          :depth="1"
        />
      </template>
      <FieldEditor
        v-else
        :container="draft"
        :field-key="section"
        :path="[]"
        :depth="0"
        hide-label
      />
    </details>
  </div>
</template>

<style scoped>
.config {
  display: flex;
  flex-direction: column;
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.where {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 0.78rem;
  color: var(--muted);
}
.alert {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 0.86rem;
  margin: 0 0 14px;
  white-space: pre-wrap;
}
.err {
  background: var(--err-bg);
  color: var(--err-fg);
}
.ok {
  background: var(--ok-bg);
  color: var(--ok-fg);
}
.pending {
  margin: 0 0 14px;
  font-size: 0.82rem;
  color: var(--muted);
  font-family: var(--mono);
}
.note {
  margin: 0 0 12px;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.6;
}
details {
  border: 1px solid var(--line);
  border-radius: 10px;
  margin-bottom: 10px;
  padding: 0 14px;
}
details[open] {
  padding-bottom: 14px;
}
summary {
  cursor: pointer;
  padding: 11px 0;
  font-size: 0.9rem;
  font-weight: 600;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
summary::before {
  content: '▸';
  display: inline-block;
  width: 1.1em;
  color: var(--muted);
  transition: transform 0.12s;
}
details[open] > summary::before {
  transform: rotate(90deg);
}
button {
  font: inherit;
  font-size: 0.86rem;
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: var(--field);
  color: inherit;
  cursor: pointer;
}
button:hover:not(:disabled) {
  border-color: var(--accent);
}
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
</style>
