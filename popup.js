const slider = document.getElementById('speed');
const value = document.getElementById('value');
const speedCard = document.getElementById('speedCard');
const speedReason = document.getElementById('speedReason');

const pitchSlider = document.getElementById('pitch');
const pitchValue = document.getElementById('pitchValue');
const pitchCard = document.getElementById('pitchCard');
const pitchReason = document.getElementById('pitchReason');
const pitchHint = document.getElementById('pitchHint');

const problem = document.getElementById('problem');

const NO_MEDIA = 'No video or audio on this page.';
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
  pitchHint.hidden = pitchBlock !== null;
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

const SMALL_STEP = 1;
const BIG_STEP = 0.1;

function setFine(fine) {
  pitchSlider.step = fine ? BIG_STEP : SMALL_STEP;
}

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

  slider.value = rate;
  pitchSlider.value = semitones;
  renderRate(rate);
  renderPitch(semitones);
  renderAvailability(result);

  setInterval(refresh, 1000);
})();
