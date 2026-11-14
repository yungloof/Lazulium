// Página da "tela doida" de quando um amigo chama pra call no Discord: o sinal para quem está longe do PC
// (deitado olhando o monitor) ver e ouvir. Tudo numa página só (HTML, CSS e JS inline), sem
// arquivo de música: a trilha é sintetizada na hora pelo Web Audio, então não tem direito autoral de ninguém.
// Nada aqui pisca mais de 3 vezes por segundo (limite seguro para quem tem fotossensibilidade).
// A resposta volta para o main pelo título da página (lazulium-answer:yes|no|none), sem preload nem acesso ao Node
// (mudar o endereço de uma página data: é bloqueado pelo Chromium, por isso não dá para usar #answer).

export interface CallOverlayData {
  name: string;
  avatarUrl: string | null;
  volume: number;          // 0 a 100
  chaosSeconds: number;
  lifeSeconds: number;     // Depois disso fecha sozinha (a chamada continua esperando no app)
  test: boolean;
}

const AVATAR_HOSTS = 'https://avatars.steamstatic.com https://avatars.akamai.steamstatic.com https://avatars.cloudflare.steamstatic.com';

// JSON dentro de <script>: "<" vira < para o nome nunca fechar a tag
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export function callOverlayHtml(data: CallOverlayData): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${AVATAR_HOSTS} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Chamada</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: 'Segoe UI', system-ui, sans-serif; user-select: none; cursor: default; }
  #tint { position: fixed; inset: 0; background: radial-gradient(circle at 50% 45%, rgba(255,40,90,.55), rgba(90,20,200,.55) 55%, rgba(10,10,40,.75)); animation: hue 2.4s linear infinite, pulse .8s ease-in-out infinite; transition: opacity 1s, background 1s; }
  #rays { position: fixed; left: 50%; top: 45%; width: 260vmax; height: 260vmax; margin: -130vmax 0 0 -130vmax; opacity: .35;
    background: repeating-conic-gradient(from 0deg, rgba(255,255,255,.55) 0deg 7deg, transparent 7deg 18deg); animation: spin 6s linear infinite; transition: opacity 1s; mix-blend-mode: overlay; }
  .light { position: fixed; top: -20vh; width: 70vw; height: 140vh; opacity: .45; filter: blur(30px); transition: opacity 1s; }
  .light.red { left: -25vw; background: radial-gradient(ellipse at center, rgba(255,0,40,.95), transparent 60%); animation: sweep 1.6s ease-in-out infinite alternate; transform-origin: 50% 0; }
  .light.blue { right: -25vw; background: radial-gradient(ellipse at center, rgba(0,120,255,.95), transparent 60%); animation: sweep 1.6s ease-in-out infinite alternate-reverse; transform-origin: 50% 0; }
  #stage { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2vh; animation: shake .45s linear infinite; transition: transform .6s; pointer-events: none; }
  #avatar { width: min(26vh, 30vw); height: min(26vh, 30vw); border-radius: 28%; object-fit: cover; border: 8px solid #fff; box-shadow: 0 0 0 10px rgba(255,0,90,.8), 0 20px 80px rgba(0,0,0,.6); animation: wobble 1.2s ease-in-out infinite; background: #1e1b4b; }
  #avatar.none { display: flex; align-items: center; justify-content: center; font-size: min(14vh, 16vw); color: #fff; font-weight: 900; }
  #name { font-size: clamp(48px, 9vw, 170px); line-height: .95; font-weight: 900; text-align: center; max-width: 92vw; overflow-wrap: anywhere; text-transform: uppercase; letter-spacing: -.02em;
    background: linear-gradient(90deg, #fff200, #ff3d7f, #7cf8ff, #b6ff4a, #fff200); background-size: 300% 100%; -webkit-background-clip: text; background-clip: text; color: transparent;
    -webkit-text-stroke: 3px rgba(0,0,0,.55); filter: drop-shadow(0 8px 0 rgba(0,0,0,.45)); animation: rainbow 1.6s linear infinite, boom .8s ease-in-out infinite; }
  #line { font-size: clamp(28px, 4.6vw, 86px); font-weight: 900; color: #fff; text-align: center; text-shadow: 0 6px 0 #b0003a, 0 0 40px rgba(255,255,255,.6); animation: tilt 1.6s ease-in-out infinite; }
  #test { position: fixed; top: 4vh; left: 50%; transform: translateX(-50%); z-index: 5; font-size: 18px; font-weight: 700; color: #fde68a; background: rgba(0,0,0,.55); border-radius: 999px; padding: 6px 16px; }
  #rain, #bouncers { position: fixed; inset: 0; pointer-events: none; overflow: hidden; transition: opacity 1s; }
  .drop { position: absolute; top: -12vh; font-size: 7vh; animation: fall linear forwards; will-change: transform; }
  .bouncer { position: absolute; width: 11vh; height: 11vh; border-radius: 26%; border: 4px solid #fff; object-fit: cover; box-shadow: 0 10px 30px rgba(0,0,0,.5); will-change: transform; background: #4338ca; }
  #card { position: fixed; left: 50%; bottom: 6vh; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 18px 22px; border-radius: 22px;
    background: rgba(9,12,30,.82); border: 1px solid rgba(255,255,255,.18); box-shadow: 0 20px 60px rgba(0,0,0,.55); transition: bottom .7s cubic-bezier(.2,.9,.3,1.2), transform .7s; }
  #buttons { display: flex; gap: 14px; }
  button { font: inherit; border: 0; border-radius: 16px; cursor: pointer; transition: transform .12s, filter .12s; }
  button:hover { transform: translateY(-2px) scale(1.03); filter: brightness(1.08); }
  button:focus-visible { outline: 4px solid #a5b4fc; outline-offset: 3px; }
  #yes { background: #22c55e; color: #052e16; font-size: 30px; font-weight: 900; padding: 16px 38px; box-shadow: 0 8px 0 #15803d; animation: beg .9s ease-in-out infinite; }
  #no { background: rgba(255,255,255,.12); color: #e2e8f0; font-size: 20px; font-weight: 700; padding: 16px 26px; }
  #hint { color: rgba(226,232,240,.7); font-size: 13px; }
  #bar { width: 100%; height: 4px; border-radius: 4px; background: rgba(255,255,255,.12); overflow: hidden; }
  #bar > span { display: block; height: 100%; width: 100%; background: #818cf8; transform-origin: left; }
  body.calm #tint { animation: none; opacity: 1; background: rgba(5,8,25,.62); }
  body.calm #rays, body.calm .light, body.calm #rain, body.calm #bouncers { opacity: 0; }
  body.calm #stage { animation: none; transform: translateY(-8vh) scale(.72); }
  body.calm #name, body.calm #line, body.calm #avatar { animation: none; }
  body.calm #card { bottom: 18vh; }
  @keyframes hue { to { filter: hue-rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: .78; } 50% { opacity: 1; } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes sweep { from { transform: rotate(-28deg); } to { transform: rotate(28deg); } }
  @keyframes shake { 0% { transform: translate(0,0) rotate(0); } 20% { transform: translate(-14px,8px) rotate(-1.2deg); } 40% { transform: translate(12px,-10px) rotate(1deg); }
    60% { transform: translate(-10px,-6px) rotate(.6deg); } 80% { transform: translate(14px,10px) rotate(-.8deg); } 100% { transform: translate(0,0) rotate(0); } }
  @keyframes wobble { 0%, 100% { transform: rotate(-8deg) scale(1); } 50% { transform: rotate(8deg) scale(1.12); } }
  @keyframes rainbow { to { background-position: 300% 0; } }
  @keyframes boom { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.09); } }
  @keyframes tilt { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
  @keyframes beg { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.07); } }
  @keyframes fall { to { transform: translateY(125vh) rotate(var(--turn)); } }
