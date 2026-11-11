import prisma from '../lib/prisma';

export async function notifyTaskOwner(userId: string | null, title: string, status: 'completed' | 'failed') {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
  const preferences = user?.notificationPreferences && typeof user.notificationPreferences === 'object'
    ? user.notificationPreferences as Record<string, unknown> : {};
  const preferenceKey = status === 'completed' ? 'executionCompleted' : 'executionFailed';
  if (preferences[preferenceKey] === false) return;
  await prisma.notification.create({ data: {
    userId,
    title: status === 'completed' ? 'Marketing task completed' : 'Marketing task failed',
    message: status === 'completed' ? `${title} is ready to review.` : `${title} failed. Open execution history to review the error and retry.`,
    type: status === 'completed' ? 'success' : 'error',
  } });
}
