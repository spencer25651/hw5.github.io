const VERTEX_SHADER = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;

uniform mat4 uModelView;
uniform mat4 uProjection;

out vec3 vPosition;   // eye space
out vec3 vNormal;     // eye space
out vec3 vLocal;      // object space (used by the light beam)

void main() {
  vec4 p = uModelView * vec4(aPosition, 1.0);
  vPosition = p.xyz;
  // inverse transpose keeps normals perpendicular under non-uniform scaling
  vNormal = transpose(inverse(mat3(uModelView))) * aNormal;
  vLocal = aPosition;
  gl_Position = uProjection * p;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

#define NUM_LIGHTS 3

in vec3 vPosition;
in vec3 vNormal;
in vec3 vLocal;

// Lights, in eye space. uSpotCos = -1 means a plain point light.
uniform vec3  uLightPos[NUM_LIGHTS];
uniform vec3  uLightColor[NUM_LIGHTS];  // color * intensity, black when off
uniform vec3  uSpotDir[NUM_LIGHTS];
uniform float uSpotCos[NUM_LIGHTS];
uniform vec3  uAmbient;

// Material
uniform vec3  uColor;
uniform vec3  uSpecColor;
uniform float uKa, uKd, uKs, uShininess, uEmissive;
uniform bool  uToon;
uniform int   uMode;                    // 0 = lit surface, 1 = light beam

out vec4 fragColor;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(-vPosition);       // camera sits at the origin

  if (uMode == 1) {
    // Additive light beam: bright at the bulb (cone apex), fading downward
    float along = 0.5 * (vLocal.y + 1.0);
    float edge = abs(dot(N, V));
    fragColor = vec4(uColor * along * along * edge * 0.3, 1.0);
    return;
  }

  if (!gl_FrontFacing) N = -N;          // two-sided lighting (inside of the lamp shade)

  vec3 color = uKa * uAmbient * uColor + uEmissive * uColor;

  for (int i = 0; i < NUM_LIGHTS; i++) {
    vec3 toLight = uLightPos[i] - vPosition;
    float d = length(toLight);
    vec3 L = toLight / d;
    float atten = 1.0 / (1.0 + 0.01 * d * d);

    float spot = 1.0;
    if (uSpotCos[i] > -1.0) {
      float c = dot(-L, normalize(uSpotDir[i]));
      spot = smoothstep(uSpotCos[i], mix(uSpotCos[i], 1.0, 0.3), c);
    }

    vec3 R = reflect(-L, N);
    float diff = max(dot(N, L), 0.0);
    float spec = diff > 0.0 ? pow(max(dot(V, R), 0.0), uShininess) : 0.0;

    if (uToon) {
      diff = ceil(diff * 3.0) / 3.0;
      spec = step(0.5, spec);
    }

    color += uLightColor[i] * atten * spot * (uKd * diff * uColor + uKs * spec * uSpecColor);
  }

  if (uToon && abs(dot(N, V)) < 0.3) color *= 0.15;   // ink outline

  fragColor = vec4(color, 1.0);
}
`;

// WebGL setup
const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl2");

function compile(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
  return shader;
}

// Fixed attribute slots, so the meshes stay valid when the shaders are recompiled
const ATTRIBUTES = { aPosition: 0, aNormal: 1 };

function createProgram(vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fsSource));
  for (const name in ATTRIBUTES) gl.bindAttribLocation(prog, ATTRIBUTES[name], name);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  return prog;
}

// Shader editors
const vertEditor = document.getElementById("vertEditor");
const fragEditor = document.getElementById("fragEditor");
const shaderError = document.getElementById("shaderError");
vertEditor.value = VERTEX_SHADER;
fragEditor.value = FRAGMENT_SHADER;

const UNIFORMS = [
  "uModelView", "uProjection",
  "uLightPos", "uLightColor", "uSpotDir", "uSpotCos", "uAmbient",
  "uColor", "uSpecColor", "uKa", "uKd", "uKs", "uShininess", "uEmissive", "uToon", "uMode"
];
let program;
const U = {};   // uniform locations

function updateProgram() {
  try {
    const prog = createProgram(vertEditor.value, fragEditor.value);
    gl.deleteProgram(program);
    program = prog;
    gl.useProgram(program);
    for (const name of UNIFORMS) U[name] = gl.getUniformLocation(program, name);
    shaderError.textContent = "";
  } catch (e) {
    shaderError.textContent = e.message.replace(/\0/g, "");  // some drivers end the log with \0
  }
}
updateProgram();
vertEditor.addEventListener("input", updateProgram);
fragEditor.addEventListener("input", updateProgram);

function bindAttribute(name, data) {
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  gl.vertexAttribPointer(ATTRIBUTES[name], 3, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(ATTRIBUTES[name]);
}

function createMesh({ positions, normals, indices }) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  bindAttribute("aPosition", positions);
  bindAttribute("aNormal", normals);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
  return { vao, count: indices.length };
}

// Every shape gets a smooth version and a flat version (one normal per triangle)
function createMeshPair(geom) {
  return { smooth: createMesh(geom), flat: createMesh(toFlat(geom)) };
}

const cubeMesh = createMeshPair(orient(createSmoothCube()));
const cylinderMesh = createMeshPair(orient(createCylinder(32)));
const sphereMesh = createMeshPair(createSphere(16, 24));
const coneMesh = createMeshPair(createCone(32, false));
const torusMesh = createMeshPair(createTorus(1, 0.35, 40, 20));
const beamMesh = createMesh(createCone(48, false));

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.03, 0.03, 0.05, 1);
const projection = perspective(Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

// Interactive controls
let dragRotX = 0.45, dragRotY = -0.5;   // mouse drag
let camX = 0, camY = 0, camZ = -7;      // arrow keys, w, s
let sliderAngle = 0;                    // degrees
let spinning = false, spinAngle = 0;    // Start/Stop button

let mouseDown = false, lastX, lastY;
canvas.addEventListener("mousedown", e => { mouseDown = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener("mouseup", () => mouseDown = false);
window.addEventListener("mousemove", e => {
  if (!mouseDown) return;
  dragRotY += (e.clientX - lastX) * 0.01;
  dragRotX += (e.clientY - lastY) * 0.01;
  lastX = e.clientX; lastY = e.clientY;
});

document.addEventListener("keydown", e => {
  // let the editors and the form controls use the keys
  if (["TEXTAREA", "INPUT", "SELECT"].includes(e.target.tagName)) return;
  const step = 0.2;
  switch (e.key) {
    case "ArrowUp": camY -= step; break;
    case "ArrowDown": camY += step; break;
    case "ArrowLeft": camX += step; break;
    case "ArrowRight": camX -= step; break;
    case "w": camZ += step; break;
    case "s": camZ -= step; break;
    default: return;
  }
  e.preventDefault();  // keep the arrow keys from scrolling the page
});

const axisSelect = document.getElementById("axisSelect");
document.getElementById("slider").addEventListener("input", e => {
  sliderAngle = Number(e.target.value);
  document.getElementById("sliderValue").textContent = sliderAngle;
});
document.getElementById("spinButton").addEventListener("click", () => spinning = !spinning);


// Materials
const PRESETS = {
  matte:   { ka: 0.35, kd: 0.9,  ks: 0.0,  shininess: 1,   metal: false },
  plastic: { ka: 0.25, kd: 0.8,  ks: 0.6,  shininess: 48,  metal: false },
  metal:   { ka: 0.2,  kd: 0.35, ks: 1.0,  shininess: 80,  metal: true },
  chrome:  { ka: 0.1,  kd: 0.1,  ks: 1.2,  shininess: 200, metal: false },
  rubber:  { ka: 0.25, kd: 0.7,  ks: 0.15, shininess: 6,   metal: false }
};

function material(color, preset, shading = "smooth", emissive = 0) {
  return { color, ...PRESETS[preset], preset, shading, emissive };
}

function createNode(name, mesh, mat, shape) {
  return { name, mesh, material: mat, shape, joint: IDENTITY, children: [] };
}

// Scene graph:
//   table (root)
//   ├─ lamp base ─ lower arm ─ upper arm ─ lamp head ─ bulb
//   │                 └ shoulder joint      └ elbow joint
//   ├─ smooth sphere, flat sphere, torus, cube
const table = createNode("Table", cubeMesh, material([0.55, 0.35, 0.2], "matte", "flat"),
  multiply(translate(0, -0.08, 0), scale(2.6, 0.08, 1.8)));

const base = createNode("Lamp base", cylinderMesh, material([0.25, 0.27, 0.3], "metal"),
  multiply(translate(0, 0.06, 0), scale(0.45, 0.06, 0.45)));

const lowerArm = createNode("Lower arm", cylinderMesh, material([0.9, 0.15, 0.12], "plastic"),
  multiply(translate(0, 0.7, 0), scale(0.06, 0.7, 0.06)));
const shoulderJoint = createNode("Shoulder joint", sphereMesh, material([0.8, 0.8, 0.85], "chrome"),
  scale(0.11, 0.11, 0.11));

const upperArm = createNode("Upper arm", cylinderMesh, material([0.9, 0.15, 0.12], "plastic"),
  multiply(translate(0, 0.6, 0), scale(0.05, 0.6, 0.05)));
const elbowJoint = createNode("Elbow joint", sphereMesh, material([0.8, 0.8, 0.85], "chrome"),
  scale(0.09, 0.09, 0.09));

// The shade hangs from its apex at the end of the upper arm and opens along -y
const head = createNode("Lamp shade", coneMesh, material([0.95, 0.95, 0.9], "plastic"),
  multiply(translate(0, -0.24, 0), scale(0.3, 0.24, 0.3)));
const BULB_Y = -0.36;
const bulb = createNode("Bulb", sphereMesh, material([1, 0.85, 0.5], "matte", "smooth", 1),
  scale(0.1, 0.1, 0.1));
bulb.joint = translate(0, BULB_Y, 0);

const smoothSphere = createNode("Sphere (smooth)", sphereMesh, material([0.2, 0.45, 1], "plastic", "smooth"),
  scale(0.38, 0.38, 0.38));
smoothSphere.joint = translate(0.45, 0.38, 0.55);
const flatSphere = createNode("Sphere (flat)", sphereMesh, material([0.2, 0.45, 1], "plastic", "flat"),
  scale(0.38, 0.38, 0.38));
flatSphere.joint = translate(1.45, 0.38, 0.55);

const torus = createNode("Torus", torusMesh, material([1, 0.75, 0.25], "metal"),
  scale(0.32, 0.32, 0.32));
const cube = createNode("Cube", cubeMesh, material([0.3, 0.75, 0.35], "matte", "flat"),
  scale(0.25, 0.25, 0.25));

table.children.push(base, smoothSphere, flatSphere, torus, cube);
base.children.push(lowerArm);
lowerArm.children.push(shoulderJoint, upperArm);
upperArm.children.push(elbowJoint, head);
head.children.push(bulb);

const markerMaterial = material([1, 1, 1], "matte", "smooth", 1);
const beamMaterial = material([1, 1, 1], "matte");


// Movement, light and material UI
const $ = id => document.getElementById(id);

function bindRange(id, format = v => v) {
  const el = $(id), out = $(id + "Val");
  const show = () => { if (out) out.textContent = format(Number(el.value)); };
  el.addEventListener("input", show);
  show();
  return el;
}
const deg = v => v + "°";
const fixed = n => v => v.toFixed(n);

const pose = {
  baseYaw: bindRange("baseYaw", deg), shoulder: bindRange("shoulder", deg),
  elbow: bindRange("elbow", deg), headTilt: bindRange("headTilt", deg),
  torusSpeed: bindRange("torusSpeed", fixed(1)), cubeSlide: bindRange("cubeSlide", fixed(2))
};
const radians = el => Number(el.value) * Math.PI / 180;

bindRange("ambient", fixed(2));
for (const id of ["l0int", "l1int", "l2int", "l2speed"]) bindRange(id, fixed(2));
for (const id of ["l0x", "l0y", "l0z"]) bindRange(id, fixed(1));
bindRange("l1cut", deg);

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255);
const rgbToHex = rgb => "#" + rgb.map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");

function lightColor(i) {
  if (!$("l" + i + "on").checked) return [0, 0, 0];
  const k = Number($("l" + i + "int").value);
  return hexToRgb($("l" + i + "color").value).map(c => c * k);
}

// Material editor: pick an object, then edit its material
const editable = [table, base, lowerArm, upperArm, shoulderJoint, elbowJoint, head,
  smoothSphere, flatSphere, torus, cube];
const objSelect = $("objSelect");
editable.forEach((node, i) => objSelect.add(new Option(node.name, i)));
objSelect.value = editable.indexOf(smoothSphere);

const MAT_SLIDERS = { matKa: "ka", matKd: "kd", matKs: "ks", matShin: "shininess", matEmit: "emissive" };
const selected = () => editable[Number(objSelect.value)].material;

function loadMaterialUI() {
  const m = selected();
  $("matColor").value = rgbToHex(m.color);
  $("shading").value = m.shading;
  $("preset").value = m.preset || "";
  $("matMetal").checked = m.metal;
  for (const id in MAT_SLIDERS) {
    $(id).value = m[MAT_SLIDERS[id]];
    $(id + "Val").textContent = id === "matShin" ? m.shininess : m[MAT_SLIDERS[id]].toFixed(2);
  }
}
objSelect.addEventListener("change", loadMaterialUI);
$("matColor").addEventListener("input", e => selected().color = hexToRgb(e.target.value));
$("shading").addEventListener("change", e => selected().shading = e.target.value);
$("matMetal").addEventListener("change", e => { selected().metal = e.target.checked; selected().preset = ""; loadMaterialUI(); });
$("preset").addEventListener("change", e => {
  if (!e.target.value) return;
  Object.assign(selected(), PRESETS[e.target.value], { preset: e.target.value });
  loadMaterialUI();
});
for (const id in MAT_SLIDERS)
  $(id).addEventListener("input", e => {
    selected()[MAT_SLIDERS[id]] = Number(e.target.value);
    selected().preset = "";
    loadMaterialUI();
  });
loadMaterialUI();


// Drawing
function setMaterial(m) {
  gl.uniform3fv(U.uColor, m.color);
  gl.uniform3fv(U.uSpecColor, m.metal ? m.color : [1, 1, 1]);
  gl.uniform1f(U.uKa, m.ka);
  gl.uniform1f(U.uKd, m.kd);
  gl.uniform1f(U.uKs, m.ks);
  gl.uniform1f(U.uShininess, m.shininess);
  gl.uniform1f(U.uEmissive, m.emissive);
  gl.uniform1i(U.uToon, m.shading === "toon");
}

function drawMesh(mesh, modelView) {
  gl.uniformMatrix4fv(U.uModelView, false, modelView);
  gl.bindVertexArray(mesh.vao);
  gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
}

function drawNode(node, frame) {
  setMaterial(node.material);
  drawMesh(node.material.shading === "flat" ? node.mesh.flat : node.mesh.smooth, multiply(frame, node.shape));
}

// Walks the tree once to get every node's frame, so lights attached to the model
// (the lamp's spotlight) are known before anything is drawn
function computeFrames(root, rootFrame) {
  const frames = new Map();
  const stack = [[root, rootFrame]];
  while (stack.length > 0) {
    const [node, parentFrame] = stack.pop();
    const frame = multiply(parentFrame, node.joint);
    frames.set(node, frame);
    for (const child of node.children) stack.push([child, frame]);
  }
  return frames;
}

// Render loop
let lastTime = 0, torusAngle = 0, orbitAngle = 0;
function render(time) {
  const t = time / 1000, dt = t - lastTime;
  if (spinning) spinAngle += dt;
  torusAngle += dt * Number(pose.torusSpeed.value);
  orbitAngle += dt * Number($("l2speed").value);
  lastTime = t;
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Camera moves with the keys; the world lights stay fixed in the world.
  const view = translate(camX, camY, camZ);
  gl.uniformMatrix4fv(U.uProjection, false, projection);

  // Whole-model rotation
  const axisRotation = ROTATE[axisSelect.value](sliderAngle * Math.PI / 180 + spinAngle);
  const rotation = multiply(multiply(rotateY(dragRotY), rotateX(dragRotX)), axisRotation);
  table.joint = multiply(translate(0, -0.6, 0), rotation);

  // Lamp joints: slider pose plus an optional sway
  const sway = $("animate").checked ? 1 : 0;
  base.joint = multiply(translate(-1.3, 0, -0.3), rotateY(radians(pose.baseYaw) + sway * 0.6 * Math.sin(0.4 * t)));
  lowerArm.joint = multiply(translate(0, 0.12, 0), rotateZ(radians(pose.shoulder) + sway * 0.2 * Math.sin(0.9 * t)));
  upperArm.joint = multiply(translate(0, 1.4, 0), rotateZ(radians(pose.elbow) + sway * 0.25 * Math.sin(1.3 * t)));
  head.joint = multiply(translate(0, 1.2, 0), rotateZ(radians(pose.headTilt) + sway * 0.3 * Math.sin(1.7 * t + 1)));

  torus.joint = multiply(multiply(translate(1.4, 0.45, -0.85), rotateY(torusAngle)), rotateX(Math.PI / 2));
  cube.joint = multiply(translate(-0.2 + Number(pose.cubeSlide.value), 0.25, 1.05), rotateY(0.6));

  const frames = computeFrames(table, view);

  // Lights (all converted to eye space)
  const headFrame = frames.get(head);
  const worldLight = [Number($("l0x").value), Number($("l0y").value), Number($("l0z").value)];
  const orbitLight = [2.8 * Math.cos(orbitAngle), 1.6, 2.8 * Math.sin(orbitAngle)];
  const cutoff = Number($("l1cut").value) * Math.PI / 180;
  const lights = [
    { pos: transformPoint(view, worldLight), dir: [0, 0, -1], spotCos: -1, color: lightColor(0) },
    { pos: transformPoint(headFrame, [0, BULB_Y, 0]), dir: transformDir(headFrame, [0, -1, 0]),
      spotCos: Math.cos(cutoff), color: lightColor(1) },
    { pos: transformPoint(view, orbitLight), dir: [0, 0, -1], spotCos: -1, color: lightColor(2) }
  ];
  gl.uniform3fv(U.uLightPos, lights.flatMap(l => l.pos));
  gl.uniform3fv(U.uLightColor, lights.flatMap(l => l.color));
  gl.uniform3fv(U.uSpotDir, lights.flatMap(l => l.dir));
  gl.uniform1fv(U.uSpotCos, lights.map(l => l.spotCos));
  const amb = Number($("ambient").value);
  gl.uniform3fv(U.uAmbient, [amb, amb, amb]);
  gl.uniform1i(U.uMode, 0);

  // The bulb glows with the spotlight's color
  const bulbOn = $("l1on").checked;
  bulb.material.color = bulbOn ? hexToRgb($("l1color").value) : [0.3, 0.3, 0.3];
  bulb.material.emissive = bulbOn ? 1 : 0;

  for (const [node, frame] of frames) drawNode(node, frame);

  // Small glowing markers for the two free-floating lights
  for (const [i, p] of [[0, worldLight], [2, orbitLight]]) {
    if (!$("l" + i + "on").checked) continue;
    markerMaterial.color = hexToRgb($("l" + i + "color").value);
    setMaterial(markerMaterial);
    drawMesh(sphereMesh.smooth, multiply(multiply(view, translate(...p)), scale(0.08, 0.08, 0.08)));
  }

  // Additive volumetric-looking beam whose width matches the spotlight cone
  if (bulbOn && $("beam").checked) {
    const len = 2.5, r = len * Math.tan(cutoff);
    beamMaterial.color = lightColor(1).map(c => Math.min(c, 1));
    setMaterial(beamMaterial);
    gl.uniform1i(U.uMode, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.depthMask(false);
    drawMesh(beamMesh, multiply(headFrame, multiply(translate(0, BULB_Y - len / 2, 0), scale(r, len / 2, r))));
    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
