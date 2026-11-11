import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'

const AuthPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.AuthPage })))
const InvitationPage = lazy(() => import('./pages/Auth').then((module) => ({ default: module.InvitationPage })))
const DashboardPage = lazy(() => import('./pages/Dashboard').then((module) => ({ default: module.DashboardPage })))
const ProjectsPage = lazy(() => import('./pages/Projects').then((module) => ({ default: module.ProjectsPage })))
const ProjectFormPage = lazy(() => import('./pages/Projects').then((module) => ({ default: module.ProjectFormPage })))
const ProjectDetailPage = lazy(() => import('./pages/Projects').then((module) => ({ default: module.ProjectDetailPage })))
const AuditSetupPage = lazy(() => import('./pages/Execution').then((module) => ({ default: module.AuditSetupPage })))
const ExecutionPage = lazy(() => import('./pages/Execution').then((module) => ({ default: module.ExecutionPage })))
const AuditResultPage = lazy(() => import('./pages/Execution').then((module) => ({ default: module.AuditResultPage })))
const ExecutionHistoryPage = lazy(() => import('./pages/Execution').then((module) => ({ default: module.ExecutionHistoryPage })))
const ToolCatalogPage = lazy(() => import('./pages/Tools').then((module) => ({ default: module.ToolCatalogPage })))
const ToolFormPage = lazy(() => import('./pages/Tools').then((module) => ({ default: module.ToolFormPage })))
const ToolResultPage = lazy(() => import('./pages/Tools').then((module) => ({ default: module.ToolResultPage })))
const ContentCalendarPage = lazy(() => import('./pages/Tools').then((module) => ({ default: module.ContentCalendarPage })))
const ReportsPage = lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportsPage })))
const ReportDetailPage = lazy(() => import('./pages/Reports').then((module) => ({ default: module.ReportDetailPage })))
const AgentsPage = lazy(() => import('./pages/Workspace').then((module) => ({ default: module.AgentsPage })))
const IntegrationsPage = lazy(() => import('./pages/Workspace').then((module) => ({ default: module.IntegrationsPage })))
const SettingsPage = lazy(() => import('./pages/Workspace').then((module) => ({ default: module.SettingsPage })))
const InboxPage = lazy(() => import('./pages/Inbox').then((module) => ({ default: module.InboxPage })))
const TeamPage = lazy(() => import('./pages/Workspace').then((module) => ({ default: module.TeamPage })))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('auth_token')
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return <Suspense fallback={<div className="app-loading"><div className="loading-block" role="status"><span className="loading-orb" />Loading workspace</div></div>}><Routes>
    <Route path="/" element={<Navigate to={localStorage.getItem('auth_token') ? '/app' : '/login'} replace />} />
    <Route path="/login" element={<AuthPage mode="login" />} />
    <Route path="/register" element={<AuthPage mode="register" />} />
    <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
    <Route path="/reset-password" element={<AuthPage mode="reset" />} />
    <Route path="/accept-invitation" element={<InvitationPage />} />
    <Route path="/app" element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
      <Route index element={<DashboardPage />} />
      <Route path="projects" element={<ProjectsPage />} />
      <Route path="projects/new" element={<ProjectFormPage />} />
      <Route path="projects/:projectId" element={<ProjectDetailPage />} />
      <Route path="audit" element={<AuditSetupPage />} />
      <Route path="executions" element={<ExecutionHistoryPage />} />
      <Route path="executions/:executionId" element={<ExecutionPage />} />
      <Route path="audit/results/:taskId" element={<AuditResultPage />} />
      <Route path="tools" element={<ToolCatalogPage />} />
      <Route path="tools/:toolName" element={<ToolFormPage />} />
      <Route path="tools/:toolName/results/:taskId" element={<ToolResultPage />} />
      <Route path="content" element={<ContentCalendarPage />} />
      <Route path="reports" element={<ReportsPage />} />
      <Route path="reports/:reportId" element={<ReportDetailPage />} />
      <Route path="agents" element={<AgentsPage />} />
      <Route path="integrations" element={<IntegrationsPage />} />
      <Route path="settings" element={<SettingsPage />} />
      <Route path="team" element={<TeamPage />} />
      <Route path="inbox" element={<InboxPage />} />
      <Route path="seo" element={<Navigate to="/app/tools/seo" replace />} />
      <Route path="competitors" element={<Navigate to="/app/tools/competitors" replace />} />
      <Route path="campaigns" element={<Navigate to="/app/tools/ads" replace />} />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Route>
    <Route path="*" element={<Navigate to="/app" replace />} />
  </Routes></Suspense>
}
