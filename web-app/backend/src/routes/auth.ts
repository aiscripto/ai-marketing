import { randomBytes } from 'crypto';
import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import prisma from '../lib/prisma';
import { createAccessToken, normalizeEmail, publicUser, slugify } from '../lib/auth';
import { sha256Hex } from '../lib/encryption';
import { mailIsConfigured, sendMail } from '../lib/mailer';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
const passwordRule = body('password')
  .isString().withMessage('Password is required')
  .isLength({ min: 12, max: 200 }).withMessage('Password must be between 12 and 200 characters');

router.post('/register', [
  body('email').isEmail().withMessage('Enter a valid email address'),
  passwordRule,
  body('firstName').isString().trim().isLength({ min: 1, max: 80 }),
  body('lastName').isString().trim().isLength({ min: 1, max: 80 }),
  body('workspaceName').isString().trim().isLength({ min: 2, max: 120 }),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid registration details', details: errors.array() });

  try {
    const email = normalizeEmail(req.body.email);
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const baseSlug = slugify(req.body.workspaceName);
    const workspace = await prisma.$transaction(async (tx) => {
      let slug = baseSlug;
      while (await tx.workspace.findUnique({ where: { slug }, select: { id: true } })) {
        slug = `${baseSlug}-${randomBytes(3).toString('hex')}`;
      }
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: req.body.firstName.trim(),
          lastName: req.body.lastName.trim(),
        },
      });
      const createdWorkspace = await tx.workspace.create({ data: { name: req.body.workspaceName.trim(), slug } });
      await tx.workspaceMember.create({
        data: { userId: createdUser.id, workspaceId: createdWorkspace.id, role: 'owner', joinedAt: new Date() },
      });
      await tx.activityLog.create({
        data: { userId: createdUser.id, workspaceId: createdWorkspace.id, action: 'workspace.created', resource: 'workspace' },
      });
      return { user: createdUser, workspace: createdWorkspace };
    });

    const token = createAccessToken({ userId: workspace.user.id, workspaceId: workspace.workspace.id, email, tokenVersion: workspace.user.tokenVersion });
    return res.status(201).json({
      token,
      user: publicUser(workspace.user, 'owner'),
      workspace: { id: workspace.workspace.id, name: workspace.workspace.name, slug: workspace.workspace.slug, plan: workspace.workspace.plan },
    });
  } catch (error) {
    console.error('Registration failed:', error);
    return res.status(500).json({ error: 'Account could not be created' });
  }
});

router.post('/login', [
  body('email').isEmail().withMessage('Enter a valid email address'),
  body('password').isString().isLength({ min: 1, max: 200 }),
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid login details', details: errors.array() });
  try {
    const email = normalizeEmail(req.body.email);
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      return res.status(401).json({ error: 'Email or password is incorrect' });
    }
    const membership = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      orderBy: { invitedAt: 'asc' },
      include: { workspace: true },
    });
    if (!membership) return res.status(403).json({ error: 'Your account has no workspace access' });
    const token = createAccessToken({ userId: user.id, workspaceId: membership.workspaceId, email, tokenVersion: user.tokenVersion });
    return res.json({
      token,
      user: publicUser(user, membership.role),
      workspace: { id: membership.workspace.id, name: membership.workspace.name, slug: membership.workspace.slug, plan: membership.workspace.plan },
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ error: 'Login could not be completed' });
  }
});

router.post('/forgot-password', [body('email').isEmail().withMessage('Enter a valid email address')], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid email address' });
  if (!mailIsConfigured()) {
    return res.status(503).json({ error: 'Password recovery email is not configured on this installation' });
  }
  const email = normalizeEmail(req.body.email);
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
    if (user) {
      const rawToken = randomBytes(32).toString('base64url');
      await prisma.$transaction([
        prisma.passwordReset.deleteMany({ where: { userId: user.id, usedAt: null } }),
        prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256Hex(rawToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        }),
      ]);
      const resetUrl = new URL('/reset-password', process.env.FRONTEND_URL || 'http://localhost:5173');
      resetUrl.searchParams.set('token', rawToken);
      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your AIScripto AI Marketing Suite password',
          text: `Use this one-time link within one hour to reset your password: ${resetUrl.toString()}`,
        });
      } catch (error) {
        await prisma.passwordReset.deleteMany({ where: { userId: user.id, tokenHash: sha256Hex(rawToken) } });
        throw error;
      }
    }
    return res.json({ message: 'If an account exists for that email, a password reset link has been sent.' });
  } catch (error) {
    console.error('Password recovery email failed:', error);
    return res.status(503).json({ error: 'Password recovery email could not be delivered' });
  }
});

