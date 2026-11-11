import { Router } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  const workspaceId = request.workspaceId!;
  try {
    const [
      totalProjects,
      websitesAnalyzed,
      averageScores,
      totalCompetitors,
      contentGenerated,
      campaignsCreated,
      agentExecutions,
      reports,
      activities,
      pendingTasks,
      failedExecutions,
      auditCount,
      seoAverage,
    ] = await Promise.all([
      prisma.project.count({ where: { workspaceId, status: 'active' } }),
      prisma.marketingTask.count({ where: { type: { in: ['audit', 'quick'] }, status: 'completed', project: { workspaceId } } }),
      prisma.auditResult.aggregate({ where: { task: { project: { workspaceId } } }, _avg: { overallScore: true } }),
      prisma.competitor.count({ where: { project: { workspaceId } } }),
      prisma.marketingTask.count({ where: { type: { in: ['copy', 'emails', 'social', 'launch'] }, status: 'completed', project: { workspaceId } } }),
      prisma.marketingTask.count({ where: { type: 'ads', status: 'completed', project: { workspaceId } } }),
      prisma.agentExecution.count({ where: { status: 'completed', execution: { task: { project: { workspaceId } } } } }),
      prisma.report.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, title: true, type: true, createdAt: true, project: { select: { name: true } } } }),
      prisma.activityLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 8, include: { user: { select: { firstName: true, lastName: true } } } }),
      prisma.marketingTask.findMany({ where: { status: { in: ['queued', 'running'] }, project: { workspaceId } }, orderBy: { createdAt: 'asc' }, take: 8, include: { project: { select: { name: true } } } }),
      prisma.execution.findMany({ where: { status: 'failed', task: { project: { workspaceId } } }, orderBy: { completedAt: 'desc' }, take: 5, include: { task: { select: { title: true, type: true } } } }),
      prisma.auditResult.count({ where: { task: { project: { workspaceId } } } }),
      prisma.auditResult.aggregate({ where: { task: { project: { workspaceId } } }, _avg: { seoScore: true } }),
    ]);

    const currentAgents = await prisma.agentExecution.findMany({
      where: { execution: { task: { project: { workspaceId } } } },
      orderBy: { startedAt: 'desc' }, distinct: ['agentName'], take: 5,
      select: { agentName: true, status: true, startedAt: true },
    });
    return res.json({
      stats: {
        totalProjects,
        websitesAnalyzed,
        avgMarketingScore: averageScores._avg.overallScore === null ? null : Math.round(averageScores._avg.overallScore),
        seoPerformanceScore: seoAverage._avg.seoScore === null ? null : Math.round(seoAverage._avg.seoScore),
        competitorsMonitored: totalCompetitors,
        contentGenerated,
        campaignsCreated,
        aiAgentExecutions: agentExecutions,
        auditReports: auditCount,
      },
      recentReports: reports,
      recentActivities: activities.map(({ user, ...activity }) => ({
        ...activity,
        userName: user ? `${user.firstName} ${user.lastName}`.trim() : 'Workspace activity',
      })),
      pendingTasks,
      failedExecutions,
      agents: currentAgents,
    });
  } catch (error) {
    console.error('Dashboard data failed:', error);
    return res.status(500).json({ error: 'Dashboard data could not be loaded' });
  }
});

export default router;
