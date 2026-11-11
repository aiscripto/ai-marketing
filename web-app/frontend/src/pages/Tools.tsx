import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowRight, BarChart3, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, FileBarChart2,
  Globe2, Mail, Megaphone, PencilLine, RefreshCw, Search, Sparkles, Target, WandSparkles,
} from 'lucide-react'
import { eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek, subMonths, addMonths, isWithinInterval } from 'date-fns'
import api, { downloadFile } from '../lib/api'
import type { ContentCalendar, ContentItem, Project, Task } from '../lib/types'
import { Button, EmptyState, Field, FormError, Input, LoadingBlock, Notice, PageHeader, SectionTitle, Select, StatusTag, Textarea } from '../components/ui'

export const tools = [
  { id: 'quick', label: 'Quick marketing audit', group: 'Website analysis', icon: Search, description: 'A concise homepage snapshot of messaging, CTA, trust, and mobile readiness.' },
  { id: 'audit', label: 'Five-agent website audit', group: 'Website analysis', icon: Target, description: 'Parallel content, conversion, competitor, technical SEO, and strategy analysis.' },
  { id: 'copy', label: 'Marketing copy', group: 'Content & brand', icon: PencilLine, description: 'Review existing website copy and write stronger headlines, sections, and calls to action.' },
  { id: 'emails', label: 'Email sequences', group: 'Content & brand', icon: Mail, description: 'Prepare editable welcome, nurture, launch, and follow-up sequences.' },
  { id: 'social', label: 'Social media calendar', group: 'Content & brand', icon: CalendarDays, description: 'Plan and edit a 30-day set of platform-specific posts.' },
  { id: 'ads', label: 'Advertising campaigns', group: 'Campaign planning', icon: Megaphone, description: 'Create editable platform ad variations, audiences, keywords, and budget notes.' },
  { id: 'funnel', label: 'Sales funnel analysis', group: 'Website analysis', icon: BarChart3, description: 'Review awareness through retention, funnel friction, and optimization priorities.' },
  { id: 'competitors', label: 'Competitor intelligence', group: 'Website analysis', icon: Globe2, description: 'Compare the project website with explicit competitor URLs and their visible signals.' },
  { id: 'landing', label: 'Landing page CRO', group: 'Website analysis', icon: Target, description: 'Evaluate landing page messaging, forms, trust, structure, and conversion friction.' },
  { id: 'launch', label: 'Product launch plan', group: 'Campaign planning', icon: Sparkles, description: 'Build product positioning, a launch roadmap, and an editable preparation checklist.' },
  { id: 'proposal', label: 'Client proposal', group: 'Campaign planning', icon: BriefcaseBusiness, description: 'Turn client needs, scope, timeline, and pricing into a polished proposal draft.' },
  { id: 'report', label: 'Marketing report', group: 'Reports', icon: FileBarChart2, description: 'Assemble a client-ready Markdown report from verified website evidence.' },
  { id: 'report-pdf', label: 'PDF report content', group: 'Reports', icon: FileBarChart2, description: 'Generate report content for the branded PDF export workflow.' },
  { id: 'seo', label: 'SEO intelligence', group: 'Website analysis', icon: BarChart3, description: 'Review crawl-visible SEO signals, metadata, content, and search intent opportunities.' },
  { id: 'brand', label: 'Brand intelligence', group: 'Content & brand', icon: WandSparkles, description: 'Develop brand voice guidance, vocabulary, messaging hierarchy, and examples.' },
] as const

const toolById = new Map(tools.map((tool) => [tool.id, tool]))

