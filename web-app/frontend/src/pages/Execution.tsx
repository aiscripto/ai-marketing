import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, ArrowLeft, ArrowRight, Check, CircleAlert, Clock3, FileBarChart2, LoaderCircle, RefreshCw, Square, X } from 'lucide-react'
import { format } from 'date-fns'
import api from '../lib/api'
import type { AuditResult, Execution, ExecutionLog, Project, Task } from '../lib/types'
import { Button, EmptyState, Field, FormError, Input, LoadingBlock, PageHeader, SectionTitle, Select, StatusTag, Textarea } from '../components/ui'

export function AuditSetupPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const projects = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const [projectId, setProjectId] = useState(searchParams.get('projectId') || '')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [instructions, setInstructions] = useState('')
  const [competitorUrls, setCompetitorUrls] = useState('')
  const [error, setError] = useState('')
  const selectedProject = projects.data?.find((item) => item.id === projectId)

  useEffect(() => {
    if (selectedProject && !websiteUrl) setWebsiteUrl(selectedProject.websiteUrl || '')
    if (selectedProject && !competitorUrls) setCompetitorUrls(selectedProject.competitors.map((item) => item.url).join('\n'))
  }, [selectedProject?.id])

  const start = useMutation({
    mutationFn: async () => (await api.post<{ taskId: string; executionId: string }>('/audit/start', {
      projectId,
      websiteUrl,
      additionalInstructions: instructions,
      competitorUrls: competitorUrls.split('\n').map((item) => item.trim()).filter(Boolean),
    })).data,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['executions'] })
      navigate(`/app/executions/${result.executionId}`)
    },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'The audit could not be queued. Review the project and try again.'),
  })

  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); start.mutate() }
  return <div className="page-stack narrow-page">
    <PageHeader title="Website marketing audit" description="Five specialist agents review one public website and combine verified crawl evidence with clearly labeled recommendations." />
    <form className="form-surface workflow-form" onSubmit={submit}>
      <section className="form-section"><SectionTitle title="Audit target" /><div className="form-grid two-columns">
        <Field label="Marketing project" className="span-two"><Select required value={projectId} onChange={(event) => { setProjectId(event.target.value); setWebsiteUrl(''); setCompetitorUrls('') }}><option value="">Choose a project</option>{(projects.data || []).map((project) => <option value={project.id} key={project.id}>{project.name}{project.websiteUrl ? ` · ${project.websiteUrl}` : ''}</option>)}</Select></Field>
        <Field label="Website URL" className="span-two" hint="The crawler blocks private addresses and only follows public HTTP/HTTPS redirects."><Input type="url" required value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} placeholder="https://example.com" /></Field>
        <Field label="Competitor URLs" className="span-two" hint="Up to five websites you supplied. One URL per line; no competitor discovery is claimed."><Textarea rows={4} value={competitorUrls} onChange={(event) => setCompetitorUrls(event.target.value)} placeholder={'https://competitor-one.com\nhttps://competitor-two.com'} /></Field>
        <Field label="Additional audit context" className="span-two" hint="Tell the agents about a product, market, or audience focus."><Textarea rows={4} maxLength={8000} value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional context to guide the audit" /></Field>
      </div></section>
      <section className="agent-sequence-note"><div className="sequence-rail"><i /><i /><i /><i /><i /></div><div><strong>Five agents · parallel execution</strong><p>Content, conversion, competitive, technical SEO, and brand/growth agents receive the same project context and crawl evidence.</p></div></section>
      <div className="workflow-caution">A complete weighted score appears only when all six category scores are available. Google Analytics and Search Console metrics are not included unless separately connected.</div>
      <FormError message={error} />
      <div className="form-footer"><span className="muted-text">AI provider credentials are required before the agents can run.</span><Button type="submit" variant="primary" loading={start.isPending} disabled={!projectId || !websiteUrl}>Queue five-agent audit <ArrowRight size={14} /></Button></div>
    </form>
  </div>
}

const agentLabels: Record<string, string> = {
  content: 'Content & Messaging', conversion: 'Conversion Optimization', competitive: 'Competitive Intelligence',
  technical: 'Technical SEO & Tracking', strategy: 'Brand & Growth Strategy',
}

