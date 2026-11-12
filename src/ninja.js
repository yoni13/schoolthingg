// The shinobi: a skinned, motion-captured body (idle / walk / run) dressed in armour, with the arms solved by IK so that both hands
// really hold the katana. Stances and cuts are authored as sword poses (where the hilt is, where the blade points, which way the edge
// faces) in character space; the arms follow.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion(), v1 = V(), v2 = V(), v3 = V(), v4 = V(), v5 = V(), m1 = new THREE.Matrix4();
// character space: +z forward, +y up, the right hand is on -x. R(right, up, forward) keeps the pose tables readable.
const R = (r, u, f) => V(-r, u, f);

function aimBone(bone, dirW, w = 1) {   // swing a bone (its +Y runs to its child) so that it points along a world direction
  bone.parent.getWorldQuaternion(q1); bone.getWorldQuaternion(q2);
  v1.set(0, 1, 0).applyQuaternion(q2); q3.setFromUnitVectors(v1, dirW).multiply(q2);
  q3.premultiply(q1.invert()); bone.quaternion.slerp(q3, w); bone.updateMatrixWorld(true);
}
function setWorldQuat(bone, qW, w = 1) { bone.parent.getWorldQuaternion(q1); q3.copy(q1.invert()).multiply(qW); bone.quaternion.slerp(q3, w); bone.updateMatrixWorld(true); }
function twistWorld(bone, axisW, angle) { if (Math.abs(angle) < 1e-4) return; bone.parent.getWorldQuaternion(q1); bone.getWorldQuaternion(q2); q3.setFromAxisAngle(axisW, angle).multiply(q2).premultiply(q1.invert()); bone.quaternion.copy(q3); bone.updateMatrixWorld(true); }
// quaternion whose +Y is `tip` and whose +Z is as close to `edge` as it can be
function frame(tip, edge, out) { const y = v1.copy(tip).normalize(), z = v2.copy(edge).addScaledVector(y, -edge.dot(y)).normalize(), x = v3.crossVectors(y, z); m1.makeBasis(x, y, z); return out.setFromRotationMatrix(m1); }

