import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { createQueuedTask } from '../lib/createTask';
import { TOOL_NAMES } from '../jobs/tool';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';
import { asJsonValue } from '../jobs/shared';

const router = Router();
const runners = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst'];

router.use(authMiddleware);

router.post('/:toolName/run', requireRole(runners), [
  body('projectId').isString().isLength({ min: 1, max: 64 }),
  body('input').optional().isObject(),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid tool input', details: errors.array() });
  const tool = req.params.toolName;
  if (!TOOL_NAMES.includes(tool as typeof TOOL_NAMES[number])) return res.status(404).json({ error: 'Marketing tool not found' });
  const input = req.body.input && typeof req.body.input === 'object' ? req.body.input as Record<string, unknown> : {};
  const websiteUrl = input.websiteUrl;
  if (websiteUrl && typeof websiteUrl === 'string') {
    try {
      const parsed = new URL(websiteUrl);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Website URL must be a valid HTTP or HTTPS address without credentials' });
    }
  }
  if (JSON.stringify(input).length > 30_000) return res.status(413).json({ error: 'Tool input exceeds the 30 KB limit' });

  const title = String(input.title || `${tool.replace(/-/g, ' ')} task`).trim().slice(0, 240);
  try {
    const { task, execution } = await createQueuedTask({
      workspaceId: request.workspaceId!,
      userId: request.user!.id,
      projectId: String(req.body.projectId),
      type: tool,
      title,
      input: { ...input, toolName: tool },
    });
    return res.status(202).json({ taskId: task.id, executionId: execution.id, status: 'queued' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Marketing task could not be started';
    return res.status(message.startsWith('Project not found') ? 404 : 503).json({ error: message });
  }
});

router.get('/:toolName/results/:taskId', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const task = await prisma.marketingTask.findFirst({
      where: { id: req.params.taskId, type: req.params.toolName, project: { workspaceId: request.workspaceId } },
      include: {
        report: true,
        executions: { orderBy: { startedAt: 'desc' }, take: 1, include: { executionLogs: { orderBy: { createdAt: 'asc' } }, agentExecutions: true } },
        contentCalendar: { include: { items: { orderBy: [{ day: 'asc' }, { platform: 'asc' }] } } },
        emailCampaign: true,
        adCampaign: true,
        proposal: true,
      },
    });
    if (!task) return res.status(404).json({ error: 'Marketing task not found' });
    return res.json({ task, execution: task.executions[0] || null });
  } catch (error) {
    console.error('Marketing task result lookup failed:', error);
    return res.status(500).json({ error: 'Marketing task result could not be loaded' });
  }
});

router.put('/:toolName/results/:taskId', requireRole(runners), [
  body('content').optional().isString().isLength({ max: 100000 }),
  body('structured').optional().isObject(),
  body('clientName').optional().isString().trim().isLength({ min: 1, max: 160 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid saved result', details: errors.array() });
  const tool = req.params.toolName;
  if (!TOOL_NAMES.includes(tool as typeof TOOL_NAMES[number])) return res.status(404).json({ error: 'Marketing tool not found' });
  if (typeof req.body.content !== 'string' && (!req.body.structured || typeof req.body.structured !== 'object')) return res.status(400).json({ error: 'Provide report content or structured output to save' });
  try {
    const task = await prisma.marketingTask.findFirst({
      where: { id: req.params.taskId, type: tool, project: { workspaceId: request.workspaceId } },
      include: { report: true, emailCampaign: true, adCampaign: true, proposal: true },
    });
    if (!task) return res.status(404).json({ error: 'Marketing task not found' });
    if (task.status !== 'completed') return res.status(409).json({ error: 'Only completed results can be edited' });
    const previous = task.resultData && typeof task.resultData === 'object' && !Array.isArray(task.resultData)
      ? task.resultData as Record<string, any> : {};
    const structured = req.body.structured && typeof req.body.structured === 'object' && !Array.isArray(req.body.structured)
      ? req.body.structured as Record<string, any> : previous.structured || null;
    let reportContent = typeof req.body.content === 'string' ? req.body.content : String(previous.content || '');
    const operations: Prisma.PrismaPromise<any>[] = [];
    if (tool === 'emails' && structured) {
      const emails = Array.isArray(structured.emails) ? structured.emails : null;
      if (!emails?.length || emails.length > 30 || emails.some((email: any) => !email || typeof email.subject !== 'string' || typeof email.body !== 'string')) {
        return res.status(400).json({ error: 'Email campaigns need up to 30 items with a subject and body' });
      }
      reportContent = `# ${structured.title || 'Email Sequence'}\n\n${emails.map((email: Record<string, any>, index: number) => [
        `## Email ${email.day || index + 1}: ${email.name || email.goal || ''}`,
        email.sendAfter ? `**Send:** ${email.sendAfter}` : '',
        `**Subject:** ${email.subject}`,
        email.preview ? `**Preview:** ${email.preview}` : '',
        '', email.body, email.cta ? `\n**CTA:** ${email.cta}` : '',
      ].filter(Boolean).join('\n')).join('\n\n---\n\n')}\n`;
      if (task.emailCampaign) operations.push(prisma.emailCampaign.update({ where: { taskId: task.id }, data: { subject: emails[0].subject.slice(0, 255), emails: asJsonValue(emails) as Prisma.InputJsonValue } }));
    } else if (tool === 'ads' && structured) {
      if (!structured.platforms || typeof structured.platforms !== 'object' || Array.isArray(structured.platforms)) return res.status(400).json({ error: 'Ad campaign platforms must be an object of draft variations' });
      reportContent = `# Advertising Campaign Draft\n\n${JSON.stringify(structured, null, 2)}\n\n*Draft only. No campaign was published.*\n`;
      if (task.adCampaign) operations.push(prisma.adCampaign.update({ where: { taskId: task.id }, data: { objective: String(structured.objective || task.adCampaign.objective).slice(0, 255), platforms: asJsonValue(structured.platforms) as Prisma.InputJsonValue } }));
    } else if (tool === 'proposal' && typeof req.body.content === 'string' && task.proposal) {
      operations.push(prisma.proposal.update({ where: { taskId: task.id }, data: {
        content: req.body.content,
        ...(typeof req.body.clientName === 'string' ? { clientName: req.body.clientName.trim() } : {}),
      } }));
    }
    const nextResult = { ...previous, ...(structured ? { structured: asJsonValue(structured) } : {}), content: reportContent, editedAt: new Date().toISOString() };
    operations.push(
      prisma.marketingTask.update({ where: { id: task.id }, data: { resultData: asJsonValue(nextResult) as Prisma.InputJsonValue } }),
      prisma.report.updateMany({ where: { taskId: task.id, workspaceId: request.workspaceId }, data: { content: reportContent, metadata: asJsonValue(nextResult) as Prisma.InputJsonValue } }),
      prisma.activityLog.create({ data: { workspaceId: request.workspaceId!, userId: request.user!.id, action: 'marketing_result.edited', resource: 'marketing_task', resourceId: task.id } }),
    );
    await prisma.$transaction(operations);
    return res.json({ result: nextResult, reportUpdated: Boolean(task.report) });
  } catch (error) {
    console.error('Marketing result update failed:', error);
    return res.status(500).json({ error: 'Marketing result could not be saved' });
  }
});

export default router;
