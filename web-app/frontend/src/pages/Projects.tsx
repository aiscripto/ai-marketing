import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, FileText, Gauge, Globe, LoaderCircle, Plus, Trash2, Upload, Users, X } from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import api from '../lib/api'
import type { Competitor, Project, ProjectDocument } from '../lib/types'
import { Button, EmptyState, Field, FormError, Input, LoadingBlock, PageHeader, SectionTitle, Select, StatusTag, Textarea } from '../components/ui'

type ProjectDraft = {
  name: string; companyName: string; websiteUrl: string; industry: string; description: string;
  targetAudience: string; markets: string; brandVoice: string; objectives: string; competitorUrls: string;
}

const blankProject: ProjectDraft = {
  name: '', companyName: '', websiteUrl: '', industry: '', description: '', targetAudience: '',
  markets: '', brandVoice: '', objectives: '', competitorUrls: '',
}

function siteName(url?: string | null) {
  if (!url) return 'Website not set'
  try { return new URL(url).hostname } catch { return url }
}

function ProjectRow({ project }: { project: Project }) {
  return <tr>
    <td><Link className="table-primary" to={`/app/projects/${project.id}`}>{project.name}</Link><span className="table-secondary">{project.companyName || 'Company details pending'}</span></td>
    <td>{project.websiteUrl ? <a className="table-link" href={project.websiteUrl} target="_blank" rel="noreferrer">{siteName(project.websiteUrl)}</a> : <span className="muted-text">Not set</span>}</td>
    <td>{project.industry || <span className="muted-text">—</span>}</td>
    <td><span className={`project-status status-${project.status}`}>{project.status}</span></td>
    <td>{project.latestAudit?.overallScore == null ? <span className="muted-text">No score</span> : <span className="score-value">{Math.round(project.latestAudit.overallScore)}<small>/100</small></span>}</td>
    <td className="numeric-cell">{project.taskCount || 0}</td>
    <td><Link className="row-arrow" to={`/app/projects/${project.id}`} aria-label={`Open ${project.name}`}><ArrowRight size={15} /></Link></td>
  </tr>
}

export function ProjectsPage() {
  const query = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const [filter, setFilter] = useState('all')
  const rows = useMemo(() => (query.data || []).filter((project) => filter === 'all' || project.status === filter), [query.data, filter])
  return <div className="page-stack">
    <PageHeader title="Marketing projects" description="Keep each brand, website, competitor set, and workflow history together." actions={<Link to="/app/projects/new" className="button button-primary button-md"><Plus size={15} /> New project</Link>} />
    <div className="toolbar-row"><div className="toolbar-caption">{query.data?.length ?? 0} projects</div><div className="filter-group" aria-label="Filter projects">
      {['all', 'active', 'draft', 'archived'].map((value) => <button className={`filter-option ${filter === value ? 'selected' : ''}`} key={value} onClick={() => setFilter(value)}>{value === 'all' ? 'All projects' : value}</button>)}
    </div></div>
    {query.isLoading ? <LoadingBlock /> : query.isError ? <EmptyState title="Projects could not load" detail="Check the workspace connection and try again." action={<Button onClick={() => void query.refetch()}>Reload projects</Button>} /> : rows.length ? <section className="work-surface table-surface"><div className="table-scroll"><table className="data-table project-table"><thead><tr><th>Project</th><th>Website</th><th>Industry</th><th>Status</th><th>Latest score</th><th>Workflows</th><th /></tr></thead><tbody>{rows.map((project) => <ProjectRow key={project.id} project={project} />)}</tbody></table></div></section> : <EmptyState title={filter === 'all' ? 'Start with a marketing project' : `No ${filter} projects`} detail={filter === 'all' ? 'Add a brand, website, and audience so every marketing workflow starts with the right context.' : 'Change the filter to see projects in another state.'} action={filter === 'all' ? <Link className="button button-primary button-sm" to="/app/projects/new">Create a project</Link> : undefined} />}
  </div>
}

