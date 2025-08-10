// ===== FunkPhonic script.js =====

// If your site is hosted at https://username.github.io/FunkPhonic/
// set BASE_PATH = '/FunkPhonic'. If it's at the root, leave ''.
const BASE_PATH = '/FunkPhonic'; // '' or '/FunkPhonic'

// Your Cloudflare Worker URL (backend proxy). Example:
// https://funkphonic-tts.yourname.workers.dev
const PROXY_URL = 'https://YOUR-WORKER-NAME.YOURNAME.workers.dev';

// Optional: keep a default Voice ID client-side (you can override per call)
const DEFAULT_VOICE_ID = localStorage.getItem('funkphonic_voice_id') || '';

// ---------- Service Worker registration ----------
(async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const swUrl = `${BASE_PATH || ''}/worker.js`;
    await navigator.serviceWorker.register(swUrl);
    // Optional: prompt SW to activate immediately after updates
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch (err) {
    console.warn('[SW]', err);
  }
})();

// ---------- Backend call (Cloudflare Worker) ----------
async function ttsViaProxy({ text, voiceId }) {
  if (!PROXY_URL) throw new Error('Missing PROXY_URL in script.js');
  if (!text || !text.trim()) throw new Error('No text provided');
  const payload = {
    text: text.trim(),
    // If a voiceId is passed, use it; otherwise backend can fall back to ENV ELEVEN_VOICE_ID
    ...(voiceId ? { voice_id: voiceId } : {})
  };

  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errTxt = await res.text().catch(() => '');
    throw new Error(`Proxy ${res.status}: ${errTxt || 'unknown error'}`);
  }

  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: 'audio/mpeg' });
}

// ---------- Helpers ----------
function playBlob(blob) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(() => {/* autoplay might be blocked; user can click */});
  return url; // return so we can also offer a download link
}

function attachDownload(url, fileName = 'funkphonic-voice.mp3') {
  const a = document.getElementById('download-link');
  if (!a) return;
  a.href = url;
  a.download = fileName;
  a.style.display = 'block';
}

// Save/get Voice ID locally (optional UI hook)
function saveVoiceId(id) {
  if (!id) return;
  localStorage.setItem('funkphonic_voice_id', id);
}
function getVoiceId() {
  return localStorage.getItem('funkphonic_voice_id') || DEFAULT_VOICE_ID;
}

// ---------- Optional: wire up to your existing UI ----------
(function wireUI() {
  const genVoiceBtn = document.getElementById('voicegen-btn');
  const textInput   = document.getElementById('text-input');

  if (!genVoiceBtn || !textInput) return; // if your page uses different IDs, no crash

  genVoiceBtn.addEventListener('click', async () => {
    try {
      genVoiceBtn.disabled = true;
      const text = textInput.value || '';
      const voiceId = getVoiceId(); // you can set this elsewhere in your UI

      const mp3Blob = await ttsViaProxy({ text, voiceId });
      const url = playBlob(mp3Blob);
      attachDownload(url);
    } catch (e) {
      console.error('[FunkPhonic] TTS error:', e);
      alert(e.message || 'TTS failed');
    } finally {
      genVoiceBtn.disabled = false;
    }
  });
})();

// ---------- Expose minimal API for custom UIs ----------
window.FunkPhonic = {
  tts: ttsViaProxy,
  playBlob,
  attachDownload,
  saveVoiceId,
  getVoiceId
};

