import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { mergeGeometries as mergeGeo } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildWorld } from './world.js';
import { Rain, Particles, Trail } from './fx.js';
import { createNinja } from './ninja.js';

// ============================================================================ setup
const params = new URLSearchParams(location.search);
const QUALITIES = {
  low: { pr: 0.6, msaa: 0, ao: false, refl: 0, shadow: 512, shEvery: 4, rain: 1200, pool: 3, near: 26, far: 95, lite: true, thin: 0.8, maxZ: 12, zRefl: false, ghosts: false, lambert: true, cones: false },
  medium: { pr: 0.8, msaa: 0, ao: false, refl: 0.35, reflSkip: true, shadow: 1024, shEvery: 3, rain: 2500, pool: 5, near: 32, far: 115, lite: true, thin: 0.5, maxZ: 17, zRefl: false, ghosts: true, lambert: true },
  high: { pr: 1, msaa: 2, ao: false, refl: 0.5, shadow: 1024, shEvery: 2, rain: 5000, pool: 8, near: 46, thin: 0, maxZ: 24, zRefl: true, ghosts: true },
  ultra: { pr: Math.min(devicePixelRatio, 1.5), msaa: 4, ao: true, refl: 0.75, reflMsaa: 4, shadow: 2048, shEvery: 1, rain: 9000, pool: 12, near: 56, thin: 0, maxZ: 28, zRefl: true, ghosts: true },
};
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } };
const qName = params.get('q') || store('ns_quality') || 'high', Q = QUALITIES[qName] || QUALITIES.high;
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Q.pr); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = Q.shadow > 0; renderer.shadowMap.type = Q.ao ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.08, 400); camera.layers.enable(2); camera.layers.enable(3);   // 2 = effects, 3 = fine building detail (neither is drawn into the ground reflection)

const manager = new THREE.LoadingManager();
manager.onProgress = (u, n, total) => { $('loadBar').style.width = Math.round(n / total * 100) + '%'; };

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
const angDamp = (a, b, k, dt) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * (1 - Math.exp(-k * dt)); };
const rand = (a, b) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), v3 = new THREE.Vector3(), q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();

// ============================================================================ audio (procedural)
let actx = null, master = null, noiseBuf = null, sfxVol = +(store('ns_sfx') ?? 0.6);
function initAudio() {
  if (actx) return;
  actx = new (window.AudioContext || window.webkitAudioContext)();
  master = actx.createGain(); master.gain.value = 0.4 * sfxVol * 1.6; master.connect(actx.destination);
  noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const o = actx.createOscillator(), g = actx.createGain(), f = actx.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.value = 49; f.type = 'lowpass'; f.frequency.value = 150; g.gain.value = 0.05; o.connect(f); f.connect(g); g.connect(master); o.start();
  for (const [type, freq, vol] of [['highpass', 3200, 0.07], ['bandpass', 900, 0.05]]) {            // rain: hiss + body
    const s = actx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; const rf = actx.createBiquadFilter(); rf.type = type; rf.frequency.value = freq; rf.Q.value = 0.4;
    const rg = actx.createGain(); rg.gain.value = vol; s.connect(rf); rf.connect(rg); rg.connect(master); s.start();
  }
}
function sfxNoise({ dur = 0.2, f0 = 2000, f1 = 600, q = 1, vol = 0.5, type = 'bandpass' } = {}) {
  if (!actx) return; const t = actx.currentTime, s = actx.createBufferSource(); s.buffer = noiseBuf;
  const f = actx.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
function sfxTone({ dur = 0.2, f0 = 200, f1 = 60, vol = 0.4, type = 'sine' } = {}) {
  if (!actx) return; const t = actx.currentTime, o = actx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
const SFX = {
  slash: () => sfxNoise({ dur: 0.16, f0: 7000, f1: 900, q: 2, vol: 0.5 }),
  hit: () => { sfxTone({ dur: 0.12, f0: 170, f1: 50, vol: 0.6 }); sfxNoise({ dur: 0.09, f0: 1400, f1: 300, vol: 0.4 }); sfxTone({ dur: 0.1, f0: 1900, f1: 700, vol: 0.12, type: 'triangle' }); },
  dash: () => sfxNoise({ dur: 0.35, f0: 300, f1: 4200, q: 0.7, vol: 0.5 }),
  jump: () => sfxNoise({ dur: 0.12, f0: 800, f1: 2500, q: 1, vol: 0.15 }),
  throw: () => sfxNoise({ dur: 0.1, f0: 4000, f1: 8000, q: 4, vol: 0.25 }),
  hurt: () => sfxTone({ dur: 0.25, f0: 300, f1: 110, vol: 0.4, type: 'square' }),
  clang: () => { sfxTone({ dur: 0.18, f0: 900, f1: 300, vol: 0.2, type: 'triangle' }); sfxNoise({ dur: 0.1, f0: 5000, f1: 2000, q: 3, vol: 0.25 }); },
  thunder: () => { sfxNoise({ dur: 2.4, f0: 2500, f1: 60, vol: 0.55, type: 'lowpass' }); sfxTone({ dur: 2.0, f0: 80, f1: 26, vol: 0.5, type: 'sawtooth' }); },
  beep: () => sfxTone({ dur: 0.5, f0: 900, f1: 1800, vol: 0.2, type: 'square' }),
  boom: () => { sfxTone({ dur: 0.8, f0: 120, f1: 25, vol: 0.9 }); sfxNoise({ dur: 0.6, f0: 900, f1: 60, type: 'lowpass', vol: 0.7 }); },
  groan: () => sfxTone({ dur: 0.9, f0: rand(70, 110), f1: rand(45, 60), vol: 0.1, type: 'sawtooth' }),
  rise: () => sfxNoise({ dur: 0.7, f0: 200, f1: 2600, q: 0.8, vol: 0.25 }),
  die: () => { sfxNoise({ dur: 0.8, f0: 3000, f1: 200, q: 0.6, vol: 0.35 }); sfxTone({ dur: 0.5, f0: 140, f1: 40, vol: 0.3, type: 'sawtooth' }); },
  wave: () => { sfxTone({ dur: 1.2, f0: 110, f1: 55, vol: 0.4, type: 'sawtooth' }); sfxTone({ dur: 0.8, f0: 220, f1: 220, vol: 0.12, type: 'triangle' }); },
};

// ---- music: a small step sequencer (D minor, 96 bpm): pad, bass, plucked arp, koto-like lead, drums in combat
const BPM = 96, S16 = 60 / BPM / 4, mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);
const music = { vol: +(store('ns_mus') ?? 0.6), gain: null, send: null, step: 0, next: 0, duck: 1 };
const CHORDS = [[50, 53, 57], [46, 50, 53], [43, 46, 50], [45, 49, 52]];
const LEAD = [[74, 0, 0, 75, 0, 74, 0, 70, 0, 0, 69, 0, 67, 0, 69, 0], [70, 0, 69, 0, 67, 0, 0, 63, 0, 62, 0, 0, 0, 0, 62, 63], [74, 0, 0, 79, 0, 0, 81, 0, 82, 0, 81, 0, 79, 0, 75, 0], [74, 0, 0, 0, 70, 0, 69, 0, 0, 0, 62, 0, 0, 0, 0, 0]];
function mVoice(type, f, t, dur, vol, { cut = 2000, q = 0.7, att = 0.005, send = 0, det = 0, sweep = 0 } = {}) {
  const o = actx.createOscillator(), fl = actx.createBiquadFilter(), g = actx.createGain(); o.type = type; o.frequency.value = f; o.detune.value = det; fl.type = 'lowpass'; fl.Q.value = q; fl.frequency.setValueAtTime(cut, t); if (sweep) fl.frequency.exponentialRampToValueAtTime(Math.max(80, cut * sweep), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(fl); fl.connect(g); g.connect(music.gain); if (send) { const sg = actx.createGain(); sg.gain.value = send; g.connect(sg); sg.connect(music.send); } o.start(t); o.stop(t + dur + 0.05);
}
function mNoise(t, dur, vol, f, type = 'highpass', q = 0.8) { const sN = actx.createBufferSource(); sN.buffer = noiseBuf; const fl = actx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = actx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); sN.connect(fl); fl.connect(g); g.connect(music.gain); sN.start(t, Math.random()); sN.stop(t + dur + 0.02); }
function mDrum(t, f0, f1, dur, vol) { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.5); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(music.gain); o.start(t); o.stop(t + dur + 0.02); }
function playStep(sN, t) {
  const bar = Math.floor(sN / 16), st = sN % 16, ch = CHORDS[bar % 4], combat = musicMode() === 2, calm = musicMode() === 0, phraseB = bar % 8 >= 4;
  if (st === 0) for (const n of ch) { mVoice('sawtooth', mtof(n), t, S16 * 17, 0.035, { cut: 650, att: 0.5, det: -7 }); mVoice('sawtooth', mtof(n + 12), t, S16 * 17, 0.02, { cut: 900, att: 0.7, det: 8 }); }
  if (!calm && st % 2 === 0) mVoice('sawtooth', mtof(ch[0] - 12 + (st % 8 === 6 ? 12 : 0)), t, S16 * 1.9, 0.17, { cut: combat ? 520 : 320, q: 3, sweep: 0.4 });
  mVoice('square', mtof(ch[[0, 1, 2, 1][st % 4]] + 12 + (st % 8 >= 4 ? 12 : 0)), t, 0.16, calm ? 0.018 : 0.03, { cut: 1800, send: 0.6, sweep: 0.3 });
  if (phraseB || combat) { const n = LEAD[bar % 4][st]; if (n) { mVoice('triangle', mtof(n + (combat ? 12 : 0)), t, 0.5, 0.085, { cut: 3200, send: 0.7, sweep: 0.25 }); mVoice('sine', mtof(n + (combat ? 24 : 12)), t, 0.12, 0.03, { cut: 6000 }); } }
  if (!calm) { if (st % 2 === 0) mNoise(t, 0.035, st % 4 === 2 ? 0.05 : 0.028, 7500); }
  if (combat) { if (st === 0 || st === 8 || st === 11) mDrum(t, 150, 42, 0.28, 0.6); if (st === 4 || st === 12) { mNoise(t, 0.14, 0.2, 1700, 'bandpass', 0.7); mDrum(t, 220, 120, 0.1, 0.15); }
    if (st % 2 === 1) mNoise(t, 0.02, 0.02, 9000); if (bar % 4 === 3 && st >= 10 && st % 2 === 0) mDrum(t, 110 - (st - 10) * 6, 60, 0.3, 0.45); }   // taiko fill
}
function schedule() { if (!music.gain || actx.state !== 'running') return; music.gain.gain.setTargetAtTime(music.vol * 0.55 * music.duck, actx.currentTime, 0.2); if (music.next < actx.currentTime) music.next = actx.currentTime + 0.05; while (music.next < actx.currentTime + 0.3) { playStep(music.step++, music.next); music.next += S16; } }
function initMusic() { if (music.gain || !actx) return; const g = music.gain = actx.createGain(); g.gain.value = 0; const comp = actx.createDynamicsCompressor(); g.connect(comp); comp.connect(actx.destination);
  const dl = music.send = actx.createDelay(1), fb = actx.createGain(), lp = actx.createBiquadFilter(); dl.delayTime.value = S16 * 3; fb.gain.value = 0.4; lp.type = 'lowpass'; lp.frequency.value = 2600; dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(g); setInterval(schedule, 70); }

// ============================================================================ boot
const loader = new GLTFLoader(manager);
const texL = new THREE.TextureLoader(manager), loadTex = (f, srgb) => texL.loadAsync('assets/tex/' + f).then(t => { if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; });
const [world, soldier, xbot, katanaGltf, clothD, clothN, leatherD, leatherN, leatherR] = await Promise.all([
  buildWorld({ scene, renderer, manager, Q }),
  loader.loadAsync('assets/chars/Soldier.glb'), loader.loadAsync('assets/chars/Xbot.glb'), loader.loadAsync('assets/models/antique_katana_01/antique_katana_01.gltf'),
  loadTex('scuba_suede_diff.jpg', true), loadTex('scuba_suede_nor.jpg'), loadTex('fabric_leather_02_diff.jpg', true), loadTex('fabric_leather_02_nor.jpg'), loadTex('fabric_leather_02_arm.jpg'),
]);
world.onThunder(() => setTimeout(SFX.thunder, 350));
const colliders = world.colliders, B = world.bounds;

// ---- post-processing chain
const rt = new THREE.WebGLRenderTarget(innerWidth * Q.pr, innerHeight * Q.pr, { type: THREE.HalfFloatType, samples: Q.msaa });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
// guard: one NaN/Inf pixel from any shader would be smeared by bloom into large black blocks on some GPUs
if (Q.msaa) composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; if (!(c.r >= 0.0) || !(c.g >= 0.0) || !(c.b >= 0.0)) c = vec3(0.0); gl_FragColor = vec4(min(c, vec3(200.0)), 1.0); }' }));
let gtao = null;
if (Q.ao) {
  gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
  gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
  gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
  gtao.blendIntensity = 0.95;
  gtao.overrideVisibility = function () { const cache = this._visibilityCache; this.scene.traverse(o => { cache.set(o, o.visible); if (o.isPoints || o.isLine || o.userData.noAO) o.visible = false; }); };
  composer.addPass(gtao);
}
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.75, 1.0); { const bs = bloom.setSize.bind(bloom); bloom.setSize = (w, h) => bs(Math.round(w / 2), Math.round(h / 2)); } composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uPx: { value: new THREE.Vector2(1 / innerWidth, 1 / innerHeight) }, uSharp: { value: Q.lambert ? 0 : 0.38 }, uTime: { value: 0 }, uHurt: { value: 0 }, uDash: { value: 0 }, uGray: { value: 0 }, uFade: { value: 1 }, uChrono: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uPx; uniform float uSharp, uTime, uHurt, uDash, uGray, uFade, uChrono; varying vec2 vUv;
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main(){ vec2 c = vUv - 0.5; float r2 = dot(c, c); float ca = (0.004 + uDash * 0.03) * r2;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
      if (uSharp > 0.0) { vec3 nb = texture2D(tDiffuse, vUv + vec2(uPx.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(uPx.x, 0.0)).rgb + texture2D(tDiffuse, vUv + vec2(0.0, uPx.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, uPx.y)).rgb;
        vec3 d = texture2D(tDiffuse, vUv).rgb - nb * 0.25; col += clamp(d, -0.12, 0.12) * uSharp * 2.0; col = max(col, 0.0); }   // contrast-limited sharpening: brings back texture detail lost to MSAA resolve + bloom
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.1 - uGray * 0.8);                       // saturation
      col += vec3(-0.010, 0.002, 0.016) * (1.0 - smoothstep(0.0, 0.5, l)); // cool, slightly teal shadows
      col *= mix(vec3(1.0), vec3(1.03, 1.0, 0.96), smoothstep(0.4, 1.0, l)); // warm highlights
      col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);              // filmic contrast
      col *= 1.0 - r2 * 0.95;                                            // vignette
      col = mix(col, vec3(0.45, 0.01, 0.03), uHurt * smoothstep(0.08, 0.5, r2));
      col = mix(col, vec3(dot(col, vec3(0.3, 0.5, 0.2))) * vec3(0.55, 0.8, 1.25), uChrono * 0.6 * (0.6 + 0.4 * smoothstep(0.0, 0.5, r2 * 2.0)));
      col += (hash(gl_FragCoord.xy + fract(uTime) * 311.0) - 0.5) * 0.03; // grain
      gl_FragColor = vec4(col * uFade, 1.0); }`,
});
composer.addPass(finalPass);
let drs = 1;
function resize() {
  const pr = Q.pr * drs; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  world.setReflSize(innerWidth * pr, innerHeight * pr); finalPass.uniforms.uPx.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
}
addEventListener('resize', resize); resize();

// ---- effects
const rain = new Rain(scene, Q.rain, world.lights);
const sparks = new Particles(scene, 900, true), blobs = new Particles(scene, 700, false), steam = new Particles(scene, 260, false);
const C_SPARK = new THREE.Color(3, 1.6, 0.5), C_CYAN = new THREE.Color(0.5, 2.2, 3), C_BLOOD = new THREE.Color(0.16, 0.005, 0.01), C_EMBER = new THREE.Color(3.5, 1.0, 0.15), C_STEAM = new THREE.Color(0.16, 0.17, 0.2);

// ============================================================================ collision
// colliders are boxes: solid from y0 (default 0) up to h. `roof` slabs are solid between ceil and h and never push sideways (floors you stand on / bump your head on);
// `ramp` colliders have a sloping top (stairs) and are only ever stood on.
const topAt = (c, x, z) => { if (!c.ramp) return c.h; const r = c.ramp, u = r.ax === 'x' ? (x - c.minX) / (c.maxX - c.minX) : (z - c.minZ) / (c.maxZ - c.minZ); return r.a + (r.b - r.a) * clamp(u, 0, 1); };
function resolve(pos, r, wallsOnly = false, skipDebris = false) {
  for (const c of colliders) {
    if (c.roof || c.ramp || (wallsOnly && !c.wall) || pos.y >= c.h - 0.3 || (c.y0 && pos.y + 1.6 <= c.y0) || (skipDebris && c.debris)) continue;
    const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ), dx = pos.x - nx, dz = pos.z - nz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = nx + dx / d * r; pos.z = nz + dz / d * r; }
    else { const l = pos.x - c.minX, rr = c.maxX - pos.x, n = pos.z - c.minZ, f = c.maxZ - pos.z, m = Math.min(l, rr, n, f);
      if (m === l) pos.x = c.minX - r; else if (m === rr) pos.x = c.maxX + r; else if (m === n) pos.z = c.minZ - r; else pos.z = c.maxZ + r; }
  }
}
function insideWall(x, z, pad = 0.15, y = 0) { for (const c of colliders) if (c.wall && y + 1 < c.h && y + 1 > (c.y0 || 0) && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true; return false; }
function camBlocked(x, y, z, pad = 0.25) { for (const c of colliders) if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad && y < topAt(c, x, z) + 0.3 && y > (c.roof ? c.ceil - 0.25 : (c.y0 || 0) - 0.25)) return true; return false; }
function groundHeightAt(x, z, y) { let g = 0; for (const c of colliders) { if (c.h > 50 || x <= c.minX || x >= c.maxX || z <= c.minZ || z >= c.maxZ) continue; const t = topAt(c, x, z); if (t > g && y >= t - (c.ramp ? 0.6 : 0.35)) g = t; } return g; }
const groundAt = (pos) => groundHeightAt(pos.x, pos.z, pos.y);
function ceilAt(x, z, y) { let m = 1e9; for (const c of colliders) if (c.roof && c.ceil < m && c.ceil > y + 0.9 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) m = c.ceil; return m; }   // the underside of the lowest slab above y
function nearWall(pos) { let best = null, bd = 0.8; for (const c of colliders) { if (!c.wall || c.noRun || c.h > 50 || c.h < pos.y + 0.5 || (c.y0 || 0) > pos.y + 1) continue; const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ), dx = pos.x - nx, dz = pos.z - nz, d = Math.hypot(dx, dz); if (d > 1e-4 && d < bd) { bd = d; best = { nx: dx / d, nz: dz / d, c, d }; } } return best; }
function blocked(x, z, pad = 0.4) { for (const c of colliders) if (!c.roof && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true; return false; }

// ============================================================================ rig helpers (Mixamo skeletons: every bone's +Y points at its child)
function aimBone(bone, dirW, w = 1) {
  bone.parent.getWorldQuaternion(q1); bone.getWorldQuaternion(q2);
  v1.set(0, 1, 0).applyQuaternion(q2); q3.setFromUnitVectors(v1, dirW).multiply(q2);
  q3.premultiply(q1.invert()); bone.quaternion.slerp(q3, w);
}
function twistBone(bone, axisW, angle) {
  bone.parent.getWorldQuaternion(q1); bone.getWorldQuaternion(q2);
  q3.setFromAxisAngle(axisW, angle).multiply(q2).premultiply(q1.invert()); bone.quaternion.copy(q3);
}
const bonesOf = (root, names) => Object.fromEntries(names.map(n => [n, root.getObjectByName('mixamorig' + n)]));
const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand'];

// ============================================================================ helpers shared by the ported player code
const CYAN = new THREE.Color(0.75, 1.15, 1.5), MAGENTA = new THREE.Color(1.6, 0.35, 0.5), GOLD = new THREE.Color(1.8, 1.2, 0.5);
const FIREC = new THREE.Color(2.6, 1.0, 0.25), BOLT = new THREE.Color(1.5, 1.9, 3), ACID = new THREE.Color(0.7, 1.6, 0.2), C_DUST = new THREE.Color(0.085, 0.08, 0.078);
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), _pc = new THREE.Color(), _pa = new THREE.Vector3(), _pb = new THREE.Vector3();
const pEmit = (sys, x, y, z, vx, vy, vz, r, g, b, life, size, grav = 0) => sys.emit(_pa.set(x, y, z), _pb.set(vx, vy, vz), _pc.setRGB(r, g, b), life, size * 0.22, grav);
const pBurst = (sys, pos, n, speed, color, life, size, grav = 9) => sys.burst(pos, n, color, { speed: speed * 0.55, up: speed * 0.2, life, size: size * 0.2, gravity: grav });
const yawOf = (v) => Math.atan2(v.x, v.z);
let camYaw = Math.PI, camPitch = 0.25, camShake = 0;
const camForward = () => new THREE.Vector3(-Math.sin(camYaw), 0, -Math.cos(camYaw));
const facingVec = (yaw = P.facing) => new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
const zOK = (z) => z.state !== 'dead' && z.state !== 'spawn';
function resolveCircle(pos, r) { const x = pos.x, z = pos.z; resolve(pos, r); return Math.abs(pos.x - x) + Math.abs(pos.z - z) > 1e-4; }
function insideAnyCollider(x, z, y) { for (const c of colliders) if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && y < topAt(c, x, z) && y > (c.roof ? c.ceil - 0.5 : (c.y0 || 0))) return true; return false; }
const later = []; const after = (t, fn) => later.push({ t, fn });
const fwd = (yaw, out = new THREE.Vector3()) => out.set(Math.sin(yaw), 0, Math.cos(yaw));

// ============================================================================ VFX: slash arcs, rings, streaks, afterimages (ported)
const arcVert = `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const arcFrag = `uniform vec3 color; uniform float opacity, inner, outer, t0, len, prog, full; varying vec2 vP;
  void main(){ float r = length(vP); float a = atan(vP.y, vP.x); float t = full > 0.5 ? 0.5 : (a - t0) / len; if (t < 0.0 || t > 1.0) discard;
    float radial = pow(clamp(smoothstep(inner, outer, r), 0.0, 1.0), 2.5) * smoothstep(outer + 0.01, outer - 0.15, r);
    float sweep = full > 0.5 ? 0.35 * pow(clamp(0.5 + 0.5 * sin(a * 3.0), 0.0, 1.0), 4.0) : smoothstep(prog, prog - 0.55, t) * smoothstep(0.0, 0.08, t);
    float a2 = radial * sweep * opacity * 0.6; if (a2 < 0.01) discard; gl_FragColor = vec4(color * (0.6 + radial), a2); }`;
