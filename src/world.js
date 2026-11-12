// The alley: modular photoscanned facades, wet reflective ground, neon, props and lighting.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const PI = Math.PI;
const FONT = '"Hiragino Sans","Yu Gothic","Noto Sans CJK JP","Noto Sans JP","IPAGothic",sans-serif';
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const PROPS = ['WetFloorSign_01', 'Barrel_01', 'cardboard_box_01', 'covered_car', 'concrete_road_barrier', 'hand_truck', 'exterior_aircon_unit', 'fire_hydrant',
  'korean_public_payphone_01', 'industrial_wall_lamp', 'metal_trash_can', 'old_tyre', 'plastic_crate_01', 'potted_plant_02', 'plastic_monobloc_chair_01', 'propane_tank',
  'power_box_01', 'rollershutter_door', 'rollershutter_window_01', 'security_camera_01', 'trashbag', 'utility_box_01', 'water_manhole_cover', 'wooden_crate_02',
  'modular_urban_apartments_facade'];

export async function buildWorld({ scene, renderer, manager, Q }) {
  const rng = mulberry(20241), rand = (a, b) => a + rng() * (b - a), pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const colliders = [], lights = [], steamPoints = [], tickers = [];
  const stat = new THREE.Group(); scene.add(stat);           // everything static: merged per material at the end
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // ---------------------------------------------------------------- loading
  const gl = new GLTFLoader(manager), tl = new THREE.TextureLoader(manager);
  const models = {};
  const envP = new RGBELoader(manager).loadAsync('assets/env.hdr');
  await Promise.all(PROPS.map(async n => { models[n] = (await gl.loadAsync(`assets/models/${n}/${n}.gltf`)).scene; }));
  for (const n in models) models[n].traverse(o => { if (o.isMesh) for (const k of ['map', 'normalMap', 'roughnessMap']) if (o.material[k]) o.material[k].anisotropy = maxAniso; });
  const env = await envP;
  env.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromEquirectangular(env).texture;
  scene.background = scene.environment; scene.backgroundBlurriness = 0.35; scene.backgroundIntensity = 0.045; scene.environmentIntensity = 0.3;
  env.dispose();
  scene.fog = new THREE.FogExp2(0x0b0d16, 0.019);

  const texCache = new Map();
  function tex(file, srgb, rep = 1) {
    const key = file + rep; if (texCache.has(key)) return texCache.get(key);
    const t = tl.load('assets/tex/' + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; t.repeat.set(rep, rep);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
  }
  function pbr(name, { rep = 1, rough = 1, color = 0xffffff, env = 1, nrm = 1 } = {}) {
    const arm = tex(name + '_arm.jpg', false, rep);
    return new THREE.MeshStandardMaterial({ map: tex(name + '_diff.jpg', true, rep), normalMap: tex(name + '_nor.jpg', false, rep), normalScale: new THREE.Vector2(nrm, nrm),
      roughnessMap: arm, aoMap: arm, metalnessMap: arm, metalness: 1, roughness: rough, color, envMapIntensity: env });
  }
  function canvasTex(w, h, draw, srgb = true) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; return t;
  }

  // materials (world-space UVs: one texture tile = 2 m unless stated)
  const M = {
    brickDark: pbr('dark_brick_wall', { rough: 0.8, color: 0xb8b0a8 }), brickRed: pbr('brick_wall_006', { rough: 0.85, color: 0x9c8c84 }),
    concrete: pbr('concrete_wall_008', { rough: 0.8, color: 0x9a9da0 }), plasterWorn: pbr('worn_plaster_wall', { rough: 0.85, color: 0xa8a49c }),
    plaster: pbr('plastered_wall_02', { rough: 0.8, color: 0x8a8c90 }), tileDark: pbr('concrete_tile_facade', { rough: 0.55, color: 0xc8ccd4 }),
    tileSq: pbr('square_tiled_wall', { rough: 0.5, color: 0x6a6660 }), planks: pbr('dark_planks', { rough: 0.75, color: 0x8c7c6c }),
    cedar: pbr('japanese_cedar_planks', { rough: 0.6, color: 0x7a5a40 }), shutter: pbr('painted_metal_shutter', { rough: 0.6, color: 0x9aa2aa }),
    rust: pbr('rusty_metal_02', { rough: 0.8, color: 0x8a7868 }), iron: pbr('corrugated_iron_02', { rough: 0.6 }), plate: pbr('metal_plate', { rough: 0.7 }),
    roof: pbr('ceramic_roof_01', { rough: 0.55, color: 0x6a6460 }), pave: pbr('concrete_pavement', { rough: 0.6, color: 0x8a8a8a }),
    dark: new THREE.MeshStandardMaterial({ color: 0x0c0d10, roughness: 0.5, metalness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.55, metalness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x8a9098, roughness: 0.35, metalness: 1 }),
    winDark: new THREE.MeshStandardMaterial({ color: 0x030406, roughness: 0.25, metalness: 0.3 }),
  };

  // ---------------------------------------------------------------- geometry helpers
  function boxGeo(w, h, d, tile = 2) {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
    return g;
  }
  function B(parent, mat, w, h, d, x, y, z, { ry = 0, rx = 0, rz = 0, tile = 2, shadow = true } = {}) {
    const m = new THREE.Mesh(boxGeo(w, h, d, tile), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.userData.shadow = shadow; parent.add(m); return m;
  }
  function addCollider(minX, maxX, minZ, maxZ, wall = false, h = wall ? 99 : 1.2) { colliders.push({ minX, maxX, minZ, maxZ, wall, h }); }
  function colliderFromObject(o, pad = 0) { const b = new THREE.Box3().setFromObject(o); addCollider(b.min.x - pad, b.max.x + pad, b.min.z - pad, b.max.z + pad, false, b.max.y); }

  // prop: clone (a subset of) a scanned model, re-centred. mode 'ground' = stands on y=0, 'wall' = back face on z=0 (sticks out along +z)
  function prop(name, x, y, z, { ry = 0, rx = 0, rz = 0, s = 1, filter = null, mode = 'ground', parent = stat, collide = false, tint = null } = {}) {
    const src = models[name], g = new THREE.Group(), inner = new THREE.Group();
    if (Q.thin && HEAVY.test(name) && rng() < Q.thin) { g.position.set(x, y, z); parent.add(g); return g; }   // lower tiers drop most of the densest scans
    src.updateMatrixWorld(true);
    src.traverse(o => { if (o.isMesh && (!filter || filter.test(o.name))) { const c = new THREE.Mesh(o.geometry, tint ? tinted(o.material, tint) : o.material); c.applyMatrix4(o.matrixWorld); c.userData.shadow = !NOSHADOW.test(name); c.userData.inst = true; inner.add(c); } });
    const b = new THREE.Box3().setFromObject(inner), c = b.getCenter(new THREE.Vector3());
    if (mode === 'ground') inner.position.set(-c.x, -b.min.y, -c.z); else if (mode === 'wall') inner.position.set(-c.x, -c.y, -b.min.z); else inner.position.set(-c.x, -c.y, -c.z);
    g.add(inner); g.position.set(x, y, z); g.rotation.set(rx, ry, rz); g.scale.setScalar(s); parent.add(g);
    if (collide) { g.updateMatrixWorld(true); colliderFromObject(g, 0.05); }
    return g;
  }
  const HEAVY = /aircon|cardboard|plastic_crate|power_box|camera|payphone|hydrant|potted|hand_truck|utility_box/;
  const NOSHADOW = /barrier|hydrant|payphone|aircon|power_box|camera|cardboard|plastic_crate|potted|manhole|wall_lamp|WetFloor/;
  const tintCache = new Map();
  function tinted(mat, color) { const k = mat.uuid + color; if (!tintCache.has(k)) { const m = mat.clone(); m.color.set(color); tintCache.set(k, m); } return tintCache.get(k); }

  // ---------------------------------------------------------------- modular facade kit
  const kitSrc = models.modular_urban_apartments_facade, kitNodes = {};
  for (const c of kitSrc.children) kitNodes[c.name] = c;
  kitSrc.traverse(o => { if (o.isMesh && /glass/.test(o.material.name)) { o.material.roughness = 0.06; o.material.metalness = 0; o.material.opacity = 0.35; o.material.envMapIntensity = 2.5; o.material.depthWrite = false; } });
  // the kit's wall panels are flat but tessellated into thousands of triangles: rebuild each as a few quads around its window/door hole, keeping the UV mapping
  const lowCache = new Map();
  function lowWall(g) {
    if (lowCache.has(g.uuid)) return lowCache.get(g.uuid);
    g.computeBoundingBox(); const bb = g.boundingBox; let out = g;
    if (bb.max.z - bb.min.z < 0.01 && g.index) {
      const pos = g.attributes.position, uv = g.attributes.uv, idx = g.index.array, N = 96, cov = new Uint8Array(N * N), x0 = bb.min.x, y0 = bb.min.y, w = bb.max.x - x0, h = bb.max.y - y0;
      for (let t = 0; t < idx.length; t += 3) { const ax = pos.getX(idx[t]), ay = pos.getY(idx[t]), bx = pos.getX(idx[t + 1]), by = pos.getY(idx[t + 1]), cx = pos.getX(idx[t + 2]), cy = pos.getY(idx[t + 2]);
        const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / w * N)), i1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cx) - x0) / w * N)), j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / h * N)), j1 = Math.min(N - 1, Math.floor((Math.max(ay, by, cy) - y0) / h * N)), den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const px = x0 + (i + 0.5) / N * w, py = y0 + (j + 0.5) / N * h, l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den; if (l1 >= -1e-4 && l2 >= -1e-4 && l1 + l2 <= 1.0001) cov[j * N + i] = 1; } }
      let hi0 = N, hi1 = -1, hj0 = N, hj1 = -1; for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) if (!cov[j * N + i]) { hi0 = Math.min(hi0, i); hi1 = Math.max(hi1, i); hj0 = Math.min(hj0, j); hj1 = Math.max(hj1, j); }
      // affine UV fit (least squares): u = a x + b y + c
      let sxx = 0, sxy = 0, sx = 0, syy = 0, sy = 0, n = pos.count, su = [0, 0, 0], sv = [0, 0, 0];
      for (let i = 0; i < n; i++) { const x = pos.getX(i), y = pos.getY(i), u = uv.getX(i), v = uv.getY(i); sxx += x * x; sxy += x * y; sx += x; syy += y * y; sy += y; su[0] += u * x; su[1] += u * y; su[2] += u; sv[0] += v * x; sv[1] += v * y; sv[2] += v; }
      const m3 = new THREE.Matrix3().set(sxx, sxy, sx, sxy, syy, sy, sx, sy, n).invert(), cu = new THREE.Vector3(...su).applyMatrix3(m3), cv = new THREE.Vector3(...sv).applyMatrix3(m3);
      const snap = (val, axis) => { let best = val, bd = 1e9; for (let i = 0; i < n; i++) { const q = axis ? pos.getY(i) : pos.getX(i), dd = Math.abs(q - val); if (dd < bd) { bd = dd; best = q; } } return best; };
      const rects = []; const x1 = x0 + w, y1 = y0 + h;
      if (hi1 < 0) rects.push([x0, y0, x1, y1]);
      else { const hx0 = snap(x0 + hi0 / N * w, 0), hx1 = snap(x0 + (hi1 + 1) / N * w, 0), hy0 = snap(y0 + hj0 / N * h, 1), hy1 = snap(y0 + (hj1 + 1) / N * h, 1);
        rects.push([x0, y0, hx0, y1], [hx1, y0, x1, y1], [hx0, y0, hx1, hy0], [hx0, hy1, hx1, y1]); }
      const P = [], U = [], I = []; for (const [ax, ay, bx, by] of rects) { if (bx - ax < 1e-3 || by - ay < 1e-3) continue; const b0 = P.length / 3;
        for (const [x, y] of [[ax, ay], [bx, ay], [bx, by], [ax, by]]) { P.push(x, y, bb.min.z); U.push(cu.x * x + cu.y * y + cu.z, cv.x * x + cv.y * y + cv.z); } I.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); }
      out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); out.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); out.setAttribute('normal', new THREE.Float32BufferAttribute(P.map((_, i) => i % 3 === 2 ? 1 : 0), 3)); out.setIndex(I);
    }
    lowCache.set(g.uuid, out); return out;
  }
  function kit(parent, name, x, y, z, wallMat) {
    const src = kitNodes[name]; if (!src) { console.warn('kit piece missing', name); return; }
    const add = (o) => { const pl = /plaster/.test(o.material.name), m = new THREE.Mesh(pl ? lowWall(o.geometry) : o.geometry, pl && wallMat ? wallMat : o.material); m.position.set(x, y, z); m.userData.shadow = false; m.userData.inst = !(pl && m.geometry !== o.geometry); parent.add(m); };
    if (src.isMesh) add(src); else src.children.forEach(add);
  }
  // window interiors seen through the glass
  const interiorMats = [0, 1, 2, 3].map(style => new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(style === 2 ? 1.5 : 1.9), map: canvasTex(256, 256, (g, W, H) => {
    if (style === 0) {        // shoji paper screen
      const gr = g.createRadialGradient(W * 0.5, H * 0.45, 10, W * 0.5, H * 0.5, W * 0.75); gr.addColorStop(0, '#ffe2ae'); gr.addColorStop(1, '#c8853c'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = 'rgba(30,18,8,0.28)'; g.beginPath(); g.ellipse(W * 0.3, H * 0.95, 34, 90, 0, 0, 7); g.fill();
      g.fillStyle = '#2a170a'; for (let i = 0; i <= 4; i++) g.fillRect(i * W / 4 - 3, 0, 6, H); for (let j = 0; j <= 5; j++) g.fillRect(0, j * H / 5 - 2, W, 4);
    } else if (style === 1) { // curtains
      for (let x = 0; x < W; x++) { const v = 0.62 + 0.38 * Math.sin(x * 0.21) * Math.sin(x * 0.043 + 1); g.fillStyle = `rgb(${255 * v | 0},${170 * v | 0},${80 * v | 0})`; g.fillRect(x, 0, 1, H); }
      g.fillStyle = 'rgba(255,240,200,0.5)'; g.fillRect(W * 0.46, 0, W * 0.08, H);
    } else if (style === 2) { // blinds, cold tube light
      g.fillStyle = '#bfe0ff'; g.fillRect(0, 0, W, H); g.fillStyle = 'rgba(10,20,40,0.6)'; for (let y = 0; y < H; y += 12) g.fillRect(0, y, W, 5);
    } else {                  // room with a ceiling light
      const gr = g.createRadialGradient(W * 0.6, H * 0.15, 5, W * 0.6, H * 0.2, W); gr.addColorStop(0, '#fff3d0'); gr.addColorStop(0.5, '#d89a50'); gr.addColorStop(1, '#402010'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      g.fillStyle = '#120a06'; g.fillRect(W * 0.08, H * 0.62, W * 0.3, H * 0.4); g.fillRect(W * 0.55, H * 0.72, W * 0.4, H * 0.3); g.fillRect(W * 0.12, H * 0.3, W * 0.16, H * 0.2);
    }
  }) }));

  const UP_TYPES = ['win', 'win', 'win', 'dbl', 'sml', 'sml', 'blank'];
  const KITNAME = { win: 'centered_large', dbl: 'centered_double', sml: 'centered_small' }, WIN_W = { win: 1.7, dbl: 2.3, sml: 0.85 };
  // A building face. Local frame: +x runs along the wall, +z points out into the street.
  function facade({ x, z, ry, bays, floors, wall, ground = [], depth = 8, lit = 0.36, crown = true, bodyH = 0.5, roofGear = true, bid, parent = stat, inset = 0, acP = 0.6 }) {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; parent.add(g); if (bid !== undefined) { g.userData.bid = bid; g.userData.lights = []; }
    const W = bays * 3, H = floors * 3;
    for (let f = 0; f < floors; f++) for (let i = 0; i < bays; i++) {
      let type = f === 0 ? (ground[i] || 'blank') : pick(UP_TYPES);
      const lx = 3 * (i + 1), y = 3 * f, k = f <= 1 ? 1 : 2;
      if (type === 'door') { kit(g, 'wall_door_centered_small_02', lx, y, 0, wall); kit(g, 'door_centered_small_02', lx, y, 0); }
      else if (KITNAME[type]) {
        kit(g, `wall_window_${KITNAME[type]}_0${k}`, lx, y, 0, wall); kit(g, `window_${KITNAME[type]}_0${k}`, lx, y, 0);
        const on = rng() < lit, p = new THREE.Mesh(new THREE.PlaneGeometry(WIN_W[type] + 0.3, 2.0), on ? pick(interiorMats) : M.winDark);
        p.position.set(lx - 1.5, y + 1.3, -0.3); p.userData.shadow = false; g.add(p);
      } else {
        kit(g, 'wall_standard_standard_01', lx, y, 0, wall);
        if (f > 0 && rng() < acP) prop('exterior_aircon_unit', lx - 1.5 + rand(-0.5, 0.5), y + rand(0.5, 1.2), 0.0, { parent: g, mode: 'wall', filter: rng() < 0.5 ? /^exterior_aircon_unit_\d/ : /rusted/, s: 1.05 });
      }
    }
    for (let i = 0; i < bays; i++) { if (floors > 1) kit(g, 'cornice_standard_standard_01', 3 * (i + 1), 3, 0); if (crown) kit(g, 'crown_standard_standard_01', 3 * (i + 1), H, 0); }
    const body = B(g, wall, W - inset * 2, H + bodyH, depth, W / 2, (H + bodyH) / 2, -0.36 - depth / 2);
    B(g, M.pave, W + 0.3 - inset * 2, 0.25, depth + 0.5, W / 2, H + bodyH + 0.12, -0.3 - depth / 2);   // parapet cap / roof slab
    if (roofGear && depth > 3) for (let i = 0; i < 2 + bays / 2; i++) {
      const rx = rand(1, W - 1), rz = -rand(1.5, depth - 1), kind = rng();
      if (kind < 0.5) B(g, parent === stat ? pick([M.iron, M.rust, M.plate]) : M.rust, rand(1, 2.2), rand(0.8, 1.6), rand(1, 1.8), rx, H + bodyH + 0.8, rz);
      else if (kind < 0.75) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.8, 20), M.rust); c.position.set(rx, H + bodyH + 1.6, rz); g.add(c); B(g, M.dark, 1.5, 0.7, 1.5, rx, H + bodyH + 0.35, rz); }
      else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 5, 6), M.dark); c.position.set(rx, H + bodyH + 2.5, rz); g.add(c); }
    }
    g.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(body);
    const n = new THREE.Vector3(Math.sin(ry), 0, Math.cos(ry));
    addCollider(Math.min(bb.min.x, bb.min.x + n.x * 0.5), Math.max(bb.max.x, bb.max.x + n.x * 0.5), Math.min(bb.min.z, bb.min.z + n.z * 0.5), Math.max(bb.max.z, bb.max.z + n.z * 0.5), true, H + bodyH + 0.245);
    g.userData.col = colliders[colliders.length - 1]; g.userData.H = H + bodyH + 0.245;
    return g;
  }

  // ---------------------------------------------------------------- custom shopfront pieces (placed in facade-local space)
  function bigShutter(g, lx, w = 2.6, h = 2.7, graffiti = false) {
    B(g, M.dark, w + 0.24, h + 0.5, 0.14, lx, (h + 0.5) / 2, 0.05);                 // steel frame
    B(g, M.shutter, w, h, 0.06, lx, h / 2, 0.13, { tile: 1.3 });
    B(g, M.rust, w + 0.3, 0.34, 0.3, lx, h + 0.42, 0.14, { tile: 1 });              // roller housing
    B(g, M.steel, w, 0.07, 0.09, lx, 0.04, 0.15);
    if (graffiti) { const t = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.6), graffitiMat); t.position.set(lx, h * 0.45, 0.165); t.userData.shadow = false; g.add(t); }
  }
  const graffitiMat = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, map: canvasTex(512, 384, (g, W, H) => {
    g.lineCap = g.lineJoin = 'round'; const cols = ['#ff3d7f', '#35e0ff', '#f5e642', '#ffffff', '#8a5cff'];
    for (let i = 0; i < 9; i++) { g.strokeStyle = cols[i % 5]; g.globalAlpha = 0.75; g.lineWidth = 6 + rng() * 14; g.beginPath(); let px = 40 + rng() * (W - 80), py = 60 + rng() * (H - 120); g.moveTo(px, py);
      for (let k = 0; k < 4; k++) { g.quadraticCurveTo(px + rand(-90, 90), py + rand(-90, 90), px += rand(-110, 110), py += rand(-70, 70)); } g.stroke(); }
    g.globalAlpha = 0.9; g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.lineWidth = 12; g.strokeStyle = '#08080a'; g.strokeText('忍者', W / 2, H * 0.62); g.fillStyle = '#f5e642'; g.fillText('忍者', W / 2, H * 0.62);
  }) });

  // emissive signage -------------------------------------------------
  function signMat(w, h, draw, intensity = 2.2) {
    const t = canvasTex(w, h, draw);
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: intensity, roughness: 0.35, metalness: 0 });
  }
  function drawBoxSign(g, W, H, text, bg, fg, vertical) {
    const gr = g.createLinearGradient(0, 0, W, H); gr.addColorStop(0, bg); gr.addColorStop(1, shade(bg, 0.72)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = fg; g.globalAlpha = 0.55; g.lineWidth = W * 0.02; g.strokeRect(W * 0.05, W * 0.05, W - W * 0.1, H - W * 0.1); g.globalAlpha = 1;
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (vertical) { const ch = [...text], step = (H - W * 0.3) / ch.length; g.font = `900 ${Math.min(step * 0.9, W * 0.78)}px ${FONT}`; ch.forEach((c, i) => g.fillText(c, W / 2, W * 0.15 + step * (i + 0.5))); }
    else { g.font = `900 ${H * 0.62}px ${FONT}`; g.fillText(text, W / 2, H * 0.54, W * 0.86); }
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.1})`; g.fillRect(rng() * W, rng() * H, 1 + rng() * 3, 2 + rng() * 22); }   // dirt streaks on the acrylic
  }
  function shade(hex, k) { const c = new THREE.Color(hex).multiplyScalar(k); return '#' + c.getHexString(); }
  // projecting sign box: mounted on a wall at (x,y,z), sticking out along normal (nx,nz)
  function blade(x, y, z, nx, nz, text, bg, fg, { w = 0.62, h = 2.6, light = 0, intensity = 2.2, owner = null, parent = stat, mat = null, lights: lt = null } = {}) {
    const g = new THREE.Group(); g.position.set(x + nx * (w / 2 + 0.25), y, z + nz * (w / 2 + 0.25)); g.rotation.y = Math.atan2(nx, nz) - PI / 2; parent.add(g);
    const m = mat || signMat(128, Math.round(128 * h / w), (c, W, H) => drawBoxSign(c, W, H, text, bg, fg, true), intensity);
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.16), [M.dark, M.dark, M.dark, M.dark, m, m]); g.add(box);
    B(g, M.dark, 0.5, 0.05, 0.05, -(w / 2 + 0.12), h * 0.35, 0); B(g, M.dark, 0.5, 0.05, 0.05, -(w / 2 + 0.12), -h * 0.35, 0);
    if (light) { const L = addLight(g.position.x + nx * 0.6, y - 0.3, g.position.z + nz * 0.6, bg, light, 11); if (owner) owner.userData.lights.push(L); if (lt) lt.push(L); }
    if (owner) { stat.updateMatrixWorld(true); owner.attach(g); }
    return g;
  }
  // flat neon-tube sign on a dark backing panel
  function neon(parent, lx, y, lz, text, color, { w = 2.4, h = 0.8, font = 0.7, core = '#ffffff', frame = true } = {}) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.4, 2.4, 2.4), map: canvasTex(512, Math.round(512 * h / w), (g, W, H) => {
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${H * font}px ${FONT}`; g.lineJoin = 'round';
      g.shadowColor = color; g.strokeStyle = color;
      for (const [blur, lw] of [[H * 0.22, H * 0.05], [H * 0.1, H * 0.045], [H * 0.04, H * 0.04]]) { g.shadowBlur = blur; g.lineWidth = lw; g.strokeText(text, W / 2, H / 2, W * 0.9); }
      g.shadowBlur = 0; g.strokeStyle = core; g.lineWidth = H * 0.014; g.strokeText(text, W / 2, H / 2, W * 0.9);
    }) });
    if (frame) { B(parent, M.black, w + 0.1, h + 0.1, 0.05, lx, y, lz + 0.03, { shadow: false }); }
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); p.position.set(lx, y, lz + 0.075); p.userData.dynamic = true; p.userData.noAO = true; parent.add(p);
    return p;
  }
  // real 3D glass tubes (for simple shapes)
  function tube(parent, pts, color, r = 0.018, closed = false, k = 3) {
    const c = new THREE.Color(color).multiplyScalar(k);
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), closed, 'catmullrom', 0.01), pts.length * 10, r, 6, closed), new THREE.MeshBasicMaterial({ color: c }));
    m.userData.shadow = false; parent.add(m); return m;
  }
  const spots = [], cones = [];
  function addLight(x, y, z, color, intensity, dist = 12, rain = true) {
    const l = { position: new THREE.Vector3(x, y, z), color: new THREE.Color(color), intensity, distance: dist, userData: {} }; spots.push(l);   // a light *record*: a small pool of real lights follows the player
    if (rain) lights.push({ pos: l.position, color: l.color, light: l, base: intensity }); return l;
  }

  // paper lantern (chochin)
  const lanternGeo = new THREE.LatheGeometry([[0.001, 0.36], [0.1, 0.36], [0.11, 0.32], [0.19, 0.27], [0.25, 0.17], [0.275, 0.05], [0.275, -0.05], [0.25, -0.17], [0.19, -0.27], [0.11, -0.32], [0.1, -0.36], [0.001, -0.36]].map(p => new THREE.Vector2(p[0], p[1])), 24);
  const lanternMats = ['酒', '祭', '忍', '鬼'].map(ch => { const t = canvasTex(256, 256, (g, W, H) => { g.translate(W, H); g.rotate(Math.PI);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#16100e'); gr.addColorStop(0.14, '#16100e'); gr.addColorStop(0.16, '#d02818'); gr.addColorStop(0.5, '#ff5a2a'); gr.addColorStop(0.84, '#c82414'); gr.addColorStop(0.86, '#16100e'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(60,0,0,0.25)'; for (let y = 44; y < H - 40; y += 9) g.fillRect(0, y, W, 2);
    g.fillStyle = '#120806'; g.font = `900 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, W * 0.25, H / 2); g.fillText(ch, W * 0.75, H / 2);
  }); return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.8 }); });
  function lantern(parent, x, y, z, s = 1, mat = pick(lanternMats)) { const m = new THREE.Mesh(lanternGeo, mat); m.position.set(x, y, z); m.scale.setScalar(s); m.rotation.y = rng() * 6; m.userData.shadow = false; parent.add(m); return m; }
  const cableMat = new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.5 });
  function cable(a, b, sag = 0.4, r = 0.014) {
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5); mid.y -= sag;
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 14, r, 5), cableMat); m.userData.shadow = false; stat.add(m);
    return (t) => new THREE.QuadraticBezierCurve3(a, mid, b).getPoint(t);
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ================================================================ LAYOUT
  const HW = 4.5;                                                   // alley half width; alley runs z = -24 (north, dead end) .. +24 (south, barricade)
  // left side (faces +x; local x runs toward -z)
  const L1 = facade({ bid: 1, x: -HW, z: 24, ry: PI / 2, bays: 4, floors: 4, wall: M.brickDark, ground: ['shutter', 'door', 'blank', 'gshutter'] });
  const L2 = facade({ x: -HW, z: 12, ry: PI / 2, bays: 3, floors: 3, wall: M.tileDark, ground: ['blank', 'blank', 'door'] });
  const NK = facade({ x: -HW - 8, z: 3, ry: PI / 2, bays: 4, floors: 4, wall: M.plasterWorn, ground: ['gshutter', 'door', 'blank', 'shutter'], lit: 0.25 });
  const L3 = facade({ x: -HW, z: -9, ry: PI / 2, bays: 5, floors: 5, wall: M.concrete, ground: ['door', 'shutter', 'shutter', 'blank', 'dbl'] });
  // right side (faces -x; local x runs toward +z)
  const R1 = facade({ bid: 0, x: HW, z: -24, ry: -PI / 2, bays: 4, floors: 3, wall: M.plaster, ground: ['blank', 'door', 'shutter', 'blank'] });
  const R2 = facade({ x: HW, z: -12, ry: -PI / 2, bays: 4, floors: 2, wall: M.planks, ground: ['blank', 'blank', 'blank', 'door'], lit: 0.7, crown: false, roofGear: false });
  const R3 = facade({ x: HW, z: 0, ry: -PI / 2, bays: 3, floors: 5, wall: M.brickRed, ground: ['door', 'dbl', 'shutter'] });
  const R4 = facade({ x: HW, z: 9, ry: -PI / 2, bays: 5, floors: 4, wall: M.tileSq, ground: ['gshutter', 'blank', 'door', 'blank', 'shutter'] });
  // north dead end (faces +z; local x runs toward +x)
  const N1 = facade({ x: -HW, z: -24, ry: 0, bays: 3, floors: 4, wall: M.brickDark, ground: ['shutter', 'shutter', 'door'], lit: 0.2 });
  // shopfront details on ground floors
  const shutters = [[L1, 0, 0], [L1, 3, 1], [NK, 0, 1], [NK, 3, 0], [L3, 1, 0], [L3, 2, 1], [R1, 2, 0], [R3, 2, 0], [R4, 0, 1], [R4, 4, 0], [N1, 0, 0], [N1, 1, 1]];
  for (const [g, bay, gr] of shutters) bigShutter(g, bay * 3 + 1.5, 2.6, 2.7, !!gr);

  // side walls closing the nook are the bodies of L2 / L3. South of z=24 the street continues, dressed only with simple volumes and fog.
  // (the alley now opens onto the city: no barricade, no backdrop boxes)

  // ---------------------------------------------------------------- ground: wet asphalt with puddles and a planar reflection
  const reflScale = Q.refl;
  const ground = new Reflector(new THREE.PlaneGeometry(980, 980), { textureWidth: Math.max(16, Math.round(innerWidth * reflScale)), textureHeight: Math.max(16, Math.round(innerHeight * reflScale)), clipBias: 0.002, multisample: Q.reflMsaa || 0 });
  const reflRT = ground.getRenderTarget(); reflRT.texture.generateMipmaps = true; reflRT.texture.minFilter = THREE.LinearMipmapLinearFilter;
  const reflMatrix = ground.material.uniforms.textureMatrix.value;
  const gUniforms = { tRefl: { value: reflRT.texture }, uReflMat: { value: reflMatrix }, uTime: { value: 0 }, uReflOn: { value: Q.refl > 0 ? 1 : 0 } };
  const gMat = pbr('asphalt_02', { rep: 980 / 3.2, rough: 1, env: Q.refl > 0 ? 0.12 : 0.08, nrm: 1.2 });
  gMat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, gUniforms);
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec4 vReflUv; uniform mat4 uReflMat;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vReflUv = uReflMat * vec4(transformed, 1.0);');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vWPos; varying vec4 vReflUv; uniform sampler2D tRefl; uniform float uTime; uniform float uReflOn; float pud;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ return 0.5*vn(p) + 0.25*vn(p*2.03+7.1) + 0.125*vn(p*4.01+3.3) + 0.0625*vn(p*8.1); }
      vec2 ripples(vec2 p, float t){ vec2 acc = vec2(0.0);
        for (int k = 0; k < 3; k++) { float fk = float(k); vec2 q = p * (1.6 + fk * 0.9) + fk * 17.3; vec2 c = floor(q); vec2 f = fract(q) - 0.5;
          float r = h21(c + fk); float tt = fract(t * (0.8 + 0.6 * r) + r * 7.0); vec2 d = f - (vec2(h21(c + 3.1), h21(c + 7.7)) - 0.5) * 0.6; float l = length(d), R = tt * 0.42;
          float w = sin(48.0 * (l - R)) * smoothstep(R + 0.03, R, l) * smoothstep(R - 0.10, R, l) * (1.0 - tt); acc += d / max(l, 1e-3) * w; }
        return acc; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float pn = fbm(vWPos.xz * 0.27 + 3.7) + 0.35 * (0.5 - dot(diffuseColor.rgb, vec3(0.33))) ;
        pud = smoothstep(0.47, 0.56, pn);
        diffuseColor.rgb *= mix(0.42, 0.2, pud);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor * 0.42, 0.015, pud);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz); vec2 rp = ripples(vWPos.xz, uTime);
        normal = normalize(mix(normal, upV, pud * 0.985) + (viewMatrix * vec4(rp.x, 0.0, rp.y, 0.0)).xyz * 0.12 * pud);`)
      .replace('#include <opaque_fragment>', `
        { vec3 Vv = normalize(vViewPosition); float ndv = saturate(dot(normal, Vv));
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          vec2 ruv = vReflUv.xy / vReflUv.w + nW.xz * mix(0.09, 0.05, pud);
          vec3 refl = textureLod(tRefl, ruv, mix(3.6, 0.0, pud)).rgb;
          float fres = mix(0.05, 1.0, pow(clamp(1.0 - ndv, 0.0, 1.0), 3.5));
          float k = fres * mix(0.55, 1.0, pud) * uReflOn;
          refl = min(max(refl, vec3(0.0)), vec3(64.0)); outgoingLight = outgoingLight * (1.0 - 0.6 * k) + refl * k; }
        #include <opaque_fragment>`);
  };
  ground.material = gMat; ground.rotation.x = -PI / 2; ground.receiveShadow = true; ground.userData.dynamic = true; scene.add(ground);
  let reflFrame = -1; const reflRender = ground.onBeforeRender;
  ground.onBeforeRender = function (r, s, cam) { if (!gUniforms.uReflOn.value || reflFrame === renderer.info.render.frame || cam.userData.noRefl || (Q.reflSkip && renderer.info.render.frame % 2)) return; reflFrame = renderer.info.render.frame; reflRender.apply(this, arguments); };
  // concrete drainage strips along both walls + kerb lip
  for (const sx of [-1, 1]) for (let z = -24; z < 24; z += 4) {
    if (sx < 0 && z >= -9 && z < 3) continue;
    B(stat, M.pave, 0.6, 0.06, 3.96, sx * (HW - 0.3), 0.03, z + 2, { tile: 1.2 });
  }
  B(stat, M.pave, 0.25, 0.1, 12, -HW - 0.1, 0.05, -3, { tile: 1.2 });                // kerb at the mouth of the nook
  for (const [x, z] of [[0.8, 14], [-1.2, -6.5], [1.5, -17], [-8.5, -6]]) prop('water_manhole_cover', x, 0.004, z, { ry: rng() * 6, s: 1.1 });
  steamPoints.push(V(-1.2, 0.05, -6.5), V(0.8, 0.05, 14), V(3.9, 2.9, -13.2));
  // painted road marking
  { const t = canvasTex(256, 512, (g, W, H) => { g.fillStyle = '#d8d8d0'; g.font = `900 150px ${FONT}`; g.textAlign = 'center'; [...'止まれ'].forEach((c, i) => g.fillText(c, W / 2, 150 + i * 160));
      g.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 2600; i++) { g.globalAlpha = rng() * 0.7; g.fillRect(rng() * W, rng() * H, rng() * 9, rng() * 5); } });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.6), new THREE.MeshStandardMaterial({ map: t, transparent: true, opacity: 0.55, roughness: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
    m.rotation.x = -PI / 2; m.position.set(0, 0.006, 17.5); m.userData.dynamic = true; m.userData.noAO = true; m.receiveShadow = true; scene.add(m); }

  // ---------------------------------------------------------------- the izakaya (hero shopfront, right side, z -9..-3)
  {
    const g = new THREE.Group(); g.position.set(HW, 0, -9); g.rotation.y = -PI / 2; stat.add(g);   // local x: 0..6 along +z, local z out into the alley
    for (const px of [0, 3, 6]) B(g, M.cedar, 0.16, 2.9, 0.16, px, 1.45, 0.1, { tile: 1 });
    B(g, M.cedar, 6.3, 0.2, 0.2, 3, 2.62, 0.1, { tile: 1 }); B(g, M.cedar, 6.3, 0.12, 0.14, 3, 0.06, 0.1, { tile: 1 });
    const shoji = signMat(256, 512, (c, W, H) => {
      const gr = c.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.5, H * 0.7); gr.addColorStop(0, '#ffe9bd'); gr.addColorStop(1, '#d79045'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
      c.fillStyle = 'rgba(40,20,5,0.22)'; c.beginPath(); c.ellipse(W * 0.62, H * 0.62, 30, 46, 0, 0, 7); c.fill(); c.fillRect(W * 0.5, H * 0.66, 64, H * 0.2);
      c.fillStyle = '#21130a'; for (let i = 0; i <= 3; i++) c.fillRect(i * W / 3 - 4, 0, 8, H); for (let j = 0; j <= 7; j++) c.fillRect(0, j * H * 0.8 / 7 - 3, W, 6); c.fillRect(0, H * 0.8, W, H * 0.2);
      c.fillStyle = '#3a2414'; c.fillRect(8, H * 0.82, W - 16, H * 0.16);
    }, 0.8);
    for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.36, 2.4, 0.05), [M.cedar, M.cedar, M.cedar, M.cedar, shoji, M.cedar]); p.position.set(0.86 + i * 1.43, 1.3, 0.06 + (i % 2) * 0.05); g.add(p); }
    // noren curtains
    [...'居酒屋忍び'].forEach((ch, i) => {
      const t = canvasTex(128, 128, (c, W, H) => { c.fillStyle = '#16233f'; c.fillRect(0, 0, W, H); for (let k = 0; k < 500; k++) { c.fillStyle = `rgba(255,255,255,${rng() * 0.04})`; c.fillRect(rng() * W, rng() * H, 1, 8); }
        c.fillStyle = '#e9e4d6'; c.font = `900 84px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, W / 2, H / 2 + 4); });
      const n = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.74, 4, 1), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 }));
      const pos = n.geometry.attributes.position; for (let k = 0; k < pos.count; k++) pos.setZ(k, Math.sin(pos.getX(k) * 9 + i) * 0.03 * (0.5 - pos.getY(k))); n.geometry.computeVertexNormals();
      n.position.set(1.2 + i * 0.9, 2.14, 0.32); n.rotation.x = 0.05 * Math.sin(i * 2.1); g.add(n);
    });
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 4.9, 8), M.cedar); rod.rotation.z = PI / 2; rod.position.set(3, 2.52, 0.32); g.add(rod);
    // tiled pent roof
    B(g, M.roof, 6.9, 0.07, 1.6, 3, 3.22, 0.72, { rx: 0.42, tile: 1.4 }); B(g, M.cedar, 6.9, 0.06, 1.55, 3, 3.15, 0.7, { rx: 0.42, tile: 1 });
    for (let i = 0; i < 9; i++) B(g, M.cedar, 0.07, 0.09, 1.5, 0.15 + i * 0.84, 3.09, 0.7, { rx: 0.42, tile: 1 });
    lantern(g, -0.25, 2.25, 0.75, 1.25, lanternMats[0]); lantern(g, 6.25, 2.25, 0.75, 1.25, lanternMats[0]);
    for (const lx of [-0.25, 6.25]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.5), M.black); s.position.set(lx, 2.95, 0.75); g.add(s); }
    neon(g, 3, 4.05, 0.02, '居酒屋 しのび', '#ff7a2a', { w: 3.6, h: 0.8, font: 0.62 });
    // sandwich board menu
    const menu = signMat(128, 256, (c, W, H) => { c.fillStyle = '#10140f'; c.fillRect(0, 0, W, H); c.fillStyle = '#f1ede0'; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; ['本日', 'ラーメン', '¥800', '生ビール', '¥500', '餃子', '¥400'].forEach((s, i) => c.fillText(s, W / 2, 40 + i * 32)); }, 0.25);
    const mb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.95, 0.04), [M.cedar, M.cedar, M.cedar, M.cedar, menu, M.cedar]); mb.position.set(-0.6, 0.47, 1.0); mb.rotation.set(-0.22, 0.5, 0); g.add(mb);
    addLight(HW - 1.5, 1.9, -6, 0xffa050, 22, 13); addLight(HW - 0.9, 2.3, -9.3, 0xff4a20, 9, 7, false); addLight(HW - 0.9, 2.3, -2.7, 0xff4a20, 9, 7, false);
    prop('potted_plant_02', HW - 0.5, 0, -9.5, { s: 1.25, filter: /pot$|leaves/ }); prop('potted_plant_02', HW - 0.5, 0, -2.4, { ry: 2, s: 1.1, filter: /pot$|leaves/ });
    prop('plastic_monobloc_chair_01', HW - 0.75, 0, -1.4, { ry: -1.9, collide: true });
    for (let i = 0; i < 3; i++) prop('plastic_crate_01', HW - 0.45, i * 0.262, -11.1, { ry: PI / 2 + rand(-0.12, 0.12), s: 1.15, tint: pick([0xd0a020, 0xa02020, 0x2050a0]) });
    prop('plastic_crate_01', HW - 0.45, 0, -11.75, { ry: 0.3, s: 1.15, tint: 0x2050a0 });
    prop('propane_tank', HW - 0.4, 0, -12.6, { collide: true }); prop('propane_tank', HW - 0.42, 0, -13.0, { ry: 1 });
    addCollider(HW - 0.75, HW, -11.9, -10.7);
  }

  // ---------------------------------------------------------------- vending machines
  function vending(x, z, ry, body, accent, brand) {
    const draw = (em) => (g, W, H) => {
      g.fillStyle = em ? '#000' : body; g.fillRect(0, 0, W, H);
      const wx = 34, wy = 60, ww = W - 68, wh = 470;
      if (!em) { g.fillStyle = '#0b0c0f'; g.fillRect(wx - 8, wy - 8, ww + 16, wh + 16); }
      const gr = g.createLinearGradient(0, wy, 0, wy + wh); gr.addColorStop(0, '#f6fbff'); gr.addColorStop(1, '#cfe2f2'); g.fillStyle = gr; g.fillRect(wx, wy, ww, wh);
      for (let r = 0; r < 3; r++) {
        const sy = wy + 14 + r * 152;
        for (let c = 0; c < 7; c++) {
          const bx = wx + 16 + c * ((ww - 32) / 7), bw = (ww - 32) / 7 - 9, hue = (c * 53 + r * 97 + (brand.length * 31)) % 360, can = (c + r) % 3 === 0, bh = can ? 78 : 104, by = sy + 108 - bh;
          g.fillStyle = `hsl(${hue},70%,${em ? 42 : 46}%)`; g.beginPath(); g.roundRect(bx, by, bw, bh, can ? 5 : [12, 12, 5, 5]); g.fill();
          if (!can) { g.fillStyle = em ? '#bbb' : '#e8e8e8'; g.fillRect(bx + bw * 0.3, by - 9, bw * 0.4, 11); }
          g.fillStyle = `hsl(${(hue + 40) % 360},45%,88%)`; g.fillRect(bx, by + bh * 0.38, bw, bh * 0.3);
          g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(bx + 4, by + 6, 4, bh - 12);
          g.fillStyle = em ? '#111' : '#17181c'; g.fillRect(bx - 2, sy + 114, bw + 4, 22);
          g.fillStyle = (c + r) % 4 === 0 ? '#ff4030' : '#40a0ff'; g.fillRect(bx + 2, sy + 118, bw - 4, 6);
          g.fillStyle = em ? '#444' : '#e8e8e8'; g.fillRect(bx + bw * 0.25, sy + 127, bw * 0.5, 6);
        }
        g.fillStyle = em ? '#222' : '#8b8f96'; g.fillRect(wx, sy + 138, ww, 6);
      }
      g.fillStyle = em ? shade(accent, 0.7) : accent; g.fillRect(0, 548, W, 74);
      g.fillStyle = '#fff'; g.font = `900 46px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(brand, 40, 587);
      if (!em) { g.fillStyle = '#16171a'; g.fillRect(W - 150, 640, 112, 150); g.fillStyle = '#2c2f36'; g.fillRect(W - 138, 652, 88, 34); g.fillStyle = '#9aa0a8'; g.fillRect(W - 120, 706, 54, 8); g.fillRect(W - 110, 736, 34, 34); }
      g.fillStyle = em ? '#30ff70' : '#1c7a3a'; g.fillRect(W - 132, 658, 76, 22);
      g.fillStyle = em ? '#000' : '#0c0c0e'; g.fillRect(40, 850, W - 80, 120); if (!em) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(48, 858, W - 96, 18); }
      if (!em) for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${rng() * 0.07})`; g.fillRect(rng() * W, rng() * H, 1 + rng() * 2, 3 + rng() * 26); }
    };
    const map = canvasTex(512, 1024, draw(false)), em = canvasTex(512, 1024, draw(true));
    const front = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.22, metalness: 0.1 });
    const side = new THREE.MeshStandardMaterial({ color: body, roughness: 0.35, metalness: 0.4 });
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.86, 0.74), [side, side, side, side, front, side]); m.position.set(x, 0.96, z); m.rotation.y = ry; stat.add(m);
    B(stat, M.dark, 1.0, 0.06, 0.7, x, 0.03, z, { ry });
    return m;
  }
  vending(-HW + 0.42, 10.4, PI / 2, '#b8141c', '#8c0c12', 'ドリンク'); vending(-HW + 0.42, 9.3, PI / 2, '#e9edf0', '#1b4fa0', 'つめた〜い'); vending(-HW + 0.42, 8.2, PI / 2, '#1c2430', '#0f8f5a', 'お茶 COFFEE');
  addCollider(-HW, -HW + 0.82, 7.6, 11, false, 2.5);
  addLight(-HW + 1.9, 1.3, 9.3, 0xcfe4ff, 16, 11);
  B(stat, M.iron, 1.5, 0.05, 3.9, -HW + 0.7, 2.25, 9.3, { rz: -0.12, tile: 1 });                // tin awning above the machines
  prop('WetFloorSign_01', -HW + 2.0, 0, 7.0, { ry: 0.5 });
  prop('trashbag', -HW + 0.5, 0, 11.6, { ry: 1 }); prop('metal_trash_can', -HW + 0.45, 0, 6.6, { filter: /^metal_trash_can(_handle_left|_handle_right)?$/, collide: true });

  // ---------------------------------------------------------------- signs
  blade(-HW, 5.2, 19, 1, 0, 'ラーメン', '#ff2e63', '#ffffff', { light: 26, owner: L1 });
  blade(HW, 5.6, 14.5, -1, 0, 'カラオケ', '#16d9e3', '#0a1a2a', { light: 24 });
  blade(-HW, 6.2, 5.2, 1, 0, '酒場', '#ffcf3a', '#1a0f00', { h: 1.9, light: 12 });
  blade(HW, 5.0, 2.2, -1, 0, '薬局', '#30e070', '#ffffff', { h: 1.8, light: 14 });
  blade(-HW, 5.5, -13, 1, 0, 'ホテル', '#a060ff', '#ffffff', { light: 22 });
  blade(HW, 4.9, -18, -1, 0, '麻雀', '#f4f1e6', '#c8102e', { h: 1.8, light: 10, owner: R1 });
  blade(-HW, 9.2, 15.5, 1, 0, 'サウナ', '#ff7a1a', '#ffffff', { h: 2.2, owner: L1 }); blade(HW, 9.5, 7, -1, 0, '占い', '#e8467c', '#ffffff', { h: 1.6 }); blade(-HW, 10.4, -18, 1, 0, 'ビリヤード', '#1b6fd0', '#ffffff', { h: 3.2 });
  const neonBar = neon(L1, 4.5, 3.75, 0, 'BAR 月光', '#ff3df0', { w: 2.3, h: 0.72 });
  neon(R4, 7.5, 3.8, 0, 'ゲーム', '#35e0ff', { w: 2.0, h: 0.72 }); neon(L3, 1.5, 3.75, 0, 'OPEN 24H', '#40ff90', { w: 2.0, h: 0.6, font: 0.6 });
  neon(R1, 4.5, 3.8, 0, 'カラオケ ♪', '#ffe14a', { w: 2.3, h: 0.7, font: 0.6 }); neon(NK, 4.5, 3.8, 0, '駐車場 P', '#35a0ff', { w: 2.2, h: 0.7, font: 0.62 });
  L1.userData.lights.push(addLight(-HW + 1.2, 3.5, 19.5, 0xff3df0, 8, 8, false));
  // hero billboard at the dead end: animated neon
  const hero = new THREE.Group(); hero.position.set(0, 7.6, -24 + 0.25); stat.add(hero);
  B(hero, M.black, 7.2, 4.6, 0.12, 0, 0, 0); for (const sx of [-3.2, 3.2]) B(hero, M.dark, 0.1, 6, 0.1, sx, -0.6, -0.12);
  const heroKanji = neon(hero, -1.7, 0.1, 0.08, '忍', '#ff2e63', { w: 3.4, h: 3.8, font: 0.8, frame: false });
  const heroText = neon(hero, 1.75, 0.95, 0.08, 'NEON', '#35e0ff', { w: 3.2, h: 1.3, font: 0.7, frame: false });
  const heroText2 = neon(hero, 1.75, -0.75, 0.08, 'SHINOBI', '#35e0ff', { w: 3.2, h: 1.0, font: 0.66, frame: false });
  const heroRing = tube(hero, Array.from({ length: 24 }, (_, i) => [-1.7 + Math.cos(i / 24 * 6.283) * 1.75, 0.1 + Math.sin(i / 24 * 6.283) * 1.75, 0.12]), '#ff2e63', 0.03, true, 3.5); heroRing.userData.dynamic = true; heroRing.userData.noAO = false;
  tube(hero, [[-3.5, -2.2, 0.12], [3.5, -2.2, 0.12]], '#ffe14a', 0.022); tube(hero, [[-3.5, 2.2, 0.12], [3.5, 2.2, 0.12]], '#ffe14a', 0.022);
  const heroL1 = addLight(-1.5, 6.5, -21.2, 0xff2e63, 55, 20), heroL2 = addLight(2, 6.8, -21.4, 0x35e0ff, 30, 16);
  // neon arrow (3D tubes) pointing at the bar door
  tube(L1, [[3.3, 2.95, 0.1], [5.4, 2.95, 0.1], [5.4, 2.75, 0.1]], '#35e0ff', 0.016); tube(L1, [[5.28, 2.86, 0.1], [5.4, 2.72, 0.1], [5.52, 2.86, 0.1]], '#35e0ff', 0.016);

  // ---------------------------------------------------------------- lantern strings across the alley
  for (const [z, y, n] of [[-7.4, 5.0, 7], [-4.2, 5.3, 7], [10.9, 5.6, 6]]) {
    const at = cable(V(-HW, y + 0.4, z + 0.4), V(HW, y, z - 0.3), 0.7, 0.01);
    for (let i = 1; i <= n; i++) { const p = at(i / (n + 1)); lantern(stat, p.x, p.y - 0.42, p.z, 0.85); }
  }
  addLight(0, 4.0, -5.8, 0xff4a22, 26, 13); addLight(0, 4.4, 10.9, 0xff4a22, 15, 10, false);

  // ---------------------------------------------------------------- utility poles, cables, street lamps
  const coneMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false, uniforms: { uColor: { value: new THREE.Color(1, 0.8, 0.55) }, uTime: gUniforms.uTime },
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix * mv; }',
    fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying vec3 vW; uniform vec3 uColor; uniform float uTime;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){ float edge = pow(clamp(abs(dot(normalize(vN), normalize(vV))), 0.0, 1.0), 2.2); float along = pow(clamp(vUv.y, 0.0, 1.0), 1.6);
        float fogn = 0.55 + 0.45 * n3(vW * vec3(0.7, 0.35, 0.7) + vec3(uTime * 0.12, -uTime * 0.25, 0.0));
        gl_FragColor = vec4(uColor * edge * along * fogn * 0.16, 1.0); }` });
  const lampSpots = [];
  function pole(x, z, armDir, lampColor, intensity, shadow, { parent = stat, lite = !!Q.lite } = {}) {
    const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 9.4, 14), M.concrete); p.position.y = 4.7; g.add(p);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.158, 0.162, 1.1, 14, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(64, 64, (c) => { for (let i = -4; i < 8; i++) { c.fillStyle = i % 2 ? '#d8b020' : '#101010'; c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16 + 16, 0); c.lineTo(i * 16 + 48, 64); c.lineTo(i * 16 + 32, 64); c.fill(); } }) })); band.position.y = 1.0; g.add(band);
    B(g, M.rust, 2.0, 0.09, 0.09, 0, 8.7, 0); B(g, M.rust, 1.5, 0.09, 0.09, 0, 7.9, 0);
    for (const ix of [-0.9, -0.45, 0.45, 0.9]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.16, 8), M.pave); c.position.set(ix, 8.83, 0); g.add(c); }
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.8, 16), M.rust); tr.position.set(0.42, 7.1, 0); g.add(tr);
    B(g, M.dark, 0.3, 0.42, 0.2, -0.2, 2.2, 0.0); for (const yy of [3, 4.2, 5.4]) B(g, M.steel, 0.3, 0.04, 0.02, 0, yy, 0.13);
    // lamp arm + head
    const ax = armDir * 1.25; B(g, M.dark, 1.3, 0.05, 0.05, ax / 2, 6.25, 0); B(g, M.dark, 0.55, 0.09, 0.2, ax, 6.2, 0);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 0.14), new THREE.MeshBasicMaterial({ color: new THREE.Color(lampColor).multiplyScalar(6) })); bulb.position.set(ax, 6.145, 0); bulb.userData.shadow = false; g.add(bulb);
    if (lite) addLight(x + ax, 5.0, z, lampColor, intensity * 0.16, 15); else {
    const s = new THREE.SpotLight(lampColor, intensity, 22, 0.72, 0.6, 1.6); s.position.set(x + ax, 6.1, z); s.target.position.set(x + ax + armDir * 0.6, 0, z); scene.add(s, s.target);
    if (shadow && Q.shadow) { s.castShadow = true; s.shadow.mapSize.set(Q.shadow, Q.shadow); s.shadow.bias = -0.0006; s.shadow.normalBias = 0.02; s.shadow.camera.near = 0.6; s.shadow.camera.far = 22; }
    lights.push({ pos: s.position, color: s.color, light: s, base: intensity * 0.5 }); lampSpots.push(s); }
    const cm = coneMat.clone(); cm.uniforms.uColor = { value: new THREE.Color(lampColor) }; cm.uniforms.uTime = gUniforms.uTime;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(4.6, 6.1, 40, 1, true), cm); cone.position.set(x + ax + armDir * 0.3, 3.05, z); cone.userData.dynamic = true; cone.userData.noAO = true; cone.layers.set(2); scene.add(cone);
    addCollider(x - 0.2, x + 0.2, z - 0.2, z + 0.2, false, 9.5);
    cones.push(cone); return { cone, top: (ix, yy = 8.76) => V(x + ix, yy, z) };
  }
  const P1 = pole(-HW + 0.45, 3.6, 1, 0xffc48a, 260, true), P2 = pole(HW - 0.45, -14.3, -1, 0xcfe0ff, 200, true), P3 = pole(HW - 0.45, 20, -1, 0xffc48a, 150, false);
  for (const ix of [-0.9, -0.45, 0.45, 0.9]) { cable(P1.top(ix), P2.top(ix), 1.0); cable(P1.top(ix), P3.top(ix), 0.9); cable(P3.top(ix), V(HW - 0.45 + ix, 9.4, 60), 1.6); }
  cable(P1.top(0.42, 7.5), V(-HW, 6.5, 8), 0.5); cable(P2.top(0.42, 7.5), V(HW, 5.6, -10), 0.5); cable(P2.top(0, 7.9), V(-HW, 9, -17), 0.9); cable(P1.top(0, 7.9), V(HW, 10, 4), 0.8); cable(P3.top(0, 7.9), V(-HW, 8, 10.5), 0.8);
  // facade cable bundles + downpipes
  for (const [g, w, h] of [[L1, 12, 12], [L2, 9, 9], [L3, 15, 15], [R1, 12, 9], [R3, 9, 15], [R4, 15, 12], [N1, 9, 12], [NK, 12, 12]]) {
    const pm = pick([M.rust, M.dark, M.steel]);
    for (const lx of [0.12, w - 0.12]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, h, 8), pm); c.position.set(lx, h / 2, 0.09); g.add(c); for (let y = 1.5; y < h; y += 2.5) B(g, M.dark, 0.16, 0.04, 0.13, lx, y, 0.07); }
    const c2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, w - 0.5, 6), cableMat); c2.rotation.z = PI / 2; c2.position.set(w / 2, 3.32 + rng() * 0.1, 0.06); g.add(c2);
    const c3 = c2.clone(); c3.position.y += 0.07; c3.position.z = 0.05; g.add(c3);
  }
  // air conditioners, power boxes, cameras, wall lamps
  prop('exterior_aircon_unit', 7.6, 0.33, 0.02, { parent: L1, mode: 'wall', filter: /rusted/ }); prop('exterior_aircon_unit', 10.4, 0.33, 0.02, { parent: R1, mode: 'wall', filter: /^exterior_aircon_unit_\d/ });
  prop('exterior_aircon_unit', 9.6, 0.33, 0.02, { parent: L3, mode: 'wall', filter: /rusted/ }); prop('exterior_aircon_unit', 10.6, 0.33, 0.02, { parent: R4, mode: 'wall', filter: /^exterior_aircon_unit_\d/ }); prop('exterior_aircon_unit', 7.4, 0.33, 0.02, { parent: NK, mode: 'wall', filter: /rusted/ });
  prop('power_box_01', 6.6, 1.5, 0.0, { parent: L1, mode: 'wall' }); prop('power_box_01', 0.8, 1.5, 0, { parent: R3, mode: 'wall', filter: /box/ }); prop('power_box_01', 10.8, 1.6, 0, { parent: L3, mode: 'wall' }); prop('power_box_01', 0.9, 1.5, 0, { parent: R1, mode: 'wall', filter: /box/ });
  prop('korean_public_payphone_01', 3.75, 1.25, 0, { parent: R3, mode: 'wall' });
  prop('security_camera_01', 0.3, 3.5, 0.1, { parent: R4, mode: 'center', ry: 0.6, rx: 0.3 }); prop('security_camera_01', 8.7, 3.6, 0.1, { parent: L3, mode: 'center', ry: -0.5, rx: 0.3 }); prop('security_camera_01', 0.4, 3.5, 0.1, { parent: N1, mode: 'center', ry: 0.4, rx: 0.3 });
  const lampGlass = [];
  for (const [g, lx, on] of [[L1, 4.5, 0], [L2, 7.5, 1], [L3, 1.5, 0], [R1, 4.5, 1], [R2, 10.5, 0], [R3, 1.5, 1], [R4, 7.5, 0], [N1, 7.5, 1], [NK, 4.5, 1]]) {
    const l = prop('industrial_wall_lamp', lx, 2.72, 0.02, { parent: g, mode: 'wall', s: 1.1 });
    if (on) { const w = l.getWorldPosition(new THREE.Vector3()), n = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 2.2) })); b.scale.set(1, 1.7, 0.7); b.position.set(lx, 2.72, 0.1); b.userData.shadow = false; g.add(b);
      const WL = addLight(w.x + n.x * 0.5, 2.5, w.z + n.z * 0.5, 0xffb070, 7, 7, false); if (g.userData.lights) g.userData.lights.push(WL); }
  }
  // fluorescent tube above the nook's back door (flickers)
  const tubeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3.6, 4) });
  const ft = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.2, 8), tubeMat); ft.rotation.x = PI / 2; ft.position.set(-HW - 8 + 0.2, 2.95, 3 - 7.5); ft.userData.dynamic = true; scene.add(ft);
  const nookL = addLight(-HW - 7.0, 2.7, -4.5, 0xbfe0ff, 16, 12);

  // ---------------------------------------------------------------- street dressing
  for (const [x, z, ry, s] of [[-3.95, 18.3, 0, 1.1], [-3.6, 17.5, 2, 1.25], [-4.0, 16.8, 4, 1], [-3.3, 18.5, 1, 0.9], [3.9, -20.5, 1, 1.2], [3.5, -21.3, 3, 1], [-11.6, 1.6, 0, 1.2], [-11.0, 2.2, 2, 1], [-11.9, 0.8, 5, 1.1], [3.9, 5.4, 2, 1.1]]) prop('trashbag', x, 0, z, { ry, s });
  addCollider(-HW, -3.2, 16.4, 18.9); addCollider(-12.5, -10.6, 0.4, 3);
  prop('metal_trash_can', -3.95, 0, 15.4, { filter: /rust(_handle_left|_handle_right)?$/, collide: true }); prop('metal_trash_can', -3.3, 0.28, 14.7, { filter: /rust_lid/, rz: PI / 2 - 0.25, ry: 0.5 });
  for (const [x, y, z, ry, s] of [[-3.9, 0, 13.6, 0.2, 1.5], [-3.85, 0.5, 13.65, 0.6, 1.2], [3.85, 0, 18.6, 1.3, 1.6], [3.8, 0, 17.6, 1.9, 1.3], [3.86, 0.44, 17.65, 1.5, 1.1], [-11.8, 0, -8.2, 0.3, 1.6], [-4.0, 0, -21.5, 1, 1.5], [-3.9, 0.52, -21.4, 1.4, 1.1]]) prop('cardboard_box_01', x, y, z, { ry, s });
  addCollider(-HW, -3.5, 13.1, 14.1); addCollider(3.4, HW, 17.1, 19.1);
  prop('fire_hydrant', 3.95, 0, 11.3, { filter: /aged|Cylinder00[89]/, ry: -PI / 2, collide: true });
  prop('utility_box_01', 3.98, 0, 21.0, { ry: -PI / 2, collide: true }); prop('utility_box_01', -4.0, 0, -22.6, { ry: PI / 2, collide: true });
  prop('hand_truck', -3.95, 0, -15.4, { ry: PI / 2, rx: -0.12, collide: true });
  prop('Barrel_01', -3.9, 0, -19.2, { collide: true }); prop('Barrel_01', -3.85, 0, -20.0, { ry: 2, collide: true }); prop('Barrel_01', -11.9, 0, -5.0, { ry: 1, collide: true });
  prop('old_tyre', -11.6, 0.09, -6.2, { mode: 'center', rx: PI / 2 }); prop('old_tyre', -11.55, 0.26, -6.25, { mode: 'center', rx: PI / 2, ry: 0.4 }); prop('old_tyre', 4.1, 0.31, 7.6, { mode: 'center', ry: PI / 2, rx: 0.3 });
  prop('wooden_crate_02', -11.7, 0, -1.2, { ry: 0.1, collide: true }); prop('wooden_crate_02', -11.65, 0.45, -1.25, { ry: -0.15, s: 0.9 }); prop('wooden_crate_02', 3.8, 0, -16.6, { ry: PI / 2 + 0.1, collide: true });
  const car = prop('covered_car', -8.6, 0, -3.4, { ry: 0.12, collide: true, parent: scene }); car.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); const carCol = colliders[colliders.length - 1];
  // the moon hangs over the street beyond the barricade
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(15, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.1, 1.8), fog: false })); moonDisc.position.set(-4, 62, 230); moonDisc.rotation.y = PI; moonDisc.userData.noAO = true; scene.add(moonDisc);

  // ---------------------------------------------------------------- moonlight + lightning
  const moon = new THREE.DirectionalLight(0x8ea6ff, 0.55); moon.position.set(-14, 34, -10); moon.target.position.set(0, 0, 0);
  if (Q.shadow) { moon.castShadow = true; moon.shadow.mapSize.set(Q.shadow * 2, Q.shadow * 2); Object.assign(moon.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 2, far: 90 }); moon.shadow.bias = -0.0004; moon.shadow.normalBias = 0.05; }
  scene.add(moon, moon.target);
  const moonOff = moon.position.clone();
  const HEMI = Q.lambert ? 2.6 : 0.8, hemi = new THREE.HemisphereLight(Q.lambert ? 0x8794c8 : 0x3a4670, Q.lambert ? 0x4a3c44 : 0x18121a, HEMI); scene.add(hemi);

  // ---------------------------------------------------------------- baking: merge per material, instance repeated scans
  const bidOf = (o) => { for (let p = o; p; p = p.parent) if (p.userData.bid !== undefined) return p.userData.bid; return null; };
  function geosOf(o, mtx) {   // world-space copies of a mesh's geometry, one per material
    const out = [], mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach((mat, mi) => {
      let g = o.geometry;
      if (Array.isArray(o.material)) { const grp = g.groups.find(gr => gr.materialIndex === mi); if (!grp) return; const ng = new THREE.BufferGeometry(); for (const k of ['position', 'normal', 'uv']) ng.setAttribute(k, g.attributes[k]); ng.setIndex(Array.from(g.index.array.slice(grp.start, grp.start + grp.count))); g = ng; }
      const c = new THREE.BufferGeometry();
      c.setAttribute('position', g.attributes.position.clone());
      if (g.attributes.normal) c.setAttribute('normal', g.attributes.normal.clone());
      c.setAttribute('uv', g.attributes.uv ? g.attributes.uv.clone() : new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      c.setIndex(g.index ? g.index.clone() : [...Array(g.attributes.position.count).keys()]);
      if (!g.attributes.normal) c.computeVertexNormals();
      for (const k of ['position', 'normal', 'uv']) { const a = c.attributes[k]; if (a.isInterleavedBufferAttribute || a.normalized || !(a.array instanceof Float32Array)) { const n = new Float32Array(a.count * a.itemSize); for (let q = 0; q < a.count; q++) for (let w = 0; w < a.itemSize; w++) n[q * a.itemSize + w] = a.getComponent(q, w); c.setAttribute(k, new THREE.BufferAttribute(n, a.itemSize)); } }
      c.applyMatrix4(mtx); out.push({ mat, geo: c, shadow: o.userData.shadow !== false });
    });
    return out;
  }
  function meshOf(b) { const geo = mergeGeometries(b.geos, false); b.geos.forEach(g => g.dispose()); if (!geo) return null; const mesh = new THREE.Mesh(geo, b.mat), glowing = b.mat.isMeshBasicMaterial || b.mat.transparent;
    mesh.castShadow = b.shadow && !glowing; mesh.receiveShadow = !glowing; if (b.mat.transparent) mesh.userData.noAO = true; tris += geo.index.count / 3; return mesh; }
  let tris = 0;
  // --- the hand-built alley
  stat.updateMatrixWorld(true);
  const buildings = [], buckets = new Map(), dynamic = [], alleyGrp = new THREE.Group(); scene.add(alleyGrp);
  for (const g of [R1, L1]) { const c = g.userData.col, pivot = new THREE.Group(); pivot.position.set((c.minX + c.maxX) / 2, 0, (c.minZ + c.maxZ) / 2); scene.add(pivot); pivot.updateMatrixWorld(true);
    buildings[g.userData.bid] = { pivot, col: c, H: g.userData.H, lights: g.userData.lights, state: 0, t: 0, nx: g === R1 ? -1 : 1 }; }
  stat.traverse(o => {
    if (!o.isMesh) return; if (o.userData.dynamic) { dynamic.push(o); return; }
    const bid = bidOf(o);
    for (const r of geosOf(o, o.matrixWorld)) { const key = r.mat.uuid + (r.shadow ? 's' : 'n') + bid; if (!buckets.has(key)) buckets.set(key, { mat: r.mat, shadow: r.shadow, geos: [], bid }); buckets.get(key).geos.push(r.geo); }
  });
  for (const d of dynamic) { d.updateMatrixWorld(true); const m = d.matrixWorld.clone(), bid = bidOf(d); scene.add(d); d.matrix.copy(m); d.matrix.decompose(d.position, d.quaternion, d.scale); if (bid !== null) { d.updateMatrixWorld(true); buildings[bid].pivot.attach(d); } }
  scene.remove(stat);
  for (const b of buckets.values()) { const mesh = meshOf(b); if (!mesh) continue; mesh.matrixAutoUpdate = false;
    if (b.bid !== null) { const pv = buildings[b.bid].pivot; mesh.position.copy(pv.position).negate(); mesh.updateMatrix(); pv.add(mesh); } else alleyGrp.add(mesh); }
  const lodsAlley = { near: null, pivot: alleyGrp, x: 0, z: -4, r: 45, nearIn: true, pivIn: true };

  // --- city blocks: kit pieces and props are instanced ("near", hidden at distance); bodies, roofs, lit windows and signs are merged ("far")
  const lods = [lodsAlley];
  function bakeBlock(blk, cx, cz) {
    blk.updateMatrixWorld(true);
    const pivot = new THREE.Group(); pivot.position.set(cx, 0, cz); const near = new THREE.Group(), far = new THREE.Group(); pivot.add(near, far); scene.add(pivot);
    const off = new THREE.Matrix4().makeTranslation(-cx, 0, -cz), inst = new Map(), mer = new Map();
    blk.traverse(o => { if (!o.isMesh) return; const mtx = new THREE.Matrix4().multiplyMatrices(off, o.matrixWorld);
      if (o.userData.inst && !Array.isArray(o.material)) { const k = o.geometry.uuid + o.material.uuid; if (!inst.has(k)) inst.set(k, { geo: o.geometry, mat: o.material, ms: [] }); inst.get(k).ms.push(mtx); }
      else for (const r of geosOf(o, mtx)) { const key = r.mat.uuid + (r.shadow ? 's' : 'n'); if (!mer.has(key)) mer.set(key, { mat: r.mat, shadow: r.shadow, geos: [] }); mer.get(key).geos.push(r.geo); } });
    for (const b of inst.values()) { const im = new THREE.InstancedMesh(b.geo, b.mat, b.ms.length); b.ms.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.receiveShadow = !b.mat.transparent; if (b.mat.transparent) im.userData.noAO = true; near.add(im); tris += (b.geo.index ? b.geo.index.count : b.geo.attributes.position.count) / 3 * b.ms.length; }
    for (const b of mer.values()) { const mesh = meshOf(b); if (mesh) far.add(mesh); }
    near.traverse(o => o.layers.set(3));
    return { pivot, near, far };
  }
  const WALLS = [M.brickDark, M.brickRed, M.concrete, M.plasterWorn, M.plaster, M.tileDark, M.tileSq, M.planks], GROUNDS = ['shutter', 'door', 'blank', 'gshutter', 'dbl', 'blank', 'door', 'shutter', 'blank'];
  const SIGNS = [['ラーメン', '#ff2e63', '#ffffff'], ['カラオケ', '#16d9e3', '#0a1a2a'], ['酒場', '#ffcf3a', '#1a0f00'], ['薬局', '#30e070', '#ffffff'], ['ホテル', '#a060ff', '#ffffff'], ['麻雀', '#f4f1e6', '#c8102e'], ['サウナ', '#ff7a1a', '#ffffff'], ['占い', '#e8467c', '#ffffff'], ['ビリヤード', '#1b6fd0', '#ffffff'], ['居酒屋', '#c8102e', '#ffffff'], ['寿司', '#f4f1e6', '#151515'], ['パチンコ', '#ffd400', '#c8102e']];
  const signMats = SIGNS.map(([t, bg, fg]) => signMat(128, Math.round(128 * 2.6 / 0.62), (c, W, H) => drawBoxSign(c, W, H, t, bg, fg, true), 2.2));
  const STREET_PROPS = [['trashbag', 1.1], ['Barrel_01', 1], ['trashbag', 0.9], ['trashbag', 1.25]];
  function genSide(blk, lts, x, z, ry, bays, floors, wall, depth, inset = 0) {
    const ground = Array.from({ length: bays }, () => pick(GROUNDS));
    const g = facade({ parent: blk, x, z, ry, bays, floors, wall, ground, depth, inset, lit: 0.3, acP: 0.2 });
    ground.forEach((t, i) => { if (t === 'shutter' || t === 'gshutter') bigShutter(g, i * 3 + 1.5, 2.6, 2.7, t === 'gshutter' && rng() < 0.5); });
    const nx = Math.sin(ry), nz = Math.cos(ry), tx = Math.cos(ry), tz = -Math.sin(ry);
    for (let k = 0; k < Math.max(1, Math.round(bays / 4)); k++) { const lx = rand(1.5, bays * 3 - 1.5), si = Math.floor(rng() * SIGNS.length);
      blade(x + tx * lx, rand(4.6, Math.max(4.7, Math.min(floors * 3 - 1.6, 9))), z + tz * lx, nx, nz, '', SIGNS[si][1], '', { parent: blk, mat: signMats[si], light: k === 0 ? rand(12, 22) : 0, lights: lts }); }
    for (let k = 0; k < Math.round(bays / 4); k++) { const lx = rand(1, bays * 3 - 1), sp = pick(STREET_PROPS); prop(sp[0], x + tx * lx + nx * 0.55, 0, z + tz * lx + nz * 0.55, { parent: blk, ry: rng() * 6, s: sp[1] }); }
    return g;
  }
  function genBlock(x0, x1, z0, z1) {
    const blk = new THREE.Group(), lts = [], w = x1 - x0, d = z1 - z0, fNS = 3 + Math.floor(rng() * 4), fEW = fNS + (rng() < 0.5 ? 1 : -1), dNS = Math.min(8, d / 2), dEW = Math.min(8, w / 2), c0 = colliders.length, wallB = pick(WALLS);
    genSide(blk, lts, x0, z1, 0, Math.round(w / 3), fNS, wallB, dNS, 0.4); genSide(blk, lts, x1, z0, PI, Math.round(w / 3), fNS, wallB, dNS, 0.4);
    genSide(blk, lts, x1, z1, PI / 2, Math.round(d / 3), fEW, wallB, dEW); genSide(blk, lts, x0, z0, -PI / 2, Math.round(d / 3), fEW, wallB, dEW);
    const cols = colliders.slice(c0);
    const pl = pole(x0 - 0.9, (z0 + z1) / 2 + rand(-6, 6), -1, pick([0xffc48a, 0xcfe0ff]), 170, false, { parent: blk, lite: true });
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, bk = bakeBlock(blk, cx, cz), rec = { ...bk, cols, lights: lts, home: bk.pivot.position.clone(), state: 0, t: 0, nx: rng() < 0.5 ? 1 : -1, cone: pl.cone };
    if (Q.cones === false) { scene.remove(pl.cone); rec.cone = null; } else { bk.pivot.updateMatrixWorld(true); bk.pivot.attach(pl.cone); }
    buildings.push(rec); lods.push({ near: bk.near, pivot: bk.pivot, x: cx, z: cz, r: Math.hypot(w, d) / 2, nearIn: true, pivIn: true });
  }
  { // buildings backing onto the alley (their fronts face the surrounding streets)
    const ring = new THREE.Group(), no = [];
    genSide(ring, no, -21, -33, -PI / 2, 8, 4, M.concrete, 7.9); genSide(ring, no, -21, -9, -PI / 2, 4, 4, M.plasterWorn, 0.12); genSide(ring, no, -21, 3, -PI / 2, 7, 5, M.tileDark, 7.9);
    genSide(ring, no, 21, 24, PI / 2, 6, 4, M.brickDark, 7.9); genSide(ring, no, 21, 6, PI / 2, 7, 6, M.plaster, 7.9); genSide(ring, no, 21, -15, PI / 2, 6, 3, M.tileSq, 7.9);
    genSide(ring, no, 21, -33, PI, 7, 6, M.brickRed, 8.7); genSide(ring, no, 0, -33, PI, 7, 6, M.concrete, 8.7);
    genSide(ring, no, -21, 24, 0, 5, 4, M.brickDark, 0.12); genSide(ring, no, 6, 24, 0, 5, 3, M.tileSq, 0.12);
    const bk = bakeBlock(ring, 0, -5); lods.push({ near: bk.near, pivot: bk.pivot, x: 0, z: -5, r: 36, nearIn: true, pivIn: true });
  }
  const XC = [], ZR = [];
  for (let k = 0; k < 4; k++) { XC.push([33 + k * 36, 57 + k * 36]); XC.unshift([-57 - k * 36, -33 - k * 36]); }
  for (let k = 0; k < 4; k++) ZR.unshift([-69 - k * 36, -45 - k * 36]); ZR.push([-33, -9], [0, 24]); for (let k = 0; k < 4; k++) ZR.push([36 + k * 36, 60 + k * 36]);
  for (const [z0, z1] of ZR) for (const [x0, x1] of XC) genBlock(x0, x1, z0, z1);
  for (const [z0, z1] of ZR) { if (z1 <= -45) genBlock(-21, 21, z0, z1); else if (z0 >= 36) { genBlock(-21, -6, z0, z1); genBlock(6, 21, z0, z1); } }
  if (Q.lambert) { const lc = new Map(), conv = (m) => { if (!m.isMeshStandardMaterial || m === gMat) return m; if (!lc.has(m.uuid)) lc.set(m.uuid, new THREE.MeshLambertMaterial({ map: m.map, color: m.color, emissive: m.emissive, emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, transparent: m.transparent, opacity: m.opacity, side: m.side, depthWrite: m.depthWrite, polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor })); return lc.get(m.uuid); };
    scene.traverse(o => { if (o.isMesh && o !== ground) o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material); }); }
  // a small pool of real lights is handed to whichever light records are nearest the player
  const POOL = Array.from({ length: Q.pool || 8 }, () => { const l = new THREE.PointLight(0xffffff, 0, 12, 2); scene.add(l); return l; }), assigned = []; let poolT = 0;
  console.log('LOG world built:', buildings.length, 'buildings,', Math.round(tris / 1000), 'k tris,', colliders.length, 'colliders,', spots.length, 'light records');

  // ---------------------------------------------------------------- per-frame
  let flashT = 0, nextFlash = 14, thunderCb = null;
  const pp0 = new THREE.Vector3(0, 0, 14), NEAR = Q.near || 46, FAR = Q.far || 135; let frame = 0;
  function update(dt, t, pp = pp0) {
    gUniforms.uTime.value = t;
    for (const l of lods) { const d = Math.hypot(pp.x - l.x, pp.z - l.z) - l.r; if (l.near && (l.nearIn ? d > NEAR + 8 : d < NEAR)) { l.nearIn = !l.nearIn; l.nearIn ? l.pivot.add(l.near) : l.pivot.remove(l.near); } if (l.pivIn ? d > FAR + 10 : d < FAR) { l.pivIn = !l.pivIn; l.pivIn ? scene.add(l.pivot) : scene.remove(l.pivot); } }
    frame++; if (moon.castShadow) { moon.shadow.autoUpdate = false; if (frame % (Q.shEvery || 2) === 0) moon.shadow.needsUpdate = true; }
    for (const sp of lampSpots) if (sp.castShadow) { sp.shadow.autoUpdate = false; if (frame % 3 === 1 && sp.position.distanceTo(pp) < 60) sp.shadow.needsUpdate = true; }
    for (const b of buildings) if (b.cone) b.cone.visible = !b.state;
    poolT -= dt; if (poolT <= 0) { poolT = 0.25; const near = spots.filter(s => s.intensity > 0.01).map(s => [s.position.distanceToSquared(pp), s]).sort((a, b) => a[0] - b[0]); for (let i = 0; i < POOL.length; i++) assigned[i] = near[i] ? near[i][1] : null; }
    for (let i = 0; i < POOL.length; i++) { const L = POOL[i], sp = assigned[i]; if (!sp) { L.intensity = 0; continue; } L.position.copy(sp.position); L.color.copy(sp.color); L.distance = sp.distance; L.intensity = sp.intensity * THREE.MathUtils.clamp((50 - sp.position.distanceTo(pp)) / 12, 0, 1); }
    moon.target.position.set(Math.round(pp.x / 4) * 4, 0, Math.round(pp.z / 4) * 4); moon.position.copy(moon.target.position).add(moonOff);
    // flicker: bar sign buzzes, nook tube stutters, hero sign breathes
    const buzz = (Math.sin(t * 61) > -0.2 || Math.sin(t * 7.3) > 0.4) ? 1 : 0.25; neonBar.material.color.setScalar(2.4 * buzz);
    const st = (Math.sin(t * 2.1) + Math.sin(t * 13.7) * 0.5 + Math.sin(t * 37) * 0.3) > -0.9 ? 1 : 0.08; tubeMat.color.setRGB(3 * st, 3.6 * st, 4 * st); nookL.intensity = 16 * st;
    const br = 0.86 + 0.14 * Math.sin(t * 1.7), kf = (t % 9) > 8.6 ? ((Math.sin(t * 90) > 0) ? 1 : 0.15) : 1;
    heroKanji.material.color.setScalar(2.6 * br * kf); heroRing.material.color.setRGB(3.5 * br * kf, 0.6 * br * kf, 1.3 * br * kf); heroL1.intensity = 55 * br * kf;
    heroText.material.color.setScalar(2.4); heroText2.material.color.setScalar(2.4 * (0.9 + 0.1 * Math.sin(t * 3.1))); heroL2.intensity = 30;
    // lightning
    nextFlash -= dt;
    if (nextFlash <= 0) { nextFlash = 18 + Math.random() * 26; flashT = 0.55; if (thunderCb) thunderCb(); }
    if (flashT > 0) { flashT -= dt; const f = Math.max(0, Math.sin(flashT * 38) * 0.5 + 0.5) * Math.min(1, flashT * 4); moon.intensity = 0.55 + f * 7; scene.backgroundIntensity = 0.045 + f * 0.5; hemi.intensity = HEMI + f * 2.5; }
    else { moon.intensity = 0.55; scene.backgroundIntensity = 0.045; hemi.intensity = HEMI; }
  }
  return { limits: { minX: -171, maxX: 171, minZ: -183, maxZ: 174 }, carPath: [[-8.6, -3.4], [-8.3, -1.6], [-6.4, -0.3], [-3.6, 1.2], [-1.2, 4.2], [0, 9], [0, 16], [0, 30], [0, 60], [0, 110]], buildings, car, carCol, moon, scrollSpots: [V(8.6, 6.75, -6), V(-8.6, 9.75, 7.5), V(8.6, 15.75, 4.5)], colliders, lights, steamPoints, update, ground, reflRT, bounds: { minX: -HW, maxX: HW, minZ: -24, maxZ: 21.6 }, onThunder: (cb) => { thunderCb = cb; }, flash: () => { nextFlash = 0; },
    setReflSize: (w, h) => { if (Q.refl > 0) reflRT.setSize(Math.max(64, Math.round(w * Q.refl)), Math.max(64, Math.round(h * Q.refl))); } };
}
