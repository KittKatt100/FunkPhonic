// FunkPhonic — Frontend script (talks to Cloudflare Worker backend only)

// ----- CONFIG: your backend Worker base -----
const PROXY_BASE = 'https://funkphonic.funkulture1.workers.dev';
const CLONE_URL  = PROXY_BASE + '/clone';
const TTS_URL    = PROXY_BASE + '/tts';

// ----- Element helpers -----
const $ = (id) => document.getElementById(id);

// Required elements (based on your UI)
const scriptEl   = $('script');       // textarea with the vocal script
const moodEl     = $('mood');         // select with mood
const speedEl    = $('speed');        // range for playback rate
const voiceName  = $('voice-name');   // input text for voice name
const voiceFile  = $('voice-file');   // input file for audio sample
const uploadBtn  = $('upload');       // button Upload & Clone
const genBtn     = $('generate');     // button Generate MP3
const player     = $('player');       // <audio> element
const downloadA  = $('download');     // <a> for download

// Optional status elements (if you added them)
const msgEl      = $('msg');          // div for messages (optional)
const errEl      = $('err');          // <pre> for errors (optional)
const upSpin     = $('up-spin');      // spinner beside upload (optional)
const genSpin    = $('gen-spin');     // spinner beside generate (optional)
const voiceStatus= $('voice-status'); // small status text (optional)
const speedLabel = $('speedLabel');   // label showing 1.00x (optional)

// ----- UI helpers -----
function busy(btn, spin, on = true){
  if (btn) btn.disabled = on;
  if (spin) spin.style.visibility = on ? 'visible' : 'hidden';
}
function showMsg(text, type = 'info', ms = 3500){
  if (!msgEl) return console.log(`[${type}]`, text);
  msgEl.className = 'msg ' + type;
  msgEl.textContent = text;
  msgEl.style.display = 'block';
  if (ms) setTimeout(()=> msgEl.style.display = 'none', ms);
}
function showErr(e){
  const out = typeof e === 'string' ? e : (e?.message || JSON.stringify(e));
  if (errEl){
    errEl.style.display = 'block';
    errEl.textContent = out;
  } else {
    console.error(out);
  }
}
function clearErr(){
  if (errEl){ errEl.style.display = 'none'; errEl.textContent = ''; }
}

// ----- Voice ID (local storage) -----
const setVoiceId = (id) => localStorage.setItem('eleven_voice_id', id || '');
const getVoiceId = () => localStorage.getItem('eleven_voice_id') || '';
function refreshVoiceStatus(){
  if (!voiceStatus) return;
  const id = getVoiceId();
  voiceStatus.textContent = id ? `Voice ready (id: ${id.slice(0,8)}…)` : 'No voice uploaded yet.';
}
refreshVoiceStatus();

// ----- Speed label + audio playback rate -----
if (speedEl){
  speedEl.addEventListener('input', ()=>{
    const val = Number(speedEl.value);
    if (speedLabel) speedLabel.textContent = `${val.toFixed(2)}×`;
    if (player) player.playbackRate = val;
  });
}

// ----- Upload & Clone -----
if (uploadBtn){
  uploadBtn.addEventListener('click', async ()=>{
    const name = (voiceName?.value || '').trim();
    const file = voiceFile?.files && voiceFile.files[0];
    if (!name){ showMsg('Name your voice.', 'error'); return; }
    if (!file){ showMsg('Choose an audio file.', 'error'); return; }

    busy(uploadBtn, upSpin, true); clearErr();
    try{
      const fd = new FormData();
      fd.append('name', name);
      fd.append('file', file, file.name);

      const res = await fetch(CLONE_URL, { method:'POST', body: fd });
      const txt = await res.text();
      if (!res.ok) throw new Error(txt || `Clone failed (${res.status})`);

      let data = {};
      try { data = JSON.parse(txt); } catch {}
      const vid = (data.voice_id || data?.voice?.voice_id || '').toString();
      if (!vid) throw new Error('Clone succeeded but no voice_id returned.');
      setVoiceId(vid);
      refreshVoiceStatus();
      showMsg('✅ Voice cloned and stored.', 'success');
    }catch(e){
      showMsg('Upload failed. See details below.', 'error', 7000);
      showErr(e);
    }finally{
      busy(uploadBtn, upSpin, false);
    }
  });
}

// ----- Generate MP3 via backend (/tts) -----
if (genBtn){
  genBtn.addEventListener('click', async ()=>{
    const text = (scriptEl?.value || '').trim();
    if (!text){ showMsg('Type your vocal script first.', 'error'); return; }

    busy(genBtn, genSpin, true); clearErr();
    if (downloadA){ downloadA.classList.add('hidden'); }
    if (player){ player.removeAttribute('src'); }

    try{
      const body = { text };
      const vid = getVoiceId();
      if (vid) body.voice_id = vid;      // else backend uses ELEVEN_VOICE_ID
      if (moodEl && moodEl.value) body.mood = moodEl.value; // optional mood

      const res = await fetch(TTS_URL, {
        method:'POST',
        headers:{ 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok){
        const t = await res.text().catch(()=> '');
        throw new Error(t || `TTS failed (${res.status})`);
      }

      const buf = await res.arrayBuffer();
      const blob = new Blob([buf], { type:'audio/mpeg' });
      const url  = URL.createObjectURL(blob);

      if (player){
        player.src = url;
        if (speedEl) player.playbackRate = Number(speedEl.value || 1);
        try { await player.play(); } catch {}
      }
      if (downloadA){
        downloadA.href = url;
        downloadA.classList.remove('hidden');
      }
      showMsg('🎧 MP3 ready — download below.', 'success');
    }catch(e){
      showMsg('Generation error. See details below.', 'error', 7000);
      showErr(e);
    }finally{
      busy(genBtn, genSpin, false);
    }
  });
}

// ----- Optional: register your PWA SW (frontend service worker) -----
if ('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    // If you have a frontend worker.js (for caching/offline), keep this file in repo root.
    navigator.serviceWorker.register('./worker.js').catch(()=>{});
  });
}
