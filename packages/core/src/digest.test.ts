import { describe, expect, it } from 'vitest';
import { digestEmail } from './services/digest';

describe('digestEmail', () => {
  const items = [
    { title: 'Alice replied to “Raid night”', community: 'Neon Arcade', url: '/c/neon/t/1' },
    { title: 'Bob mentioned you', community: null, url: '/c/neon/m/2' },
  ];

  it('lists unread notifications with links, and says how many more there are', () => {
    const mail = digestEmail('daily', 5, items, 'https://gamecentral.example');
    expect(mail.subject).toBe('You have 5 unread notifications on Game Central');
    expect(mail.text).toContain('Since yesterday on Game Central');
    expect(mail.text).toContain('• Alice replied to “Raid night” (Neon Arcade)');
    expect(mail.text).toContain('https://gamecentral.example/c/neon/t/1');
    expect(mail.text).toContain('…and 3 more.');
    expect(mail.html).toContain('https://gamecentral.example/notifications');
  });

  it('reads naturally for one notification in a week', () => {
    const mail = digestEmail('weekly', 1, items.slice(0, 1), 'https://gamecentral.example');
    expect(mail.subject).toBe('You have 1 unread notification on Game Central');
    expect(mail.text).toContain('This week on Game Central');
    expect(mail.text).not.toContain('more.');
  });
});
