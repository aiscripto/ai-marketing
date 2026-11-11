import path from 'path';
import fs from 'fs/promises';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma';
import { publishExecutionEvent } from '../lib/executionEvents';

export async function logExecution(
  executionId: string,
  message: string,
  level: 'info' | 'warning' | 'error' | 'success' = 'info',
  agentName?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const record = await prisma.executionLog.create({
    data: { executionId, level, agentName: agentName || null, message, ...(metadata ? { metadata: metadata as Prisma.InputJsonValue } : {}) },
  });
  publishExecutionEvent(executionId, 'log', {
    id: record.id,
    level: record.level,
    agentName: record.agentName,
    message: record.message,
    createdAt: record.createdAt.toISOString(),
    metadata: record.metadata,
  });
}

export async function updateTaskState(taskId: string, executionId: string, status: string, data: Record<string, unknown> = {}) {
  await Promise.all([
    prisma.marketingTask.update({ where: { id: taskId }, data: { status } }),
    prisma.execution.update({
      where: { id: executionId },
      data: { status, ...(status === 'running' ? { startedAt: new Date(), completedAt: null } : { completedAt: new Date() }) },
    }),
  ]);
  publishExecutionEvent(executionId, 'status', { status, ...data });
}

function rootPath(envName: string, fallback: string): string {
  return path.resolve(process.env[envName] || path.resolve(process.cwd(), fallback));
}

export async function readSkill(command: string): Promise<string> {
  const root = rootPath('SKILLS_ROOT', '../../skills');
  const marketRoot = rootPath('MARKET_ROOT', '../../market');
  const file = command === 'quick' ? path.join(marketRoot, 'SKILL.md') : path.join(root, `market-${command}`, 'SKILL.md');
  return fs.readFile(file, 'utf8');
}

export async function readAgent(name: string): Promise<string> {
  const root = rootPath('AGENTS_ROOT', '../../agents');
  return fs.readFile(path.join(root, `market-${name}.md`), 'utf8');
}

export async function readTemplate(name: string): Promise<string> {
  const root = rootPath('TEMPLATES_ROOT', '../../templates');
  return fs.readFile(path.join(root, name), 'utf8');
}

export function parseJsonObject(text: string): Record<string, any> {
  const withoutFence = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const value = JSON.parse(withoutFence);
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const value = JSON.parse(withoutFence.slice(start, end + 1));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    }
  }
  throw new Error('The AI response was not valid JSON');
}

export function normalizeScore(value: unknown): number | null {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score) || score < 0) return null;
  return Math.round(Math.min(100, score <= 10 ? score * 10 : score));
}

export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const cause = (error as any).cause;
    const causeMsg = cause instanceof Error ? cause.message : (typeof cause === 'string' ? cause : '');
    const baseMsg = error.message;
    if (baseMsg === 'fetch failed') {
      return `Network connection failed${causeMsg ? `: ${causeMsg}` : ' (could not reach external service or worker)'}`;
    }
    if (causeMsg && !baseMsg.includes(causeMsg)) {
      return `${baseMsg} (${causeMsg})`.slice(0, 1000);
    }
    return baseMsg.slice(0, 1000);
  }
  return 'Execution failed with an unknown error';
}

export function valueArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

export function asJsonValue(value: unknown): any {
  return JSON.parse(JSON.stringify(value));
}

export function escapeMarkdown(value: unknown): string {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\|/g, '\\|');
}

export function gradeForScore(score: number | null): string {
  if (score === null) return 'Incomplete';
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