export function ToolCatalogPage() {
  const [search, setSearch] = useState('')
  const grouped = useMemo(() => {
    const filtered = tools.filter((tool) => `${tool.label} ${tool.description} ${tool.group}`.toLowerCase().includes(search.toLowerCase()))
    return ['Website analysis', 'Content & brand', 'Campaign planning', 'Reports'].map((group) => ({ group, items: filtered.filter((tool) => tool.group === group) })).filter((section) => section.items.length)
  }, [search])
  return <div className="page-stack">
    <PageHeader title="AI marketing tools" description="Run each original marketing workflow from a project context and keep its output in your workspace." actions={<Link className="button button-primary button-md" to="/app/audit"><Target size={15} /> Full audit</Link>} />
    <div className="catalog-search"><Search size={15} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filter workflows" aria-label="Filter marketing workflows" /><span>{tools.length} workflows</span></div>
    {grouped.length ? grouped.map(({ group, items }) => <section className="tool-group" key={group}><SectionTitle title={group} /><div className="tool-list">{items.map(({ id, label, icon: Icon, description }) => <Link className="tool-list-row" key={id} to={id === 'audit' ? '/app/audit' : `/app/tools/${id}`}>
      <span className="tool-icon"><Icon size={17} strokeWidth={1.8} /></span><span className="tool-list-copy"><strong>{label}</strong><small>{description}</small></span><span className="tool-source">{id === 'quick' ? '/market quick' : `/market ${id}`}</span><ArrowRight size={15} className="tool-row-arrow" />
    </Link>)}</div></section>) : <EmptyState title="No matching workflows" detail="Try a different keyword or clear the filter." action={<Button onClick={() => setSearch('')}>Clear filter</Button>} />}
    <p className="connector-note">AI outputs are generated only when a provider is configured. Crawl observations, AI recommendations, unavailable analytics, and publishing status remain clearly separated.</p>
  </div>
}