export function createNinja({ gltf, katana, tex, envMapIntensity = 1.3 }) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const model = cloneSkinned(gltf.scene); body.add(model);
  const B = {}; model.traverse(o => { if (o.isBone) B[o.name.replace(/^mixamorig:?/, '')] = o; });
  // ------------------------------------------------------------------ materials
  const M = (o) => new THREE.MeshStandardMaterial({ envMapIntensity, ...o });
  const rep = (t, n) => { if (!t) return null; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(n, n); c.needsUpdate = true; return c; };
  const cloth = M({ color: 0x1b1d24, roughness: 0.9, map: rep(tex.clothD, 9), normalMap: rep(tex.clothN, 9), normalScale: new THREE.Vector2(0.9, 0.9) });
  const cloth2 = M({ color: 0x2a2d37, roughness: 0.85, map: rep(tex.clothD, 5), normalMap: rep(tex.clothN, 5) });
  const leather = M({ color: 0x4a3a30, roughness: 0.6, map: rep(tex.leatherD, 2), normalMap: rep(tex.leatherN, 2), roughnessMap: rep(tex.leatherR, 2) });
  const armor = M({ color: 0x23262d, roughness: 0.32, metalness: 0.92, envMapIntensity: envMapIntensity * 1.6 }), trim = M({ color: 0xb08a3a, metalness: 1, roughness: 0.3, envMapIntensity: envMapIntensity * 1.6 });
  const red = M({ color: 0x8e1020, roughness: 0.75, map: rep(tex.clothD, 4), normalMap: rep(tex.clothN, 4) }), wrap = M({ color: 0x6a655e, roughness: 0.95, map: rep(tex.clothD, 6), normalMap: rep(tex.clothN, 6) });
  const eyeMat = M({ color: 0x0a1418, emissive: 0x6fd8ff, emissiveIntensity: 2.6, roughness: 0.2 });
  model.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.frustumCulled = false; o.material = /Joints/.test(o.material.name) ? armor : cloth; });

  // ------------------------------------------------------------------ bind-pose measurements (T-pose, facing +z)
  model.traverse(o => { if (o.isSkinnedMesh) o.skeleton.pose(); }); root.updateMatrixWorld(true);
  const wp = (b) => b.getWorldPosition(V()), bind = {}; for (const n in B) bind[n] = B[n].quaternion.clone();
  const J = {}; for (const n of ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'HeadTop_End', 'LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg', 'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot']) J[n] = wp(B[n]);
  const armLen = { R: [J.RightArm.distanceTo(J.RightForeArm), J.RightForeArm.distanceTo(J.RightHand)], L: [J.LeftArm.distanceTo(J.LeftForeArm), J.LeftForeArm.distanceTo(J.LeftHand)] };
  const hipsRest = B.Hips.position.clone(), unit = B.Hips.getWorldScale(V()).y;   // bone-space units per metre (centimetres)

  // ------------------------------------------------------------------ armour + clothing, authored in T-pose space and attached to bones
  const mesh = (geo, mat, x = 0, y = 0, z = 0, bone = null, rx = 0, ry = 0, rz = 0, s = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); if (s) m.scale.set(...s); m.castShadow = true; m.frustumCulled = false; root.add(m); m.updateMatrixWorld(true); if (bone) bone.attach(m); return m; };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d), cyl = (rt, rb, h, s = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open), sph = (r, a = 24, b = 16, ...rest) => new THREE.SphereGeometry(r, a, b, ...rest);
  // head: hood, mask, lit visor, headband with a crest
  { const h = J.Head, cy = h.y + 0.105, hd = B.Head;
    mesh(sph(0.118, 32, 22), cloth2, h.x, cy, h.z + 0.012, hd, 0, 0, 0, [1, 1.1, 1.06]);
    mesh(sph(0.121, 28, 14, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48), cloth, h.x, cy, h.z + 0.016, hd, 0, 0, 0, [1.02, 1.1, 1.1]);
    mesh(box(0.15, 0.03, 0.03), eyeMat, h.x, cy + 0.02, h.z + 0.122, hd); mesh(box(0.17, 0.045, 0.02), armor, h.x, cy + 0.02, h.z + 0.114, hd);
    mesh(cyl(0.123, 0.126, 0.042, 28, true), red, h.x, cy + 0.068, h.z + 0.012, hd, 0, 0, 0, [1, 1, 1.06]); mesh(box(0.062, 0.05, 0.012), trim, h.x, cy + 0.07, h.z + 0.146, hd); mesh(box(0.012, 0.085, 0.01), trim, h.x, cy + 0.11, h.z + 0.144, hd, 0, 0, 0.5); mesh(box(0.012, 0.085, 0.01), trim, h.x, cy + 0.11, h.z + 0.144, hd, 0, 0, -0.5);
    mesh(box(0.05, 0.03, 0.03), red, h.x, cy + 0.066, h.z - 0.125, hd);
    mesh(cyl(0.062, 0.075, 0.1, 18), cloth, J.Neck.x, J.Neck.y + 0.03, J.Neck.z, B.Neck); }
  // torso: lamellar cuirass, collar, obi with a knot, scabbard across the back
  { const c = J.Spine2, sp = B.Spine2;
    for (let i = 0; i < 4; i++) mesh(box(0.3 - i * 0.022, 0.075, 0.03), armor, c.x, c.y + 0.1 - i * 0.068, c.z + 0.118 - i * 0.008, i < 2 ? sp : B.Spine1, -0.1 + i * 0.07);
    for (let i = 0; i < 4; i++) mesh(box(0.012, 0.012, 0.012), trim, c.x + (i % 2 ? 0.1 : -0.1), c.y + 0.1 - Math.floor(i / 2) * 0.068, c.z + 0.136, sp);
    for (let i = 0; i < 3; i++) mesh(box(0.28 - i * 0.02, 0.085, 0.028), armor, c.x, c.y + 0.08 - i * 0.08, c.z - 0.105, sp, 0.06);
    mesh(box(0.05, 0.6, 0.02), leather, c.x, c.y + 0.0, c.z + 0.13, sp, 0, 0, 0.72); mesh(box(0.05, 0.6, 0.02), leather, c.x, c.y, c.z - 0.125, sp, 0, 0, -0.72);
    const hp = J.Hips; mesh(cyl(0.158, 0.165, 0.11, 24), red, hp.x, hp.y + 0.075, hp.z, B.Hips, 0, 0, 0, [1, 1, 0.78]); mesh(box(0.1, 0.085, 0.05), red, hp.x - 0.07, hp.y + 0.075, hp.z + 0.125, B.Hips); mesh(box(0.045, 0.26, 0.016), red, hp.x - 0.09, hp.y - 0.07, hp.z + 0.135, B.Hips, 0, 0, 0.1); mesh(box(0.045, 0.2, 0.016), red, hp.x - 0.045, hp.y - 0.05, hp.z + 0.14, B.Hips, 0, 0, -0.12);
    for (const s of [-1, 1]) { mesh(box(0.15, 0.24, 0.022), armor, hp.x + s * 0.115, hp.y - 0.12, hp.z + 0.085, s < 0 ? B.RightUpLeg : B.LeftUpLeg, -0.12, 0, 0); mesh(box(0.15, 0.03, 0.026), trim, hp.x + s * 0.115, hp.y - 0.235, hp.z + 0.1, s < 0 ? B.RightUpLeg : B.LeftUpLeg, -0.12); mesh(box(0.022, 0.24, 0.15), armor, hp.x + s * 0.185, hp.y - 0.12, hp.z, s < 0 ? B.RightUpLeg : B.LeftUpLeg, 0, 0, s * 0.1); }
    mesh(cyl(0.021, 0.026, 0.86, 12), armor, c.x + 0.02, c.y + 0.02, c.z - 0.15, sp, 0, 0, -0.78); mesh(cyl(0.028, 0.028, 0.03, 12), trim, c.x - 0.27, c.y + 0.31, c.z - 0.15, sp, 0, 0, -0.78); mesh(cyl(0.027, 0.027, 0.05, 12), trim, c.x + 0.32, c.y - 0.285, c.z - 0.15, sp, 0, 0, -0.78); }
  // limbs: layered shoulder guards, bracers, shin guards, wrapped ankles
  for (const s of [-1, 1]) { const N = s < 0 ? 'Right' : 'Left', sh = J[N + 'Arm'], el = J[N + 'ForeArm'], ha = J[N + 'Hand'], kn = J[N + 'Leg'], ft = J[N + 'Foot'];
    for (let i = 0; i < 3; i++) mesh(sph(0.082 - i * 0.004, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), armor, sh.x + s * (0.01 + i * 0.05), sh.y + 0.022 - i * 0.012, sh.z, B[N + 'Arm'], 0, 0, -s * (0.25 + i * 0.3), [1.05, 0.7, 1.15]);
    mesh(cyl(0.05, 0.043, 0.17, 14), leather, lerp(el.x, ha.x, 0.55), el.y, el.z, B[N + 'ForeArm'], 0, 0, Math.PI / 2); mesh(box(0.15, 0.022, 0.07), armor, lerp(el.x, ha.x, 0.55), el.y + 0.045, el.z, B[N + 'ForeArm']); mesh(cyl(0.046, 0.046, 0.02, 14), trim, lerp(el.x, ha.x, 0.9), el.y, el.z, B[N + 'ForeArm'], 0, 0, Math.PI / 2);
    mesh(cyl(0.062, 0.05, 0.3, 14), wrap, kn.x, lerp(kn.y, ft.y, 0.5), kn.z, B[N + 'Leg']); mesh(box(0.085, 0.27, 0.03), armor, kn.x, lerp(kn.y, ft.y, 0.48), kn.z + 0.055, B[N + 'Leg'], 0.05); mesh(sph(0.058, 14, 10), armor, kn.x, kn.y + 0.005, kn.z + 0.045, B[N + 'Leg'], 0, 0, 0, [1, 1.15, 0.7]); }

  // ------------------------------------------------------------------ the katana (canonical frame: +Y to the tip, +Z the cutting edge, origin where the right hand grips)
  const sword = new THREE.Group(), SW = 1.18;
  { const k = katana.clone(true); k.rotation.y = Math.PI / 2; k.scale.setScalar(SW); k.position.y = 0.075 * SW; k.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.material = o.material.clone(); o.material.envMapIntensity = envMapIntensity * 2.2; } }); sword.add(k); }
  const TIP = 0.77 * SW, GRIP_L = -0.15 * SW;   // blade tip and left-hand position along the sword axis
  // hand frames in the bind pose: fingers run along the bone, palms face down, thumbs point forward
  const hands = {};
  for (const s of ['R', 'L']) { const hb = B[s === 'R' ? 'RightHand' : 'LeftHand'], iq = hb.getWorldQuaternion(new THREE.Quaternion()).invert();
    const fing = V(s === 'R' ? -1 : 1, 0, 0).applyQuaternion(iq), thumb = V(0, 0, 1).applyQuaternion(iq), palm = V(0, -1, 0).applyQuaternion(iq), tilt = 0.32;
    const ys = thumb.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(fing, Math.sin(tilt)), zs = fing.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(thumb, -Math.sin(tilt));
    const G = frame(ys, zs, new THREE.Quaternion());                                  // sword orientation in hand space
    const off = fing.clone().multiplyScalar(0.088).addScaledVector(palm, 0.028);      // palm centre from the wrist, metres
    hands[s] = { bone: hb, G, Ginv: G.clone().invert(), off, fingers: [] };
    // closed fist: curl every finger joint towards the palm, wrap the thumb over
    const curlAxisW = V(0, 0, s === 'R' ? 1 : -1);
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let i = 1; i <= 3; i++) { const fb = B[(s === 'R' ? 'RightHand' : 'LeftHand') + f + i]; if (!fb) continue; const ax = curlAxisW.clone().applyQuaternion(fb.getWorldQuaternion(new THREE.Quaternion()).invert()); hands[s].fingers.push([fb, bind[fb.name.replace(/^mixamorig:?/, '')].clone().multiply(new THREE.Quaternion().setFromAxisAngle(ax, [1.15, 1.45, 1.0][i - 1]))]); }
    for (let i = 1; i <= 3; i++) { const fb = B[(s === 'R' ? 'RightHand' : 'LeftHand') + 'Thumb' + i]; if (!fb) continue; const iqf = fb.getWorldQuaternion(new THREE.Quaternion()).invert(), a1 = V(s === 'R' ? -1 : 1, 0, 0).applyQuaternion(iqf), a2 = V(0, s === 'R' ? 1 : -1, 0).applyQuaternion(iqf);
      hands[s].fingers.push([fb, bind[fb.name.replace(/^mixamorig:?/, '')].clone().multiply(new THREE.Quaternion().setFromAxisAngle(a1, i === 1 ? 0.55 : 0.5)).multiply(new THREE.Quaternion().setFromAxisAngle(a2, i === 1 ? 0.5 : 0.25))]); } }
  root.add(sword);

  // ------------------------------------------------------------------ animation
  const mixer = new THREE.AnimationMixer(model), act = {};
  for (const n of ['idle', 'walk', 'run']) { const clip = gltf.animations.find(c => c.name === n); act[n] = mixer.clipAction(clip); act[n].play(); act[n].setEffectiveWeight(n === 'idle' ? 1 : 0); }
  const W = { idle: 1, walk: 0, run: 0 };
  // smoothed pose state
  const S = { grip: R(0.04, 1.0, 0.3), q: new THREE.Quaternion(), two: 1, lhand: R(-0.3, 1.0, 0.1), twist: 0, lean: 0, side: 0, legW: 0, legs: [V(0, -1, 0), V(0, -1, 0), V(0, -1, 0), V(0, -1, 0)], hips: 1, crouch: 0, first: true };
  const T = { grip: V(), tip: V(), edge: V(), q: new THREE.Quaternion(), two: 1, lhand: V(), lfree: 0, twist: 0, lean: 0, side: 0, legW: 0, legs: [V(), V(), V(), V()], hips: -1, crouch: 0, snap: 0 };
  const bq = new THREE.Quaternion(), bqi = new THREE.Quaternion(), swQ = new THREE.Quaternion(), tgt = V(), pole = V(), sPos = V(), eq = new THREE.Quaternion();
  function ik(side, target, poleC) {   // two-bone arm IK to a world-space wrist target; poleC (character space) says which way the elbow bends
    const up = B[side === 'R' ? 'RightArm' : 'LeftArm'], lo = B[side === 'R' ? 'RightForeArm' : 'LeftForeArm'], [a, b] = armLen[side];
    up.getWorldPosition(sPos); const dir = v4.subVectors(target, sPos), d0 = dir.length(), d = clamp(d0, Math.abs(a - b) + 0.02, a + b - 0.004); dir.normalize();
    const c0 = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), s0 = Math.sqrt(1 - c0 * c0), pw = v5.copy(poleC).applyQuaternion(bq); pw.addScaledVector(dir, -pw.dot(dir)); if (pw.lengthSq() < 1e-6) pw.set(0, -1, 0); pw.normalize();
    const elbow = pole.copy(sPos).addScaledVector(dir, a * c0).addScaledVector(pw, a * s0);
    aimBone(up, v2.subVectors(elbow, sPos).normalize()); lo.getWorldPosition(v3); aimBone(lo, v2.copy(sPos).addScaledVector(dir, d).sub(v3).normalize());
  }
  const setLegs = (a, b, c, d2, w) => { T.legs[0].copy(a); T.legs[1].copy(b); T.legs[2].copy(c); T.legs[3].copy(d2); T.legW = w; };
  const stance = (grip, tip, edge, two = 1) => { T.grip.copy(grip); T.tip.copy(tip); T.edge.copy(edge); T.two = two; };
  const ease = (t) => 1 - Math.pow(1 - t, 3), sstep = (t) => t * t * (3 - 2 * t);

  // st: { dt, time, speed, walk, sprinting, onGround, flip, wall: 0 | 'up' | side(+1/-1), atk: null | { combo, t (0..1), throwing }, block, dash, storm, dead, wake: null | 0..1 (sit-up), lying, fall }
  function update(st) {
    const dt = st.dt, k = S.first ? 1 : 1 - Math.exp(-16 * dt), hs = st.speed;
    // --- locomotion layer
    const moving = st.onGround && hs > 0.5 && !st.dead && st.wake == null, runK = moving ? clamp((hs - st.walk * 0.55) / (st.walk * 0.6), 0, 1) : 0, wI = moving ? 0 : 1, wR = moving ? runK : 0, wW = moving ? 1 - runK : 0, kb = 1 - Math.exp(-10 * dt);
    W.idle = lerp(W.idle, wI, kb); W.walk = lerp(W.walk, wW, kb); W.run = lerp(W.run, wR, kb);
    act.idle.setEffectiveWeight(W.idle); act.walk.setEffectiveWeight(W.walk); act.run.setEffectiveWeight(W.run);
    act.walk.timeScale = clamp(hs / 1.6, 0.6, 2.4) * 0.55; act.run.timeScale = clamp(hs / 6.5, 0.8, 2.3); if (st.wall) { act.run.setEffectiveWeight(1); act.idle.setEffectiveWeight(0); act.walk.setEffectiveWeight(0); act.run.timeScale = 2; }
    mixer.update(st.airFreeze ? dt * 0.2 : dt);

    // --- choose the pose
    T.twist = 0; T.lean = 0; T.side = 0; T.legW = 0; T.hips = -1; T.crouch = 0; T.lfree = 0; T.snap = 0; let bodyX = 0, bodyZ = 0, bodyY = 0, spin = false;
    const bob = Math.sin(st.time * 2) * 0.008;
    stance(R(0.05, 1.0 + bob, 0.3), V(0.06, 0.48, 0.88), V(0, -1, 0.35), 1);                                       // chudan: hilt at the navel, point at the throat
    if (moving) { if (st.sprinting && hs > 12) { stance(R(0.3, 0.98, -0.12), R(0.32, -0.12, -0.94), V(0, -1, -0.1), 0); bodyX = 0.3; T.lean = 0.25; }   // shinobi run: blade trailing low on the right
      else stance(R(0.2, 0.98 + bob, 0.2), R(-0.25, 0.42, 0.87), V(0, -1, 0.3), 1); }
    if (!st.onGround && st.wake == null) { stance(R(0.4, 1.2, 0.0), R(0.45, 0.55, -0.7), V(0, -0.6, -0.8), 0); T.lfree = 1; T.lhand.copy(R(-0.45, 1.15, 0.15)); setLegs(V(0.05, -0.55, 0.83), V(0, -1, -0.25), V(-0.05, -1, 0.15), V(0, -0.75, -0.66), 1); if (st.flip) { bodyX = -st.flip; setLegs(V(0.05, -0.2, 0.98), V(0, -0.9, -0.45), V(-0.05, -0.2, 0.98), V(0, -0.9, -0.45), 1); T.lean = 0.5; } }
    if (st.wall === 'up') { bodyX = -0.3; stance(R(0.36, 1.15, 0.1), R(0.5, -0.3, -0.8), V(0, -1, 0), 0); T.legW = 0; }
    else if (st.wall) { bodyZ = st.wall * 0.75; bodyX = 0.2; stance(R(0.34, 1.0, -0.1), R(0.3, -0.1, -0.95), V(0, -1, 0), 0); T.legW = 0; }
    if (st.block) { stance(R(0.3, 1.32, 0.36), R(-0.92, 0.36, 0.1), V(0, 0.25, 1), 1); T.crouch = 0.07; T.lean = 0.1; }   // guard: blade across the body, edge to the enemy
    if (st.atk) { const e = ease(st.atk.t); T.snap = 1; T.crouch = 0.05;
      if (st.atk.throwing) { stance(R(0.34, 1.0, -0.05), R(0.3, -0.25, -0.9), V(0, -1, 0), 0); T.lfree = 1; T.lhand.copy(R(-0.12 - 0.2 * (1 - e), 1.42, 0.2 + 0.5 * e)); T.twist = lerp(0.5, -0.4, e); }
      else if (st.atk.combo === 2) { const th = lerp(-1.0, 2.15, e);   // men: straight down from overhead
        stance(R(0, 1.3 + 0.48 * Math.cos(th * 0.75), 0.16 + 0.34 * Math.sin(Math.max(0, th))), V(0, Math.cos(th), Math.sin(th)), V(0, -Math.sin(th), Math.cos(th)), 1); T.lean = lerp(-0.2, 0.45, e); T.crouch = 0.12 * e; }
      else { const sgn = st.atk.combo === 0 ? 1 : -1, ph = lerp(-2.0, 1.85, e) * sgn, rise = st.atk.combo === 0 ? lerp(1.5, 1.02, e) : lerp(0.98, 1.5, e), slope = (st.atk.combo === 0 ? -0.3 : 0.3);   // kesa / gyaku-kesa: a diagonal sweep across the front
        stance(R(Math.sin(ph) * 0.34, rise, 0.1 + Math.cos(ph) * 0.3), R(Math.sin(ph * 1.2), slope * Math.cos(ph * 0.6), Math.cos(ph * 1.2)), R(Math.cos(ph) * sgn, slope, -Math.sin(ph) * sgn), 1); T.twist = -ph * 0.42; T.lean = 0.12; } }
    if (st.dash) { stance(R(0.2, 1.05, 0.5), R(-0.1, 0.05, 1), V(0, -1, 0.1), 1); bodyX = 0.55; T.lean = 0.3; setLegs(V(0, -0.65, 0.76), V(0, -0.9, -0.44), V(0, -0.8, -0.6), V(0, -0.6, -0.8), 1); T.snap = 1; }   // thrust
    if (st.storm) { spin = true; stance(R(0.6, 1.32, 0), R(1, 0.02, 0), V(0, 0, 1), 0); T.lfree = 1; T.lhand.copy(R(-0.62, 1.32, 0)); T.snap = 1; }
    if (st.wake != null) { const e = sstep(st.wake), a = 1.45 * e; bodyX = lerp(-1.5, 0.06, e); T.hips = lerp(0.22, 0.16, e); setLegs(V(0.06, -Math.cos(a), Math.sin(a)), V(0, -Math.cos(a) - 0.02, Math.sin(a)), V(-0.06, -Math.cos(a), Math.sin(a)), V(0, -Math.cos(a) - 0.02, Math.sin(a)), 1);
      stance(R(0.3, lerp(1.0, 1.05, e), lerp(0.1, 0.3, e)), V(-0.1 - 0.5 * e, lerp(-1, 0.75, e), lerp(0.25, 0.6, e)), V(0.3, -e, 1 - e), 0); T.lfree = 1; T.lhand.copy(R(-0.3, lerp(1.0, 0.95, e), lerp(0.1, 0.35, e))); T.twist = e * Math.sin(st.time * 3.2) * 0.4; }
    if (st.dead) { const e = clamp(st.dead, 0, 1); bodyX = -1.5 * sstep(e); T.hips = lerp(1, 0.2, sstep(e)); stance(R(0.6, 1.0, 0.1), R(0.9, -0.3, 0.2), V(0, 0, 1), 0); T.lfree = 1; T.lhand.copy(R(-0.6, 1.1, 0.0)); setLegs(V(0.12, -1, 0.05), V(0, -1, 0), V(-0.12, -1, 0.05), V(0, -1, 0), e); }

    // --- whole-body transform
    if (spin) { body.rotation.set(0, (body.rotation.y + dt * 30) % (Math.PI * 2), 0); body.position.y = lerp(body.position.y, 0, k); }
    else if (st.flip) { body.rotation.set(bodyX, 0, 0); body.position.y = 0.95 * Math.abs(Math.sin(bodyX / 2)); }
    else { body.rotation.y = lerp(body.rotation.y > Math.PI ? body.rotation.y - Math.PI * 2 : body.rotation.y, 0, k); body.rotation.x = st.wake != null && S.first ? bodyX : lerp(Math.abs(body.rotation.x) > 3 ? 0 : body.rotation.x, bodyX, k); body.rotation.z = lerp(body.rotation.z, bodyZ, k); body.position.y = lerp(body.position.y, bodyY, k); }
    S.hips = lerp(S.hips, T.hips < 0 ? 1 - T.crouch : T.hips, k); if (T.hips >= 0 || S.hips < 0.985) B.Hips.position.y = hipsRest.y * S.hips + (B.Hips.position.y - hipsRest.y) * clamp(S.hips, 0, 1);
    root.updateMatrixWorld(true); body.getWorldQuaternion(bq); bqi.copy(bq).invert();

    // --- spine: twist into the cut, lean
    S.twist = lerp(S.twist, T.twist, T.snap ? 1 - Math.exp(-40 * dt) : k); S.lean = lerp(S.lean, T.lean, k);
    const upW = v4.set(0, 1, 0).applyQuaternion(bq).clone(), rightW = v5.set(1, 0, 0).applyQuaternion(bq).clone();
    for (const n of ['Spine', 'Spine1', 'Spine2']) { twistWorld(B[n], upW, S.twist / 3); twistWorld(B[n], rightW, S.lean / 3); }

    // --- legs (only when the pose overrides the mocap)
    S.legW = lerp(S.legW, T.legW, k); for (let i = 0; i < 4; i++) S.legs[i].lerp(T.legs[i], T.legW > 0 ? (S.legW < 0.05 ? 1 : k) : 0);
    if (S.legW > 0.01) [B.LeftUpLeg, B.LeftLeg, B.RightUpLeg, B.RightLeg].forEach((b, i) => aimBone(b, v2.copy(S.legs[i]).normalize().applyQuaternion(bq), S.legW));

    // --- sword pose (character space), then the arms
    frame(T.tip, T.edge, T.q); const ks = S.first ? 1 : T.snap ? 1 - Math.exp(-38 * dt) : 1 - Math.exp(-13 * dt);
    S.grip.lerp(T.grip, ks); S.q.slerp(T.q, ks); S.two = lerp(S.two, T.two, k); S.lhand.lerp(T.lhand, k);
    swQ.copy(bq).multiply(S.q);                                                            // sword orientation in the world
    const gripW = tgt.copy(S.grip).applyMatrix4(body.matrixWorld).clone();
    const hr = hands.R, hl = hands.L;
    // right hand: its palm sits on the grip point
    eq.copy(swQ).multiply(hr.Ginv); const wristR = v1.copy(hr.off).applyQuaternion(eq).multiplyScalar(-1).add(gripW).clone();
    ik('R', wristR, R(0.75, -0.6, -0.35)); setWorldQuat(hr.bone, eq); for (const [fb, q] of hr.fingers) fb.quaternion.copy(q);
    hr.bone.updateMatrixWorld(true);
    // the sword follows the hand that actually holds it (so it never floats if the arm cannot reach)
    hr.bone.getWorldQuaternion(q2); sword.quaternion.copy(q2).multiply(hr.G); hr.bone.getWorldPosition(sword.position); sword.position.add(v1.copy(hr.off).applyQuaternion(q2));
    root.worldToLocal(sword.position); root.getWorldQuaternion(q1); sword.quaternion.premultiply(q1.invert());
    // left hand: on the hilt below the right, or free
    if (S.two > 0.02 || T.lfree) { sword.updateMatrixWorld(true); const two = S.two;
      const gl = v2.set(0, GRIP_L, 0).applyMatrix4(sword.matrixWorld).clone(); sword.getWorldQuaternion(q2); const el = q3.copy(q2).multiply(hl.Ginv).clone();
      const wristL = v1.copy(hl.off).applyQuaternion(el).multiplyScalar(-1).add(gl).clone(), free = v3.copy(S.lhand).applyMatrix4(body.matrixWorld);
      wristL.lerp(free, T.lfree ? 1 - two : 0); const w = T.lfree ? 1 : two;
      if (w > 0.02) { const up = B.LeftArm, lo = B.LeftForeArm, pu = up.quaternion.clone(), pl = lo.quaternion.clone(); ik('L', wristL, R(-0.75, -0.6, -0.35)); if (w < 1) { up.quaternion.slerpQuaternions(pu, up.quaternion.clone(), w); up.updateMatrixWorld(true); lo.quaternion.slerpQuaternions(pl, lo.quaternion.clone(), w); lo.updateMatrixWorld(true); }
        if (two > 0.5) { setWorldQuat(hl.bone, el, two); for (const [fb, q] of hl.fingers) fb.quaternion.slerp(q, two); } } }
    S.first = false;
  }
  const _tip = V(), _base = V();
  return { root, body, model, sword, B, update, mixer,
    reset() { S.first = true; body.rotation.set(0, 0, 0); body.position.set(0, 0, 0); },
    headAnchor(out) { return out.set(0, 6, -13).applyMatrix4(B.Head.matrixWorld); },                        // where the scarf is tied (bone space is centimetres)
    bladeTip(out) { return out.set(0, TIP, 0).applyMatrix4(sword.matrixWorld); }, bladeBase(out) { return out.set(0, 0.1, 0).applyMatrix4(sword.matrixWorld); },
    segments: [['Hips', 'Spine2'], ['Spine2', 'Head'], ['Head', 'HeadTop_End'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['RightArm', 'RightForeArm'], ['RightForeArm', 'RightHand'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['RightLeg', 'RightFoot']].map(([a, b]) => [B[a], B[b]]) };
}
