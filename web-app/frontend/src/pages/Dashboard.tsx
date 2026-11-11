import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Activity, ArrowRight, ArrowUpRight, CircleAlert, FileBarChart2, FolderPlus, Gauge, Plus, WandSparkles } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, subDays, startOfDay } from 'date-fns'
import api from '../lib/api'
import type { DashboardPayload, Execution, Project } from '../lib/types'
import { Button, EmptyState, LoadingBlock, PageHeader, SectionTitle, StatusTag } from '../components/ui'

const quickActions = [
  { label: 'Full website audit', to: '/app/audit', icon: Gauge },
  { label: 'Quick analysis', to: '/app/tools/quick', icon: Activity },
  { label: 'Marketing copy', to: '/app/tools/copy', icon: WandSparkles },
  { label: 'Email sequence', to: '/app/tools/emails', icon: ArrowUpRight },
  { label: 'Social calendar', to: '/app/tools/social', icon: Plus },
  { label: 'Competitor scan', to: '/app/tools/competitors', icon: Activity },
  { label: 'SEO report', to: '/app/tools/seo', icon: FileBarChart2 },
  { label: 'Client proposal', to: '/app/tools/proposal', icon: ArrowRight },
]

function Metric({ label, value, detail }: { label: string; value: number | string | null; detail?: string }) {
  return <div className="metric-cell"><span className="metric-label">{label}</span><strong className="metric-value">{value === null ? '—' : value}</strong>{detail && <span className="metric-detail">{detail}</span>}</div>
}

type PrismBarProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  top: string;
  side: string;
}

function PrismBar({ x = 0, y = 0, width = 0, height = 0, fill = 'currentColor', top, side }: PrismBarProps) {
  if (width <= 4 || height <= 0) return null
  const depth = Math.min(5, width * 0.24, height * 0.35)
  const frontWidth = width - depth
  const frontHeight = Math.max(0, height - depth)
  return <g className="activity-prism">
    <path d={`M${x},${y + depth} L${x + depth},${y} L${x + width},${y} L${x + frontWidth},${y + depth} Z`} fill={top} />
    <path d={`M${x + frontWidth},${y + depth} L${x + width},${y} L${x + width},${y + height} L${x + frontWidth},${y + height} Z`} fill={side} />
    <rect x={x} y={y + depth} width={frontWidth} height={frontHeight} fill={fill} />
  </g>
}

