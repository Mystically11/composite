const slider = document.getElementById('speed');
const value = document.getElementById('value');
const pitchSlider = document.getElementById('pitch');
const pitchValue = document.getElementById('pitchValue');
const problem = document.getElementById('problem');

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
    return (await chrome.tabs.sendMessage(tabId, message)) ?? null;
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    });
    try {
      return (await chrome.tabs.sendMessage(tabId, message)) ?? null;
    } catch {
      return null;
    }
  }
}

async function setRate(rate) {
  slider.value = rate;
  renderRate(rate);
  try {
    await send({ type: 'SET_RATE', rate });
  } catch {
    problem.hidden = false;
  }
}

async function setPitch(semitones) {
  pitchSlider.value = semitones;
  renderPitch(semitones);
  try {
    await send({ type: 'SET_PITCH', semitones });
  } catch {
    problem.hidden = false;
  }
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

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;
  try {
    const res = await send({ type: 'GET_STATE' });
    const rate = res?.rate ?? 1;
    const semitones = res?.semitones ?? 0;
    slider.value = rate;
    pitchSlider.value = semitones;
    renderRate(rate);
    renderPitch(semitones);
  } catch {
    renderRate(1);
    renderPitch(0);
    problem.hidden = false;
  }
})();