export function ToolFormPage() {
  const { toolName = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const metadata = toolById.get(toolName as typeof tools[number]['id'])
  const projectQuery = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '')
  const [error, setError] = useState('')
  const [input, setInput] = useState<Record<string, any>>({ title: '', websiteUrl: '', topic: '', sequenceType: 'welcome', days: 30, platforms: ['linkedin', 'instagram'], competitorUrls: '', objective: 'Lead generation', budget: '', clientName: '', serviceScope: '', deliverables: '', timeline: '', additionalInstructions: '' })
  const selected = projectQuery.data?.find((project) => project.id === projectId)
  useEffect(() => {
    if (selected) setInput((current) => ({ ...current, websiteUrl: current.websiteUrl || selected.websiteUrl || '', competitorUrls: current.competitorUrls || selected.competitors.map((item) => item.url).join('\n'), topic: current.topic || selected.companyName || selected.name }))
  }, [selected?.id])

  const run = useMutation({
    mutationFn: async () => (await api.post<{ taskId: string; executionId: string }>(`/tools/${toolName}/run`, {
      projectId,
      input: {
        ...input,
        competitorUrls: String(input.competitorUrls || '').split('\n').map((url: string) => url.trim()).filter(Boolean),
        platforms: Array.isArray(input.platforms) ? input.platforms : [],
        days: Number(input.days || 30),
      },
    })).data,
    onSuccess: (result) => navigate(`/app/executions/${result.executionId}`),
    onError: (cause: any) => setError(cause?.response?.data?.error || 'The workflow could not be queued. Check your project and inputs.'),
  })
  if (!metadata) return <div className="page-stack"><PageHeader title="Marketing workflow" /><EmptyState title="Workflow not found" detail="Choose one of the available workflows from the catalog." action={<Link className="button button-secondary button-sm" to="/app/tools">Browse workflows</Link>} /></div>

  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setInput((current) => ({ ...current, [key]: event.target.value }))
  const togglePlatform = (platform: string) => setInput((current) => ({ ...current, platforms: current.platforms.includes(platform) ? current.platforms.filter((item: string) => item !== platform) : [...current.platforms, platform] }))
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); run.mutate() }
  const title = metadata.label
  return <div className="page-stack narrow-page">
    <PageHeader title={title} description={metadata.description} actions={<Link to="/app/tools" className="text-link"><ChevronLeft size={15} /> All tools</Link>} />
    <form className="form-surface workflow-form" onSubmit={submit}>
      <section className="form-section"><SectionTitle title="Project context" /><div className="form-grid two-columns">
        <Field label="Marketing project" className="span-two"><Select required value={projectId} onChange={(event) => { setProjectId(event.target.value); setInput((current) => ({ ...current, websiteUrl: '', competitorUrls: '' })) }}><option value="">Choose a project</option>{(projectQuery.data || []).map((project) => <option key={project.id} value={project.id}>{project.name}{project.websiteUrl ? ` · ${project.websiteUrl}` : ''}</option>)}</Select></Field>
        {['quick', 'copy', 'competitors', 'funnel', 'landing', 'report', 'report-pdf', 'seo', 'brand', 'ads'].includes(toolName) && <Field label="Website URL" className="span-two" hint="The crawler accepts public HTTP and HTTPS addresses."><Input type="url" value={input.websiteUrl} onChange={set('websiteUrl')} placeholder="https://example.com" /></Field>}
        {toolName === 'quick' && <div className="form-callout span-two">The quick snapshot scans the homepage and does not launch five specialist agents.</div>}
        {toolName === 'emails' && <Field label="Sequence type"><Select value={input.sequenceType} onChange={set('sequenceType')}><option value="welcome">Welcome sequence</option><option value="nurture">Lead nurture sequence</option><option value="launch">Product launch sequence</option></Select></Field>}
        {toolName === 'emails' && <Field label="Audience or offer"><Input value={input.topic} onChange={set('topic')} placeholder="New trial users, new product buyers…" /></Field>}
        {toolName === 'social' && <Field label="Calendar topic or campaign" className="span-two"><Input required value={input.topic} onChange={set('topic')} placeholder="The message or offer this calendar should support" /></Field>}
        {toolName === 'social' && <><Field label="Calendar length"><Select value={String(input.days)} onChange={set('days')}><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select></Field><div className="form-field"><span className="field-label">Platforms</span><div className="platform-select">{['linkedin', 'instagram', 'facebook', 'twitter'].map((platform) => <label key={platform} className="check-option"><input type="checkbox" checked={input.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /><span>{platform === 'twitter' ? 'X' : platform[0].toUpperCase() + platform.slice(1)}</span></label>)}</div></div></>}
        {toolName === 'ads' && <><Field label="Campaign objective"><Select value={input.objective} onChange={set('objective')}><option>Lead generation</option><option>Awareness</option><option>Website traffic</option><option>Sales</option><option>App installs</option></Select></Field><Field label="Budget range or cap"><Input value={input.budget} onChange={set('budget')} placeholder="Optional planning amount" /></Field><div className="form-field span-two"><span className="field-label">Advertising channels</span><div className="platform-select">{['Google', 'Facebook', 'Instagram', 'LinkedIn'].map((platform) => <label key={platform} className="check-option"><input type="checkbox" checked={input.platforms.includes(platform.toLowerCase())} onChange={() => togglePlatform(platform.toLowerCase())} /><span>{platform}</span></label>)}</div></div></>}
        {toolName === 'competitors' && <Field label="Competitor websites" className="span-two" hint="Only URLs you enter or added to this project are scanned."><Textarea rows={4} value={input.competitorUrls} onChange={set('competitorUrls')} placeholder={'https://competitor-one.com\nhttps://competitor-two.com'} /></Field>}
        {toolName === 'launch' && <><Field label="Product or offer"><Input required value={input.topic} onChange={set('topic')} placeholder="What is launching?" /></Field><Field label="Launch date"><Input type="date" value={input.launchDate || ''} onChange={set('launchDate')} /></Field></>}
        {toolName === 'proposal' && <><Field label="Client name"><Input value={input.clientName} onChange={set('clientName')} placeholder="Client organization" /></Field><Field label="Proposal title"><Input value={input.title} onChange={set('title')} placeholder="Marketing services proposal" /></Field><Field label="Scope of work" className="span-two"><Textarea rows={3} value={input.serviceScope} onChange={set('serviceScope')} placeholder="Services the proposal should include" /></Field><Field label="Deliverables" className="span-two"><Textarea rows={3} value={input.deliverables} onChange={set('deliverables')} placeholder="One deliverable per line" /></Field><Field label="Timeline"><Input value={input.timeline} onChange={set('timeline')} placeholder="e.g. 6 weeks" /></Field><Field label="Pricing or budget"><Input value={input.budget} onChange={set('budget')} placeholder="Leave blank if not decided" /></Field></>}
        {toolName === 'emails' && <Field label="Offer or sequence context" className="span-two"><Textarea rows={3} value={input.additionalInstructions} onChange={set('additionalInstructions')} placeholder="Product, desired action, timing, or personalization details" /></Field>}
        {!['emails', 'social', 'ads', 'competitors', 'launch', 'proposal'].includes(toolName) && <Field label="Workflow title" className="span-two"><Input value={input.title} onChange={set('title')} placeholder={`${title} for ${selected?.companyName || selected?.name || 'this project'}`} /></Field>}
        <Field label="Additional instructions" className="span-two"><Textarea rows={4} maxLength={8000} value={input.additionalInstructions} onChange={set('additionalInstructions')} placeholder="Optional focus, constraints, examples, or deliverable details" /></Field>
      </div></section>
      {toolName === 'seo' && <Notice kind="info">This workflow reports crawl-based on-page and technical signals. Live search impressions, clicks, and query data require a connected Search Console source.</Notice>}
      {['ads', 'social'].includes(toolName) && <Notice kind="warning">This produces editable drafts and a plan. No campaign or post is published or scheduled with an external platform.</Notice>}
      <FormError message={error} />
      <div className="form-footer"><span className="muted-text">Results persist in project history and Reports.</span><Button type="submit" variant="primary" loading={run.isPending} disabled={!projectId}>{toolName === 'quick' ? 'Run quick analysis' : `Start ${title.toLowerCase()}`} <ArrowRight size={14} /></Button></div>
    </form>
  </div>
}