export function ProjectFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(blankProject)
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: async (input: ProjectDraft) => (await api.post<{ project: Project }>('/projects', {
      name: input.name,
      companyName: input.companyName,
      websiteUrl: input.websiteUrl,
      industry: input.industry,
      description: input.description,
      targetAudience: input.targetAudience,
      markets: input.markets.split(',').map((item) => item.trim()).filter(Boolean),
      brandVoice: input.brandVoice,
      objectives: input.objectives.split('\n').map((item) => item.trim()).filter(Boolean),
      competitors: input.competitorUrls.split('\n').map((url) => url.trim()).filter(Boolean).map((url) => ({ url, name: siteName(url) })),
    })).data.project,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      navigate(`/app/projects/${project.id}`)
    },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Project could not be created. Review the website URL and try again.'),
  })
  const update = (key: keyof ProjectDraft) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); create.mutate(draft) }
  return <div className="page-stack narrow-page">
    <PageHeader title="Create a project" description="Add the context that keeps your marketing analysis focused." actions={<Link to="/app/projects" className="text-link"><ArrowLeft size={14} /> All projects</Link>} />
    <form className="form-surface project-form" onSubmit={submit}>
      <section className="form-section"><SectionTitle title="Project identity" /><div className="form-grid two-columns">
        <Field label="Project name"><Input required minLength={2} maxLength={120} value={draft.name} onChange={update('name')} placeholder="Northstar launch" autoFocus /></Field>
        <Field label="Company or brand"><Input maxLength={160} value={draft.companyName} onChange={update('companyName')} placeholder="Northstar Studio" /></Field>
        <Field label="Website URL" hint="Use the public website you want to analyze."><Input type="url" maxLength={2048} value={draft.websiteUrl} onChange={update('websiteUrl')} placeholder="https://example.com" /></Field>
        <Field label="Industry"><Select value={draft.industry} onChange={update('industry')}><option value="">Choose an industry</option>{['SaaS & software', 'E-commerce', 'Agency & services', 'Healthcare', 'Finance', 'Education', 'Real estate', 'Local business', 'Creator & course', 'Marketplace', 'Other'].map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
        <Field label="Target audience" className="span-two"><Input maxLength={1000} value={draft.targetAudience} onChange={update('targetAudience')} placeholder="Who needs this product or service?" /></Field>
      </div></section>
      <section className="form-section"><SectionTitle title="Brand and market context" /><div className="form-grid two-columns">
        <Field label="Markets" hint="Separate locations or regions with commas."><Input value={draft.markets} onChange={update('markets')} placeholder="United States, Canada" /></Field>
        <Field label="Brand voice"><Input maxLength={2000} value={draft.brandVoice} onChange={update('brandVoice')} placeholder="Clear, pragmatic, and reassuring" /></Field>
        <Field label="Project description" className="span-two"><Textarea rows={3} maxLength={4000} value={draft.description} onChange={update('description')} placeholder="What does this business offer? Include useful context for the analysis." /></Field>
        <Field label="Marketing objectives" hint="One objective per line." className="span-two"><Textarea rows={3} value={draft.objectives} onChange={update('objectives')} placeholder={'Improve qualified demos\nClarify the main value proposition'} /></Field>
      </div></section>
      <section className="form-section"><SectionTitle title="Competitors" /><Field label="Competitor website URLs" hint="Add one public HTTP or HTTPS URL per line. You can add more from the project page."><Textarea rows={3} value={draft.competitorUrls} onChange={update('competitorUrls')} placeholder={'https://competitor-one.com\nhttps://competitor-two.com'} /></Field></section>
      <FormError message={error} />
      <div className="form-footer"><span className="muted-text">You can edit these details at any time.</span><div><Link className="button button-quiet button-md" to="/app/projects">Cancel</Link><Button type="submit" variant="primary" loading={create.isPending}>Create project <ArrowRight size={14} /></Button></div></div>
    </form>
  </div>
}

