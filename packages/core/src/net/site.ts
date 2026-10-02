import { isIpLiteral } from './ssrf';

/**
 * Second-level labels that country domains register names under (example.co.uk, example.com.au,
 * example.ac.jp, example.gob.mx). An approximation of the Public Suffix List that's good enough
 * for rate limits.
 */
const SECOND_LEVEL = new Set([
  'ac',
  'co',
  'com',
  'edu',
  'gob',
  'go',
  'gov',
  'govt',
  'ltd',
  'me',
  'mil',
  'ne',
  'net',
  'nic',
  'nom',
  'or',
  'org',
  'plc',
  'sch',
]);

/**
 * The site a host belongs to: its registrable domain (`a.b.example.co.uk` → `example.co.uk`), or
 * the address itself for an IP. Rate limits keyed by this can't be dodged with made-up
 * subdomains.
 */
export function siteOf(hostname: string): string {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (isIpLiteral(host)) return host;
  const labels = host.split('.');
  if (labels.length <= 2) return host;
  const [second, top] = labels.slice(-2) as [string, string];
  const suffixLabels = top.length === 2 && SECOND_LEVEL.has(second) ? 2 : 1;
  return labels.slice(-(suffixLabels + 1)).join('.');
}
