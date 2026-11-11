import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import prisma from '../lib/prisma';
import { generatePdf } from '../lib/pythonWorker';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const editors = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst'];

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function csvCell(value: unknown): string {
  const text = String(value ?? '').replace(/"/g, '""');
  return `"${text}"`;
}

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const reports = await prisma.report.findMany({
      where: {
        workspaceId: request.workspaceId,
        ...(typeof req.query.projectId === 'string' ? { projectId: req.query.projectId } : {}),
        ...(typeof req.query.type === 'string' ? { type: req.query.type } : {}),
        ...(typeof req.query.search === 'string' && req.query.search.trim() ? { title: { contains: req.query.search.trim(), mode: 'insensitive' } } : {}),
      },
      include: { project: { select: { id: true, name: true } }, task: { select: { id: true, status: true, type: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return res.json({ reports });
  } catch (error) {
    console.error('Report list failed:', error);
    return res.status(500).json({ error: 'Reports could not be loaded' });
  }
});

router.post('/compare', [body('reportIds').isArray({ min: 2, max: 4 })], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Select two to four reports to compare' });
  try {
    const reportIds = (req.body.reportIds as unknown[]).map(String);
    const reports = await prisma.report.findMany({
      where: { id: { in: reportIds }, workspaceId: request.workspaceId },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (reports.length !== reportIds.length) return res.status(404).json({ error: 'One or more reports were not found in this workspace' });
    return res.json({ reports: reports.map((report) => ({ ...report, data: objectValue(report.metadata) })) });
  } catch (error) {
    console.error('Report comparison failed:', error);
    return res.status(500).json({ error: 'Reports could not be compared' });
  }
});

router.get('/:id/export', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const report = await prisma.report.findFirst({ where: { id: req.params.id, workspaceId: request.workspaceId } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const format = String(req.query.format || 'markdown').toLowerCase();
    const baseName = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'marketing-report';
    const metadata = objectValue(report.metadata);
    if (format === 'markdown' || format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.md"`);
      return res.send(report.content || '');
    }
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.json"`);
      return res.json({ id: report.id, title: report.title, type: report.type, projectId: report.projectId, createdAt: report.createdAt, content: report.content, data: metadata });
    }
    if (format === 'csv') {
      const rows: string[][] = [['Section', 'Item', 'Value']];
      const scoreMap = objectValue(metadata.scores);
      for (const [category, score] of Object.entries(scoreMap)) rows.push(['Score', category, typeof score === 'object' && score ? String((score as any).score) : String(score)]);
      const recs = Array.isArray(metadata.recommendations) ? metadata.recommendations : [];
      recs.forEach((value: unknown, index: number) => {
        const item = typeof value === 'string' ? value : JSON.stringify(value);
        rows.push(['Recommendation', String(index + 1), item]);
      });
      const contentItems = Array.isArray(metadata.structured?.items) ? metadata.structured.items : [];
      contentItems.forEach((item: Record<string, unknown>, index: number) => rows.push(['Content', String(index + 1), `${item.date || ''} ${item.platform || ''}: ${item.content || ''}`]));
      if (rows.length === 1) rows.push(['Report', report.title, report.content || '']);
      const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      return res.send(`\uFEFF${csv}`);
    }
    return res.status(400).json({ error: 'Export format must be markdown, json, or csv' });
  } catch (error) {
    console.error('Report export failed:', error);
    return res.status(500).json({ error: 'Report could not be exported' });
  }
});

router.get('/:id/pdf', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const report = await prisma.report.findFirst({ where: { id: req.params.id, workspaceId: request.workspaceId }, include: { project: { select: { name: true, companyName: true, websiteUrl: true } } } });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    const metadata = objectValue(report.metadata);
    const scores = objectValue(metadata.scores);
    const categoryLabels: Record<string, string> = {
      content: 'Content & Messaging', conversion: 'Conversion Optimization', seo: 'SEO & Discoverability',
      competitive: 'Competitive Positioning', brand: 'Brand & Trust', growth: 'Growth & Strategy',
    };
    const weights: Record<string, string> = { content: '25%', conversion: '20%', seo: '20%', competitive: '15%', brand: '10%', growth: '10%' };
    const categories = Object.fromEntries(Object.entries(scores).filter(([, value]) => value !== null && value !== undefined).map(([key, value]) => [
      categoryLabels[key] || key,
      { score: typeof value === 'object' && value ? Number((value as any).score) : Number(value), weight: weights[key] || '—' },
    ]));
    const recommendations = Array.isArray(metadata.recommendations) ? metadata.recommendations : [];
    const reportData: Record<string, unknown> = {
      brand_name: report.project?.companyName || report.project?.name || report.title,
      url: metadata.verifiedEvidence?.websiteUrl || report.project?.websiteUrl || '',
      date: report.createdAt.toISOString().slice(0, 10),
      overall_score: typeof metadata.overallScore === 'number' ? metadata.overallScore : null,
      executive_summary: typeof metadata.overallScore === 'number'
        ? `${report.title} — weighted marketing score ${metadata.overallScore}/100.`
        : `${report.title}. See the detailed report pages for the saved analysis and recommendations.`,
      categories,
      findings: recommendations.map((item: any) => ({ severity: item.priority || 'Recommended', finding: item.recommendation || item.description || String(item) })),
      quick_wins: recommendations.slice(0, 5).map((item: any) => item.recommendation || item.description || String(item)),
      full_report: report.content || '',
    };
    const pdf = await generatePdf(reportData, report.title);
    const safeName = report.title.replace(/[^a-z0-9-]/gi, '-').slice(0, 80) || 'marketing-report';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}.pdf"`);
    return res.send(pdf);
  } catch (error) {
    console.error('PDF export failed:', error);
    return res.status(503).json({ error: error instanceof Error ? error.message : 'PDF report could not be generated' });
  }
});

