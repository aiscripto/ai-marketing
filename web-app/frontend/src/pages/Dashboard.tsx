import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, CircleAlert, Clock3, FileBarChart2, FolderPlus, Gauge, Globe2,
  Megaphone, MessageSquareText, Plus, Search, Sparkles, Target, Users, WandSparkles,
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts'
import {
  differenceInCalendarDays, format, formatDistanceToNowStrict, startOfDay, startOfMonth, startOfWeek, subDays, subMonths, subWeeks,
} from 'date-fns'
import api from '../lib/api'
import { useSession } from '../lib/session'
import type { DashboardPayload, Execution, Notification, Project } from '../lib/types'
import { Avatar, Button, Card, EmptyState, MiniBars, PageHeader, ProgressRing, SectionTitle, Skeleton, StatusTag, TrendBadge } from '../components/ui'
import { AgentOrb, GlassCube, Prism } from '../components/Illustrations'
import { channelMeta, relativeTime } from './Inbox'

const quickActions = [
  { label: 'Full website audit', to: '/app/audit', icon: Gauge },
  { label: 'Quick analysis', to: '/app/tools/quick', icon: Activity },
  { label: 'Marketing copy', to: '/app/tools/copy', icon: WandSparkles },
  { label: 'Email sequence', to: '/app/tools/emails', icon: ArrowUpRight },
  { label: 'Social calendar', to: '/app/tools/social', icon: Plus },
  { label: 'Competitor scan', to: '/app/tools/competitors', icon: Globe2 },
  { label: 'SEO report', to: '/app/tools/seo', icon: FileBarChart2 },
  { label: 'Client proposal', to: '/app/tools/proposal', icon: ArrowRight },
]

const agentCatalog = [
  { name: 'content', label: 'Content & Messaging', hue: 'violet' as const },
  { name: 'conversion', label: 'Conversion Optimization', hue: 'pink' as const },
  { name: 'competitive', label: 'Competitive Intelligence', hue: 'indigo' as const },
  { name: 'technical', label: 'Technical SEO & Tracking', hue: 'violet' as const },
  { name: 'strategy', label: 'Brand & Growth Strategy', hue: 'pink' as const },
]

const contentTypes = new Set(['copy', 'emails', 'social', 'launch'])
type Period = 'daily' | 'weekly' | 'monthly'
const periodConfig: Record<Period, { label: string; buckets: number; unit: string }> = {
  daily: { label: 'Daily', buckets: 14, unit: 'last 14 days' },
  weekly: { label: 'Weekly', buckets: 12, unit: 'last 12 weeks' },
  monthly: { label: 'Monthly', buckets: 6, unit: 'last 6 months' },
}

type Bucket = { key: string; label: string; full: string; completed: number; failed: number; total: number }

function buildSeries(executions: Execution[], period: Period): Bucket[] {
  const now = new Date()
  const { buckets } = periodConfig[period]
  const starts = Array.from({ length: buckets }, (_, index) => {
    const offset = buckets - 1 - index
    if (period === 'daily') return startOfDay(subDays(now, offset))
    if (period === 'weekly') return startOfWeek(subWeeks(now, offset), { weekStartsOn: 1 })
    return startOfMonth(subMonths(now, offset))
  })
  const series: Bucket[] = starts.map((start) => ({
    key: start.toISOString(),
    label: period === 'monthly' ? format(start, 'MMM') : format(start, 'd MMM'),
    full: period === 'daily' ? format(start, 'EEEE, MMM d') : period === 'weekly' ? `Week of ${format(start, 'MMM d')}` : format(start, 'MMMM yyyy'),
    completed: 0, failed: 0, total: 0,
  }))
  for (const execution of executions) {
    const started = new Date(execution.startedAt)
    let index = -1
    for (let i = starts.length - 1; i >= 0; i -= 1) { if (started >= starts[i]) { index = i; break } }
    if (index < 0) continue
    const bucket = series[index]
    bucket.total += 1
    if (execution.status === 'completed') bucket.completed += 1
    else if (execution.status === 'failed') bucket.failed += 1
  }
  return series
}

