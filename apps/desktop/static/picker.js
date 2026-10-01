// The screen picker: which screen or window to share in a voice call.
(async () => {
  const form = document.getElementById('form');
  const share = document.getElementById('share');
  const sound = document.getElementById('sound');
  const soundRow = document.getElementById('sound-row');
  // Cancelling always works, even before (or without) the list.
  document.getElementById('cancel').addEventListener('click', () => window.desktop.cancel());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.desktop.cancel();
  });
  const data = await window.desktop.sources();
  if (!data) return window.desktop.cancel();
  soundRow.hidden = !data.audio;

  for (const source of data.sources) {
    const label = document.createElement('label');
    label.className = 'source';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'source';
    input.value = source.id;
    input.dataset.screen = String(source.screen);
    const img = document.createElement('img');
    img.src = source.thumbnail;
    img.alt = '';
    const name = document.createElement('span');
    name.textContent = source.name;
    label.append(input, img, name);
    document.getElementById(source.screen ? 'screens' : 'windows').append(label);
  }
  for (const id of ['screens', 'windows']) {
    const grid = document.getElementById(id);
    if (!grid.children.length) grid.closest('fieldset').hidden = true;
  }
  if (!data.sources.length) {
    document.getElementById('empty').hidden = false;
    document.getElementById('cancel').focus();
    return;
  }

  form.addEventListener('change', () => {
    const chosen = form.querySelector('input[name="source"]:checked');
    share.disabled = !chosen;
    sound.disabled = !chosen || chosen.dataset.screen !== 'true';
    if (sound.disabled) sound.checked = false;
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const chosen = form.querySelector('input[name="source"]:checked');
    if (chosen) window.desktop.choose(chosen.value, sound.checked);
  });
  // Double-clicking a screen or window shares it straight away.
  form.addEventListener('dblclick', (e) => {
    const input = e.target.closest('.source')?.querySelector('input');
    if (input) window.desktop.choose(input.value, false);
  });
  form.querySelector('input[name="source"]')?.focus();
})();
