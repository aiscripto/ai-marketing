import prisma from '../lib/prisma';
import { publishExecutionEvent } from '../lib/executionEvents';
import { markExecutionFailed, runMarketingTool } from './tool';
import { runAudit, runSpecialistAgent } from './audit';
import { logExecution, safeErrorMessage } from './shared';
import { notifyTaskOwner } from './notifications';

interface ExecutionJobData {
  taskId: string;
  executionId: string;
  workspaceId: string;
}

export async function processExecutionJob(data: ExecutionJobData): Promise<void> {
  const { taskId, executionId, workspaceId } = data;
  const task = await prisma.marketingTask.findFirst({
    where: { id: taskId, project: { workspaceId } },
    include: { project: { select: { id: true, workspaceId: true } } },
  });
  if (!task) throw new Error('Marketing task was not found in its workspace');
  if (task.status === 'cancelled') return;

  await prisma.marketingTask.update({ where: { id: taskId }, data: { status: 'running' } });
  await prisma.execution.update({ where: { id: executionId }, data: { status: 'running', startedAt: new Date() } });
  publishExecutionEvent(executionId, 'status', { status: 'running', tool: task.type, projectId: task.projectId });
  await logExecution(executionId, `Execution started for ${task.title}`);
  try {
    const input = task.inputData && typeof task.inputData === 'object' && !Array.isArray(task.inputData)
      ? task.inputData as Record<string, any>
      : {};
    if (task.type === 'audit') {
      await runAudit(taskId, executionId, workspaceId, task.projectId, input);
    } else if (task.type.startsWith('agent:')) {
      await runSpecialistAgent(taskId, executionId, workspaceId, task.projectId, task.type.slice('agent:'.length), input);
    } else {
      await runMarketingTool(taskId, executionId, workspaceId, task.projectId, task.type, input);
    }

    const current = await prisma.execution.findUnique({ where: { id: executionId }, select: { startedAt: true } });
    const completedAt = new Date();
    const durationMs = current?.startedAt ? completedAt.getTime() - current.startedAt.getTime() : null;
    await Promise.all([
      prisma.marketingTask.update({ where: { id: taskId }, data: { status: 'completed' } }),
      prisma.execution.update({ where: { id: executionId }, data: { status: 'completed', completedAt, durationMs } }),
    ]);
    publishExecutionEvent(executionId, 'status', { status: 'completed', completedAt: completedAt.toISOString(), durationMs });
    await notifyTaskOwner(task.createdById, task.title, 'completed');
  } catch (error) {
    const message = safeErrorMessage(error);
    try {
      await markExecutionFailed(taskId, executionId, message);
      await logExecution(executionId, message, 'error');
    } catch (persistError) {
      console.error('Could not persist execution failure:', persistError);
    }
    await notifyTaskOwner(task.createdById, task.title, 'failed').catch((notificationError) => console.error('Could not create task failure notification:', notificationError));
    throw error;
  }
}