export function ExecutionPage() {
  const { executionId = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [eventLogs, setEventLogs] = useState<ExecutionLog[]>([])
  const [streamState, setStreamState] = useState('connecting')
  const executionQuery = useQuery({
    queryKey: ['execution', executionId],
    queryFn: async () => (await api.get<{ execution: Execution }>(`/executions/${executionId}`)).data.execution,
    refetchInterval: (query) => ['queued', 'running'].includes(query.state.data?.status || '') ? 3000 : false,
    enabled: Boolean(executionId),
  })
  const execution = executionQuery.data

  useEffect(() => {
    const token = localStorage.getItem('auth_token')
    if (!token || !executionId) return
    const controller = new AbortController()
    let active = true
    setStreamState('connecting')
    const connect = async () => {
      try {
        const base = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1'
        const response = await fetch(`${base}/executions/${executionId}/events`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal })
        if (!response.ok || !response.body) throw new Error('The live execution stream could not be opened')
        setStreamState('live')
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        while (active) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const frames = buffer.split('\n\n')
          buffer = frames.pop() || ''
          for (const frame of frames) {
            const eventName = frame.split('\n').find((line) => line.startsWith('event:'))?.slice(6).trim()
            const payload = frame.split('\n').find((line) => line.startsWith('data:'))?.slice(5).trim()
            if (!eventName || !payload) continue
            let data: any
            try { data = JSON.parse(payload) } catch { continue }
            if (eventName === 'snapshot') {
              setEventLogs(data.execution?.executionLogs || [])
              queryClient.setQueryData(['execution', executionId], data.execution)
            } else if (eventName === 'log') {
              setEventLogs((current) => current.some((entry) => entry.id === data.id) ? current : [...current, data])
            } else if (['status', 'agent', 'stage', 'result'].includes(eventName)) {
              await queryClient.invalidateQueries({ queryKey: ['execution', executionId] })
              if (eventName === 'result' && data.taskId) await queryClient.invalidateQueries({ queryKey: ['task-result', data.taskId] })
            }
          }
        }
      } catch (cause: any) {
        if (active && cause?.name !== 'AbortError') setStreamState('reconnecting')
      }
    }
    void connect()
    return () => { active = false; controller.abort() }
  }, [executionId, queryClient])

  const cancel = useMutation({
    mutationFn: async () => api.post(`/executions/${executionId}/cancel`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['execution', executionId] }),
  })
  const retry = useMutation({
    mutationFn: async () => (await api.post<{ executionId: string }>(`/executions/${executionId}/retry`)).data,
    onSuccess: (result) => navigate(`/app/executions/${result.executionId}`),
  })

  if (executionQuery.isLoading) return <div className="page-stack"><LoadingBlock label="Loading execution" /></div>
  if (!execution) return <div className="page-stack"><PageHeader title="Execution" /><EmptyState title="Execution could not be found" detail="The task may have been removed or belong to another workspace." action={<Link className="button button-secondary button-sm" to="/app/executions">Execution history</Link>} /></div>

  const task = execution.task
  const agents = execution.agentExecutions || []
  const logs = eventLogs.length ? eventLogs : execution.executionLogs || []
  const finished = ['completed', 'failed', 'cancelled'].includes(execution.status)
  const resultTarget = task?.type === 'audit' ? `/app/audit/results/${task.id}` : `/app/tools/${task?.type}/results/${task?.id}`
  const resultLabel = task?.type === 'audit' ? 'Open audit results' : 'Open saved result'

  return <div className="page-stack execution-page">
    <PageHeader title={task?.title || 'Marketing workflow'} description={`${task?.project?.name || 'Project'}${task?.project?.websiteUrl ? ` · ${siteName(task.project.websiteUrl)}` : ''}`} actions={<Link className="text-link" to="/app/executions"><ArrowLeft size={14} /> All executions</Link>} />
    <section className="execution-banner work-surface">
      <div className="execution-status-main"><StatusTag status={execution.status} /><span className={`stream-indicator ${streamState}`}><i />{streamState === 'live' ? 'Live updates' : streamState === 'connecting' ? 'Connecting' : 'Refreshing status'}</span></div>
      <div className="execution-meta"><span><Clock3 size={14} />Started {format(new Date(execution.startedAt), 'MMM d · h:mm:ss a')}</span><span><Activity size={14} />{execution.durationMs ? `${(execution.durationMs / 1000).toFixed(1)} sec` : execution.completedAt ? 'Finished' : 'In progress'}</span><span>{task?.type || 'Workflow'}</span></div>
      <div className="execution-actions">
        {execution.status === 'queued' && <Button leading={<Square size={13} />} onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancel queued run</Button>}
        {['failed', 'cancelled'].includes(execution.status) && <Button variant="primary" leading={<RefreshCw size={14} />} onClick={() => retry.mutate()} loading={retry.isPending}>Retry workflow</Button>}
        {execution.status === 'completed' && task && <Link to={resultTarget} className="button button-primary button-md">{resultLabel}<ArrowRight size={14} /></Link>}
      </div>
      {execution.errorMessage && <div className="execution-error"><CircleAlert size={15} /><span>{execution.errorMessage}</span></div>}
    </section>

    {agents.length > 0 && <section className="work-surface agent-execution-surface"><SectionTitle title="Specialist agents" trailing={<span className="muted-text">{agents.filter((agent) => agent.status === 'completed').length} of {agents.length} complete</span>} />
      <div className="agent-run-list">{agents.map((agent) => <div className={`agent-run-row agent-${agent.status}`} key={agent.id}>
        <span className="agent-state-mark">{agent.status === 'completed' ? <Check size={14} /> : agent.status === 'running' ? <LoaderCircle size={14} className="spin" /> : agent.status === 'failed' ? <X size={14} /> : <span />}</span>
        <span className="agent-run-copy"><strong>{agentLabels[agent.agentName] || agent.agentName}</strong><small>{agent.errorMsg || (agent.status === 'running' ? 'Analyzing supplied evidence' : agent.status === 'completed' ? 'Analysis saved' : agent.status === 'skipped' ? 'Disabled in workspace configuration' : 'Waiting for execution')}</small></span>
        <StatusTag status={agent.status} />
        {agent.score !== null && agent.score !== undefined && <span className="agent-score">{Math.round(agent.score)}<small>/100</small></span>}
      </div>)}</div>
    </section>}

    <section className="work-surface execution-log-surface"><SectionTitle title="Execution log" trailing={<span className="monospace-count">{logs.length} recorded events</span>} />
      {logs.length ? <div className="execution-log-list" role="log" aria-live="polite">{logs.map((log, index) => <div className={`execution-log-row level-${log.level}`} key={log.id || `${log.createdAt}-${index}`}>
        <time>{log.createdAt ? format(new Date(log.createdAt), 'HH:mm:ss') : '—'}</time><span className="log-level">{log.level}</span>{log.agentName && <span className="log-agent">{agentLabels[log.agentName] || log.agentName}</span>}<span className="log-message">{log.message}</span>
      </div>)}</div> : <div className="execution-log-empty">{execution.status === 'queued' ? 'Waiting for a worker to pick up this task.' : execution.status === 'running' ? 'The worker is preparing the workflow.' : 'No execution log entries were recorded.'}</div>}
      {!finished && <div className="execution-live-note"><LoaderCircle size={14} className="spin" /> Status changes are recorded as the workflow progresses.</div>}
    </section>
  </div>
}

