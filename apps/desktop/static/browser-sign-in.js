// Waiting while someone signs in with Discord, Google or Twitch in their browser.
(async () => {
  const state = await window.desktop?.signIn();
  if (!state) return;
  document.title = `Continue in your browser – ${state.provider}`;
  document.getElementById('intro').textContent =
    `We’ve opened ${state.provider} sign-in in your browser.`;
  document.getElementById('detail').textContent =
    `If you’re already signed in to ${state.provider} there, it only takes a click. Once you’re ` +
    'done, you’ll come straight back here.';
  if (state.error) document.getElementById('error').textContent = state.error;
  document.getElementById('reopen').addEventListener('click', () => window.desktop.reopenSignIn());
  document.getElementById('here').addEventListener('click', () => window.desktop.signInHere());
  document.getElementById('cancel').addEventListener('click', () => window.desktop.cancelSignIn());
  document.getElementById('reopen').focus();
})();
