import type { ButtonHTMLAttributes, CSSProperties, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { LoaderCircle, TrendingDown, TrendingUp } from 'lucide-react'
import { Illustration, type IllustrationName } from './Illustrations'
import { useTilt } from '../lib/useTilt'

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'quiet' | 'danger'; size?: 'sm' | 'md'; loading?: boolean; leading?: ReactNode }

export function Button({ variant = 'secondary', size = 'md', loading, leading, children, className = '', disabled, ...props }: ButtonProps) {
  return <button className={`button button-${variant} button-${size} ${className}`} disabled={disabled || loading} {...props}>
    {loading ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : leading}
    {children}
  </button>
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`field-input ${className}`} {...props} />
}

export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`field-input field-textarea ${className}`} {...props} />
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`field-input field-select ${className}`} {...props}>{children}</select>
}

export function Field({ label, hint, children, className = '' }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return <label className={`form-field ${className}`}>
    <span className="field-label">{label}</span>
    {children}
    {hint && <span className="field-hint">{hint}</span>}
  </label>
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: string; actions?: ReactNode; eyebrow?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{trailing}</div>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ title, detail, action, illustration = 'cube' }: { title: string; detail: string; action?: ReactNode; illustration?: IllustrationName | null }) {
  return <div className="empty-state">
    {illustration ? <span className="empty-illustration float-slow"><Illustration name={illustration} size={76} /></span> : <span className="empty-rule" />}
    <div className="empty-copy"><h3>{title}</h3><p>{detail}</p>{action && <div className="empty-action">{action}</div>}</div>
  </div>
}

export function LoadingBlock({ label = 'Loading workspace data' }: { label?: string }) {
  return <div className="loading-block" role="status"><LoaderCircle size={16} className="spin" /><span>{label}</span></div>
}

/** Shimmering placeholder used while data loads. */
export function Skeleton({ width, height = 14, radius, className = '', style }: { width?: number | string; height?: number | string; radius?: number; className?: string; style?: CSSProperties }) {
  return <span className={`skeleton ${className}`} aria-hidden="true" style={{ width, height, borderRadius: radius, ...style }} />
}

export function StatusTag({ status }: { status: string }) {
  return <span className={`status-tag status-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`}><span className="status-mark" />{status.replace(/_/g, ' ')}</span>
}

export function FormError({ message }: { message?: string | null }) {
  return message ? <Notice kind="error">{message}</Notice> : null
}

type CardProps = HTMLAttributes<HTMLElement> & { as?: 'section' | 'article' | 'div'; variant?: 'surface' | 'glass' | 'hero'; tilt?: boolean }

/** Premium card surface. `tilt` adds a subtle pointer-driven 3D tilt (disabled for reduced motion / touch). */
export function Card({ as: Tag = 'section', variant = 'surface', tilt = false, className = '', children, ...props }: CardProps) {
  const tiltHandlers = useTilt<HTMLDivElement>(4)
  const interactive = tilt ? { ref: tiltHandlers.ref, onPointerMove: tiltHandlers.onPointerMove, onPointerLeave: tiltHandlers.onPointerLeave } as Record<string, unknown> : {}
  return <Tag className={`card card-${variant} ${tilt ? 'card-tilt' : ''} ${className}`} {...interactive} {...props}>{children}</Tag>
}

/** Circular progress ring for 0–100 values; renders an em dash when unavailable. */
export function ProgressRing({ value, size = 54, stroke = 5, label }: { value: number | null | undefined; size?: number; stroke?: number; label?: string }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safe = value === null || value === undefined ? null : Math.max(0, Math.min(100, value))
  return <span className="progress-ring" style={{ width: size, height: size }} role="img" aria-label={label || (safe === null ? 'No score' : `${Math.round(safe)} out of 100`)}>
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} className="progress-ring-track" strokeWidth={stroke} fill="none" />
      {safe !== null && <circle cx={size / 2} cy={size / 2} r={radius} className="progress-ring-value" strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - safe / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />}
    </svg>
    <span className="progress-ring-label">{safe === null ? '—' : `${Math.round(safe)}%`}</span>
  </span>
}

/** Mini 3D-ish bar chart for stat cards. The final bar is emphasized with the primary gradient. */
export function MiniBars({ values, tone = 'primary', label }: { values: number[]; tone?: 'primary' | 'pink'; label?: string }) {
  const max = Math.max(1, ...values)
  return <span className={`mini-bars mini-bars-${tone}`} role="img" aria-label={label || `Trend: ${values.join(', ')}`}>
    {values.map((value, index) => <i key={index} className={index === values.length - 1 ? 'is-current' : ''} style={{ height: `${Math.max(8, (value / max) * 100)}%`, animationDelay: `${index * 45}ms` }} />)}
  </span>
}

/** Small percentage change pill. Hidden when no comparison is available. */
export function TrendBadge({ change, suffix = '%' }: { change: number | null | undefined; suffix?: string }) {
  if (change === null || change === undefined || !Number.isFinite(change)) return null
  const up = change >= 0
  return <span className={`trend-badge ${up ? 'trend-up' : 'trend-down'}`}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? '+' : ''}{Math.round(change * 10) / 10}{suffix}</span>
}

/** Gradient initials avatar with optional presence dot. */
export function Avatar({ name, size = 40, tone = 0, presence, icon }: { name: string; size?: number; tone?: number; presence?: 'online' | 'busy' | 'offline'; icon?: ReactNode }) {
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '·'
  return <span className={`avatar avatar-tone-${Math.abs(tone) % 5}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
    {icon || letters}
    {presence && <span className={`avatar-presence presence-${presence}`} />}
  </span>
}
