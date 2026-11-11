import nodemailer from 'nodemailer';

export function mailIsConfigured(): boolean {
  return Boolean(process.env.SMTP_URL && process.env.SMTP_FROM);
}

export async function sendMail(message: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  if (!mailIsConfigured()) {
    throw new Error('SMTP_URL and SMTP_FROM must be configured to send email');
  }
  const transport = nodemailer.createTransport(process.env.SMTP_URL as string);
  await transport.sendMail({ ...message, from: process.env.SMTP_FROM as string });
}
