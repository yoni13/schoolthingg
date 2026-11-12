// Rain, splashes, particles, steam and the katana trail.
import * as THREE from 'three';

const LIGHT_GLSL = `
  uniform vec3 uLPos[8]; uniform vec3 uLCol[8];
  vec3 litBy(vec3 p){ vec3 c = vec3(0.0); for (int i = 0; i < 8; i++) { vec3 d = uLPos[i] - p; c += uLCol[i] / (1.0 + dot(d, d)); } return c; }`;

export class Rain {
  constructor(scene, count, lights) {
    this.uniforms = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uLPos: { value: [] }, uLCol: { value: [] } };
    this.lights = lights;
    for (let i = 0; i < 8; i++) { this.uniforms.uLPos.value.push(new THREE.Vector3(0, -99, 0)); this.uniforms.uLCol.value.push(new THREE.Vector3()); }
    // falling streaks
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3)); g.setIndex([0, 1, 2, 2, 1, 3]);
    const off = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { off[i * 4] = Math.random() * 30; off[i * 4 + 1] = Math.random() * 16; off[i * 4 + 2] = Math.random() * 30; off[i * 4 + 3] = Math.random(); }
    g.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 4)); g.instanceCount = count;
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; varying float vA; varying vec3 vC; varying float vX; ${LIGHT_GLSL}
        void main(){ float sp = 13.0 + aOff.w * 6.0; vec3 p = aOff.xyz; p.y = mod(p.y - uTime * sp, 16.0);
          vec3 wind = vec3(0.09, -1.0, 0.04);
          p.xz += wind.xz * (16.0 - p.y);
          p.xz = mod(p.xz - uCam.xz + 15.0, 30.0) - 15.0 + uCam.xz; p.y += -1.0;
          float len = 0.22 + aOff.w * 0.34; vec3 dir = normalize(wind);
          vec3 wp = p - dir * position.y * len; vec3 side = normalize(cross(dir, wp - uCam));
          float dist = length(wp - uCam); wp += side * position.x * (0.0016 + dist * 0.00055);
          vX = position.x; vC = vec3(0.010, 0.013, 0.02) + litBy(wp) * 0.05;
          vA = smoothstep(0.4, 2.5, dist) * (1.0 - smoothstep(22.0, 30.0, dist)) * smoothstep(0.0, 0.2, position.y + 0.1);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `varying float vA; varying vec3 vC; varying float vX; void main(){ gl_FragColor = vec4(vC * vA * (1.0 - vX * vX), 1.0); }` });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.layers.set(2); this.mesh.userData.noAO = true; scene.add(this.mesh);
    // ground splashes
    const sc = Math.floor(count * 0.3), sg = new THREE.InstancedBufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, -1, 1, 0, 1, 1, 0], 3)); sg.setIndex([0, 1, 2, 2, 1, 3]);
    const so = new Float32Array(sc * 4); for (let i = 0; i < sc; i++) { so[i * 4] = Math.random() * 24; so[i * 4 + 1] = Math.random(); so[i * 4 + 2] = Math.random() * 24; so[i * 4 + 3] = Math.random(); }
    sg.setAttribute('aOff', new THREE.InstancedBufferAttribute(so, 4)); sg.instanceCount = sc;
    const smat = new THREE.ShaderMaterial({ uniforms: this.uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `attribute vec4 aOff; uniform float uTime; uniform vec3 uCam; varying vec2 vUv; varying vec3 vC; varying float vL; ${LIGHT_GLSL}
        void main(){ float cyc = uTime * (1.6 + aOff.w) + aOff.y * 10.0; float life = fract(cyc); float seed = floor(cyc);
          vec3 p = vec3(aOff.x + fract(sin(seed * 12.9 + aOff.w * 78.2) * 437.5) * 24.0, 0.0, aOff.z + fract(sin(seed * 39.3 + aOff.y * 11.1) * 943.1) * 24.0);
          p.xz = mod(p.xz - uCam.xz + 12.0, 24.0) - 12.0 + uCam.xz;
          vec3 toCam = normalize(vec3(uCam.x - p.x, 0.0, uCam.z - p.z)); vec3 side = vec3(toCam.z, 0.0, -toCam.x);
          float s = 0.006 + 0.014 * life; vec3 wp = p + side * position.x * s * 1.6 + vec3(0.0, position.y * (0.025 + 0.03 * aOff.w) * (1.0 - life * 0.6), 0.0);
          vUv = position.xy; vL = life; vC = vec3(0.02, 0.025, 0.035) + litBy(wp + vec3(0.0, 0.2, 0.0)) * 0.1;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
      fragmentShader: `varying vec2 vUv; varying vec3 vC; varying float vL; void main(){ float crown = smoothstep(1.0, 0.1, abs(vUv.x)) * smoothstep(1.0, 0.0, vUv.y) * smoothstep(0.0, 0.08, vUv.y);
          gl_FragColor = vec4(vC * crown * (1.0 - vL) * 0.8, 1.0); }` });
    this.splash = new THREE.Mesh(sg, smat); this.splash.frustumCulled = false; this.splash.layers.set(2); this.splash.userData.noAO = true; scene.add(this.splash);
  }
  update(t, cam) {
    this.uniforms.uTime.value = t; this.uniforms.uCam.value.copy(cam.position);
    // feed the 8 lights nearest to the camera
    const ls = this.lights.slice().sort((a, b) => a.pos.distanceToSquared(cam.position) - b.pos.distanceToSquared(cam.position));
    for (let i = 0; i < 8; i++) { const l = ls[i]; if (!l) { this.uniforms.uLCol.value[i].set(0, 0, 0); continue; }
      this.uniforms.uLPos.value[i].copy(l.pos); const k = l.light.intensity * (l.light.isSpotLight ? 0.35 : 1); this.uniforms.uLCol.value[i].set(l.color.r * k, l.color.g * k, l.color.b * k); }
  }
}

// CPU particle pool rendered as soft points. kind: additive sparks/embers or alpha-blended droplets/smoke.
export class Particles {
  constructor(scene, max, additive, tex = null) {
    this.max = max; this.n = 0; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 4); this.dat = new Float32Array(max * 4); // life, maxLife, size, gravity
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDat', new THREE.BufferAttribute(this.dat, 4).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec4 aCol; attribute vec4 aDat; varying vec4 vC; uniform float uScale;
        void main(){ float k = clamp(aDat.x / max(aDat.y, 0.001), 0.0, 1.0); vC = aCol; vC.a *= ${additive ? 'k' : 'smoothstep(0.0, 0.25, k) * smoothstep(1.0, 0.7, k)'};
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(aDat.z * ${additive ? '(0.4 + 0.6 * k)' : '(1.6 - 0.6 * k)'} * uScale / max(-mv.z, 0.1), ${additive ? '90.0' : '140.0'}); ${additive ? '' : 'vC.a *= smoothstep(1.2, 4.5, -mv.z);'} gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, ${additive ? '0.05' : '0.0'}, length(d)); if (a < 0.01) discard; gl_FragColor = vec4(vC.rgb${additive ? ' * a * vC.a, 1.0' : ', a * vC.a'}); }` });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.layers.set(2); scene.add(this.points);
  }
  emit(p, v, color, life, size, gravity = 9, alpha = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.col.set([color.r, color.g, color.b, alpha], i * 4); this.dat.set([life, life, size, gravity], i * 4);
  }
  burst(p, n, color, { speed = 4, up = 2, life = 0.6, size = 0.05, gravity = 9, spread = 1, dir = null, alpha = 1 } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7) * spread);
      if (dir) v.addScaledVector(dir, speed * (0.4 + Math.random() * 0.8)); v.y += up * Math.random();
      this.emit(p, v, color, life * (0.5 + Math.random() * 0.7), size * (0.6 + Math.random() * 0.8), gravity, alpha);
    }
  }
  update(dt) {
    const { pos, vel, dat, max } = this;
    for (let i = 0; i < max; i++) {
      if (dat[i * 4] <= 0) continue;
      dat[i * 4] -= dt; if (dat[i * 4] <= 0) { pos[i * 3 + 1] = -999; continue; }
      vel[i * 3 + 1] -= dat[i * 4 + 3] * dt;
      pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
      if (pos[i * 3 + 1] < 0.02 && dat[i * 4 + 3] > 0) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.25; vel[i * 3] *= 0.5; vel[i * 3 + 2] *= 0.5; }
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.aCol.needsUpdate = true; a.aDat.needsUpdate = true;
  }
}

