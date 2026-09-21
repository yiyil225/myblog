/**
 * 后台的默认连接参数。
 *
 * 改这里，界面上就不用每次手打仓库信息。只影响首次打开时输入框里的初值，
 * 用户在界面上改过的值存在浏览器 localStorage 里，优先于这里。
 */
export const DEFAULT_REPO = {
  owner: 'yiyil225',
  repo: 'myblog',
  branch: 'main',
} as const
