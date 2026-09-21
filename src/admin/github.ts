/**
 * GitHub Contents API client for the /admin editor.
 *
 * Everything the admin writes lands in the repo as a markdown file under
 * `src/content/blog`. The push then triggers the Cloudflare Pages rebuild,
 * so no database is involved.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'

const API = 'https://api.github.com'

/** Must match the `base` of the blog collection in src/content.config.ts. */
export const CONTENT_DIR = 'src/content/blog'

/** The theme's glob loader skips files starting with `_`, so `_foo.md` is a draft. */
export const DRAFT_PREFIX = '_'

export type RepoConfig = {
  owner: string
  repo: string
  branch: string
  token: string
}

export type PostFile = {
  name: string
  path: string
  sha: string
  draft: boolean
}

/** A post as it exists on disk: frontmatter object + markdown body. */
export type PostDoc = {
  /** Repo path, e.g. `src/content/blog/first-post.md`. Empty for a new post. */
  path: string
  /** Blob sha, needed by the API to replace an existing file. Empty for a new post. */
  sha: string
  data: Record<string, unknown>
  body: string
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function fromBase64(encoded: string): string {
  const binary = atob(encoded.replace(/\s/g, ''))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

/** A GitHub API failure that keeps the HTTP status available for diagnosis. */
export class GitHubError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'GitHubError'
    this.status = status
  }
}

