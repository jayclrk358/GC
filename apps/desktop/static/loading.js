// The loading screen, shown while Game Central opens: where it's connecting to, and the latest
// update (from the site's changelog, remembered from last time and refreshed in the background).
(async () => {
  const status = document.getElementById('status');

  function showLatest(latest) {
    if (!latest) return;
    document.getElementById('latest-title').textContent = latest.title;
    const date = document.getElementById('latest-date');
    date.dateTime = latest.date;
    date.textContent = new Date(`${latest.date}T12:00:00Z`).toLocaleDateString(undefined, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    document.getElementById('latest').hidden = false;
  }

  window.desktop?.onLatest(showLatest);
  const info = await window.desktop?.loading();
  if (!info) return;
  status.textContent = `Connecting to ${info.host}…`;
  document.getElementById('version').textContent = `Version ${info.version}`;
  showLatest(info.latest);
  setTimeout(() => {
    status.textContent = 'Still connecting…';
  }, 10_000);
})();