export function DashboardPage() {
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: async () => (await api.get<DashboardPayload>('/dashboard')).data })
  const projects = useQuery({ queryKey: ['projects'], queryFn: async () => (await api.get<{ projects: Project[] }>('/projects')).data.projects })
  const executions = useQuery({ queryKey: ['executions'], queryFn: async () => (await api.get<{ executions: Execution[] }>('/executions')).data.executions })

  const activitySeries = useMemo(() => {
    const daily = Array.from({ length: 14 }, (_, index) => {
      const date = startOfDay(subDays(new Date(), 13 - index))
      return { key: format(date, 'yyyy-MM-dd'), day: format(date, 'd MMM'), completed: 0, failed: 0 }
    })
    const byDate = new Map(daily.map((item) => [item.key, item]))
    for (const execution of executions.data || []) {
      const key = format(startOfDay(new Date(execution.startedAt)), 'yyyy-MM-dd')
      const bucket = byDate.get(key)
      if (!bucket) continue
      if (execution.status === 'completed') bucket.completed += 1
      else if (execution.status === 'failed') bucket.failed += 1
    }
    return daily
  }, [executions.data])

  if (dashboard.isLoading) return <div className="page-stack"><PageHeader title="Overview" description="Your marketing work, evidence, and reports in one place." /><LoadingBlock /></div>
  if (dashboard.isError) return <div className="page-stack"><PageHeader title="Overview" description="Your marketing work, evidence, and reports in one place." /><EmptyState title="Workspace data could not load" detail="Check your connection, then reload the page." action={<Button onClick={() => void dashboard.refetch()}>Reload overview</Button>} /></div>

  const data = dashboard.data!
  const stats = data.stats
  const projectRows = projects.data || []
  const visibleProjects = projectRows.slice(0, 5)
  return <div className="page-stack dashboard-page">
    <PageHeader title="Overview" description="A current view of projects, audits, and generated work." actions={<><Button leading={<FolderPlus size={15} />} onClick={() => window.location.assign('/app/projects/new')}>New project</Button><Link className="button button-primary button-md" to="/app/audit"><Gauge size={15} /> Start an audit</Link></>} />

    <section className="metric-strip" aria-label="Workspace metrics">
      <Metric label="Active projects" value={stats.totalProjects} />
      <Metric label="Websites analyzed" value={stats.websitesAnalyzed} />
      <Metric label="Average marketing score" value={stats.avgMarketingScore === null ? null : `${stats.avgMarketingScore}/100`} detail={stats.avgMarketingScore === null ? 'No complete scores yet' : 'Across completed audits'} />
      <Metric label="SEO score" value={stats.seoPerformanceScore === null ? null : `${stats.seoPerformanceScore}/100`} detail={stats.seoPerformanceScore === null ? 'From completed audits' : 'Crawl-based audit average'} />
      <Metric label="Competitors monitored" value={stats.competitorsMonitored} />
      <Metric label="Content generated" value={stats.contentGenerated} />
      <Metric label="Campaign drafts" value={stats.campaignsCreated} detail="Not published" />
      <Metric label="Agent runs" value={stats.aiAgentExecutions} />
    </section>

    <section className="quick-actions-section">
      <SectionTitle title="Start a workflow" trailing={<Link className="text-link" to="/app/tools">All marketing tools <ArrowRight size={14} /></Link>} />
      <div className="quick-action-list">{quickActions.map(({ label, to, icon: Icon }) => <Link className="quick-action" to={to} key={to}><Icon size={15} /><span>{label}</span><ArrowRight size={13} className="quick-arrow" /></Link>)}</div>
    </section>

    <div className="dashboard-grid">
      <section className="work-surface project-ledger">
        <SectionTitle title="Marketing projects" trailing={<Link className="text-link" to="/app/projects">View all <ArrowRight size={14} /></Link>} />
        {visibleProjects.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Project</th><th>Website</th><th>Industry</th><th>Latest score</th><th>Work</th><th /></tr></thead><tbody>
          {visibleProjects.map((project) => <tr key={project.id}>
            <td><Link className="table-primary" to={`/app/projects/${project.id}`}>{project.name}</Link><span className="table-secondary">{project.companyName || 'Company not set'}</span></td>
            <td>{project.websiteUrl ? <a className="table-link" href={project.websiteUrl} target="_blank" rel="noreferrer">{new URL(project.websiteUrl).hostname}</a> : <span className="muted-text">Not set</span>}</td>
            <td>{project.industry || <span className="muted-text">—</span>}</td>
            <td>{project.latestAudit?.overallScore === null || project.latestAudit?.overallScore === undefined ? <span className="score-unavailable">—</span> : <span className="score-value">{Math.round(project.latestAudit.overallScore)}<small>/100</small></span>}</td>
            <td className="numeric-cell">{project.taskCount ?? 0}</td>
            <td><Link className="row-arrow" to={`/app/projects/${project.id}`} aria-label={`Open ${project.name}`}><ArrowRight size={15} /></Link></td>
          </tr>)}
        </tbody></table></div> : <EmptyState title="No projects yet" detail="Create a project to keep its website, competitors, documents, and marketing tasks together." action={<Link className="button button-primary button-sm" to="/app/projects/new">Create project</Link>} />}
      </section>

      <section className="work-surface activity-chart-surface">
        <SectionTitle title="Execution activity" trailing={<Link className="text-link" to="/app/executions">History <ArrowRight size={14} /></Link>} />
        {(executions.data || []).length ? <>
          <div className="chart-legend"><span><i className="legend-dot completed" />Completed</span><span><i className="legend-dot failed" />Failed</span></div>
          <div className="activity-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={activitySeries} margin={{ top: 10, right: 2, left: -28, bottom: 0 }} barGap={3}>
            <CartesianGrid vertical={false} stroke="var(--rule)" strokeDasharray="2 4" />
            <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 10 }} interval={2} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: 'var(--ink-muted)', fontSize: 10 }} />
            <Tooltip cursor={{ fill: 'var(--selection)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--rule)', borderRadius: 8, color: 'var(--ink)', fontSize: 12 }} />
            <Bar dataKey="completed" name="Completed" fill="var(--chart-completed-front)" shape={<PrismBar top="var(--chart-completed-top)" side="var(--chart-completed-side)" />} maxBarSize={18} />
            <Bar dataKey="failed" name="Failed" fill="var(--chart-failed-front)" shape={<PrismBar top="var(--chart-failed-top)" side="var(--chart-failed-side)" />} maxBarSize={18} />
          </BarChart></ResponsiveContainer></div>
        </> : <EmptyState title="No execution history" detail="Completed and failed workflows will appear here as they run." />}
      </section>
    </div>

    <div className="dashboard-grid lower-grid">
      <section className="work-surface">
        <SectionTitle title="Recent reports" trailing={<Link className="text-link" to="/app/reports">All reports <ArrowRight size={14} /></Link>} />
        {data.recentReports.length ? <div className="compact-list">{data.recentReports.slice(0, 5).map((report) => <Link className="compact-row" to={`/app/reports/${report.id}`} key={report.id}>
          <span className="compact-icon"><FileBarChart2 size={15} /></span><span className="compact-copy"><strong>{report.title}</strong><small>{report.project?.name || 'Workspace report'} · {format(new Date(report.createdAt), 'MMM d, yyyy')}</small></span><ArrowRight size={14} className="row-arrow-icon" />
        </Link>)}</div> : <EmptyState title="Reports will appear here" detail="Finish a workflow to save its report and export it as Markdown, PDF, JSON, or CSV." />}
      </section>

      <section className="work-surface">
        <SectionTitle title="Needs attention" trailing={<Link className="text-link" to="/app/executions">Execution history <ArrowRight size={14} /></Link>} />
        {data.failedExecutions.length ? <div className="compact-list">{data.failedExecutions.slice(0, 4).map((execution) => <Link className="compact-row" to={`/app/executions/${execution.id}`} key={execution.id}>
          <span className="compact-icon issue-icon"><CircleAlert size={15} /></span><span className="compact-copy"><strong>{execution.task?.title || 'Marketing task'}</strong><small>{execution.errorMessage || 'Open the execution to review the recorded error.'}</small></span><StatusTag status="failed" />
        </Link>)}</div> : <EmptyState title="No failed workflows" detail="If a workflow fails, its error and retry action will be recorded here." />}
      </section>
    </div>

    <section className="activity-line work-surface">
      <SectionTitle title="Recent activity" />
      {data.recentActivities.length ? <div className="activity-items">{data.recentActivities.slice(0, 6).map((activity) => <div className="activity-item" key={activity.id}><span className="activity-pin" /><span><strong>{activity.userName}</strong> {activity.action.replace(/[._]/g, ' ')}{activity.resource && <small> · {activity.resource.replace(/_/g, ' ')}</small>}</span><time>{format(new Date(activity.createdAt), 'MMM d · h:mm a')}</time></div>)}</div> : <p className="muted-text empty-inline">Project and workflow activity will be recorded here.</p>}
    </section>
  </div>
}
