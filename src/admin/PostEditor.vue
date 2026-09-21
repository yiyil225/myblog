<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { postPath, slugify, today, type PostDoc, type SavePayload } from './github'

const props = defineProps<{
  doc: PostDoc
  isNew: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: SavePayload): void
  (event: 'cancel'): void
}>()

/** Serialized frontmatter reads better when the common fields come first. */
const FIELD_ORDER = [
  'title',
  'description',
  'pubDate',
  'updatedDate',
  'tags',
  'categories',
  'cover',
  'author',
]

const form = reactive({
  title: '',
  description: '',
  pubDate: today(),
  updatedDate: '',
  tags: '',
  categories: '',
  cover: '',
  author: '',
  slug: '',
  draft: false,
  extension: 'md' as 'md' | 'mdx',
  body: '',
})

function toList(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'string') return value
  return ''
}

function toLines(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.length >= 10 ? value.slice(0, 10) : value
}

function init() {
  const data = props.doc.data
  form.title = typeof data.title === 'string' ? data.title : ''
  form.description = typeof data.description === 'string' ? data.description : ''
  form.pubDate = toLines(data.pubDate) || today()
  form.updatedDate = toLines(data.updatedDate)
  form.tags = toList(data.tags)
  form.categories = toList(data.categories)
  form.cover = typeof data.cover === 'string' ? data.cover : ''
  form.author = typeof data.author === 'string' ? data.author : ''
  form.body = props.doc.body
  form.draft = props.doc.path.split('/').pop()?.startsWith('_') ?? false
  form.extension = props.doc.path.endsWith('.mdx') ? 'mdx' : 'md'
  form.slug = props.doc.path
    ? (props.doc.path.split('/').pop() ?? '').replace(/^_+/, '').replace(/\.mdx?$/i, '')
    : ''
}

let slugTouched = false

function markSlugTouched() {
  slugTouched = true
}

watch(() => props.doc, init, { immediate: true })

// Fill the slug from the title until the author edits it themselves.
watch(
  () => form.title,
  (title) => {
    if (props.isNew && !slugTouched) form.slug = slugify(title)
  },
)

const targetPath = computed(() =>
  postPath(form.slug || slugify(form.title), form.draft, form.extension),
)

const valid = computed(
  () => form.title.trim().length > 0 && form.description.trim().length > 0 && form.pubDate.length > 0,
)

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function setOrDelete(data: Record<string, unknown>, key: string, value: unknown) {
  const empty =
    value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)
  if (empty) delete data[key]
  else data[key] = value
}

function build(): SavePayload {
  // Spread the original so keys the form does not surface (comment, sponsor,
  // toc, copyright, …) survive a round trip through the editor.
  const data: Record<string, unknown> = { ...props.doc.data }

  data.title = form.title.trim()
  data.description = form.description.trim()
  data.pubDate = form.pubDate
  setOrDelete(data, 'updatedDate', form.updatedDate)
  setOrDelete(data, 'tags', splitList(form.tags))
  setOrDelete(data, 'categories', splitList(form.categories))
  setOrDelete(data, 'cover', form.cover.trim())
  setOrDelete(data, 'author', form.author.trim())

  const ordered: Record<string, unknown> = {}
  for (const key of FIELD_ORDER) if (key in data) ordered[key] = data[key]
  for (const [key, value] of Object.entries(data)) if (!(key in ordered)) ordered[key] = value

  return {
    doc: { path: props.doc.path, sha: props.doc.sha, data: ordered, body: form.body },
    slug: form.slug,
    draft: form.draft,
    extension: form.extension,
  }
}

function submit() {
  if (!valid.value || props.saving) return
  emit('save', build())
}

const bodyStats = computed(() => {
  const text = form.body.trim()
  const words = text ? text.split(/\s+/).length : 0
  return `${text.length} 字符 · 约 ${words} 词`
})
</script>

<template>
  <form class="editor" @submit.prevent="submit">
    <div class="head">
      <strong>{{ isNew ? '新建文章' : `编辑 ${doc.path.split('/').pop()}` }}</strong>
      <span class="stats">{{ bodyStats }}</span>
    </div>

    <label class="full">
      标题
      <input v-model="form.title" placeholder="文章标题" />
    </label>

    <label class="full">
      描述
      <input v-model="form.description" placeholder="一句话摘要" />
    </label>

    <div class="row">
      <label>
        发布日期
        <input v-model="form.pubDate" type="date" />
      </label>
      <label>
        更新日期
        <input v-model="form.updatedDate" type="date" />
      </label>
    </div>

    <div class="row">
      <label>
        标签
        <input v-model="form.tags" placeholder="astro, vue" />
      </label>
      <label>
        分类
        <input v-model="form.categories" placeholder="Blog, Tutorial" />
      </label>
    </div>

    <div class="row">
      <label>
        封面图 URL
        <input v-model="form.cover" placeholder="https://... 可留空" />
      </label>
      <label>
        作者
        <input v-model="form.author" placeholder="可留空" />
      </label>
    </div>

    <fieldset v-if="isNew" class="file">
      <legend>文件名</legend>
      <label>
        路径片段
        <input v-model="form.slug" @input="markSlugTouched" placeholder="my-first-post" />
      </label>
      <label class="inline">
        <input v-model="form.draft" type="checkbox" />
        存为草稿（文件名加 <code>_</code> 前缀，构建时跳过）
      </label>
      <label class="inline">
        <input v-model="form.extension" type="radio" value="md" />
        .md
        <input v-model="form.extension" type="radio" value="mdx" />
        .mdx
      </label>
      <p class="path">{{ targetPath }}</p>
    </fieldset>

    <p v-else class="path">{{ doc.path }}</p>

    <label class="full">
      正文（markdown）
      <textarea v-model="form.body" rows="22" placeholder="在这里写正文，支持 markdown 与 mdx。" />
    </label>

    <div class="actions">
      <button type="submit" class="primary" :disabled="!valid || saving">
        {{ saving ? '提交中…' : isNew ? '提交并新建' : '提交修改' }}
      </button>
      <button type="button" :disabled="saving" @click="$emit('cancel')">取消</button>
      <span v-if="!valid" class="warn">标题、描述、发布日期都必填</span>
    </div>
  </form>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 12px;
}
.stats {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.8rem;
}
label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 0.83rem;
  color: var(--muted);
  flex: 1;
}
label.inline {
  flex-direction: row;
  align-items: center;
  gap: 7px;
}
label.full {
  width: 100%;
}
.row {
  display: flex;
  gap: 12px;
}
input[type='text'],
input:not([type]),
input[type='date'],
input[type='password'],
textarea {
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--field);
  color: inherit;
  font: inherit;
  font-size: 0.9rem;
  width: 100%;
}
textarea {
  font-family: var(--mono);
  font-size: 0.85rem;
  line-height: 1.65;
  resize: vertical;
}
input:focus,
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
fieldset.file {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
legend {
  font-size: 0.83rem;
  color: var(--muted);
  padding: 0 6px;
}
.path {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.8rem;
  color: var(--muted);
  background: var(--field);
  padding: 8px 10px;
  border-radius: 7px;
}
.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.warn {
  color: var(--warn-fg);
  font-size: 0.82rem;
}
button {
  font: inherit;
  font-size: 0.88rem;
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
  opacity: 0.5;
  cursor: not-allowed;
}
button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-fg);
}
code {
  font-family: var(--mono);
  background: var(--field);
  padding: 1px 5px;
  border-radius: 4px;
}
</style>