export function ToolResultPage() {
  const { toolName = '', taskId = '' } = useParams()
  const queryClient = useQueryClient()
  const resultQuery = useQuery({ queryKey: ['task-result', toolName, taskId], queryFn: async () => (await api.get<{ task: Task; execution: any }>(`/tools/${toolName}/results/${taskId}`)).data, enabled: Boolean(toolName && taskId) })
  const task = resultQuery.data?.task
  const result = task?.resultData || {}
  const structured = (result.structured || {}) as Record<string, any>
  const [content, setContent] = useState('')
  const [emails, setEmails] = useState<Array<Record<string, any>>>([])
  const [campaignJson, setCampaignJson] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    setContent(String(result.content || task?.report?.content || ''))
    setEmails(Array.isArray(structured.emails) ? structured.emails : [])
    setCampaignJson(JSON.stringify(structured, null, 2))
    setSaved(false)
  }, [task?.id, result.content])

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.put<{ result: Record<string, any> }>(`/tools/${toolName}/results/${taskId}`, body)).data,
    onSuccess: async (response) => {
      setSaved(true)
      setSaveError('')
      queryClient.setQueryData(['task-result', toolName, taskId], (current: any) => current ? { ...current, task: { ...current.task, resultData: response.result, report: current.task.report ? { ...current.task.report, content: response.result.content } : current.task.report } } : current)
      await queryClient.invalidateQueries({ queryKey: ['reports'] })
    },
    onError: (cause: any) => setSaveError(cause?.response?.data?.error || 'The edited result could not be saved.'),
  })

  if (resultQuery.isLoading) return <div className="page-stack"><LoadingBlock label="Loading saved result" /></div>
  if (!task) return <div className="page-stack"><PageHeader title="Marketing result" /><EmptyState title="Result could not load" detail="The task may belong to another workspace or may still be running." action={<Link className="button button-secondary button-sm" to="/app/executions">Execution history</Link>} /></div>
  if (task.status !== 'completed') return <div className="page-stack"><PageHeader title={task.title} /><EmptyState title={`Workflow ${task.status}`} detail={task.resultData?.error || 'Open its execution record to review current agent status and logs.'} action={task.executions?.[0] && <Link className="button button-secondary button-sm" to={`/app/executions/${task.executions[0].id}`}>Open execution</Link>} /></div>

  const isEmail = toolName === 'emails'
  const isStructuredCampaign = ['ads', 'proposal'].includes(toolName)
  const report = task.report
  const title = task.title || toolById.get(toolName as typeof tools[number]['id'])?.label || 'Saved result'
  const saveEmail = () => save.mutate({ structured: { ...structured, emails } })
  const saveContent = () => save.mutate({ content })
  const saveStructured = () => {
    try { save.mutate({ structured: JSON.parse(campaignJson) }) } catch { setSaveError('Enter valid JSON before saving.') }
  }

  return <div className="page-stack result-page">
    <PageHeader title={title} description={`${task.type.replace(/-/g, ' ')} · ${format(new Date(task.createdAt), 'MMMM d, yyyy')}`} actions={<div className="result-action-group">
      {toolName === 'social' && structured.calendarId && <Link className="button button-secondary button-md" to={`/app/content?calendarId=${structured.calendarId}`}><CalendarDays size={15} /> Open calendar</Link>}
      {report && <Link className="button button-secondary button-md" to={`/app/reports/${report.id}`}><FileBarChart2 size={15} /> Open report</Link>}
      {report && <Button onClick={() => void downloadFile(`/reports/${report.id}/export?format=markdown`, `${report.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`)}>Download Markdown</Button>}
    </div>} />
    {result.evidence?.website && <div className="evidence-provenance"><Globe2 size={14} /><span>Website crawl: <a href={String(result.evidence.website.url)} target="_blank" rel="noreferrer">{String(result.evidence.website.url)}</a></span><small>Technical observations are crawl-based. Recommendations below are AI-generated.</small></div>}
    {toolName === 'ads' && <Notice kind="warning">Draft content only. No advertising campaign was published.</Notice>}
    {toolName === 'social' && <Notice kind="info">This calendar contains saved post copy and planned dates. It has not been sent to a social publisher.</Notice>}
    {isEmail && <section className="work-surface result-editor"><SectionTitle title="Editable email sequence" trailing={<Button variant="primary" onClick={saveEmail} loading={save.isPending}><Check size={14} /> Save edits</Button>} />
      {emails.map((email, index) => <article className="email-editor-entry" key={index}><div className="email-entry-head"><strong>Email {email.day || index + 1} · {email.name || email.goal || 'Sequence message'}</strong><span>{email.sendAfter || ''}</span></div><div className="form-grid two-columns"><Field label="Subject"><Input value={email.subject || ''} onChange={(event) => setEmails((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, subject: event.target.value } : item))} /></Field><Field label="Preview text"><Input value={email.preview || ''} onChange={(event) => setEmails((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, preview: event.target.value } : item))} /></Field><Field label="Email body" className="span-two"><Textarea rows={8} value={email.body || ''} onChange={(event) => setEmails((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, body: event.target.value } : item))} /></Field><Field label="Call to action"><Input value={email.cta || ''} onChange={(event) => setEmails((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, cta: event.target.value } : item))} /></Field></div></article>)}
    </section>}
    {isStructuredCampaign && <section className="work-surface result-editor"><SectionTitle title={toolName === 'ads' ? 'Editable campaign draft' : 'Editable proposal data'} trailing={<Button variant="primary" onClick={saveStructured} loading={save.isPending}><Check size={14} /> Save edits</Button>} /><p className="section-note">Edit the saved structured output. Check the JSON syntax before saving.</p><Textarea className="code-editor" rows={24} value={campaignJson} onChange={(event) => setCampaignJson(event.target.value)} spellCheck={false} aria-label="Structured campaign output" /></section>}
    {!isEmail && !isStructuredCampaign && <section className="work-surface result-editor"><SectionTitle title="Saved result" trailing={<Button variant="primary" onClick={saveContent} loading={save.isPending}><Check size={14} /> Save edits</Button>} /><Textarea className="result-markdown-editor" rows={22} value={content} onChange={(event) => { setContent(event.target.value); setSaved(false) }} aria-label="Edit report content" /><div className="markdown-preview"><h3>Preview</h3><Markdown content={content} /></div></section>}
    <FormError message={saveError} />{saved && <Notice kind="success">Your edits were saved to the task and its report.</Notice>}
  </div>
}

