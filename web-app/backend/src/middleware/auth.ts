import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';

export interface JwtPayload {
  userId: string;
  workspaceId: string;
  email: string;
  tokenVersion: number;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    tokenVersion: number;
    theme: string;
    notificationPreferences: unknown;
  };
  workspace?: {
    id: string;
    name: string;
    slug: string;
    plan: string;
    companyName: string | null;
    websiteUrl: string | null;
    industry: string | null;
    targetAudience: string | null;
    markets: string[];
    brandVoice: string | null;
  };
  workspaceId?: string;
}

export const authMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing or invalid Authorization header' });
      return;
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      res.status(401).json({ error: 'Token not provided' });
      return;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET not configured');
    }

    let payload: JwtPayload;
    try {
      payload = jwt.verify(token, jwtSecret, { issuer: 'aiscripto-marketing-suite' }) as JwtPayload;
    } catch (err: unknown) {
      if (err instanceof jwt.TokenExpiredError) {
        res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
        return;
      }
      res.status(401).json({ error: 'Invalid token', code: 'INVALID_TOKEN' });
      return;
    }

    // Load user from DB
    const member = await prisma.workspaceMember.findFirst({
      where: {
        userId: payload.userId,
        workspaceId: payload.workspaceId,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            tokenVersion: true,
            theme: true,
            notificationPreferences: true,
          },
        },
        workspace: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            companyName: true,
            websiteUrl: true,
            industry: true,
            targetAudience: true,
            markets: true,
            brandVoice: true,
          },
        },
      },
    });

    if (!member) {
      res.status(401).json({ error: 'User not found or not a workspace member' });
      return;
    }

    if (payload.tokenVersion !== member.user.tokenVersion) {
      res.status(401).json({ error: 'Session expired. Sign in again.', code: 'SESSION_INVALIDATED' });
      return;
    }

    req.user = {
      id: member.user.id,
      email: member.user.email,
      firstName: member.user.firstName,
      lastName: member.user.lastName,
      role: member.role,
      tokenVersion: member.user.tokenVersion,
      theme: member.user.theme,
      notificationPreferences: member.user.notificationPreferences,
    };
    req.workspace = {
      id: member.workspace.id,
      name: member.workspace.name,
      slug: member.workspace.slug,
      plan: member.workspace.plan,
      companyName: member.workspace.companyName,
      websiteUrl: member.workspace.websiteUrl,
      industry: member.workspace.industry,
      targetAudience: member.workspace.targetAudience,
      markets: member.workspace.markets,
      brandVoice: member.workspace.brandVoice,
    };
    req.workspaceId = member.workspace.id;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
};
