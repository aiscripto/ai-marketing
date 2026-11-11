import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { LoaderCircle } from 'lucide-react'

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

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return <header className="page-header">
    <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function SectionTitle({ title, trailing }: { title: string; trailing?: ReactNode }) {
  return <div className="section-title"><h2>{title}</h2>{trailing}</div>
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success' | 'warning'; children: ReactNode }) {
  return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>
}

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-rule" /><h3>{title}</h3><p>{detail}</p>{action}</div>
}

export function LoadingBlock({ label = 'Loading workspace data' }: { label?: string }) {
  return <div className="loading-block" role="status"><LoaderCircle size={16} className="spin" /><span>{label}</span></div>
}

export function StatusTag({ status }: { status: string }) {
  return <span className={`status-tag status-${status.toLowerCase().replace(/[^a-z]+/g, '-')}`}><span className="status-mark" />{status.replace(/_/g, ' ')}</span>
}

export function FormError({ message }: { message?: string | null }) {
  return message ? <Notice kind="error">{message}</Notice> : null
}
