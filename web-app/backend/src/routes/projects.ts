import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { body, param, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { extractPdfText } from '../lib/pythonWorker';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const editors = ['super_admin', 'owner', 'admin', 'marketing_manager'];
const writers = [...editors, 'analyst'];
const documentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });

function workspaceId(req: AuthenticatedRequest): string {
  if (!req.workspaceId) throw new Error('Workspace context missing');
  return req.workspaceId;
}

function parseProjectInput(bodyValue: any) {
  const markets = Array.isArray(bodyValue.markets)
    ? bodyValue.markets.map((value: unknown) => String(value).trim()).filter(Boolean).slice(0, 20)
    : [];
  const objectives = Array.isArray(bodyValue.objectives)
    ? bodyValue.objectives.map((value: unknown) => String(value).trim()).filter(Boolean).join('\n')
    : typeof bodyValue.objectives === 'string' ? bodyValue.objectives.trim() : null;
  return {
    name: String(bodyValue.name || '').trim(),
    description: String(bodyValue.description || '').trim() || null,
    websiteUrl: String(bodyValue.websiteUrl || '').trim() || null,
    companyName: String(bodyValue.companyName || '').trim() || null,
    industry: String(bodyValue.industry || '').trim() || null,
    targetAudience: String(bodyValue.targetAudience || '').trim() || null,
    markets,
    brandVoice: String(bodyValue.brandVoice || '').trim() || null,
    objectives,
    status: ['active', 'archived', 'draft'].includes(bodyValue.status) ? bodyValue.status : 'active',
  };
}

function validWebUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const projects = await prisma.project.findMany({
      where: { workspaceId: workspaceId(request) },
      include: {
        competitors: true,
        _count: { select: { tasks: true, reports: true } },
        tasks: { where: { status: 'completed', type: { in: ['audit', 'quick'] } }, orderBy: { createdAt: 'desc' }, take: 1, include: { auditResult: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    return res.json({ projects: projects.map(({ _count, tasks, ...project }) => ({
      ...project,
      taskCount: _count.tasks,
      reportCount: _count.reports,
      latestAudit: tasks[0]?.auditResult || null,
    })) });
  } catch (error) {
    console.error('Project list failed:', error);
    return res.status(500).json({ error: 'Projects could not be loaded' });
  }
});

router.post('/', requireRole(editors), [
  body('name').isString().trim().isLength({ min: 2, max: 120 }),
  body('websiteUrl').optional({ values: 'falsy' }).isString().isLength({ max: 2048 }),
  body('companyName').optional().isString().isLength({ max: 160 }),
  body('industry').optional().isString().isLength({ max: 120 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid project details', details: errors.array() });
  const data = parseProjectInput(req.body);
  if (data.websiteUrl && !validWebUrl(data.websiteUrl)) return res.status(400).json({ error: 'Website URL must use HTTP or HTTPS and cannot contain credentials' });
  try {
    const project = await prisma.project.create({
      data: {
        ...data,
        workspaceId: workspaceId(request),
        competitors: { create: Array.isArray(req.body.competitors) ? req.body.competitors.slice(0, 20).map((item: any) => ({
          name: String(item.name || item.url || 'Competitor').trim().slice(0, 120),
          url: String(item.url || '').trim(),
          notes: String(item.notes || '').trim() || null,
        })).filter((item: { url: string }) => validWebUrl(item.url)) : [] },
      },
      include: { competitors: true },
    });
    await prisma.activityLog.create({
      data: { workspaceId: project.workspaceId, userId: request.user?.id, action: 'project.created', resource: 'project', resourceId: project.id },
    });
    return res.status(201).json({ project });
  } catch (error) {
    console.error('Project creation failed:', error);
    return res.status(500).json({ error: 'Project could not be created' });
  }
});

router.get('/:id', [param('id').isString().isLength({ min: 1, max: 64 })], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid project id' });
  try {
    const project = await prisma.project.findFirst({
      where: { id: req.params.id, workspaceId: workspaceId(request) },
      include: {
        competitors: true,
        tasks: { orderBy: { createdAt: 'desc' }, take: 30, include: { report: true, auditResult: true, executions: { orderBy: { startedAt: 'desc' }, take: 1 } } },
        reports: { orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, title: true, type: true, createdAt: true, metadata: true } },
        documents: { orderBy: { createdAt: 'desc' }, select: { id: true, fileName: true, mediaType: true, sizeBytes: true, createdAt: true } },
      },
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    return res.json({ project });
  } catch (error) {
    console.error('Project lookup failed:', error);
    return res.status(500).json({ error: 'Project could not be loaded' });
  }
});

router.post('/:id/documents', requireRole(editors), (req, res, next) => {
  documentUpload.single('file')(req, res, (error) => {
    if (error instanceof multer.MulterError) {
      return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Documents are limited to 10 MB' : 'Upload one document at a time' });
    }
    if (error) return next(error);
    return next();
  });
}, async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Choose a document to upload' });
  const fileName = file.originalname.replace(/[\\/\u0000-\u001f]/g, '_').slice(0, 180);
  const extension = fileName.toLowerCase().split('.').pop() || '';
  const accepted: Record<string, string[]> = {
    pdf: ['application/pdf', 'application/octet-stream'],
    txt: ['text/plain', 'application/octet-stream'],
    md: ['text/markdown', 'text/plain', 'application/octet-stream'],
    csv: ['text/csv', 'text/plain', 'application/octet-stream'],
    json: ['application/json', 'text/plain', 'application/octet-stream'],
  };
  if (!accepted[extension] || !accepted[extension].includes(file.mimetype.toLowerCase())) {
    return res.status(415).json({ error: 'Upload a PDF, TXT, Markdown, CSV, or JSON document' });
  }
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: workspaceId(request) }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    let extractedText: string;
    if (extension === 'pdf') {
      extractedText = await extractPdfText(file.buffer, fileName);
    } else {
      try {
        extractedText = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/\u0000/g, '').trim();
      } catch {
        return res.status(415).json({ error: 'Text documents must use UTF-8 encoding' });
      }
      if (extension === 'json') {
        try { JSON.parse(extractedText); } catch { return res.status(422).json({ error: 'The JSON document is not valid JSON' }); }
      }
      extractedText = extractedText.slice(0, 100_000);
    }
    if (!extractedText) return res.status(422).json({ error: 'No readable text was found in this document' });
    const document = await prisma.projectDocument.create({ data: {
      projectId: project.id,
      fileName,
      mediaType: file.mimetype,
      sizeBytes: file.size,
      extractedText,
    }, select: { id: true, fileName: true, mediaType: true, sizeBytes: true, createdAt: true } });
    await prisma.activityLog.create({ data: {
      workspaceId: workspaceId(request), userId: request.user?.id, action: 'project.document.uploaded', resource: 'project_document', resourceId: document.id,
    } });
    return res.status(201).json({ document });
  } catch (error) {
    console.error('Project document upload failed:', error);
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Document could not be processed' });
  }
});

