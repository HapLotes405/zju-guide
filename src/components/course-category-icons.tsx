import type { SVGProps } from "react";

const sharedIconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

// 通识基础：柱廊 —— 宽博的学识基座
export function GeneralEducationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <path d="M4.5 9.5 L12 4.5 L19.5 9.5 Z" />
      <path d="M7.5 10.5 V18.5 M12 10.5 V18.5 M16.5 10.5 V18.5" />
      <path d="M4 20 H20" />
    </svg>
  );
}

// 专业基础：三层堆叠 —— 层层累积的功底
export function MajorFoundationIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <path d="M12 4 L19.5 8.25 L12 12.5 L4.5 8.25 Z" />
      <path d="M4.5 12.5 L12 16.75 L19.5 12.5" />
      <path d="M4.5 16.75 L12 21 L19.5 16.75" />
    </svg>
  );
}

// 专业核心：菱形 + 实心内核
export function MajorCoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <path d="M12 3.5 L20.5 12 L12 20.5 L3.5 12 Z" />
      <path d="M12 8.6 L15.4 12 L12 15.4 L8.6 12 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

// 专业模块选修：模块格 + 选中块
export function MajorModuleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <rect x="4.5" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="4.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="4.5" y="13" width="6.5" height="6.5" rx="1.5" />
      <rect x="13" y="13" width="6.5" height="6.5" rx="1.5" fill="currentColor" fillOpacity=".22" />
    </svg>
  );
}

// 实验实践：烧瓶
export function PracticeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <path d="M9.5 4 H14.5" />
      <path d="M10.5 4 V9.5 L5.8 18.8 C5.4 19.6 6 20.5 7 20.5 H17 C18 20.5 18.6 19.6 18.2 18.8 L13.5 9.5 V4" />
      <path d="M7.8 15.5 H16.2" />
    </svg>
  );
}

// 个性修读：个人剪影 —— 自己的修读路线
export function PersonalizedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...sharedIconProps} {...props}>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 19.5 C5.5 15.8 8.4 13.8 12 13.8 C15.6 13.8 18.5 15.8 18.5 19.5" />
    </svg>
  );
}