function Markdown({ content }: { content: string }) {
  return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
}

type CalendarRow = { calendar: ContentCalendar; item: ContentItem };

export function ContentCalendarPage() {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'month' | 'week' | 'list'>('month')
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [platform, setPlatform] = useState('all')
  const [status, setStatus] = useState('all')
  const [selected, setSelected] = useState<CalendarRow | null>(null)
  const [draft, setDraft] = useState<Partial<ContentItem>>({})
  const [instructions, setInstructions] = useState('')
  const [error, setError] = useState('')
  const calendarsQuery = useQuery({ queryKey: ['content-calendars'], queryFn: async () => (await api.get<{ calendars: ContentCalendar[] }>('/content/calendars')).data.calendars })
  const rows = useMemo(() => (calendarsQuery.data || []).flatMap((calendar) => calendar.items.map((item) => ({ calendar, item }))), [calendarsQuery.data])
  const visible = rows.filter(({ item }) => (platform === 'all' || item.platform === platform) && (status === 'all' || item.status === status))
  useEffect(() => {
    const requested = searchParams.get('calendarId')
    const row = rows.find((candidate) => candidate.calendar.id === requested)
    if (row) selectRow(row)
  }, [searchParams, rows.length])

  const selectRow = (row: CalendarRow) => {
    setSelected(row)
    setDraft({ ...row.item, date: row.item.date.slice(0, 10) })
    setInstructions('')
    setError('')
  }
  const save = useMutation({
    mutationFn: async () => (await api.put(`/content/items/${selected?.item.id}`, {
      title: draft.title, content: draft.content, hashtags: draft.hashtags, cta: draft.cta,
      platform: draft.platform, status: draft.status, date: draft.date,
    })).data,
    onSuccess: async (response) => {
      setSelected((current) => current ? { ...current, item: response.item } : current)
      setDraft({ ...response.item, date: response.item.date.slice(0, 10) })
      await queryClient.invalidateQueries({ queryKey: ['content-calendars'] })
    },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Calendar changes could not be saved.'),
  })
  const regenerate = useMutation({
    mutationFn: async () => (await api.post<{ item: ContentItem }>(`/content/items/${selected?.item.id}/regenerate`, { instructions })).data.item,
    onSuccess: async (item) => {
      setSelected((current) => current ? { ...current, item } : current)
      setDraft({ ...item, date: item.date.slice(0, 10) })
      setInstructions('')
      await queryClient.invalidateQueries({ queryKey: ['content-calendars'] })
    },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'This post could not be regenerated. Check the AI provider configuration.'),
  })

  const days = mode === 'week' ? eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(month) }) : eachDayOfInterval({ start: startOfWeek(startOfMonth(month)), end: endOfWeek(endOfMonth(month)) })
  const filteredRows = visible.filter(({ item }) => {
    const date = new Date(item.date)
    return mode === 'list' || (mode === 'week' ? isWithinInterval(date, { start: startOfWeek(month), end: endOfWeek(month) }) : isSameMonth(date, month))
  })
  const tasks = calendarsQuery.data || []
  const setDraftField = (key: keyof ContentItem) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setDraft((current) => ({ ...current, [key]: event.target.value }))
  const saveHashtags = (value: string) => setDraft((current) => ({ ...current, hashtags: value.split(/[ ,]+/).map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean) }))

  return <div className="page-stack content-calendar-page">
    <PageHeader title="Content studio" description="Edit saved social posts and the dates you plan to publish them." actions={<Link className="button button-primary button-md" to="/app/tools/social"><CalendarDays size={15} /> Generate calendar</Link>} />
    <section className="content-toolbar work-surface">
      <div className="calendar-toolbar-top"><div className="calendar-mode-tabs">{(['month', 'week', 'list'] as const).map((value) => <button className={mode === value ? 'active' : ''} onClick={() => setMode(value)} key={value}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div><div className="calendar-date-control"><Button size="sm" aria-label="Previous period" onClick={() => setMonth((value) => subMonths(value, 1))}><ChevronLeft size={14} /></Button><strong>{format(month, 'MMMM yyyy')}</strong><Button size="sm" aria-label="Next period" onClick={() => setMonth((value) => addMonths(value, 1))}><ChevronRight size={14} /></Button><button className="text-link" onClick={() => setMonth(startOfMonth(new Date()))}>Today</button></div>
        <div className="calendar-filters"><Select value={platform} onChange={(event) => setPlatform(event.target.value)} aria-label="Filter by platform"><option value="all">All platforms</option>{['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube'].map((item) => <option value={item} key={item}>{item === 'twitter' ? 'X' : item}</option>)}</Select><Select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Filter by content status"><option value="all">All states</option><option value="draft">Draft</option><option value="scheduled">Planned</option><option value="published">Published</option></Select></div></div>
      {mode === 'list' ? <div className="calendar-list-view">{filteredRows.length ? filteredRows.map((row) => <CalendarListRow key={row.item.id} row={row} selected={selected?.item.id === row.item.id} onSelect={() => selectRow(row)} />) : <EmptyState title="No posts in this view" detail="Generate a social calendar for a project, then edit its saved posts here." action={<Link className="button button-secondary button-sm" to="/app/tools/social">Create calendar</Link>} />}</div> : <div className={`calendar-grid ${mode === 'week' ? 'calendar-week-grid' : ''}`}>
        {mode === 'month' && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="calendar-weekday" key={day}>{day}</div>)}
        {days.map((day) => {
          const dayRows = filteredRows.filter(({ item }) => isSameDay(new Date(item.date), day))
          return <div className={`calendar-day ${mode === 'month' && !isSameMonth(day, month) ? 'outside-month' : ''}`} key={day.toISOString()}>
            <div className="calendar-day-number">{mode === 'week' && <small>{format(day, 'EEE')}</small>}{format(day, 'd')}</div>
            <div className="calendar-day-posts">{dayRows.slice(0, mode === 'week' ? 10 : 3).map((row) => <button key={row.item.id} className={`calendar-post-chip ${selected?.item.id === row.item.id ? 'selected' : ''} platform-${row.item.platform}`} onClick={() => selectRow(row)}><span>{row.item.platform === 'twitter' ? 'X' : row.item.platform.slice(0, 2).toUpperCase()}</span><strong>{row.item.title || row.item.contentPillar}</strong></button>)}{dayRows.length > (mode === 'week' ? 10 : 3) && <small className="more-posts">+{dayRows.length - (mode === 'week' ? 10 : 3)} more</small>}</div>
          </div>
        })}
      </div>}
      {calendarsQuery.isLoading && <LoadingBlock label="Loading saved calendars" />}
    </section>

    {selected && <section className="work-surface content-editor-panel"><div className="content-editor-heading"><div><span className="platform-overline">{selected.item.platform === 'twitter' ? 'X' : selected.item.platform} · Day {selected.item.day}</span><h2>{draft.title || selected.item.contentPillar}</h2></div><StatusTag status={selected.item.status === 'scheduled' ? 'planned' : selected.item.status} /></div>
      <p className="content-project-link">{selected.calendar.task.project.name} · {selected.calendar.topic} · {selected.item.format}</p>
      <div className="form-grid two-columns"><Field label="Post title"><Input value={draft.title || ''} onChange={setDraftField('title')} /></Field><Field label="Planned date"><Input type="date" value={String(draft.date || '').slice(0, 10)} onChange={setDraftField('date')} /></Field><Field label="Platform"><Select value={draft.platform || 'linkedin'} onChange={setDraftField('platform')}>{['linkedin', 'instagram', 'facebook', 'twitter', 'tiktok', 'youtube'].map((item) => <option value={item} key={item}>{item === 'twitter' ? 'X' : item}</option>)}</Select></Field><Field label="Plan state"><Select value={draft.status || 'draft'} onChange={setDraftField('status')}><option value="draft">Draft</option><option value="scheduled">Planned</option></Select></Field><Field label="Post copy" className="span-two"><Textarea rows={7} maxLength={10000} value={draft.content || ''} onChange={setDraftField('content')} /></Field><Field label="Hashtags" className="span-two" hint="Separate tags with spaces or commas."><Input value={(draft.hashtags || []).map((tag) => `#${tag}`).join(' ')} onChange={(event) => saveHashtags(event.target.value)} /></Field><Field label="Call to action" className="span-two"><Input value={draft.cta || ''} onChange={setDraftField('cta')} /></Field></div>
      <Field label="Regeneration instructions" hint="This regenerates only the selected post using the project's actual context."><Input value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Adjust tone, audience, or angle" /></Field>
      <FormError message={error} />
      <div className="content-editor-actions"><Button variant="quiet" onClick={() => setSelected(null)}>Close editor</Button><Button leading={<RefreshCw size={14} />} onClick={() => regenerate.mutate()} loading={regenerate.isPending}>Regenerate this post</Button><Button variant="primary" leading={<Check size={14} />} onClick={() => save.mutate()} loading={save.isPending}>Save post</Button></div>
      <p className="posting-disclaimer">Planned dates are stored in this calendar. Publishing requires a connected social-platform integration.</p>
    </section>}

    {tasks.length > 0 && <p className="muted-text calendar-source-note">{tasks.length} saved calendar{tasks.length === 1 ? '' : 's'} · post content is generated by your configured AI provider and can be edited before use.</p>}
  </div>
}

function CalendarListRow({ row, selected, onSelect }: { row: CalendarRow; selected: boolean; onSelect: () => void }) {
  return <button className={`calendar-list-row ${selected ? 'selected' : ''}`} onClick={onSelect}><time>{format(new Date(row.item.date), 'EEE, MMM d')}</time><span className={`platform-tag platform-${row.item.platform}`}>{row.item.platform === 'twitter' ? 'X' : row.item.platform}</span><span className="calendar-list-copy"><strong>{row.item.title || row.item.contentPillar}</strong><small>{row.calendar.task.project.name} · {row.item.content.slice(0, 120)}</small></span><StatusTag status={row.item.status === 'scheduled' ? 'planned' : row.item.status} /><ArrowRight size={14} /></button>
}