router.get('/:id', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const report = await prisma.report.findFirst({
      where: { id: req.params.id, workspaceId: request.workspaceId },
      include: { project: { select: { id: true, name: true } }, task: { include: { auditResult: true, executions: { orderBy: { startedAt: 'desc' }, take: 1, include: { agentExecutions: true } } } } },
    });
    if (!report) return res.status(404).json({ error: 'Report not found' });
    return res.json({ report });
  } catch (error) {
    console.error('Report lookup failed:', error);
    return res.status(500).json({ error: 'Report could not be loaded' });
  }
});

router.patch('/:id', requireRole(editors), [body('title').optional().isString().trim().isLength({ min: 1, max: 255 })], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Report title must be between 1 and 255 characters' });
  if (typeof req.body.title !== 'string' || !req.body.title.trim()) return res.status(400).json({ error: 'A report title is required' });
  try {
    const report = await prisma.report.updateMany({ where: { id: req.params.id, workspaceId: request.workspaceId }, data: { title: req.body.title.trim() } });
    if (!report.count) return res.status(404).json({ error: 'Report not found' });
    return res.json({ message: 'Report renamed' });
  } catch (error) {
    console.error('Report update failed:', error);
    return res.status(500).json({ error: 'Report could not be renamed' });
  }
});

router.post('/:id/duplicate', requireRole(editors), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const original = await prisma.report.findFirst({ where: { id: req.params.id, workspaceId: request.workspaceId } });
    if (!original) return res.status(404).json({ error: 'Report not found' });
    const copy = await prisma.report.create({ data: {
      workspaceId: original.workspaceId,
      projectId: original.projectId,
      title: `${original.title} (copy)`,
      type: original.type,
      content: original.content,
      ...(original.metadata === null ? {} : { metadata: original.metadata as any }),
    } });
    return res.status(201).json({ report: copy });
  } catch (error) {
    console.error('Report duplicate failed:', error);
    return res.status(500).json({ error: 'Report could not be duplicated' });
  }
});

router.delete('/:id', requireRole(editors), async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const result = await prisma.report.deleteMany({ where: { id: req.params.id, workspaceId: request.workspaceId } });
    if (!result.count) return res.status(404).json({ error: 'Report not found' });
    return res.json({ message: 'Report deleted' });
  } catch (error) {
    console.error('Report delete failed:', error);
    return res.status(500).json({ error: 'Report could not be deleted' });
  }
});

export default router;
