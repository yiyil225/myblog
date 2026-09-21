/**
 * src/config.ts 里每个字段的中文标签和控件提示。
 *
 * 没在这里登记的字段不会被丢弃 —— 表单会用它推导出的控件兜底渲染，
 * 只是标签显示成原始字段名。所以新增主题配置项不需要改这个文件也能用。
 */
import type { JsonValue } from './configFile'

export type FieldControl = 'auto' | 'idOrFalse' | 'select' | 'multi' | 'json'

export type FieldMeta = {
  label?: string
  help?: string
  control?: FieldControl
  /** control 为 select 时的选项 */
  options?: string[]
  /** control 为 multi 时的选项；数组里出现别的值也不会被丢掉 */
  choices?: string[]
  /** 用多行输入框 */
  long?: boolean
  /** 空数组「添加一项」时用的模板 */
  shape?: Record<string, JsonValue>
}

/** 顶层分组的中文名，按 config.ts 里的顺序展示。 */
export const SECTION_LABELS: Record<string, string> = {
  site: '站点信息',
  sidebar: '侧边栏',
  widgets: '侧边栏组件',
  menu: '导航菜单',
  banner: '首页横幅',
  banner_srcset: '横幅响应式图片',
  footer: '页脚',
  analytics: '访问统计',
  social: '社交链接',
  valine: '评论 · Valine',
  waline: '评论 · Waline',
  gitalk: '评论 · Gitalk',
  giscus: '评论 · Giscus',
  utterances: '评论 · utterances',
  twikoo: '评论 · Twikoo',
  disqus: '评论 · Disqus',
  friend: '友情链接',
  copyright: '版权声明',
  preloader: '加载动画',
  firework: '鼠标烟花',
  home_categories: '首页分类卡片',
  triangle_badge: '三角徽章',
  outdate: '文章过时提示',
  share: '分享按钮',
  sponsor: '赞助',
}

export const SECTION_NOTES: Record<string, string> = {
  widgets: '同时勾选的组件会按顺序从上往下排列。',
  analytics: '留空表示不启用。填的是各平台的统计 ID，不是 true。',
  social: '只填你要暴露的。留空的不会被写进配置文件。',
  valine: '启用前需要先在 LeanCloud 建应用。',
  waline: 'Waline 需要一个自己的服务端地址，填在 serverURL。',
  gitalk: '需要先在 GitHub 建一个存评论的仓库并创建 OAuth App。',
  giscus: 'repoId 和 categoryId 要去 giscus.app 生成。',
  utterances: '仓库必须是公开的，且装了 utterances 的 GitHub App。',
  twikoo: '腾讯云环境填 envId，Vercel 环境填完整地址。',
  disqus: '国内访问可能不稳定。',
  firework: 'options 是 mouse-firework 的原生配置，结构较深，这里只暴露开关。',
  share: '不勾选的平台不会出现在文章底部。',
  sponsor: '启用前先在 public/sponsor/ 放好收款码图片。',
}