const vfx = [];
const fxObj = (o) => { o.userData.noAO = true; o.traverse(c => c.layers.set(2)); scene.add(o); return o; };
function spawnArc({ pos, yaw, tilt = 0, color = CYAN, inner = 0.6, outer = 3.4, len = 2.8, dur = 0.22, vertical = false, full = false, scale = 1, follow = null }) {
  const t0 = -len / 2, geo = new THREE.RingGeometry(inner, outer, 48, 1, full ? 0 : t0, full ? Math.PI * 2 : len);
  const mat = new THREE.ShaderMaterial({ uniforms: { color: { value: color }, opacity: { value: 1 }, inner: { value: inner }, outer: { value: outer }, t0: { value: t0 }, len: { value: len }, prog: { value: 0 }, full: { value: full ? 1 : 0 } },
    vertexShader: arcVert, fragmentShader: arcFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat), holder = new THREE.Group();
  holder.position.copy(pos); holder.rotation.order = 'YXZ'; holder.rotation.y = yaw - Math.PI / 2;
  const tiltG = new THREE.Group(); tiltG.rotation.x = tilt; holder.add(tiltG);
  if (!vertical) mesh.rotation.x = -Math.PI / 2;
  tiltG.add(mesh); holder.scale.setScalar(scale); fxObj(holder);
  vfx.push({ obj: holder, mat, geo, t: 0, dur, kind: 'arc', follow, spin: full ? 18 : 0, mesh });
}
function spawnRing(pos, color, maxR = 10, dur = 0.5) {
  const geo = new THREE.RingGeometry(0.8, 1, 64), mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.position.y += 0.2; fxObj(m); vfx.push({ obj: m, mat, geo, t: 0, dur, kind: 'ring', maxR });
}
function spawnStreak(a, b, color = CYAN, width = 0.25, dur = 0.35) {
  const len = a.distanceTo(b); if (len < 0.01) return;
  const geo = new THREE.BoxGeometry(width, width, len), mat = new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const m = new THREE.Mesh(geo, mat); m.position.copy(a).add(b).multiplyScalar(0.5); m.lookAt(b); fxObj(m); vfx.push({ obj: m, mat, geo, t: 0, dur, kind: 'streak' });
}
const ghostMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.7, 1.1), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
const ghostGeo = new THREE.CapsuleGeometry(1, 1, 3, 8), _gm = new THREE.Matrix4(), _ga = new THREE.Vector3(), _gb = new THREE.Vector3(), _gq = new THREE.Quaternion(), _gs = new THREE.Vector3(), GHOST_R = [0.15, 0.13, 0.1, 0.05, 0.045, 0.05, 0.045, 0.075, 0.055, 0.075, 0.055];
function spawnGhost(color) {   // afterimage: a silhouette of capsules frozen along the skeleton
  const mat = ghostMat.clone(); if (color) mat.color.copy(color); const segs = ninja.segments, g = new THREE.InstancedMesh(ghostGeo, mat, segs.length);
  segs.forEach(([a, b], i) => { a.getWorldPosition(_ga); b.getWorldPosition(_gb); const len = _ga.distanceTo(_gb), r = GHOST_R[i]; _gq.setFromUnitVectors(UP, _gb.clone().sub(_ga).normalize()); _gm.compose(_ga.add(_gb).multiplyScalar(0.5), _gq, _gs.set(r, Math.max(0.02, len / 2 - r * 0.2) / 1.5 * 1.0, r)); g.setMatrixAt(i, _gm); });
  g.frustumCulled = false; fxObj(g); vfx.push({ obj: g, mat, geo: { dispose() {} }, t: 0, dur: 0.45, kind: 'ghost' });
}
function updateVfx(dt) {
  for (let i = vfx.length - 1; i >= 0; i--) {
    const v = vfx[i]; v.t += dt; const k = v.t / v.dur;
    if (k >= 1) { scene.remove(v.obj); v.geo && v.geo.dispose(); v.mat.dispose(); vfx.splice(i, 1); continue; }
    if (v.kind === 'arc') { v.mat.uniforms.prog.value = k * 1.6; v.mat.uniforms.opacity.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4; if (v.follow) v.obj.position.copy(v.follow()); if (v.spin) v.mesh.rotation.z += v.spin * dt; else v.obj.scale.multiplyScalar(1 + dt * 0.8); }
    else if (v.kind === 'ring') { const r = 1 + k * v.maxR; v.obj.scale.set(r, r, r); v.mat.opacity = 1 - k; }
    else if (v.kind === 'streak') { v.mat.opacity = 1 - k; v.obj.scale.x = v.obj.scale.y = 1 - k; }
    else if (v.kind === 'ghost') v.mat.opacity = 0.3 * (1 - k) * (1 - k);
  }
}

// ============================================================================ the ninja (original rig and proportions, new materials)
const ninja = createNinja({ gltf: xbot, katana: katanaGltf.scene, tex: { clothD, clothN, leatherD, leatherN, leatherR } }); scene.add(ninja.root);
const bladeTrail = new Trail(scene, new THREE.Color(0.35, 0.9, 1.0), 30);
const SCARF_N = 12, scarf = { pts: [], prev: [] };
for (let i = 0; i < SCARF_N; i++) { scarf.pts.push(new THREE.Vector3()); scarf.prev.push(new THREE.Vector3()); }
const scarfGeo = new THREE.BufferGeometry(), scarfPos = new Float32Array(SCARF_N * 2 * 3); scarfGeo.setAttribute('position', new THREE.BufferAttribute(scarfPos, 3));
{ const idx = []; for (let i = 0; i < SCARF_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } scarfGeo.setIndex(idx); }
const scarfMesh = new THREE.Mesh(scarfGeo, new THREE.MeshStandardMaterial({ color: 0xe0102e, emissive: 0x6a0010, side: THREE.DoubleSide, roughness: 0.6 })); scarfMesh.frustumCulled = false; scarfMesh.castShadow = true; scene.add(scarfMesh);
function resetScarf() { const p = new THREE.Vector3(); ninja.reset(); ninja.root.updateMatrixWorld(true); ninja.headAnchor(p); scarf.pts.forEach((q, i) => { q.copy(p); q.y -= i * 0.01; scarf.prev[i].copy(q); }); }
function updateScarf(dt, time) {
  const anchor = new THREE.Vector3(); ninja.headAnchor(anchor); const seg = 0.17;
  scarf.pts[0].copy(anchor); scarf.prev[0].copy(anchor);
  for (let i = 1; i < SCARF_N; i++) { const p = scarf.pts[i], q = scarf.prev[i]; const vx = (p.x - q.x) * 0.92, vy = (p.y - q.y) * 0.92, vz = (p.z - q.z) * 0.92; q.copy(p); p.x += vx + Math.sin(time * 9 + i) * 0.004; p.y += vy - 4.5 * dt * dt; p.z += vz; }
  for (let it = 0; it < 3; it++) for (let i = 1; i < SCARF_N; i++) { const a = scarf.pts[i - 1], b = scarf.pts[i]; tmpV.subVectors(b, a); const d = tmpV.length() || 1e-4; b.copy(a).addScaledVector(tmpV, seg / d); const g = groundHeightAt(b.x, b.z, b.y + 0.3) + 0.05; if (b.y < g) b.y = g; }
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(ninja.root.quaternion);
  for (let i = 0; i < SCARF_N; i++) { const w = 0.09 * (1 - i / SCARF_N * 0.5), p = scarf.pts[i]; scarfPos.set([p.x - right.x * w, p.y, p.z - right.z * w, p.x + right.x * w, p.y + 0.02, p.z + right.z * w], i * 6); }
  scarfGeo.attributes.position.needsUpdate = true; scarfGeo.computeVertexNormals();
}

