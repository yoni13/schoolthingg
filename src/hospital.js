// St. Rojiura General: a three-storey hospital you can walk through. Corridor + rooms on every floor, a scissor stair up to the roof.
// Layout coordinates: u runs along x from the west wall, v along z from the south wall (both 0..22 m). Level k has its floor at y = k * FH.
import * as THREE from 'three';

const PI = Math.PI;

export function buildHospital(ctx, x0, x1, z0, z1) {
  const { M, B, prop, pbr, canvasTex, signMat, drawBoxSign, blade, addLight, colliders, rng, rand, pick, Q, FONT, scene } = ctx;
  const shell = new THREE.Group(), lv = [0, 1, 2].map(() => new THREE.Group()), lts = [], c0 = colliders.length; let blk = shell;   // the shell is always drawn; each storey's dressing only while you are on (or near) it
  const ax = x0 + 1, bx = x1 - 1, az = z0 + 1, bz = z1 - 1, W = bx - ax, D = bz - az, cx = (ax + bx) / 2, cz = (az + bz) / 2;
  const T = 0.4, FH = 3.6, SL = 0.3, NF = 3, H = FH * NF, CH = FH - SL, PAR = 0.9, PT = 0.2;   // wall thickness, storey height, slab, floors, roof level, clear height, parapet, partition thickness
  const X = (u) => ax + u, Z = (v) => az + v, Y = (k) => k * FH;

  // ------------------------------------------------------------------ materials
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const clad = pbr('concrete_tile_facade', { rough: 0.6, color: 0xcfd6d2 }), plinth = pbr('concrete_wall_008', { rough: 0.85, color: 0x7c8084 });
  const wallUp = pbr('painted_plaster_wall', { rough: 0.92, color: 0xdfe5dc }), wallDado = pbr('painted_plaster_wall', { rough: 0.7, color: 0x7fa596 });
  const wallTile = pbr('long_white_tiles', { rough: 0.4, color: 0xdfe9e6 });
  const fLino = pbr('old_linoleum_flooring_01', { rough: 0.62, color: 0xc9d2c8 }), fTile = pbr('large_floor_tiles_02', { rough: 0.5, color: 0xd0d0cc }), fTerr = pbr('terrazzo_tiles', { rough: 0.5, color: 0xc8c8c4 }), fDirty = pbr('dirty_tiles', { rough: 0.6 });
  const ceilM = pbr('ceiling_interior', { rough: 1, color: 0xb9beb8 }), slabM = pbr('concrete_wall_008', { rough: 0.9, color: 0x8a8d90 }), stairM = pbr('concrete_pavement', { rough: 0.75, color: 0x9a9a98 });
  const cotton = pbr('cotton_jersey', { rough: 1, color: 0xe6e8e2 }), blanket = pbr('cotton_jersey', { rough: 1, color: 0x5d9483 }), curtainM = pbr('cotton_jersey', { rough: 1, color: 0x8fb8aa }); curtainM.side = THREE.DoubleSide;
  const leather = pbr('fabric_leather_02', { rough: 0.6, color: 0x39413e });
  const enamel = std({ color: 0xe6e8e4, roughness: 0.35, metalness: 0.1 }), frameM = std({ color: 0x2c3236, roughness: 0.45, metalness: 0.8 }), chrome = std({ color: 0xc8ced4, roughness: 0.18, metalness: 1, envMapIntensity: 2 });
  const doorM = std({ color: 0xa9b8ae, roughness: 0.55 }), rubber = std({ color: 0x15171a, roughness: 0.9 }), yellow = std({ color: 0xc9a21a, roughness: 0.7 }), plasticDk = std({ color: 0x1b1d20, roughness: 0.5 });
  const glass = std({ color: 0x9fb4b8, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 2.6, depthWrite: false });
  const bagM = std({ color: 0xd8e6ea, roughness: 0.2, transparent: true, opacity: 0.55, depthWrite: false });
  const emi = (r, g, b) => new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) });
  const tubeMats = [emi(2.3, 2.6, 2.4), emi(2.3, 2.6, 2.4), emi(2.3, 2.6, 2.4), emi(0.05, 0.055, 0.05)];   // steady, flicker A, flicker B, dead
  const blindM = emi(0.95, 0.82, 0.55), redGlow = emi(3.2, 0.2, 0.12), greenGlow = emi(0.2, 2.6, 0.9), screenOff = std({ color: 0x06080a, roughness: 0.15, metalness: 0.4 });
  const decal = (tex, o = {}) => std({ map: tex, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, ...o });
  const bloodPool = decal(canvasTex(512, 512, (g, S) => { for (let i = 0; i < 34; i++) { const x = S / 2 + rand(-130, 130), y = S / 2 + rand(-130, 130), r = rand(10, 95), gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, 'rgba(58,3,3,0.95)'); gr.addColorStop(0.75, 'rgba(44,2,2,0.8)'); gr.addColorStop(1, 'rgba(40,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    for (let i = 0; i < 90; i++) { const a = rng() * 7, r = rand(120, 250); g.fillStyle = `rgba(50,2,2,${rand(0.4, 0.9)})`; g.beginPath(); g.arc(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r, rand(1, 6), 0, 7); g.fill(); } }), { roughness: 0.12 });
  const bloodDrag = decal(canvasTex(128, 512, (g, Wd, Hd) => { for (let i = 0; i < 46; i++) { const x = Wd / 2 + rand(-34, 34), w = rand(3, 16); const gr = g.createLinearGradient(0, 0, 0, Hd); gr.addColorStop(0, 'rgba(52,3,3,0)'); gr.addColorStop(rand(0.05, 0.2), `rgba(52,3,3,${rand(0.5, 0.9)})`); gr.addColorStop(rand(0.6, 0.9), `rgba(44,2,2,${rand(0.3, 0.7)})`); gr.addColorStop(1, 'rgba(40,0,0,0)'); g.fillStyle = gr; g.fillRect(x, 0, w, Hd); } }), { roughness: 0.2 });
  const bloodWall = decal(canvasTex(512, 512, (g, S) => { for (let i = 0; i < 160; i++) { const a = rng() * 7, r = Math.pow(rng(), 1.6) * 230, x = S / 2 + Math.cos(a) * r, y = S * 0.35 + Math.sin(a) * r * 0.7, rr = rand(2, 16) * (1 - r / 300); g.fillStyle = `rgba(60,3,3,${rand(0.5, 0.95)})`; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); if (rng() < 0.3) g.fillRect(x - rr * 0.3, y, rr * 0.6, rand(20, 170)); }
    for (let h = 0; h < 2; h++) { const hx = S * (0.3 + h * 0.4), hy = S * 0.42; g.fillStyle = 'rgba(66,4,4,0.9)'; g.beginPath(); g.ellipse(hx, hy, 26, 30, 0, 0, 7); g.fill(); for (let f = 0; f < 5; f++) { g.save(); g.translate(hx + (f - 2) * 13, hy - 24); g.rotate((f - 2) * 0.16); g.fillRect(-5, -44 + Math.abs(f - 2) * 6, 10, 46); g.restore(); } g.fillRect(hx - 30, hy, 60, 140); g.clearRect(hx - 30, hy + 60, 60, 4); } }), { roughness: 0.25 });
  const grime = decal(canvasTex(512, 512, (g, S) => { for (let i = 0; i < 70; i++) { const x = rng() * S, y = rng() * S, r = rand(20, 120), gr = g.createRadialGradient(x, y, 1, x, y, r); gr.addColorStop(0, `rgba(24,22,16,${rand(0.08, 0.3)})`); gr.addColorStop(1, 'rgba(20,18,12,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    const ed = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.5); ed.addColorStop(0, 'rgba(0,0,0,1)'); ed.addColorStop(1, 'rgba(0,0,0,0)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = ed; g.fillRect(0, 0, S, S); }), { roughness: 0.85 });
  const paperM = std({ roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, map: canvasTex(256, 256, (g, S) => { for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) { const x = i * 128, y = j * 128; g.fillStyle = ['#e9e6dc', '#dcdccf', '#efe9d8', '#d9dfe2'][i + j * 2]; g.fillRect(x, y, 128, 128); g.fillStyle = 'rgba(40,40,50,0.55)'; g.fillRect(x + 12, y + 12, 60, 7); for (let l = 0; l < 9; l++) g.fillRect(x + 12, y + 30 + l * 10, rand(50, 104), 2); if ((i + j) % 2) { g.fillStyle = 'rgba(90,6,6,0.6)'; g.beginPath(); g.arc(x + rand(40, 90), y + rand(40, 90), rand(8, 26), 0, 7); g.fill(); } } }) });
  const ecg = (col) => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), map: canvasTex(256, 192, (g, Wd, Hd) => { g.fillStyle = '#020806'; g.fillRect(0, 0, Wd, Hd); g.strokeStyle = 'rgba(40,90,70,0.35)'; g.lineWidth = 1; for (let i = 0; i < Wd; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, Hd); g.stroke(); } for (let j = 0; j < Hd; j += 16) { g.beginPath(); g.moveTo(0, j); g.lineTo(Wd, j); g.stroke(); }
    const rows = [[col, 46, 1], ['#ffd23a', 100, 0.5], ['#4ad0ff', 150, 0.3]]; for (const [c, y, amp] of rows) { g.strokeStyle = c; g.lineWidth = 2.5; g.shadowColor = c; g.shadowBlur = 6; g.beginPath(); for (let x = 0; x < Wd * 0.7; x++) { const p = (x % 52) / 52, s = col === '#ff3030' ? 0 : (p > 0.42 && p < 0.46 ? -30 : p > 0.46 && p < 0.5 ? 22 : p > 0.2 && p < 0.3 ? -5 * Math.sin((p - 0.2) * 31) : 0) * amp + Math.sin(x * 0.2) * 1.5 * amp; x ? g.lineTo(x, y + s) : g.moveTo(x, y + s); } g.stroke(); }
    g.shadowBlur = 0; g.fillStyle = col; g.font = `700 40px ${FONT}`; g.textAlign = 'right'; g.fillText(col === '#ff3030' ? '---' : String(60 + Math.floor(rng() * 50)), Wd - 8, 52); g.fillStyle = '#4ad0ff'; g.font = `700 26px ${FONT}`; g.fillText(col === '#ff3030' ? '--' : '9' + Math.floor(rng() * 9), Wd - 8, 160); }) });
  const ecgOK = ecg('#35ff7a'), ecgFlat = ecg('#ff3030');
  const plateCache = new Map();
  function plateMat(text, sub, { bg = '#e8ece6', fg = '#1c2a26', accent = '#1f9d55', w = 256, h = 96, glow = 0 } = {}) {
    const key = text + sub + bg + glow; if (plateCache.has(key)) return plateCache.get(key);
    const t = canvasTex(w, h, (g, Wd, Hd) => { g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd); g.fillStyle = accent; g.fillRect(0, 0, Wd * 0.045, Hd); g.fillStyle = fg; g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `800 ${Hd * (sub ? 0.46 : 0.6)}px ${FONT}`; g.fillText(text, Wd * 0.09, Hd * (sub ? 0.36 : 0.52), Wd * 0.86); if (sub) { g.font = `600 ${Hd * 0.22}px ${FONT}`; g.globalAlpha = 0.75; g.fillText(sub, Wd * 0.09, Hd * 0.76, Wd * 0.86); g.globalAlpha = 1; }
      for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(30,30,20,${rng() * 0.08})`; g.fillRect(rng() * Wd, rng() * Hd, 1 + rng() * 3, 2 + rng() * 12); } });
    const m = glow ? new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.4 }) : std({ map: t, roughness: 0.45 });
    plateCache.set(key, m); return m;
  }
  const posterMats = [['手洗い', 'WASH YOUR HANDS', '#2a6fb0'], ['静粛に', 'QUIET PLEASE', '#3a8a5c'], ['感染注意', 'BIOHAZARD · ISOLATION', '#c8a018'], ['避難経路', 'EVACUATION ROUTE', '#b83a2a']].map(([a, b, c]) => std({ roughness: 0.6, map: canvasTex(256, 360, (g, Wd, Hd) => { g.fillStyle = '#ece8dc'; g.fillRect(0, 0, Wd, Hd); g.fillStyle = c; g.fillRect(0, 0, Wd, Hd * 0.3); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 62px ${FONT}`; g.fillText(a, Wd / 2, Hd * 0.16, Wd * 0.9); g.fillStyle = '#222'; g.font = `700 20px ${FONT}`; g.fillText(b, Wd / 2, Hd * 0.38, Wd * 0.9); g.strokeStyle = c; g.lineWidth = 10; g.beginPath(); g.arc(Wd / 2, Hd * 0.62, 50, 0, 7); g.stroke(); g.fillStyle = 'rgba(30,30,30,0.5)'; for (let l = 0; l < 4; l++) g.fillRect(30, Hd * 0.84 + l * 11, Wd - 60 - l * 20, 3);
    for (let i = 0; i < 120; i++) { g.fillStyle = `rgba(60,50,30,${rng() * 0.1})`; g.fillRect(rng() * Wd, rng() * Hd, 2 + rng() * 6, 2 + rng() * 26); } }) }));

  // ------------------------------------------------------------------ geometry helpers
  const box = (mat, xa, xb, ya, yb, za, zb, o) => B(blk, mat, xb - xa, yb - ya, zb - za, (xa + xb) / 2, (ya + yb) / 2, (za + zb) / 2, o);
  const col = (xa, xb, za, zb, y0, h, wall = true, extra = null) => { const c = { minX: Math.min(xa, xb), maxX: Math.max(xa, xb), minZ: Math.min(za, zb), maxZ: Math.max(za, zb), wall, h, ...extra }; if (y0 > 0.01) c.y0 = y0; colliders.push(c); return c; };
  function quad(mat, xa, xb, za, zb, y, up = true, tile = 2, parent = blk) {   // horizontal quad with world-space UVs (no seams between neighbours)
    const g = new THREE.BufferGeometry(), P = up ? [xa, y, zb, xb, y, zb, xb, y, za, xa, y, za] : [xa, y, za, xb, y, za, xb, y, zb, xa, y, zb], U = [], N = [];
    for (let i = 0; i < 4; i++) { U.push(P[i * 3] / tile, P[i * 3 + 2] / tile); N.push(0, up ? 1 : -1, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, mat); m.userData.shadow = false; parent.add(m); return m;
  }
  function flat(mat, x, y, z, w, d, rot = 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat); m.rotation.set(-PI / 2, 0, rot); m.position.set(x, y, z); m.userData.shadow = false; blk.add(m); return m; }   // floor decal
  function hang(mat, x, y, z, w, h, ry) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.rotation.y = ry; m.position.set(x, y, z); m.userData.shadow = false; blk.add(m); return m; }      // wall decal / plate (faces +z before ry)
  const cyl = (mat, r, h, x, y, z, { rx = 0, rz = 0, seg = 10, r2 = r } = {}) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, h, seg), mat); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); blk.add(m); return m; };
  // painted wall volume: sea-green dado up to 1.05 m on each storey, off-white above
  function paint(xa, xb, ya, yb, za, zb, tiled = false) {
    if (tiled) { box(wallTile, xa, xb, ya, yb, za, zb, { tile: 1.2 }); return; }
    for (let k = 0; k < NF; k++) { const d0 = Math.max(ya, Y(k)), d1 = Math.min(yb, Y(k) + 1.05), u0 = Math.max(ya, Y(k) + 1.05), u1 = Math.min(yb, Y(k + 1));
      if (d1 - d0 > 0.01) box(wallDado, xa, xb, d0, d1, za, zb); if (u1 - u0 > 0.01) box(wallUp, xa, xb, u0, u1, za, zb); }
    if (yb > H + 0.01) box(wallUp, xa, xb, Math.max(ya, H), yb, za, zb);
  }

  // ------------------------------------------------------------------ exterior walls with real window / door openings
  // side: 'X0' west (u=0), 'X1' east, 'Z0' south (v=0), 'Z1' north. s runs along the wall, t into it from the outside face.
  const sideLen = (s) => s[0] === 'X' ? D : W;
  function sideBox(mat, side, s0, s1, t0, t1, ya, yb, o) {
    if (side === 'X0') return box(mat, ax + t0, ax + t1, ya, yb, az + s0, az + s1, o); if (side === 'X1') return box(mat, bx - t1, bx - t0, ya, yb, az + s0, az + s1, o);
    if (side === 'Z0') return box(mat, ax + s0, ax + s1, ya, yb, az + t0, az + t1, o); return box(mat, ax + s0, ax + s1, ya, yb, bz - t1, bz - t0, o);
  }
  function sidePaint(side, s0, s1, ya, yb) {
    if (side === 'X0') paint(ax + 0.22, ax + T, ya, yb, az + s0, az + s1); else if (side === 'X1') paint(bx - T, bx - 0.22, ya, yb, az + s0, az + s1);
    else if (side === 'Z0') paint(ax + s0, ax + s1, ya, yb, az + 0.22, az + T); else paint(ax + s0, ax + s1, ya, yb, bz - T, bz - 0.22);
  }
  const sidePt = (side, s, t) => side === 'X0' ? [ax + t, az + s] : side === 'X1' ? [bx - t, az + s] : side === 'Z0' ? [ax + s, az + t] : [ax + s, bz - t];
  const sideRy = { X0: -PI / 2, X1: PI / 2, Z0: PI, Z1: 0 };   // rotation that turns +z into the outward normal
  function wallPiece(side, s0, s1, ya, yb) { if (s1 - s0 < 0.01 || yb - ya < 0.01) return; sideBox(ya < 0.7 ? plinth : clad, side, s0, s1, 0, 0.22, ya, Math.min(yb, ya < 0.7 ? 0.7 : yb)); if (ya < 0.7 && yb > 0.7) sideBox(clad, side, s0, s1, 0, 0.22, 0.7, yb); sidePaint(side, s0, s1, ya, Math.min(yb, H)); if (yb > H) sideBox(clad, side, s0, s1, 0.22, T, H, yb); }
  function extWall(k, side, openings) {
    const L = sideLen(side), a0 = side[0] === 'Z' ? T : 0, a1 = L - a0, y0 = Y(k), y1 = k === NF - 1 ? H + PAR : Y(k + 1); let s = a0;
    for (const o of [...openings].sort((p, q) => p.c - q.c)) { const o0 = o.c - o.w / 2, o1 = o.c + o.w / 2;
      wallPiece(side, s, o0, y0, y1); if (o.sill > 0) wallPiece(side, o0, o1, y0, y0 + o.sill); wallPiece(side, o0, o1, y0 + o.head, y1); s = o1;
      if (o.door) doorway(side, k, o); else windowFill(side, k, o); }
    wallPiece(side, s, a1, y0, y1);
    if (k === 0) { let q = a0; const cw = (p0, p1, yy = 0) => { if (p1 - p0 < 0.02) return; const [xa, za] = sidePt(side, p0, 0), [xb, zb] = sidePt(side, p1, T); col(xa, xb, za, zb, yy, H + PAR); };   // collision: full height, split at the ground-floor doors
      for (const o of openings.filter(o => o.door).sort((p, q2) => p.c - q2.c)) { cw(q, o.c - o.w / 2); cw(o.c - o.w / 2, o.c + o.w / 2, o.head); q = o.c + o.w / 2; } cw(q, a1); }
  }
  function windowFill(side, k, o) {
    const y0 = Y(k) + o.sill, y1 = Y(k) + o.head, s0 = o.c - o.w / 2, s1 = o.c + o.w / 2, n = Math.max(1, Math.round(o.w / 0.95));
    sideBox(glass, side, s0, s1, 0.13, 0.145, y0, y1, { shadow: false });
    for (const [a, b, c, d] of [[s0, s1, y0, y0 + 0.06], [s0, s1, y1 - 0.06, y1], [s0, s0 + 0.06, y0, y1], [s1 - 0.06, s1, y0, y1]]) sideBox(frameM, side, a, b, 0.09, 0.19, c, d, { shadow: false });
    for (let i = 1; i < n; i++) { const m = s0 + o.w * i / n; sideBox(frameM, side, m - 0.025, m + 0.025, 0.1, 0.18, y0, y1, { shadow: false }); }
    sideBox(frameM, side, s0, s1, 0.1, 0.18, y0 + (y1 - y0) * 0.68, y0 + (y1 - y0) * 0.68 + 0.04, { shadow: false });
    sideBox(plinth, side, s0 - 0.08, s1 + 0.08, -0.1, 0.22, y0 - 0.09, y0, { shadow: false }); sideBox(enamel, side, s0, s1, 0.2, T + 0.06, y0 - 0.04, y0);   // stone sill outside, enamel board inside
    const lit = rng() < 0.45; if (lit || rng() < 0.5) { const drop = rand(0.25, 0.75) * (y1 - y0); sideBox(lit ? blindM : enamel, side, s0 + 0.04, s1 - 0.04, 0.2, 0.215, y1 - drop, y1, { shadow: false }); sideBox(frameM, side, s0 + 0.04, s1 - 0.04, 0.195, 0.225, y1 - drop - 0.03, y1 - drop, { shadow: false }); }
  }
  function doorway(side, k, o) {   // open double doors: steel frame, one glazed leaf swung in, the other torn off
    const s0 = o.c - o.w / 2, s1 = o.c + o.w / 2, y0 = Y(k), y1 = y0 + o.head;
    sideBox(frameM, side, s0, s0 + 0.08, -0.02, T + 0.02, y0, y1); sideBox(frameM, side, s1 - 0.08, s1, -0.02, T + 0.02, y0, y1); sideBox(frameM, side, s0, s1, -0.02, T + 0.02, y1 - 0.1, y1);
    sideBox(yellow, side, s0, s1, 0, T, y0, y0 + 0.035, { shadow: false });
    const [hx, hz] = sidePt(side, s0 + 0.08, T), g = new THREE.Group(); g.position.set(hx, y0, hz); g.rotation.y = sideRy[side] + PI + rand(1.1, 1.45) * (side === 'X0' || side === 'Z1' ? 1 : 1); blk.add(g);
    const lw = Math.min(1.2, o.w / 2 - 0.1); B(g, frameM, lw, o.head - 0.14, 0.05, lw / 2, (o.head - 0.14) / 2 + 0.02, 0); B(g, glass, lw - 0.24, o.head - 0.9, 0.055, lw / 2, o.head * 0.56, 0, { shadow: false }); B(g, chrome, 0.04, 0.5, 0.1, lw - 0.12, 1.05, 0);
  }

  // ------------------------------------------------------------------ interior partitions with doorways
  const DOOR_H = 2.2;
  // axis 'x': wall plane at u = pos, running along v from s0 to s1. axis 'z': plane at v = pos, running along u. doors: [centre, width, style]  (style 'open' = bare opening, 'dbl' = double doors)
  function part(k, axis, pos, s0, s1, doors = [], { tiled = false, rail = 0 } = {}) {
    const y0 = Y(k), y1 = y0 + CH, h = PT / 2;
    const seg = (a, b, ya = y0, yb = y1, c = true) => { if (b - a < 0.02) return; const xa = axis === 'x' ? X(pos - h) : X(a), xb = axis === 'x' ? X(pos + h) : X(b), za = axis === 'x' ? Z(a) : Z(pos - h), zb = axis === 'x' ? Z(b) : Z(pos + h);
      paint(xa, xb, ya, yb, za, zb, tiled); if (c) col(xa, xb, za, zb, ya, yb, true, { noRun: true });
      if (rail && ya === y0 && b - a > 0.8) for (const sgn of rail === 2 ? [1, -1] : [rail > 0 ? 1 : -1]) { const o = sgn * (h + 0.045);   // corridor crash rail
        if (axis === 'x') { box(frameM, X(pos) + o - 0.03, X(pos) + o + 0.03, y0 + 0.86, y0 + 0.98, Z(a + 0.12), Z(b - 0.12), { shadow: false }); } else box(frameM, X(a + 0.12), X(b - 0.12), y0 + 0.86, y0 + 0.98, Z(pos) + o - 0.03, Z(pos) + o + 0.03, { shadow: false }); } };
    let s = s0;
    for (const [c, w, style] of [...doors].sort((p, q) => p[0] - q[0])) { const d0 = c - w / 2, d1 = c + w / 2; seg(s, d0); seg(d0, d1, y0 + DOOR_H, y1, true); s = d1; doorFrame(k, axis, pos, c, w, style); }
    seg(s, s1);
  }
  function doorFrame(k, axis, pos, c, w, style = 'door') {
    const y0 = Y(k), h = PT / 2 + 0.02, P = (a, b, ya, yb, mat = frameM) => axis === 'x' ? box(mat, X(pos - h), X(pos + h), ya, yb, Z(a), Z(b)) : box(mat, X(a), X(b), ya, yb, Z(pos - h), Z(pos + h));
    P(c - w / 2, c - w / 2 + 0.06, y0, y0 + DOOR_H); P(c + w / 2 - 0.06, c + w / 2, y0, y0 + DOOR_H); P(c - w / 2, c + w / 2, y0 + DOOR_H - 0.06, y0 + DOOR_H);
    if (style === 'open') return;
    const leaves = style === 'dbl' ? [[c - w / 2 + 0.06, 1], [c + w / 2 - 0.06, -1]] : [[c - w / 2 + 0.06, 1]], lw = (w - 0.12) / leaves.length;
    for (const [hs, dir] of leaves) { if (rng() < 0.18) continue;   // some doors are simply gone
      const g = new THREE.Group(), swing = (rng() < 0.5 ? 1 : -1) * rand(0.9, 1.5); g.position.set(axis === 'x' ? X(pos) : X(hs), y0, axis === 'x' ? Z(hs) : Z(pos)); g.rotation.y = (axis === 'x' ? -PI / 2 : 0) + (dir > 0 ? 0 : PI) + swing * dir; blk.add(g);
      B(g, doorM, lw, DOOR_H - 0.1, 0.045, lw / 2, (DOOR_H - 0.1) / 2 + 0.02, 0); B(g, chrome, lw, 0.28, 0.05, lw / 2, 0.16, 0, { shadow: false }); B(g, glass, 0.22, 0.6, 0.05, lw - 0.26, 1.5, 0, { shadow: false }); B(g, frameM, 0.3, 0.68, 0.047, lw - 0.26, 1.5, 0, { shadow: false });
      B(g, chrome, 0.14, 0.025, 0.14, lw - 0.1, 1.02, 0, { shadow: false }); }
  }

  // ------------------------------------------------------------------ floors, ceilings, slabs
  function floorRect(k, u0, u1, v0, v1, mat, tile = 2) { quad(mat, X(u0), X(u1), Z(v0), Z(v1), Y(k) + (k ? 0.004 : 0.03), true, tile).userData.shadow = true; }
  function slab(k, hole) {   // the floor of level k (k = 1..NF), with a stairwell hole [u0,u1,v0,v1]
    const y = Y(k), [h0, h1, g0, g1] = hole, rects = [[0, h0, 0, D], [h1, W, 0, D], [h0, h1, 0, g0], [h0, h1, g1, D]];
    for (const [u0, u1, v0, v1] of rects) { if (u1 - u0 < 0.01 || v1 - v0 < 0.01) continue; box(slabM, X(u0), X(u1), y - SL + 0.012, y - 0.004, Z(v0), Z(v1)); colliders.push({ minX: X(u0), maxX: X(u1), minZ: Z(v0), maxZ: Z(v1), wall: false, roof: true, ceil: y - SL, h: y });
      quad(ceilM, X(Math.max(u0, T)), X(Math.min(u1, W - T)), Z(Math.max(v0, T)), Z(Math.min(v1, D - T)), y - SL, false, 2.4); }
  }

  // ------------------------------------------------------------------ lights
  const fixtures = [];
  function fixture(k, u, v, { along = 'x', mode = 0, color = 0xd8f0e4, power = 26, dist = 11, len = 1.25 } = {}) {
    const y = Y(k) + CH, x = X(u), z = Z(v), lx = along === 'x' ? len : 0.32, lz = along === 'x' ? 0.32 : len;
    B(blk, enamel, lx + 0.06, 0.07, lz + 0.06, x, y - 0.035, z, { shadow: false });
    for (const s of [-1, 1]) B(blk, tubeMats[mode], along === 'x' ? len - 0.08 : 0.045, 0.045, along === 'x' ? 0.045 : len - 0.08, x + (along === 'x' ? 0 : s * 0.08), y - 0.09, z + (along === 'x' ? s * 0.08 : 0), { shadow: false });
    if (mode === 3) return null;
    const rec = addLight(x, y - 0.45, z, color, power, dist, false); rec.lv = [Y(k) - 1.7, Y(k) + FH - 0.7]; rec.base = power; rec.mode = mode; lts.push(rec); fixtures.push(rec); return rec;
  }
  function glow(k, u, v, yy, color, power, dist = 7) { const rec = addLight(X(u), Y(k) + yy, Z(v), color, power, dist, false); rec.lv = [Y(k) - 1.7, Y(k) + FH - 0.7]; rec.base = power; rec.mode = 0; lts.push(rec); return rec; }

  // ------------------------------------------------------------------ furniture
  const P = (name, x, y, z, o = {}) => prop(name, x, y, z, { parent: blk, ...o });
  const rot = (dx, dz, ry) => [dx * Math.cos(ry) + dz * Math.sin(ry), -dx * Math.sin(ry) + dz * Math.cos(ry)];
  const aabb = (x, z, w, d, ry) => { const s = Math.abs(Math.sin(ry)) > 0.7; return [x - (s ? d : w) / 2, x + (s ? d : w) / 2, z - (s ? w : d) / 2, z + (s ? w : d) / 2]; };
  const blobGeo = new THREE.SphereGeometry(1, 14, 10);
  const blob = (mat, x, y, z, sx, sy, sz, ry = 0) => { const m = new THREE.Mesh(blobGeo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; blk.add(m); return m; };
  // hospital bed: scanned iron frame + mattress, pillow, and either a blanket, a stripped mattress or a body under a sheet. ry = 0: head towards +z
  function bed(k, u, v, ry = 0, style = 'made') {
    const x = X(u), z = Z(v), y = Y(k), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; blk.add(g);
    prop('old_bed_frame', 0, 0, 0, { parent: g, ry: PI });
    B(g, cotton, 0.84, 0.15, 1.88, 0, 0.5, 0, { tile: 0.7 });
    const pl = new THREE.Mesh(blobGeo, cotton); pl.scale.set(0.3, 0.07, 0.19); pl.position.set(0, 0.62, 0.68); g.add(pl);
    if (style === 'made') { B(g, blanket, 0.9, 0.05, 1.2, 0, 0.6, -0.3, { tile: 0.6 }); B(g, blanket, 0.03, 0.22, 1.2, 0.45, 0.5, -0.3, { tile: 0.6 }); B(g, blanket, 0.03, 0.22, 1.2, -0.45, 0.5, -0.3, { tile: 0.6 }); B(g, cotton, 0.9, 0.055, 0.22, 0, 0.6, 0.38, { tile: 0.6 }); }
    else if (style === 'mess') { B(g, blanket, 0.7, 0.12, 0.9, 0.3, 0.6, -0.5, { tile: 0.6, ry: 0.5, rz: -0.25 }); const [dx, dz] = rot(0.75, -0.2, ry); flat(bloodPool, x + dx, y + 0.05, z + dz, 1.3, 1.3, rng() * 6); }
    else if (style === 'body') { for (const [bx2, by, bz2, sx, sy, sz] of [[0, 0.68, 0.62, 0.12, 0.11, 0.13], [0, 0.66, 0.2, 0.25, 0.12, 0.34], [0, 0.63, -0.42, 0.2, 0.09, 0.5], [0, 0.68, -0.86, 0.13, 0.12, 0.09]]) { const m = new THREE.Mesh(blobGeo, cotton); m.position.set(bx2, by, bz2); m.scale.set(sx, sy, sz); g.add(m); }
      B(g, cotton, 0.86, 0.03, 1.86, 0, 0.585, 0, { tile: 0.6 }); const t = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), bloodPool); t.rotation.x = -PI / 2; t.position.set(0.05, 0.79, 0.2); t.userData.shadow = false; g.add(t); }
    else if (style === 'hero') { B(g, blanket, 0.7, 0.14, 0.7, -0.5, 0.2, -0.9, { tile: 0.6, ry: 0.5, rz: 0.2 }); }   // the bed you wake up in: blanket thrown on the floor
    const [a, b, c, d] = aabb(x, z, 0.95, 2.05, ry); col(a, b, c, d, y, y + 0.6, false);
  }
  function ivStand(k, u, v) { const x = X(u), z = Z(v), y = Y(k); cyl(chrome, 0.012, 1.9, x, y + 0.97, z, { seg: 6 }); for (let i = 0; i < 5; i++) { const a = i * 1.257; B(blk, chrome, 0.3, 0.025, 0.035, x + Math.sin(a) * 0.14, y + 0.045, z + Math.cos(a) * 0.14, { ry: a + PI / 2 }); }
    B(blk, chrome, 0.3, 0.012, 0.012, x, y + 1.9, z); B(blk, bagM, 0.11, 0.2, 0.035, x + 0.11, y + 1.76, z, { shadow: false }); cyl(bagM, 0.004, 0.75, x + 0.11, y + 1.28, z, { seg: 4 }); }
  function monitor(k, u, v, ry, ok = true) { const x = X(u), z = Z(v), y = Y(k), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; blk.add(g);
    cyl(chrome, 0.018, 1.1, x, y + 0.56, z, { seg: 6 }); for (let i = 0; i < 4; i++) B(blk, plasticDk, 0.34, 0.03, 0.05, x, y + 0.03, z, { ry: i * PI / 4 });
    B(g, enamel, 0.4, 0.32, 0.2, 0, 1.24, 0); B(g, plasticDk, 0.36, 0.27, 0.01, 0, 1.25, 0.1); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.33, 0.24), ok ? ecgOK : ecgFlat); s.position.set(0, 1.25, 0.107); s.userData.shadow = false; g.add(s); B(g, enamel, 0.3, 0.04, 0.24, 0, 1.0, 0); }
  // pleated curtain hung from a ceiling track between two points
  function curtain(k, ua, va, ub, vb, open = 0) {
    const y = Y(k), L = Math.hypot(ub - ua, vb - va), n = 44, top = 2.35, bot = 0.35, P2 = [], U = [], I = [], dx = (ub - ua) / L, dz = (vb - va) / L, span = L * (1 - open * 0.7);
    for (let i = 0; i <= n; i++) { const t = i / n, s = t * span, o = Math.sin(t * 34 * (1 + open)) * 0.055 + Math.sin(t * 7) * 0.03, x = X(ua) + dx * s - dz * o, z = Z(va) + dz * s + dx * o; P2.push(x, y + top, z, x + dz * 0.03 * Math.sin(t * 50), y + bot, z + dx * 0.02); U.push(t * L / 0.5, top / 0.5, t * L / 0.5, 0); if (i < n) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P2, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); const m = new THREE.Mesh(g, curtainM); blk.add(m);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, L, 6), chrome); r.position.set(X((ua + ub) / 2), y + top + 0.03, Z((va + vb) / 2)); r.rotation.set(0, Math.atan2(dx, dz), PI / 2); r.rotation.order = 'YXZ'; r.rotation.set(PI / 2, Math.atan2(dx, dz), 0); blk.add(r);
    for (const [uu, vv] of [[ua, va], [ub, vb]]) cyl(chrome, 0.008, CH - top - 0.03, X(uu), y + (CH + top + 0.03) / 2, Z(vv), { seg: 5 });
  }
  function desk(k, u, v, ry, laptop = true) { const x = X(u), z = Z(v), y = Y(k); P('metal_office_desk', x, y, z, { ry }); const [a, b, c, d] = aabb(x, z, 2.0, 0.95, ry); col(a, b, c, d, y, y + 0.8, false);
    if (laptop) { const [dx, dz] = rot(-0.4, 0, ry); P('classic_laptop', x + dx, y + 0.79, z + dz, { ry: ry + rand(-0.3, 0.3) }); } if (rng() < 0.8) { const [dx, dz] = rot(0.5, 0.1, ry); P('clipboard', x + dx, y + 0.79, z + dz, { ry: rng() * 6 }); } }
  function cabinet(k, u, v, ry) { const x = X(u), z = Z(v), y = Y(k); P('drawer_cabinet', x, y, z, { ry }); const [a, b, c, d] = aabb(x, z, 1.14, 0.5, ry); col(a, b, c, d, y, y + 1.88, false); if (rng() < 0.6) P('medical_box', x, y + 1.88, z, { ry: ry + rand(-0.4, 0.4) }); }
  function rack(k, u, v, ry) { const x = X(u), z = Z(v), y = Y(k); P('worn_metal_rack', x, y, z, { ry }); const [a, b, c, d] = aabb(x, z, 0.92, 0.6, ry); col(a, b, c, d, y, y + 1.9, false);
    for (const sy of [0.42, 0.92, 1.4]) if (rng() < 0.75) { const [dx, dz] = rot(rand(-0.15, 0.15), 0, ry); P(rng() < 0.6 ? 'medical_box' : 'cardboard_box_01', x + dx, y + sy, z + dz, { ry: ry + rand(-0.3, 0.3), s: 0.8 }); } }
  function cart(k, u, v, ry, kind = 'tool_cart') { const x = X(u), z = Z(v), y = Y(k); P(kind, x, y, z, { ry }); const big = kind !== 'tool_cart', [a, b, c, d] = aabb(x, z, big ? 1.6 : 1.27, big ? 1.1 : 0.75, ry); col(a, b, c, d, y, y + (big ? 1.38 : 0.96), false); P('medical_box', x, y + (big ? 1.38 : 0.94), z, { ry: ry + rand(-0.5, 0.5) }); }
  function chairs(k, u, v, ry, n) { for (let i = 0; i < n; i++) { const [dx, dz] = rot((i - (n - 1) / 2) * 0.92, 0, ry), x = X(u) + dx, z = Z(v) + dz; if (rng() < 0.15) { P('modern_arm_chair_01', x, Y(k) + 0.4, z, { ry: ry + 1, rx: PI / 2 }); continue; } P('modern_arm_chair_01', x, Y(k), z, { ry: ry + rand(-0.12, 0.12) }); }
    const [a, b, c, d] = aabb(X(u), Z(v), n * 0.92, 0.9, ry); col(a, b, c, d, Y(k), Y(k) + 0.45, false); }
  function sinkUnit(k, u, v, ry) { const x = X(u), z = Z(v), y = Y(k), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; blk.add(g);
    B(g, enamel, 1.2, 0.85, 0.5, 0, 0.425, 0); B(g, chrome, 1.24, 0.04, 0.54, 0, 0.87, 0); B(g, plasticDk, 0.5, 0.02, 0.34, 0, 0.895, 0, { shadow: false }); B(g, chrome, 0.03, 0.26, 0.03, 0, 1.02, -0.2); B(g, chrome, 0.03, 0.03, 0.18, 0, 1.14, -0.12); B(g, glass, 0.9, 0.6, 0.02, 0, 1.6, -0.24, { shadow: false }); B(g, chrome, 0.94, 0.64, 0.015, 0, 1.6, -0.25);
    const [a, b, c, d] = aabb(x, z, 1.24, 0.54, ry); col(a, b, c, d, y, y + 0.9, false); }
  function bodyBag(k, u, v, ry) { const x = X(u), z = Z(v), y = Y(k); blob(plasticDk, x, y + 0.14, z, 0.3, 0.15, 0.95, ry); const [dx, dz] = rot(0, 0.72, ry); blob(plasticDk, x + dx, y + 0.17, z + dz, 0.17, 0.15, 0.2, ry); }
  function plate(k, axis, pos, s, side, text, sub, o = {}) { const w = o.pw || 0.62, h = o.ph || 0.23, yy = Y(k) + (o.y || 2.42), off = side * (PT / 2 + 0.012); if (axis === 'x') hang(plateMat(text, sub, o), X(pos) + off, yy, Z(s), w, h, side > 0 ? PI / 2 : -PI / 2); else hang(plateMat(text, sub, o), X(s), yy, Z(pos) + off, w, h, side > 0 ? 0 : PI); }
  function exitSign(k, u, v, ry) { const y = Y(k) + CH - 0.22, g = new THREE.Group(); g.position.set(X(u), y, Z(v)); g.rotation.y = ry; blk.add(g); const m = plateMat('非常口 EXIT ➜', '', { bg: '#0d8a44', fg: '#eafff0', accent: '#eafff0', glow: 2.4 }); B(g, plasticDk, 0.74, 0.26, 0.06, 0, 0, 0, { shadow: false });
    for (const s of [1, -1]) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.22), m); p.position.z = s * 0.032; p.rotation.y = s > 0 ? 0 : PI; p.userData.shadow = false; g.add(p); } B(g, chrome, 0.015, 0.2, 0.015, -0.25, 0.2, 0, { shadow: false }); B(g, chrome, 0.015, 0.2, 0.015, 0.25, 0.2, 0, { shadow: false }); }
  function litter(k, u0, u1, v0, v1, n) { for (let i = 0; i < n; i++) { const m = flat(paperM, X(rand(u0, u1)), Y(k) + 0.012 + i * 0.0004 + (k ? 0 : 0.03), Z(rand(v0, v1)), 0.21, 0.3, rng() * 6); const uv = m.geometry.attributes.uv, ox = rng() < 0.5 ? 0 : 0.5, oy = rng() < 0.5 ? 0 : 0.5; for (let q = 0; q < 4; q++) uv.setXY(q, uv.getX(q) * 0.5 + ox, uv.getY(q) * 0.5 + oy); } }
  const fl = (k) => Y(k) + (k ? 0.008 : 0.034);
  const pool = (k, u, v, s) => flat(bloodPool, X(u), fl(k) + rng() * 0.002, Z(v), s, s, rng() * 6);
  const drag = (k, u, v, len, ang, w = 0.7) => flat(bloodDrag, X(u), fl(k) + 0.003, Z(v), w, len, ang);
  const dirt = (k, u, v, s) => flat(grime, X(u), fl(k) - 0.002, Z(v), s, s, rng() * 6);

  // ================================================================== the shell
  const WIN = { sill: 0.95, head: 2.5 }, win = (c, w = 2) => ({ c, w, ...WIN }), door = (c, w) => ({ c, w, sill: 0, head: 2.45, door: true });
  for (let k = 0; k < NF; k++) {
    extWall(k, 'Z0', [win(3), win(8.35), win(13.65), win(19)]);
    extWall(k, 'Z1', k === 0 ? [win(2.6), door(6.4, 2.2), win(10.2), win(15.2), win(19.4)] : [win(2.6), win(6.4), win(10.2), win(15.2), win(19.4)]);
    extWall(k, 'X0', [win(4.9), k === 0 ? door(11, 3) : win(11, 2.2), win(15.2), win(19.2)]);
    extWall(k, 'X1', [win(4.9), k === 0 ? door(11, 1.8) : win(11, 2.2), win(18.9)]);
  }
  for (const s of ['X0', 'X1', 'Z0', 'Z1']) { const L = sideLen(s), a0 = s[0] === 'Z' ? T : 0; if (s[0] === 'Z') { /* upper storeys share the ground-floor collider */ }
    sideBox(plinth, s, a0 - (a0 ? 0.06 : 0.06), L - a0 + 0.06, -0.06, T, H + PAR, H + PAR + 0.08);   // parapet coping
    for (let k = 1; k <= NF; k++) sideBox(plinth, s, a0 ? a0 : -0.03, a0 ? L - a0 : L + 0.03, -0.035, 0.05, Y(k) - SL, Y(k) - SL + 0.22, { shadow: false }); }   // floor bands

  // stairwell holes: flight 1 and 3 run in the north lane, flight 2 in the south lane
  const SU0 = 14.6, SU1 = 20, LB0 = 12.7, LB1 = 14.25, LA0 = 14.4, LA1 = 15.9;
  slab(1, [SU0, SU1, LA0, LA1]); slab(2, [SU0, SU1, LB0, LB1]); slab(3, [SU0, SU1, LA0, LA1]);
  quad(pbr('concrete_wall_008', { rough: 0.8, color: 0x6c7074 }), X(T), X(W - T), Z(T), Z(D - T), H + 0.003, true, 3).userData.shadow = true;   // roof deck
  box(slabM, ax + 0.1, bx - 0.1, 0, 0.026, az + 0.1, bz - 0.1, { shadow: false });   // ground-floor screed over the asphalt

  // ================================================================== floor plan (the same structural walls on every storey)
  const SD = [5.7, 11.0, 16.3], SDOOR = [3, 8.35, 13.65, 19];
  for (let k = 0; k < NF; k++) {
    const lobby = k === 0;
    // south corridor wall + the four south rooms
    part(k, 'z', 9.4, T, W - T, SDOOR.map((c, i) => [c, lobby && i === 0 ? 2 : 1.3, lobby && i === 0 ? 'dbl' : 'door']), { rail: 1 });
    for (const u of SD) part(k, 'x', u, T, 9.3);
    // north corridor wall: lobby is open on the ground floor (two columns), stair landings always open
    if (lobby) { part(k, 'z', 12.6, 12.8, W - T, [[13.8, 1.5, 'open'], [20.8, 1.5, 'open']], { rail: -1 }); for (const u of [4.4, 8.6]) { box(wallUp, X(u - 0.25), X(u + 0.25), 0, CH, Z(12.35), Z(12.85)); col(X(u - 0.25), X(u + 0.25), Z(12.35), Z(12.85), 0, CH, true, { noRun: true }); box(frameM, X(u - 0.27), X(u + 0.27), 0, 0.12, Z(12.33), Z(12.87)); } }
    else part(k, 'z', 12.6, T, W - T, [[4, 1.8, 'dbl'], [10.2, 1.3, 'door'], [13.8, 1.5, 'open'], [20.8, 1.5, 'open']], { rail: -1 });
    part(k, 'x', 12.9, 12.7, D - T, [[19, 1.3, 'door']]);                 // NW room | stairs + NE room
    part(k, 'z', 16.0, 13.0, W - T);                                      // stairwell north wall
    if (k === 2) part(k, 'x', 7.0, 12.7, D - T, [[17.6, 1.3, 'door']], { tiled: true });   // theatre | ICU
    // floor finishes
    floorRect(k, T, W - T, 9.5, 12.5, lobby ? fTerr : fTile); floorRect(k, T, W - T, 9.3, 9.5, lobby ? fTerr : fTile); floorRect(k, T, 12.8, 12.5, 12.7, lobby ? fTerr : fTile);
    const sm = [[fDirty, fLino, fLino, fLino], [fLino, fLino, fLino, fTile], [fLino, fTile, fLino, fDirty]][k];
    [T, ...SD.map(u => u + 0.1)].forEach((u0, i) => floorRect(k, i ? u0 - 0.1 : u0, i < 3 ? SD[i] : W - T, T, 9.3, sm[i]));
    if (k === 2) { floorRect(k, T, 7.0, 12.7, D - T, fDirty, 1.4); floorRect(k, 7.0, 12.9, 12.7, D - T, fLino); } else floorRect(k, T, 12.9, 12.7, D - T, lobby ? fTerr : fLino);
    floorRect(k, 12.9, W - T, 16.0, D - T, k === 0 ? fDirty : fLino);
    // stair landings (west + east) and whichever lane is floor rather than flight on this storey
    floorRect(k, 12.9, SU0, 12.5, 16.0, stairM); floorRect(k, SU1, W - T, 12.5, 16.0, stairM); floorRect(k, SU0, SU1, 12.5, k === 2 ? 12.7 : LB1, stairM); if (k === 0) floorRect(k, SU0, SU1, LB1, 16.0, stairM); else floorRect(k, SU0, SU1, LA1, 16.0, stairM);
  }

  // ================================================================== stairs
  const NS = 18, RISE = FH / NS, RUN = (SU1 - SU0) / NS;
  function flight(k, v0, v1, dir) {   // dir +1: climbs towards +u
    const yb = Y(k);
    for (let i = 0; i < NS; i++) { const ua = dir > 0 ? SU0 + i * RUN : SU1 - (i + 1) * RUN, top = yb + (i + 1) * RISE; box(stairM, X(ua), X(ua + RUN), yb, top, Z(v0), Z(v1)); const nu = dir > 0 ? ua : ua + RUN - 0.05; box(yellow, X(nu), X(nu + 0.05), top - 0.012, top + 0.004, Z(v0), Z(v1), { shadow: false }); }
    colliders.push({ minX: X(SU0), maxX: X(SU1), minZ: Z(v0), maxZ: Z(v1), wall: false, h: yb + FH, ramp: { ax: 'x', a: dir > 0 ? yb : yb + FH, b: dir > 0 ? yb + FH : yb } });
    const hi = dir > 0 ? SU1 : SU0; col(X(hi - (dir > 0 ? 0.12 : 0)), X(hi + (dir > 0 ? 0 : 0.12)), Z(v0), Z(v1), yb, yb + FH - 0.35, true, { noRun: true });   // you cannot walk in under the top of the flight
    const len = Math.hypot(SU1 - SU0, FH), ang = Math.atan2(FH, SU1 - SU0) * dir;
    for (const vv of [v0 + 0.07, v1 - 0.07]) { B(blk, chrome, len, 0.045, 0.045, X((SU0 + SU1) / 2), yb + FH / 2 + 0.95, Z(vv), { rz: ang, shadow: false }); for (let i = 1; i < NS; i += 4) { const uu = dir > 0 ? SU0 + (i + 0.5) * RUN : SU1 - (i + 0.5) * RUN; B(blk, chrome, 0.025, 0.06, 0.07, X(uu), yb + (i + 0.5) * RISE + 0.93, Z(vv) + (vv < (v0 + v1) / 2 ? -0.04 : 0.04), { shadow: false }); } }
  }
  flight(0, LA0, LA1, 1); flight(1, LB0, LB1, -1); flight(2, LA0, LA1, 1);
  paint(X(SU0), X(SU1), 0, H, Z(LB1), Z(LA0)); box(wallUp, X(SU0), X(SU1), H, H + 2.5, Z(LB1), Z(LA0)); col(X(SU0), X(SU1), Z(LB1), Z(LA0), 0, H + 2.5, true, { noRun: true });   // the spine wall between the lanes
  const railAt = (k, u, v0, v1) => { const y = Y(k); col(X(u - 0.06), X(u + 0.06), Z(v0), Z(v1), y, y + 1.1, true, { noRun: true }); box(chrome, X(u - 0.02), X(u + 0.02), y + 1.02, y + 1.07, Z(v0), Z(v1), { shadow: false }); box(chrome, X(u - 0.015), X(u + 0.015), y + 0.5, y + 0.53, Z(v0), Z(v1), { shadow: false }); for (const vv of [v0 + 0.03, (v0 + v1) / 2, v1 - 0.03]) box(chrome, X(u - 0.02), X(u + 0.02), y, y + 1.05, Z(vv - 0.02), Z(vv + 0.02), { shadow: false }); };
  railAt(1, SU0 - 0.06, LA0, LA1); railAt(2, SU1 + 0.06, LB0, LB1);
  for (const [k, u, v] of [[0, 17.3, 13.5], [1, 13.8, 14.3], [1, 20.8, 14.3], [2, 13.8, 14.3], [2, 20.8, 14.3]]) fixture(k, u, v, { along: 'z', mode: k === 1 && u < 14 ? 1 : 0, power: 16, dist: 9, len: 0.9 });
  for (let k = 0; k < NF; k++) { plate(k, 'z', 12.6, 13.8, -1, `${k + 1}F`, '階段 STAIRS', { y: 2.5, accent: '#b83a2a' }); plate(k, 'z', 12.6, 20.8, -1, `${k + 1}F`, k < 2 ? '階段 STAIRS ▲▼' : '屋上 ROOF ▲', { y: 2.5, accent: '#b83a2a' }); hang(plateMat(String(k + 1), '', { bg: '#c9d0c8', fg: '#b83a2a', w: 128, h: 128 }), X(W - T) - 0.012, Y(k) + 1.9, Z(14.3), 0.7, 0.7, -PI / 2); }
  // roof bulkhead over the top flight, door facing south
  { const y0 = H, y1 = H + 2.6;
    box(clad, X(SU0 - 0.4), X(W), y0, y1, Z(16.0), Z(16.2)); col(X(SU0 - 0.4), X(W), Z(16.0), Z(16.2), y0, y1 + 0.2); box(clad, X(SU0 - 0.4), X(SU0 - 0.2), y0, y1, Z(LB1), Z(16.0)); col(X(SU0 - 0.4), X(SU0 - 0.2), Z(LB1), Z(16.0), y0, y1 + 0.2);
    box(clad, X(SU0 - 0.4), X(SU0), y0, y1, Z(LB1 - 0.1), Z(LA0)); box(clad, X(SU1 + 1.5), X(W - T), y0, y1, Z(LB1), Z(LA0)); col(X(SU1 + 1.5), X(W - T), Z(LB1), Z(LA0), y0, y1 + 0.2); box(clad, X(SU1), X(SU1 + 1.5), y0 + 2.15, y1, Z(LB1), Z(LA0));
    box(frameM, X(SU1), X(SU1 + 0.06), y0, y0 + 2.15, Z(LB1 - 0.02), Z(LA0 + 0.02)); box(frameM, X(SU1 + 1.44), X(SU1 + 1.5), y0, y0 + 2.15, Z(LB1 - 0.02), Z(LA0 + 0.02));
    box(slabM, X(SU0 - 0.6), X(W + 0.1), y1, y1 + 0.2, Z(LB1 - 0.3), Z(16.4)); colliders.push({ minX: X(SU0 - 0.6), maxX: X(W + 0.1), minZ: Z(LB1 - 0.3), maxZ: Z(16.4), wall: false, roof: true, ceil: y1, h: y1 + 0.2 });
    box(redGlow, X(SU1 + 0.6), X(SU1 + 0.9), y0 + 2.25, y0 + 2.33, Z(LB1 - 0.06), Z(LB1), { shadow: false }); const r = addLight(X(SU1 + 0.75), y0 + 2.0, Z(LB1 - 0.8), 0xff4030, 14, 9); lts.push(r); }

  // ================================================================== room dressing
  const corridorLights = (k) => { for (const [u, mode] of [[2.6, 0], [7, k === 1 ? 2 : 0], [11.4, k === 0 ? 0 : 3], [15.8, k === 2 ? 1 : 0], [19.6, 0]]) fixture(k, u, 11, { mode, power: 24 }); exitSign(k, 12.4, 11, PI / 2); exitSign(k, 19.2, 11, -PI / 2); };
  const southPlates = (k, names) => names.forEach(([a, b], i) => plate(k, 'z', 9.4, SDOOR[i] + (k === 0 && i === 0 ? 1.45 : 1.1), 1, a, b, { y: 1.75 }));
  const posters = (k) => { for (const [u, i] of [[6.2, 0], [10.9, 2], [16.4, 1]]) hang(posterMats[(i + k) % 4], X(u), Y(k) + 1.62, Z(9.5) + 0.012, 0.5, 0.7, 0); };
  const P_ = (k, name, u, v, o = {}) => P(name, X(u), Y(k) + (o.y || 0), Z(v), o);

  // ---------------- ground floor: lobby, ER, exam room, pharmacy, staff office, morgue
  { const k = 0; blk = lv[k]; corridorLights(k); posters(k); southPlates(k, [['救急', 'EMERGENCY ROOM'], ['診察室', 'EXAMINATION'], ['薬局', 'PHARMACY'], ['事務室', 'STAFF ONLY']]);
    // lobby + reception
    for (const [u, v, mode] of [[3.2, 15.4, 0], [3.2, 19.4, 2], [8.6, 15.4, 0], [8.6, 19.4, 0]]) fixture(k, u, v, { mode, power: 26 });
    const rx = X(9.6), rz = Z(17.6); box(M.planks, rx - 0.35, rx + 0.35, 0, 1.08, rz - 2.3, rz + 2.3); box(enamel, rx - 0.45, rx + 0.4, 1.08, 1.13, rz - 2.4, rz + 2.4); box(M.planks, rx, rx + 1.9, 0, 1.08, rz + 1.95, rz + 2.3); box(enamel, rx - 0.05, rx + 1.95, 1.08, 1.13, rz + 1.9, rz + 2.4);
    col(rx - 0.45, rx + 0.4, rz - 2.4, rz + 2.4, 0, 1.13, false); col(rx, rx + 1.95, rz + 1.9, rz + 2.4, 0, 1.13, false);
    hang(plateMat('受付', 'RECEPTION', { bg: '#1f6f58', fg: '#f2fff8', accent: '#f2fff8', glow: 1.2, w: 512, h: 128 }), rx - 0.36, 0.72, rz, 2.6, 0.5, -PI / 2);
    P('classic_laptop', rx + 0.02, 1.13, rz - 1.2, { ry: PI / 2 + 0.2 }); P('classic_laptop', rx + 0.02, 1.13, rz + 0.9, { ry: PI / 2 - 0.3 }); P('clipboard', rx - 0.1, 1.13, rz - 0.2, { ry: 0.6 }); P('clipboard', rx - 0.05, 1.13, rz + 1.6, { ry: 2.1 });
    P_(k, 'metal_stool_01', 10.7, 16.6); P_(k, 'metal_stool_01', 10.9, 18.9, { rx: PI / 2, y: 0.18, ry: 0.7 }); cabinet(k, 12.5, 14.6, -PI / 2); cabinet(k, 12.5, 15.9, -PI / 2);
    chairs(k, 2.4, 14.4, 0, 4); chairs(k, 2.4, 17.4, PI, 4); chairs(k, 0.95, 20, PI / 2, 3);
    hang(plateMat('総合案内', 'FLOOR GUIDE', { bg: '#20302c', fg: '#e8fff4', w: 512, h: 128 }), X(T) + 0.012, 2.55, Z(17.2), 2.2, 0.5, PI / 2);
    hang(std({ roughness: 0.5, map: canvasTex(512, 512, (g, S) => { g.fillStyle = '#e9ede6'; g.fillRect(0, 0, S, S); const rows = [['R', '屋上 ROOF · ヘリポート'], ['3F', '手術室 OPERATING · 集中治療室 ICU · 検査室 LAB'], ['2F', '病棟 WARD · 病室 201–203 · ナース NURSES'], ['1F', '受付 RECEPTION · 救急 ER · 薬局 PHARMACY']]; rows.forEach(([a, b], i) => { g.fillStyle = i === 3 ? '#1f9d55' : '#22302c'; g.fillRect(24, 30 + i * 118, 96, 92); g.fillStyle = '#fff'; g.font = `900 50px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(a, 72, 78 + i * 118); g.fillStyle = '#22302c'; g.textAlign = 'left'; g.font = `700 22px ${FONT}`; g.fillText(b, 140, 78 + i * 118, 350); }); }) }), X(T) + 0.012, 1.55, Z(17.2), 1.5, 1.5, PI / 2);
    P('wall_clock', X(9.6), 2.6, Z(D - T) - 0.01, { mode: 'wall', ry: PI }); P('korean_fire_extinguisher_01', X(0.75), 0, Z(13.2)); P('fire_alarm', X(T) + 0.005, 1.5, Z(13.6), { mode: 'wall', ry: PI / 2 });
    P_(k, 'potted_plant_02', 0.9, 21.1); P_(k, 'potted_plant_02', 12.2, 21); P_(k, 'wheelchair_01', 5.6, 13.6, { ry: 2.2 }); P_(k, 'wheelchair_01', 6.9, 20.7, { ry: -0.4, rz: PI / 2, y: 0.4 }); P_(k, 'WetFloorSign_01', 4.2, 11.6, { ry: 0.5 }); P_(k, 'vintage_crutches_01', 0.7, 16.2, { rz: 0.12 });
    pool(k, 6.4, 16.5, 2.6); drag(k, 5.4, 13.9, 5.2, 0.38, 0.9); pool(k, 2, 11, 1.8); drag(k, 8.5, 11.2, 9, PI / 2 + 0.05, 0.8); pool(k, 13.2, 11.3, 2.2); dirt(k, 1.6, 11, 4.5); dirt(k, 7, 19.5, 5); dirt(k, 17, 11, 4);
    hang(bloodWall, X(6.6), 1.5, Z(D - T) - 0.012, 2.2, 2.2, PI); litter(k, 1, 12, 9.8, 21, 46);
    // ER
    fixture(k, 3, 3, { mode: 1, power: 26 }); fixture(k, 3, 7, { mode: 0, power: 26, color: 0xe6f2ff });
    bed(k, 1.2, 2.2, PI / 2, 'body'); bed(k, 1.2, 6.2, PI / 2, 'mess'); curtain(k, T + 0.1, 4.2, 2.9, 4.2, 0.3); ivStand(k, 1.9, 3.3); monitor(k, 0.8, 7.5, PI / 2, false); cart(k, 4.6, 2, PI / 2); sinkUnit(k, 5.3, 6.3, -PI / 2); P_(k, 'metal_stool_01', 3.3, 5); P_(k, 'medical_box', 2.6, 6.4, { ry: 0.7 });
    pool(k, 2.7, 6.3, 2.4); pool(k, 3.4, 2.4, 1.5); drag(k, 3.1, 8.4, 3.4, 0.1); hang(bloodWall, X(T) + 0.012, 1.4, Z(7.9), 2, 2, PI / 2); litter(k, 0.8, 5.2, 0.8, 9, 10); dirt(k, 3, 4.6, 5);
    // exam room
    fixture(k, 8.35, 4.8, { along: 'z', mode: 0, power: 22 }); desk(k, 9.8, 1.2, 0); P_(k, 'metal_stool_01', 9.6, 2.2); bed(k, 6.5, 6.6, 0, 'made'); cabinet(k, 6.3, 1.2, 0); P('wall_clock', X(8.35), 2.5, Z(T) + 0.01, { mode: 'wall' }); hang(posterMats[0], X(10.9) - 0.012, 1.6, Z(6), 0.5, 0.7, -PI / 2); curtain(k, 5.9, 5.3, 7.9, 5.3, 0.55); litter(k, 6, 10.8, 0.8, 9, 8); P_(k, 'vintage_crutches_01', 10.6, 8.6, { rz: -0.1 });
    // pharmacy
    fixture(k, 13.65, 4.8, { along: 'z', mode: 2, power: 22 }); for (const v of [1.4, 3.4, 5.4]) { rack(k, 11.65, v, PI / 2); rack(k, 15.75, v, -PI / 2); } rack(k, 13.65, 0.85, 0); cart(k, 13.6, 4.2, 0.3); P_(k, 'cardboard_box_01', 12.2, 7.6, { ry: 0.5 }); P_(k, 'cardboard_box_01', 15.2, 8.2, { ry: 1.2 }); P_(k, 'medical_box', 13, 6.6, { ry: 2 }); P_(k, 'medical_box', 14.4, 7.4, { ry: 0.4, rz: PI / 2, y: 0.18 }); litter(k, 11.6, 15.8, 1, 9, 12); pool(k, 14.2, 7.8, 1.4);
    // staff office
    fixture(k, 19, 4.8, { along: 'z', mode: 0, power: 22, color: 0xfff0d8 }); desk(k, 18, 1.2, 0); desk(k, 20.6, 4.4, -PI / 2, false); cabinet(k, 16.9, 5, PI / 2); cabinet(k, 16.9, 6.3, PI / 2); P_(k, 'modern_arm_chair_01', 18.2, 2.3, { ry: PI + 0.3 }); P_(k, 'modern_arm_chair_01', 19.6, 4.5, { ry: PI / 2 }); P_(k, 'potted_plant_02', 21.1, 0.9); P('wall_clock', X(W - T) - 0.01, 2.5, Z(7.2), { mode: 'wall', ry: -PI / 2 }); litter(k, 16.8, 21.2, 0.8, 9, 16);
    // morgue (behind the stairs)
    fixture(k, 17.3, 18.8, { mode: 1, power: 18, color: 0xbfe4ff }); for (const u of [14.2, 15.5, 16.8]) bodyBag(k, u, 20.6, rand(-0.1, 0.1)); bodyBag(k, 20.4, 18.4, PI / 2 + 0.2); cart(k, 19, 20.6, 0, 'industrial_storage_cart'); cart(k, 15.4, 17.3, 0.1); bed(k, 20.8, 20.4, 0, 'body'); pool(k, 17.4, 18.6, 2.6); drag(k, 14.2, 18.9, 3, PI / 2); dirt(k, 17, 19, 6);
    plate(k, 'x', 12.9, 20.05, -1, '霊安室', 'MORGUE', { y: 1.75, accent: '#444' });
    // under the stairs
    P_(k, 'cardboard_box_01', 15.6, 13.4); P_(k, 'cardboard_box_01', 16.3, 13.7, { ry: 0.6 }); P_(k, 'cardboard_box_01', 15.9, 13.5, { y: 0.42, ry: 0.3, s: 0.85 }); P_(k, 'WetFloorSign_01', 18.6, 13.4, { ry: 1.4 }); P_(k, 'Barrel_01', 19.3, 13.5);
    col(X(15.2), X(16.7), Z(13), Z(14.1), 0, 0.5, false);
  }
  // ---------------- second floor: the ward you wake in, patient rooms, nurses' station
  const wardBeds = [1.6, 3.9, 6.2, 8.5, 10.8], HERO = 2, bedV = D - T - 1.15;
  { const k = 1; blk = lv[k]; corridorLights(k); posters(k); southPlates(k, [['201', '病室 PATIENT ROOM'], ['202', '病室 PATIENT ROOM'], ['203', '病室 PATIENT ROOM'], ['ナース', 'NURSES STATION']]);
    plate(k, 'z', 12.6, 5.4, -1, '病棟', 'WARD A', { y: 1.75 });
    for (const [u, v, mode] of [[3, 15.2, 2], [3, 19, 0], [9.4, 15.2, 0], [9.4, 19, 1]]) fixture(k, u, v, { mode, power: 24 });
    wardBeds.forEach((u, i) => { bed(k, u, bedV, 0, i === HERO ? 'hero' : ['body', 'made', '', 'mess', 'body'][i]); if (i < 4) curtain(k, u + 1.15, D - T - 0.1, u + 1.15, D - T - 2.6, i === HERO || i === HERO - 1 ? 0.75 : rand(0, 0.5)); if (i % 2 === 0) ivStand(k, u + 0.62, bedV + 0.6); });
    monitor(k, wardBeds[HERO] - 0.68, bedV + 0.75, PI - 0.5, true); monitor(k, wardBeds[4] - 0.66, bedV + 0.7, PI - 0.4, false);
    bed(k, 1.3, 13.9, PI / 2, 'made'); bed(k, 11.6, 13.9, -PI / 2, 'mess'); cart(k, 6.4, 13.4, 0); P_(k, 'wheelchair_01', 8.2, 16.4, { ry: 0.9 }); P_(k, 'metal_stool_01', 4.9, 19.6); P_(k, 'vintage_crutches_01', 12.5, 17, { rz: -0.1 }); P_(k, 'medical_box', 3, 17.2, { ry: 0.5 });
    pool(k, 9.6, 17.2, 2.4); pool(k, 2.4, 17.6, 1.6); drag(k, 6.2, 15.6, 5.5, 0.15, 0.8); drag(k, 4.6, 12.6, 2.6, 0.5); hang(bloodWall, X(12.9 - PT / 2) - 0.012, Y(k) + 1.45, Z(15.4), 2.1, 2.1, -PI / 2); litter(k, 0.8, 12.4, 13, 21, 26); dirt(k, 6, 16, 6); dirt(k, 10, 19, 4);
    P('wall_clock', X(6.4), Y(k) + 2.6, Z(12.7) + 0.01, { mode: 'wall' });
    // patient rooms 201-203
    SDOOR.slice(0, 3).forEach((c, i) => { const u0 = [T, 5.8, 11.1][i]; fixture(k, c, 4.6, { along: 'z', mode: i === 1 ? 3 : i === 2 ? 1 : 0, power: 20 }); bed(k, u0 + 0.75, 1.5, PI, i === 1 ? 'body' : 'made'); bed(k, u0 + 4.35, 1.5, PI, i === 0 ? 'mess' : 'made'); curtain(k, u0 + 2.55, T + 0.1, u0 + 2.55, 3.2, rand(0, 0.6)); ivStand(k, u0 + 1.45, 1); if (i !== 1) monitor(k, u0 + 3.6, 0.9, 0.3, i === 2);
      cabinet(k, u0 + (i === 1 ? 0.75 : 4.5), 8.9, PI); P_(k, 'modern_arm_chair_01', u0 + 1.2, 6.6, { ry: 0.6 + i }); litter(k, u0 + 0.4, u0 + 4.8, 1, 9, 6); if (i !== 2) pool(k, u0 + 2.6, 5 + i, 1.6 + i * 0.5); });
    drag(k, 8.35, 8.6, 3, 0); glow(k, 8.35, 2.4, 1.3, 0xff3020, 5, 6);
    // nurses' station
    fixture(k, 19, 4.6, { along: 'z', mode: 0, power: 22, color: 0xfff0d8 }); desk(k, 19, 6.9, PI); desk(k, 20.9, 3, -PI / 2); rack(k, 16.95, 1.6, PI / 2); rack(k, 16.95, 2.8, PI / 2); cabinet(k, 19, 0.75, 0); sinkUnit(k, 17, 5.6, PI / 2); P_(k, 'metal_stool_01', 19, 5.9); cart(k, 18.6, 3.4, 0.4); litter(k, 16.8, 21.2, 0.8, 9, 14);
    // staff room behind the stairs
    fixture(k, 17.3, 18.8, { mode: 0, power: 20, color: 0xfff0d8 }); chairs(k, 15, 21, PI, 3); desk(k, 19.4, 20.9, PI, false); cabinet(k, 21.1, 17.6, -PI / 2); P_(k, 'potted_plant_02', 13.6, 16.7); P_(k, 'modern_arm_chair_01', 17.6, 17.2, { ry: 2.4 }); litter(k, 13.4, 21.2, 16.4, 21.2, 10); pool(k, 16.4, 19.2, 1.8);
    plate(k, 'x', 12.9, 20.05, -1, '休憩室', 'STAFF ROOM', { y: 1.75 });
  }
  // ---------------- third floor: operating theatre, ICU, lab, records
  { const k = 2; blk = lv[k]; corridorLights(k); posters(k); southPlates(k, [['検査室', 'LABORATORY'], ['301', '病室 PATIENT ROOM'], ['資料室', 'RECORDS'], ['院長室', 'DIRECTOR']]);
    plate(k, 'z', 12.6, 5.4, -1, '手術室', 'OPERATING THEATRE', { y: 1.75, accent: '#b83a2a' }); plate(k, 'z', 12.6, 11.3, -1, '集中治療室', 'ICU', { y: 1.75, accent: '#b83a2a' });
    // theatre: tiled walls, table under a surgical lamp
    for (const [a, b, c, d] of [[T, 7.0 - PT / 2, D - T - 0.02, D - T], [T, T + 0.02, 12.7, D - T], [T, 7.0 - PT / 2, 12.7, 12.72]]) box(wallTile, X(a), X(b), Y(k), Y(k) + CH, Z(c), Z(d), { tile: 1.2, shadow: false });
    fixture(k, 2, 14.2, { mode: 0, power: 14, color: 0xcfe8ff }); fixture(k, 5.4, 20, { mode: 3 });
    { const x = X(3.7), z = Z(17.2), y = Y(k); box(chrome, x - 0.12, x + 0.12, y, y + 0.72, z - 0.12, z + 0.12); box(chrome, x - 0.4, x + 0.4, y, y + 0.05, z - 0.3, z + 0.3); box(leather, x - 0.34, x + 0.34, y + 0.72, y + 0.84, z - 1.0, z + 1.0, { tile: 0.6 }); col(x - 0.36, x + 0.36, z - 1.02, z + 1.02, y, y + 0.84, false);
      for (const [bx2, bz2, sx, sy, sz] of [[0, 0.75, 0.11, 0.1, 0.12], [0, 0.3, 0.24, 0.11, 0.33], [0, -0.4, 0.19, 0.085, 0.5]]) blob(cotton, x + bx2, y + 0.92, z + bz2, sx, sy, sz); box(cotton, x - 0.38, x + 0.38, y + 0.84, y + 0.87, z - 0.95, z + 0.9, { tile: 0.6 }); flat(bloodPool, x + 0.02, y + 1.035, z + 0.25, 0.55, 0.55, 1); pool(k, 3.9, 17.4, 2.8);
      cyl(chrome, 0.03, 0.9, x, y + CH - 0.45, z); const head = cyl(enamel, 0.42, 0.1, x, y + CH - 0.95, z, { seg: 24, r2: 0.3 }); head.rotation.z = 0.12; const lens = cyl(emi(2.6, 2.7, 2.5), 0.36, 0.02, x, y + CH - 1.01, z, { seg: 24 }); lens.rotation.z = 0.12; lens.userData.shadow = false;
      const rec = addLight(x, y + CH - 1.25, z, 0xf2f8ff, 34, 10, false); rec.lv = [Y(k) - 1.7, Y(k) + FH - 0.7]; rec.base = 34; rec.mode = 0; lts.push(rec); fixtures.push(rec); }
    cart(k, 5.6, 16.6, PI / 2); cart(k, 1.6, 18.4, PI / 2 + 0.2); monitor(k, 2.2, 15.9, 0.8, false); ivStand(k, 4.6, 18.3); sinkUnit(k, 0.75, 20.6, PI / 2); sinkUnit(k, 0.75, 14.4, PI / 2); rack(k, 6.5, 20.9, -PI / 2); P_(k, 'medical_box', 4.9, 15.3, { ry: 1 }); P_(k, 'metal_stool_01', 2.6, 17.9, { rx: PI / 2, y: 0.18 });
    hang(bloodWall, X(3.4), Y(k) + 1.5, Z(D - T) - 0.03, 2.4, 2.4, PI); drag(k, 4.2, 14, 4.2, 0.1, 0.9); litter(k, 0.8, 6.6, 13, 21, 8); dirt(k, 3.5, 17, 6);
    // ICU
    fixture(k, 10, 15.2, { mode: 1, power: 20, color: 0xcfe8ff }); fixture(k, 10, 19.4, { mode: 0, power: 20, color: 0xcfe8ff });
    for (const [v, st] of [[14.2, 'body'], [17, 'made'], [19.8, 'mess']]) { bed(k, 11.6, v, -PI / 2, st); monitor(k, 12.3, v + 0.85, -PI / 2 - 0.4, st === 'made'); ivStand(k, 11.9, v - 0.75); } curtain(k, 10.3, 15.6, 12.7, 15.6, 0.2); curtain(k, 10.3, 18.4, 12.7, 18.4, 0.6); cart(k, 7.8, 20.8, 0); cabinet(k, 7.45, 14.2, PI / 2); pool(k, 9.6, 17.6, 2); litter(k, 7.4, 12.6, 13, 21, 8);
    // lab
    fixture(k, 3, 3, { mode: 0, power: 22, color: 0xcfe8ff }); fixture(k, 3, 7, { mode: 2, power: 22, color: 0xcfe8ff }); desk(k, 1.4, 1, 0); desk(k, 4.2, 1, 0, false); sinkUnit(k, 0.75, 4.4, PI / 2); rack(k, 5.2, 4.2, -PI / 2); rack(k, 5.2, 5.4, -PI / 2); cart(k, 2.6, 6.2, 0.2, 'industrial_storage_cart'); P_(k, 'metal_stool_01', 1.5, 2); P_(k, 'metal_stool_01', 4.1, 2.1); P_(k, 'Barrel_01', 0.9, 8.6); glow(k, 2.6, 6.2, 1.5, 0x40ff90, 4, 5); litter(k, 0.8, 5.2, 0.8, 9, 10); pool(k, 3.6, 7.6, 1.6);
    // 301
    fixture(k, 8.35, 4.6, { along: 'z', mode: 0, power: 20 }); bed(k, 6.55, 1.5, PI, 'made'); bed(k, 10.15, 1.5, PI, 'body'); curtain(k, 8.35, T + 0.1, 8.35, 3.2, 0.4); ivStand(k, 7.25, 1); monitor(k, 9.4, 0.9, 0.3, false); P_(k, 'wheelchair_01', 7.4, 6.4, { ry: 2.6 }); cabinet(k, 10.25, 8.9, PI); litter(k, 6, 10.8, 1, 9, 6);
    // records
    fixture(k, 13.65, 4.6, { along: 'z', mode: 1, power: 18 }); for (const v of [1.2, 2.5, 3.8, 5.1]) { cabinet(k, 11.45, v, PI / 2); cabinet(k, 15.95, v, -PI / 2); } rack(k, 13.65, 0.85, 0); P_(k, 'cardboard_box_01', 13.2, 3, { ry: 0.3 }); P_(k, 'cardboard_box_01', 14, 3.5, { ry: 1.1 }); P_(k, 'cardboard_box_01', 13.5, 3.2, { y: 0.42, s: 0.8 }); litter(k, 11.6, 15.8, 1, 9, 30);
    // director's office
    fixture(k, 19, 4.6, { along: 'z', mode: 0, power: 20, color: 0xffe6c0 }); desk(k, 19, 2.4, 0); P_(k, 'modern_arm_chair_01', 19, 1.3, { ry: 0 }); P_(k, 'modern_arm_chair_01', 18, 4.6, { ry: PI + 0.4 }); P_(k, 'modern_arm_chair_01', 20.2, 4.7, { ry: PI - 0.5 }); cabinet(k, 16.95, 7.4, PI / 2); cabinet(k, 21.1, 7.6, -PI / 2); P_(k, 'potted_plant_02', 21, 0.9); P_(k, 'potted_plant_02', 16.9, 0.9); P('wall_clock', X(19), Y(k) + 2.5, Z(T) + 0.01, { mode: 'wall' }); pool(k, 19.2, 6, 2.2); litter(k, 16.8, 21.2, 0.8, 9, 12);
    // store room behind the stairs
    fixture(k, 17.3, 18.8, { mode: 3 }); glow(k, 17.3, 18.8, 2.2, 0xff3020, 6, 8); box(redGlow, X(17.2), X(17.4), Y(k) + CH - 0.12, Y(k) + CH - 0.04, Z(16.12), Z(16.2), { shadow: false }); for (const u of [13.9, 15.1, 16.3]) rack(k, u, 21.1, PI); cart(k, 20, 20.6, 0, 'industrial_storage_cart'); P_(k, 'propane_tank', 13.6, 16.8); P_(k, 'propane_tank', 14.1, 17); P_(k, 'hand_truck', 20.8, 17.2, { ry: -1 }); litter(k, 13.4, 21.2, 16.4, 21.2, 6);
    plate(k, 'x', 12.9, 20.05, -1, '倉庫', 'STORAGE', { y: 1.75 });
  }
  // ---------------- roof: plant, helipad, the green cross
  { blk = shell; const y = H; const hp = canvasTex(512, 512, (g, S) => { g.strokeStyle = 'rgba(232,228,210,0.85)'; g.lineWidth = 16; g.beginPath(); g.arc(S / 2, S / 2, S * 0.44, 0, 7); g.stroke(); g.fillStyle = 'rgba(232,228,210,0.85)'; g.fillRect(S * 0.3, S * 0.25, S * 0.09, S * 0.5); g.fillRect(S * 0.61, S * 0.25, S * 0.09, S * 0.5); g.fillRect(S * 0.3, S * 0.455, S * 0.4, S * 0.09); for (let i = 0; i < 900; i++) g.clearRect(rng() * S, rng() * S, 2 + rng() * 6, 2 + rng() * 16); });
    flat(decal(hp, { roughness: 0.7 }), X(6.6), y + 0.012, Z(6.2), 9, 9, 0);
    for (const [u, v] of [[2.2, 2], [11, 2], [2.2, 10.4], [11, 10.4]]) { box(redGlow, X(u - 0.06), X(u + 0.06), y + 0.14, y + 0.2, Z(v - 0.06), Z(v + 0.06), { shadow: false }); box(frameM, X(u - 0.08), X(u + 0.08), y, y + 0.14, Z(v - 0.08), Z(v + 0.08), { shadow: false }); }
    lts.push(addLight(X(6.6), y + 0.8, Z(6.2), 0xff4030, 10, 12));
    for (const [u, v, ry] of [[15.5, 2.2, 0], [17.6, 2.2, 0], [19.7, 2.2, 0], [19.8, 8.4, PI / 2]]) { box(plinth, X(u - 0.6), X(u + 0.6), y, y + 0.18, Z(v - 0.45), Z(v + 0.45)); P('exterior_aircon_unit', X(u), y + 0.18, Z(v), { ry }); col(X(u - 0.6), X(u + 0.6), Z(v - 0.5), Z(v + 0.5), y, y + 1.2, false); }
    const tk = cyl(M.rust, 1.25, 2.4, X(17), y + 1.9, Z(19.3), { seg: 20 }); tk.userData.shadow = true; for (const [du, dv] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) box(frameM, X(17 + du) - 0.06, X(17 + du) + 0.06, y, y + 0.7, Z(19.3 + dv) - 0.06, Z(19.3 + dv) + 0.06); col(X(15.7), X(18.3), Z(18), Z(20.6), y, y + 3.1, true);
    box(M.plate, X(3), X(6), y, y + 1.3, Z(18.4), Z(20.4)); col(X(3), X(6), Z(18.4), Z(20.4), y, y + 1.3, false); for (let i = 0; i < 2; i++) cyl(M.steel, 0.09, 6.5, X(7.6 + i * 0.4), y + 0.3 + i * 0.14, Z(17.2), { rx: PI / 2, seg: 8 });
    box(M.dark, ax + 0.9, ax + 1.02, y, y + 4.8, cz - 0.06, cz + 0.06); box(M.dark, ax + 0.9, ax + 1.02, y, y + 3, cz + 1.4, cz + 1.5, { rx: 0 }); box(greenGlow, ax + 0.84, ax + 0.98, y + 2.5, y + 5.1, cz - 0.4, cz + 0.4, { shadow: false }); box(greenGlow, ax + 0.84, ax + 0.98, y + 3.42, y + 4.18, cz - 1.3, cz + 1.3, { shadow: false });
    lts.push(addLight(ax + 0.2, y + 3.6, cz, 0x30ff90, 26, 14)); }

  // ================================================================== outside: canopy, signage, street dressing
  { box(M.dark, ax - 3.4, ax, 3.05, 3.3, cz - 2.6, cz + 2.6); box(emi(1.9, 2.1, 2.0), ax - 3.1, ax - 0.3, 3.03, 3.05, cz - 2.2, cz + 2.2, { shadow: false }); for (const s of [-1, 1]) { cyl(M.steel, 0.07, 3.05, ax - 3.1, 1.52, cz + s * 2.3); col(ax - 3.2, ax - 3.0, cz + s * 2.3 - 0.1, cz + s * 2.3 + 0.1, 0, 3.05, true); }
    colliders.push({ minX: ax - 3.4, maxX: ax, minZ: cz - 2.6, maxZ: cz + 2.6, wall: false, roof: true, ceil: 3.05, h: 3.3 });
    const em = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.62), signMat(512, 70, (c, Wd, Hd) => drawBoxSign(c, Wd, Hd, '救急  EMERGENCY', '#c8102e', '#ffffff', false), 2.2)); em.rotation.y = -PI / 2; em.position.set(ax - 3.42, 3.18, cz); em.userData.shadow = false; blk.add(em);
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(7.5, 0.95), signMat(1024, 128, (c, Wd, Hd) => { c.fillStyle = '#10201a'; c.fillRect(0, 0, Wd, Hd); c.fillStyle = '#dff7ea'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 ${Hd * 0.58}px ${FONT}`; c.fillText('路地裏総合病院  ROJIURA GENERAL', Wd / 2, Hd * 0.54, Wd * 0.94); }, 1.5)); nm.rotation.y = -PI / 2; nm.position.set(ax - 0.05, Y(1) + 0.48, cz); nm.userData.shadow = false; blk.add(nm);
    blade(ax, 7.4, cz + 7.2, -1, 0, '病院', '#f4f1e6', '#1f9d55', { parent: blk, w: 0.9, h: 3, light: 18, lights: lts });
    lts.push(addLight(ax - 1.7, 2.6, cz, 0xdff0ea, 26, 12), addLight(ax - 2.6, 2.2, cz + 5, 0xff5040, 12, 10), addLight(X(6.4), 2.5, bz + 1.4, 0xcff0e0, 16, 11), addLight(bx + 1.4, 2.5, cz, 0xcff0e0, 12, 10));
    box(redGlow, ax - 0.06, ax, 2.6, 2.72, cz - 1.9, cz - 1.6, { shadow: false }); box(emi(1.8, 2, 1.9), X(5.6), X(7.2), 2.62, 2.7, bz, bz + 0.05, { shadow: false }); box(emi(1.8, 2, 1.9), bx, bx + 0.05, 2.62, 2.7, cz - 0.6, cz + 0.6, { shadow: false });
    prop('wheelchair_01', ax - 2.2, 0, cz - 1.7, { parent: blk, ry: 1.9 }); prop('concrete_road_barrier', ax - 4.4, 0, cz + 4.2, { parent: blk, ry: PI / 2 + 0.1 }); prop('WetFloorSign_01', ax - 1.2, 0, cz + 1.8, { parent: blk, ry: 2 }); prop('trashbag', ax - 0.7, 0, cz - 4, { parent: blk }); prop('trashbag', ax - 0.9, 0, cz - 4.7, { parent: blk, ry: 2, s: 1.2 });
    flat(bloodDrag, ax - 2.2, 0.03, cz + 0.4, 1, 5, PI / 2 + 0.2); }

  // ================================================================== bake + runtime
  const bk = ctx.bakeBlock(shell, cx, cz), dress = lv.map(g => ctx.bakeBlock(g, cx, cz)), rec = { ...bk, kind: 'hospital', noFall: true, cols: colliders.slice(c0), lights: lts, home: bk.pivot.position.clone(), state: 0, t: 0, nx: 1, cone: null };
  ctx.buildings.push(rec); ctx.lods.push({ near: bk.near, pivot: bk.pivot, x: cx, z: cz, r: 18, nearIn: true, pivIn: true });
  if (Q.shadow >= 1024) for (const d of dress) d.near.traverse(o => { if (o.isInstancedMesh && !o.material.transparent && o.geometry.boundingSphere && (o.geometry.boundingSphere.radius > 0.45)) o.castShadow = true; });

  // two shadow-casting ceiling lights follow the player from fixture to fixture; every other fixture is served by the shared point-light pool
  const heroes = Q.shadow ? [0, 1].map(() => { const s = new THREE.SpotLight(0xffffff, 0, 13, 1.28, 0.7, 1.6); s.castShadow = true; s.shadow.mapSize.set(Q.shadow >= 2048 ? 1024 : 512, Q.shadow >= 2048 ? 1024 : 512); s.shadow.camera.near = 0.15; s.shadow.camera.far = 9; s.shadow.bias = -0.0025; s.shadow.normalBias = 0.03; s.shadow.autoUpdate = false; scene.add(s, s.target); return { s, rec: null, k: 0 }; }) : [];
  let heroT = 0; const want = [];
  function update(dt, t, pp) {
    const fa = (Math.sin(t * 43) > 0.2 || Math.sin(t * 5.3) > 0.55) ? 1 : 0.12, fb = (Math.sin(t * 2.1) + Math.sin(t * 13.7) * 0.5 + Math.sin(t * 31) * 0.3) > -0.7 ? 1 : 0.05;
    tubeMats[1].color.setRGB(2.3 * fa, 2.6 * fa, 2.4 * fa); tubeMats[2].color.setRGB(2.3 * fb, 2.6 * fb, 2.4 * fb);
    const near = pp.x > ax - 14 && pp.x < bx + 14 && pp.z > az - 14 && pp.z < bz + 14, inside = pp.x > ax && pp.x < bx && pp.z > az && pp.z < bz && pp.y < H - 0.5, far = Math.hypot(pp.x - cx, pp.z - cz) > 60;
    dress.forEach((d, k) => { d.pivot.visible = inside ? pp.y > Y(k) - 2.4 && pp.y < Y(k + 1) + 0.6 : k === 0 && !far; });
    for (const f of lts) if (f.mode !== undefined) f.intensity = near ? f.base * (f.mode === 1 ? fa : f.mode === 2 ? fb : 1) : 0;
    if (!heroes.length) return;
    heroT -= dt; if (heroT <= 0) { heroT = 0.15; want.length = 0; if (near) { const c = fixtures.filter(f => pp.y > f.lv[0] && pp.y < f.lv[1]).map(f => [f.position.distanceToSquared(pp), f]).sort((a, b) => a[0] - b[0]); for (let i = 0; i < 2 && i < c.length; i++) if (c[i][0] < 150) want.push(c[i][1]); } }
    for (const h of heroes) { const keep = h.rec && want.includes(h.rec);
      if (keep) h.k = Math.min(1, h.k + dt * 6); else { h.k = Math.max(0, h.k - dt * 6); if (h.k === 0) { if (h.rec) h.rec.heroK = 0; h.rec = want.find(w => !heroes.some(o => o.rec === w)) || null; if (h.rec) { h.s.position.copy(h.rec.position); h.s.position.y += 0.3; h.s.target.position.copy(h.rec.position); h.s.target.position.y -= 3; h.s.target.updateMatrixWorld(); h.s.color.copy(h.rec.color); } } }
      if (h.rec) { h.rec.heroK = h.k; h.s.intensity = h.rec.intensity * h.k * 1.15; h.s.shadow.needsUpdate = h.k > 0; } else h.s.intensity = 0; }
  }

  const bedU = wardBeds[HERO];
  return { minX: ax, maxX: bx, minZ: az, maxZ: bz, h: H, FH, levels: NF + 1, update,
    bed: new THREE.Vector3(X(bedU), Y(1) + 0.6, Z(bedV)), yaw: PI,
    ward: { minX: X(T + 0.5), maxX: X(12.3), minZ: Z(13.2), maxZ: Z(D - T - 0.5), y: Y(1) },
    links: [[[X(SU0 - 0.45), Z((LA0 + LA1) / 2), 0], [X(SU1 + 0.45), Z((LA0 + LA1) / 2), 1]], [[X(SU1 + 0.45), Z((LB0 + LB1) / 2), 1], [X(SU0 - 0.45), Z((LB0 + LB1) / 2), 2]], [[X(SU0 - 0.45), Z((LA0 + LA1) / 2), 2], [X(SU1 + 0.45), Z((LA0 + LA1) / 2), 3]]] };
}
