import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import rateLimit from 'express-rate-limit';
import prisma from './lib/prisma';
import { startExecutionWorker, closeExecutionQueue } from './lib/queue';
import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import projectsRouter from './routes/projects';
import auditRouter from './routes/audit';
import toolsRouter from './routes/tools';
import agentsRouter from './routes/agents';
import executionsRouter from './routes/executions';
import dashboardRouter from './routes/dashboard';
import reportsRouter from './routes/reports';
import integrationsRouter from './routes/integrations';
import notificationsRouter from './routes/notifications';
import contentRouter from './routes/content';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map((origin) => origin.trim());

app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false);
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origin is not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.path.endsWith('/events'),
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

app.use('/api/v1/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many authentication attempts. Try again shortly.' },
}));
app.use('/api/v1', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/auth'),
}));

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/workspaces', workspacesRouter);
app.use('/api/v1/projects', projectsRouter);
app.use('/api/v1/dashboard', dashboardRouter);
app.use('/api/v1/audit', auditRouter);
app.use('/api/v1/tools', toolsRouter);
app.use('/api/v1/agents', agentsRouter);
app.use('/api/v1/executions', executionsRouter);
app.use('/api/v1/reports', reportsRouter);
app.use('/api/v1/integrations', integrationsRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/content', contentRouter);

app.use((_req, res) => res.status(404).json({ error: 'API route not found' }));
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (res.headersSent) return;
  console.error('Unhandled request error:', error instanceof Error ? error.message : 'unknown error');
  res.status(500).json({ error: 'The request could not be completed' });
};
app.use(errorHandler);

export async function startServer() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('Set JWT_SECRET to a random value of at least 32 characters');
  }
  await prisma.$connect();
  const executionWorker = startExecutionWorker();
  await new Promise<void>((resolve) => httpServer.listen(PORT, '0.0.0.0', resolve));
  console.log(`AIScripto AI Marketing Suite API listening on port ${PORT}`);
  const shutdown = async () => {
    httpServer.close();
    await closeExecutionQueue(executionWorker);
    await prisma.$disconnect();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('API startup failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { app, httpServer };
