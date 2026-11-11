import { Router, type Response } from 'express';
import prisma from '../lib/prisma';
import { executionQueue } from '../lib/queue';
import { subscribeExecutionEvents, type ExecutionEvent } from '../lib/executionEvents';
import { logExecution } from '../jobs/shared';
import { createQueuedTask } from '../lib/createTask';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const operators = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst'];

function writeSse(response: Response, event: ExecutionEvent | { type: string; data: Record<string, unknown> }) {
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify('id' in event ? { id: event.id, createdAt: event.createdAt, ...event.data } : event.data)}\n\n`);
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const executions = await prisma.execution.findMany({
      where: { task: { project: { workspaceId: request.workspaceId } } },
      include: { task: { include: { project: { select: { id: true, name: true, websiteUrl: true } }, report: { select: { id: true, title: true } } } }, agentExecutions: true },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return res.json({ executions });
  } catch (error) {
    console.error('Execution list failed:', error);
    return res.status(500).json({ error: 'Execution history could not be loaded' });
  }
});

router.get('/:id/events', async (req, res) => {
  const request = req as AuthenticatedRequest;
  const execution = await prisma.execution.findFirst({
    where: { id: req.params.id, task: { project: { workspaceId: request.workspaceId } } },
    include: { task: { select: { id: true, title: true, type: true, status: true, projectId: true, project: { select: { name: true, websiteUrl: true } } } }, agentExecutions: true, executionLogs: { orderBy: { createdAt: 'asc' } } },
  }).catch(() => null);
  if (!execution) return res.status(404).json({ error: 'Execution not found' });
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  writeSse(res, { type: 'snapshot', data: { execution } });
  const unsubscribe = subscribeExecutionEvents(execution.id, (event) => writeSse(res, event));
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

router.get('/:id', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const execution = await prisma.execution.findFirst({
      where: { id: req.params.id, task: { project: { workspaceId: request.workspaceId } } },
      include: {
        task: { include: { project: { select: { id: true, name: true, websiteUrl: true } }, report: true, auditResult: true } },
        agentExecutions: true,
        executionLogs: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    return res.json({ execution });
  } catch (error) {
    console.error('Execution detail failed:', error);
    return res.status(500).json({ error: 'Execution could not be loaded' });
  }
});

router.post('/:id/cancel', requireRole(operators), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const execution = await prisma.execution.findFirst({
      where: { id: req.params.id, task: { project: { workspaceId: request.workspaceId } } },
      include: { task: true },
    });
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    if (execution.status !== 'queued') return res.status(409).json({ error: 'Only queued executions can be cancelled' });
    const job = await executionQueue.getJob(execution.id);
    if (job) await job.remove();
    const completedAt = new Date();
    await prisma.$transaction([
      prisma.execution.update({ where: { id: execution.id }, data: { status: 'cancelled', completedAt } }),
      prisma.marketingTask.update({ where: { id: execution.taskId }, data: { status: 'cancelled' } }),
      prisma.agentExecution.updateMany({ where: { executionId: execution.id, status: 'pending' }, data: { status: 'failed', completedAt, errorMsg: 'Execution was cancelled before the agents started' } }),
    ]);
    await logExecution(execution.id, 'Execution cancelled by a workspace member', 'warning');
    return res.json({ message: 'Queued execution cancelled' });
  } catch (error) {
    console.error('Execution cancellation failed:', error);
    return res.status(500).json({ error: 'Execution could not be cancelled' });
  }
});

router.post('/:id/retry', requireRole(operators), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const execution = await prisma.execution.findFirst({
      where: { id: req.params.id, task: { project: { workspaceId: request.workspaceId } } },
      include: { task: true },
    });
    if (!execution) return res.status(404).json({ error: 'Execution not found' });
    if (!['failed', 'cancelled'].includes(execution.status)) return res.status(409).json({ error: 'Only failed or cancelled executions can be retried' });
    const input = execution.task.inputData && typeof execution.task.inputData === 'object' && !Array.isArray(execution.task.inputData)
      ? execution.task.inputData as Record<string, unknown>
      : {};
    const retry = await createQueuedTask({
      workspaceId: request.workspaceId!,
      userId: request.user!.id,
      projectId: execution.task.projectId,
      type: execution.task.type,
      title: `${execution.task.title} (retry)`,
      input,
    });
    return res.status(202).json({ taskId: retry.task.id, executionId: retry.execution.id, status: 'queued' });
  } catch (error) {
    console.error('Execution retry failed:', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'Execution could not be retried' });
  }
});

export default router;
