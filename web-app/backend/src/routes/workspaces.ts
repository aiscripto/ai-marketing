import { randomBytes } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { createAccessToken, normalizeEmail, publicUser, slugify } from '../lib/auth';
import { sha256Hex } from '../lib/encryption';
import { mailIsConfigured, sendMail } from '../lib/mailer';
import { authMiddleware, requireRole, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const admins = ['super_admin', 'owner', 'admin'];
const workspaceRoles = new Set(['admin', 'marketing_manager', 'analyst', 'viewer']);
const roleOptions = ['super_admin', 'owner', 'admin', 'marketing_manager', 'analyst', 'viewer'];

function workspaceScope(req: AuthenticatedRequest): string {
  return req.workspaceId || '';
}

router.post('/invitations/accept', [
  body('token').isString().isLength({ min: 20, max: 200 }),
  body('password').isString().isLength({ min: 12, max: 200 }),
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 80 }),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'A valid invitation and password are required', details: errors.array() });
  try {
    const invite = await prisma.workspaceInvitation.findUnique({
      where: { tokenHash: sha256Hex(req.body.token) },
      include: { workspace: true },
    });
    if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) {
      return res.status(400).json({ error: 'This invitation is invalid, expired, or already used' });
    }
    const account = await prisma.user.findUnique({ where: { email: invite.email } });
    let user = account;
    if (account) {
      if (!(await bcrypt.compare(req.body.password, account.passwordHash))) {
        return res.status(401).json({ error: 'This email already has an account. Enter its current password to accept the invitation.' });
      }
    } else {
      if (!req.body.firstName || !req.body.lastName) return res.status(400).json({ error: 'First and last name are required for a new account' });
      user = await prisma.user.create({ data: {
        email: invite.email,
        passwordHash: await bcrypt.hash(req.body.password, 12),
        firstName: req.body.firstName.trim(),
        lastName: req.body.lastName.trim(),
      } });
    }
    if (!user) return res.status(500).json({ error: 'Workspace account could not be created' });
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId: user.id } },
        create: { workspaceId: invite.workspaceId, userId: user.id, role: invite.role, joinedAt: new Date() },
        update: { role: invite.role, joinedAt: new Date() },
      }),
      prisma.workspaceInvitation.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
      prisma.activityLog.create({ data: {
        workspaceId: invite.workspaceId,
        userId: user.id,
        action: 'workspace.invitation.accepted',
        resource: 'workspace_member',
      } }),
    ]);
    const token = createAccessToken({ userId: user.id, workspaceId: invite.workspaceId, email: user.email, tokenVersion: user.tokenVersion });
    return res.json({
      token,
      user: publicUser(user, invite.role),
      workspace: { id: invite.workspace.id, name: invite.workspace.name, slug: invite.workspace.slug, plan: invite.workspace.plan },
    });
  } catch (error) {
    console.error('Invitation acceptance failed:', error);
    return res.status(500).json({ error: 'Invitation could not be accepted' });
  }
});

router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: request.user?.id },
      include: { workspace: { include: { _count: { select: { projects: true, members: true } } } } },
      orderBy: { invitedAt: 'asc' },
    });
    return res.json({ workspaces: memberships.map(({ workspace, role }) => ({ ...workspace, role, counts: workspace._count })) });
  } catch (error) {
    console.error('Workspace list failed:', error);
    return res.status(500).json({ error: 'Workspaces could not be loaded' });
  }
});

router.post('/', requireRole(roleOptions), [body('name').isString().trim().isLength({ min: 2, max: 120 })], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Workspace name must be 2 to 120 characters' });
  try {
    const baseSlug = slugify(req.body.name);
    let slug = baseSlug;
    while (await prisma.workspace.findUnique({ where: { slug }, select: { id: true } })) {
      slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
    }
    const workspace = await prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({ data: { name: req.body.name.trim(), slug } });
      await tx.workspaceMember.create({ data: { userId: request.user!.id, workspaceId: created.id, role: 'owner', joinedAt: new Date() } });
      await tx.activityLog.create({ data: { workspaceId: created.id, userId: request.user!.id, action: 'workspace.created', resource: 'workspace' } });
      return created;
    });
    return res.status(201).json({ workspace });
  } catch (error) {
    console.error('Workspace creation failed:', error);
    return res.status(500).json({ error: 'Workspace could not be created' });
  }
});

