import { useId, type SVGProps } from 'react'

/**
 * Lightweight SVG "3D" illustrations for the premium dashboard language.
 * Each shape is lit from the top-left: a bright top face, a mid front face,
 * and a deep side face, plus a soft contact shadow for ambient occlusion.
 * Pure SVG keeps them crisp, themeable, and free of runtime 3D dependencies.
 */

type IllustrationProps = SVGProps<SVGSVGElement> & { size?: number; hue?: 'violet' | 'pink' | 'indigo' }

const palettes = {
  violet: { top: '#E4D6FF', front: '#8B5CFF', side: '#4A1FD8', glow: '#C7A8FF' },
  pink: { top: '#FBE4FF', front: '#C46BFF', side: '#7B35FF', glow: '#E8B6FF' },
  indigo: { top: '#D9D4FF', front: '#633BFA', side: '#3510B8', glow: '#A996FF' },
}

function useIds(...names: string[]) {
  const base = useId().replace(/:/g, '')
  return Object.fromEntries(names.map((name) => [name, `${base}-${name}`])) as Record<string, string>
}

/** Floating glass cube with an inner solid core — used for projects and generic empty states. */
export function GlassCube({ size = 120, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('top', 'front', 'side', 'core', 'shadow')
  return <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
    <defs>
      <linearGradient id={id.top} x1="30" y1="20" x2="90" y2="50"><stop stopColor="#fff" stopOpacity=".95" /><stop offset="1" stopColor={c.top} stopOpacity=".7" /></linearGradient>
      <linearGradient id={id.front} x1="25" y1="45" x2="60" y2="100"><stop stopColor={c.glow} stopOpacity=".55" /><stop offset="1" stopColor={c.front} stopOpacity=".55" /></linearGradient>
      <linearGradient id={id.side} x1="60" y1="45" x2="95" y2="100"><stop stopColor={c.front} stopOpacity=".7" /><stop offset="1" stopColor={c.side} stopOpacity=".85" /></linearGradient>
      <linearGradient id={id.core} x1="48" y1="50" x2="74" y2="84"><stop stopColor="#fff" /><stop offset=".35" stopColor={c.front} /><stop offset="1" stopColor={c.side} /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(34 0 0 7 60 108)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".35" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="60" cy="108" rx="34" ry="7" fill={`url(#${id.shadow})`} />
    <path d="M60 50 74 42 74 74 60 82Z" fill={c.side} opacity=".9" />
    <path d="M46 42 60 50 60 82 46 74Z" fill={`url(#${id.core})`} />
    <path d="M46 42 60 34 74 42 60 50Z" fill="#fff" opacity=".9" />
    <path d="M24 34 60 14 96 34 60 54Z" fill={`url(#${id.top})`} />
    <path d="M24 34 60 54 60 98 24 78Z" fill={`url(#${id.front})`} />
    <path d="M60 54 96 34 96 78 60 98Z" fill={`url(#${id.side})`} />
    <path d="M24 34 60 54 96 34M60 54v44" stroke="#fff" strokeOpacity=".75" strokeWidth="1.2" />
    <path d="M24 34 60 14 96 34" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" />
  </svg>
}

/** Ascending 3D bar stack with a trend arrow — used for analytics and the sidebar audit card. */
export function BarStack({ size = 140, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('front', 'side', 'shadow')
  const bars = [{ x: 18, h: 34 }, { x: 54, h: 58 }, { x: 90, h: 86 }]
  return <svg width={size} height={size} viewBox="0 0 140 140" fill="none" aria-hidden="true" {...props}>
    <defs>
      <linearGradient id={id.front} x1="0" y1="20" x2="0" y2="130"><stop stopColor="#fff" stopOpacity=".95" /><stop offset=".5" stopColor={c.glow} /><stop offset="1" stopColor={c.front} /></linearGradient>
      <linearGradient id={id.side} x1="0" y1="20" x2="0" y2="130"><stop stopColor={c.glow} /><stop offset="1" stopColor={c.side} /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(62 0 0 8 72 130)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".4" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="72" cy="130" rx="62" ry="8" fill={`url(#${id.shadow})`} />
    {bars.map(({ x, h }) => {
      const base = 124
      const top = base - h
      return <g key={x}>
        <path d={`M${x} ${top + 6} ${x + 14} ${top} ${x + 34} ${top + 6} ${x + 20} ${top + 12}Z`} fill="#fff" />
        <path d={`M${x} ${top + 6} ${x + 20} ${top + 12} ${x + 20} ${base + 6} ${x} ${base}Z`} fill={`url(#${id.front})`} />
        <path d={`M${x + 20} ${top + 12} ${x + 34} ${top + 6} ${x + 34} ${base} ${x + 20} ${base + 6}Z`} fill={`url(#${id.side})`} />
      </g>
    })}
    <path d="M12 58 40 36 56 46 92 16" stroke={c.glow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M80 15h13v13" stroke={c.glow} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}

/** Glossy orb with an orbit ring — used for AI agents. */
export function AgentOrb({ size = 120, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('orb', 'shine', 'ring', 'shadow')
  return <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
    <defs>
      <radialGradient id={id.orb} cx="0" cy="0" r="1" gradientTransform="matrix(46 40 -40 46 46 40)" gradientUnits="userSpaceOnUse"><stop stopColor="#fff" /><stop offset=".25" stopColor={c.glow} /><stop offset=".7" stopColor={c.front} /><stop offset="1" stopColor={c.side} /></radialGradient>
      <linearGradient id={id.ring} x1="10" y1="60" x2="110" y2="60"><stop stopColor={c.glow} stopOpacity=".2" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor={c.glow} stopOpacity=".2" /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(30 0 0 6 60 108)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".35" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="60" cy="108" rx="30" ry="6" fill={`url(#${id.shadow})`} />
    <path d="M14 66c0-8 20.6-15 46-15s46 7 46 15" stroke={`url(#${id.ring})`} strokeWidth="3" />
    <circle cx="60" cy="58" r="32" fill={`url(#${id.orb})`} />
    <ellipse cx="49" cy="44" rx="11" ry="7" fill="#fff" opacity=".55" transform="rotate(-28 49 44)" />
    <path d="M106 66c0 8-20.6 15-46 15s-46-7-46-15" stroke={`url(#${id.ring})`} strokeWidth="3" />
    <circle cx="100" cy="74" r="4" fill="#fff" />
    <circle cx="22" cy="54" r="2.6" fill={c.glow} />
  </svg>
}

/** Two stacked glossy speech bubbles — used for inbox and conversations. */
export function ChatBubbles({ size = 120, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('back', 'front', 'shadow')
  return <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
    <defs>
      <linearGradient id={id.back} x1="50" y1="18" x2="104" y2="70"><stop stopColor={c.top} /><stop offset="1" stopColor={c.glow} /></linearGradient>
      <linearGradient id={id.front} x1="14" y1="40" x2="74" y2="98"><stop stopColor={c.glow} /><stop offset=".45" stopColor={c.front} /><stop offset="1" stopColor={c.side} /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(36 0 0 6 56 110)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".3" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="56" cy="110" rx="36" ry="6" fill={`url(#${id.shadow})`} />
    <path d="M58 18h36a14 14 0 0 1 14 14v18a14 14 0 0 1-14 14h-2l2 12-14-12H58a14 14 0 0 1-14-14V32a14 14 0 0 1 14-14Z" fill={`url(#${id.back})`} />
    <path d="M26 40h38a16 16 0 0 1 16 16v20a16 16 0 0 1-16 16H40l-16 12 3-12h-1a16 16 0 0 1-16-16V56a16 16 0 0 1 16-16Z" fill={`url(#${id.front})`} />
    <path d="M24 44h36" stroke="#fff" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
    <circle cx="32" cy="66" r="4" fill="#fff" /><circle cx="45" cy="66" r="4" fill="#fff" opacity=".85" /><circle cx="58" cy="66" r="4" fill="#fff" opacity=".7" />
  </svg>
}

/** Fanned stack of documents — used for reports. */
export function DocStack({ size = 120, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('page', 'top', 'shadow')
  return <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
    <defs>
      <linearGradient id={id.page} x1="30" y1="20" x2="90" y2="100"><stop stopColor={c.glow} /><stop offset="1" stopColor={c.side} /></linearGradient>
      <linearGradient id={id.top} x1="34" y1="16" x2="86" y2="96"><stop stopColor="#fff" /><stop offset="1" stopColor={c.top} /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(34 0 0 6 60 108)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".3" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="60" cy="108" rx="34" ry="6" fill={`url(#${id.shadow})`} />
    <rect x="38" y="22" width="50" height="66" rx="8" fill={`url(#${id.page})`} transform="rotate(12 63 55)" />
    <rect x="34" y="20" width="50" height="66" rx="8" fill={c.front} opacity=".75" transform="rotate(4 59 53)" />
    <rect x="30" y="20" width="50" height="68" rx="8" fill={`url(#${id.top})`} />
    <rect x="39" y="33" width="24" height="4" rx="2" fill={c.front} />
    <rect x="39" y="43" width="32" height="3" rx="1.5" fill={c.glow} />
    <rect x="39" y="50" width="28" height="3" rx="1.5" fill={c.glow} />
    <path d="M40 76V68M48 76V62M56 76v-9M64 76V58" stroke={c.front} strokeWidth="4" strokeLinecap="round" />
  </svg>
}

/** Faceted prism — used for tools and decorative accents. */
export function Prism({ size = 120, hue = 'violet', ...props }: IllustrationProps) {
  const c = palettes[hue]
  const id = useIds('l', 'r', 'shadow')
  return <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true" {...props}>
    <defs>
      <linearGradient id={id.l} x1="30" y1="20" x2="60" y2="100"><stop stopColor="#fff" /><stop offset=".5" stopColor={c.glow} /><stop offset="1" stopColor={c.front} /></linearGradient>
      <linearGradient id={id.r} x1="60" y1="20" x2="95" y2="100"><stop stopColor={c.front} /><stop offset="1" stopColor={c.side} /></linearGradient>
      <radialGradient id={id.shadow} cx="0" cy="0" r="1" gradientTransform="matrix(32 0 0 6 60 108)" gradientUnits="userSpaceOnUse"><stop stopColor={c.side} stopOpacity=".32" /><stop offset="1" stopColor={c.side} stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="60" cy="108" rx="32" ry="6" fill={`url(#${id.shadow})`} />
    <path d="M60 12 26 88l34 12Z" fill={`url(#${id.l})`} />
    <path d="M60 12l34 76-34 12Z" fill={`url(#${id.r})`} />
    <path d="M60 12v88" stroke="#fff" strokeOpacity=".7" strokeWidth="1.2" />
  </svg>
}

export const illustrations = { cube: GlassCube, bars: BarStack, orb: AgentOrb, chat: ChatBubbles, docs: DocStack, prism: Prism }
export type IllustrationName = keyof typeof illustrations

export function Illustration({ name, ...props }: IllustrationProps & { name: IllustrationName }) {
  const Component = illustrations[name]
  return <Component {...props} />
}
