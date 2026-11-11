import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { BrandLogo } from '../components/BrandLogo'
import { AgentOrb, BarStack, ChatBubbles, GlassCube } from '../components/Illustrations'
import { Button, FormError, Input, Notice } from '../components/ui'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';

const textByMode: Record<AuthMode, { title: string; description: string; submit: string }> = {
  login: { title: 'Welcome back', description: 'Sign in to your AIScripto workspace.', submit: 'Sign in' },
  register: { title: 'Create your workspace', description: 'Set up a private space for your marketing projects and reports.', submit: 'Create account' },
  forgot: { title: 'Reset your password', description: 'We’ll send a one-time reset link if email delivery is configured.', submit: 'Send reset link' },
  reset: { title: 'Choose a new password', description: 'Use at least 12 characters. Existing sessions will be signed out.', submit: 'Update password' },
}

export function AuthPage({ mode }: { mode: AuthMode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [values, setValues] = useState({ email: '', password: '', firstName: '', lastName: '', workspaceName: '' })
  const copy = textByMode[mode]

  const update = (key: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement>) => setValues((current) => ({ ...current, [key]: event.target.value }))
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setBusy(true)
    try {
      if (mode === 'login') {
        const response = await api.post<{ token: string }>('/auth/login', { email: values.email, password: values.password })
        localStorage.setItem('auth_token', response.data.token)
        queryClient.clear()
        navigate('/app')
      } else if (mode === 'register') {
        const response = await api.post<{ token: string }>('/auth/register', values)
        localStorage.setItem('auth_token', response.data.token)
        queryClient.clear()
        navigate('/app')
      } else if (mode === 'forgot') {
        const response = await api.post<{ message: string }>('/auth/forgot-password', { email: values.email })
        setSuccess(response.data.message)
      } else {
        const response = await api.post<{ message: string }>('/auth/reset-password', { token: searchParams.get('token'), password: values.password })
        setSuccess(response.data.message)
        window.setTimeout(() => navigate('/login'), 900)
      }
    } catch (cause: any) {
      setError(cause?.response?.data?.error || 'That request could not be completed. Check the details and try again.')
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page">
    <aside className="auth-side">
      <BrandLogo />
      <div className="auth-side-content">
        <div className="auth-rule" />
        <h1>Marketing work,<br /><em>in focus.</em></h1>
        <p>Projects, website evidence, AI workflows, and client-ready reports held together in one workspace.</p>
        <div className="auth-points"><span><ShieldCheck size={15} />Private workspace data</span><span><LockKeyhole size={15} />Provider keys stay server-side</span></div>
      </div>
      <div className="auth-art" aria-hidden="true">
        <BarStack className="auth-art-bars float-slow" size={190} />
        <GlassCube className="auth-art-cube float-medium" size={120} hue="pink" />
        <AgentOrb className="auth-art-orb float-fast" size={96} hue="indigo" />
        <ChatBubbles className="auth-art-chat float-medium" size={92} />
      </div>
      <span className="auth-side-foot">AIScripto · AI Marketing Suite</span>
    </aside>
    <section className="auth-main">
      <BrandLogo className="auth-main-brand" />
      <div className="auth-form-wrap auth-card">
        <header><h2>{copy.title}</h2><p>{copy.description}</p></header>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <div className="form-row">
            <label className="form-field"><span className="field-label">First name</span><Input required autoComplete="given-name" value={values.firstName} onChange={update('firstName')} maxLength={80} /></label>
            <label className="form-field"><span className="field-label">Last name</span><Input required autoComplete="family-name" value={values.lastName} onChange={update('lastName')} maxLength={80} /></label>
          </div>}
          {mode === 'register' && <label className="form-field"><span className="field-label">Workspace name</span><Input required autoComplete="organization" value={values.workspaceName} onChange={update('workspaceName')} maxLength={120} placeholder="e.g. Northstar Studio" /></label>}
          {['login', 'register', 'forgot'].includes(mode) && <label className="form-field"><span className="field-label">Email address</span><span className="input-icon-wrap"><Mail size={15} /><Input required type="email" autoComplete="email" value={values.email} onChange={update('email')} maxLength={254} placeholder="you@company.com" /></span></label>}
          {['login', 'register', 'reset'].includes(mode) && <label className="form-field"><span className="field-label">{mode === 'login' ? 'Password' : 'Password'}</span><span className="input-icon-wrap"><LockKeyhole size={15} /><Input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={values.password} onChange={update('password')} minLength={mode === 'login' ? 1 : 12} maxLength={200} placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'} /></span></label>}
          {mode === 'login' && <div className="auth-aux-row"><span>Access is scoped to your selected workspace.</span><Link to="/forgot-password">Forgot password?</Link></div>}
          {mode === 'reset' && !searchParams.get('token') && <Notice kind="error">This reset link is missing its token. Request a new link.</Notice>}
          <FormError message={error} />
          {success && <Notice kind="success">{success}</Notice>}
          <Button variant="primary" className="auth-submit" type="submit" loading={busy} disabled={mode === 'reset' && !searchParams.get('token')}>
            {copy.submit}<ArrowRight size={15} />
          </Button>
        </form>
        <div className="auth-switch">
          {mode === 'login' ? <>New to AIScripto? <Link to="/register">Create an account</Link></> : mode === 'register' ? <>Already have an account? <Link to="/login">Sign in</Link></> : <Link to="/login">Return to sign in</Link>}
        </div>
        <p className="auth-hint">AI content generation requires an OpenAI or Anthropic key configured by your workspace administrator.</p>
      </div>
    </section>
  </main>
}

export function InvitationPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [values, setValues] = useState({ firstName: '', lastName: '', password: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [existing, setExisting] = useState(false)
  const queryClient = useQueryClient()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const response = await api.post<{ token: string }>('/workspaces/invitations/accept', { token: searchParams.get('token'), ...values })
      localStorage.setItem('auth_token', response.data.token)
      queryClient.clear()
      navigate('/app')
    } catch (cause: any) {
      setError(cause?.response?.data?.error || 'This invitation could not be accepted.')
      if (cause?.response?.status === 401) setExisting(true)
    } finally {
      setBusy(false)
    }
  }

  return <main className="auth-page invitation-page"><section className="auth-main">
    <BrandLogo className="invitation-brand" />
    <div className="auth-form-wrap auth-card"><header><h2>Join the workspace</h2><p>{existing ? 'Enter the current password for your existing account to accept this invitation.' : 'Create your account to join your team’s private marketing workspace.'}</p></header>
      <form className="auth-form" onSubmit={submit}>
        {!existing && <div className="form-row"><label className="form-field"><span className="field-label">First name</span><Input required value={values.firstName} onChange={(event) => setValues({ ...values, firstName: event.target.value })} /></label><label className="form-field"><span className="field-label">Last name</span><Input required value={values.lastName} onChange={(event) => setValues({ ...values, lastName: event.target.value })} /></label></div>}
        <label className="form-field"><span className="field-label">{existing ? 'Current account password' : 'Create password'}</span><Input required type="password" minLength={12} maxLength={200} autoComplete={existing ? 'current-password' : 'new-password'} value={values.password} onChange={(event) => setValues({ ...values, password: event.target.value })} /></label>
        <FormError message={error} />
        <Button variant="primary" type="submit" loading={busy} disabled={!searchParams.get('token')}>Accept invitation <ArrowRight size={15} /></Button>
      </form>
      <div className="auth-switch"><Link to="/login">Return to sign in</Link></div>
    </div>
  </section></main>
}
