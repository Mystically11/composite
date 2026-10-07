const slider = document.getElementById('speed');
const value = document.getElementById('value');
const speedCard = document.getElementById('speedCard');
const speedReason = document.getElementById('speedReason');
const higher_speed = document.getElementById('higher_speed');

const pitchSlider = document.getElementById('pitch');
const pitchValue = document.getElementById('pitchValue');
const pitchCard = document.getElementById('pitchCard');
const pitchReason = document.getElementById('pitchReason');

const problem = document.getElementById('problem');

const NO_MEDIA = 'No video or audio on this page.';
const NORMAL_MAX_SPEED = 4;
const HIGHER_MAX_SPEED = 14;
const PITCH_REASONS = {
  drm: 'Unavailable, media is DRM protected',
  'cross-origin': 'Unavailable, pitch shift would break audio',
  captured: 'Unavailable'
};

let tabId = null;

function renderRate(rate) {
  value.textContent = `${rate.toFixed(2)}×`;
}

function renderPitch(semitones) {
  const sign = semitones > 0 ? '+' : '';
  pitchValue.textContent = `${sign}${semitones.toFixed(1)} st`;
}

async function send(message) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, message);
    return { scriptable: true, state: res ?? null };
  } catch {
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
  } catch {
    return { scriptable: false, state: null };
  }

  try {
    const res = await chrome.tabs.sendMessage(tabId, message);
    return { scriptable: true, state: res ?? null };
  } catch {
    return { scriptable: true, state: null };
  }
}

function setControl(card, input, el, reason) {
  const blocked = reason !== null;
  input.disabled = blocked;
  card.classList.toggle('unavailable', blocked);
  el.textContent = reason ?? '';
  el.hidden = !blocked;
}

function renderAvailability({ scriptable, state }) {
  problem.hidden = scriptable;
  if (!scriptable) return;

  const hasMedia = (state?.count ?? 0) > 0;
  setControl(speedCard, slider, speedReason, hasMedia ? null : NO_MEDIA);

  const pitchBlock = hasMedia ? (PITCH_REASONS[state.pitch] ?? null) : NO_MEDIA;
  setControl(pitchCard, pitchSlider, pitchReason, pitchBlock);
}

async function setRate(rate) {
  slider.value = rate;
  renderRate(rate);
  renderAvailability(await send({ type: 'SET_RATE', rate }));
}

async function setPitch(semitones) {
  pitchSlider.value = semitones;
  renderPitch(semitones);
  renderAvailability(await send({ type: 'SET_PITCH', semitones }));
}

slider.addEventListener('input', () => setRate(Number(slider.value)));
pitchSlider.addEventListener('input', () => setPitch(Number(pitchSlider.value)));
higher_speed.addEventListener('change', () => {
  localStorage.setItem('higher_speed', String(higher_speed.checked));
  const rate = Number(slider.value);
  slider.max = higher_speed.checked ? HIGHER_MAX_SPEED : NORMAL_MAX_SPEED;
  if (rate > NORMAL_MAX_SPEED && !higher_speed.checked) setRate(NORMAL_MAX_SPEED);
});

const PITCH_STEP = 1;
const FINE_PITCH_STEP = 0.1;
const SPEED_STEP = 0.25;
const FINE_SPEED_STEP = 0.01;

function setFine(fine) {
  pitchSlider.step = fine ? FINE_PITCH_STEP : PITCH_STEP;
  slider.step = fine ? FINE_SPEED_STEP : SPEED_STEP;
}

function handleWheel(event) {
  const input = event.currentTarget;
  const delta = event.deltaY || event.deltaX;
  if (input.disabled || delta === 0) return;

  event.preventDefault();
  setFine(event.shiftKey);

  const step = Number(input.step);
  const previous = input.value;
  const next = input.valueAsNumber - Math.sign(delta) * step;
  input.value = Math.max(Number(input.min), Math.min(Number(input.max), next));
  if (input.value !== previous) input.dispatchEvent(new Event('input', { bubbles: true }));
}

slider.addEventListener('wheel', handleWheel, { passive: false });
pitchSlider.addEventListener('wheel', handleWheel, { passive: false });

function reset_slider(event) {
  event.preventDefault();
  const input = event.currentTarget;
  if (input.disabled || input.value === input.defaultValue) return;
  input.value = input.defaultValue;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

slider.addEventListener('contextmenu', reset_slider);
pitchSlider.addEventListener('contextmenu', reset_slider);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') setFine(true);
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') setFine(false);
});
window.addEventListener('blur', () => setFine(false));

async function refresh() {
  renderAvailability(await send({ type: 'GET_STATE' }));
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'STATE_CHANGED') refresh();
});

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;

  const result = await send({ type: 'GET_STATE' });
  const rate = result.state?.rate ?? 1;
  const semitones = result.state?.semitones ?? 0;

  higher_speed.checked = localStorage.getItem('higher_speed') === 'true' || rate > NORMAL_MAX_SPEED;
  slider.max = higher_speed.checked ? HIGHER_MAX_SPEED : NORMAL_MAX_SPEED;
  slider.value = rate;
  pitchSlider.value = semitones;
  renderRate(rate);
  renderPitch(semitones);
  renderAvailability(result);

  setInterval(refresh, 1000);
})();
