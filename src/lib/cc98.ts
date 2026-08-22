// =============================================================================
// cc98.ts — CC98 跳转链接构造
//
// CC98 是浙大校园内网论坛（www.cc98.org，仅校园网可直连），部署服务器通常
// 无法直连；链接由用户浏览器打开，因此本模块只负责保证 href 结构与 CC98 线上
// 前端期望的格式逐字节一致。
//
// 线上真实格式（由浏览器顶栏实测确认，搜「微经」后地址栏即为）：
//   https://www.cc98.org/search?boardId=0&keyword=%25E5%25BE%25AE%25E7%25BB%258F
// 即：path=/search，参数 boardId=0（全站搜索）+ keyword=<UTF-8 二次 URL 编码>。
//
// 为什么是二次编码：浏览器/URLSearchParams 在读出查询参数时已解码一次，而线上
// /search 路由会对 keyword 再做一次 decodeURIComponent，因此 URL 里必须携带
// 二次编码后的 keyword，最终才能还原成原文去搜。二次编码 = encodeURIComponent
// 两次：encodeURIComponent(encodeURIComponent(keyword))。
//
// 注意：GitHub 公开仓库 ZJU-CC98/CC98-V4 里的旧版逻辑（?type=all&keyword=<一次
// 编码>）已与线上不一致——该仓库最后提交停在 2023-08-31，线上是新版本。以顶栏
// 实测格式为准，不要退回旧版写法。
// =============================================================================

/** CC98 站点根地址；可用 .env 的 NEXT_PUBLIC_CC98_BASE_URL 覆盖（client 组件构建期内联）。 */
export const CC98_BASE_URL: string =
  process.env.NEXT_PUBLIC_CC98_BASE_URL || "https://www.cc98.org";

/**
 * 构造 CC98 全站主题搜索链接（真题回忆 / 讨论 / 经验帖）。
 * 与线上顶栏实测格式一致：/search?boardId=0&keyword=<二次编码>。
 */
export function buildCC98SearchUrl(keyword: string): string {
  return `${CC98_BASE_URL}/search?boardId=0&keyword=${encodeURIComponent(
    encodeURIComponent(keyword),
  )}`;
}
