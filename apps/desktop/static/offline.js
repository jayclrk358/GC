// Shown when Magnox can't be reached: tries again by itself every so often.
(() => {
  const params = new URLSearchParams(location.search);
  const target = params.get('url') ?? '';
  const url = /^https?:\/\//.test(target) ? target : null;
  const status = document.getElementById('status');
  document.getElementById('detail').textContent = params.get('error')
    ? `${new URL(url ?? 'about:blank').host || 'The site'}: ${params.get('error')}`
    : '';

  function retry() {
    if (!url) return;
    status.textContent = 'Connecting…';
    location.href = url;
  }
  document.getElementById('retry').addEventListener('click', retry);
  document
    .getElementById('server')
    .addEventListener('click', () => window.desktop?.openServerSettings());
  window.addEventListener('online', retry);
  // The countdown isn't announced (it changes every second); the status line only on changes.
  const countdown = document.getElementById('countdown');
  let wait = 10;
  const tick = setInterval(() => {
    if (!navigator.onLine) {
      countdown.textContent = '';
      if (!status.textContent) status.textContent = 'Waiting for an internet connection…';
      return;
    }
    wait -= 1;
    countdown.textContent = `Trying again in ${wait} second${wait === 1 ? '' : 's'}…`;
    if (wait <= 0) {
      clearInterval(tick);
      retry();
    }
  }, 1000);
  document.getElementById('retry').focus();
})();
