import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowLeft, Copy, Download, FileBarChart2, FileDown, Search, Trash2, X } from 'lucide-react'
import { format } from 'date-fns'
import api, { downloadFile } from '../lib/api'
import type { Report } from '../lib/types'
import { Button, EmptyState, FormError, Input, LoadingBlock, Notice, PageHeader, Select, StatusTag } from '../components/ui'

export function ReportsPage() {
  const [search, setSearch] = useState('')
  const [type, setType] = useState('all')
  const [selected, setSelected] = useState<string[]>([])
  const [comparison, setComparison] = useState<Report[] | null>(null)
  const [error, setError] = useState('')
  const reportsQuery = useQuery({ queryKey: ['reports', search, type], queryFn: async () => (await api.get<{ reports: Report[] }>('/reports', { params: { search: search || undefined, type: type === 'all' ? undefined : type } })).data.reports })
  const compare = useMutation({
    mutationFn: async () => (await api.post<{ reports: Report[] }>('/reports/compare', { reportIds: selected })).data.reports,
    onSuccess: (reports) => { setComparison(reports); setError('') },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Those reports could not be compared.'),
  })
  const reports = reportsQuery.data || []
  const availableTypes = useMemo(() => Array.from(new Set(reports.map((report) => report.type))).sort(), [reports])
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length >= 4 ? current : [...current, id])

  return <div className="page-stack">
    <PageHeader title="Reports & documents" description="Review saved workflow outputs, compare previous reports, and export client-ready files." actions={<Link className="button button-primary button-md" to="/app/tools/report"><FileBarChart2 size={15} /> Generate report</Link>} />
    <div className="reports-toolbar work-surface"><div className="report-search"><Search size={15} /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search report titles" aria-label="Search reports" /></div><Select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter by report type"><option value="all">All report types</option>{availableTypes.map((value) => <option key={value} value={value}>{value.replace(/-/g, ' ')}</option>)}</Select><span className="toolbar-caption">{reports.length} reports</span></div>
    <FormError message={error} />
    {selected.length > 0 && <div className="compare-bar"><span>{selected.length} selected <small>Choose 2–4 reports to compare.</small></span><Button variant="primary" size="sm" disabled={selected.length < 2} loading={compare.isPending} onClick={() => compare.mutate()}>Compare reports</Button><button className="text-link" onClick={() => setSelected([])}>Clear</button></div>}
    {reportsQuery.isLoading ? <LoadingBlock /> : reports.length ? <section className="work-surface table-surface"><div className="table-scroll"><table className="data-table report-table"><thead><tr><th aria-label="Select for comparison" /><th>Report</th><th>Project</th><th>Type</th><th>Created</th><th>Workflow</th><th>Exports</th></tr></thead><tbody>{reports.map((report) => <tr key={report.id}>
      <td><input aria-label={`Select ${report.title} for comparison`} type="checkbox" checked={selected.includes(report.id)} onChange={() => toggle(report.id)} /></td>
      <td><Link className="table-primary" to={`/app/reports/${report.id}`}>{report.title}</Link><span className="table-secondary">{report.task?.type || 'Saved report'}</span></td>
      <td>{report.project ? <Link className="table-link" to={`/app/projects/${report.project.id}`}>{report.project.name}</Link> : 'Workspace'}</td>
      <td><span className="report-type-label">{report.type.replace(/-/g, ' ')}</span></td>
      <td>{format(new Date(report.createdAt), 'MMM d, yyyy')}</td>
      <td>{report.task?.status ? <StatusTag status={report.task.status} /> : '—'}</td>
      <td><div className="export-mini-actions"><button onClick={() => void downloadFile(`/reports/${report.id}/export?format=markdown`, `${fileStem(report.title)}.md`)} aria-label={`Download ${report.title} as Markdown`}><Download size={14} /></button><button onClick={() => void downloadFile(`/reports/${report.id}/pdf`, `${fileStem(report.title)}.pdf`)} aria-label={`Download ${report.title} as PDF`}><FileDown size={14} /></button></div></td>
    </tr>)}</tbody></table></div></section> : <EmptyState title={search ? 'No matching reports' : 'No saved reports yet'} detail={search ? 'Try a shorter search term.' : 'Completed marketing workflows save their output here, with Markdown, PDF, JSON, and CSV export options where applicable.'} action={search ? <Button onClick={() => setSearch('')}>Clear search</Button> : <Link className="button button-secondary button-sm" to="/app/tools">Choose a workflow</Link>} />}
    {comparison && <ComparisonTable reports={comparison} onClose={() => setComparison(null)} />}
  </div>
}

