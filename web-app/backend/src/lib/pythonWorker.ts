const workerUrl = (process.env.PYTHON_WORKER_URL || 'http://localhost:8000').replace(/\/$/, '');

async function postJson<T>(path: string, payload: unknown): Promise<T> {
  const workerKey = process.env.WORKER_API_KEY;
  if (!workerKey) throw new Error('Python worker authentication is not configured');
  const response = await fetch(`${workerUrl}${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', 'X-Worker-Key': workerKey },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail || `Python worker returned HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function analyzePage(url: string, taskId?: string) {
  return postJson<{ status: string; url: string; data: Record<string, unknown> }>('/analyze-page', { url, task_id: taskId });
}

export function scanCompetitors(urls: string[], taskId?: string) {
  return postJson<{ status: string; results: Array<Record<string, unknown>> }>('/scan-competitors', { competitors: urls, task_id: taskId });
}

export async function extractPdfText(file: Buffer, fileName: string): Promise<string> {
  const workerKey = process.env.WORKER_API_KEY;
  if (!workerKey) throw new Error('Python worker authentication is not configured');
  const response = await fetch(`${workerUrl}/extract-pdf-text`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/pdf', 'X-Worker-Key': workerKey, 'X-File-Name': fileName },
    body: file,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail || `PDF extraction returned HTTP ${response.status}`);
  }
  const data = await response.json() as { text?: unknown };
  if (typeof data.text !== 'string') throw new Error('PDF text extraction returned an invalid response');
  return data.text;
}

export function generateSocialCalendar(topic: string, brand: string | undefined, platforms: string[], days: number, taskId?: string) {
  return postJson<{ status: string; calendar: Record<string, unknown> }>('/generate-social-calendar', {
    topic, brand, platforms, days, task_id: taskId,
  });
}

export async function generatePdf(reportData: Record<string, unknown>, title: string): Promise<Buffer> {
  const workerKey = process.env.WORKER_API_KEY;
  if (!workerKey) throw new Error('Python worker authentication is not configured');
  const response = await fetch(`${workerUrl}/generate-pdf-report`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
    headers: { 'Content-Type': 'application/json', 'X-Worker-Key': workerKey },
    body: JSON.stringify({ report_data: reportData, output_filename: `${title.replace(/[^a-z0-9-]/gi, '-').slice(0, 80)}.pdf` }),
  });
  if (!response.ok) throw new Error(`PDF worker returned HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
