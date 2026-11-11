import { Router } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: request.user!.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({ where: { userId: request.user!.id, isRead: false } }),
    ]);
    return res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('Notification list failed:', error);
    return res.status(500).json({ error: 'Notifications could not be loaded' });
  }
});

router.post('/read-all', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    await prisma.notification.updateMany({ where: { userId: request.user!.id, isRead: false }, data: { isRead: true } });
    return res.json({ message: 'Notifications marked as read' });
  } catch (error) {
    console.error('Notification read-all failed:', error);
    return res.status(500).json({ error: 'Notifications could not be updated' });
  }
});

router.patch('/:id/read', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: request.user!.id },
      data: { isRead: true },
    });
    if (!result.count) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Notification update failed:', error);
    return res.status(500).json({ error: 'Notification could not be updated' });
  }
});

router.delete('/:id', async (req, res) => {
  const request = req as AuthenticatedRequest;
  try {
    const result = await prisma.notification.deleteMany({ where: { id: req.params.id, userId: request.user!.id } });
    if (!result.count) return res.status(404).json({ error: 'Notification not found' });
    return res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error('Notification delete failed:', error);
    return res.status(500).json({ error: 'Notification could not be deleted' });
  }
});

export default router;