// Ribbon that follows the blade: additive, hot at the tip, fades with age.
export class Trail {
  constructor(scene, color = new THREE.Color(0.35, 0.9, 1.0), N = 26) {
    this.N = N; this.samples = []; this.color = color;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 2 * 3); this.uv = new Float32Array(N * 2 * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage)); g.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < N - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3); g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { uColor: { value: color } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec2 vUv; uniform vec3 uColor; void main(){ float a = pow(clamp(1.0 - vUv.x, 0.0, 1.0), 2.2); float edge = pow(clamp(vUv.y, 0.0, 1.0), 5.0); vec3 c = mix(uColor * 0.5, vec3(1.2, 1.5, 1.7), edge) * (0.03 + edge * 0.9); gl_FragColor = vec4(c * a * 0.4 * smoothstep(0.0, 0.5, vUv.y), 1.0); }' }));
    this.mesh.frustumCulled = false; this.mesh.layers.set(2); this.mesh.userData.noAO = true; scene.add(this.mesh); g.setDrawRange(0, 0);
  }
  push(base, tip, t) { this.samples.unshift({ b: base.clone(), t: tip.clone(), time: t }); if (this.samples.length > this.N) this.samples.pop(); }
  update(t, life = 0.22) {
    while (this.samples.length && t - this.samples[this.samples.length - 1].time > life) this.samples.pop();
    const n = this.samples.length;
    for (let i = 0; i < n; i++) { const s = this.samples[i], age = (t - s.time) / life; this.pos.set([s.b.x, s.b.y, s.b.z, s.t.x, s.t.y, s.t.z], i * 6); this.uv.set([age, 0, age, 1], i * 4); }
    const g = this.mesh.geometry; g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true; g.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }
}
