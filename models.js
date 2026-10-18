function createCube() {
  const positions = new Float32Array([
    -1, -1,  1,   1, -1,  1,   1,  1,  1,  -1,  1,  1,   // front
     1, -1, -1,  -1, -1, -1,  -1,  1, -1,   1,  1, -1,   // back
    -1,  1,  1,   1,  1,  1,   1,  1, -1,  -1,  1, -1,   // top
    -1, -1, -1,   1, -1, -1,   1, -1,  1,  -1, -1,  1,   // bottom
     1, -1,  1,   1, -1, -1,   1,  1, -1,   1,  1,  1,   // right
    -1, -1, -1,  -1, -1,  1,  -1,  1,  1,  -1,  1, -1    // left
  ]);
  const faceNormals = [[0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]];
  const normals = new Float32Array(faceNormals.flatMap(n => [...n, ...n, ...n, ...n]));

  const indices = new Uint16Array([
     0,  1,  2,   0,  2,  3,   // front
     4,  5,  6,   4,  6,  7,   // back
     8,  9, 10,   8, 10, 11,   // top
    12, 13, 14,  12, 14, 15,   // bottom
    16, 17, 18,  16, 18, 19,   // right
    20, 21, 22,  20, 22, 23    // left
  ]);
  return { positions, normals, indices };
}

function createCylinder(segments) {
  const pos = [], nrm = [], idx = [];

  // Side
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    pos.push(x, -1, z, x, 1, z);
    nrm.push(x, 0, z, x, 0, z);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2);
  }

  // Caps
  for (const y of [-1, 1]) {
    const center = pos.length / 3;
    pos.push(0, y, 0);
    nrm.push(0, y, 0);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a), y, Math.sin(a));
      nrm.push(0, y, 0);
    }
    for (let i = 1; i <= segments; i++) {
      if (y > 0) idx.push(center, center + i + 1, center + i);
      else idx.push(center, center + i, center + i + 1);
    }
  }

  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) };
}


// ---------------------------------------------------------------------------
// Extra primitives for HW5
// ---------------------------------------------------------------------------

// Cube with smooth (averaged) corner normals, i.e. each vertex normal points
// away from the center. Paired with toFlat() it shows flat vs smooth shading.
function createSmoothCube() {
  const cube = createCube();
  const normals = new Float32Array(cube.positions.length);
  for (let i = 0; i < cube.positions.length; i += 3) {
    const len = Math.hypot(cube.positions[i], cube.positions[i + 1], cube.positions[i + 2]);
    for (let k = 0; k < 3; k++) normals[i + k] = cube.positions[i + k] / len;
  }
  return { positions: cube.positions, normals, indices: cube.indices };
}

// Unit sphere centered at the origin
function createSphere(stacks, slices) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= stacks; i++) {
    const phi = (i / stacks) * Math.PI, y = Math.cos(phi), r = Math.sin(phi);
    for (let j = 0; j <= slices; j++) {
      const th = (j / slices) * Math.PI * 2, x = r * Math.cos(th), z = r * Math.sin(th);
      pos.push(x, y, z);
      nrm.push(x, y, z);
    }
  }
  for (let i = 0; i < stacks; i++)
    for (let j = 0; j < slices; j++) {
      const a = i * (slices + 1) + j, b = a + slices + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return orient({ positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) });
}

// Cone with its apex at y = 1 and a base of radius 1 at y = -1
function createCone(segments, capped = true) {
  const pos = [], nrm = [], idx = [];
  // slope of the side: radius shrinks by 1 over a height of 2
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    const am = ((i + 0.5) / segments) * Math.PI * 2;   // apex normal halfway around the segment
    const n = [x, 0.5, z], nm = [Math.cos(am), 0.5, Math.sin(am)];
    const l = Math.hypot(...n);
    pos.push(x, -1, z, 0, 1, 0);
    nrm.push(n[0] / l, n[1] / l, n[2] / l, nm[0] / l, nm[1] / l, nm[2] / l);
  }
  for (let i = 0; i < segments; i++) {
    const b = i * 2;
    idx.push(b, b + 1, b + 2);
  }
  if (capped) {
    const center = pos.length / 3;
    pos.push(0, -1, 0);
    nrm.push(0, -1, 0);
    for (let i = 0; i <= segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      pos.push(Math.cos(a), -1, Math.sin(a));
      nrm.push(0, -1, 0);
    }
    for (let i = 1; i <= segments; i++) idx.push(center, center + i, center + i + 1);
  }
  return orient({ positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) });
}

// Torus lying in the XZ plane: major radius R, tube radius r
function createTorus(R, r, segU, segV) {
  const pos = [], nrm = [], idx = [];
  for (let i = 0; i <= segU; i++) {
    const u = (i / segU) * Math.PI * 2, cu = Math.cos(u), su = Math.sin(u);
    for (let j = 0; j <= segV; j++) {
      const v = (j / segV) * Math.PI * 2, cv = Math.cos(v), sv = Math.sin(v);
      pos.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
      nrm.push(cv * cu, sv, cv * su);
    }
  }
  for (let i = 0; i < segU; i++)
    for (let j = 0; j < segV; j++) {
      const a = i * (segV + 1) + j, b = a + segV + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  return orient({ positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) });
}

function faceNormal(P, a, b, c) {
  const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
  const vx = P[c * 3] - P[a * 3], vy = P[c * 3 + 1] - P[a * 3 + 1], vz = P[c * 3 + 2] - P[a * 3 + 2];
  return [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
}

// Reorders every triangle to be counter-clockwise when seen from the side its
// normals point to, so gl_FrontFacing can tell the inside of open shapes.
function orient(geom) {
  const P = geom.positions, N = geom.normals, I = geom.indices;
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
    const f = faceNormal(P, a, b, c);
    let dot = 0;
    for (const v of [a, b, c]) dot += f[0] * N[v * 3] + f[1] * N[v * 3 + 1] + f[2] * N[v * 3 + 2];
    if (dot < 0) { I[t + 1] = c; I[t + 2] = b; }
  }
  return geom;
}

// Flat-shaded copy: every triangle gets its own three vertices that all share
// the triangle's face normal, so lighting is constant across each face.
function toFlat(geom) {
  const P = geom.positions, N = geom.normals, I = geom.indices;
  const pos = [], nrm = [], idx = [];
  for (let t = 0; t < I.length; t += 3) {
    const tri = [I[t], I[t + 1], I[t + 2]];
    let f = faceNormal(P, ...tri);
    let len = Math.hypot(...f);
    if (len < 1e-9) continue;                    // degenerate triangle at a pole
    f = f.map(c => c / len);
    let dot = 0;
    for (const v of tri) dot += f[0] * N[v * 3] + f[1] * N[v * 3 + 1] + f[2] * N[v * 3 + 2];
    if (dot < 0) f = f.map(c => -c);
    for (const v of tri) {
      idx.push(pos.length / 3);
      pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]);
      nrm.push(...f);
    }
  }
  return { positions: new Float32Array(pos), normals: new Float32Array(nrm), indices: new Uint16Array(idx) };
}