router.get('/:id', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: req.params.id, userId: request.user?.id },
      include: { workspace: { include: { _count: { select: { projects: true, members: true } } } } },
    });
    if (!member) return res.status(404).json({ error: 'Workspace not found' });
    return res.json({ workspace: { ...member.workspace, role: member.role, counts: member.workspace._count } });
  } catch (error) {
    console.error('Workspace lookup failed:', error);
    return res.status(500).json({ error: 'Workspace could not be loaded' });
  }
});

router.post('/:id/switch', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: req.params.id, userId: request.user?.id },
      include: { workspace: true, user: true },
    });
    if (!member) return res.status(404).json({ error: 'Workspace not found' });
    const token = createAccessToken({ userId: member.userId, workspaceId: member.workspaceId, email: member.user.email, tokenVersion: member.user.tokenVersion });
    return res.json({ token, workspace: { id: member.workspace.id, name: member.workspace.name, slug: member.workspace.slug, plan: member.workspace.plan }, role: member.role });
  } catch (error) {
    console.error('Workspace switch failed:', error);
    return res.status(500).json({ error: 'Workspace could not be selected' });
  }
});

router.put('/:id', requireRole(admins), [
  body('name').optional().isString().trim().isLength({ min: 2, max: 120 }),
  body('aiProvider').optional().isIn(['openai', 'anthropic']),
  body('companyName').optional().isString().trim().isLength({ max: 160 }),
  body('websiteUrl').optional({ values: 'falsy' }).isString().isLength({ max: 2048 }),
  body('industry').optional().isString().trim().isLength({ max: 120 }),
  body('targetAudience').optional().isString().trim().isLength({ max: 1000 }),
  body('markets').optional().isArray({ max: 20 }),
  body('brandVoice').optional().isString().trim().isLength({ max: 2000 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid workspace settings', details: errors.array() });
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Switch to this workspace before editing it' });
  if (req.body.websiteUrl) {
    try {
      const parsed = new URL(String(req.body.websiteUrl));
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    } catch {
      return res.status(400).json({ error: 'Workspace website must be an HTTP or HTTPS URL without credentials' });
    }
  }
  if (req.body.markets && req.body.markets.some((market: unknown) => typeof market !== 'string')) {
    return res.status(400).json({ error: 'Markets must be a list of names' });
  }
  try {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceScope(request) },
      data: {
        ...(typeof req.body.name === 'string' ? { name: req.body.name.trim() } : {}),
        ...(typeof req.body.aiProvider === 'string' ? { aiProvider: req.body.aiProvider } : {}),
        ...(typeof req.body.companyName === 'string' ? { companyName: req.body.companyName.trim() || null } : {}),
        ...(typeof req.body.websiteUrl === 'string' ? { websiteUrl: req.body.websiteUrl.trim() || null } : {}),
        ...(typeof req.body.industry === 'string' ? { industry: req.body.industry.trim() || null } : {}),
        ...(typeof req.body.targetAudience === 'string' ? { targetAudience: req.body.targetAudience.trim() || null } : {}),
        ...(Array.isArray(req.body.markets) ? { markets: req.body.markets.map((market: string) => market.trim()).filter(Boolean).slice(0, 20) } : {}),
        ...(typeof req.body.brandVoice === 'string' ? { brandVoice: req.body.brandVoice.trim() || null } : {}),
      },
    });
    return res.json({ workspace });
  } catch (error) {
    console.error('Workspace update failed:', error);
    return res.status(500).json({ error: 'Workspace could not be updated' });
  }
});

router.delete('/:id', requireRole(['super_admin', 'owner']), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Switch to this workspace before deleting it' });
  try {
    await prisma.workspace.delete({ where: { id: workspaceScope(request) } });
    return res.json({ message: 'Workspace deleted' });
  } catch (error) {
    console.error('Workspace deletion failed:', error);
    return res.status(500).json({ error: 'Workspace could not be deleted' });
  }
});

router.get('/:id/members', async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  try {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: workspaceScope(request) },
      include: { user: { select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: { invitedAt: 'asc' },
    });
    return res.json({ members: members.map(({ id, role, joinedAt, invitedAt, user }) => ({ id, role, joinedAt, invitedAt, user })) });
  } catch (error) {
    console.error('Workspace members failed:', error);
    return res.status(500).json({ error: 'Workspace members could not be loaded' });
  }
});

router.get('/:id/invitations', requireRole(admins), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  try {
    const invitations = await prisma.workspaceInvitation.findMany({
      where: { workspaceId: workspaceScope(request), acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ invitations });
  } catch (error) {
    console.error('Workspace invitations failed:', error);
    return res.status(500).json({ error: 'Workspace invitations could not be loaded' });
  }
});

