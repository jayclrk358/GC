// "What's new": the site's latest updates, shown once after each one and from Help → What's new.
// Everything from the site goes on screen as plain text.
(async () => {
  const data = await window.desktop?.changelog();
  const list = document.getElementById('entries');
  for (const entry of data?.entries ?? []) {
    const item = document.createElement('li');
    item.className = 'entry';
    const article = document.createElement('article');
    const time = document.createElement('time');
    time.dateTime = entry.date;
    time.textContent = new Date(`${entry.date}T12:00:00Z`).toLocaleDateString(undefined, {
      dateStyle: 'long',
      timeZone: 'UTC',
    });
    const title = document.createElement('h2');
    title.textContent = entry.title;
    article.append(time, title);
    if (entry.items.length) {
      const points = document.createElement('ul');
      for (const text of entry.items) {
        const point = document.createElement('li');
        point.textContent = text;
        points.append(point);
      }
      article.append(points);
    }
    item.append(article);
    list.append(item);
  }
  document.getElementById('empty').hidden = list.children.length > 0;
  document.getElementById('all').addEventListener('click', () => window.desktop.openChangelog());
  document.getElementById('close').addEventListener('click', () => window.desktop.cancel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.desktop.cancel();
  });
  document.getElementById('close').focus({ preventScroll: true });
})();
