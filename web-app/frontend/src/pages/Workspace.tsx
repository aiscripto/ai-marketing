import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight, ChevronDown, Copy, KeyRound, Link2, LockKeyhole, PlugZap,
  Save, ShieldCheck, Trash2, UserPlus, WandSparkles, X,
} from 'lucide-react'
import { format } from 'date-fns'
import api from '../lib/api'
import { useSession } from '../lib/session'
import type { Project, WorkspaceRole } from '../lib/types'
import { Button, EmptyState, Field, FormError, Input, LoadingBlock, Notice, PageHeader, SectionTitle, Select, StatusTag, Textarea } from '../components/ui'

interface AgentConfig {
  name: string;
  label: string;
  description: string;
  responsibilities: string[];
  instructions: string;
  enabled: boolean;
  additionalInstructions: string;
  updatedAt: string | null;
}

export function AgentsPage() {
  const queryClient = useQueryClient()
  const [expanded, setExpanded] = useState('content')
  const [error, setError] = useState('')
  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: async () => (await api.get<{ agents: AgentConfig[] }>('/agents')).data.agents })
  const [drafts, setDrafts] = useState<Record<string, { additionalInstructions: string; enabled: boolean }>>({})
  const projects = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const [projectId, setProjectId] = useState('')
  const [historyAgent, setHistoryAgent] = useState('')
  const history = useQuery({ queryKey: ['agent-history', historyAgent], queryFn: async () => (await api.get<{ executions: any[] }>(`/agents/${historyAgent}/history`)).data.executions, enabled: Boolean(historyAgent) })

  const save = useMutation({
    mutationFn: async ({ name, config }: { name: string; config: { additionalInstructions: string; enabled: boolean } }) => api.put(`/agents/${name}/config`, config),
    onSuccess: async () => { setError(''); await queryClient.invalidateQueries({ queryKey: ['agents'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Agent settings could not be saved. Workspace administrators can update these controls.'),
  })
  const runAgent = useMutation({
    mutationFn: async (agentName: string) => (await api.post<{ executionId: string }>(`/agents/${agentName}/run`, { projectId })).data,
    onSuccess: (result) => { window.location.assign(`/app/executions/${result.executionId}`) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Agent task could not be queued.'),
  })
  const agents = agentsQuery.data || []
  const editValues = (agent: AgentConfig) => drafts[agent.name] || { additionalInstructions: agent.additionalInstructions, enabled: agent.enabled }

  return <div className="page-stack">
    <PageHeader title="AI agent center" description="Five specialists share project context, run in parallel for full audits, and save their actual outcomes and errors." actions={<Link className="button button-primary button-md" to="/app/audit"><WandSparkles size={15} /> Run full orchestration</Link>} />
    <section className="work-surface orchestration-surface"><SectionTitle title="Audit orchestration" trailing={<span className="muted-text">Shared evidence · parallel run · combined report</span>} />
      <div className="orchestration-diagram" aria-label="Five specialist agents feed a combined audit report">
        {agents.map((agent) => <div className="orchestration-agent" key={agent.name}><span className="agent-link-line" /><span className="agent-orb"><WandSparkles size={15} /></span><strong>{agent.label.replace(' Agent', '')}</strong></div>)}
        <div className="orchestration-hub"><span className="hub-mark">A</span><strong>Audit report</strong><small>Scores · evidence · roadmap</small></div>
      </div>
      <p className="section-note">The shared project context includes brand documents, target website crawl results, supplied competitor scans, and workspace-specific agent instructions. No agent shows completion before a result is saved.</p>
    </section>
    <FormError message={error} />
    <section className="work-surface agent-control-surface"><SectionTitle title="Specialist configuration" trailing={<span className="muted-text">{agents.filter((agent) => agent.enabled).length} enabled</span>} />
      {agentsQuery.isLoading ? <LoadingBlock label="Loading agent configuration" /> : <div className="agent-config-list">{agents.map((agent) => {
        const value = editValues(agent)
        const isOpen = expanded === agent.name
        return <article className={`agent-config ${isOpen ? 'expanded' : ''}`} key={agent.name}>
          <button className="agent-config-heading" onClick={() => setExpanded(isOpen ? '' : agent.name)} aria-expanded={isOpen}><span className="agent-orb small"><WandSparkles size={14} /></span><span className="agent-config-title"><strong>{agent.label}</strong><small>{agent.description}</small></span><StatusTag status={value.enabled ? 'enabled' : 'disabled'} /><ChevronDown size={15} /></button>
          {isOpen && <div className="agent-config-body"><div className="agent-responsibilities"><strong>Responsibilities</strong><div>{agent.responsibilities.map((item) => <span key={item}>{item}</span>)}</div><details><summary>Base instructions</summary><pre>{agent.instructions}</pre></details></div>
            <div className="agent-editor"><label className="check-option agent-toggle"><input type="checkbox" checked={value.enabled} onChange={(event) => setDrafts((current) => ({ ...current, [agent.name]: { ...value, enabled: event.target.checked } }))} /><span>Include agent in full audits</span></label><Field label="Workspace-specific instructions" hint="The original agent definition remains active. These instructions add project-independent guidance."><Textarea rows={5} maxLength={10000} value={value.additionalInstructions} onChange={(event) => setDrafts((current) => ({ ...current, [agent.name]: { ...value, additionalInstructions: event.target.value } }))} placeholder="Optional priorities, constraints, or review criteria" /></Field><Button variant="primary" size="sm" onClick={() => save.mutate({ name: agent.name, config: value })} loading={save.isPending}><Save size={14} /> Save configuration</Button><small className="muted-text">{agent.updatedAt ? `Last saved ${format(new Date(agent.updatedAt), 'MMM d, yyyy')}` : 'Using the bundled agent definition'}</small></div>
            <div className="agent-single-run"><strong>Run this agent</strong><Select value={projectId} onChange={(event) => setProjectId(event.target.value)} aria-label="Select project for agent run"><option value="">Choose a project</option>{(projects.data || []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</Select><Button size="sm" disabled={!projectId || !value.enabled} loading={runAgent.isPending} onClick={() => runAgent.mutate(agent.name)}>Queue agent <ArrowRight size={13} /></Button><button className="text-link" onClick={() => setHistoryAgent(historyAgent === agent.name ? '' : agent.name)}>Execution history</button></div>
            {historyAgent === agent.name && <div className="agent-history">{history.isLoading ? <LoadingBlock /> : history.data?.length ? history.data.slice(0, 5).map((row) => <Link to={`/app/executions/${row.executionId}`} className="agent-history-row" key={row.id}><span>{row.execution.task.title}</span><StatusTag status={row.status} /><small>{row.startedAt ? format(new Date(row.startedAt), 'MMM d, yyyy') : 'Pending'}</small></Link>) : <span className="muted-text">No execution history for this agent.</span>}</div>}
          </div>}
        </article>
      })}</div>}
    </section>
  </div>
}

interface IntegrationItem { id: string; name: string; kind: string; description: string; connected: boolean; status: string; configurationSource: string | null; model: string | null; supported: boolean; lastUpdatedAt: string | null }

export function IntegrationsPage() {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<'openai' | 'anthropic'>('openai')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [makeDefault, setMakeDefault] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const integrationsQuery = useQuery({ queryKey: ['integrations'], queryFn: async () => (await api.get<{ selectedAiProvider: string; integrations: IntegrationItem[] }>('/integrations')).data })
  const items = integrationsQuery.data?.integrations || []

  const test = useMutation({
    mutationFn: async () => (await api.post(`/integrations/${selected}/test`, { apiKey, model: model || undefined })).data,
    onSuccess: () => { setMessage('Provider key and model verified. Save the key to use it for workspace jobs.'); setError('') },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Provider connection could not be verified.'),
  })
  const save = useMutation({
    mutationFn: async () => (await api.put(`/integrations/${selected}`, { apiKey, model: model || undefined, makeDefault })).data,
    onSuccess: async () => { setApiKey(''); setMessage('Provider key verified and stored encrypted for this workspace.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['integrations'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Provider key could not be saved.'),
  })
  const verifySaved = useMutation({
    mutationFn: async (provider: string) => (await api.post(`/integrations/${provider}/test-configured`)).data,
    onSuccess: (value) => { setMessage(value.message); setError('') },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Configured provider check failed.'),
  })
  const remove = useMutation({
    mutationFn: async (provider: string) => api.delete(`/integrations/${provider}`),
    onSuccess: async () => { setMessage('Workspace provider key removed.'); await queryClient.invalidateQueries({ queryKey: ['integrations'] }) },
    onError: () => setError('Provider key could not be removed.'),
  })

  return <div className="page-stack">
    <PageHeader title="Integrations" description="Configure and verify provider connections. External analytics, publishing, and CRM connectors stay unavailable until a working API and permissions are supplied." />
    <FormError message={error} />{message && <Notice kind="success">{message}</Notice>}
    <section className="integration-layout">
      <article className="work-surface ai-integration-editor"><SectionTitle title="AI providers" trailing={<span className="required-marker">Required for generation</span>} />
        <div className="provider-tabs" role="tablist">{(['openai', 'anthropic'] as const).map((provider) => <button className={selected === provider ? 'selected' : ''} role="tab" aria-selected={selected === provider} key={provider} onClick={() => { setSelected(provider); setApiKey(''); setError(''); setMessage('') }}>{provider === 'openai' ? 'OpenAI' : 'Anthropic'}</button>)}</div>
        <p className="section-note">{selected === 'openai' ? 'Use an OpenAI API key for Responses API text generation.' : 'Use an Anthropic API key for Messages API text generation.'} Keys are encrypted before they are persisted and never returned to the browser.</p>
        <form className="provider-form" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
          <Field label="API key"><Input required type="password" autoComplete="new-password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={selected === 'openai' ? 'sk-…' : 'sk-ant-…'} maxLength={4096} /></Field>
          <Field label="Model ID" hint="The key and selected model are verified before saving."><Input value={model} onChange={(event) => setModel(event.target.value)} placeholder={selected === 'openai' ? 'gpt-4.1' : 'claude-sonnet-5'} maxLength={120} /></Field>
          <label className="check-option"><input type="checkbox" checked={makeDefault} onChange={(event) => setMakeDefault(event.target.checked)} /><span>Use this provider by default in this workspace</span></label>
          <div className="provider-actions"><Button type="button" onClick={() => test.mutate()} loading={test.isPending} disabled={!apiKey}><PlugZap size={14} /> Test key</Button><Button type="submit" variant="primary" loading={save.isPending} disabled={!apiKey}><KeyRound size={14} /> Test and save</Button></div>
        </form>
        <div className="saved-provider-list">{items.filter((item) => item.kind === 'ai').map((item) => <div className="saved-provider-row" key={item.id}><span className={`provider-state-mark ${item.status}`} /><span><strong>{item.name}</strong><small>{item.configurationSource === 'workspace' ? `Workspace key · ${item.model}` : item.configurationSource === 'server_environment' ? `Server environment · ${item.model}` : 'No key configured'}</small></span><StatusTag status={item.status} />{item.status !== 'not_connected' && <Button size="sm" onClick={() => verifySaved.mutate(item.id)} loading={verifySaved.isPending}>Verify</Button>}{item.configurationSource === 'workspace' && <button className="icon-button icon-danger" aria-label={`Remove ${item.name} key`} onClick={() => remove.mutate(item.id)} disabled={remove.isPending}><Trash2 size={14} /></button>}</div>)}</div>
      </article>
      <article className="work-surface connector-status-surface"><SectionTitle title="External data and publishing" /><p className="section-note">A status of unavailable means no operational connector is configured in this application. No live metrics or publishing actions are shown for these services.</p><div className="connector-list">{items.filter((item) => item.kind !== 'ai').map((item) => <div className="connector-row" key={item.id}><span className="connector-icon"><Link2 size={15} /></span><span><strong>{item.name}</strong><small>{item.description}</small></span><StatusTag status={item.supported ? item.status : 'unavailable'} /></div>)}</div></article>
    </section>
    <div className="integration-footnote"><ShieldCheck size={15} /><span>Passwords, API keys, SMTP settings, and OAuth secrets stay on the server. Provider keys saved here use AES-256-GCM encryption.</span></div>
  </div>
}

export function SettingsPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { user, workspace, theme, setTheme } = useSession()
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await api.get<{ stats: { totalProjects: number; websitesAnalyzed: number; aiAgentExecutions: number } }>('/dashboard')).data })
  const [profile, setProfile] = useState({ firstName: user.firstName, lastName: user.lastName })
  const [workspaceData, setWorkspaceData] = useState({ name: workspace.name, companyName: workspace.companyName || '', websiteUrl: workspace.websiteUrl || '', industry: workspace.industry || '', targetAudience: workspace.targetAudience || '', markets: (workspace.markets || []).join(', '), brandVoice: workspace.brandVoice || '' })
  const [preferences, setPreferences] = useState({ executionCompleted: user.notificationPreferences?.executionCompleted !== false, executionFailed: user.notificationPreferences?.executionFailed !== false, workspaceInvites: user.notificationPreferences?.workspaceInvites !== false, weeklyDigest: Boolean(user.notificationPreferences?.weeklyDigest) })
  const [password, setPassword] = useState({ currentPassword: '', newPassword: '' })
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const saveProfile = useMutation({
    mutationFn: async () => (await api.put('/auth/profile', { ...profile, theme })).data,
    onSuccess: async () => { setMessage('Account settings saved.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['session'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Account details could not be saved.'),
  })
  const saveWorkspace = useMutation({
    mutationFn: async () => (await api.put(`/workspaces/${workspace.id}`, { ...workspaceData, markets: workspaceData.markets.split(',').map((item) => item.trim()).filter(Boolean) })).data,
    onSuccess: async () => { setMessage('Workspace settings saved.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['session'] }); await queryClient.invalidateQueries({ queryKey: ['workspaces'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Workspace details could not be saved. Workspace administrators can update these settings.'),
  })
  const savePrefs = useMutation({
    mutationFn: async () => (await api.put('/auth/notification-preferences', preferences)).data,
    onSuccess: async () => { setMessage('Notification preferences saved.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['session'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Notification preferences could not be saved.'),
  })
  const changePassword = useMutation({
    mutationFn: async () => (await api.post('/auth/change-password', password)).data,
    onSuccess: () => { localStorage.removeItem('auth_token'); setMessage('Password changed. Sign in again with your new password.'); window.setTimeout(() => navigate('/login'), 700) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Password could not be changed.'),
  })
  const inputProfile = (key: keyof typeof profile) => (event: React.ChangeEvent<HTMLInputElement>) => setProfile((current) => ({ ...current, [key]: event.target.value }))
  const inputWorkspace = (key: keyof typeof workspaceData) => (event: React.ChangeEvent<HTMLInputElement>) => setWorkspaceData((current) => ({ ...current, [key]: event.target.value }))
  const inputPassword = (key: keyof typeof password) => (event: React.ChangeEvent<HTMLInputElement>) => setPassword((current) => ({ ...current, [key]: event.target.value }))

  return <div className="page-stack settings-page">
    <PageHeader title="Settings" description="Manage your account, workspace context, appearance, notifications, and usage." actions={<Link className="button button-secondary button-md" to="/app/integrations"><Link2 size={14} /> AI and connectors</Link>} />
    <FormError message={error} />{message && <Notice kind="success">{message}</Notice>}
    <div className="settings-layout">
      <aside className="settings-index"><a href="#account">Account</a><a href="#workspace">Workspace</a><a href="#notifications">Notifications</a><a href="#security">Password & security</a><a href="#usage">Usage</a></aside>
      <div className="settings-sections">
        <section className="work-surface settings-section" id="account"><SectionTitle title="Account settings" /><div className="form-grid two-columns"><Field label="First name"><Input value={profile.firstName} onChange={inputProfile('firstName')} /></Field><Field label="Last name"><Input value={profile.lastName} onChange={inputProfile('lastName')} /></Field><Field label="Email address" hint="Email changes require a verification flow."><Input value={user.email} disabled /></Field><Field label="Workspace role"><Input value={user.role.replace(/_/g, ' ')} disabled /></Field></div><div className="theme-setting"><div><strong>Appearance</strong><small>Light mode is the starting view. Dark mode is available for low-light work.</small></div><div className="theme-choice-group">{(['light', 'dark', 'system'] as const).map((choice) => <button key={choice} className={theme === choice ? 'selected' : ''} onClick={() => setTheme(choice)}>{choice[0].toUpperCase() + choice.slice(1)}</button>)}</div></div><div className="settings-save-row"><span className="muted-text">Changes apply to this account.</span><Button variant="primary" onClick={() => saveProfile.mutate()} loading={saveProfile.isPending}><Save size={14} /> Save account</Button></div></section>

        <section className="work-surface settings-section" id="workspace"><SectionTitle title="Workspace and brand" trailing={<StatusTag status={user.role.replace(/_/g, ' ')} />} /><div className="form-grid two-columns"><Field label="Workspace name"><Input value={workspaceData.name} onChange={inputWorkspace('name')} /></Field><Field label="Company or brand"><Input value={workspaceData.companyName} onChange={inputWorkspace('companyName')} /></Field><Field label="Website"><Input type="url" value={workspaceData.websiteUrl} onChange={inputWorkspace('websiteUrl')} placeholder="https://example.com" /></Field><Field label="Industry"><Input value={workspaceData.industry} onChange={inputWorkspace('industry')} /></Field><Field label="Primary audience" className="span-two"><Input value={workspaceData.targetAudience} onChange={inputWorkspace('targetAudience')} /></Field><Field label="Markets" className="span-two"><Input value={workspaceData.markets} onChange={inputWorkspace('markets')} placeholder="United States, Europe" /></Field><Field label="Brand voice guidance" className="span-two"><Textarea rows={4} value={workspaceData.brandVoice} onChange={(event) => setWorkspaceData((current) => ({ ...current, brandVoice: event.target.value }))} maxLength={2000} placeholder="Tone, vocabulary, and communication principles" /></Field></div><div className="settings-save-row"><span className="muted-text">Workspace administrators can update these fields.</span><Button variant="primary" onClick={() => saveWorkspace.mutate()} loading={saveWorkspace.isPending}><Save size={14} /> Save workspace</Button></div></section>

        <section className="work-surface settings-section" id="notifications"><SectionTitle title="Notification preferences" /><div className="preference-list">{[
          ['executionCompleted', 'Workflow completed', 'Notify me when a saved marketing workflow completes.'],
          ['executionFailed', 'Workflow failed', 'Notify me when an execution fails and needs review.'],
          ['workspaceInvites', 'Workspace invitations', 'Notify me when workspace access changes.'],
          ['weeklyDigest', 'Weekly summary', 'Enable a weekly usage summary when digest email delivery is configured.'],
        ].map(([key, label, detail]) => <label className="preference-row" key={key}><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={preferences[key as keyof typeof preferences]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}</div><div className="settings-save-row"><span className="muted-text">In-app notifications are available. Email delivery requires SMTP.</span><Button variant="primary" onClick={() => savePrefs.mutate()} loading={savePrefs.isPending}><Save size={14} /> Save preferences</Button></div></section>

        <section className="work-surface settings-section" id="security"><SectionTitle title="Password and security" /><p className="section-note">Changing your password invalidates existing access tokens across your workspaces.</p><form className="form-grid two-columns" onSubmit={(event) => { event.preventDefault(); changePassword.mutate() }}><Field label="Current password"><Input type="password" autoComplete="current-password" value={password.currentPassword} onChange={inputPassword('currentPassword')} /></Field><Field label="New password" hint="At least 12 characters."><Input type="password" minLength={12} maxLength={200} autoComplete="new-password" value={password.newPassword} onChange={inputPassword('newPassword')} /></Field><div className="span-two settings-save-row"><span className="muted-text">Use a unique password for your account.</span><Button type="submit" variant="primary" loading={changePassword.isPending}><LockKeyhole size={14} /> Change password</Button></div></form></section>

        <section className="work-surface settings-section" id="usage"><SectionTitle title="Workspace usage" /><div className="usage-grid"><div><span>Plan</span><strong>{workspace.plan}</strong><small>Billing configuration is not connected.</small></div><div><span>Active projects</span><strong>{dashboard.data?.stats.totalProjects ?? '—'}</strong><small>Records in this workspace.</small></div><div><span>Websites analyzed</span><strong>{dashboard.data?.stats.websitesAnalyzed ?? '—'}</strong><small>Completed audit and quick-analysis tasks.</small></div><div><span>AI agent runs</span><strong>{dashboard.data?.stats.aiAgentExecutions ?? '—'}</strong><small>Completed specialist executions.</small></div></div></section>
      </div>
    </div>
  </div>
}

interface Member { id: string; role: WorkspaceRole; invitedAt: string; joinedAt?: string | null; user: { id: string; email: string; firstName: string; lastName: string } }
interface Invitation { id: string; email: string; role: string; expiresAt: string; createdAt: string }

export function TeamPage() {
  const queryClient = useQueryClient()
  const { workspace, user } = useSession()
  const canManage = ['owner', 'admin', 'super_admin'].includes(user.role)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('analyst')
  const [inviteUrl, setInviteUrl] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const membersQuery = useQuery({ queryKey: ['workspace-members', workspace.id], queryFn: async () => (await api.get<{ members: Member[] }>(`/workspaces/${workspace.id}/members`)).data.members })
  const invitationsQuery = useQuery({ queryKey: ['workspace-invitations', workspace.id], queryFn: async () => (await api.get<{ invitations: Invitation[] }>(`/workspaces/${workspace.id}/invitations`)).data.invitations, enabled: canManage })
  const invite = useMutation({
    mutationFn: async () => (await api.post<{ invitation: Invitation; inviteUrl?: string }>(`/workspaces/${workspace.id}/invitations`, { email, role })).data,
    onSuccess: async (result) => { setEmail(''); setInviteUrl(result.inviteUrl || ''); setMessage(result.inviteUrl ? 'Invitation created. Copy the one-time link to share it.' : 'Invitation email sent.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['workspace-invitations', workspace.id] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Invitation could not be created.'),
  })
  const updateRole = useMutation({
    mutationFn: async ({ id, nextRole }: { id: string; nextRole: string }) => api.put(`/workspaces/${workspace.id}/members/${id}`, { role: nextRole }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace-members', workspace.id] }),
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Member role could not be changed.'),
  })
  const removeMember = useMutation({
    mutationFn: async (id: string) => api.delete(`/workspaces/${workspace.id}/members/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace-members', workspace.id] }),
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Workspace member could not be removed.'),
  })
  const cancelInvite = useMutation({
    mutationFn: async (id: string) => api.delete(`/workspaces/${workspace.id}/invitations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace-invitations', workspace.id] }),
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Invitation could not be cancelled.'),
  })

  return <div className="page-stack">
    <PageHeader title="Workspace team" description={`Manage who can access ${workspace.name} and the role each member has.`} />
    <FormError message={error} />{message && <Notice kind="success">{message}</Notice>}
    {canManage && <section className="work-surface invite-surface"><SectionTitle title="Invite a teammate" /><form className="inline-add-form invite-form" onSubmit={(event) => { event.preventDefault(); invite.mutate() }}><Field label="Email address"><Input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="teammate@company.com" /></Field><Field label="Workspace role"><Select value={role} onChange={(event) => setRole(event.target.value)}><option value="admin">Admin</option><option value="marketing_manager">Marketing Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></Select></Field><Button variant="primary" type="submit" loading={invite.isPending}><UserPlus size={14} /> Invite</Button></form>
      {inviteUrl && <div className="manual-invite"><span><Link2 size={14} /> One-time invitation link · expires in 7 days</span><code>{inviteUrl}</code><Button size="sm" onClick={() => { void navigator.clipboard.writeText(inviteUrl); setMessage('Invitation link copied to clipboard.') }}><Copy size={13} /> Copy link</Button></div>}
    </section>}
    <section className="work-surface team-list-surface"><SectionTitle title="Workspace members" trailing={<span className="muted-text">{membersQuery.data?.length ?? '—'} members</span>} />
      {membersQuery.isLoading ? <LoadingBlock /> : membersQuery.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Member</th><th>Role</th><th>Joined</th><th /></tr></thead><tbody>{membersQuery.data.map((member) => <tr key={member.id}><td><strong>{member.user.firstName} {member.user.lastName}</strong><span className="table-secondary">{member.user.email}</span></td><td>{canManage && member.role !== 'owner' ? <Select className="role-select" value={member.role} onChange={(event) => updateRole.mutate({ id: member.id, nextRole: event.target.value })}><option value="admin">Admin</option><option value="marketing_manager">Marketing Manager</option><option value="analyst">Analyst</option><option value="viewer">Viewer</option></Select> : <span className="role-label">{member.role.replace(/_/g, ' ')}</span>}</td><td>{member.joinedAt ? format(new Date(member.joinedAt), 'MMM d, yyyy') : 'Invitation pending'}</td><td>{canManage && member.role !== 'owner' && member.user.id !== user.id && <button className="icon-button icon-danger" aria-label={`Remove ${member.user.email}`} onClick={() => { if (window.confirm(`Remove ${member.user.email} from this workspace?`)) removeMember.mutate(member.id) }} disabled={removeMember.isPending}><Trash2 size={14} /></button>}</td></tr>)}</tbody></table></div> : <EmptyState title="Workspace members could not be loaded" detail="Your role may not have access to the team directory." />}
    </section>
    {canManage && <section className="work-surface team-list-surface"><SectionTitle title="Pending invitations" />{invitationsQuery.isLoading ? <LoadingBlock /> : invitationsQuery.data?.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th /></tr></thead><tbody>{invitationsQuery.data.map((invitation) => <tr key={invitation.id}><td>{invitation.email}</td><td><span className="role-label">{invitation.role.replace(/_/g, ' ')}</span></td><td>{format(new Date(invitation.expiresAt), 'MMM d, yyyy')}</td><td><button className="text-link danger-text" onClick={() => cancelInvite.mutate(invitation.id)} disabled={cancelInvite.isPending}>Cancel invite <X size={13} /></button></td></tr>)}</tbody></table></div> : <p className="empty-inline muted-text">There are no pending invitations.</p>}</section>}
    <div className="roles-reference"><ShieldCheck size={15} /><span><strong>Roles</strong> · Owner controls the workspace. Admin manages members and settings. Marketing Manager runs workflows and edits projects. Analyst runs analysis. Viewer reviews saved work.</span></div>
  </div>
}