function ComparisonTable({ reports, onClose }: { reports: Report[]; onClose: () => void }) {
  const keys = ['overallScore', 'scoreCoverage', 'content', 'conversion', 'seo', 'competitive', 'brand', 'growth']
  const labels: Record<string, string> = { overallScore: 'Weighted score', scoreCoverage: 'Score coverage', content: 'Content & messaging', conversion: 'Conversion', seo: 'SEO', competitive: 'Competitive positioning', brand: 'Brand & trust', growth: 'Growth & strategy' }
  const getScore = (report: Report, key: string) => {
    const data = report.metadata || {}
    if (key === 'overallScore') return data.overallScore ?? data.score ?? null
    if (key === 'scoreCoverage') return data.scoreCoverage ?? null
    const scores = data.scores && typeof data.scores === 'object' ? data.scores as Record<string, unknown> : {}
    return scores[key] ?? null
  }
  const hasScore = reports.some((report) => keys.some((key) => getScore(report, key) !== null && getScore(report, key) !== undefined))
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="dialog-panel compare-dialog" role="dialog" aria-modal="true" aria-labelledby="compare-title">
    <header className="dialog-heading"><div><h2 id="compare-title">Report comparison</h2><p>Saved reports, ordered from oldest to newest.</p></div><button className="icon-button" aria-label="Close comparison" onClick={onClose}><X size={15} /></button></header>
    <div className="compare-table-scroll"><table className="data-table compare-table"><thead><tr><th>Measure</th>{reports.map((report) => <th key={report.id}>{report.title}<small>{format(new Date(report.createdAt), 'MMM d, yyyy')}</small></th>)}</tr></thead><tbody>
      <tr><th>Project</th>{reports.map((report) => <td key={report.id}>{report.project?.name || 'Workspace'}</td>)}</tr>
      <tr><th>Workflow</th>{reports.map((report) => <td key={report.id}>{report.type}</td>)}</tr>
      {hasScore && keys.map((key) => <tr key={key}><th>{labels[key]}</th>{reports.map((report) => <td key={report.id}>{formatValue(getScore(report, key), key)}</td>)}</tr>)}
    </tbody></table></div>
    {!hasScore && <Notice kind="info">These reports do not include score data. Their saved output remains available in each report.</Notice>}
    <div className="dialog-actions"><Button onClick={onClose}>Close</Button></div>
  </section></div>
}