router.post('/:id/invitations', requireRole(admins), [
  body('email').isEmail(),
  body('role').isIn(['admin', 'marketing_manager', 'analyst', 'viewer']),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid email address and role' });
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  const email = normalizeEmail(req.body.email);
  const role = String(req.body.role);
  if (!workspaceRoles.has(role)) return res.status(400).json({ error: 'This role cannot be invited' });
  try {
    const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: workspaceScope(request), user: { email } }, select: { id: true } });
    if (member) return res.status(409).json({ error: 'This person already belongs to the workspace' });
    const rawToken = randomBytes(32).toString('base64url');
    const invite = await prisma.workspaceInvitation.create({ data: {
      workspaceId: workspaceScope(request),
      invitedById: request.user!.id,
      email,
      role,
      tokenHash: sha256Hex(rawToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }, include: { workspace: { select: { name: true } } } });
    const inviteUrl = new URL('/accept-invitation', process.env.FRONTEND_URL || 'http://localhost:5173');
    inviteUrl.searchParams.set('token', rawToken);
    let delivery: 'sent' | 'manual' = 'manual';
    if (mailIsConfigured()) {
      try {
        await sendMail({
          to: email,
          subject: `Join ${invite.workspace.name} on AIScripto`,
          text: `You have been invited to ${invite.workspace.name} as ${role}. Accept within seven days: ${inviteUrl.toString()}`,
        });
        delivery = 'sent';
      } catch (mailError) {
        console.error('Invitation email failed:', mailError);
      }
    }
    await prisma.activityLog.create({ data: {
      workspaceId: workspaceScope(request), userId: request.user!.id, action: 'workspace.invitation.created', resource: 'workspace_invitation', resourceId: invite.id,
    } });
    return res.status(201).json({
      invitation: { id: invite.id, email, role, expiresAt: invite.expiresAt, delivery },
      ...(delivery === 'manual' ? { inviteUrl: inviteUrl.toString() } : {}),
    });
  } catch (error) {
    console.error('Workspace invitation failed:', error);
    return res.status(500).json({ error: 'Invitation could not be created' });
  }
});

router.delete('/:id/members/:memberId', requireRole(admins), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  try {
    const member = await prisma.workspaceMember.findFirst({ where: { id: req.params.memberId, workspaceId: workspaceScope(request) } });
    if (!member) return res.status(404).json({ error: 'Workspace member not found' });
    if (member.role === 'owner' && request.user?.role !== 'super_admin') return res.status(403).json({ error: 'Workspace owners cannot be removed by another member' });
    await prisma.workspaceMember.delete({ where: { id: member.id } });
    return res.json({ message: 'Workspace access removed' });
  } catch (error) {
    console.error('Workspace member removal failed:', error);
    return res.status(500).json({ error: 'Workspace access could not be removed' });
  }
});

router.put('/:id/members/:memberId', requireRole(admins), [body('role').isIn(['admin', 'marketing_manager', 'analyst', 'viewer'])], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Choose a supported workspace role' });
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  try {
    const member = await prisma.workspaceMember.findFirst({ where: { id: req.params.memberId, workspaceId: workspaceScope(request) }, select: { id: true, role: true } });
    if (!member) return res.status(404).json({ error: 'Workspace member not found' });
    if (member.role === 'owner') return res.status(403).json({ error: 'The workspace owner role cannot be changed here' });
    const updated = await prisma.workspaceMember.update({ where: { id: member.id }, data: { role: req.body.role } });
    return res.json({ member: updated });
  } catch (error) {
    console.error('Workspace member role update failed:', error);
    return res.status(500).json({ error: 'Workspace member role could not be changed' });
  }
});

router.delete('/:id/invitations/:invitationId', requireRole(admins), async (req, res) => {
  const request = req as AuthenticatedRequest;
  if (req.params.id !== workspaceScope(request)) return res.status(403).json({ error: 'Workspace access denied' });
  try {
    const result = await prisma.workspaceInvitation.deleteMany({ where: { id: req.params.invitationId, workspaceId: workspaceScope(request), acceptedAt: null } });
    if (!result.count) return res.status(404).json({ error: 'Pending invitation not found' });
    return res.json({ message: 'Invitation cancelled' });
  } catch (error) {
    console.error('Workspace invitation cancellation failed:', error);
    return res.status(500).json({ error: 'Invitation could not be cancelled' });
  }
});

export default router;
