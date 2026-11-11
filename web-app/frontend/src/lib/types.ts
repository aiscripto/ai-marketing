export type WorkspaceRole = 'super_admin' | 'owner' | 'admin' | 'marketing_manager' | 'analyst' | 'viewer';
export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ThemeChoice = 'light' | 'dark' | 'system';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  role: WorkspaceRole;
  theme?: ThemeChoice;
  notificationPreferences?: Record<string, boolean>;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role?: WorkspaceRole;
  companyName?: string | null;
  websiteUrl?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  markets?: string[];
  brandVoice?: string | null;
}

export interface Competitor {
  id: string;
  projectId: string;
  name: string;
  url: string;
  notes?: string | null;
}

export interface ProjectDocument {
  id: string;
  fileName: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  extractedText?: string;
}

export interface AuditResult {
  id: string;
  overallScore: number | null;
  contentScore: number | null;
  conversionScore: number | null;
  seoScore: number | null;
  competitiveScore: number | null;
  brandScore: number | null;
  growthScore: number | null;
  executiveSummary: string;
  strengths: unknown[];
  weaknesses: unknown[];
  criticalIssues: unknown[];
  recommendations: unknown[];
  implementationRoadmap: unknown[];
  rawFindings: Record<string, unknown>;
  createdAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  type: string;
  title: string;
  status: TaskStatus;
  inputData: Record<string, unknown>;
  resultData?: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
  report?: Report | null;
  auditResult?: AuditResult | null;
  executions?: Execution[];
  project?: Pick<Project, 'id' | 'name' | 'websiteUrl'> | null;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  websiteUrl?: string | null;
  companyName?: string | null;
  industry?: string | null;
  targetAudience?: string | null;
  markets: string[];
  brandVoice?: string | null;
  objectives?: string | null;
  status: 'active' | 'archived' | 'draft';
  createdAt: string;
  updatedAt: string;
  competitors: Competitor[];
  documents?: ProjectDocument[];
  tasks?: Task[];
  reports?: Report[];
  taskCount?: number;
  reportCount?: number;
  latestAudit?: AuditResult | null;
}

export interface AgentExecution {
  id: string;
  executionId: string;
  agentName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt?: string | null;
  completedAt?: string | null;
  score?: number | null;
  findings?: Record<string, unknown> | null;
  rawOutput?: string | null;
  errorMsg?: string | null;
}

export interface ExecutionLog {
  id: string;
  level: 'info' | 'warning' | 'error' | 'success';
  agentName?: string | null;
  message: string;
  createdAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface Execution {
  id: string;
  taskId: string;
  status: TaskStatus;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  task?: Task & { project?: Pick<Project, 'id' | 'name' | 'websiteUrl'> };
  agentExecutions?: AgentExecution[];
  executionLogs?: ExecutionLog[];
}

export interface Report {
  id: string;
  workspaceId: string;
  projectId?: string | null;
  taskId?: string | null;
  title: string;
  type: string;
  content?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
  project?: Pick<Project, 'id' | 'name'> | null;
  task?: Pick<Task, 'id' | 'status' | 'type'> | null;
}

export interface ContentItem {
  id: string;
  calendarId: string;
  day: number;
  date: string;
  platform: string;
  contentPillar: string;
  format: string;
  title?: string | null;
  content: string;
  hashtags: string[];
  cta?: string | null;
  status: 'draft' | 'scheduled' | 'published';
}

export interface ContentCalendar {
  id: string;
  taskId: string;
  topic: string;
  brand?: string | null;
  platforms: string[];
  startDate: string;
  endDate: string;
  createdAt: string;
  items: ContentItem[];
  task: { id: string; title: string; status: string; project: Pick<Project, 'id' | 'name'> };
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: string;
}

export interface DashboardPayload {
  stats: {
    totalProjects: number;
    websitesAnalyzed: number;
    avgMarketingScore: number | null;
    seoPerformanceScore: number | null;
    competitorsMonitored: number;
    contentGenerated: number;
    campaignsCreated: number;
    aiAgentExecutions: number;
    auditReports: number;
  };
  recentReports: Report[];
  recentActivities: Array<{ id: string; action: string; resource?: string | null; userName: string; createdAt: string }>;
  pendingTasks: Task[];
  failedExecutions: Execution[];
  agents: Array<{ agentName: string; status: string; startedAt?: string | null }>;
}

export interface ApiErrorResponse {
  error?: string;
  details?: unknown[];
  code?: string;
}
