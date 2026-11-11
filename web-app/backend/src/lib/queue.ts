import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { processExecutionJob } from '../jobs/processExecution';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const queueConnection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
const workerConnection = new Redis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });

export const executionQueue = new Queue('marketing-executions', {
  connection: queueConnection,
  defaultJobOptions: { attempts: 1, removeOnComplete: 500, removeOnFail: 1000 },
});

export async function enqueueExecution(data: { taskId: string; executionId: string; workspaceId: string }): Promise<void> {
  await executionQueue.add('run', data, { jobId: data.executionId });
}

export function startExecutionWorker(): Worker {
  const worker = new Worker('marketing-executions', async (job: Job) => processExecutionJob(job.data), {
    connection: workerConnection,
    concurrency: 3,
    lockDuration: 120_000,
  });
  worker.on('failed', (job, error) => {
    console.error(`Execution queue job ${job?.id || 'unknown'} failed:`, error.message);
  });
  worker.on('error', (error) => console.error('Execution worker error:', error.message));
  return worker;
}

export async function closeExecutionQueue(worker?: Worker): Promise<void> {
  await Promise.allSettled([
    worker?.close(),
    executionQueue.close(),
    queueConnection.quit(),
    workerConnection.quit(),
  ]);
}
