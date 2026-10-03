import { describe, expect, it } from 'vitest';
import { checkDomainDns, type DomainResolver } from './services/custom-domains';

function resolver(records: Record<string, { txt?: string[]; cname?: string[]; a?: string[] }>) {
  const get = (name: string, key: 'txt' | 'cname' | 'a') => {
    const v = records[name]?.[key];
    return v
      ? Promise.resolve(v)
      : Promise.reject(Object.assign(new Error('nodata'), { code: 'ENODATA' }));
  };
  return {
    resolveTxt: (n) => get(n, 'txt').then((v) => v.map((s) => [s])),
    resolveCname: (n) => get(n, 'cname'),
    resolve4: (n) => get(n, 'a'),
    resolve6: () => Promise.reject(new Error('nodata')),
  } satisfies DomainResolver;
}

describe('checkDomainDns', () => {
  const txt = { '_gamecentral.forum.clan.gg': { txt: ['gamecentral-verify=tok'] } };

  it('needs the TXT record first', async () => {
    const err = await checkDomainDns('forum.clan.gg', 'tok', 'gamecentral.example', resolver({}));
    expect(err).toMatch(/TXT record isn’t there/);
    const wrong = await checkDomainDns(
      'forum.clan.gg',
      'tok',
      'gamecentral.example',
      resolver({ '_gamecentral.forum.clan.gg': { txt: ['gamecentral-verify=other'] } }),
    );
    expect(wrong).toMatch(/TXT record isn’t there/);
  });

  it('accepts a CNAME to the site', async () => {
    const r = resolver({ ...txt, 'forum.clan.gg': { cname: ['GameCentral.Example.'] } });
    expect(await checkDomainDns('forum.clan.gg', 'tok', 'gamecentral.example', r)).toBeNull();
  });

  it('accepts the same addresses (an apex domain with A records)', async () => {
    const r = resolver({
      ...txt,
      'gamecentral.example': { a: ['203.0.113.7'] },
      'forum.clan.gg': { a: ['203.0.113.7'] },
    });
    expect(await checkDomainDns('forum.clan.gg', 'tok', 'gamecentral.example', r)).toBeNull();
  });

  it('refuses a domain that points somewhere else', async () => {
    const r = resolver({
      ...txt,
      'gamecentral.example': { a: ['203.0.113.7'] },
      'forum.clan.gg': { a: ['203.0.113.7', '198.51.100.1'] },
    });
    expect(await checkDomainDns('forum.clan.gg', 'tok', 'gamecentral.example', r)).toMatch(
      /doesn’t point here/,
    );
  });
});