async function request<T>(
  cfg: RepoConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${cfg.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const parsed = JSON.parse(await response.text()) as { message?: string }
      if (parsed.message) message = `${message} — ${parsed.message}`
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new GitHubError(response.status, message)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** Turn a GitHub failure into something that names the actual next step. */
export function explainError(error: unknown, cfg: RepoConfig): string {
  if (!(error instanceof GitHubError)) {
    return `请求没发出去：${(error as Error).message}。检查网络，或浏览器是否拦住了 api.github.com。`
  }

  switch (error.status) {
    case 401:
      return 'Token 无效或已过期。去 https://github.com/settings/personal-access-tokens 重新生成一个。'
    case 403:
      return 'Token 权限不足，或触发了 GitHub 限流。确认这个 token 的 Contents 权限是 Read and write，并且已授权该仓库。'
    case 404:
      return `GitHub 上找不到 ${cfg.owner}/${cfg.repo} 的这个路径。最常见的原因：仓库还没有任何提交。先在终端跑 git push -u origin main。`
    case 409:
      return '仓库是空的。先把代码 push 上去。'
    case 422:
      return '提交被拒绝，通常是同一个文件同时被改动。刷新后重试。'
    default:
      return `GitHub 返回 ${error.status}：${error.message}`
  }
}

export type ProbeStep = {
  label: string
  ok: boolean
  detail: string
}

/**
 * Check the connection one level at a time, so a failure points at the exact
 * layer that broke instead of a single opaque 404.
 */
export async function probe(cfg: RepoConfig): Promise<ProbeStep[]> {
  const steps: ProbeStep[] = []

  let repo: {
    full_name: string
    private: boolean
    default_branch: string
    permissions?: { push?: boolean }
  }

  try {
    repo = await request(cfg, `/repos/${cfg.owner}/${cfg.repo}`)
  } catch (error) {
    return [{ label: `仓库 ${cfg.owner}/${cfg.repo}`, ok: false, detail: explainError(error, cfg) }]
  }

  steps.push({
    label: `仓库 ${repo.full_name}`,
    ok: true,
    detail: `${repo.private ? '私有' : '公开'} · 默认分支 ${repo.default_branch}`,
  })

  const canPush = repo.permissions?.push === true
  steps.push({
    label: 'Token 写权限',
    ok: canPush,
    detail: canPush
      ? '可以提交文件'
      : '没有写权限。确认 token 的 Contents 权限是 Read and write，并且授权了这个仓库',
  })

  try {
    await request(cfg, `/repos/${cfg.owner}/${cfg.repo}/branches/${encodeURIComponent(cfg.branch)}`)
    steps.push({ label: `分支 ${cfg.branch}`, ok: true, detail: '存在' })
  } catch (error) {
    steps.push({ label: `分支 ${cfg.branch}`, ok: false, detail: explainError(error, cfg) })
  }

  try {
    const entries = await request<unknown[]>(
      cfg,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${CONTENT_DIR}?ref=${encodeURIComponent(cfg.branch)}`,
    )
    const count = Array.isArray(entries) ? entries.length : 0
    steps.push({ label: `目录 ${CONTENT_DIR}`, ok: true, detail: `${count} 个条目` })
  } catch (error) {
    steps.push({ label: `目录 ${CONTENT_DIR}`, ok: false, detail: explainError(error, cfg) })
  }

  return steps
}

type ContentsEntry = {
  name: string
  path: string
  sha: string
  type: 'file' | 'dir' | 'symlink' | 'submodule'
}

export async function listPosts(cfg: RepoConfig): Promise<PostFile[]> {
  const entries = await request<ContentsEntry[]>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${CONTENT_DIR}?ref=${encodeURIComponent(cfg.branch)}`,
  )

  return entries
    .filter((entry) => entry.type === 'file' && /\.mdx?$/i.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      sha: entry.sha,
      draft: entry.name.startsWith(DRAFT_PREFIX),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

type ContentsFile = {
  content: string
  sha: string
  encoding: string
}

export async function readPost(cfg: RepoConfig, path: string): Promise<PostDoc> {
  const file = await request<ContentsFile>(
    cfg,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`,
  )
  const raw = fromBase64(file.content)
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)

  // A post without frontmatter would fail the collection schema, but do not
  // silently drop the author's text: keep the whole file as the body.
  if (!match) return { path, sha: file.sha, data: {}, body: raw }

  const parsed = parseYaml(match[1])
  return {
    path,
    sha: file.sha,
    data: (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>,
    body: raw.slice(match[0].length),
  }
}

export function serializePost(doc: PostDoc): string {
  const frontmatter = stringifyYaml(doc.data, { lineWidth: 0 }).trimEnd()
  return `---\n${frontmatter}\n---\n\n${doc.body.replace(/^\n+/, '')}`
}

export function postPath(slug: string, draft: boolean, extension: 'md' | 'mdx'): string {
  const clean = slug.trim().replace(/^_+/, '').replace(/\.mdx?$/i, '')
  return `${CONTENT_DIR}/${draft ? DRAFT_PREFIX : ''}${clean}.${extension}`
}

/** What the editor component hands back to the app shell on submit. */
export type SavePayload = {
  doc: PostDoc
  slug: string
  draft: boolean
  extension: 'md' | 'mdx'
}

export type CommitResult = {
  path: string
  htmlUrl: string
  commitUrl: string
}

export async function savePost(
  cfg: RepoConfig,
  doc: PostDoc,
  message: string,
): Promise<CommitResult> {
  const body: Record<string, unknown> = {
    message,
    content: toBase64(serializePost(doc)),
    branch: cfg.branch,
  }
  // Without the previous sha the API creates a new file and rejects the call
  // when one already exists at that path.
  if (doc.sha) body.sha = doc.sha

  const result = await request<{
    content: { path: string; html_url: string } | null
    commit: { html_url: string }
  }>(cfg, `/repos/${cfg.owner}/${cfg.repo}/contents/${doc.path}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })

  return {
    path: doc.path,
    htmlUrl: result.content?.html_url ?? '',
    commitUrl: result.commit?.html_url ?? '',
  }
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .trim()
    // Keep CJK: a Chinese title should still produce a readable URL segment.
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return slug || `post-${Date.now()}`
}

/** `2026-01-15` — the collection schema coerces strings to Date. */
export function today(): string {
  return new Date().toISOString().slice(0, 10)
}
