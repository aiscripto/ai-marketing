import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { createQueuedTask } from '../lib/createTask';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const runners = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst'];

router.use(authMiddleware);

router.post('/start', requireRole(runners), [
  body('projectId').isString().isLength({ min: 1, max: 64 }),
  body('websiteUrl').optional().isString().isLength({ max: 2048 }),
  body('additionalInstructions').optional().isString().isLength({ max: 8000 }),
  body('competitorUrls').optional().isArray({ max: 5 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid audit configuration', details: errors.array() });
  const websiteUrl = String(req.body.websiteUrl || '').trim();
  if (websiteUrl) {
    try {
      const parsed = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Website URL must be a valid HTTP or HTTPS address without credentials' });
    }
  }
  const competitorUrls = Array.isArray(req.body.competitorUrls) ? req.body.competitorUrls.map(String) : [];
  if (competitorUrls.some((url: string) => {
    try { return !['http:', 'https:'].includes(new URL(url).protocol); } catch { return true; }
  })) return res.status(400).json({ error: 'Each competitor must be a valid HTTP or HTTPS URL' });

  try {
    const { task, execution } = await createQueuedTask({
      workspaceId: request.workspaceId!,
      userId: request.user!.id,
      projectId: String(req.body.projectId),
      type: 'audit',
      title: 'Full Marketing Audit',
      input: {
        ...(websiteUrl ? { websiteUrl } : {}),
        ...(req.body.additionalInstructions ? { additionalInstructions: req.body.additionalInstructions.trim() } : {}),
        competitorUrls,
        ...(req.body.provider ? { provider: String(req.body.provider) } : {}),
      },
    });
    return res.status(202).json({ taskId: task.id, executionId: execution.id, status: 'queued' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Audit could not be started';
    return res.status(message.startsWith('Project not found') ? 404 : 503).json({ error: message });
  }
});

router.get('/:taskId/report', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const task = await prisma.marketingTask.findFirst({
      where: { id: req.params.taskId, project: { workspaceId: request.workspaceId } },
      include: { report: true, auditResult: true, executions: { orderBy: { startedAt: 'desc' }, take: 1, include: { agentExecutions: true, executionLogs: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!task) return res.status(404).json({ error: 'Audit task not found' });
    return res.json({ task, report: task.report, result: task.auditResult, execution: task.executions[0] || null });
  } catch (error) {
    console.error('Audit report lookup failed:', error);
    return res.status(500).json({ error: 'Audit result could not be loaded' });
  }
});

router.get('/:taskId', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const task = await prisma.marketingTask.findFirst({
      where: { id: req.params.taskId, project: { workspaceId: request.workspaceId } },
      include: { auditResult: true, report: { select: { id: true, title: true, type: true } }, executions: { orderBy: { startedAt: 'desc' }, take: 1, include: { agentExecutions: true, executionLogs: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!task) return res.status(404).json({ error: 'Audit task not found' });
    return res.json({ task, result: task.auditResult, report: task.report, execution: task.executions[0] || null });
  } catch (error) {
    console.error('Audit task lookup failed:', error);
    return res.status(500).json({ error: 'Audit status could not be loaded' });
  }
});

export default router;