export const FIELD_META: Record<string, FieldMeta> = {
  // ── site ──────────────────────────────────────────────
  'site.title': { label: '站点标题', help: '显示在浏览器标签页和首页大标题。' },
  'site.subtitle': { label: '副标题' },
  'site.description': { label: '站点描述', help: '给搜索引擎看的摘要。' },
  'site.keywords': { label: '关键词', help: '给搜索引擎看，逗号分隔。' },
  'site.author': { label: '作者' },
  'site.language': {
    label: '界面语言',
    control: 'select',
    options: ['zh-CN', 'zh-TW', 'en', 'ja'],
    help: '只有这四种有翻译文件。',
  },

  // ── sidebar ───────────────────────────────────────────
  'sidebar.avatar': { label: '头像图片路径', help: '放在 public/images/ 下，写成 /images/xxx.webp。' },
  'sidebar.position': { label: '侧边栏位置', control: 'select', options: ['left', 'right'] },

  // ── widgets ───────────────────────────────────────────
  widgets: {
    label: '启用的侧边栏组件',
    control: 'multi',
    choices: ['recent_posts', 'category', 'tag', 'tagcloud'],
  },

  // ── banner ────────────────────────────────────────────
  banner: { label: '横幅图片', help: '本地路径或完整 https 链接。' },
  'banner_srcset.enable': { label: '启用响应式横幅' },
  'banner_srcset.srcset': { label: '响应式图片列表', help: '每项由 src 和 media 查询组成。' },

  // ── footer ────────────────────────────────────────────
  'footer.since': { label: '建站年份', help: '页脚会显示「since 年份」，自动补到当前年。' },
  'footer.powered': { label: '显示 Powered by' },
  'footer.count': { label: '显示站点统计' },
  'footer.busuanzi': { label: '启用不蒜子统计' },
  'footer.icp.icpnumber': { label: 'ICP 备案号' },
  'footer.icp.beian': { label: '公安备案号' },
  'footer.icp.recordcode': { label: '备案查询代码' },
  'footer.moe_icp.icpnumber': { label: '萌 ICP 备案号' },

  // ── analytics ─────────────────────────────────────────
  'analytics.baidu_analytics': {
    label: '百度统计 ID',
    control: 'idOrFalse',
    help: '留空关闭。',
  },
  'analytics.google_analytics': {
    label: 'Google Analytics ID',
    control: 'idOrFalse',
    help: '形如 G-XXXXXXXXXX。留空关闭。',
  },
  'analytics.clarity': { label: 'Microsoft Clarity ID', control: 'idOrFalse', help: '留空关闭。' },

  // ── footer / copyright ────────────────────────────────
  'copyright.enable': { label: '启用版权声明' },
  'copyright.content.author': { label: '显示作者' },
  'copyright.content.link': { label: '显示原文链接' },
  'copyright.content.title': { label: '显示文章标题' },
  'copyright.content.date': { label: '显示发布日期' },
  'copyright.content.updated': { label: '显示更新日期' },
  'copyright.content.license': { label: '显示许可协议' },
  'copyright.content.license_type': {
    label: '许可协议类型',
    control: 'select',
    options: ['by', 'by-sa', 'by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd'],
  },

  // ── preloader ─────────────────────────────────────────
  'preloader.enable': { label: '启用加载动画' },
  'preloader.text': { label: '加载提示文字' },
  'preloader.rotate': { label: '图标旋转' },

  // ── firework ──────────────────────────────────────────
  'firework.enable': { label: '启用鼠标烟花' },
  'firework.disable_on_mobile': { label: '移动端禁用' },
  'firework.options': {
    label: '烟花参数',
    control: 'json',
    help: 'mouse-firework 的原生配置，结构较深，直接编辑 JSON。',
  },

  // ── home_categories ───────────────────────────────────
  'home_categories.enable': { label: '在首页显示分类卡片' },
  'home_categories.content': { label: '分类卡片', help: '每项填一个分类名，留空表示全部。' },

  // ── triangle_badge ────────────────────────────────────
  'triangle_badge.enable': { label: '启用三角徽章' },
  'triangle_badge.type': { label: '徽章类型', control: 'select', options: ['github'] },
  'triangle_badge.link': { label: '徽章链接' },

  // ── outdate ───────────────────────────────────────────
  'outdate.enable': { label: '启用过时提示' },
  'outdate.daysAgo': { label: '判定天数', help: '超过这么多天没更新就提示。' },

  // ── share ─────────────────────────────────────────────
  share: {
    label: '分享平台',
    control: 'multi',
    choices: ['weibo', 'twitter', 'facebook', 'linkedin', 'reddit', 'qq', 'weixin'],
  },

  // ── sponsor ───────────────────────────────────────────
  'sponsor.enable': { label: '启用赞助' },
  'sponsor.qr': {
    label: '收款码',
    help: '每项由 name 和 src 组成，图片放 public/sponsor/ 下。',
    shape: { name: '', src: '' },
  },

  // ── 评论系统 ───────────────────────────────────────────
  'valine.enable': { label: '启用 Valine' },
  'valine.appId': { label: 'App ID' },
  'valine.appKey': { label: 'App Key' },
  'valine.pageSize': { label: '每页条数' },
  'valine.avatar': { label: '头像风格' },
  'valine.lang': { label: '语言', control: 'select', options: ['zh-cn', 'en'] },
  'valine.placeholder': { label: '输入框提示文字' },
  'valine.guest_info': { label: '访客信息字段' },
  'valine.recordIP': { label: '记录 IP' },
  'valine.highlight': { label: '代码高亮' },
  'valine.visitor': { label: '显示访问量' },
  'valine.serverURLs': { label: 'LeanCloud 服务器地址' },

  'waline.enable': { label: '启用 Waline' },
  'waline.serverURL': { label: '服务端地址', help: '例如 https://waline.你的域名.workers.dev' },
  'waline.lang': { label: '语言' },
  'waline.locale': {
    label: '自定义文案',
    control: 'json',
    help: '覆盖界面文案的键值对，{} 表示用默认。',
  },
  'waline.emoji': { label: '表情包地址列表' },
  'waline.meta': { label: '评论者信息字段' },
  'waline.requiredMeta': { label: '必填字段' },
  'waline.wordLimit': { label: '字数上限', help: '0 表示不限制。' },
  'waline.pageSize': { label: '每页条数' },
  'waline.pageview': { label: '显示阅读量' },

  'gitalk.enable': { label: '启用 Gitalk' },
  'gitalk.clientID': { label: 'Client ID' },
  'gitalk.clientSecret': { label: 'Client Secret' },
  'gitalk.repo': { label: '存评论的仓库名' },
  'gitalk.owner': { label: '仓库所有者' },
  'gitalk.admin': { label: '管理员用户名列表' },

  'giscus.enable': { label: '启用 Giscus' },
  'giscus.repo': { label: '仓库', help: '格式 owner/repo。' },
  'giscus.repoId': { label: 'Repo ID' },
  'giscus.category': { label: 'Discussion 分类名' },
  'giscus.categoryId': { label: 'Category ID' },
  'giscus.mapping': {
    label: '页面与 discussion 的映射',
    control: 'select',
    options: ['pathname', 'url', 'title', 'og:title', 'specific', 'number'],
  },
  'giscus.strict': { label: '严格匹配标题' },
  'giscus.reactionsEnabled': { label: '启用表情回应' },
  'giscus.emitMetadata': { label: '发送元数据' },
  'giscus.inputPosition': { label: '输入框位置', control: 'select', options: ['top', 'bottom'] },

  'utterances.enable': { label: '启用 utterances' },
  'utterances.repo': { label: '仓库', help: '格式 owner/repo。' },
  'utterances.issue_term': {
    label: 'issue 映射方式',
    control: 'select',
    options: ['pathname', 'url', 'title', 'og:title', 'issue-number'],
  },
  'utterances.theme': { label: '主题' },

  'twikoo.enable': { label: '启用 Twikoo' },
  'twikoo.envId': { label: '环境 ID / 地址' },
  'twikoo.region': { label: '地域', help: '腾讯云环境才需要，例如 ap-shanghai。' },

  'disqus.enable': { label: '启用 Disqus' },
  'disqus.shortname': { label: 'Shortname' },
  'disqus.count': { label: '显示评论数' },

  // ── friend ────────────────────────────────────────────
  friend: { label: '友链列表', help: '每项由 name、url、desc、avatar 组成。' },
}

