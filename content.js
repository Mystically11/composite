let currentRate = 1;
let currentSemitones = 0;

function mediaElements() {
  return [...document.querySelectorAll('video, audio')];
}

function applyRate(rate) {
  currentRate = rate;
  for (const el of mediaElements()) {
    el.playbackRate = rate;
  }
}


const WORKLET_URL = chrome.runtime.getURL('pitch-processor.js');

let audioCtx = null;
let workletReady = null;
const routed = new WeakMap();

async function ensureContext() {
  if (!audioCtx) {
    audioCtx = new AudioContext();
    workletReady = audioCtx.audioWorklet.addModule(WORKLET_URL);
  }
  await workletReady;
  if (audioCtx.state === 'suspended') await audioCtx.resume();
}

async function shifterFor(el) {
  const existing = routed.get(el);
  if (existing) return existing;

  await ensureContext();
  const raced = routed.get(el);
  if (raced) return raced;

  const source = audioCtx.createMediaElementSource(el);
  const shifter = new AudioWorkletNode(audioCtx, 'pitch-shifter');
  source.connect(shifter).connect(audioCtx.destination);
  routed.set(el, shifter);
  return shifter;
}

const unroutable = new WeakSet();
const warned = new WeakSet();

async function applyPitch(semitones) {
  currentSemitones = semitones;
  const ratio = 2 ** (semitones / 12);

  for (const el of mediaElements()) {
    if (semitones === 0 && !routed.has(el)) continue;
    if (unroutable.has(el)) continue;
    try {
      const shifter = await shifterFor(el);
      shifter.parameters.get('ratio').value = ratio;
    } catch (err) {
      if (err.name === 'InvalidStateError') unroutable.add(el);
      if (!warned.has(el)) {
        warned.add(el);
        console.warn(`Composite: could not pitch-shift (${err.name}: ${err.message})`, el);
      }
    }
  }
}


document.addEventListener('ratechange', (e) => {
  const el = e.target;
  if (el instanceof HTMLMediaElement && el.playbackRate !== currentRate) {
    el.playbackRate = currentRate;
  }
}, true);

document.addEventListener('loadstart', (e) => {
  const el = e.target;
  if (el instanceof HTMLMediaElement) {
    el.playbackRate = currentRate;
    if (currentSemitones !== 0) applyPitch(currentSemitones);
  }
}, true);

new MutationObserver(() => {
  if (currentRate !== 1) applyRate(currentRate);
  if (currentSemitones !== 0) applyPitch(currentSemitones);
}).observe(document.documentElement, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SET_RATE') {
    applyRate(message.rate);
  } else if (message.type === 'SET_PITCH') {
    applyPitch(message.semitones);
  } else if (message.type !== 'GET_STATE') {
    return;
  }

  const els = mediaElements();
  if (!els.length) return;

  const playing = els.find((el) => !el.paused) ?? els[0];
  sendResponse({ rate: playing.playbackRate, semitones: currentSemitones, count: els.length });
});