router.post('/reset-password', [
  body('token').isString().isLength({ min: 20, max: 200 }),
  passwordRule,
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Enter a valid reset token and a password of at least 12 characters' });
  try {
    const tokenHash = sha256Hex(req.body.token);
    const reset = await prisma.passwordReset.findUnique({ where: { tokenHash } });
    if (!reset || reset.usedAt || reset.expiresAt <= new Date()) {
      return res.status(400).json({ error: 'This password reset link is invalid or expired' });
    }
    const passwordHash = await bcrypt.hash(req.body.password, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: reset.userId }, data: { passwordHash, tokenVersion: { increment: 1 } } }),
      prisma.passwordReset.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
      prisma.passwordReset.deleteMany({ where: { userId: reset.userId, id: { not: reset.id } } }),
    ]);
    return res.json({ message: 'Password updated. You can now sign in.' });
  } catch (error) {
    console.error('Password reset failed:', error);
    return res.status(500).json({ error: 'Password could not be reset' });
  }
});

router.use(authMiddleware);

router.get('/me', (req, res) => {
  const request = req as AuthenticatedRequest;
  return res.json({ user: request.user, workspace: request.workspace });
});

router.put('/profile', [
  body('firstName').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('lastName').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('theme').optional().isIn(['light', 'dark', 'system']),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'Invalid profile settings', details: errors.array() });
  const data = {
    ...(typeof req.body.firstName === 'string' ? { firstName: req.body.firstName.trim() } : {}),
    ...(typeof req.body.lastName === 'string' ? { lastName: req.body.lastName.trim() } : {}),
    ...(typeof req.body.theme === 'string' ? { theme: req.body.theme } : {}),
  };
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Provide a profile field to update' });
  try {
    const user = await prisma.user.update({ where: { id: request.user!.id }, data });
    return res.json({ user: publicUser(user, request.user!.role) });
  } catch (error) {
    console.error('Profile update failed:', error);
    return res.status(500).json({ error: 'Profile could not be updated' });
  }
});

router.put('/notification-preferences', async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const allowed = ['executionCompleted', 'executionFailed', 'workspaceInvites', 'weeklyDigest'];
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)
    || Object.keys(req.body).some((key) => !allowed.includes(key))
    || Object.values(req.body).some((value) => typeof value !== 'boolean')) {
    return res.status(400).json({ error: 'Notification preferences must contain supported boolean settings' });
  }
  try {
    const current = request.user?.notificationPreferences && typeof request.user.notificationPreferences === 'object'
      ? request.user.notificationPreferences as Record<string, unknown> : {};
    const preferences = { ...current, ...req.body } as Prisma.InputJsonObject;
    const user = await prisma.user.update({ where: { id: request.user!.id }, data: { notificationPreferences: preferences } });
    return res.json({ preferences: user.notificationPreferences });
  } catch (error) {
    console.error('Notification preference update failed:', error);
    return res.status(500).json({ error: 'Notification preferences could not be updated' });
  }
});

router.post('/change-password', [
  body('currentPassword').isString().isLength({ min: 1, max: 200 }),
  body('newPassword').isString().isLength({ min: 12, max: 200 }),
], async (req: Request, res: Response) => {
  const request = req as AuthenticatedRequest;
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: 'New passwords must be at least 12 characters' });
  try {
    const user = await prisma.user.findUnique({ where: { id: request.user!.id } });
    if (!user || !(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash, tokenVersion: { increment: 1 } } });
    return res.json({ message: 'Password updated. Sign in again with your new password.' });
  } catch (error) {
    console.error('Password change failed:', error);
    return res.status(500).json({ error: 'Password could not be changed' });
  }
});

router.post('/logout', (_req, res) => res.json({ message: 'Signed out' }));

router.post('/refresh', (req, res) => {
  const request = req as AuthenticatedRequest;
  if (!request.user || !request.workspaceId) return res.status(401).json({ error: 'Not authenticated' });
  const token = createAccessToken({ userId: request.user.id, workspaceId: request.workspaceId, email: request.user.email, tokenVersion: request.user.tokenVersion });
  return res.json({ token });
});

export default router;