export function ProjectDetailPage() {
  const { projectId = '' } = useParams()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'overview' | 'competitors' | 'documents' | 'history'>('overview')
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [competitorUrl, setCompetitorUrl] = useState('')
  const [competitorName, setCompetitorName] = useState('')
  const [expandedDocument, setExpandedDocument] = useState<string | null>(null)
  const projectQuery = useQuery({ queryKey: ['project', projectId], queryFn: async () => (await api.get<{ project: Project }>(`/projects/${projectId}`)).data.project, enabled: Boolean(projectId) })
  const project = projectQuery.data
  const [draft, setDraft] = useState<ProjectDraft>(blankProject)

  const editProject = useMutation({
    mutationFn: async () => api.put(`/projects/${projectId}`, {
      name: draft.name, companyName: draft.companyName, websiteUrl: draft.websiteUrl, industry: draft.industry,
      description: draft.description, targetAudience: draft.targetAudience, markets: draft.markets.split(',').map((item) => item.trim()).filter(Boolean),
      brandVoice: draft.brandVoice, objectives: draft.objectives.split('\n').map((item) => item.trim()).filter(Boolean),
    }),
    onSuccess: async () => { setEditing(false); await queryClient.invalidateQueries({ queryKey: ['project', projectId] }); await queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Project details could not be saved.'),
  })
  const addCompetitor = useMutation({
    mutationFn: async () => api.post(`/projects/${projectId}/competitors`, { url: competitorUrl, name: competitorName || undefined }),
    onSuccess: async () => { setCompetitorUrl(''); setCompetitorName(''); await queryClient.invalidateQueries({ queryKey: ['project', projectId] }); await queryClient.invalidateQueries({ queryKey: ['projects'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Competitor could not be added.'),
  })
  const uploadDocument = useMutation({
    mutationFn: async (file: File) => {
      const body = new FormData()
      body.append('file', file)
      return api.post(`/projects/${projectId}/documents`, body)
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['project', projectId] }); setTab('documents') },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'The document could not be processed.'),
  })
  const deleteDocument = useMutation({ mutationFn: (id: string) => api.delete(`/projects/${projectId}/documents/${id}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }) })
  const deleteCompetitor = useMutation({ mutationFn: (competitorId: string) => api.delete(`/projects/${projectId}/competitors/${competitorId}`), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['project', projectId] }) })

  if (projectQuery.isLoading) return <div className="page-stack"><LoadingBlock label="Loading project" /></div>
  if (!project) return <div className="page-stack"><PageHeader title="Project" /><EmptyState title="Project could not be found" detail="It may have been removed or belong to a different workspace." action={<Link to="/app/projects" className="button button-secondary button-sm">Back to projects</Link>} /></div>

  const openEdit = () => {
    setDraft({
      ...blankProject,
      name: project.name,
      companyName: project.companyName || '',
      websiteUrl: project.websiteUrl || '',
      industry: project.industry || '',
      description: project.description || '',
      targetAudience: project.targetAudience || '',
      markets: project.markets.join(', '),
      brandVoice: project.brandVoice || '',
      objectives: project.objectives || '',
    })
    setEditing(true)
    setError('')
  }
  const docs = project.documents || []
  const tasks = project.tasks || []
  const audit = project.latestAudit || tasks.find((task) => task.auditResult)?.auditResult

  return <div className="page-stack">
    <PageHeader title={project.name} description={`${project.companyName || 'Brand details pending'} · ${siteName(project.websiteUrl)}`} actions={<><Button onClick={openEdit}>Edit project</Button><Link className="button button-primary button-md" to={`/app/audit?projectId=${project.id}`}><GaugeIcon /> Run website audit</Link></>} />
    <div className="project-summary-line"><span><Building2 size={15} />{project.industry || 'Industry not set'}</span><span><Users size={15} />{project.targetAudience || 'Audience not set'}</span><span><Globe size={15} />{project.markets.length ? project.markets.join(', ') : 'Markets not set'}</span><span><CalendarDays size={15} />Updated {formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}</span></div>
    <nav className="tabs-line" aria-label="Project sections">{(['overview', 'competitors', 'documents', 'history'] as const).map((item) => <button className={tab === item ? 'selected' : ''} onClick={() => { setTab(item); setError('') }} key={item}>{item === 'history' ? 'Workflow history' : item[0].toUpperCase() + item.slice(1)}{item === 'competitors' && <small>{project.competitors.length}</small>}{item === 'documents' && <small>{docs.length}</small>}</button>)}</nav>
    <FormError message={error} />

    {tab === 'overview' && <div className="dashboard-grid project-overview-grid">
      <section className="work-surface project-info-surface"><SectionTitle title="Project context" trailing={<button className="text-link" onClick={openEdit}>Edit details <ArrowRight size={13} /></button>} />
        <div className="project-context-list"><div><span>Website</span>{project.websiteUrl ? <a href={project.websiteUrl} target="_blank" rel="noreferrer">{project.websiteUrl}</a> : <strong className="muted-text">Not set</strong>}</div><div><span>Target audience</span><strong>{project.targetAudience || 'Not set'}</strong></div><div><span>Brand voice</span><strong>{project.brandVoice || 'Not set'}</strong></div><div><span>Objectives</span><strong className="preserve-lines">{project.objectives || 'Add the marketing outcomes this project should focus on.'}</strong></div><div><span>Description</span><strong>{project.description || 'Add context about the business and its offer.'}</strong></div></div>
      </section>
      <section className="work-surface score-summary-surface"><SectionTitle title="Latest audit" trailing={audit && <Link className="text-link" to={`/app/audit/results/${tasks.find((task) => task.auditResult)?.id || tasks.find((task) => task.type === 'audit')?.id}`}>View result <ArrowRight size={14} /></Link>} />
        {audit ? <><div className="score-ledger"><div><span>Weighted score</span><strong>{audit.overallScore == null ? 'Incomplete' : <>{Math.round(audit.overallScore)}<small>/100</small></>}</strong></div><div><span>Coverage</span><strong>{Number((audit.rawFindings as any)?.scoreCoverage ?? 0)}<small>%</small></strong></div><div><span>Audit date</span><strong className="score-date">{format(new Date(audit.createdAt), 'MMM d, yyyy')}</strong></div></div><p className="summary-copy">{audit.executiveSummary}</p></> : <EmptyState title="No audit results" detail="Run the five-agent website audit to produce a verified crawl and score coverage." action={<Link className="button button-primary button-sm" to={`/app/audit?projectId=${project.id}`}>Configure audit</Link>} />}
      </section>
      <section className="work-surface span-two"><SectionTitle title="Recent workflows" trailing={<button className="text-link" onClick={() => setTab('history')}>Full history <ArrowRight size={14} /></button>} />
        {tasks.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Workflow</th><th>Created</th><th>Status</th><th>Report</th><th /></tr></thead><tbody>{tasks.slice(0, 8).map((task) => <tr key={task.id}><td><strong>{task.title}</strong><span className="table-secondary">{task.type.replace(/-/g, ' ')}</span></td><td>{format(new Date(task.createdAt), 'MMM d, yyyy · h:mm a')}</td><td><StatusTag status={task.status} /></td><td>{task.report ? <Link className="table-link" to={`/app/reports/${task.report.id}`}>{task.report.title}</Link> : <span className="muted-text">—</span>}</td><td>{task.executions?.[0] && <Link className="row-arrow" to={`/app/executions/${task.executions[0].id}`} aria-label="Open execution"><ArrowRight size={15} /></Link>}</td></tr>)}</tbody></table></div> : <EmptyState title="No workflows run yet" detail="Start with a full audit or choose a single-purpose marketing tool." action={<Link className="button button-secondary button-sm" to="/app/tools">Explore workflows</Link>} />}
      </section>
    </div>}

    {tab === 'competitors' && <section className="work-surface">
      <SectionTitle title="Tracked competitors" />
      {project.competitors.length ? <div className="competitor-list">{project.competitors.map((competitor) => <CompetitorRow key={competitor.id} competitor={competitor} onDelete={() => deleteCompetitor.mutate(competitor.id)} busy={deleteCompetitor.isPending} />)}</div> : <EmptyState title="No competitors added" detail="Competitor scans use URLs supplied here or in an individual workflow. Discovery is not simulated." />}
      <form className="inline-add-form" onSubmit={(event) => { event.preventDefault(); addCompetitor.mutate() }}><Input type="url" required value={competitorUrl} onChange={(event) => setCompetitorUrl(event.target.value)} placeholder="https://competitor.com" /><Input value={competitorName} onChange={(event) => setCompetitorName(event.target.value)} placeholder="Display name (optional)" /><Button type="submit" variant="primary" loading={addCompetitor.isPending}><Plus size={14} /> Add competitor</Button></form>
    </section>}

    {tab === 'documents' && <section className="work-surface">
      <SectionTitle title="Brand documents" trailing={<label className="button button-secondary button-sm upload-label"><Upload size={14} /> Upload document<input type="file" accept=".pdf,.txt,.md,.csv,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDocument.mutate(file); event.target.value = '' }} /></label>} />
      <p className="section-note">Uploaded text is available as project context for audit and content workflows. PDF, TXT, Markdown, CSV, and JSON files up to 10 MB are supported; extracted text is capped at 100,000 characters.</p>
      {uploadDocument.isPending && <div className="upload-progress"><LoaderCircle className="spin" size={15} /> Processing document…</div>}
      {docs.length ? <div className="document-list">{docs.map((document) => <DocumentRow key={document.id} document={document} expanded={expandedDocument === document.id} onToggle={() => setExpandedDocument(expandedDocument === document.id ? null : document.id)} onDelete={() => deleteDocument.mutate(document.id)} deleting={deleteDocument.isPending} projectId={project.id} />)}</div> : <EmptyState title="No brand documents" detail="Upload positioning, voice, product, or offer documents to give future workflows more project context." />}
    </section>}

    {tab === 'history' && <section className="work-surface"><SectionTitle title="Workflow history" />{tasks.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Workflow</th><th>Started</th><th>State</th><th>Report</th><th /></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td><strong>{task.title}</strong><span className="table-secondary">{task.type.replace(/-/g, ' ')}</span></td><td>{format(new Date(task.createdAt), 'MMM d, yyyy · h:mm a')}</td><td><StatusTag status={task.status} /></td><td>{task.report ? <Link className="table-link" to={`/app/reports/${task.report.id}`}>{task.report.title}</Link> : <span className="muted-text">No report</span>}</td><td>{task.executions?.[0] && <Link className="row-arrow" to={`/app/executions/${task.executions[0].id}`} aria-label="View execution"><ArrowRight size={15} /></Link>}</td></tr>)}</tbody></table></div> : <EmptyState title="No workflow history" detail="Run a workflow to start the project record." />}</section>}

    {editing && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(false) }}><section className="dialog-panel project-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-project-title">
      <header className="dialog-heading"><div><h2 id="edit-project-title">Edit project details</h2><p>Changes apply to future workflows.</p></div><button className="icon-button" onClick={() => setEditing(false)} aria-label="Close dialog"><X size={17} /></button></header>
      <form className="edit-project-form" onSubmit={(event) => { event.preventDefault(); setError(''); editProject.mutate() }}><div className="form-grid two-columns">
        <Field label="Project name"><Input required value={draft.name} onChange={updateField('name')} /></Field><Field label="Company or brand"><Input value={draft.companyName} onChange={updateField('companyName')} /></Field>
        <Field label="Website URL"><Input type="url" value={draft.websiteUrl} onChange={updateField('websiteUrl')} /></Field><Field label="Industry"><Input value={draft.industry} onChange={updateField('industry')} /></Field>
        <Field label="Target audience" className="span-two"><Input value={draft.targetAudience} onChange={updateField('targetAudience')} /></Field>
        <Field label="Markets" className="span-two"><Input value={draft.markets} onChange={updateField('markets')} /></Field>
        <Field label="Brand voice" className="span-two"><Input value={draft.brandVoice} onChange={updateField('brandVoice')} /></Field>
        <Field label="Objectives" className="span-two"><Textarea rows={3} value={draft.objectives} onChange={updateField('objectives')} /></Field>
        <Field label="Description" className="span-two"><Textarea rows={3} value={draft.description} onChange={updateField('description')} /></Field>
      </div><FormError message={error} /><div className="dialog-actions"><Button type="button" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" variant="primary" loading={editProject.isPending}>Save changes <Check size={14} /></Button></div></form>
    </section></div>}
  </div>

  function updateField(key: keyof ProjectDraft) {
    return (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  }
}

function CompetitorRow({ competitor, onDelete, busy }: { competitor: Competitor; onDelete: () => void; busy: boolean }) {
  return <div className="competitor-row"><span className="domain-badge">{siteName(competitor.url).slice(0, 1).toUpperCase()}</span><span className="competitor-details"><strong>{competitor.name}</strong><a href={competitor.url} target="_blank" rel="noreferrer">{competitor.url}</a>{competitor.notes && <small>{competitor.notes}</small>}</span><a className="button button-quiet button-sm" href={`/app/tools/competitors?projectId=${competitor.projectId}`}><Globe size={14} /> Compare</a><button className="icon-button icon-danger" aria-label={`Remove ${competitor.name}`} disabled={busy} onClick={onDelete}><Trash2 size={15} /></button></div>
}

function DocumentRow({ document, expanded, onToggle, onDelete, deleting, projectId }: { document: ProjectDocument; expanded: boolean; onToggle: () => void; onDelete: () => void; deleting: boolean; projectId: string }) {
  const detail = useQuery({ queryKey: ['project-document', projectId, document.id], queryFn: async () => (await api.get<{ document: ProjectDocument }>(`/projects/${projectId}/documents/${document.id}`)).data.document, enabled: expanded })
  return <div className="document-row"><div className="document-main"><span className="document-icon"><FileText size={16} /></span><span className="document-copy"><strong>{document.fileName}</strong><small>{document.mediaType} · {(document.sizeBytes / 1024).toFixed(0)} KB · Added {format(new Date(document.createdAt), 'MMM d, yyyy')}</small></span><button className="text-link" onClick={onToggle}>{expanded ? 'Hide text' : 'View extracted text'}</button><button className="icon-button icon-danger" aria-label={`Delete ${document.fileName}`} disabled={deleting} onClick={onDelete}><Trash2 size={15} /></button></div>{expanded && (detail.isLoading ? <LoadingBlock label="Loading extracted text" /> : <pre className="document-extract">{detail.data?.extractedText || 'This document has no extracted text.'}</pre>)}</div>
}

function GaugeIcon() { return <Gauge size={15} /> }