router.get('/:id/documents/:documentId', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const document = await prisma.projectDocument.findFirst({
      where: { id: req.params.documentId, projectId: req.params.id, project: { workspaceId: workspaceId(request) } },
    });
    if (!document) return res.status(404).json({ error: 'Project document not found' });
    return res.json({ document });
  } catch (error) {
    console.error('Project document lookup failed:', error);
    return res.status(500).json({ error: 'Project document could not be loaded' });
  }
});

router.delete('/:id/documents/:documentId', requireRole(editors), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const document = await prisma.projectDocument.findFirst({
      where: { id: req.params.documentId, projectId: req.params.id, project: { workspaceId: workspaceId(request) } },
      select: { id: true },
    });
    if (!document) return res.status(404).json({ error: 'Project document not found' });
    await prisma.projectDocument.delete({ where: { id: document.id } });
    return res.json({ message: 'Project document deleted' });
  } catch (error) {
    console.error('Project document deletion failed:', error);
    return res.status(500).json({ error: 'Project document could not be deleted' });
  }
});

router.put('/:id', requireRole(editors), [
  param('id').isString().isLength({ min: 1, max: 64 }),
  body('name').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('websiteUrl').optional({ values: 'falsy' }).isString().isLength({ max: 2048 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid project details', details: errors.array() });
  const data = parseProjectInput(req.body);
  if (!data.name) return res.status(400).json({ error: 'Project name is required' });
  if (data.websiteUrl && !validWebUrl(data.websiteUrl)) return res.status(400).json({ error: 'Website URL must use HTTP or HTTPS and cannot contain credentials' });
  try {
    const existing = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: workspaceId(request) }, select: { id: true } });
    if (!existing) return res.status(404).json({ error: 'Project not found' });
    const project = await prisma.project.update({
      where: { id: existing.id },
      data,
      include: { competitors: true },
    });
    await prisma.activityLog.create({
      data: { workspaceId: workspaceId(request), userId: request.user?.id, action: 'project.updated', resource: 'project', resourceId: project.id },
    });
    return res.json({ project });
  } catch (error) {
    console.error('Project update failed:', error);
    return res.status(500).json({ error: 'Project could not be updated' });
  }
});

router.delete('/:id', requireRole(editors), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: workspaceId(request) }, select: { id: true, name: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    await prisma.project.delete({ where: { id: project.id } });
    await prisma.activityLog.create({
      data: { workspaceId: workspaceId(request), userId: request.user?.id, action: 'project.deleted', resource: 'project', resourceId: project.id, metadata: { name: project.name } },
    });
    return res.json({ message: 'Project deleted' });
  } catch (error) {
    console.error('Project deletion failed:', error);
    return res.status(500).json({ error: 'Project could not be deleted' });
  }
});

router.post('/:id/competitors', requireRole(editors), [
  body('url').isString().isLength({ min: 4, max: 2048 }),
  body('name').optional().isString().isLength({ max: 120 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty() || !validWebUrl(String(req.body.url || ''))) return res.status(400).json({ error: 'A valid HTTP or HTTPS competitor URL is required' });
  try {
    const project = await prisma.project.findFirst({ where: { id: req.params.id, workspaceId: workspaceId(request) }, select: { id: true } });
    if (!project) return res.status(404).json({ error: 'Project not found' });
    const competitor = await prisma.competitor.create({ data: {
      projectId: project.id,
      url: req.body.url.trim(),
      name: String(req.body.name || new URL(req.body.url).hostname).trim().slice(0, 120),
      notes: String(req.body.notes || '').trim() || null,
    } });
    return res.status(201).json({ competitor });
  } catch (error) {
    console.error('Competitor create failed:', error);
    return res.status(500).json({ error: 'Competitor could not be added' });
  }
});

router.delete('/:id/competitors/:competitorId', requireRole(editors), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const competitor = await prisma.competitor.findFirst({
      where: { id: req.params.competitorId, projectId: req.params.id, project: { workspaceId: workspaceId(request) } },
      select: { id: true },
    });
    if (!competitor) return res.status(404).json({ error: 'Competitor not found' });
    await prisma.competitor.delete({ where: { id: competitor.id } });
    return res.json({ message: 'Competitor removed' });
  } catch (error) {
    console.error('Competitor delete failed:', error);
    return res.status(500).json({ error: 'Competitor could not be removed' });
  }
});

export default router;