function formatValue(value: unknown, key: string) {
  if (value === null || value === undefined) return 'Unavailable'
  if (typeof value === 'object' && value && 'score' in value) value = (value as Record<string, unknown>).score
  const numeric = Number(value)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}${key === 'scoreCoverage' ? '%' : '/100'}` : String(value)
}

export function ReportDetailPage() {
  const { reportId = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const reportQuery = useQuery({ queryKey: ['report', reportId], queryFn: async () => (await api.get<{ report: Report }>(`/reports/${reportId}`)).data.report, enabled: Boolean(reportId) })
  const report = reportQuery.data
  useEffect(() => { if (report) setTitle(report.title) }, [report?.id, report?.title])
  useEffect(() => {
    if (report && searchParams.get('format') === 'pdf') void downloadFile(`/reports/${report.id}/pdf`, `${fileStem(report.title)}.pdf`)
  }, [report?.id, searchParams])

  const rename = useMutation({
    mutationFn: () => api.patch(`/reports/${reportId}`, { title }),
    onSuccess: async () => { setMessage('Report title saved.'); setError(''); await queryClient.invalidateQueries({ queryKey: ['report', reportId] }); await queryClient.invalidateQueries({ queryKey: ['reports'] }) },
    onError: (cause: any) => setError(cause?.response?.data?.error || 'Report title could not be saved.'),
  })
  const duplicate = useMutation({
    mutationFn: async () => (await api.post<{ report: Report }>(`/reports/${reportId}/duplicate`)).data.report,
    onSuccess: async (copy) => { await queryClient.invalidateQueries({ queryKey: ['reports'] }); navigate(`/app/reports/${copy.id}`) },
    onError: () => setError('A copy of this report could not be created.'),
  })
  const remove = useMutation({
    mutationFn: () => api.delete(`/reports/${reportId}`),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['reports'] }); navigate('/app/reports') },
    onError: () => setError('Report could not be deleted.'),
  })

  if (reportQuery.isLoading) return <div className="page-stack"><LoadingBlock label="Loading report" /></div>
  if (!report) return <div className="page-stack"><PageHeader title="Report" /><EmptyState title="Report could not be found" detail="It may have been removed or belong to another workspace." action={<Link className="button button-secondary button-sm" to="/app/reports">Reports</Link>} /></div>

  return <div className="page-stack report-detail-page">
    <PageHeader title={report.title} description={`${report.project?.name || 'Workspace report'} · ${format(new Date(report.createdAt), 'MMMM d, yyyy')} · ${report.type.replace(/-/g, ' ')}`} actions={<div className="result-action-group"><Link className="text-link" to="/app/reports"><ArrowLeft size={14} /> Reports</Link><Button onClick={() => void downloadFile(`/reports/${report.id}/export?format=markdown`, `${fileStem(report.title)}.md`)}><Download size={14} /> Markdown</Button><Button onClick={() => void downloadFile(`/reports/${report.id}/export?format=json`, `${fileStem(report.title)}.json`)}>JSON</Button><Button onClick={() => void downloadFile(`/reports/${report.id}/export?format=csv`, `${fileStem(report.title)}.csv`)}>CSV</Button><Button variant="primary" onClick={() => void downloadFile(`/reports/${report.id}/pdf`, `${fileStem(report.title)}.pdf`)}><FileDown size={14} /> PDF</Button></div>} />
    {report.metadata?.overallScore === null && <Notice kind="warning">This report has incomplete score coverage. It does not show a weighted score.</Notice>}
    <div className="report-manage-bar work-surface"><form className="rename-report" onSubmit={(event) => { event.preventDefault(); rename.mutate() }}><label htmlFor="report-title-input">Report name</label><Input id="report-title-input" value={title} onChange={(event) => { setTitle(event.target.value); setMessage('') }} maxLength={255} /><Button type="submit" loading={rename.isPending}>Save name</Button></form><div className="report-manage-actions"><Button onClick={() => duplicate.mutate()} loading={duplicate.isPending}><Copy size={14} /> Duplicate</Button><Button variant="danger" onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</Button></div></div>
    {error && <FormError message={error} />}{message && <Notice kind="success">{message}</Notice>}
    <article className="report-paper work-surface"><div className="report-paper-head"><span className="report-brand-line">AIScripto · AI Marketing Suite</span><span>{format(new Date(report.createdAt), 'yyyy-MM-dd')}</span></div><Markdown content={report.content || 'No rendered report content was saved for this result.'} /><div className="report-paper-foot"><span>{report.project?.name || 'Workspace report'}</span><span>{report.type.replace(/-/g, ' ')}</span></div></article>
    {confirmDelete && <div className="dialog-backdrop" role="presentation"><section className="dialog-panel confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-report-title"><h2 id="delete-report-title">Delete this report?</h2><p>The report and its saved exports will be removed from this workspace. Source workflow history remains available.</p><div className="dialog-actions"><Button onClick={() => setConfirmDelete(false)}>Keep report</Button><Button variant="danger" onClick={() => remove.mutate()} loading={remove.isPending}>Delete report</Button></div></section></div>}
  </div>
}

function Markdown({ content }: { content: string }) {
  return <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
}

function fileStem(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marketing-report' }