// ============================================================================ player state (original values)
const keys = {}, mouse = { left: false, right: false }; let sens = +(store('ns_sens') || 1);
const P = {
  pos: new THREE.Vector3(0, 0, 14), vel: new THREE.Vector3(), facing: Math.PI, onGround: true, jumps: 2, hp: 100, maxHp: 100, stamina: 100, ult: 0, r: 0.45,
  wall: null, wallTime: 0, wallCd: 0, wallUp: false, combo: 0, comboTimer: 0, atkTimer: 0, atkDur: 0.24, atkCd: 0, queued: false, lungeT: 0, throwAnim: 0,
  cd: { shuriken: 0, dash: 0, storm: 0, lightning: 0, chrono: 0, fire: 0 }, max: { shuriken: 0.55, dash: 2.2, storm: 6, lightning: 8, chrono: 16, fire: 6 },
  abil: { lightning: false, chrono: false, fire: false }, poison: 0, unlock: { shuriken: false, storm: false, ult: false },
  dash: 0, dashDir: new THREE.Vector3(), dashHit: new Set(), storm: 0, stormTick: 0, ultState: null, invuln: 0, hurtFlash: 0, sprinting: false, exhausted: false, animT: 0,
  kills: 0, score: 0, hits: 0, hitT: 0, dead: false, deadT: 0, seated: false,
};
let frameN = 0, hitstop = 0, kills = 0, waveKills = 0, ult = 0, chronoT = 0;   // kills / chronoT are shared with the zombie code
const cam = { fixed: false };
// ============================================================================ the dead
const zombies = [], Z_BONES = ['Spine', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm', 'RightHand', 'LeftHand'];
const ZTYPES = {
  imp: { hp: 20, speed: 6.2, dmg: 5, scale: 0.6, clip: 'Run', ts: 1.5, wind: 0.14, rec: 0.24, eye: new THREE.Color(3.4, 0.5, 2.2), tint: 0xa08890, label: 'IMPS', hint: 'small, fast, circling' },
  exploder: { hp: 45, speed: 5.2, dmg: 0, scale: 1.05, clip: 'Run', ts: 0.85, eye: new THREE.Color(4, 2.2, 0.2), tint: 0xb07840, label: 'EXPLODERS', hint: 'kill them before they reach you' },
  leaper: { hp: 50, speed: 3.6, dmg: 15, scale: 0.9, clip: 'Run', ts: 0.7, eye: new THREE.Color(0.3, 3.2, 2.4), tint: 0x6f9088, label: 'LEAPERS', hint: 'they jump from far away' },
  armored: { hp: 320, speed: 2.4, dmg: 18, wind: 0.3, rec: 0.4, scale: 1.18, clip: 'Walk', ts: 0.8, eye: new THREE.Color(3, 3, 3.4), tint: 0x50545c, label: 'ARMOURED', hint: 'shuriken barely scratch them' },
  titan: { hp: 1100, speed: 2.1, dmg: 35, slam: 5.2, scale: 2.1, clip: 'Walk', ts: 0.5, eye: new THREE.Color(4, 0.2, 0.1), tint: 0x4a3a3a, label: 'TITANS', hint: 'stay out of reach' },
  spitter: { hp: 50, speed: 2.2, dmg: 8, scale: 1, clip: 'Walk', ts: 0.9, eye: new THREE.Color(0.6, 3.2, 0.2), tint: 0x7a9a70 },
  walker: { hp: 60, speed: 2.6, dmg: 10, scale: 1, clip: 'Walk', ts: 0.75, eye: new THREE.Color(3.2, 0.25, 0.1), tint: 0x8a9a80 },
  runner: { hp: 40, speed: 6.5, dmg: 12, wind: 0.3, scale: 0.95, clip: 'Run', ts: 0.95, eye: new THREE.Color(3.2, 1.6, 0.1), tint: 0x9a8a78 },
  brute: { hp: 220, speed: 2.2, dmg: 22, slam: 3.4, scale: 1.3, clip: 'Walk', ts: 0.6, eye: new THREE.Color(1.6, 0.3, 3.2), tint: 0x6a7078 },
};
// ---- weapons carried by the tougher dead (bone space is centimetres; +Y runs along the hand)
const wSteel = new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 1, roughness: 0.35 }), wDark = new THREE.MeshStandardMaterial({ color: 0x1c1d22, metalness: 0.7, roughness: 0.5 }), wWood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.85 }), wRed = new THREE.MeshStandardMaterial({ color: 0xa81818, roughness: 0.45, metalness: 0.4 });
function armZombie(z) {
  const hand = z.b.RightHand, left = z.b.LeftHand, parts = [], add = (bone, geo, mat, x, y, zz) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, zz); m.castShadow = true; bone.add(m); parts.push(m); return m; };
  const t = z.type;
  if (t === 'runner') { add(hand, new THREE.BoxGeometry(4, 62, 1), wSteel, 0, 38, 3); add(hand, new THREE.CylinderGeometry(1.8, 1.8, 16, 8), wWood, 0, 4, 3); }
  else if (t === 'imp') for (const h of [hand, left]) add(h, new THREE.ConeGeometry(2.4, 44, 4), wSteel, 0, 28, 3);
  else if (t === 'brute') { add(hand, new THREE.CylinderGeometry(2.6, 2.6, 120, 8), wWood, 0, 50, 3); add(hand, new THREE.BoxGeometry(22, 22, 40), wDark, 0, 108, 3); }
  else if (t === 'leaper') for (const h of [hand, left]) for (const o of [-4, 0, 4]) add(h, new THREE.ConeGeometry(1.2, 34, 4), wSteel, o, 26, 3);
  else if (t === 'armored') { add(hand, new THREE.CylinderGeometry(2.2, 2.2, 70, 8), wDark, 0, 34, 3); add(z.b.LeftForeArm, new THREE.BoxGeometry(58, 96, 3), wDark, 0, 18, 12); add(z.b.LeftForeArm, new THREE.BoxGeometry(40, 14, 1), wSteel, 0, 44, 14); }
  else if (t === 'titan') { add(hand, new THREE.BoxGeometry(9, 150, 9), wSteel, 0, 62, 3); add(hand, new THREE.BoxGeometry(22, 4, 9), wSteel, 0, 136, 3); add(hand, new THREE.BoxGeometry(22, 4, 9), wSteel, 0, -10, 3); }
  else if (t === 'exploder') for (const o of [-9, 9]) { add(z.b.Spine2, new THREE.CylinderGeometry(7, 7, 30, 12), wRed, o, 2, -16); add(z.b.Spine2, new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.6, 0.1) }), o, 20, -16); }
  z.weapons = parts;
}
function dissolveMat(src, uDis) {
  const m = src.clone();
  m.onBeforeCompile = (s) => {
    s.uniforms.uDis = uDis;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOP; uniform float uDis;
      float dh(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      float dn(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }`)
      .replace('void main() {', 'void main() {\n float dnv = dn(vOP * 0.11) * 0.7 + dn(vOP * 0.31) * 0.3; if (dnv < uDis) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(4.0, 1.1, 0.15) * smoothstep(uDis + 0.1, uDis, dnv) * step(0.002, uDis);');
  };
  m.customProgramCacheKey = () => 'dissolve'; return m;
}
function spawnZombie(type, x, z, y = 0) {
  const T = ZTYPES[type], root = new THREE.Group(), model = cloneSkinned(soldier.scene), uDis = { value: 1 };
  const W = wave - 1, elite = wave >= 4 && type !== 'titan' && type !== 'exploder' && Math.random() < Math.min(0.3, (wave - 3) * 0.06);   // the horde hardens every wave; elites glow white-hot
  model.rotation.y = Math.PI; root.add(model); root.scale.setScalar(T.scale * (elite ? 1.12 : 1)); root.position.set(x, y, z); scene.add(root);
  model.traverse(o => { if (!o.isMesh) return; o.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 280); o.frustumCulled = true; o.castShadow = true; if (!Q.zRefl) o.layers.set(3);
    if (/visor/.test(o.name)) { o.material = dissolveMat(new THREE.MeshStandardMaterial({ color: 0x000000, emissive: T.eye, emissiveIntensity: elite ? 4.5 : 1.3, roughness: 0.3 }), uDis); }
    else { o.material = dissolveMat(o.material, uDis); o.material.color.set(T.tint); o.material.roughness = 0.62; o.material.metalness = 0.25; o.material.envMapIntensity = 1.4; o.material.transparent = false; o.material.depthWrite = true; } });
  const mixer = new THREE.AnimationMixer(model), clip = soldier.animations.find(c => c.name === T.clip), act = mixer.clipAction(clip); act.play(); act.timeScale = T.ts; act.time = Math.random() * clip.duration;
  const z0 = { type, T, root, model, mixer, act, b: bonesOf(model, Z_BONES), uDis, elite, hp: T.hp * (1 + W * 0.09) * (elite ? 1.8 : 1), dk: (1 + W * 0.07) * (elite ? 1.3 : 1), sk: Math.min(1.28, 1 + W * 0.035) * (elite ? 1.12 : 1), wk: Math.max(0.68, 1 - W * 0.04), state: 'spawn', t: 0, gy: y, vel: new THREE.Vector3(), yaw: Math.atan2(P.pos.x - x, P.pos.z - z), flinch: 0, seed: Math.random() * 100, orbit: Math.random() < 0.5 ? 1 : -1, groanT: rand(2, 8) };
  armZombie(z0); zombies.push(z0); sparks.burst(v1.set(x, y + 0.1, z), 40, C_EMBER, { speed: 2.2, up: 4, life: 1.1, size: 0.05, gravity: -1.5 }); if (Math.hypot(x - P.pos.x, z - P.pos.z) < 30) SFX.rise();
  return z0;
}
function poseZombie(z, dt, time) {
  z.root.rotation.y = z.yaw; z.root.updateMatrixWorld(true);
  const f = fwd(z.yaw, v2), s = z.seed;
  twistBone(z.b.Spine, v1.set(f.z, 0, -f.x), 0.28 + Math.sin(time * 1.7 + s) * 0.06 - z.flinch * 0.7); z.b.Spine.updateMatrixWorld(true);
  twistBone(z.b.Head, f, 0.32 * Math.sin(s * 9) + Math.sin(time * 2.3 + s) * 0.08);
  let reach = 0.85, lift = -0.15;
  if (z.state === 'windup') lift = lerp(-0.15, 0.95, clamp(z.t / 0.4, 0, 1));
  else if (z.state === 'attack') lift = lerp(0.95, -0.7, clamp(z.t / 0.14, 0, 1));
  else if (z.state === 'stagger' || z.state === 'dead') { reach = 0.25; lift = -0.6; }
  for (const side of [-1, 1]) {
    const arm = side < 0 ? z.b.LeftArm : z.b.RightArm, fore = side < 0 ? z.b.LeftForeArm : z.b.RightForeArm, wob = Math.sin(time * 2.1 + s + side) * 0.12;
    v3.set(f.x, 0, f.z).multiplyScalar(1).addScaledVector(v1.set(f.z, 0, -f.x), side * -0.22).setY(lift + wob + (side > 0 ? 0.1 : -0.05)).normalize();
    aimBone(arm, v3, reach); arm.updateMatrixWorld(true); v3.y += 0.15; v3.normalize(); aimBone(fore, v3, reach * 0.9);
  }
}
function damageZombie(z, dmg, dir, heavy = false, kind = '') {
  if (z.state === 'dead' || z.state === 'spawn') return false;
  if (z.type === 'armored' && kind === 'shuriken') dmg *= 0.3; z.hp -= dmg; z.flinch = z.T.scale > 1.5 ? 0.25 : 1; z.vel.addScaledVector(dir, (typeof heavy === 'number' ? heavy : heavy ? 7 : 4) * (z.elite ? 0.5 : 1));
  const p = v1.copy(z.root.position); p.y += 1.25 * z.T.scale;
  sparks.burst(p, 16, C_SPARK, { speed: 5, up: 2, life: 0.45, size: 0.045, dir }); blobs.burst(p, 18, C_BLOOD, { speed: 3.2, up: 2.5, life: 0.9, size: 0.07, dir, alpha: 0.95 });
  P.hits++; P.hitT = 2.2; SFX.hit();
  if (z.hp <= 0) { z.state = 'dead'; z.t = 0; for (const w of z.weapons || []) w.visible = false; z.act.timeScale = 0.15; kills++; waveKills++; P.kills++; if (z.type === 'exploder') { const ep = z.root.position.clone().setY(z.gy + 1); after(0.05, () => explodeAt(ep, 4.5, true)); } P.ult = Math.min(100, P.ult + (z.elite ? 9 : 4.5)); SFX.die(); sparks.burst(p, 50, C_EMBER, { speed: 2.5, up: 3, life: 1.3, size: 0.05, gravity: -1.2 }); }
  else if (z.state !== 'attack' && z.state !== 'leap' && z.state !== 'fuse' && z.T.scale < 1.5 && z.type !== 'brute' && z.type !== 'armored' && !(z.elite && z.state === 'windup')) { z.state = 'stagger'; z.t = 0; }
  return true;
}
function updateZombies(dt, time) {
  if (NAV && state === 'play') NAV.refresh(dt);
  if (chronoT > 0) dt *= 0.22;
  for (let i = zombies.length - 1; i >= 0; i--) {
    const z = zombies[i], T = z.T; z.t += dt; z.flinch = damp(z.flinch, 0, 6, dt);
    const dx = P.pos.x - z.root.position.x, dz = P.pos.z - z.root.position.z, dist = Math.hypot(dx, dz) || 1e-3, reach = 1.45 * T.scale, zp = z.root.position, rel = P.pos.y - z.gy, lvl = Math.abs(rel) < 1.8;
    let move = 0; z.nav = NAV && z.state === 'chase' && state === 'play' ? NAV.dir(z, dt) : null;
    if (z.state === 'chase' && state === 'play' && (z.chk = (z.chk || 0) - dt) <= 0) { z.chk = 0.5; z.lost = z.nav || (rel > 2 && z.gy < 1) || (lvl && losClear(zp.x, zp.z, P.pos.x, P.pos.z, z.gy)) ? 0 : (z.lost || 0) + 0.5;
      if (z.lost > 3.5 || dist > 50) { const sp = spawnPoint(); if (sp) { z.root.position.set(sp[0], sp[2] || 0, sp[1]); z.gy = sp[2] || 0; z.link = null; z.state = 'spawn'; z.t = 0; z.uDis.value = 1; z.lost = 0; continue; } } }
    if (z.state === 'chase' && !P.dead && (z.type === 'spitter' ? dist > 5 && dist < 30 && Math.abs(rel) < 6 : rel > 2.5 && z.gy < 1 && dist < 22)) { z.spitT = (z.spitT ?? rand(1, 2.5)) - dt; if (z.spitT <= 0) { z.spitT = rand(2.2, 3.6) * z.wk; spit(z); } }
    if (z.state === 'spawn') { z.uDis.value = 1 - clamp(z.t / 0.9, 0, 1); if (z.t > 0.95) { z.uDis.value = 0; z.state = 'chase'; } }
    else if (z.state === 'chase') { let aim = Math.atan2(dx, dz); if (z.nav && !(lvl && dist < 2.5)) aim = Math.atan2(z.nav.x, z.nav.z);
      if (z.type === 'imp' && dist < 6 && dist > reach) aim += z.orbit * (dist < 3 ? 1.35 : 0.8);                      // imps circle their prey before darting in
      z.yaw = angDamp(z.yaw, aim, z.type === 'imp' ? 10 : 5, dt); z.leapCd = (z.leapCd || 0) - dt;
      if (P.dead) move = 0;
      else if (z.type === 'exploder' && dist < 2.4 && Math.abs(rel) < 2.5) { z.state = 'fuse'; z.t = 0; SFX.beep(); }
      else if (z.type === 'leaper' && dist > 6 && dist < 17 && z.leapCd <= 0 && Math.abs(rel) < 1.5 && !z.nav && ceilAt(zp.x, zp.z, z.gy) > z.gy + 6) { z.state = 'leap'; z.t = 0; z.leapCd = rand(3.5, 5.5) * z.wk; z.from = z.root.position.clone(); z.to = P.pos.clone().setY(groundHeightAt(P.pos.x, P.pos.z, P.pos.y)).addScaledVector(v1.set(dx, 0, dz).normalize(), -0.9); sfxTone({ dur: 0.3, f0: 150, f1: 420, vol: 0.2, type: 'sawtooth' }); }
      else if (dist < reach && lvl) { z.state = 'windup'; z.t = 0; } else move = z.type === 'spitter' && dist < 9 ? 0 : T.speed * z.sk; }
    else if (z.state === 'fuse') { z.model.scale.setScalar(1 + Math.sin(z.t * 40) * 0.06); if (z.t > 0.6) { z.model.scale.setScalar(1); damageZombie(z, 9999, v1.set(0, 0, 0), 0, 'ult'); } }
    else if (z.state === 'leap') { const k = Math.min(1, z.t / 0.75); z.root.position.lerpVectors(z.from, z.to, k); z.root.position.y += Math.sin(k * Math.PI) * 3.2;
      if (k >= 1) { z.root.position.y = z.gy = z.to.y; z.state = 'chase'; z.t = 0; spawnRing(z.root.position, ACID, 3, 0.3); if (dist < 2.4 && lvl) hurtPlayer(T.dmg * z.dk, v1.set(dx / dist, 0, dz / dist)); } }
    else if (z.state === 'windup') { z.yaw = angDamp(z.yaw, Math.atan2(dx, dz), 3 / z.wk, dt); if (z.t > (T.wind || 0.42) * z.wk) { z.state = 'attack'; z.t = 0; z.struck = false; } }
    else if (z.state === 'attack') { if (!z.struck && z.t > 0.08) { z.struck = true; if (T.slam) { spawnRing(z.root.position, GOLD, T.slam, 0.4); camShake = Math.max(camShake, 0.4); SFX.boom(); if (dist < T.slam && Math.abs(rel) < 1.2) hurtPlayer(T.dmg * z.dk, v1.set(dx / dist, 0, dz / dist)); } else if (dist < reach + 0.5 && Math.abs(rel) < 1.4) hurtPlayer(T.dmg * z.dk, v1.set(dx / dist, 0, dz / dist)); } if (z.t > (T.rec || 0.55) * z.wk) { z.state = 'chase'; z.t = 0; if (z.type === 'imp') z.orbit = -z.orbit; } }
    else if (z.state === 'stagger') { if (z.t > (z.elite ? 0.18 : 0.3)) { z.state = 'chase'; z.t = 0; } }
    else if (z.state === 'dead') { z.uDis.value = clamp(z.t / 1.25, 0, 1); z.model.rotation.x = -Math.min(z.t * 1.4, 1.15); z.model.position.y = -Math.min(z.t * 0.5, 0.35);
      if (Math.random() < dt * 40) sparks.emit(v1.set(z.root.position.x + rand(-0.3, 0.3), z.gy + rand(0.2, 1.5), z.root.position.z + rand(-0.3, 0.3)), v2.set(rand(-0.4, 0.4), rand(0.6, 2), rand(-0.4, 0.4)), C_EMBER, rand(0.6, 1.4), 0.04, -1);
      if (z.t > 1.3) { scene.remove(z.root); z.model.traverse(o => { if (o.isMesh) o.material.dispose(); }); zombies.splice(i, 1); continue; } }
    z.act.timeScale = damp(z.act.timeScale, z.state === 'chase' && move > 0 ? T.ts : 0.12, 8, dt);
    const f = fwd(z.yaw, v1); z.root.position.addScaledVector(f, move * dt).addScaledVector(z.vel, dt); z.vel.multiplyScalar(Math.exp(-7 * dt));
    for (const o of zombies) { if (o === z || o.state === 'dead') continue; const ox = z.root.position.x - o.root.position.x, oz = z.root.position.z - o.root.position.z, d = Math.hypot(ox, oz); if (d < 0.85 && d > 1e-3 && Math.abs(o.gy - z.gy) < 1.5) { z.root.position.x += ox / d * (0.85 - d) * 0.5; z.root.position.z += oz / d * (0.85 - d) * 0.5; } }
    if (z.state !== 'dead' && dist < 0.7 && lvl && !(P.dash > 0)) { z.root.position.x -= dx / dist * (0.7 - dist); z.root.position.z -= dz / dist * (0.7 - dist); }
    resolve(z.root.position, 0.4, false, true);
    if (z.state !== 'leap') { const g = groundHeightAt(zp.x, zp.z, z.gy + 0.25); z.gy = g >= z.gy ? Math.min(g, z.gy + 6 * dt + 0.02) : Math.max(g, z.gy - 14 * dt); zp.y = z.gy; }   // climb stairs, drop off ledges
    z.groanT -= dt; if (z.groanT < 0 && z.state === 'chase') { z.groanT = rand(4, 10); if (dist < 14) SFX.groan(); }
    { const farZ = dist > (Q.zRefl ? 28 : 16); if (z.farZ !== farZ) { z.farZ = farZ; z.model.traverse(o => { if (o.isMesh) o.castShadow = !farZ; }); } }
    if (dist < 22 || z.state === 'dead' || z.state === 'spawn') { z.mixer.update(dt); poseZombie(z, dt, time); }
    else { z.root.rotation.y = z.yaw; const n = dist < 45 ? 2 : 4; if ((frameN + i) % n === 0) z.mixer.update(dt * n); }
  }
}

// ============================================================================ abilities (ported)
function nearestZombie(maxDist, coneCos = -2, from = P.pos, dir = facingVec()) {
  let best = null, bd = maxDist;
  for (const z of zombies) { if (!zOK(z)) continue; tmpV2.subVectors(z.root.position, from); tmpV2.y = 0; const d = tmpV2.length(); if (d < bd && (d < 0.01 || tmpV2.dot(dir) / d >= coneCos)) { bd = d; best = z; } }
  return best;
}
const chestPos = () => P.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
function trySlash() {
  if (P.dead || P.ultState || P.dash > 0 || locked()) return;
  if (P.atkCd > 0) { P.queued = true; return; }
  P.combo = P.comboTimer > 0 ? (P.combo + 1) % 3 : 0;
  P.comboTimer = 0.7; P.atkTimer = P.atkDur; P.atkCd = P.combo === 2 ? 0.36 : 0.2; P.queued = false; P.throwAnim = 0;
  const cf = camForward(), target = nearestZombie(8, 0.2, P.pos, cf);
  if (target) { tmpV.subVectors(target.root.position, P.pos); tmpV.y = 0; P.facing = yawOf(tmpV); if (tmpV.length() > 2) { tmpV.normalize(); P.vel.x = tmpV.x * 22; P.vel.z = tmpV.z * 22; P.lungeT = 0.12; } }
  else P.facing = yawOf(cf);
  const fwdV = facingVec(), tilt = [0.25, -0.25, 0][P.combo], big = P.combo === 2;
  spawnArc({ pos: chestPos().addScaledVector(fwdV, 0.3), yaw: P.facing, tilt, vertical: big, color: big ? MAGENTA : CYAN, outer: big ? 4 : 3.4, len: big ? 3.1 : 2.8, dur: big ? 0.3 : 0.22 });
  if (!P.onGround && P.combo === 2) P.vel.y = -18;
  SFX.slash();
  after(0.06, () => { const f = facingVec(); let any = false;
    for (const z of [...zombies]) { if (!zOK(z)) continue; tmpV.subVectors(z.root.position, P.pos); const dy = Math.abs(tmpV.y); tmpV.y = 0; const d = tmpV.length(); if (d > (big ? 4.4 : 3.8) || dy > 2.5) continue; if (d > 0.6 && tmpV.dot(f) / d < 0.25) continue;
      any = damageZombie(z, big ? 55 : 30, tmpV.clone().normalize(), big ? 14 : 6, 'slash') || any; }
    camShake = Math.max(camShake, big ? 0.3 : 0.12); if (any) hitstop = Math.max(hitstop, big ? 0.07 : 0.04); });
}
const shurikenGeo = (() => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const r = i % 2 ? 0.08 : 0.32, a = i / 8 * Math.PI * 2; i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); g.translate(0, 0, -0.01); g.rotateX(-Math.PI / 2); return g; })();
const shurikenMat = new THREE.MeshStandardMaterial({ color: 0xcfd8e4, metalness: 1, roughness: 0.2, emissive: new THREE.Color(0.5, 0.9, 1.3), emissiveIntensity: 1.6 });
const projectiles = [];
function tryShuriken() {
  if (P.dead || P.ultState || locked()) return;
  if (!P.unlock.shuriken) { banner('LOCKED', 'Shuriken unlocks at wave 2', 1.4); return; }
  if (P.cd.shuriken > 0) return; P.cd.shuriken = P.max.shuriken;
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); const start = chestPos(); P.facing = yawOf(dir);
  for (let k = -1; k <= 1; k++) { const d = dir.clone().applyAxisAngle(UP, k * 0.12), m = new THREE.Mesh(shurikenGeo, shurikenMat); m.position.copy(start); m.castShadow = true; scene.add(m); projectiles.push({ m, vel: d.multiplyScalar(45), life: 1.4, hit: new Set() }); }
  P.atkTimer = P.atkDur; P.combo = 0; P.throwAnim = 0.2; SFX.throw();
}
function updateProjectiles(dt) {
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i]; p.life -= dt;
    if (p.stuck) { if (p.life <= 0) { scene.remove(p.m); projectiles.splice(i, 1); } continue; }
    const near = nearestZombie(10, 0.85, p.m.position, tmpV.copy(p.vel).setY(0).normalize());
    if (near && !p.hit.has(near)) { const tgt = near.root.position.clone(); tgt.y += 1.1 * near.T.scale; p.vel.lerp(tgt.sub(p.m.position).normalize().multiplyScalar(45), 1 - Math.exp(-8 * dt)); }
    p.m.position.addScaledVector(p.vel, dt); p.m.rotation.y += 30 * dt;
    if (Math.random() < 0.6) pEmit(sparks, p.m.position.x, p.m.position.y, p.m.position.z, 0, 0, 0, 0.3, 1.2, 1.8, 0.2, 0.2);
    for (const z of [...zombies]) { if (!zOK(z) || p.hit.has(z)) continue; const c = z.root.position.clone(); c.y += 1.0 * z.T.scale;
      if (c.distanceTo(p.m.position) < 0.9 * z.T.scale) { p.hit.add(z); damageZombie(z, 22, p.vel.clone().setY(0).normalize(), 3, 'shuriken'); p.life = Math.min(p.life, 0.25); } }
    if (p.m.position.y < 0.05 || insideAnyCollider(p.m.position.x, p.m.position.z, p.m.position.y - 0.5)) { p.stuck = true; p.life = 2; pBurst(sparks, p.m.position, 6, 4, GOLD, 0.25, 0.25); SFX.clang(); }
    if (p.life <= 0) { scene.remove(p.m); projectiles.splice(i, 1); }
  }
}
function tryDash() {
  if (P.dead || P.ultState || P.cd.dash > 0 || locked()) return; P.cd.dash = P.max.dash;
  const move = moveInput(), dir = move.lengthSq() > 0 ? move.normalize() : camForward();
  P.dashDir.copy(dir); P.dash = 0.18; P.dashHit.clear(); P.invuln = Math.max(P.invuln, 0.3); P.facing = yawOf(dir); P.jumps = Math.max(P.jumps, 1); P.wall = null;
  SFX.dash(); camShake = Math.max(camShake, 0.15);
}
function tryStorm() {
  if (P.dead || P.ultState) return;
  if (!P.unlock.storm) { banner('LOCKED', 'Blade Storm unlocks after wave 3', 1.4); return; }
  if (P.cd.storm > 0) return; P.cd.storm = P.max.storm; P.storm = 0.9; P.stormTick = 0;
  spawnArc({ pos: P.pos.clone().setY(P.pos.y + 1.0), yaw: 0, full: true, color: CYAN, inner: 3.5, outer: 5.5, dur: 0.9, follow: () => P.pos.clone().setY(P.pos.y + 1.0) });
  spawnArc({ pos: P.pos.clone().setY(P.pos.y + 0.4), yaw: 0, full: true, color: MAGENTA, inner: 2.5, outer: 4.5, dur: 0.9, follow: () => P.pos.clone().setY(P.pos.y + 0.4) });
  sfxNoise({ dur: 0.7, f0: 500, f1: 3000, q: 0.5, vol: 0.45 });
}
function tryUlt() {
  if (P.dead || P.ultState) return;
  if (!P.unlock.ult) { banner('LOCKED', '1000 Blades unlocks after wave 4', 1.4); return; }
  if (P.ult < 100) { banner('NOT READY', `ultimate ${Math.floor(P.ult)}% — kills charge it`, 1); return; }
  const targets = zombies.filter(z => zOK(z) && z.root.position.distanceTo(P.pos) < 35).sort((a, b) => a.root.position.distanceTo(P.pos) - b.root.position.distanceTo(P.pos)).slice(0, 16);
  if (!targets.length) { banner('NO TARGETS', 'get closer to the horde', 1); return; }
  P.ult = 0; P.ultState = { targets, idx: 0, t: 0.25 }; spawnRing(P.pos, MAGENTA, 6, 0.45); spawnGhost(MAGENTA); P.invuln = 99; P.wall = null; P.dash = 0;
  sfxTone({ dur: 1.2, f0: 90, f1: 30, vol: 0.7, type: 'sawtooth' }); sfxNoise({ dur: 1.0, f0: 8000, f1: 200, vol: 0.4 }); banner('千 刃', 'THOUSAND BLADES', 1.2);
}
function updateUlt(dt) {
  const U = P.ultState; U.t -= dt; if (U.t > 0) return;
  if (U.idx < U.targets.length) {
    const z = U.targets[U.idx++]; if (z.state === 'dead' || !zombies.includes(z)) { U.t = 0; return; }
    const from = chestPos(); spawnGhost(MAGENTA);
    const away = tmpV.subVectors(z.root.position, P.pos).setY(0).normalize().clone();
    P.pos.copy(z.root.position).addScaledVector(away, 1.2); resolveCircle(P.pos, P.r); P.pos.y = groundHeightAt(P.pos.x, P.pos.z, z.root.position.y + 0.5); P.facing = yawOf(away) + Math.PI;
    spawnStreak(from, chestPos(), MAGENTA, 0.18, 0.5);
    spawnArc({ pos: z.root.position.clone().setY(z.root.position.y + 1.1), yaw: rand(0, 6.28), tilt: rand(-1, 1), color: MAGENTA, outer: 3, dur: 0.3, vertical: Math.random() < 0.5 });
    damageZombie(z, 9999, away, 10, 'ult'); SFX.slash(); camShake = 0.3; pBurst(sparks, z.root.position.clone().setY(1.2), 30, 12, MAGENTA, 0.4, 0.5);
    P.atkTimer = P.atkDur; P.combo = U.idx % 3; P.throwAnim = 0; U.t = 0.13; hitstop = Math.max(hitstop, 0.02);   // one visible cut per target
  } else if (!U.fin) { U.fin = true; U.t = 0.18; P.atkTimer = P.atkDur * 1.5; P.combo = 2; }                                  // raise the blade, then the shockwave
  else {
    spawnRing(P.pos, MAGENTA, 16, 0.7); spawnRing(P.pos, CYAN, 11, 0.5); pBurst(sparks, chestPos(), 120, 22, MAGENTA, 0.5, 0.8);
    for (const z of [...zombies]) { const d = z.root.position.distanceTo(P.pos); if (d < 14 && zOK(z)) damageZombie(z, 120, tmpV.subVectors(z.root.position, P.pos).setY(0).normalize().clone(), 20, 'ult'); }
    SFX.boom(); camShake = 0.8; P.ultState = null; P.invuln = 0.6;
  }
}
function tryJump() {
  if (P.dead || P.ultState || locked()) return;
  if (P.wall) { const n = new THREE.Vector3(P.wall.nx, 0, P.wall.nz), along = P.vel.clone().setY(0); along.addScaledVector(n, -along.dot(n));
    P.vel.copy(n.multiplyScalar(13)).add(along.multiplyScalar(0.7)); P.vel.y = 13; P.wall = null; P.wallCd = 0.25; P.jumps = 1; P.facing = yawOf(P.vel); SFX.jump(); spawnGhost(); return; }
  if (P.onGround) { P.vel.y = 13; P.onGround = false; P.jumps = 1; SFX.jump(); }
  else if (P.jumps > 0) { P.vel.y = 12; P.jumps--; SFX.jump(); pBurst(sparks, P.pos, 16, 5, CYAN, 0.35, 0.35); spawnRing(P.pos, CYAN, 3, 0.3); }
}
// ---- scroll abilities + enemy projectiles
const flashLight = new THREE.PointLight(0xbfd8ff, 0, 70, 1.3); scene.add(flashLight); let flashDecay = 0;
const ABILITIES = { lightning: { name: 'LIGHTNING', key: '1', desc: 'calls down bolts on up to 6 nearby zombies' }, chrono: { name: 'CHRONO SLOW', key: '2', desc: 'slows every zombie to a crawl for 5 s' }, fire: { name: 'FIRE WAVE', key: '3', desc: 'hurls 3 exploding fireballs' } };
function flash(color, intensity, pos) { flashLight.color.set(color); flashLight.intensity = intensity * 6; flashLight.position.copy(pos); flashDecay = intensity * 6; }
function strikeBolt(pos) {
  const end = pos.clone().setY(pos.y + 0.2); let prev = new THREE.Vector3(pos.x + rand(-4, 4), 60, pos.z + rand(-4, 4));
  for (let k = 1; k <= 8; k++) { const u = k / 8, nx = k === 8 ? end.clone() : new THREE.Vector3(lerp(prev.x, end.x, 0.18) + rand(-2.5, 2.5), 60 * (1 - u), lerp(prev.z, end.z, 0.18) + rand(-2.5, 2.5)); spawnStreak(prev, nx, BOLT, 0.45, 0.3); prev = nx; }
  pBurst(sparks, end.clone().setY(0.6), 40, 14, BOLT, 0.4, 0.5); flash(0xbfd8ff, 120, end.clone().setY(6));
}
function tryLightning() {
  if (P.dead || P.ultState || !P.abil.lightning || P.cd.lightning > 0) return;
  const targets = zombies.filter(z => zOK(z) && z.root.position.distanceTo(P.pos) < 32).sort((a, b) => a.root.position.distanceTo(P.pos) - b.root.position.distanceTo(P.pos)).slice(0, 6);
  if (!targets.length) { banner('NO TARGETS', 'lightning needs zombies within 32 m', 1); return; }
  P.cd.lightning = P.max.lightning; SFX.thunder(); camShake = Math.max(camShake, 0.5);
  targets.forEach((z, i) => after(i * 0.11, () => { if (z.state === 'dead' || !zombies.includes(z)) return; strikeBolt(z.root.position); damageZombie(z, 170, new THREE.Vector3(0, 0, 0), 4, 'lightning'); }));
}
function tryChrono() { if (P.dead || P.ultState || !P.abil.chrono || P.cd.chrono > 0) return; P.cd.chrono = P.max.chrono; chronoT = 5; sfxTone({ dur: 0.8, f0: 900, f1: 120, vol: 0.3 }); sfxTone({ dur: 0.8, f0: 450, f1: 60, vol: 0.2, type: 'triangle' }); spawnRing(P.pos, CYAN, 28, 0.9); spawnRing(P.pos, CYAN, 16, 0.6); }
const fireballs = [], fireGeo = new THREE.IcosahedronGeometry(0.5, 1), fireMat = new THREE.MeshBasicMaterial({ color: FIREC.clone().multiplyScalar(2) });
function tryFire() {
  if (P.dead || P.ultState || !P.abil.fire || P.cd.fire > 0) return; P.cd.fire = P.max.fire; sfxNoise({ dur: 0.5, f0: 1200, f1: 200, q: 0.6, vol: 0.5 });
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir); P.facing = yawOf(dir); P.atkTimer = P.atkDur; P.throwAnim = 0.25;
  for (const a of [-0.17, 0, 0.17]) { const d = dir.clone().applyAxisAngle(UP, a), m = new THREE.Mesh(fireGeo, fireMat); m.position.copy(chestPos()).addScaledVector(d, 1); scene.add(m); fireballs.push({ m, vel: d.multiplyScalar(30), life: 1.8 }); }
}
function explodeAt(pos, radius, hurtP = false) {
  if (hurtP && !P.dead) { const d = P.pos.distanceTo(pos); if (d < radius) hurtPlayer(Math.round(28 * (1 - d / radius * 0.6)), tmpV.subVectors(P.pos, pos).setY(0).normalize()); }
  pBurst(sparks, pos, 90, 20, FIREC, 0.8, 0.7, -2); blobs.burst(pos, 14, C_DUST, { speed: 4, up: 3, life: 1.4, size: 0.6, gravity: -0.4, alpha: 0.18 });
  spawnRing(pos.clone().setY(0.1), GOLD, radius + 2, 0.5); flash(0xff8a30, 90, pos.clone().setY(pos.y + 1.5)); SFX.boom(); camShake = Math.max(camShake, 0.55);
  for (const z of [...zombies]) { if (!zOK(z)) continue; const d = z.root.position.distanceTo(pos); if (d < radius) damageZombie(z, 120 * (1 - d / radius * 0.5), tmpV2.subVectors(z.root.position, pos).setY(0).normalize().clone(), 14, 'ult'); }
}
function updateFireballs(dt) {
  if (flashDecay > 0) { flashDecay = Math.max(0, flashDecay - dt * 2400); flashLight.intensity = flashDecay; }
  for (let i = fireballs.length - 1; i >= 0; i--) { const f = fireballs[i]; f.life -= dt; f.m.position.addScaledVector(f.vel, dt); f.m.rotation.x += dt * 8; f.m.rotation.y += dt * 6;
    const p = f.m.position; pEmit(sparks, p.x, p.y, p.z, rand(-1, 1), rand(0, 2), rand(-1, 1), FIREC.r, FIREC.g, FIREC.b, 0.7, 0.35);
    let boom = f.life <= 0 || p.y < 0.4 || insideAnyCollider(p.x, p.z, p.y - 0.6);
    if (!boom) for (const z of zombies) if (zOK(z) && Math.hypot(z.root.position.x - p.x, z.root.position.z - p.z) < 1.1 * z.T.scale && Math.abs(z.root.position.y + 1 - p.y) < 1.6) { boom = true; break; }
    if (boom) { explodeAt(p.clone(), 5); scene.remove(f.m); fireballs.splice(i, 1); } }
}
const acids = [], acidGeo = new THREE.SphereGeometry(0.28, 10, 8), acidMat = new THREE.MeshBasicMaterial({ color: ACID.clone().multiplyScalar(1.6) }), reflMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.9, 0.6) });
function spit(z) {
  const s = new THREE.Vector3(z.root.position.x, z.gy + 1.6 * z.T.scale, z.root.position.z), tgt = P.pos.clone().add(new THREE.Vector3(P.vel.x * 0.35, 1.1, P.vel.z * 0.35));
  const dist = s.distanceTo(tgt), tt = Math.max(0.5, dist / 17), v = tgt.sub(s).divideScalar(tt); v.y += 0.5 * 9 * tt;
  const m = new THREE.Mesh(acidGeo, acidMat); m.position.copy(s); scene.add(m); acids.push({ m, v, life: 4, src: z, refl: false }); sfxTone({ dur: 0.22, f0: 300, f1: 700, vol: 0.2, type: 'square' });
}
function deflectAcid(a) {
  if (a.refl) return; const p = a.m.position, src = a.src && zombies.includes(a.src) && a.src.state !== 'dead' ? a.src : null;
  const tgt = src ? new THREE.Vector3(src.root.position.x, src.gy + 1.4 * src.T.scale, src.root.position.z) : p.clone().addScaledVector(a.v.clone().setY(0).normalize(), -30);
  a.v.copy(tgt.sub(p).normalize().multiplyScalar(36)); a.refl = true; a.life = 2.2; a.m.material = reflMat; a.m.scale.setScalar(1.5);
  pBurst(sparks, p.clone(), 28, 11, GOLD, 0.35, 0.4); spawnRing(p.clone().setY(Math.max(0.2, p.y - 0.8)), GOLD, 3, 0.3); SFX.clang(); camShake = Math.max(camShake, 0.2); hitstop = Math.max(hitstop, 0.04); P.score += 50;
}
function updateAcid(dt) {
  dt *= chronoT > 0 ? 0.25 : 1; const chest = P.pos.clone(); chest.y += 1.1; const swinging = P.atkTimer > 0 && !(P.throwAnim > 0), fwdV = facingVec();
  for (let i = acids.length - 1; i >= 0; i--) { const a = acids[i]; a.life -= dt; const p = a.m.position;
    if (!a.refl) { const d = p.distanceTo(chest); if (!P.dead && ((swinging && d < 3.6 && (d < 1.4 || tmpV2.subVectors(p, chest).setY(0).normalize().dot(fwdV) > 0.1)) || (P.block && d < 1.9 && tmpV2.subVectors(p, chest).setY(0).normalize().dot(fwdV) > 0.1) || (P.dash > 0 && d < 3.2) || (P.storm > 0 && d < 5.8))) deflectAcid(a); }
    if (a.refl) { p.addScaledVector(a.v, dt); pEmit(sparks, p.x, p.y, p.z, 0, 0, 0, 2.0, 1.7, 0.5, 0.45, 0.3, 0); let hit = null;
      for (const z of zombies) if (zOK(z) && Math.hypot(z.root.position.x - p.x, z.root.position.z - p.z) < 1.1 * z.T.scale && p.y > z.gy - 0.5 && p.y < z.gy + 2.4 * z.T.scale) { hit = z; break; }
      if (hit) { damageZombie(hit, hit === a.src ? 9999 : 90, tmpV2.copy(a.v).setY(0).normalize().clone(), 9, 'ult'); pBurst(sparks, p.clone(), 30, 12, GOLD, 0.4, 0.4); acids.splice(i, 1); scene.remove(a.m); continue; }
      if (a.life <= 0 || p.y < 0.1 || insideAnyCollider(p.x, p.z, p.y - 0.4)) { pBurst(sparks, p.clone(), 14, 6, GOLD, 0.3, 0.3); scene.remove(a.m); acids.splice(i, 1); } continue; }
    a.v.y -= 9 * dt; p.addScaledVector(a.v, dt); if (Math.random() < 0.7) pEmit(sparks, p.x, p.y, p.z, 0, 0, 0, ACID.r, ACID.g, ACID.b, 0.35, 0.4, 0);
    let end = a.life <= 0 || p.y < 0.2 || insideAnyCollider(p.x, p.z, p.y - 0.4);
    if (!end && !P.dead && p.distanceTo(chest) < 1.1) { end = true; if (P.invuln <= 0 && P.dash <= 0) { hurtPlayer(8, tmpV.copy(a.v).setY(0).normalize()); P.poison = Math.min(7, P.poison + 4); } }
    if (end) { pBurst(sparks, p.clone(), 14, 5, ACID, 0.5, 0.7, 6); scene.remove(a.m); acids.splice(i, 1); } }
}
// ---- ability scrolls on rooftops (golden beams)
const scrolls = [], scrollMat = new THREE.MeshStandardMaterial({ color: 0xe8d8a8, emissive: 0x6a5a20, emissiveIntensity: 0.6, roughness: 0.6 }), scrollEnd = new THREE.MeshStandardMaterial({ color: 0xb01828, emissive: 0x400008, roughness: 0.5 });
const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.25, 0.35), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
const roofs = () => colliders.filter(c => c.wall && c.h >= 6 && c.h <= 26 && (c.maxX - c.minX) * (c.maxZ - c.minZ) > 40 && !(c.b && c.b.state));
function spawnScroll() {
  const used = new Set(scrolls.filter(s => !s.taken).map(s => s.c)), cand = roofs().filter(c => { const d = Math.hypot((c.minX + c.maxX) / 2 - P.pos.x, (c.minZ + c.maxZ) / 2 - P.pos.z); return !used.has(c) && d > 25 && d < 120; });
  if (!cand.length) return; const c = cand[Math.floor(Math.random() * cand.length)], g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 12), scrollMat); body.rotation.z = Math.PI / 2; g.add(body);
  for (const s of [-0.55, 0.55]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), scrollEnd); e.rotation.z = Math.PI / 2; e.position.x = s; g.add(e); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 80, 10, 1, true), beamMat); beam.position.y = 40; beam.layers.set(2); beam.userData.noAO = true; g.add(beam);
  scene.add(g); scrolls.push({ c, g, x: (c.minX + c.maxX) / 2, z: (c.minZ + c.maxZ) / 2, t: rand(0, 6), taken: false, respawn: 0 });
}
function resetScrolls(n = 0) { for (const s of scrolls) scene.remove(s.g); scrolls.length = 0; for (let i = 0; i < n; i++) spawnScroll(); }
function grantAbility() {
  const left = Object.keys(ABILITIES).filter(k => !P.abil[k]);
  if (!left.length) { P.ult = Math.min(100, P.ult + 50); P.hp = Math.min(P.maxHp, P.hp + 40); banner('SCROLL OF POWER', '+50% ultimate · +40 HP', 2.2); return; }
  const k = left[Math.floor(Math.random() * left.length)]; P.abil[k] = true; const a = ABILITIES[k]; banner(a.name, `new ability — press ${a.key} · ${a.desc}`, 3.2);
}
function updateScrolls(dt) {
  for (const s of scrolls) {
    if (s.taken) { if ((s.respawn -= dt) <= 0 && !s.done) { s.done = true; spawnScroll(); } continue; }
    s.t += dt; const top = s.c.h; s.g.position.set(s.x, top + 1.9 + Math.sin(s.t * 2.4) * 0.25, s.z); s.g.rotation.y = s.t * 1.6;
    if (Math.random() < 0.15) pEmit(sparks, s.x + rand(-0.6, 0.6), top + 1.9, s.z + rand(-0.6, 0.6), 0, rand(0.5, 1.5), 0, 1.6, 1.3, 0.4, 0.3, 0.8);
    if (!P.dead && Math.abs(P.pos.x - s.x) < 2.4 && Math.abs(P.pos.z - s.z) < 2.4 && Math.abs(P.pos.y + 1 - s.g.position.y) < 2.4) { s.taken = true; s.respawn = 45; scene.remove(s.g); pBurst(sparks, s.g.position, 60, 9, GOLD, 0.5, 0.8, -1); spawnRing(P.pos, GOLD, 8, 0.6); sfxTone({ dur: 0.4, f0: 660, f1: 1320, vol: 0.25, type: 'triangle' }); grantAbility(); }
  }
}
// ---- collapsing buildings (from wave 5 on)
for (const b of world.buildings) { b.home = b.home || b.pivot.position.clone(); b.cols = b.cols || [b.col]; b.Hs = b.cols.map(c => c.h); for (const c of b.cols) c.b = b; for (const l of b.lights) l.userData.base = l.intensity; }
let collapseArm = 0, collapsed = 0;
const rubbleMat = new THREE.MeshStandardMaterial({ color: 0x5c5853, roughness: 0.93, metalness: 0.05 }), rubbleMat2 = new THREE.MeshStandardMaterial({ color: 0x3a3634, roughness: 0.85, metalness: 0.2 }), _mT = new THREE.Matrix4(), _mR = new THREE.Matrix4(), _ax = new THREE.Vector3();
// flying chunks: one instanced pool, simple ballistic motion with a bounce, then they lie where they land
const DEB_N = 280, debMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.05 }), DEB_N), _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dz = new THREE.Matrix4().makeScale(0, 0, 0), _dc = new THREE.Color();
debMesh.frustumCulled = false; debMesh.castShadow = true; debMesh.receiveShadow = true; scene.add(debMesh);
const deb = Array.from({ length: DEB_N }, () => ({ on: false, sleep: true, p: new THREE.Vector3(), v: new THREE.Vector3(), s: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3() })); let debI = 0;
const DEB_COL = [0x6a6661, 0x4b4744, 0x7d756b, 0x3a3634, 0x80604e, 0x55595f];
function clearDebris() { for (let i = 0; i < DEB_N; i++) { deb[i].on = false; deb[i].sleep = true; debMesh.setMatrixAt(i, _dz); debMesh.setColorAt(i, _dc.set(0x666666)); } debMesh.instanceMatrix.needsUpdate = true; debMesh.instanceColor.needsUpdate = true; }
clearDebris();
function spawnDebris(p, v, size) { const i = debI, d = deb[i]; debI = (debI + 1) % DEB_N; d.on = true; d.sleep = false; d.p.copy(p); d.v.copy(v); d.s.set(size * rand(0.6, 1.5), size * rand(0.3, 0.9), size * rand(0.6, 1.5));
  d.q.set(rand(-1, 1), rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize(); d.w.set(rand(-5, 5), rand(-5, 5), rand(-5, 5)); debMesh.setColorAt(i, _dc.set(DEB_COL[Math.floor(Math.random() * DEB_COL.length)])); debMesh.instanceColor.needsUpdate = true; }
function updateDebris(dt) { let dirty = false;
  for (let i = 0; i < DEB_N; i++) { const d = deb[i]; if (!d.on || d.sleep) continue; dirty = true; d.v.y -= 24 * dt; d.p.addScaledVector(d.v, dt); const wl = d.w.length();
    if (wl > 0.01) { _dq.setFromAxisAngle(_ax.copy(d.w).multiplyScalar(1 / wl), wl * dt); d.q.premultiply(_dq); }
    const fl = d.s.y * 0.5 + 0.02; if (d.p.y < fl) { d.p.y = fl; if (Math.abs(d.v.y) < 3 && d.v.x * d.v.x + d.v.z * d.v.z < 6) d.sleep = true; else { if (d.v.y < -9 && Math.random() < 0.3) blobs.emit(d.p, v2.set(rand(-1, 1), rand(0.5, 1.5), rand(-1, 1)), C_DUST, 1.2, 0.5, -0.1, 0.12); d.v.y *= -0.3; d.v.x *= 0.55; d.v.z *= 0.55; d.w.multiplyScalar(0.5); } }
    debMesh.setMatrixAt(i, _dm.compose(d.p, d.q, d.s)); }
  if (dirty) debMesh.instanceMatrix.needsUpdate = true; }
const zoneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.8, 0.12, 0.1), transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
// timeline (seconds): warning 0-1.7 · base gives way 1.7-2.2 · topple 2.2-4.1 · impact · rubble settles to 4.9 · dust and sparks linger
const T_WARN = 1.7, T_SINK = 0.5, T_FALL = 1.9, T_SETTLE = 0.8;
function startCollapse(b) { if (!b || b.state) return; b.state = 1; b.t = 0; b.hit = false; b.sunk = false; collapsed++;
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, H = 0; b.cols.forEach((c, i) => { x0 = Math.min(x0, c.minX); x1 = Math.max(x1, c.maxX); z0 = Math.min(z0, c.minZ); z1 = Math.max(z1, c.maxZ); H = Math.max(H, b.Hs[i]); });
  const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(Math.random() * 4)], [dx, dz] = d, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, a = dx ? (x1 - x0) / 2 : (z1 - z0) / 2, ex = cx + dx * a, ez = cz + dz * a, L = Math.min(H, 11);
  b.box = { x0, x1, z0, z1, H, cx, cz, ex, ez, L }; b.d = d;
  b.lz = { minX: dx > 0 ? ex : dx < 0 ? ex - L : x0, maxX: dx > 0 ? ex + L : dx < 0 ? ex : x1, minZ: dz > 0 ? ez : dz < 0 ? ez - L : z0, maxZ: dz > 0 ? ez + L : dz < 0 ? ez : z1, wall: false, debris: true, h: 1.3 };
  const zn = b.zone = new THREE.Mesh(new THREE.PlaneGeometry(b.lz.maxX - b.lz.minX, b.lz.maxZ - b.lz.minZ), zoneMat.clone()); zn.rotation.x = -Math.PI / 2; zn.position.set((b.lz.minX + b.lz.maxX) / 2, 0.07, (b.lz.minZ + b.lz.maxZ) / 2); zn.layers.set(2); zn.userData.noAO = true; scene.add(zn);
  if (Math.hypot(cx - P.pos.x, cz - P.pos.z) < 80) banner('倒 壊', 'building coming down — stay out of the red zone', 2.2);
  sfxNoise({ dur: T_WARN + T_SINK + T_FALL, f0: 500, f1: 70, type: 'lowpass', vol: 0.55 }); sfxTone({ dur: T_WARN, f0: 46, f1: 34, vol: 0.5, type: 'sawtooth' }); }
const canFall = (b) => !b.state && !b.noFall && b.cols.length > 1 && Math.abs(b.home.x) > 25;   // never the buildings along the getaway route
function collapseSome() { const dist = (b) => Math.hypot(b.home.x - P.pos.x, b.home.z - P.pos.z), cand = world.buildings.filter(b => canFall(b) && dist(b) < 95).sort((a, b) => dist(a) - dist(b));
  if (!collapsed && cand.length) { startCollapse(cand[0]); return; }
  for (let n = 0; n < Math.min(wave >= 7 ? 2 : 1, cand.length); n++) { const i = Math.floor(Math.random() * Math.min(cand.length, 6)); startCollapse(cand.splice(i, 1)[0]); } }
function makeRubble(x0, x1, z0, z1, core, tall) { const g1 = [], g2 = [], n = Math.round((x1 - x0) * (z1 - z0) / 6) + 10, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < n; i++) { const slab = Math.random() < 0.3, sx = slab ? rand(2.5, 5) : rand(0.7, 2.6), sy = slab ? rand(0.25, 0.5) : rand(0.5, 1.8), sz = slab ? rand(2, 3.5) : rand(0.7, 2.6), g = new THREE.BoxGeometry(sx, sy, sz);
    m4.compose(v1.set(rand(x0 + 0.8, x1 - 0.8), rand(0.25, tall), rand(z0 + 0.8, z1 - 0.8)), q.setFromEuler(e.set(rand(-0.6, 0.6), rand(0, 3.1), rand(-0.6, 0.6))), v2.set(1, 1, 1)); g.applyMatrix4(m4); (Math.random() < 0.3 ? g2 : g1).push(g); }
  if (core) { const g = new THREE.BoxGeometry(x1 - x0 - 0.6, 1.1, z1 - z0 - 0.6); g.translate((x0 + x1) / 2, 0.55, (z0 + z1) / 2); g1.push(g); }
  const grp = new THREE.Group(); for (const [gs, m] of [[g1, rubbleMat], [g2, rubbleMat2]]) if (gs.length) { const mesh = new THREE.Mesh(mergeGeo(gs), m); mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh); } grp.scale.y = 0.01; scene.add(grp); return grp; }
function updateCollapse(dt) {
  if (collapseArm > 0 && (collapseArm -= dt) <= 0) collapseSome();
  for (const b of world.buildings) {
    if (b.after > 0) { b.after -= dt; const { x0, x1, z0, z1 } = b.box, lz = b.lz, k = b.after / 9;     // aftermath: settling dust, sparking cables, embers
      if (Math.random() < k * 0.8) { const inL = Math.random() < 0.5; blobs.emit(v1.set(inL ? rand(lz.minX, lz.maxX) : rand(x0, x1), rand(0.3, 2), inL ? rand(lz.minZ, lz.maxZ) : rand(z0, z1)), v2.set(rand(-0.6, 0.6), rand(0.3, 1.1), rand(-0.6, 0.6)), C_DUST, rand(2, 3.5), rand(0.7, 1.3), -0.15, 0.11); }
      if (Math.random() < dt * 1.6) sparks.burst(v1.set(rand(x0, x1), rand(0.8, 2), rand(z0, z1)), 14, C_CYAN, { speed: 3.5, up: 2, life: 0.4, size: 0.04 });
      if (Math.random() < 0.25) sparks.emit(v1.set(rand(x0, x1), rand(0.5, 1.8), rand(z0, z1)), v2.set(rand(-0.3, 0.3), rand(0.6, 1.8), rand(-0.3, 0.3)), C_EMBER, rand(0.8, 1.8), 0.04, -1); }
    if (b.state !== 1) continue; b.t += dt; const { x0, x1, z0, z1, H, cx, cz, ex, ez } = b.box, [dx, dz] = b.d, lz = b.lz;
    const kw = clamp(b.t / T_WARN, 0, 1), ks = clamp((b.t - T_WARN) / T_SINK, 0, 1), kf = clamp((b.t - T_WARN - T_SINK) / T_FALL, 0, 1), kr = clamp((b.t - T_WARN - T_SINK - T_FALL) / T_SETTLE, 0, 1);
    const thMax = Math.asin(Math.min(1, 11.5 / H)), th = thMax * (0.04 * ks + 0.96 * Math.pow(1 - Math.cos(kf * Math.PI / 2), 1.25)), sink = 1.4 * ks * ks, near = clamp(1 - Math.hypot(P.pos.x - cx, P.pos.z - cz) / 70, 0, 1);
    b.zone.material.opacity = b.hit ? 0 : 0.12 + 0.12 * Math.sin(b.t * (6 + kf * 14)) + kf * 0.1;
    if (!b.hit) {
      camShake = Math.max(camShake, near * (0.06 + kw * 0.12 + ks * 0.5 * (1 - ks) * 4 + kf * 0.35));
      const jit = 0.03 + kw * 0.05; b.pivot.matrixAutoUpdate = false; _mT.makeTranslation(ex + rand(-jit, jit), -sink, ez + rand(-jit, jit)); _mR.makeRotationAxis(_ax.set(dz, 0, -dx), th);
      b.pivot.matrix.copy(_mT).multiply(_mR).multiply(_mT.makeTranslation(b.home.x - ex, 0, b.home.z - ez)); b.pivot.matrixWorldNeedsUpdate = true;
      b.cols.forEach((c, i) => { c.h = lerp(b.Hs[i], 1.8, kf) - sink * (1 - kf); }); for (const l of b.lights) l.intensity = l.userData.base * (1 - kf) * (Math.random() < 1 - kw * 0.6 ? 1 : 0.1);
      // warning: grit and small chunks shaken loose from the eaves, creaks
      if (Math.random() < 0.25 + kw * 0.5) { const sx = Math.random() < 0.5, px = sx ? (Math.random() < 0.5 ? x0 : x1) : rand(x0, x1), pz = sx ? rand(z0, z1) : (Math.random() < 0.5 ? z0 : z1); blobs.emit(v1.set(px, H * rand(0.5, 1), pz), v2.set(rand(-0.5, 0.5), rand(-3, -1), rand(-0.5, 0.5)), C_DUST, rand(1, 1.8), rand(0.3, 0.6), 2, 0.12);
        if (Math.random() < 0.12 + kf * 0.5) spawnDebris(v1.set(px, H * rand(0.6, 1) - sink, pz).applyMatrix4(_mT.copy(b.pivot.matrix).multiply(_mR.makeTranslation(-b.home.x, 0, -b.home.z))), v2.set(dx * rand(0, 4) * kf + rand(-1.5, 1.5), rand(-2, 2), dz * rand(0, 4) * kf + rand(-1.5, 1.5)), rand(0.3, 0.9)); }
      if (kw < 1 && Math.random() < dt * 2.2) sfxTone({ dur: rand(0.25, 0.6), f0: rand(60, 130), f1: rand(40, 70), vol: 0.22 * (0.3 + near), type: 'sawtooth' });
      // the base gives way: a jolt and a ring of dust
      if (ks > 0 && !b.sunk) { b.sunk = true; SFX.boom(); camShake = Math.max(camShake, near); spawnRing(v1.set(cx, 0, cz), C_DUST.clone().multiplyScalar(6), Math.max(x1 - x0, z1 - z0) * 0.9, 0.9);
        for (let n = 0; n < 46; n++) { const sx = n % 2, px = sx ? (n % 4 < 2 ? x0 : x1) : rand(x0, x1), pz = sx ? rand(z0, z1) : (n % 4 < 2 ? z0 : z1); blobs.emit(v1.set(px, rand(0.2, 2.5), pz), v2.set((px - cx) * 0.25 + rand(-1, 1), rand(0.3, 2), (pz - cz) * 0.25 + rand(-1, 1)), C_DUST, rand(1.6, 2.8), rand(0.7, 1.2), -0.15, 0.16); if (n % 3 === 0) spawnDebris(v1.set(px, rand(0.5, 3), pz), v2.set((px - cx) * 0.4 + rand(-2, 2), rand(2, 7), (pz - cz) * 0.4 + rand(-2, 2)), rand(0.3, 0.8)); } }
    }
    if (kf >= 1 && !b.hit) { b.hit = true; b.after = 9; SFX.boom(); sfxNoise({ dur: 1.8, f0: 2600, f1: 70, type: 'lowpass', vol: 0.85 }); sfxNoise({ dur: 0.9, f0: 5000, f1: 900, q: 1.5, vol: 0.3 }); camShake = Math.max(camShake, near * 1.7); hitstop = Math.max(hitstop, near > 0.5 ? 0.06 : 0); for (const l of b.lights) l.intensity = 0;
      // it shatters: the mass turns into flying chunks that carry on along the fall, then settle on the rubble
      const pm = _mT.copy(b.pivot.matrix).multiply(_mR.makeTranslation(-b.home.x, 0, -b.home.z));
      for (let n = 0; n < 150; n++) { v1.set(rand(x0, x1), rand(0, H), rand(z0, z1)); const hgt = v1.y / H; v1.applyMatrix4(pm); if (v1.y < 0.3) v1.y = 0.3; spawnDebris(v1, v2.set(dx * rand(1, 5 + hgt * 9) + rand(-3, 3), rand(-4, 5), dz * rand(1, 5 + hgt * 9) + rand(-3, 3)), rand(0.5, 2.2)); }
      b.pivot.visible = false; scene.remove(b.zone);
      colliders.push(lz); b.debris = lz; b.fill = { minX: x0, maxX: x1, minZ: z0, maxZ: z1, wall: true, h: 1.8, b }; colliders.push(b.fill);
      b.rubble = makeRubble(x0, x1, z0, z1, true, 1.5); b.rubble2 = makeRubble(lz.minX, lz.maxX, lz.minZ, lz.maxZ, false, 0.9);
      spawnRing(v1.set((lz.minX + lz.maxX) / 2, 0, (lz.minZ + lz.maxZ) / 2), C_DUST.clone().multiplyScalar(7), 16, 1.0); spawnRing(v1.set(cx, 0, cz), C_SPARK, 9, 0.5);
      for (let n = 0; n < 80; n++) { const inL = n % 2; blobs.emit(v1.set(inL ? rand(lz.minX, lz.maxX) : rand(x0, x1), rand(0.2, 5), inL ? rand(lz.minZ, lz.maxZ) : rand(z0, z1)), v2.set(dx * rand(0, 5) + rand(-4, 4), rand(0.5, 4), dz * rand(0, 5) + rand(-4, 4)), C_DUST, rand(1.8, 3.4), rand(0.8, 1.3), -0.2, 0.17); }
      for (let n = 0; n < 110; n++) sparks.emit(v1.set(rand(lz.minX, lz.maxX), rand(0.2, 3), rand(lz.minZ, lz.maxZ)), v2.set(dx * rand(0, 8) + rand(-6, 6), rand(1, 9), dz * rand(0, 8) + rand(-6, 6)), C_SPARK, rand(0.5, 1.5), 0.06, 12);
      for (const z of [...zombies]) { const p = z.root.position; if (zOK(z) && ((p.x > lz.minX - 1 && p.x < lz.maxX + 1 && p.z > lz.minZ - 1 && p.z < lz.maxZ + 1) || (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1))) damageZombie(z, 9999, v1.set(dx, 0, dz), 0, 'ult'); }
      if (P.pos.x > lz.minX - 0.5 && P.pos.x < lz.maxX + 0.5 && P.pos.z > lz.minZ - 0.5 && P.pos.z < lz.maxZ + 0.5 && P.pos.y < 3) { hurtPlayer(35, v1.set(dx, 0, dz)); P.pos.y = Math.max(P.pos.y, 1.3); } }
    if (b.rubble) { const e = 1 - Math.pow(1 - kr, 3); b.rubble.scale.y = Math.max(0.01, e); b.rubble2.scale.y = Math.max(0.01, e); }
    if (kr >= 1) b.state = 2; }
}
function resetCollapse() { collapseArm = 0; collapsed = 0; clearDebris(); for (const b of world.buildings) { b.state = 0; b.t = 0; b.after = 0; b.pivot.visible = true; b.pivot.matrixAutoUpdate = true; b.pivot.scale.set(1, 1, 1); b.pivot.rotation.set(0, 0, 0); b.pivot.position.copy(b.home); b.cols.forEach((c, i) => { c.h = b.Hs[i]; }); for (const l of b.lights) l.intensity = l.userData.base;
  if (b.zone) { scene.remove(b.zone); b.zone = null; }
  for (const k of ['rubble', 'rubble2']) if (b[k]) { scene.remove(b[k]); b[k].traverse(o => o.geometry && o.geometry.dispose()); b[k] = null; } for (const k of ['debris', 'fill']) if (b[k]) { const i = colliders.indexOf(b[k]); if (i >= 0) colliders.splice(i, 1); b[k] = null; } } }
// ---- the escape: reach the car, drive off toward the moon
let phase = 'fight', cine = null, wake = null;
const HOSP = world.hospital, inHosp = (p) => HOSP && p.x > HOSP.minX && p.x < HOSP.maxX && p.z > HOSP.minZ && p.z < HOSP.maxZ, locked = () => phase === 'cine' || phase === 'wake';
// ---- hospital navigation: a flow field over every storey (0.5 m cells), refreshed from the player's position; the stair flights link the levels
const NAV = HOSP ? (() => {
  const CS = 0.5, MG = 4, FH = HOSP.FH, NL = HOSP.levels, x0 = HOSP.minX - MG, z0 = HOSP.minZ - MG, nx = Math.ceil((HOSP.maxX - HOSP.minX + MG * 2) / CS), nz = Math.ceil((HOSP.maxZ - HOSP.minZ + MG * 2) / CS), N = nx * nz;
  const walk = new Uint8Array(NL * N), dist = new Int16Array(NL * N), queue = new Int32Array(NL * N), links = new Map();
  const solid = (x, z, y, pad) => { for (const c of colliders) if (!c.roof && !c.ramp && x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad && y + 0.4 < c.h && y + 1.5 > (c.y0 || 0)) return true; return false; };
  const cx = (i) => x0 + (i + 0.5) * CS, cz = (j) => z0 + (j + 0.5) * CS;
  for (let l = 0; l < NL; l++) for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = cx(i), z = cz(j), y = l * FH; if (l > 0 && !inHosp({ x, z })) continue; if (Math.abs(groundHeightAt(x, z, y + 0.3) - y) > 0.05 || solid(x, z, y, 0.3)) continue; walk[l * N + j * nx + i] = 1; }
  const cellAt = (x, z, l, R = 0) => { const i0 = Math.floor((x - x0) / CS), j0 = Math.floor((z - z0) / CS); let best = -1, bd = 1e9;
    for (let j = j0 - R; j <= j0 + R; j++) for (let i = i0 - R; i <= i0 + R; i++) { if (i < 0 || j < 0 || i >= nx || j >= nz) continue; const c = l * N + j * nx + i; if (!walk[c]) continue; const d = (cx(i) - x) ** 2 + (cz(j) - z) ** 2; if (d < bd) { bd = d; best = c; } } return best; };
  for (const [a, b] of HOSP.links) { const ca = cellAt(a[0], a[1], a[2], 2), cb = cellAt(b[0], b[1], b[2], 2); if (ca < 0 || cb < 0) { console.warn('nav: stair link has no landing', a, b); continue; } links.set(ca, { to: cb, x: b[0], z: b[1], y: b[2] * FH }); links.set(cb, { to: ca, x: a[0], z: a[1], y: a[2] * FH }); }
  const inBox = (p) => p.x > x0 && p.x < x0 + nx * CS && p.z > z0 && p.z < z0 + nz * CS, NB = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let T = 0, src = -1;
  function refresh(dt) { T -= dt; if (T > 0) return; T = 0.2; dist.fill(-1); let qh = 0, qt = 0; src = -1;
    if (inBox(P.pos) && P.pos.y < HOSP.h + 6) { const g = groundHeightAt(P.pos.x, P.pos.z, P.pos.y), l = clamp(Math.round(g / FH), 0, NL - 1); src = cellAt(P.pos.x, P.pos.z, l, 7); }
    if (src >= 0) { dist[src] = 0; queue[qt++] = src; }
    else for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) if ((i === 0 || j === 0 || i === nx - 1 || j === nz - 1) && walk[j * nx + i]) { dist[j * nx + i] = 0; queue[qt++] = j * nx + i; }   // the player is elsewhere: everything inside heads for the street
    while (qh < qt) { const c = queue[qh++], d = dist[c] + 1, l = Math.floor(c / N), r = c - l * N, j = Math.floor(r / nx), i = r - j * nx;
      for (let k = 0; k < 4; k++) { const ii = i + NB[k][0], jj = j + NB[k][1]; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const n = l * N + jj * nx + ii; if (walk[n] && dist[n] < 0) { dist[n] = d; queue[qt++] = n; } }
      const lk = links.get(c); if (lk && dist[lk.to] < 0) { dist[lk.to] = d + 12; queue[qt++] = lk.to; } } }
  // which way should this zombie walk? null = no opinion (chase the player directly)
  function dir(z, dt) { const p = z.root.position, out = z.navV || (z.navV = new THREE.Vector3());
    if (z.link) { const dx = z.link.x - p.x, dz = z.link.z - p.z; if (dx * dx + dz * dz < 0.5 && Math.abs(z.gy - z.link.y) < 0.6) z.link = null; else if ((z.linkT -= dt) < 0) z.link = null; else return out.set(dx, 0, dz); }
    if (!inBox(p)) return null; const l = Math.round(z.gy / FH); if (l < 0 || l >= NL || Math.abs(z.gy - l * FH) > 0.5) return null;
    const c = cellAt(p.x, p.z, l, 1); if (c < 0 || dist[c] < 0) return null; const d = dist[c]; if (d <= 3 && src >= 0) return null;
    const lk = links.get(c); if (lk && dist[lk.to] >= 0 && dist[lk.to] < d) { z.link = lk; z.linkT = 6; return out.set(lk.x - p.x, 0, lk.z - p.z); }
    const r = c - l * N, j = Math.floor(r / nx), i = r - j * nx; let best = d, bi = 0, bj = 0;
    for (const [di, dj] of NB) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue; const n = l * N + jj * nx + ii; if (dist[n] < 0 || dist[n] >= best) continue; if (di && dj && (dist[l * N + j * nx + ii] < 0 || dist[l * N + jj * nx + i] < 0)) continue; best = dist[n]; bi = ii; bj = jj; }
    if (best === d) { const lk2 = links.get(c); return lk2 ? out.set(lk2.x - p.x, 0, lk2.z - p.z) : null; } return out.set(cx(bi) - p.x, 0, cz(bj) - p.z); }
  // somewhere for the dead to rise: a reachable cell a short walk from the player
  function spawn(minD = 14, maxD = 70) { if (src < 0) return null; for (let t = 0; t < 120; t++) { const c = Math.floor(Math.random() * NL * N); if (dist[c] < minD || dist[c] > maxD) continue; const l = Math.floor(c / N), r = c - l * N, j = Math.floor(r / nx), i = r - j * nx; if (l === 0 && !inHosp({ x: cx(i), z: cz(j) })) continue; return [cx(i), cz(j), l * FH]; } return null; }
  return { refresh, dir, spawn, walkable: (x, z, l) => cellAt(x, z, l, 0) >= 0, get active() { return src >= 0; } };
})() : null;
function startWake() { if (!HOSP) { banner('WAVE 1', 'the dead are coming', 2.5); SFX.wave(); return; }
  phase = 'wake'; wake = { t: 0, beep: 0.2, spawned: false }; P.pos.copy(HOSP.bed); P.facing = HOSP.yaw; P.vel.set(0, 0, 0); cam.fixed = true; finalPass.uniforms.uFade.value = 0; document.body.classList.add('cine'); camera.fov = 58; camera.updateProjectionMatrix(); }
function updateWake(dt) {
  if (phase !== 'wake') return; const w = wake, t = (w.t += dt), f = fwd(HOSP.yaw), ss = (a, b, x) => { const u = clamp((x - a) / (b - a), 0, 1); return u * u * (3 - 2 * u); };
  const up = ss(2.7, 3.6, t); P.pos.copy(HOSP.bed); P.pos.y += 0.1 * (1 - up); P.pos.addScaledVector(f, 0.25); P.vel.set(0, 0, 0); P.facing = HOSP.yaw; P.onGround = true;
  finalPass.uniforms.uFade.value = Math.max(0.55 * Math.sin(Math.PI * clamp((t - 0.3) / 1.0, 0, 1)), ss(1.7, 2.6, t));   // eyes flutter open
  if (t < 3 && (w.beep -= dt) <= 0) { w.beep = 0.75; SFX.beep(); }
  if (t < 3.1) { const mid = v1.copy(P.pos).addScaledVector(f, -0.5); camera.position.set(mid.x - f.x * 0.9 + f.z * 0.5, P.pos.y + 2.2 - t * 0.12, mid.z - f.z * 0.55 - f.x * 0.5); camera.lookAt(mid.x, P.pos.y + 0.2, mid.z); w.a = HOSP.yaw + Math.PI - 0.5; camPos.copy(camera.position); }
  else { w.a += dt * 0.95; const want = v1.set(P.pos.x + Math.sin(w.a) * 4.8, P.pos.y + 1.9, P.pos.z + Math.cos(w.a) * 4.8); want.x = clamp(want.x, HOSP.ward.minX, HOSP.ward.maxX); want.z = clamp(want.z, HOSP.ward.minZ, HOSP.ward.maxZ); camPos.lerp(want, 1 - Math.exp(-3.5 * dt)); camera.position.copy(camPos); camera.lookAt(P.pos.x, P.pos.y + 0.9, P.pos.z); }
  if (!w.spawned && t > 3.0) { w.spawned = true; SFX.wave(); world.flash(); banner('…WHERE AM I?', 'the ward is crawling with the dead', 2.4);
    { const wd = HOSP.ward; let n = 0; for (let q = 0; q < 300 && n < 7; q++) { const x = rand(wd.minX, wd.maxX), z = rand(wd.minZ, wd.maxZ); if (Math.hypot(x - P.pos.x, z - P.pos.z) < 3 || !NAV.walkable(x, z, Math.round(wd.y / HOSP.FH)) || zombies.some(o => Math.hypot(o.root.position.x - x, o.root.position.z - z) < 1.2)) continue; spawnZombie('walker', x, z, wd.y); n++; } } }
  if (t > 5.4) { phase = 'fight'; wake = null; cam.fixed = false; document.body.classList.remove('cine'); camYaw = w.a; camPitch = 0.25; waveDelay = 0; spawnTimer = 2; P.invuln = 0.6; banner('WAVE 1', 'fight your way out of the hospital', 2.6); }
}
const carHome = { p: world.car.position.clone(), ry: world.car.rotation.y, h: world.carCol.h };
const carParts = (() => { let cover = null, mx = 0; world.car.traverse(o => { if (o.isMesh) { const n = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count; if (n > mx) { mx = n; cover = o; } } });
  const body = new THREE.Group(), paint = new THREE.MeshPhysicalMaterial({ color: 0x7a0a14, metalness: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.2 }), glass = new THREE.MeshPhysicalMaterial({ color: 0x05070a, metalness: 0.2, roughness: 0.06, envMapIntensity: 3 }), trim = new THREE.MeshStandardMaterial({ color: 0x0a0a0c, roughness: 0.5, metalness: 0.6 });
  const prof = (pts, w, mat, bevel = 0.05) => { const sh = new THREE.Shape(); pts.forEach((p, i) => i ? sh.lineTo(p[0], p[1]) : sh.moveTo(p[0], p[1])); sh.closePath(); const g = new THREE.ExtrudeGeometry(sh, { depth: w - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 });
    g.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))); g.translate(w / 2 - bevel, 0, 0); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; body.add(m); return m; };
  prof([[-2.12, 0.3], [-2.14, 0.74], [-1.72, 0.9], [0.98, 0.92], [1.98, 0.78], [2.14, 0.58], [2.12, 0.3], [1.72, 0.3], [1.6, 0.52], [1.0, 0.52], [0.88, 0.3], [-0.88, 0.3], [-1.0, 0.52], [-1.6, 0.52], [-1.72, 0.3]], 1.72, paint);
  prof([[-1.66, 0.9], [-1.12, 1.3], [0.22, 1.33], [0.92, 0.92]], 1.5, glass, 0.03);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.035, 1.3), paint); roof.position.set(0, 1.335, -0.46); body.add(roof);
  for (const z of [-1.13, 0.2]) for (const x of [-0.73, 0.73]) { const pl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.07), paint); pl.position.set(x, 1.11, z); pl.rotation.x = z < 0 ? -0.9 : 0.02; body.add(pl); }
  for (const x of [-0.6, 0.6]) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.04), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.15, 0.1) })); tl.position.set(x, 0.72, -2.15); body.add(tl); }
  const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.04), trim); grille.position.set(0, 0.5, 2.14); body.add(grille);
  body.visible = false; world.car.add(body); return { cover, body }; })();
const carBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 80, 10, 1, true), beamMat.clone()); carBeacon.material.color.setRGB(2, 0.9, 0.25); carBeacon.position.set(carHome.p.x, 40, carHome.p.z); carBeacon.layers.set(2); carBeacon.userData.noAO = true; carBeacon.visible = false; scene.add(carBeacon);
const headS = new THREE.SpotLight(0xfff0d0, 0, 45, 0.55, 0.6, 1.4); headS.position.set(0, 0.7, 2.0); headS.target.position.set(0, 0.1, 14);
const headL = [-0.55, 0.55].map(x => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 5) })); b.position.set(x, 0.68, 2.14); b.visible = false; world.car.add(b); return b; });
const carPath = new THREE.CatmullRomCurve3((world.carPath || [[-8.6, -3.4], [-8.3, -1.6], [-6.4, -0.3], [-3.6, 1.2], [-1.2, 4.2], [0, 9], [0, 16], [0, 30], [0, 60]]).map(p => new THREE.Vector3(p[0], 0, p[1])));
function startEscape() { phase = 'escape'; carBeacon.visible = true; banner('THE CITY IS SILENT', 'get to the car — follow the orange beam', 4); }
function tryEnterCar() { if (phase !== 'escape' || Math.hypot(P.pos.x - carHome.p.x, P.pos.z - carHome.p.z) > 4) return; phase = 'cine'; cine = { t: 0 }; carBeacon.visible = false; world.carCol.h = -1; document.body.classList.add('cine');
  ninja.root.visible = scarfMesh.visible = false; cam.fixed = true; carParts.cover.visible = false; carParts.body.visible = true; blobs.burst(v1.copy(carHome.p).setY(1), 26, C_DUST, { speed: 3, up: 3, life: 1.3, size: 0.6, gravity: -0.3, alpha: 0.2 }); world.car.add(headS, headS.target); headS.intensity = 900; for (const b of headL) b.visible = true; sfxTone({ dur: 2.5, f0: 40, f1: 95, vol: 0.5, type: 'sawtooth' }); sfxNoise({ dur: 2.5, f0: 200, f1: 900, q: 0.6, vol: 0.3, type: 'lowpass' }); }
function updateEscape(dt, time) {
  $('prompt').style.opacity = phase === 'escape' && Math.hypot(P.pos.x - carHome.p.x, P.pos.z - carHome.p.z) < 4 ? 1 : 0;
  if (phase !== 'cine') return; const c = cine; c.t += dt; const car = world.car;
  const u = clamp((c.t - 1.2) / 7.5, 0, 1), s = u * u * (1.4 - 0.4 * u) * 0.86; carPath.getPointAt(Math.min(s, 0.999), car.position); const tg = carPath.getTangentAt(Math.min(s, 0.999), v1); car.rotation.y = Math.atan2(tg.x, tg.z);
  car.position.y = c.t < 1.2 ? Math.sin(time * 60) * 0.004 : 0;
  if (c.t > 1.2 && Math.random() < 0.6) blobs.emit(v2.copy(car.position).addScaledVector(tg, -2).setY(0.2), v3.set(rand(-0.5, 0.5), rand(0.3, 1), rand(-0.5, 0.5)), C_STEAM, 1.2, 0.7, -0.3, 0.12);
  if (c.t < 3.4) { camera.position.set(2.6, 1.05, 0.4); camera.lookAt(car.position.x, 0.8, car.position.z); }
  else { camera.position.set(1.9, 0.75 + (c.t - 3.4) * 0.12, 6.5); camera.lookAt(v2.set(car.position.x, 1.0 + clamp((car.position.z - 10) * 0.25, 0, 9), Math.max(car.position.z, 8.5))); }
  if (camera.fov !== 46) { camera.fov = 46; camera.updateProjectionMatrix(); }
  finalPass.uniforms.uFade.value = clamp((9.6 - c.t) / 1.8, 0, 1);
  if (c.t > 9.8) { resetEscape(); endGame(true); }
}
function resetEscape() { phase = 'fight'; cine = null; wake = null; document.body.classList.remove('cine'); carBeacon.visible = false; world.car.position.copy(carHome.p); world.car.rotation.y = carHome.ry; world.carCol.h = carHome.h; cam.fixed = false; finalPass.uniforms.uFade.value = 1;
  ninja.root.visible = scarfMesh.visible = true; carParts.cover.visible = true; carParts.body.visible = false; headS.intensity = 0; world.car.remove(headS, headS.target); for (const b of headL) b.visible = false; $('prompt').style.opacity = 0; }

// ============================================================================ player update (ported)
function hurtPlayer(dmg, dir) {
  if (P.invuln > 0 || P.dead || P.ultState || locked()) return;
  if (P.block && dir && dir.dot(facingVec()) < 0.3) {   // guarded from the front: a fresh guard parries outright, a held one soaks most of it into stamina
    const perfect = P.blockT < 0.28, cp = chestPos().addScaledVector(facingVec(), 0.6), kd = dir.clone(); SFX.clang(); camShake = Math.max(camShake, perfect ? 0.3 : 0.18);
    sparks.burst(cp, perfect ? 46 : 18, perfect ? GOLD : C_SPARK, { speed: perfect ? 8 : 5, up: 2, life: 0.4, size: 0.05 });
    if (perfect) { hitstop = Math.max(hitstop, 0.07); spawnRing(P.pos, GOLD, 4, 0.3); P.invuln = 0.3; P.ult = Math.min(100, P.ult + 4); P.score += 25;
      for (const z of zombies) { if (!zOK(z) || z.T.scale >= 1.5) continue; tmpV.subVectors(z.root.position, P.pos).setY(0); const dd = tmpV.length(); if (dd < 3.4 && tmpV.dot(facingVec()) > 0) { z.state = 'stagger'; z.t = -0.7; z.flinch = 1; z.vel.addScaledVector(tmpV.normalize(), 7); } } return; }
    P.stamina = Math.max(0, P.stamina - dmg * 1.1); P.vel.addScaledVector(kd, 3); P.invuln = 0.2; P.hurtFlash = 0.3; P.hp -= dmg * 0.2;
    if (P.stamina <= 0) { P.exhausted = true; P.block = false; sfxTone({ dur: 0.3, f0: 300, f1: 70, vol: 0.3, type: 'sawtooth' }); banner('GUARD BROKEN', '', 0.9); }
    if (P.hp <= 0) { P.hp = 0; P.dead = true; P.deadT = 0; P.wall = null; } return; }
  P.hp -= dmg; P.invuln = 0.32; P.hurtFlash = 1; if (dir) P.vel.addScaledVector(dir, 9); camShake = Math.max(camShake, 0.5); SFX.hurt(); P.hits = 0;
  blobs.burst(v2.copy(P.pos).setY(P.pos.y + 1.2), 10, C_BLOOD, { speed: 2.5, up: 2, life: 0.7, size: 0.06, alpha: 0.95 });
  if (P.hp <= 0) { P.hp = 0; P.dead = true; P.deadT = 0; P.wall = null; }
}
function moveInput() { const f = camForward(), r = new THREE.Vector3(-f.z, 0, f.x), v = new THREE.Vector3(); if (locked()) return v;
  if (keys.KeyW || keys.ArrowUp) v.add(f); if (keys.KeyS || keys.ArrowDown) v.sub(f); if (keys.KeyD) v.add(r); if (keys.KeyA) v.sub(r); return v.lengthSq() > 0 ? v.normalize() : v; }
const GRAV = 34, WALK = 9, SPRINT = 19, WALL_TIME = 1.4, LIM = world.limits || { minX: -12.6, maxX: 12.6, minZ: -32.4, maxZ: 21.2 };
function updatePlayer(dt) {
  for (const k in P.cd) P.cd[k] = Math.max(0, P.cd[k] - dt);
  P.atkCd -= dt; P.comboTimer -= dt; P.atkTimer -= dt; P.invuln -= dt; P.wallCd -= dt; P.hurtFlash = Math.max(0, P.hurtFlash - dt * 2.5); P.hitT -= dt; if (P.hitT <= 0) P.hits = 0;
  if (chronoT > 0) chronoT -= dt;
  if (P.poison > 0 && !P.dead) { P.poison -= dt; P.hp -= 4 * dt; if (P.hp <= 0) { P.hp = 0; P.dead = true; P.deadT = 0; } }
  if (P.dead) { P.vel.x = damp(P.vel.x, 0, 6, dt); P.vel.z = damp(P.vel.z, 0, 6, dt); P.vel.y -= GRAV * dt; P.pos.addScaledVector(P.vel, dt); const g = groundHeightAt(P.pos.x, P.pos.z, P.pos.y); if (P.pos.y <= g) { P.pos.y = g; P.vel.y = 0; P.onGround = true; } return; }
  if (P.queued && P.atkCd <= 0) trySlash();
  if (mouse.left && P.atkCd <= 0 && !P.queued) trySlash();
  if (keys.ArrowLeft) camYaw += 2.5 * dt; if (keys.ArrowRight) camYaw -= 2.5 * dt;
  if (P.stamina <= 0) P.exhausted = true; if (P.exhausted && P.stamina >= 40) P.exhausted = false;
  const guard = mouse.right && !P.exhausted && !P.ultState && P.dash <= 0 && P.atkTimer <= 0 && P.storm <= 0 && !locked();   // hold right mouse: guard
  if (guard && !P.block) { P.blockT = 0; sfxTone({ dur: 0.07, f0: 700, f1: 1100, vol: 0.12, type: 'triangle' }); } P.block = guard; if (guard) P.blockT += dt;
  if (P.ultState) { updateUlt(dt); P.vel.set(0, 0, 0); return; }
  const move = moveInput();
  const wantSprint = (keys.ShiftLeft || keys.ShiftRight) && move.lengthSq() > 0 && !P.exhausted && !P.block; P.sprinting = wantSprint;
  if (wantSprint) P.stamina = Math.max(0, P.stamina - 22 * dt); else P.stamina = Math.min(100, P.stamina + (P.block ? 5 : P.onGround ? 26 : 12) * dt);
  const speed = P.block ? 3.6 : wantSprint ? SPRINT : WALK;
  if (P.dash > 0) {
    P.dash -= dt; const before = chestPos(); for (let q = 0; q < 4; q++) { P.pos.addScaledVector(P.dashDir, 85 * dt / 4); resolveCircle(P.pos, P.r); } P.vel.set(P.dashDir.x * 20, 0, P.dashDir.z * 20);
    for (const z of [...zombies]) { if (P.dashHit.has(z) || !zOK(z)) continue; if (z.root.position.distanceTo(P.pos) < 2.6) { P.dashHit.add(z); damageZombie(z, 70, P.dashDir.clone().add(new THREE.Vector3(rand(-.5, .5), 0, rand(-.5, .5))).normalize(), 10, 'dash'); } }
    spawnGhost(); spawnStreak(before, chestPos(), CYAN, 0.12, 0.4);
    if (P.dash <= 0) { spawnArc({ pos: chestPos(), yaw: P.facing, color: CYAN, outer: 3.6, dur: 0.25 }); P.atkTimer = P.atkDur; P.combo = 0; P.throwAnim = 0; SFX.slash();   // the dash ends in a cut
      for (const z of [...zombies]) { if (!zOK(z) || P.dashHit.has(z)) continue; tmpV.subVectors(z.root.position, P.pos).setY(0); const d = tmpV.length(); if (d < 3.6 && (d < 0.8 || tmpV.dot(P.dashDir) / d > 0)) damageZombie(z, 40, tmpV.clone().normalize(), 8, 'slash'); } }
  } else {
    const accel = P.onGround ? 14 : (P.wall ? 10 : 4);
    if (!(P.lungeT > 0)) { P.vel.x = damp(P.vel.x, move.x * speed, accel, dt); P.vel.z = damp(P.vel.z, move.z * speed, accel, dt); } else P.lungeT -= dt;
    if (P.wall) {
      P.wallTime -= dt; const w = nearWall(P.pos);
      if (!w || P.wallTime <= 0 || P.onGround || move.lengthSq() === 0) { if (P.wallUp && !w) { P.vel.y = 9; P.vel.addScaledVector(facingVec(), 4); } P.wall = null; P.wallCd = 0.35; }
      else { P.wall = w; const n = new THREE.Vector3(w.nx, 0, w.nz);
        if (P.wallUp) { P.vel.set(-n.x * 2, 10.5 * Math.min(1, P.wallTime / 0.3 + 0.3), -n.z * 2); P.facing = yawOf(n.clone().negate()); }
        else { const tdir = new THREE.Vector3(-n.z, 0, n.x); if (tdir.dot(P.vel) < 0) tdir.negate(); const sp = Math.max(SPRINT * 0.9, Math.hypot(P.vel.x, P.vel.z));
          P.vel.x = tdir.x * sp - n.x * 2; P.vel.z = tdir.z * sp - n.z * 2; P.vel.y = damp(P.vel.y, 1.2 - (WALL_TIME - P.wallTime) * 2.2, 6, dt); P.facing = yawOf(tdir); }
        if (Math.random() < 0.7) pEmit(sparks, P.pos.x - n.x * 0.4, P.pos.y + 0.2, P.pos.z - n.z * 0.4, n.x, 1, n.z, 0.3, 1.5, 2.5, 0.25, 0.4); }
    } else if (!P.onGround && P.wallCd <= 0 && move.lengthSq() > 0 && P.pos.y > groundHeightAt(P.pos.x, P.pos.z, P.pos.y) + 0.6) {
      const w = nearWall(P.pos);
      if (w) { const into = -move.dot(new THREE.Vector3(w.nx, 0, w.nz)); P.wall = w; P.wallTime = WALL_TIME; P.wallUp = into > 0.8; P.jumps = 1; if (!P.wallUp) P.vel.y = Math.max(P.vel.y, 4); SFX.jump(); }
    }
    if (!P.wall) P.vel.y -= GRAV * dt;
    P.pos.addScaledVector(P.vel, dt);
  }
  if (P.storm > 0) { P.storm -= dt; P.stormTick -= dt;
    if (P.stormTick <= 0) { P.stormTick = 0.15; for (const z of [...zombies]) { tmpV.subVectors(z.root.position, P.pos); const dy = Math.abs(tmpV.y); tmpV.y = 0; if (tmpV.length() < 5.5 && dy < 3 && zOK(z)) damageZombie(z, 18, tmpV.clone().normalize(), 5, 'storm'); } pBurst(sparks, chestPos(), 16, 14, CYAN, 0.3, 0.3); } }
  const hit = resolveCircle(P.pos, P.r); if (hit && P.dash > 0) P.dash = 0.001;
  P.pos.x = clamp(P.pos.x, LIM.minX, LIM.maxX); P.pos.z = clamp(P.pos.z, LIM.minZ, LIM.maxZ);
  { const cl = ceilAt(P.pos.x, P.pos.z, P.pos.y); if (P.pos.y + 1.75 > cl) { P.pos.y = cl - 1.75; if (P.vel.y > 0) P.vel.y = 0; } }   // ceilings
  const gy = groundHeightAt(P.pos.x, P.pos.z, P.pos.y);
  if (P.onGround && P.vel.y <= 0 && P.pos.y > gy && P.pos.y - gy < 0.55 && !P.wall) P.pos.y = gy;   // stay glued to stairs and kerbs on the way down
  if (P.pos.y <= gy) {
    if (!P.onGround && P.vel.y < -16) { spawnRing(P.pos, CYAN, 3, 0.3); camShake = Math.max(camShake, 0.1); }
    if (!P.onGround && P.vel.y < -17 && P.combo === 2 && P.atkTimer > -0.3) { spawnRing(P.pos, MAGENTA, 7, 0.45); SFX.boom(); for (const z of [...zombies]) { const d = z.root.position.distanceTo(P.pos); if (d < 6 && zOK(z)) damageZombie(z, 40, tmpV.subVectors(z.root.position, P.pos).setY(0).normalize().clone(), 12, 'slash'); } }
    P.pos.y = gy; P.vel.y = Math.max(0, P.vel.y); P.onGround = true; P.jumps = 2; P.wall = null;
  } else if (P.pos.y > gy + 0.05) P.onGround = false;
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (P.block && !P.wall) P.facing = angDamp(P.facing, yawOf(camForward()), 16, dt);   // the guard faces where you look
  else if (!P.wall && P.atkTimer <= 0 && P.storm <= 0 && hs > 0.5 && move.lengthSq() > 0) P.facing = angDamp(P.facing, yawOf(move), 14, dt);
  if (P.sprinting && hs > 12) { if (Math.random() < 0.5) pEmit(sparks, P.pos.x + rand(-.3, .3), P.pos.y + rand(0.2, 1.6), P.pos.z + rand(-.3, .3), -P.vel.x * 0.1, 0.2, -P.vel.z * 0.1, 0.2, 1.2, 2, 0.35, 0.35); P.trailT = (P.trailT || 0) - dt; if (P.trailT <= 0) { P.trailT = 0.1; if (Q.ghosts) spawnGhost(); } }
}
const _bt = new THREE.Vector3(), _bb = new THREE.Vector3();
function animateNinja(dt, time) {
  const hs = Math.hypot(P.vel.x, P.vel.z); P.animT += dt * (4 + hs * 0.75); ninja.root.position.copy(P.pos); ninja.root.rotation.y = P.facing;
  const waking = phase === 'wake' && wake && wake.t < 4.6, flipping = !P.onGround && P.jumps < 1 && P.vel.y > 0 && !P.dead && !P.wall && !waking;
  const wall = P.wall ? (P.wallUp ? 'up' : (Math.sign(new THREE.Vector3(P.wall.nx, 0, P.wall.nz).cross(facingVec()).y) || 1)) : 0, swing = P.atkTimer > 0;
  ninja.update({ dt, time, speed: hs, walk: WALK, sprinting: P.sprinting, onGround: P.onGround || waking, flip: flipping ? (P.animT * 2) % (Math.PI * 2) + 0.001 : 0, wall,
    atk: swing ? { combo: P.combo, t: clamp(1 - P.atkTimer / P.atkDur, 0, 1), throwing: P.throwAnim > 0 } : null, block: P.block && !swing, dash: P.dash > 0, storm: P.storm > 0,
    dead: P.dead ? clamp(P.deadT * 2.2, 0.02, 1) : 0, wake: waking ? clamp((wake.t - 2.7) / 0.9, 0, 1) : null });
  if (P.throwAnim > 0) P.throwAnim -= dt;
  ninja.sword.updateMatrixWorld(true); if ((swing && !(P.throwAnim > 0)) || P.dash > 0 || P.storm > 0) bladeTrail.push(ninja.bladeBase(_bb), ninja.bladeTip(_bt), time); bladeTrail.update(time, 0.2);
  if (phase !== 'cine') ninja.root.visible = !(P.hurtFlash > 0.5 && Math.floor(time * 30) % 2 === 0);
}

// ============================================================================ camera (original feel: wide FOV, speed kick)
const camPos = new THREE.Vector3(0, 5, 25); let camFov = 70;
function updateCamera(dt) {
  if (cam.fixed) return; camPitch = clamp(camPitch, -0.35, 1.25);
  const cl = ceilAt(P.pos.x, P.pos.z, P.pos.y - 0.6), target = P.pos.clone().add(new THREE.Vector3(0, 1.7, 0)); target.y = Math.min(target.y, cl - 0.45); const back = new THREE.Vector3(Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), Math.cos(camYaw) * Math.cos(camPitch));
  let dist = 5.6; for (let s = 0.4; s <= 5.6; s += 0.15) if (camBlocked(target.x + back.x * s, target.y + back.y * s, target.z + back.z * s, 0.3)) { dist = Math.max(1.0, s - 0.35); break; }
  const want = target.clone().addScaledVector(back, dist);
  { const g = groundHeightAt(want.x, want.z, Math.min(want.y, target.y)); if (g <= target.y + 0.2) want.y = Math.max(g + 0.5, want.y); }   // stay above the ground the player could stand on — never hop onto wall tops or the storey above
  want.y = Math.min(want.y, cl - 0.3, ceilAt(want.x, want.z, P.pos.y - 0.6) - 0.3);   // and under the ceiling
  camPos.lerp(want, 1 - Math.exp(-(P.ultState ? 8 : 20) * dt)); camera.position.copy(camPos);
  if (camShake > 0) { camera.position.add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(camShake * 0.35)); camShake = Math.max(0, camShake - dt * 2.2); }
  camera.lookAt(target);
  if (camPos.distanceTo(target) < 1.4) ninja.root.visible = false; scarfMesh.visible = ninja.root.visible;
  const hs = Math.hypot(P.vel.x, P.vel.z), fovT = 70 + (P.sprinting ? 14 : 0) + (P.dash > 0 ? 18 : 0) + (P.wall ? 6 : 0) + Math.min(hs, 20) * 0.2;
  camFov = damp(camFov, fovT, 6, dt); camera.fov = camFov; camera.updateProjectionMatrix();
}
function titleCamera(time) { if (cam.fixed) return; const t = time * 0.045; camera.position.set(Math.sin(t * 2.3) * 2.2, 1.35 + Math.sin(t * 1.7) * 0.5, 17 - (Math.sin(t) * 0.5 + 0.5) * 20); camera.lookAt(Math.sin(t * 1.3) * 1.5, 2.6, camera.position.z - 12); if (camera.fov !== 58) { camera.fov = 58; camera.updateProjectionMatrix(); } }

// ============================================================================ waves (kill goals, continuous spawning), HUD, flow
const FINAL_WAVE = 9; let state = 'load', wave = 1, spawnTimer = 0, waveDelay = 0, gameTime = 0, bannerT = 0;
const waveGoal = () => 10 + wave * 6;
function banner(big, small = '', dur = 2) { $('banner').innerHTML = `${big}<small>${small}</small>`; $('banner').style.opacity = 1; bannerT = dur; }
function losClear(x0, z0, x1, z1, y = 0) { const d = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(d / 0.8); for (let i = 1; i < n; i++) { const u = i / n; if (insideWall(x0 + (x1 - x0) * u, z0 + (z1 - z0) * u, 0.1, y)) return false; } return true; }
function spawnPoint() {
  if (NAV && inHosp(P.pos) && P.pos.y < HOSP.h + 3) { const sp = NAV.spawn(); if (sp && Math.random() < 0.85) return sp; }
  for (let i = 0; i < 80; i++) { const a = Math.random() * 6.283, r = rand(9, 26), x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (x > LIM.minX + 1 && x < LIM.maxX - 1 && z > LIM.minZ + 1 && z < LIM.maxZ - 1 && !blocked(x, z, 0.6) && (P.pos.y > 2 || i > 60 || losClear(x, z, P.pos.x, P.pos.z))) return [x, z]; }
  return null;
}
function updateWaves(dt) {
  if (phase !== 'fight' || P.dead) return;
  if (waveDelay > 0) { waveDelay -= dt; return; }
  if (waveKills >= waveGoal()) {
    if (wave >= FINAL_WAVE) { if (!zombies.length) startEscape(); else for (const z of zombies) if (zOK(z)) damageZombie(z, 9999, v1.set(0, 0, 0), 0, 'ult'); return; }
    wave++; waveKills = 0; waveDelay = 3;
    if (wave === 4) { resetScrolls(7); after(4.2, () => { if (phase === 'fight') banner('ABILITY SCROLLS', 'golden beams mark them on the rooftops — grab them', 3.5); }); }
    if (wave >= 2) P.unlock.shuriken = true; if (wave >= 4) P.unlock.storm = true; if (wave >= 5) P.unlock.ult = true;
    const unlockMsg = wave === 2 ? 'SHURIKEN unlocked — press F' : wave === 4 ? 'BLADE STORM unlocked — press E' : wave === 5 ? '1000 BLADES unlocked — press R' : null;
    const NEWZ = { 2: 'RUNNERS · they sprint', 3: 'IMPS · small, fast, circling', 4: 'SPITTERS · bat the acid back', 5: 'BRUTES · heavy hitters', 6: 'EXPLODERS · kill them at range', 7: 'LEAPERS · they jump from afar', 8: 'ARMOURED · shuriken barely scratch them', 9: 'TITANS · stay out of reach' };
    after(unlockMsg ? 3.8 : 2.8, () => { if (phase === 'fight' && NEWZ[wave]) banner('NEW THREAT', NEWZ[wave], 2.6); });
    banner(wave === FINAL_WAVE ? 'FINAL WAVE' : `WAVE ${wave}`, unlockMsg || (wave === FINAL_WAVE ? 'survive — then escape' : wave >= 5 ? 'the ground is shaking...' : 'the horde grows stronger'), unlockMsg ? 3.5 : 2.5);
    SFX.wave(); world.flash(); if (wave >= 5) collapseArm = 3.5; P.hp = Math.min(P.maxHp, P.hp + 12); return;
  }
  const maxAlive = Math.min(8 + wave * 2, Q.maxZ || 20); spawnTimer -= dt;
  if (zombies.length < maxAlive && spawnTimer <= 0) { spawnTimer = Math.max(0.14, 0.7 - wave * 0.07);
    const table = [['walker', 1], ['runner', wave >= 2 ? 0.6 : 0], ['imp', wave >= 3 ? (wave === 3 ? 0.9 : 0.5) : 0], ['spitter', wave >= 4 ? 0.35 : 0], ['brute', wave >= 5 ? 0.15 + (wave - 5) * 0.03 : 0], ['exploder', wave >= 6 ? 0.35 : 0], ['leaper', wave >= 7 ? 0.4 : 0], ['armored', wave >= 8 ? 0.28 : 0], ['titan', wave >= 9 && zombies.filter(q => q.type === 'titan').length < 3 ? 0.14 : 0]]; let roll = Math.random() * table.reduce((a, b) => a + b[1], 0), type = 'walker';
    for (const [k, w] of table) if ((roll -= w) <= 0) { type = k; break; }
    const sp = spawnPoint(); if (sp) spawnZombie(type, sp[0], sp[1], sp[2] || 0); }
}
const radar = $('radar').getContext('2d');
function drawRadar() {
  const R = 70, S = 60 / R; radar.clearRect(0, 0, 150, 150); radar.fillStyle = 'rgba(10,10,14,0.6)'; radar.beginPath(); radar.arc(75, 75, R, 0, 7); radar.fill(); radar.strokeStyle = 'rgba(255,255,255,0.3)'; radar.lineWidth = 1; radar.stroke();
  const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = -fz, rz = fx, plot = (x, z) => { const dx = x - P.pos.x, dz = z - P.pos.z, sx = (dx * rx + dz * rz) / S, sy = -(dx * fx + dz * fz) / S; return sx * sx + sy * sy < R * R ? [75 + sx, 75 + sy] : null; };
  for (const z of zombies) { const p = plot(z.root.position.x, z.root.position.z); if (p) { radar.fillStyle = ({ brute: '#b070ff', runner: '#ffb030', spitter: '#7be03a', imp: '#ff6ad0', exploder: '#ffd23a', leaper: '#4fe0c0', armored: '#d0d4dc', titan: '#ff2020' })[z.type] || '#ff5a5a'; radar.beginPath(); radar.arc(p[0], p[1], 1.4 + z.T.scale * 1.2, 0, 7); radar.fill(); } }
  if (phase === 'escape') { const dx = carHome.p.x - P.pos.x, dz = carHome.p.z - P.pos.z, d = Math.hypot(dx, dz), k = Math.min(1, 58 / (d || 1)), p = plot(P.pos.x + dx * k, P.pos.z + dz * k); if (p) { radar.fillStyle = '#ff7a1a'; radar.fillRect(p[0] - 5, p[1] - 3, 10, 6); } }
  radar.fillStyle = '#ffd24a'; for (const s of scrolls) { if (s.taken) continue; const dx = s.x - P.pos.x, dz = s.z - P.pos.z, d = Math.hypot(dx, dz), k = Math.min(1, 62 / (d || 1)), p = plot(P.pos.x + dx * k, P.pos.z + dz * k); if (p) { radar.save(); radar.translate(p[0], p[1]); radar.rotate(Math.PI / 4); radar.fillRect(-3, -3, 6, 6); radar.restore(); } }
  if (Math.floor(time * 5) % 2) for (const b of world.buildings) if (b.state === 1 && !b.hit) { const p = plot((b.lz.minX + b.lz.maxX) / 2, (b.lz.minZ + b.lz.maxZ) / 2); if (p) { radar.fillStyle = '#ff2a2a'; radar.fillRect(p[0] - 5, p[1] - 5, 10, 10); } }
  radar.fillStyle = '#fff'; radar.beginPath(); radar.moveTo(75, 69); radar.lineTo(80, 80); radar.lineTo(75, 77); radar.lineTo(70, 80); radar.closePath(); radar.fill();
}
const hudAb = Object.fromEntries(['slash', 'shuriken', 'dash', 'storm', 'ult', 'lightning', 'chrono', 'fire'].map(k => [k, $('ab-' + k)]));
function updateHUD(dt) {
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (frameN % 5) return;
  $('waveBar').firstElementChild.style.width = clamp(waveKills / waveGoal(), 0, 1) * 100 + '%'; $('waveJa').textContent = '第' + '一二三四五六七八九'[wave - 1] + '波';
  $('time').textContent = `${Math.floor(gameTime / 60)}:${String(Math.floor(gameTime % 60)).padStart(2, '0')}`;
  $('hpBar').querySelector('i').style.width = P.hp + '%'; $('stBar').querySelector('i').style.width = P.stamina + '%'; $('stBar').classList.toggle('exhausted', P.exhausted); $('ultBar').querySelector('i').style.width = P.ult + '%'; $('ultBar').classList.toggle('ready', P.ult >= 100 && P.unlock.ult);
  $('wave').textContent = wave; $('kills').textContent = kills; $('left').textContent = Math.max(0, waveGoal() - waveKills);
  $('combo').style.opacity = P.hits > 1 ? 1 : 0; $('comboN').textContent = P.hits;
  const setAb = (k, frac, locked, hide) => { const el = hudAb[k]; el.classList.toggle('locked', !!hide); el.classList.toggle('lock', !!locked); el.querySelector('.cd').style.height = clamp(frac, 0, 1) * 100 + '%'; };
  setAb('slash', P.atkCd > 0 ? 1 : 0); setAb('shuriken', P.cd.shuriken / P.max.shuriken, !P.unlock.shuriken); setAb('dash', P.cd.dash / P.max.dash); setAb('storm', P.cd.storm / P.max.storm, !P.unlock.storm);
  setAb('ult', 1 - P.ult / 100, !P.unlock.ult); for (const k of ['lightning', 'chrono', 'fire']) setAb(k, P.cd[k] / P.max[k], false, !P.abil[k]);
  $('wallrun').style.opacity = P.wall ? 1 : 0; $('wallrun').querySelector('i').style.width = clamp(P.wallTime / WALL_TIME, 0, 1) * 100 + '%';
  drawRadar();
}
function resetGame() {
  for (const z of zombies) scene.remove(z.root); zombies.length = 0; for (const p of projectiles) scene.remove(p.m); projectiles.length = 0; for (const f of fireballs) scene.remove(f.m); fireballs.length = 0; for (const a of acids) scene.remove(a.m); acids.length = 0; later.length = 0;
  Object.assign(P, { unlock: { shuriken: false, storm: false, ult: false }, abil: { lightning: false, chrono: false, fire: false }, poison: 0, exhausted: false, hp: 100, stamina: 100, ult: 0, score: 0, hits: 0, dead: false, wall: null, dash: 0, storm: 0, ultState: null, invuln: 1, combo: 0, atkTimer: 0, atkCd: 0, queued: false, facing: Math.PI, onGround: true, jumps: 2, lungeT: 0 });
  for (const k in P.cd) P.cd[k] = 0; P.pos.set(0, 0, 14); P.vel.set(0, 0, 0); camYaw = 0; camPitch = 0.2; camShake = 0; chronoT = 0; hitstop = 0; mouse.left = mouse.right = false; P.block = false;
  wave = 1; kills = 0; waveKills = 0; gameTime = 0; waveDelay = 1.5; spawnTimer = 0; resetScrolls(0); resetCollapse(); resetEscape();
  ninja.root.position.copy(P.pos); ninja.root.rotation.y = P.facing; resetScarf(); camPos.set(0, 3, 20);
}
function show(id) { for (const s of ['start', 'pause', 'over', 'victory']) $(s).style.display = s === id ? 'flex' : 'none'; }
const musicMode = () => state === 'play' && phase === 'fight' && !P.dead ? (zombies.length ? 2 : 1) : state === 'play' ? 1 : 0;
function startGame(lock = true) { initAudio(); initMusic(); resetGame(); state = 'play'; show(null); $('hud').style.display = 'block'; if (lock) askLock(); startWake(); }
function endGame(win) {
  state = win ? 'win' : 'over'; document.exitPointerLock?.(); $('hud').style.display = 'none';
  const stats = `WAVE ${wave} · ${kills} KILLS · ${Math.floor(gameTime / 60)}:${String(Math.floor(gameTime % 60)).padStart(2, '0')}`;
  if (win) { $('vStats').textContent = stats; show('victory'); } else { $('overStats').textContent = stats; show('over'); }
}
function setPaused(p) { if (p && state === 'play') { state = 'pause'; music.duck = 0.4; show('pause'); document.exitPointerLock?.(); } else if (!p && state === 'pause') { state = 'play'; music.duck = 1; show(null); askLock(); } }
let noLock = false; const lockOK = () => !!document.pointerLockElement || noLock;
function askLock() { try { const p = renderer.domElement.requestPointerLock?.(); if (p && p.catch) p.catch(() => { noLock = true; }); else if (!renderer.domElement.requestPointerLock) noLock = true; } catch (e) { noLock = true; } }
document.addEventListener('pointerlockerror', () => { noLock = true; });
addEventListener('keydown', (e) => { keys[e.code] = true; if (state !== 'play') return;
  if (e.code === 'Escape' || e.code === 'KeyP') { setPaused(true); return; }
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) tryJump(); }
  if (e.repeat) return;
  if (e.code === 'KeyQ') tryDash(); if (e.code === 'KeyE') tryStorm(); if (e.code === 'KeyR') tryUlt(); if (e.code === 'KeyF') tryShuriken(); if (e.code === 'KeyG') tryEnterCar();
  if (e.code === 'Digit1') tryLightning(); if (e.code === 'Digit2') tryChrono(); if (e.code === 'Digit3') tryFire(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.left = mouse.right = false; });
renderer.domElement.addEventListener('mousedown', (e) => { if (state !== 'play') return; if (!lockOK()) { askLock(); return; } if (e.button === 0) { mouse.left = true; trySlash(); } else if (e.button === 2) mouse.right = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { if (state !== 'play' || !lockOK()) return; camYaw -= e.movementX * 0.0026 * sens; camPitch += e.movementY * 0.0022 * sens; });
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && state === 'play' && !dbg.manual && !noLock) setPaused(true); });
$('play').onclick = () => startGame(); $('again').onclick = () => startGame(); $('vAgain').onclick = () => startGame(); $('resume').onclick = () => setPaused(false); $('restart').onclick = () => startGame();
$('sens').value = sens; $('sensV').textContent = sens.toFixed(1); $('sens').oninput = (e) => { sens = +e.target.value; $('sensV').textContent = sens.toFixed(1); store('ns_sens', sens); };
for (const b of document.querySelectorAll('.seg[data-q]')) { b.classList.toggle('on', b.dataset.q === qName); b.onclick = () => { store('ns_quality', b.dataset.q); const u = new URL(location.href); u.searchParams.delete('q'); location.href = u.href; }; }
$('sfx').value = sfxVol; $('sfxV').textContent = Math.round(sfxVol * 100); $('sfx').oninput = (e) => { sfxVol = +e.target.value; $('sfxV').textContent = Math.round(sfxVol * 100); store('ns_sfx', sfxVol); if (master) master.gain.value = 0.4 * sfxVol * 1.6; };
$('mus').value = music.vol; $('musV').textContent = Math.round(music.vol * 100); $('mus').oninput = (e) => { music.vol = +e.target.value; $('musV').textContent = Math.round(music.vol * 100); store('ns_mus', music.vol); };
let showFps = store('ns_fps') === '1'; const fpsEl = $('fps');
const syncFps = () => { fpsEl.style.display = showFps ? 'block' : 'none'; $('fpsToggle').textContent = showFps ? 'ON' : 'OFF'; $('fpsToggle').classList.toggle('on', showFps); }; syncFps();
$('fpsToggle').onclick = () => { showFps = !showFps; store('ns_fps', showFps ? '1' : '0'); syncFps(); };

// ============================================================================ main loop
let time = 0, steamT = 0, fpsAcc = 0, fpsN = 0, drsT = 0;
function tick(rawDt, render = true) {
  let dt = rawDt; if (hitstop > 0) { hitstop -= rawDt; dt = rawDt * 0.06; }
  time += rawDt; frameN++;
  if (state === 'play') {
    gameTime += dt; if (P.dead) { P.deadT += rawDt; if (P.deadT > 1.8) endGame(false); }
    for (let i = later.length - 1; i >= 0; i--) if ((later[i].t -= dt) <= 0) { const f = later[i].fn; later.splice(i, 1); f(); }
    updatePlayer(dt); animateNinja(dt, time); updateScarf(dt, time); updateZombies(dt, time); updateProjectiles(dt); updateFireballs(dt); updateAcid(dt); updateScrolls(dt); updateCollapse(dt); updateDebris(dt); updateEscape(dt, time); updateWake(dt); updateWaves(dt); updateCamera(dt); updateHUD(rawDt);
  } else if (state !== 'pause') { if (state === 'title') titleCamera(time); else updateCamera(dt); animateNinja(dt, time); updateScarf(dt, time); updateZombies(dt, time); }
  if (state !== 'pause') {
    updateVfx(dt); world.update(dt, time, P.pos); sparks.update(dt); blobs.update(dt); steam.update(dt);
    steamT -= dt; if (steamT <= 0) { steamT = 0.07; for (const p of world.steamPoints) if (Math.abs(p.x - P.pos.x) + Math.abs(p.z - P.pos.z) < 60) steam.emit(v1.set(p.x + rand(-0.15, 0.15), p.y, p.z + rand(-0.15, 0.15)), v2.set(rand(-0.15, 0.35), rand(0.5, 0.9), rand(-0.15, 0.15)), C_STEAM, rand(2.5, 4.5), rand(0.5, 0.9), -0.05, 0.05); }
  }
  rain.mesh.visible = !(HOSP && inHosp(camera.position) && camera.position.y < HOSP.h - 0.2); rain.update(time, camera);
  const U = finalPass.uniforms; U.uTime.value = time; U.uHurt.value = P.hurtFlash * 0.8 + (P.hp < 30 && state === 'play' ? 0.25 + 0.1 * Math.sin(time * 6) : 0) + (P.poison > 0 ? 0.1 : 0);
  U.uDash.value = damp(U.uDash.value, P.dash > 0 ? 1 : 0, 10, rawDt); U.uGray.value = damp(U.uGray.value, P.dead ? 1 : 0, 2, rawDt); U.uChrono.value = damp(U.uChrono.value, chronoT > 0 ? 1 : 0, 6, rawDt);
  if (render) composer.render(rawDt);
}
const dbg = window.__dbg = { scarfMesh, NAV, renderer, scene, composer, sparks, blobs, manual: params.has("manual"), P, cam, zombies, camera, world, tick, startGame, spawnZombie, trySlash, tryDash, tryShuriken, tryStorm, tryUlt, tryLightning, tryChrono, tryFire, tryJump, tryEnterCar, startEscape, startCollapse, resetScrolls, scrolls, keys, mouse, ninja,
  setCam(px, py, pz, tx, ty, tz, fov = 58) { cam.fixed = true; camera.position.set(px, py, pz); camera.lookAt(tx, ty, tz); camera.fov = fov; camera.updateProjectionMatrix(); },
  look(yaw, pitch) { camYaw = yaw; camPitch = pitch; }, setWave(w) { wave = w; waveKills = 0; P.unlock.shuriken = w >= 2; P.unlock.storm = w >= 4; P.unlock.ult = w >= 5; }, get wave() { return wave; }, get phase() { return phase; }, get waveKills() { return waveKills; }, set waveKills(v) { waveKills = v; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) tick(dt, i === n - 1); }, get state() { return state; }, info: renderer.info };
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop); if (dbg.manual) return;
  const raw = (now - last) / 1000; last = now; tick(Math.min(raw, 0.05));
  fpsAcc += raw; fpsN++; drsT += raw;
  if (fpsAcc > 0.5) { const fps = fpsN / fpsAcc; if (showFps) fpsEl.textContent = `${fps.toFixed(0)} fps · ${qName} · ${(Q.pr * drs).toFixed(2)}x · ${renderer.info.render.calls} calls`;
    if (drsT > 1.5 && state === 'play') { if (fps < 55 && drs > 0.5) { drs = Math.max(0.5, drs - (fps < 40 ? 0.2 : 0.1)); resize(); drsT = 0; } else if (fps > 59.3 && drs < 1) { drs = Math.min(1, drs + 0.06); resize(); drsT = 0; } }
    fpsAcc = 0; fpsN = 0; }
}
resetGame(); state = 'title'; tick(1 / 60);
$('loading').style.display = 'none'; show('start'); window.DONE = true;
requestAnimationFrame(loop);