function siteName(url?: string | null) { try { return url ? new URL(url).hostname : '' } catch { return url || '' } }

export function AuditResultPage() {
  const { taskId = '' } = useParams()
  const resultQuery = useQuery({ queryKey: ['audit-result', taskId], queryFn: async () => (await api.get<{ task: Task; report: any; result: AuditResult | null; execution: Execution | null }>(`/audit/${taskId}/report`)).data, enabled: Boolean(taskId) })
  const data = resultQuery.data
  if (resultQuery.isLoading) return <div className="page-stack"><LoadingBlock label="Loading audit results" /></div>
  if (!data) return <div className="page-stack"><PageHeader title="Audit results" /><EmptyState title="Audit results are unavailable" detail="The task may have failed, or the audit could not be loaded from this workspace." action={<Link to="/app/executions" className="button button-secondary button-sm">Execution history</Link>} /></div>
  if (!data.result) return <div className="page-stack"><PageHeader title="Audit results" description="The audit has no completed scorecard yet." /><EmptyState title={data.task.status === 'failed' ? 'Audit failed' : 'Results are still being prepared'} detail={data.execution?.errorMessage || 'Open the execution record to see actual agent status and logs.'} action={data.execution && <Link className="button button-secondary button-sm" to={`/app/executions/${data.execution.id}`}>Open execution</Link>} /></div>

  const result = data.result
  const raw = result.rawFindings as Record<string, any>
  const scoreNames: Array<[string, string, number | null]> = [
    ['content', 'Content & Messaging', result.contentScore], ['conversion', 'Conversion Optimization', result.conversionScore],
    ['seo', 'SEO & Discoverability', result.seoScore], ['competitive', 'Competitive Positioning', result.competitiveScore],
    ['brand', 'Brand & Trust', result.brandScore], ['growth', 'Growth & Strategy', result.growthScore],
  ]
  const recommendations = Array.isArray(raw.recommendations) ? raw.recommendations as Array<Record<string, any>> : result.recommendations as Array<Record<string, any>>
  const agents = raw.agents && typeof raw.agents === 'object' ? raw.agents as Record<string, any> : {}

  return <div className="page-stack audit-result-page">
    <PageHeader title={`${data.task.title}`} description={`${data.task.project?.name || 'Project'} · ${format(new Date(result.createdAt), 'MMMM d, yyyy')}`} actions={<div className="result-action-group"><Link className="button button-secondary button-md" to={`/app/reports/${data.report?.id}`}><FileBarChart2 size={15} /> Open report</Link><Link className="button button-primary button-md" to={`/app/reports/${data.report?.id}?format=pdf`}>Export PDF <ArrowRight size={14} /></Link></div>} />
    {result.overallScore === null && <div className="incomplete-banner"><CircleAlert size={16} /><span><strong>Weighted score unavailable.</strong> Agent score coverage is {Number(raw.scoreCoverage ?? 0)}%. Review failed or skipped agents before treating this scorecard as complete.</span></div>}
    <section className="scorecard-layout work-surface">
      <div className="overall-score-block"><span>Overall marketing score</span><strong>{result.overallScore === null ? '—' : Math.round(result.overallScore)}<small>{result.overallScore === null ? '' : '/100'}</small></strong><span>{result.overallScore === null ? 'Incomplete score coverage' : 'Weighted across six categories'}</span></div>
      <div className="category-score-grid">{scoreNames.map(([key, label, score]) => <div className="category-score" key={key}><div><span>{label}</span><strong>{score === null ? '—' : Math.round(score)}<small>{score === null ? '' : '/100'}</small></strong></div><div className="score-meter"><i style={{ width: score === null ? '0%' : `${Math.max(0, Math.min(100, score))}%` }} /></div><small>{['content', 'conversion', 'seo', 'competitive', 'brand', 'growth'].includes(key) ? `${({ content: 25, conversion: 20, seo: 20, competitive: 15, brand: 10, growth: 10 } as Record<string, number>)[key]}% weight` : ''}</small></div>)}</div>
    </section>
    <section className="audit-evidence-grid">
      <article className="work-surface"><SectionTitle title="Executive summary" /><p className="report-summary-text">{result.executiveSummary}</p><div className="source-note"><ShieldCheckMark /> Crawl observations are verified against the public source URLs shown in the report. Interpretations and recommendations are AI-generated.</div></article>
      <article className="work-surface"><SectionTitle title="Agent outcomes" /><div className="agent-result-list">{Object.entries(agents).map(([key, outcome]) => <div className="agent-result-row" key={key}><span className={`mini-status ${outcome.status}`} /><span><strong>{agentLabels[key] || key}</strong><small>{outcome.status}{outcome.error ? ` · ${outcome.error}` : ''}</small></span>{outcome.score !== undefined && <strong className="agent-score">{Math.round(outcome.score)}</strong>}</div>)}</div><Link className="text-link" to={data.execution ? `/app/executions/${data.execution.id}` : '/app/executions'}>View full execution log <ArrowRight size={14} /></Link></article>
    </section>
    <section className="work-surface recommendations-surface"><SectionTitle title="Prioritized recommendations" trailing={<span className="muted-text">{recommendations.length} saved</span>} />
      {recommendations.length ? <div className="recommendation-table"><div className="recommendation-head"><span>Priority</span><span>Category</span><span>Recommendation</span><span>Source</span></div>{recommendations.map((item, index) => <div className="recommendation-row" key={`${index}-${item.recommendation || item.description}`}><span><StatusTag status={String(item.priority || 'recommended')} /></span><span>{item.category || item.agent || 'Marketing'}</span><strong>{item.recommendation || item.fix || item.action || item.description || String(item)}</strong><small>{item.source || 'AI recommendation'}</small></div>)}</div> : <EmptyState title="No recommendations returned" detail="Review specialist findings and the crawl evidence for this audit." />}
    </section>
    <section className="work-surface"><SectionTitle title="Strengths and issues" /><div className="findings-columns"><FindingList title="Strengths" items={result.strengths} /><FindingList title="Weaknesses" items={result.weaknesses} /><FindingList title="Critical issues" items={result.criticalIssues} /></div></section>
  </div>
}

