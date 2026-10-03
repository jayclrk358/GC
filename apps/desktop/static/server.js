// Choosing which Game Central site the app shows.
(async () => {
  const input = document.getElementById('url');
  const error = document.getElementById('error');
  const reset = document.getElementById('reset');
  const server = await window.desktop.server();
  if (!server) return;
  input.value = server.current;
  reset.textContent = `Use the default (${new URL(server.builtFor).host})`;
  input.select();

  async function save(value) {
    error.textContent = '';
    const problem = await window.desktop.setServer(value);
    if (problem) {
      error.textContent = problem;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
    }
  }
  document.getElementById('form').addEventListener('submit', (e) => {
    e.preventDefault();
    void save(input.value);
  });
  reset.addEventListener('click', () => void save(server.builtFor));
  document.getElementById('cancel').addEventListener('click', () => window.desktop.cancel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.desktop.cancel();
  });
})();
