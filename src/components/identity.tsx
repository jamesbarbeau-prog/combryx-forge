// Builder Guardian identity artwork: all drawn as SVG so it stays crisp and light.
// SidebarHouse: a modern home at dusk for the foot of the navigation rail.
// BlueprintFrame: faint timber-frame line drawing that sits behind page headers.
// BrassRays: two thin brass diagonals across the top of the workspace.
// BrandShield: the shield used in the rail header.

export function BrandShield({ size = 46 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="bs-edge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F1EEE6" /><stop offset=".55" stopColor="#B9C0CC" /><stop offset="1" stopColor="#8D96A6" /></linearGradient>
        <linearGradient id="bs-gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#8F7342" /><stop offset=".5" stopColor="#E3C682" /><stop offset="1" stopColor="#B08D4F" /></linearGradient>
      </defs>
      <path d="M24 2.5 42 9.5v12.2c0 10.6-7.2 17.9-18 23.8C13.2 39.6 6 32.3 6 21.7V9.5L24 2.5Z" fill="#1B2A41" stroke="url(#bs-edge)" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M24 8.5 36 13.4v8.2c0 7.4-4.8 12.6-12 16.9-7.2-4.3-12-9.5-12-16.9v-8.2L24 8.5Z" fill="#22344F" />
      <path d="M13 29.5c5.5-1.2 11.5-5.6 17.5-14.5l3.5 1.6c-5.2 9.8-12.4 15.4-19.6 17.2l-1.4-4.3Z" fill="url(#bs-gold)" />
      <path d="m16.5 19.5 7.5-6 7.5 6" fill="none" stroke="#EDE8DC" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SidebarHouse() {
  const win = (x: number, y: number, w: number, h: number, key: string) => (
    <g key={key}>
      <rect x={x} y={y} width={w} height={h} fill="url(#sh-glow)" />
      <rect x={x} y={y} width={w} height={h} fill="url(#sh-glass)" opacity=".35" />
      {Array.from({ length: Math.max(0, Math.floor(w / 22)) }, (_, i) => <line key={i} x1={x + (i + 1) * (w / (Math.floor(w / 22) + 1))} x2={x + (i + 1) * (w / (Math.floor(w / 22) + 1))} y1={y} y2={y + h} stroke="#2B2620" strokeWidth="1.4" />)}
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#1A1713" strokeWidth="1.6" />
    </g>
  );
  return (
    <svg viewBox="0 0 240 230" width="100%" preserveAspectRatio="xMidYMax slice" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="sh-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1B2A41" stopOpacity="0" /><stop offset=".28" stopColor="#25395A" /><stop offset=".62" stopColor="#3B5273" /><stop offset="1" stopColor="#6D7C93" /></linearGradient>
        <linearGradient id="sh-glow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE2A3" /><stop offset="1" stopColor="#E5A24C" /></linearGradient>
        <linearGradient id="sh-glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
        <linearGradient id="sh-stone" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#6B6A68" /><stop offset="1" stopColor="#4D4D50" /></linearGradient>
        <linearGradient id="sh-lawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#27402F" /><stop offset="1" stopColor="#16261C" /></linearGradient>
        <radialGradient id="sh-pool" cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#F1B25E" stopOpacity=".55" /><stop offset="1" stopColor="#F1B25E" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="240" height="230" fill="url(#sh-sky)" />
      {/* distant treeline */}
      <path d="M0 150c14-12 26-6 38-14 12-8 22 4 36-6 12-9 22 2 36-8s24 2 38-6 26 4 40-4 22 6 52-2v110H0Z" fill="#1E3046" opacity=".9" />
      {/* ground */}
      <path d="M0 186c60-8 120-8 240-2v46H0Z" fill="url(#sh-lawn)" />
      <path d="M96 230 120 186h30l30 44Z" fill="#8B8478" opacity=".55" />
      {/* upper volume */}
      <rect x="66" y="86" width="150" height="44" fill="#2A2E38" />
      {win(76, 96, 130, 26, 'u1')}
      <rect x="60" y="80" width="162" height="7" fill="#12161E" />
      <rect x="60" y="86" width="162" height="1.6" fill="#C9A96A" />
      {/* lower volume */}
      <rect x="34" y="128" width="190" height="60" fill="#33363F" />
      <rect x="34" y="128" width="40" height="60" fill="url(#sh-stone)" />
      {Array.from({ length: 8 }, (_, i) => <line key={i} x1="34" x2="74" y1={134 + i * 7} y2={134 + i * 7} stroke="#3A3A3D" strokeWidth=".8" />)}
      {win(84, 138, 62, 46, 'l1')}
      {win(156, 138, 60, 46, 'l2')}
      <rect x="148" y="150" width="6" height="38" fill="#C9A96A" opacity=".9" />
      <rect x="28" y="124" width="202" height="5" fill="#12161E" />
      {/* garage */}
      <rect x="40" y="150" width="28" height="38" fill="#262930" />
      {Array.from({ length: 5 }, (_, i) => <line key={i} x1="40" x2="68" y1={156 + i * 6.4} y2={156 + i * 6.4} stroke="#3E4350" strokeWidth=".8" />)}
      {/* glow pools */}
      <ellipse cx="115" cy="192" rx="46" ry="6" fill="url(#sh-pool)" />
      <ellipse cx="188" cy="192" rx="40" ry="6" fill="url(#sh-pool)" />
      {/* shrubs and trees */}
      <ellipse cx="22" cy="180" rx="26" ry="26" fill="#15291F" />
      <ellipse cx="18" cy="172" rx="16" ry="20" fill="#1D3828" />
      <ellipse cx="232" cy="176" rx="24" ry="30" fill="#15291F" />
      <ellipse cx="238" cy="168" rx="14" ry="22" fill="#1D3828" />
      <ellipse cx="96" cy="190" rx="16" ry="6" fill="#1A3324" /><ellipse cx="206" cy="190" rx="18" ry="6" fill="#1A3324" />
      {/* path lights */}
      {[[104, 202], [112, 212], [136, 202], [146, 214]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.6" fill="#FFD58A" />)}
      {/* brass sweep */}
      <path d="M0 26 150 0" stroke="#B08D4F" strokeWidth="1.2" opacity=".55" fill="none" />
      <path d="M0 36 118 16" stroke="#B08D4F" strokeWidth=".8" opacity=".35" fill="none" />
    </svg>
  );
}

export function BlueprintFrame({ style }: { style?: React.CSSProperties }) {
  const studs: number[] = []; for (let x = 70; x <= 450; x += 38) studs.push(x);
  return (
    <svg viewBox="0 0 520 240" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none', ...style }}>
      <g fill="none" stroke="#8A7A5C" strokeWidth=".9" opacity=".55" strokeLinejoin="round">
        {/* ground and plinth */}
        <path d="M20 214H500" /><path d="M54 214v-8h412v8" />
        {/* lower storey */}
        <rect x="64" y="124" width="392" height="82" />
        {studs.map(x => <line key={'a' + x} x1={x} x2={x} y1="124" y2="206" />)}
        <path d="M64 165H456" strokeDasharray="3 4" />
        {/* floor plate and upper storey */}
        <rect x="58" y="118" width="404" height="6" />
        <rect x="90" y="52" width="340" height="66" />
        {studs.filter(x => x > 90 && x < 430).map(x => <line key={'b' + x} x1={x} x2={x} y1="52" y2="118" />)}
        <path d="M90 118 168 52M168 118 260 52M260 118 352 52M352 118 430 52" opacity=".6" />
        {/* roof frame */}
        <path d="M78 52 260 6 442 52" /><path d="M96 52 260 14 424 52" opacity=".6" />
        <path d="M260 6v46M170 29v23M350 29v23" /><path d="M134 40l126 12 126-12" opacity=".5" />
        {/* openings */}
        <rect x="108" y="140" width="76" height="52" /><rect x="214" y="140" width="92" height="66" /><rect x="334" y="140" width="96" height="52" />
        <rect x="150" y="70" width="104" height="34" /><rect x="286" y="70" width="104" height="34" />
        {/* dimensions */}
        <path d="M470 6v208M464 6h12M464 214h12" opacity=".7" /><path d="M64 232H456M64 226v12M456 226v12" opacity=".7" />
      </g>
      <g fill="#8A7A5C" opacity=".6">{[[64, 124], [456, 124], [90, 52], [430, 52], [260, 6], [78, 52], [442, 52]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.2" />)}</g>
    </svg>
  );
}

export function BrassRays() {
  return (
    <svg aria-hidden="true" width="100%" height="190" viewBox="0 0 1000 190" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, pointerEvents: 'none', zIndex: 0 }}>
      <defs><linearGradient id="br-a" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C9A96A" stopOpacity=".9" /><stop offset="1" stopColor="#C9A96A" stopOpacity="0" /></linearGradient></defs>
      <path d="M700 0 560 112" stroke="url(#br-a)" strokeWidth="1.6" fill="none" />
      <path d="M722 0 606 96" stroke="url(#br-a)" strokeWidth="1" fill="none" opacity=".7" />
      <path d="M940 0 760 150" stroke="url(#br-a)" strokeWidth="1" fill="none" opacity=".45" />
    </svg>
  );
}