function FindingList({ title, items }: { title: string; items: unknown[] }) {
  return <div className="finding-column"><h3>{title}</h3>{items.length ? <ul>{items.slice(0, 8).map((value, index) => <li key={index}>{typeof value === 'string' ? value : String((value as Record<string, unknown>)?.finding || (value as Record<string, unknown>)?.issue || JSON.stringify(value))}</li>)}</ul> : <p className="muted-text">No items recorded.</p>}</div>
}
function ShieldCheckMark() { return <span className="source-mark"><Check size={13} /></span> }

export function ExecutionHistoryPage() {
  const [filter, setFilter] = useState('all')
  const query = useQuery({ queryKey: ['executions'], queryFn: async () => (await api.get<{ executions: Execution[] }>('/executions')).data.executions })
  const executions = (query.data || []).filter((item) => filter === 'all' || item.status === filter)
  return <div className="page-stack">
    <PageHeader title="Execution history" description="See actual job state, agent outcomes, saved reports, and worker errors." />
    <div className="toolbar-row"><span className="toolbar-caption">{query.data?.length || 0} recent executions</span><div className="filter-group">{['all', 'queued', 'running', 'completed', 'failed', 'cancelled'].map((value) => <button key={value} className={`filter-option ${filter === value ? 'selected' : ''}`} onClick={() => setFilter(value)}>{value}</button>)}</div></div>
    {query.isLoading ? <LoadingBlock /> : executions.length ? <section className="work-surface table-surface"><div className="table-scroll"><table className="data-table execution-table"><thead><tr><th>Workflow</th><th>Project</th><th>Started</th><th>Duration</th><th>Status</th><th>Agents</th><th /></tr></thead><tbody>{executions.map((execution) => <tr key={execution.id}><td><Link className="table-primary" to={`/app/executions/${execution.id}`}>{execution.task?.title || execution.task?.type || 'Marketing task'}</Link><span className="table-secondary">{execution.task?.type || 'Workflow'}</span></td><td>{execution.task?.project?.name || '—'}</td><td>{format(new Date(execution.startedAt), 'MMM d, yyyy · h:mm a')}</td><td>{execution.durationMs ? `${(execution.durationMs / 1000).toFixed(1)}s` : '—'}</td><td><StatusTag status={execution.status} /></td><td>{execution.agentExecutions?.filter((agent) => agent.status === 'completed').length || 0}{execution.agentExecutions?.length ? ` / ${execution.agentExecutions.length}` : ''}</td><td><Link className="row-arrow" to={`/app/executions/${execution.id}`} aria-label="Open execution"><ArrowRight size={15} /></Link></td></tr>)}</tbody></table></div></section> : <EmptyState title={filter === 'all' ? 'No executions yet' : `No ${filter} executions`} detail="Workflow status and errors appear here as tasks are queued and processed." />}
  </div>
}
