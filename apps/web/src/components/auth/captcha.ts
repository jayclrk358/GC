/** Error codes the auth server sends when the Turnstile check is missing or fails. */
const CAPTCHA_CODES = new Set(['MISSING_RESPONSE', 'VERIFICATION_FAILED']);

export function isCaptchaError(error: { code?: string } | null | undefined): boolean {
  return Boolean(error?.code && CAPTCHA_CODES.has(error.code));
}

/** Request options that carry the Turnstile token to the auth server. */
export function captchaOptions(token: string | null) {
  return token ? { headers: { 'x-captcha-response': token } } : undefined;
}