</style>
</head>
<body>
<div id="tint"></div>
<div id="rays"></div>
<div class="light red"></div><div class="light blue"></div>
<div id="bouncers"></div>
<div id="rain"></div>
<div id="stage">
  <div id="avatarBox"></div>
  <div id="name"></div>
  <div id="line">TÁ TE CHAMANDO PRA CALL NO DISCORD!!!</div>
</div>
<div id="test" hidden>Teste: ninguém foi avisado</div>
<div id="card" role="dialog" aria-label="Chamada">
  <div id="buttons">
    <button id="yes" type="button">TÔ INDO! 🎧</button>
    <button id="no" type="button">Agora não</button>
  </div>
  <div id="hint">Enter: tô indo · Esc fecha sem responder · no controle, A responde e B fecha</div>
  <div id="bar"><span></span></div>
</div>
<script>
(() => {
  const data = ${scriptJson(data)};
  let done = false;
  const answer = (value) => { if (done) return; done = true; stopAudio(); document.title = 'lazulium-answer:' + value; };

  // ---------- Texto e foto ----------
  document.getElementById('name').textContent = data.name;
  document.getElementById('test').hidden = !data.test;
  const box = document.getElementById('avatarBox');
  const makeAvatar = (cls) => {
    if (data.avatarUrl) {
      const img = document.createElement('img');
      img.src = data.avatarUrl;
      img.alt = '';
      img.className = cls;
      img.onerror = () => { img.removeAttribute('src'); };
      return img;
    }
    const div = document.createElement('div');
    div.className = cls + ' none';
    div.textContent = (data.name.trim()[0] || '?').toUpperCase();
    return div;
  };
  const main = makeAvatar('');
  main.id = 'avatar';
  box.appendChild(main);

  // ---------- Fotos quicando (como o logo do DVD) ----------
  const bouncers = [];
  const field = document.getElementById('bouncers');
  for (let i = 0; i < 6; i++) {
    const el = makeAvatar('bouncer');
    field.appendChild(el);
    bouncers.push({ el, x: Math.random() * (innerWidth - 120), y: Math.random() * (innerHeight - 120), vx: (Math.random() < .5 ? -1 : 1) * (5 + Math.random() * 6), vy: (Math.random() < .5 ? -1 : 1) * (4 + Math.random() * 6), r: 0, vr: (Math.random() - .5) * 14 });
  }

  // ---------- Chuva de emoji ----------
  const EMOJI = ['📞', '🎧', '🔊', '🎮', '🚨', '📢', '🔥', '🎉'];
  const rain = document.getElementById('rain');
  let raining = true;
  const drop = () => {
    if (!raining) return;
    const el = document.createElement('div');
    el.className = 'drop';
    el.textContent = EMOJI[Math.floor(Math.random() * EMOJI.length)];
    el.style.left = Math.random() * 100 + 'vw';
    el.style.setProperty('--turn', (Math.random() * 720 - 360) + 'deg');
    el.style.animationDuration = (1.6 + Math.random() * 1.8) + 's';
    rain.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  };
  const rainTimer = setInterval(() => { for (let i = 0; i < 3; i++) drop(); }, 140);

  let calm = false;
  const frame = () => {
    if (calm) return;
    for (const b of bouncers) {
      const size = b.el.offsetWidth || 100;
      b.x += b.vx; b.y += b.vy; b.r += b.vr;
      if (b.x < 0 || b.x > innerWidth - size) { b.vx *= -1; b.x = Math.max(0, Math.min(innerWidth - size, b.x)); }
      if (b.y < 0 || b.y > innerHeight - size) { b.vy *= -1; b.y = Math.max(0, Math.min(innerHeight - size, b.y)); }
      b.el.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px) rotate(' + b.r + 'deg)';
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // ---------- Música (sintetizada aqui, original) ----------
  let ctx = null;
  let master = null;
  function stopAudio() {
    if (!ctx) return;
    try { master.gain.setTargetAtTime(0, ctx.currentTime, .08); setTimeout(() => ctx && ctx.close(), 400); } catch (e) {}
  }
  function startAudio() {
    const volume = Math.max(0, Math.min(100, data.volume)) / 100;
    if (volume === 0) return;
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6;
    master = ctx.createGain();
    master.gain.value = volume * 0.9;
    master.connect(comp); comp.connect(ctx.destination);
    const t0 = ctx.currentTime + .05;
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;

    const tone = (type, freq, start, dur, gain, glideTo) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, start);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(gain, start + .008);
      g.gain.setValueAtTime(gain, start + dur * .7);
      g.gain.exponentialRampToValueAtTime(.0001, start + dur);
      o.connect(g); g.connect(master);
      o.start(start); o.stop(start + dur + .02);
    };
    const noise = (start, dur, gain, filterType, freq) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, start);
      g.gain.exponentialRampToValueAtTime(.0001, start + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(start); s.stop(start + dur + .02);
    };
    const kick = (t) => tone('sine', 150, t, .22, .9, 42);
    const snare = (t) => { noise(t, .16, .5, 'highpass', 1400); tone('triangle', 210, t, .08, .25); };
    const hat = (t) => noise(t, .04, .18, 'highpass', 7000);
    const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

    // Buzina de abertura: três toques, o último longo e caindo
    const horn = (t, dur, drop) => {
      for (const [mul, det] of [[1, 0], [1.26, 6], [1.5, -5], [2, 3]]) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sawtooth';
        o.detune.value = det;
        o.frequency.setValueAtTime(311 * mul, t);
        if (drop) o.frequency.exponentialRampToValueAtTime(311 * mul * .7, t + dur);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.16, t + .02);
        g.gain.setValueAtTime(.16, t + dur - .05);
        g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(g); g.connect(master);
        o.start(t); o.stop(t + dur + .02);
      }
    };
    horn(t0, .22); horn(t0 + .3, .22); horn(t0 + .6, .7, true);

    // Batida a 150 BPM: bumbo em todo tempo, caixa no 2 e 4, chimbal no contratempo
    const beat = 60 / 150;
    const start = t0 + 1.45;
    const end = t0 + data.chaosSeconds;
    const BASS = [40, 40, 52, 40, 43, 43, 55, 43, 45, 45, 57, 45, 47, 47, 59, 50];
    const LEAD = [71, 76, 79, 83, 81, 79, 76, 74, 76, 79, 81, 83, 86, 83, 81, 79];
    for (let i = 0; start + i * beat / 2 < end; i++) {
      const t = start + i * beat / 2;
      const step = i % 16;
      if (i % 2 === 0) kick(t);
      if (i % 4 === 2) snare(t);
      if (i % 2 === 1) hat(t);
      tone('square', hz(BASS[step]), t, beat / 2 * .9, .22);
      tone('sawtooth', hz(LEAD[step]), t, beat / 2 * .8, .1);
      tone('square', hz(LEAD[step] + 12), t, beat / 4 * .8, .05);
      // Sirene subindo no fim de cada volta
      if (step === 12) tone('sine', 700, t, beat * 2, .12, 1500);
    }
    master.gain.setValueAtTime(volume * .9, end - .4);
    master.gain.linearRampToValueAtTime(0, end + .3);
  }
  try { startAudio(); } catch (e) {}

  // ---------- Calma e prazo ----------
  setTimeout(() => {
    calm = true;
    raining = false;
    clearInterval(rainTimer);
    document.body.classList.add('calm');
    document.getElementById('yes').focus();
  }, data.chaosSeconds * 1000);
  const bar = document.querySelector('#bar > span');
  bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: data.lifeSeconds * 1000, easing: 'linear', fill: 'forwards' });
  setTimeout(() => answer('none'), data.lifeSeconds * 1000);

  document.getElementById('yes').addEventListener('click', () => answer('yes'));
  document.getElementById('no').addEventListener('click', () => answer('no'));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') answer('none');
    else if (e.key === 'Enter' && document.activeElement?.id !== 'no') answer('yes');
  });
  document.getElementById('yes').focus();

  // Controle: A responde "tô indo", B fecha sem responder (botões já apertados ao abrir não contam)
  const held = new Set();
  let firstRead = true;
  const pollPad = () => {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const pad of pads) {
      const a = pad.buttons[0]?.pressed, b = pad.buttons[1]?.pressed;
      const keyA = pad.index + ':a', keyB = pad.index + ':b';
      if (a && !held.has(keyA) && !firstRead) return answer('yes');
      if (b && !held.has(keyB) && !firstRead) return answer('none');
      a ? held.add(keyA) : held.delete(keyA);
      b ? held.add(keyB) : held.delete(keyB);
    }
    firstRead = false;
    requestAnimationFrame(pollPad);
  };
  requestAnimationFrame(pollPad);
})();
</script>
</body>
</html>`;
}
