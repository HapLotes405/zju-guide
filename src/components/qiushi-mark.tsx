import { useId } from "react";

// 所有圆弧与动画共用圆心 (678, 640)，保持同心轨道稳定旋转。
export function QiushiMark({ className = "" }: { className?: string }) {
  const id = useId();
  return (
<svg className={className} aria-hidden="true" viewBox="0 0 1256 1256" fill="none">
  <defs>
    <linearGradient id={id + "-outer"} x1="145" y1="160" x2="1080" y2="1100" gradientUnits="userSpaceOnUse">
      <stop stopColor="#79d9ff"/><stop offset=".48" stopColor="#94e8ff"/><stop offset=".75" stopColor="#70f4f4"/><stop offset="1" stopColor="#95e1ff"/>
    </linearGradient>
    <linearGradient id={id + "-blue"} x1="719" y1="310" x2="920" y2="975" gradientUnits="userSpaceOnUse">
      <stop stopColor="#309ff1"/><stop offset=".52" stopColor="#349df2"/><stop offset="1" stopColor="#64d9ff"/>
    </linearGradient>
    <linearGradient id={id + "-cyan"} x1="310" y1="590" x2="820" y2="1030" gradientUnits="userSpaceOnUse">
      <stop stopColor="#62e7f6"/><stop offset=".48" stopColor="#6cf6f3"/><stop offset="1" stopColor="#52edf1"/>
    </linearGradient>
    <linearGradient id={id + "-core"} x1="407" y1="402" x2="959" y2="816" gradientUnits="userSpaceOnUse">
      <stop stopColor="#00bce7"/><stop offset=".42" stopColor="#00b3e8"/><stop offset="1" stopColor="#00d3e4"/>
    </linearGradient>
    <linearGradient id={id + "-fine"} x1="282" y1="459" x2="712" y2="228" gradientUnits="userSpaceOnUse">
      <stop stopColor="#b9f1ff"/><stop offset=".6" stopColor="#b8e7ff"/><stop offset="1" stopColor="#9bdeff"/>
    </linearGradient>
  </defs>
  
  <g className="qiushi-orbit qiushi-orbit-outer" stroke={"url(#" + id + "-outer)"} strokeLinecap="round">
    <path d="M169.866 429.524A550 550 0 0 1 758.346 95.9" strokeWidth="20"/>
    <path d="M1015.454 373.495A430 430 0 0 1 915.958 998.156" strokeWidth="18"/>
    <path d="M149.042 790.678A550 550 0 0 0 738.354 1186.679" strokeWidth="18"/>
  </g>
  <g className="qiushi-orbit qiushi-orbit-fine">

  <path d="M248 640A430 430 0 0 1 713.234 211.446" stroke={"url(#" + id + "-fine)"} strokeWidth="13" strokeLinecap="round"/>
  
</g>
  <g className="qiushi-orbit qiushi-orbit-blue">

  <path d="M727.668 303.647A340 340 0 0 1 632.445 976.934" stroke={"url(#" + id + "-blue)"} strokeWidth="25" strokeLinecap="round"/>
    <circle cx="880.716" cy="367.042" r="32" fill="#00d5e5" stroke="#31edee" strokeWidth="1.5"/>
</g>
  <g className="qiushi-orbit qiushi-orbit-cyan">

  <path d="M283.486 573.981A400 400 0 0 0 927.552 952.608" stroke={"url(#" + id + "-cyan)"} strokeWidth="28" strokeLinecap="round"/>
    <circle cx="425.73" cy="950.419" r="29" fill="#008fef" stroke="#03c6f2" strokeWidth="1.5"/>
</g>
  <g className="qiushi-orbit qiushi-orbit-detail">

  <path d="M360.583 761.845A340 340 0 0 1 683.934 300.052" stroke="#6be5fa" strokeWidth="14" strokeLinecap="round"/>
  <path d="M360.583 761.845A340 340 0 0 1 683.934 300.052" stroke="#c4f4ff" strokeWidth="5" strokeLinecap="round"/>
  
</g>
  <g className="qiushi-orbit qiushi-orbit-core">

  <path d="M628.897 364.339A280 280 0 1 0 954.079 686.695" stroke={"url(#" + id + "-core)"} strokeWidth="42" strokeLinecap="round"/>


  
</g>
  
  <g stroke="#35dfff" strokeWidth="1">
    <path d="m976 172 19 19-19 19-19-19Z" fill="#008de9"/>
    <path d="m930 225 20 20-20 20-20-20Z" fill="#19c9ef"/>
    <path d="m978 231 21 21-21 21-21-21Z" fill="#00e3ee"/>
    <path d="m1033 225 21 21-21 21-21-21Z" fill="#83ddfa"/>
    <path d="m971 276 20 20-20 20-20-20Z" fill="#00d7e6"/>
    <path d="m1015 273 19 19-19 19-19-19Z" fill="#87e4fa"/>
  </g>
  
  <g stroke="#40d9fb" strokeWidth="1">
    <path d="m158 587 21 21-21 21-21-21Z" fill="#00d6e9"/>
    <path d="m198 625 19 19-19 19-19-19Z" fill="#94e6fa"/>
    <path d="m154 650 22 22-22 22-22-22Z" fill="#008ce8"/>
    <path d="m239 664 22 22-22 22-22-22Z" fill="#99e7fb"/>
    <path d="m154 697 22 22-22 22-22-22Z" fill="#008bf0"/>
  </g>
  
  <g stroke="#37d8f3" strokeWidth="1">
    <path d="m961 1016 21 21-21 21-21-21Z" fill="#84e2f7"/>
    <path d="m900 1056 20 20-20 20-20-20Z" fill="#8ce6fa"/>
    <path d="m944 1081 20 20-20 20-20-20Z" fill="#00d1e7"/>
    <path d="m861 1102 21 21-21 21-21-21Z" fill="#008deb"/>
    <path d="m897 1116 22 22-22 22-22-22Z" fill="#00d3e6"/>
  </g>
</svg>

  );
}
