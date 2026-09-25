import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';
import { logger } from './logger';

let transport: Transporter | null | undefined;

function getTransport(): Transporter | null {
  if (transport !== undefined) return transport;
  transport = env().SMTP_URL ? nodemailer.createTransport(env().SMTP_URL) : null;
  return transport;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** Simple, accessible HTML email wrapper: real text, large tap targets, no images. */
export function renderEmail(opts: {
  heading: string;
  body: string;
  action?: { label: string; url: string };
}): {
  text: string;
  html: string;
} {
  const text = [
    opts.heading,
    '',
    opts.body,
    opts.action ? `\n${opts.action.label}: ${opts.action.url}` : '',
  ]
    .join('\n')
    .trim();
  const button = opts.action
    ? `<p><a href="${escapeHtml(opts.action.url)}" style="display:inline-block;padding:12px 20px;background:#4338ca;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.action.label)}</a></p><p style="font-size:14px;color:#4f5368">Or paste this link into your browser:<br>${escapeHtml(opts.action.url)}</p>`
    : '';
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#f7f7fb;font-family:system-ui,sans-serif;color:#14151f;font-size:16px;line-height:1.5"><main style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;border-radius:12px"><h1 style="font-size:22px;margin:0 0 16px">${escapeHtml(opts.heading)}</h1><p>${escapeHtml(opts.body).replace(/\n/g, '<br>')}</p>${button}<p style="font-size:13px;color:#4f5368;margin-top:32px">Magnox · You received this because of activity on your account.</p></main></body></html>`;
  return { text, html };
}

export async function sendMail(mail: Mail): Promise<void> {
  const t = getTransport();
  if (!t) {
    logger('mail').info(
      { to: mail.to, subject: mail.subject },
      `\n────── EMAIL ──────\n${mail.text}\n───────────────────`,
    );
    return;
  }
  await t.sendMail({ from: env().EMAIL_FROM, ...mail });
}