// social 下面所有键在源码里都是注释状态，这里统一给一份标签。
const SOCIAL_LABELS: Record<string, string> = {
  email: '邮箱',
  github: 'GitHub',
  google: 'Google',
  twitter: 'Twitter / X',
  facebook: 'Facebook',
  instagram: 'Instagram',
  linkedin: 'LinkedIn',
  pinterest: 'Pinterest',
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  flickr: 'Flickr',
  dribbble: 'Dribbble',
  behance: 'Behance',
  bilibili: '哔哩哔哩',
  weibo: '微博',
  zhihu: '知乎',
  reddit: 'Reddit',
  tumblr: 'Tumblr',
  medium: 'Medium',
  deviantart: 'DeviantArt',
  keybase: 'Keybase',
  telegram: 'Telegram',
  discord: 'Discord',
  steam: 'Steam',
}

/** social 分组里允许出现的键，按这个顺序渲染。 */
export const SOCIAL_KEYS = Object.keys(SOCIAL_LABELS)

export function labelFor(path: string[], key: string): string {
  const dotted = path.length ? `${path.join('.')}.${key}` : key
  const direct = FIELD_META[dotted]?.label
  if (direct) return direct

  const parent = path.join('.')
  // 数组元素没有固定路径，用父级的标签。
  if (/^\d+$/.test(key)) {
    return FIELD_META[parent]?.label ?? `第 ${Number(key) + 1} 项`
  }
  if (parent === 'social' || (path[path.length - 1] === 'social' && SOCIAL_LABELS[key])) {
    return SOCIAL_LABELS[key]
  }
  return key
}

export function metaFor(path: string[], key: string): FieldMeta {
  const dotted = path.length ? `${path.join('.')}.${key}` : key
  if (FIELD_META[dotted]) return FIELD_META[dotted]
  if (path[path.length - 1] === 'social' || path.includes('social')) {
    return {
      label: SOCIAL_LABELS[key] ?? key,
      control: 'auto',
      help: '填完整链接，留空表示不显示。',
    }
  }
  return { label: labelFor(path, key) }
}
