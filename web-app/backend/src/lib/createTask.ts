import prisma from './prisma';
import { enqueueExecution } from './queue';
import { publishExecutionEvent } from './executionEvents';
import { logExecution, asJsonValue } from '../jobs/shared';

const auditAgents = ['content', 'conversion', 'competitive', 'technical', 'strategy'];

export async function createQueuedTask(args: {
  workspaceId: string;
  userId: string;
  projectId: string;
  type: string;
  title: string;
  input: Record<string, unknown>;
}) {
  const project = await prisma.project.findFirst({
    where: { id: args.projectId, workspaceId: args.workspaceId },
    select: { id: true, name: true },
  });
  if (!project) throw new Error('Project not found in this workspace');
  const specialistName = args.type.startsWith('agent:') ? args.type.slice('agent:'.length) : null;
  const executionAgents = args.type === 'audit' ? auditAgents : specialistName ? [specialistName] : [];

  const task = await prisma.marketingTask.create({
    data: {
      projectId: project.id,
      createdById: args.userId,
      type: args.type,
      title: args.title.slice(0, 255),
      status: 'queued',
      inputData: asJsonValue(args.input),
      executions: {
        create: {
          status: 'queued',
          ...(executionAgents.length ? { agentExecutions: { create: executionAgents.map((agentName) => ({ agentName, status: 'pending' })) } } : {}),
        },
      },
    },
    include: { executions: true },
  });
  const execution = task.executions[0];
  if (!execution) throw new Error('Execution record could not be created');

  try {
    await enqueueExecution({ taskId: task.id, executionId: execution.id, workspaceId: args.workspaceId });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Execution queue is unavailable';
    await Promise.all([
      prisma.marketingTask.update({ where: { id: task.id }, data: { status: 'failed', resultData: { error: message } } }),
      prisma.execution.update({ where: { id: execution.id }, data: { status: 'failed', completedAt: new Date(), errorMessage: message } }),
    ]);
    throw new Error(`Task could not be queued: ${message}`);
  }

  await prisma.activityLog.create({ data: {
    workspaceId: args.workspaceId,
    userId: args.userId,
    action: 'marketing_task.queued',
    resource: 'marketing_task',
    resourceId: task.id,
    metadata: { type: args.type, projectId: project.id },
  } });
  await logExecution(execution.id, `${args.title} queued`);
  publishExecutionEvent(execution.id, 'status', { status: 'queued', taskId: task.id, projectId: project.id, type: args.type });
  return { task, execution };
}
