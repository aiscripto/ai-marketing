import prisma from './prisma';
import { decryptSecret } from './encryption';

export type AiProvider = 'openai' | 'anthropic';

interface ProviderConfig {
  provider: AiProvider;
  apiKey: string;
  model: string;
}

function isProvider(value: string): value is AiProvider {
  return value === 'openai' || value === 'anthropic';
}

export function extractOpenAIResponseText(response: {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
}): string {
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((part): part is { type?: string; text: string } => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

export async function getProviderConfig(workspaceId: string, requested?: string): Promise<ProviderConfig> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { aiProvider: true } });
  const providerValue = requested || workspace?.aiProvider || process.env.DEFAULT_AI_PROVIDER || 'openai';
  if (!isProvider(providerValue)) throw new Error('Selected AI provider is not supported');
  const provider = providerValue;
  const configured = await prisma.apiConfiguration.findUnique({ where: { workspaceId_provider: { workspaceId, provider } } });
  if (configured?.isActive) {
    return {
      provider,
      apiKey: decryptSecret(configured.encryptedKey),
      model: configured.model || (provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-5'),
    };
  }
  const envKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  if (envKey) {
    return {
      provider,
      apiKey: envKey,
      model: process.env.DEFAULT_MODEL || (provider === 'openai' ? 'gpt-4.1' : 'claude-sonnet-5'),
    };
  }
  throw new Error(`Configure a ${provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key in Settings before generating AI content`);
}

export async function generateText(args: {
  workspaceId: string;
  system: string;
  user: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const config = await getProviderConfig(args.workspaceId, args.provider);
  const model = args.model || config.model;
  const maxTokens = args.maxTokens || 4096;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    if (config.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        signal: controller.signal,
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          max_output_tokens: maxTokens,
          ...(args.json ? { text: { format: { type: 'json_object' } } } : {}),
          input: [
            { role: 'system', content: [{ type: 'input_text', text: args.system }] },
            { role: 'user', content: [{ type: 'input_text', text: args.user }] },
          ],
        }),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({})) as { error?: { message?: string } };
        const detailedMsg = errJson.error?.message;
        throw new Error(detailedMsg ? `OpenAI: ${detailedMsg}` : `OpenAI request failed (HTTP ${response.status})`);
      }
      const data = await response.json() as Parameters<typeof extractOpenAIResponseText>[0];
      const output = extractOpenAIResponseText(data);
      if (!output) throw new Error('OpenAI returned an empty response');
      return output;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: args.system,
        messages: [{ role: 'user', content: args.user }],
      }),
    });
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({})) as { error?: { message?: string } };
      const detailedMsg = errJson.error?.message;
      throw new Error(detailedMsg ? `Anthropic: ${detailedMsg}` : `Anthropic request failed (HTTP ${response.status})`);
    }
    const data = await response.json() as { content?: Array<{ type: string; text?: string }> };
    const output = data.content?.filter((part) => part.type === 'text').map((part) => part.text || '').join('\n').trim();
    if (!output) throw new Error('Anthropic returned an empty response');
    return output;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error('AI provider timed out after 90 seconds');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function testProviderConnection(providerValue: string, apiKey: string, model?: string): Promise<void> {
  if (!isProvider(providerValue)) throw new Error('Unsupported AI provider');
  if (!apiKey.trim()) throw new Error('API key is required');
  const url = providerValue === 'openai'
    ? 'https://api.openai.com/v1/models'
    : 'https://api.anthropic.com/v1/models';
  const headers: Record<string, string> = providerValue === 'openai'
    ? { Authorization: `Bearer ${apiKey}` }
    : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' };
  if (model && model.length > 120) throw new Error('Model name is too long');
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) {
    const errJson = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const detailedMsg = errJson.error?.message;
    throw new Error(detailedMsg ? `${providerValue}: ${detailedMsg}` : `${providerValue} rejected the API key (HTTP ${response.status})`);
  }
  if (model) {
    const payload = await response.json().catch(() => null) as { data?: Array<{ id?: string }> } | null;
    const availableModels = payload?.data?.map((item) => item.id).filter((id): id is string => Boolean(id));
    if (availableModels?.length && !availableModels.includes(model)) throw new Error(`The API key is valid, but model "${model}" is not available to this account`);
  }
}
