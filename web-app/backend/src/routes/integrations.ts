import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { encryptSecret, decryptSecret } from '../lib/encryption';
import { testProviderConnection, type AiProvider } from '../lib/ai';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const providers: Array<{ id: string; name: string; kind: 'ai' | 'analytics' | 'publisher' | 'crm'; description: string }> = [
  { id: 'openai', name: 'OpenAI', kind: 'ai', description: 'Run marketing tools and specialist agents with OpenAI models.' },
  { id: 'anthropic', name: 'Anthropic', kind: 'ai', description: 'Run marketing tools and specialist agents with Claude models.' },
  { id: 'google_search_console', name: 'Google Search Console', kind: 'analytics', description: 'Connect verified search queries, clicks, and impressions.' },
  { id: 'google_analytics', name: 'Google Analytics 4', kind: 'analytics', description: 'Connect website acquisition and conversion metrics.' },
  { id: 'google_ads', name: 'Google Ads', kind: 'publisher', description: 'Connect campaign data and approved publishing actions.' },
  { id: 'meta_ads', name: 'Meta Ads', kind: 'publisher', description: 'Connect Facebook and Instagram ad account data.' },
  { id: 'linkedin', name: 'LinkedIn', kind: 'publisher', description: 'Connect organization publishing and campaign workflows.' },
  { id: 'wordpress', name: 'WordPress', kind: 'publisher', description: 'Connect a site for approved content publishing.' },
  { id: 'mailchimp', name: 'Mailchimp', kind: 'crm', description: 'Connect email audience and campaign operations.' },
  { id: 'hubspot', name: 'HubSpot', kind: 'crm', description: 'Connect CRM and marketing automation records.' },
  { id: 'semrush', name: 'Semrush', kind: 'analytics', description: 'Connect keyword and competitive research data.' },
  { id: 'ahrefs', name: 'Ahrefs', kind: 'analytics', description: 'Connect organic search and backlink research data.' },
];

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const [configs, workspace] = await Promise.all([
      prisma.apiConfiguration.findMany({ where: { workspaceId: request.workspaceId }, select: { provider: true, model: true, updatedAt: true, isActive: true } }),
      prisma.workspace.findUnique({ where: { id: request.workspaceId! }, select: { aiProvider: true } }),
    ]);
    const byProvider = new Map(configs.map((config) => [config.provider, config]));
    return res.json({
      selectedAiProvider: workspace?.aiProvider || 'openai',
      integrations: providers.map((provider) => {
        const config = byProvider.get(provider.id);
        const envConfigured = provider.id === 'openai'
          ? Boolean(process.env.OPENAI_API_KEY)
          : provider.id === 'anthropic' && Boolean(process.env.ANTHROPIC_API_KEY);
        const connected = provider.kind === 'ai' ? Boolean(config?.isActive) : false;
        return {
          ...provider,
          connected,
          status: connected ? 'connected' : envConfigured ? 'configured' : 'not_connected',
          configurationSource: config?.isActive ? 'workspace' : envConfigured ? 'server_environment' : null,
          model: config?.model || (provider.id === 'openai' ? process.env.DEFAULT_MODEL || 'gpt-4.1' : provider.id === 'anthropic' ? 'claude-sonnet-5' : null),
          lastUpdatedAt: config?.updatedAt || null,
          supported: provider.kind === 'ai',
        };
      }),
    });
  } catch (error) {
    console.error('Integrations list failed:', error);
    return res.status(500).json({ error: 'Integration settings could not be loaded' });
  }
});

router.post('/:provider/test', [
  body('apiKey').isString().isLength({ min: 8, max: 4096 }),
  body('model').optional().isString().isLength({ max: 120 }),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter an API key to test', details: errors.array() });
  try {
    await testProviderConnection(req.params.provider, req.body.apiKey, req.body.model);
    return res.json({ connected: true, message: 'Provider API key and model were verified' });
  } catch (error) {
    return res.status(400).json({ connected: false, error: error instanceof Error ? error.message : 'Provider connection failed' });
  }
});

router.post('/:provider/test-configured', requireRole(['super_admin', 'owner', 'admin']), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (!['openai', 'anthropic'].includes(req.params.provider)) return res.status(404).json({ error: 'This AI provider is not implemented' });
  const provider = req.params.provider as AiProvider;
  try {
    const config = await prisma.apiConfiguration.findUnique({ where: { workspaceId_provider: { workspaceId: request.workspaceId!, provider } } });
    const apiKey = config?.isActive
      ? decryptSecret(config.encryptedKey)
      : provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(409).json({ error: 'No provider key is configured for this workspace or server' });
    const model = config?.model || (provider === 'openai' ? process.env.DEFAULT_MODEL || 'gpt-4.1' : 'claude-sonnet-5');
    await testProviderConnection(provider, apiKey, model);
    return res.json({ verified: true, message: 'The configured provider key and model responded successfully.' });
  } catch (error) {
    return res.status(400).json({ verified: false, error: error instanceof Error ? error.message : 'Provider connection test failed' });
  }
});

router.put('/:provider', requireRole(['super_admin', 'owner', 'admin']), [
  body('apiKey').isString().isLength({ min: 8, max: 4096 }),
  body('model').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('makeDefault').optional().isBoolean(),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid provider configuration', details: errors.array() });
  if (!['openai', 'anthropic'].includes(req.params.provider)) return res.status(404).json({ error: 'This integration is not implemented' });
  try {
    await testProviderConnection(req.params.provider, req.body.apiKey, req.body.model);
    const provider = req.params.provider as AiProvider;
    const model = String(req.body.model || (provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-5')).trim();
    await prisma.$transaction([
      prisma.apiConfiguration.upsert({
        where: { workspaceId_provider: { workspaceId: request.workspaceId!, provider } },
        create: { workspaceId: request.workspaceId!, provider, encryptedKey: encryptSecret(req.body.apiKey), model, isActive: true },
        update: { encryptedKey: encryptSecret(req.body.apiKey), model, isActive: true },
      }),
      prisma.integration.upsert({
        where: { workspaceId_provider: { workspaceId: request.workspaceId!, provider } },
        create: { workspaceId: request.workspaceId!, provider, status: 'connected', config: { model } },
        update: { status: 'connected', config: { model }, lastSyncAt: new Date() },
      }),
      ...(req.body.makeDefault ? [prisma.workspace.update({ where: { id: request.workspaceId! }, data: { aiProvider: provider } })] : []),
    ]);
    return res.json({
      connected: true,
      provider,
      model,
      message: 'Provider verified and saved securely. The API key is never returned to the browser.',
    });
  } catch (error) {
    console.error('Provider configuration failed:', error instanceof Error ? error.message : 'unknown error');
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Provider could not be configured' });
  }
});

router.delete('/:provider', requireRole(['super_admin', 'owner', 'admin']), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (!['openai', 'anthropic'].includes(req.params.provider)) return res.status(404).json({ error: 'This integration is not implemented' });
  try {
    await prisma.$transaction([
      prisma.apiConfiguration.deleteMany({ where: { workspaceId: request.workspaceId!, provider: req.params.provider } }),
      prisma.integration.updateMany({ where: { workspaceId: request.workspaceId!, provider: req.params.provider }, data: { status: 'disconnected', config: Prisma.JsonNull } }),
    ]);
    return res.json({ message: 'Workspace API key removed' });
  } catch (error) {
    console.error('Provider removal failed:', error);
    return res.status(500).json({ error: 'Provider configuration could not be removed' });
  }
});

export default router;
