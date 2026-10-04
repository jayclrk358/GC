/** A Better Auth error from a two-factor request, in words people can act on. */
export function twoFactorError(
  t: (key: 'password' | 'code' | 'locked' | 'expired' | 'tooFast' | 'generic') => string,
  error: { code?: string; message?: string; status?: number },
): string {
  switch (error.code) {
    case 'INVALID_PASSWORD':
      return t('password');
    case 'INVALID_CODE':
    case 'INVALID_BACKUP_CODE':
      return t('code');
    case 'ACCOUNT_TEMPORARILY_LOCKED':
      return t('locked');
    case 'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE':
    case 'INVALID_TWO_FACTOR_COOKIE':
      return t('expired');
  }
  if (error.status === 429) return t('tooFast');
  return t('generic');
}
