import { headers } from 'next/headers';
import { themeToCss, type Theme } from '@magnox/shared';
import { getPrefs } from '@/lib/prefs';

/** Inject a community's validated theme tokens, unless the viewer turned community themes off. */
export async function CommunityThemeStyle({ theme }: { theme: Theme }) {
  const prefs = await getPrefs();
  if (!prefs.communityThemes) return null;
  let css: string;
  try {
    css = themeToCss(theme);
  } catch {
    return null;
  }
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return <style nonce={nonce} dangerouslySetInnerHTML={{ __html: css }} />;
}
