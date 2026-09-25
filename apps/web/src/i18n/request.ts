import { getRequestConfig } from 'next-intl/server';

// English only for now. The structure is ready for more locales (cookie or Accept-Language).
export default getRequestConfig(async () => {
  const locale = 'en';
  return {
    locale,
    timeZone: 'UTC',
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