function weeklyCounts<T>(items: T[], dateOf: (item: T) => string, weeks = 6) {
  const now = new Date()
  return Array.from({ length: weeks }, (_, index) => {
    const start = startOfWeek(subWeeks(now, weeks - 1 - index), { weekStartsOn: 1 })
    const end = startOfWeek(subWeeks(now, weeks - 2 - index), { weekStartsOn: 1 })
    return items.filter((item) => { const date = new Date(dateOf(item)); return date >= start && date < end }).length
  })
}

function siteName(url?: string | null) { try { return url ? new URL(url).hostname.replace(/^www\./, '') : '' } catch { return url || '' } }

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
}

function ChartTooltip({ active, payload }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const bucket = payload[0].payload as Bucket
  return <div className="chart-tooltip">
    <small>{bucket.full}</small>
    <strong>{bucket.total}<span> runs</span></strong>
    <span className="chart-tooltip-split"><i className="dot-completed" />{bucket.completed} completed<i className="dot-failed" />{bucket.failed} failed</span>
  </div>
}

function StatCard({ label, value, detail, bars, trend, icon: Icon, tone = 'primary' }: { label: string; value: string | number | null; detail?: string; bars: number[]; trend?: number | null; icon: typeof Activity; tone?: 'primary' | 'pink' }) {
  return <Card as="article" className="stat-card" tilt>
    <div className="stat-card-copy">
      <span className="stat-label"><span className="stat-icon"><Icon size={14} /></span>{label}</span>
      <strong className="stat-value">{value === null ? '—' : value}</strong>
      <span className="stat-foot"><TrendBadge change={trend} />{detail && <small>{detail}</small>}</span>
    </div>
    <MiniBars values={bars} tone={tone} label={`${label} trend`} />
  </Card>
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useSession()
  const [period, setPeriod] = useState<Period>('daily')
  const [inboxSearch, setInboxSearch] = useState('')
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await api.get<DashboardPayload>('/dashboard')).data })
  const projects = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const executions = useQuery({ queryKey: ['executions'], queryFn: async () => (await api.get<{ executions: Execution[] }>('/executions')).data.executions })
  const notifications = useQuery({ queryKey: ['notifications'], queryFn: async () => (await api.get<{ notifications: Notification[]; unreadCount: number }>('/notifications')).data, refetchInterval: 30_000 })

  const executionRows = useMemo(() => executions.data || [], [executions.data])
  const projectRows = useMemo(() => projects.data || [], [projects.data])
  const series = useMemo(() => buildSeries(executionRows, period), [executionRows, period])

  const derived = useMemo(() => {
    const now = new Date()
    const last7 = executionRows.filter((item) => differenceInCalendarDays(now, new Date(item.startedAt)) < 7)
    const prev7 = executionRows.filter((item) => { const d = differenceInCalendarDays(now, new Date(item.startedAt)); return d >= 7 && d < 14 })
    const daily7 = Array.from({ length: 7 }, (_, index) => executionRows.filter((item) => differenceInCalendarDays(now, new Date(item.startedAt)) === 6 - index).length)
    const scores = projectRows.map((project) => project.latestAudit?.overallScore).filter((score): score is number => typeof score === 'number').slice(0, 7)
    const contentRuns = executionRows.filter((item) => item.status === 'completed' && contentTypes.has(item.task?.type || ''))
    const newProjects = projectRows.filter((project) => differenceInCalendarDays(now, new Date(project.createdAt)) < 30).length
    return {
      runs7: last7.length,
      runTrend: prev7.length ? ((last7.length - prev7.length) / prev7.length) * 100 : null,
      daily7,
      projectWeeks: weeklyCounts(projectRows, (project) => project.createdAt),
      scores: scores.length ? scores.map(Math.round) : [0],
      contentWeeks: weeklyCounts(contentRuns, (item) => item.startedAt),
      newProjects,
      lastRun: executionRows[0],
    }
  }, [executionRows, projectRows])

  const periodTotal = series.reduce((sum, bucket) => sum + bucket.total, 0)
  const periodCompleted = series.reduce((sum, bucket) => sum + bucket.completed, 0)
  const periodFailed = series.reduce((sum, bucket) => sum + bucket.failed, 0)
  const successRate = periodCompleted + periodFailed ? Math.round((periodCompleted / (periodCompleted + periodFailed)) * 100) : null
  const peak = series.reduce<Bucket | null>((best, bucket) => (!best || bucket.total > best.total ? bucket : best), null)

  const inboxRows = useMemo(() => {
    const needle = inboxSearch.trim().toLowerCase()
    return (notifications.data?.notifications || []).filter((item) => !needle || `${item.title} ${item.message}`.toLowerCase().includes(needle)).slice(0, 4)
  }, [notifications.data, inboxSearch])

  if (dashboard.isLoading) return <DashboardSkeleton />
  if (dashboard.isError) return <div className="page-stack"><PageHeader title="Overview" description="Your marketing work, evidence, and reports in one place." /><EmptyState illustration="bars" title="Workspace data could not load" detail="Check your connection, then reload the page." action={<Button onClick={() => void dashboard.refetch()}>Reload overview</Button>} /></div>

  const data = dashboard.data!
  const stats = data.stats
  const visibleProjects = projectRows.slice(0, 4)
  const agentStatus = new Map(data.agents.map((agent) => [agent.agentName, agent]))

  return <div className="page-stack dashboard-page">
    <PageHeader eyebrow={<><Sparkles size={13} /> {greeting()}, {user.firstName}</>} title="Overview" description="A current view of projects, audits, and generated work." actions={<><Button leading={<FolderPlus size={15} />} onClick={() => navigate('/app/projects/new')}>New project</Button><Link className="button button-primary button-md" to="/app/audit"><Gauge size={15} /> Start an audit</Link></>} />

    <div className="dash-layout">
      <div className="dash-main">
        <section className="stat-grid" aria-label="Workspace metrics">
          <StatCard label="Active projects" value={stats.totalProjects} icon={Target} bars={derived.projectWeeks} detail={derived.newProjects ? `${derived.newProjects} new in 30 days` : 'Projects by week'} />
          <StatCard label="Workflow runs · 7 days" value={derived.runs7} icon={Activity} bars={derived.daily7} trend={derived.runTrend} detail="vs. previous 7 days" />
          <StatCard label="Average marketing score" value={stats.avgMarketingScore === null ? null : `${stats.avgMarketingScore}/100`} icon={Gauge} bars={derived.scores} detail={stats.avgMarketingScore === null ? 'No complete scores yet' : 'Across completed audits'} />
          <StatCard label="Content generated" value={stats.contentGenerated} icon={MessageSquareText} bars={derived.contentWeeks} tone="pink" detail="Completed by week" />
        </section>

        <section className="metric-pills" aria-label="More workspace metrics">
          <span className="metric-pill"><Globe2 size={14} /><small>Websites analyzed</small><strong>{stats.websitesAnalyzed}</strong></span>
          <span className="metric-pill"><Search size={14} /><small>SEO score</small><strong>{stats.seoPerformanceScore === null ? '—' : `${stats.seoPerformanceScore}/100`}</strong></span>
          <span className="metric-pill"><Users size={14} /><small>Competitors monitored</small><strong>{stats.competitorsMonitored}</strong></span>
          <span className="metric-pill"><Megaphone size={14} /><small>Campaign drafts</small><strong>{stats.campaignsCreated}</strong><em>Not published</em></span>
          <span className="metric-pill"><Sparkles size={14} /><small>Agent runs</small><strong>{stats.aiAgentExecutions}</strong></span>
        </section>

        <section className="hero-chart" aria-label="Workflow activity">
          <div className="hero-chart-glow" aria-hidden="true" />
          <header className="hero-chart-head">
            <div><h2>Workflow activity</h2><small>{periodConfig[period].unit} · from your 100 most recent runs</small></div>
            <div className="hero-period" role="tablist" aria-label="Chart period">
              {(Object.keys(periodConfig) as Period[]).map((key) => <button key={key} role="tab" aria-selected={period === key} className={period === key ? 'selected' : ''} onClick={() => setPeriod(key)}>{periodConfig[key].label}</button>)}
            </div>
          </header>
          <div className="hero-chart-body">
            <div className="hero-metric">
              <span className="hero-chip"><Clock3 size={13} /> {periodConfig[period].label} total</span>
              <strong>{periodTotal}<small>runs</small></strong>
              <div className="hero-sub">
                <span><small>Success rate</small><b>{successRate === null ? '—' : `${successRate}%`}</b></span>
                <span><small>Last run</small><b>{derived.lastRun ? formatDistanceToNowStrict(new Date(derived.lastRun.startedAt), { addSuffix: true }) : '—'}</b></span>
              </div>
            </div>
            <div className="hero-plot">
              {peak && peak.total > 0 && <div className="hero-peak"><small>Peak · {peak.label}</small><strong>{peak.total}<span> runs</span></strong></div>}
              {executionRows.length ? <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={{ top: 54, right: 8, left: -22, bottom: 0 }}>
                  <defs>
                    <linearGradient id="heroArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#E8B6FF" stopOpacity={0.55} /><stop offset="100%" stopColor="#E8B6FF" stopOpacity={0} /></linearGradient>
                    <linearGradient id="heroStroke" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#C7A8FF" /><stop offset="100%" stopColor="#ffffff" /></linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 12%)" strokeDasharray="3 6" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: 'rgb(255 255 255 / 72%)', fontSize: 11 }} interval="preserveStartEnd" minTickGap={18} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'rgb(255 255 255 / 55%)', fontSize: 10 }} width={40} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgb(255 255 255 / 45%)', strokeDasharray: '4 4' }} wrapperStyle={{ outline: 'none' }} />
                  <Area type="monotone" dataKey="failed" name="Failed" stroke="#FF9EC4" strokeWidth={1.5} strokeDasharray="4 4" fill="transparent" dot={false} activeDot={false} />
                  <Area type="monotone" dataKey="total" name="Runs" stroke="url(#heroStroke)" strokeWidth={3} fill="url(#heroArea)" dot={false} activeDot={{ r: 6, fill: '#fff', stroke: '#C7A8FF', strokeWidth: 4, className: 'glow-dot' }} animationDuration={900} />
                </AreaChart>
              </ResponsiveContainer> : <div className="hero-empty"><Prism size={84} className="float-slow" /><span>Completed and failed workflows will chart here as they run.</span><Link to="/app/audit">Run your first audit <ArrowRight size={14} /></Link></div>}
            </div>
          </div>
        </section>

        <section className="dash-section">
          <SectionTitle title="Projects you’re running" trailing={<Link className="text-link" to="/app/projects">View all <ArrowRight size={14} /></Link>} />
          {projects.isLoading ? <div className="project-cards">{[0, 1].map((index) => <Skeleton key={index} height={96} radius={20} />)}</div>
            : visibleProjects.length ? <div className="project-cards">{visibleProjects.map((project, index) => {
              const score = project.latestAudit?.overallScore
              return <Card as="article" key={project.id} className="project-card" tilt>
                <Link className="project-thumb" to={`/app/projects/${project.id}`} aria-label={`Open ${project.name}`}>
                  <GlassCube size={70} hue={(['violet', 'pink', 'indigo'] as const)[index % 3]} />
                  {typeof score === 'number' && <span className="thumb-chip"><Gauge size={11} />{Math.round(score)}</span>}
                </Link>
                <div className="project-card-copy">
                  <Link className="project-card-title" to={`/app/projects/${project.id}`}>{project.name}</Link>
                  <span className="project-card-meta"><Avatar name={project.companyName || project.name} size={20} tone={index} />{project.companyName || 'Company not set'}</span>
                  <small>{[siteName(project.websiteUrl), project.industry].filter(Boolean).join(' · ') || 'Website not set'}</small>
                </div>
                <span className="project-card-pill"><Activity size={13} /><b>{project.taskCount ?? 0}</b><small>tasks</small></span>
                <ProgressRing value={score} size={58} label={typeof score === 'number' ? `Latest audit score ${Math.round(score)} of 100` : 'No audit score yet'} />
              </Card>
            })}</div>
              : <EmptyState title="No projects yet" detail="Create a project to keep its website, competitors, documents, and marketing tasks together." action={<Link className="button button-primary button-sm" to="/app/projects/new">Create project</Link>} />}
        </section>

        <section className="dash-section quick-actions-section">
          <SectionTitle title="Start a workflow" trailing={<Link className="text-link" to="/app/tools">All marketing tools <ArrowRight size={14} /></Link>} />
          <div className="quick-action-list">{quickActions.map(({ label, to, icon: Icon }) => <Link className="quick-action" to={to} key={to}><span className="quick-icon"><Icon size={15} /></span><span>{label}</span><ArrowRight size={13} className="quick-arrow" /></Link>)}</div>
        </section>
      </div>

      <aside className="dash-rail">
        <Card className="inbox-panel">
          <div className="section-title"><h2>Inbox{Boolean(notifications.data?.unreadCount) && <span className="title-dot" aria-hidden="true" />}</h2><Link className="icon-button" to="/app/inbox" aria-label="Open inbox"><ArrowUpRight size={17} /></Link></div>
          <div className="inbox-search-row">
            <label className="search-pill"><Search size={15} aria-hidden="true" /><input value={inboxSearch} onChange={(event) => setInboxSearch(event.target.value)} placeholder="Search messages" aria-label="Search messages" /></label>
            <Link className="gradient-square" to="/app/tools" aria-label="Start a workflow" title="Start a workflow"><Plus size={18} /></Link>
          </div>
          {notifications.isLoading ? <div className="message-list">{[0, 1, 2].map((index) => <Skeleton key={index} height={70} radius={16} />)}</div>
            : inboxRows.length ? <div className="message-list">{inboxRows.map((item) => {
              const meta = channelMeta[item.type]
              const Icon = meta.icon
              return <Link key={item.id} to={`/app/inbox?channel=${item.type}`} className={`message-row ${item.isRead ? '' : 'is-unread'}`}>
                <Avatar name={meta.name} tone={meta.tone} size={44} icon={<Icon size={18} />} presence={item.isRead ? 'offline' : 'online'} />
                <span className="message-copy"><strong>{item.title}</strong><small>{item.message}</small></span>
                <span className="message-meta">{item.isRead ? <time>{relativeTime(item.createdAt)}</time> : <span className="unread-badge" aria-label="Unread">1</span>}</span>
              </Link>
            })}</div>
              : <EmptyState illustration="chat" title={inboxSearch ? 'No matching messages' : 'You’re all caught up'} detail={inboxSearch ? 'Try another search term.' : 'Workflow results and workspace updates will arrive here.'} />}
        </Card>

        <section className="dash-section">
          <SectionTitle title="Specialist agents" trailing={<Link className="text-link" to="/app/agents">View all <ArrowRight size={14} /></Link>} />
          <div className="agent-cards">{agentCatalog.map((agent) => {
            const status = agentStatus.get(agent.name)
            return <Link key={agent.name} to="/app/agents" className="agent-card">
              <span className="agent-card-art"><AgentOrb size={82} hue={agent.hue} />{status && <span className={`agent-card-chip chip-${status.status}`}>{status.status}</span>}</span>
              <strong>{agent.label}<BadgeCheck size={14} className="verified" /></strong>
              <small>{status?.startedAt ? `Last run ${formatDistanceToNowStrict(new Date(status.startedAt), { addSuffix: true })}` : status ? 'Run recorded' : 'Not run yet'}</small>
            </Link>
          })}</div>
        </section>
      </aside>
    </div>

    <div className="dashboard-grid lower-grid">
      <Card>
        <SectionTitle title="Recent reports" trailing={<Link className="text-link" to="/app/reports">All reports <ArrowRight size={14} /></Link>} />
        {data.recentReports.length ? <div className="compact-list">{data.recentReports.slice(0, 5).map((report) => <Link className="compact-row" to={`/app/reports/${report.id}`} key={report.id}>
          <span className="compact-icon"><FileBarChart2 size={15} /></span><span className="compact-copy"><strong>{report.title}</strong><small>{report.project?.name || 'Workspace report'} · {format(new Date(report.createdAt), 'MMM d, yyyy')}</small></span><ArrowRight size={14} className="row-arrow-icon" />
        </Link>)}</div> : <EmptyState illustration="docs" title="Reports will appear here" detail="Finish a workflow to save its report and export it as Markdown, PDF, JSON, or CSV." />}
      </Card>

      <Card>
        <SectionTitle title="Needs attention" trailing={<Link className="text-link" to="/app/executions">Execution history <ArrowRight size={14} /></Link>} />
        {data.failedExecutions.length ? <div className="compact-list">{data.failedExecutions.slice(0, 4).map((execution) => <Link className="compact-row" to={`/app/executions/${execution.id}`} key={execution.id}>
          <span className="compact-icon issue-icon"><CircleAlert size={15} /></span><span className="compact-copy"><strong>{execution.task?.title || 'Marketing task'}</strong><small>{execution.errorMessage || 'Open the execution to review the recorded error.'}</small></span><StatusTag status="failed" />
        </Link>)}</div> : <EmptyState illustration="prism" title="No failed workflows" detail="If a workflow fails, its error and retry action will be recorded here." />}
      </Card>
    </div>

    <Card className="activity-line">
      <SectionTitle title="Recent activity" />
      {data.recentActivities.length ? <div className="activity-items">{data.recentActivities.slice(0, 6).map((activity, index) => <div className="activity-item" key={activity.id}><Avatar name={activity.userName} size={30} tone={index} /><span><strong>{activity.userName}</strong> {activity.action.replace(/[._]/g, ' ')}{activity.resource && <small> · {activity.resource.replace(/_/g, ' ')}</small>}<time>{format(new Date(activity.createdAt), 'MMM d · h:mm a')}</time></span></div>)}</div> : <p className="muted-text empty-inline">Project and workflow activity will be recorded here.</p>}
    </Card>
  </div>
}

function DashboardSkeleton() {
  return <div className="page-stack dashboard-page" role="status" aria-label="Loading overview">
    <div className="page-header"><div><Skeleton width={160} height={12} /><Skeleton width={220} height={30} style={{ marginTop: 10 }} /><Skeleton width={320} height={13} style={{ marginTop: 10 }} /></div></div>
    <div className="dash-layout">
      <div className="dash-main">
        <div className="stat-grid">{[0, 1, 2, 3].map((index) => <Skeleton key={index} height={112} radius={20} />)}</div>
        <Skeleton height={330} radius={24} />
        <div className="project-cards">{[0, 1].map((index) => <Skeleton key={index} height={96} radius={20} />)}</div>
      </div>
      <div className="dash-rail"><Skeleton height={380} radius={24} /><Skeleton height={200} radius={24} /></div>
    </div>
  </div>
}
