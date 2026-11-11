import jwt, { type SignOptions } from 'jsonwebtoken';

export interface AccessClaims {
  userId: string;
  workspaceId: string;
  email: string;
  tokenVersion: number;
}

export function createAccessToken(claims: AccessClaims): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as SignOptions['expiresIn'];
  return jwt.sign(claims, secret, { expiresIn, issuer: 'aiscripto-marketing-suite' });
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'workspace';
}

export function publicUser(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  theme?: string;
  notificationPreferences?: unknown;
}, role: string) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    theme: user.theme || 'light',
    notificationPreferences: user.notificationPreferences || {},
    role,
  };
}
