import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { createQueuedTask } from '../lib/createTask';
import { readAgent } from '../jobs/shared';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const runnerRoles = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst'];
const editorRoles = ['super_admin', 'owner', 'admin'];
const agentCatalog = [
  { name: 'content', label: 'Content & Messaging Agent', description: 'Audits content clarity, value propositions, copy persuasion, trust content, and calls to action.', responsibilities: ['Headlines', 'Value proposition', 'Copy quality', 'CTAs', 'Before-and-after rewrites'] },
  { name: 'conversion', label: 'Conversion Optimization Agent', description: 'Maps conversion paths and evaluates friction, trust signals, forms, CTAs, and test ideas.', responsibilities: ['Conversion paths', 'Forms', 'Trust signals', 'Funnel leaks', 'A/B hypotheses'] },
  { name: 'competitive', label: 'Competitive Intelligence Agent', description: 'Compares the target with explicit competitor sites and identifies positioning and content gaps.', responsibilities: ['Positioning', 'Pricing clues', 'Feature messaging', 'Content gaps', 'Market opportunities'] },
  { name: 'technical', label: 'Technical SEO Agent', description: 'Reviews crawl evidence for indexability, metadata, structure, performance signals, schema, and tracking tags.', responsibilities: ['Metadata', 'Headings', 'Indexability', 'Structured data', 'Tracking tags'] },
  { name: 'strategy', label: 'Brand & Growth Strategy Agent', description: 'Assesses brand trust, pricing, acquisition channels, retention, and growth opportunities.', responsibilities: ['Brand consistency', 'Trust', 'Pricing', 'Acquisition', 'Retention'] },
];

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const configs = await prisma.agentConfiguration.findMany({ where: { workspaceId: request.workspaceId } });
    const byName = new Map(configs.map((config) => [config.agentName, config]));
    const agents = await Promise.all(agentCatalog.map(async (agent) => ({
      ...agent,
      instructions: await readAgent(agent.name),
      enabled: byName.get(agent.name)?.isEnabled ?? true,
      additionalInstructions: byName.get(agent.name)?.additionalInstructions || '',
      updatedAt: byName.get(agent.name)?.updatedAt || null,
    })));
    return res.json({ agents });
  } catch (error) {
    console.error('Agent list failed:', error);
    return res.status(500).json({ error: 'Agent configuration could not be loaded' });
  }
});

router.put('/:agentName/config', requireRole(editorRoles), [
  body('additionalInstructions').optional().isString().isLength({ max: 10000 }),
  body('enabled').optional().isBoolean(),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid agent configuration', details: errors.array() });
  if (!agentCatalog.some((agent) => agent.name === req.params.agentName)) return res.status(404).json({ error: 'Agent not found' });
  try {
    const config = await prisma.agentConfiguration.upsert({
      where: { workspaceId_agentName: { workspaceId: request.workspaceId!, agentName: req.params.agentName } },
      create: {
        workspaceId: request.workspaceId!, agentName: req.params.agentName,
        additionalInstructions: typeof req.body.additionalInstructions === 'string' ? req.body.additionalInstructions.trim() : null,
        isEnabled: typeof req.body.enabled === 'boolean' ? req.body.enabled : true,
      },
      update: {
        ...(typeof req.body.additionalInstructions === 'string' ? { additionalInstructions: req.body.additionalInstructions.trim() } : {}),
        ...(typeof req.body.enabled === 'boolean' ? { isEnabled: req.body.enabled } : {}),
      },
    });
    return res.json({ configuration: { agentName: config.agentName, enabled: config.isEnabled, additionalInstructions: config.additionalInstructions, updatedAt: config.updatedAt } });
  } catch (error) {
    console.error('Agent configuration update failed:', error);
    return res.status(500).json({ error: 'Agent configuration could not be saved' });
  }
});

router.post('/:agentName/run', requireRole(runnerRoles), [
  body('projectId').isString().isLength({ min: 1, max: 64 }),
  body('websiteUrl').optional().isString().isLength({ max: 2048 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid agent task', details: errors.array() });
  const agent = agentCatalog.find((item) => item.name === req.params.agentName);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  try {
    const config = await prisma.agentConfiguration.findUnique({ where: { workspaceId_agentName: { workspaceId: request.workspaceId!, agentName: agent.name } } });
    if (config && !config.isEnabled) return res.status(409).json({ error: 'This agent is disabled in workspace settings' });
    const { task, execution } = await createQueuedTask({
      workspaceId: request.workspaceId!, userId: request.user!.id,
      projectId: String(req.body.projectId), type: `agent:${agent.name}`,
      title: `${agent.label} task`,
      input: {
        ...(req.body.websiteUrl ? { websiteUrl: String(req.body.websiteUrl) } : {}),
        ...(req.body.additionalInstructions ? { additionalInstructions: String(req.body.additionalInstructions).slice(0, 8000) } : {}),
        ...(req.body.provider ? { provider: String(req.body.provider) } : {}),
      },
    });
    return res.status(202).json({ taskId: task.id, executionId: execution.id, status: 'queued' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Agent task could not be started';
    return res.status(message.startsWith('Project not found') ? 404 : 503).json({ error: message });
  }
});

router.get('/executions/:executionId', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const execution = await prisma.execution.findFirst({
      where: { id: req.params.executionId, task: { project: { workspaceId: request.workspaceId } } },
      include: { task: { include: { project: { select: { id: true, name: true } }, report: true } }, agentExecutions: true, executionLogs: { orderBy: { createdAt: 'asc' } } },
    });
    if (!execution) return res.status(404).json({ error: 'Agent execution not found' });
    return res.json({ execution });
  } catch (error) {
    console.error('Agent execution lookup failed:', error);
    return res.status(500).json({ error: 'Agent execution could not be loaded' });
  }
});

router.get('/:agentName/history', async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (!agentCatalog.some((agent) => agent.name === req.params.agentName)) return res.status(404).json({ error: 'Agent not found' });
  try {
    const executions = await prisma.agentExecution.findMany({
      where: { agentName: req.params.agentName, execution: { task: { project: { workspaceId: request.workspaceId } } } },
      include: {
        execution: {
          include: {
            task: { include: { project: { select: { id: true, name: true } }, report: true } },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: 50,
    });
    return res.json({ executions });
  } catch (error) {
    console.error('Agent history lookup failed:', error);
    return res.status(500).json({ error: 'Agent execution history could not be loaded' });
  }
});

export default router;
