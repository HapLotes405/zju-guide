// 求是学径品牌 logo：书本（学）+ 上升路径曲线与节点（径）
// 双色：书本用 currentColor，路径用 var(--app-primary-light)
export function QiushiMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 32" fill="none" aria-hidden="true">
      <path
        d="M6 8 L18 4.5 L32 10 L46 4.5 L58 8 V26 L46 22.5 L32 28 L18 22.5 L6 26 Z M32 10 V28"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M13 21 C19 20 22 13.5 28 13 C34 12.5 38.5 14 46 9.5"
        stroke="var(--app-primary-light)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="46" cy="9.5" r="2.3" fill="var(--app-primary-light)" />
    </svg>
  );
}
