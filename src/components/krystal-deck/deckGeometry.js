import * as THREE from 'three';

// ============================================================================
// KRYSTAL-DECK // Precision 3D Portable Cassette Player (FiiO CP13 Architecture)
// & Removable 3D Compact Cassette Geometry + Studio Textures
// ============================================================================

export const BAY_X = -5.0;
export const BAY_Y = 1.0;
export const REEL_L_POS = [BAY_X - 22.5, BAY_Y + 2.0];
export const REEL_R_POS = [BAY_X + 22.5, BAY_Y + 2.0];

// Bottom hinge of the Walkman cassette door (swings forward around X axis)
export const DOOR_HINGE_Y = -42.5;
export const DOOR_HINGE_Z = 13.2;

/**
 * Helper: Creates a 2D THREE.Shape of a rounded rectangle centered at (ox, oy)
 */
export function makeRoundedRectShape(hw, hh, r, ox = 0, oy = 0) {
  const shape = new THREE.Shape();
  const rc = Math.min(r, hw, hh);
  shape.moveTo(ox - hw + rc, oy - hh);
  shape.lineTo(ox + hw - rc, oy - hh);
  shape.quadraticCurveTo(ox + hw, oy - hh, ox + hw, oy - hh + rc);
  shape.lineTo(ox + hw, oy + hh - rc);
  shape.quadraticCurveTo(ox + hw, oy + hh, ox + hw - rc, oy + hh);
  shape.lineTo(ox - hw + rc, oy + hh);
  shape.quadraticCurveTo(ox - hw, oy + hh, ox - hw, oy + hh - rc);
  shape.lineTo(ox - hw, oy - hh + rc);
  shape.quadraticCurveTo(ox - hw, oy - hh, ox - hw + rc, oy - hh);
  return shape;
}

/**
 * Helper: Creates a 2D THREE.Path hole of a rounded rectangle (CW winding)
 */
export function makeRoundedRectHole(hw, hh, r, ox = 0, oy = 0) {
  const path = new THREE.Path();
  const rc = Math.min(r, hw, hh);
  path.moveTo(ox - hw + rc, oy - hh);
  path.quadraticCurveTo(ox - hw, oy - hh, ox - hw, oy - hh + rc);
  path.lineTo(ox - hw, oy + hh - rc);
  path.quadraticCurveTo(ox - hw, oy + hh, ox - hw + rc, oy + hh);
  path.lineTo(ox + hw - rc, oy + hh);
  path.quadraticCurveTo(ox + hw, oy + hh, ox + hw, oy + hh - rc);
  path.lineTo(ox + hw, oy - hh + rc);
  path.quadraticCurveTo(ox + hw, oy - hh, ox + hw - rc, oy - hh);
  path.lineTo(ox - hw + rc, oy - hh);
  return path;
}

/**
 * Computes crease-angle smoothed vertex normals on any `THREE.BufferGeometry` (especially `ExtrudeGeometry`),
 * welding normals across bevel steps and curve segments (< `creaseAngleDeg`) while keeping crisp mechanical seams (> `creaseAngleDeg`).
 * This eliminates flat-shaded polygon banding on rounded corners and bevels for an ultra-smooth studio CAD finish!
 */
export function computeCreaseSmoothNormals(geometry, creaseAngleDeg = 58) {
  const posAttr = geometry.attributes.position;
  if (!posAttr) return geometry;

  const vCount = posAttr.count;
  const triCount = Math.floor(vCount / 3);
  const cosThresh = Math.cos((creaseAngleDeg * Math.PI) / 180);

  // 1. Compute area-weighted and unit face normals per triangle
  const areaNormals = new Float32Array(triCount * 3);
  const unitNormals = new Float32Array(triCount * 3);
  const buckets = new Map();

  for (let f = 0; f < triCount; f++) {
    const i0 = f * 3;
    const i1 = i0 + 1;
    const i2 = i0 + 2;

    const ax = posAttr.getX(i0);
    const ay = posAttr.getY(i0);
    const az = posAttr.getZ(i0);
    const bx = posAttr.getX(i1);
    const by = posAttr.getY(i1);
    const bz = posAttr.getZ(i1);
    const cx = posAttr.getX(i2);
    const cy = posAttr.getY(i2);
    const cz = posAttr.getZ(i2);

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    const len = Math.hypot(nx, ny, nz) || 1e-6;

    const f3 = f * 3;
    areaNormals[f3] = nx;
    areaNormals[f3 + 1] = ny;
    areaNormals[f3 + 2] = nz;
    unitNormals[f3] = nx / len;
    unitNormals[f3 + 1] = ny / len;
    unitNormals[f3 + 2] = nz / len;

    for (let k = 0; k < 3; k++) {
      const vi = i0 + k;
      const vx = posAttr.getX(vi);
      const vy = posAttr.getY(vi);
      const vz = posAttr.getZ(vi);
      const key = `${Math.round(vx * 250)},${Math.round(vy * 250)},${Math.round(vz * 250)}`;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(vi);
    }
  }

  // 2. Average area-weighted normals within `creaseAngleDeg` at each shared spatial vertex
  const outNormals = new Float32Array(vCount * 3);
  buckets.forEach((vertIndices) => {
    const len = vertIndices.length;
    for (let a = 0; a < len; a++) {
      const va = vertIndices[a];
      const fa3 = Math.floor(va / 3) * 3;
      const ux = unitNormals[fa3];
      const uy = unitNormals[fa3 + 1];
      const uz = unitNormals[fa3 + 2];

      let sx = 0;
      let sy = 0;
      let sz = 0;
      for (let b = 0; b < len; b++) {
        const vb = vertIndices[b];
        const fb3 = Math.floor(vb / 3) * 3;
        const dot =
          ux * unitNormals[fb3] + uy * unitNormals[fb3 + 1] + uz * unitNormals[fb3 + 2];
        if (dot >= cosThresh) {
          sx += areaNormals[fb3];
          sy += areaNormals[fb3 + 1];
          sz += areaNormals[fb3 + 2];
        }
      }
      const sLen = Math.hypot(sx, sy, sz) || 1.0;
      const v3 = va * 3;
      outNormals[v3] = sx / sLen;
      outNormals[v3 + 1] = sy / sLen;
      outNormals[v3 + 2] = sz / sLen;
    }
  });

  geometry.setAttribute('normal', new THREE.BufferAttribute(outNormals, 3));
  return geometry;
}

/**
 * Generates a clean, smooth Studio Softbox PMREM Environment Map (Zero glitter/noise!)
 * Tuned for creamy soft-matte industrial surfaces & smooth specular bevel roll-off (RayCue / Braun studio style)
 */
export function createStudioEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileCubemapShader();

  const envScene = new THREE.Scene();
  // Warm, neutral studio cyclorama dome so cream, silver, and anodized finishes look soft and natural
  envScene.background = new THREE.Color(0xebe7df);

  // Broad upper-left studio softbox bank
  const keyBox = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 36),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.95, 1.90, 1.82), side: THREE.DoubleSide })
  );
  keyBox.position.set(-20, 18, 22);
  keyBox.lookAt(0, 0, 0);
  envScene.add(keyBox);

  // Wide overhead studio softbox for creamy top-deck illumination and smooth bevel highlights
  const topBox = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 34),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(2.15, 2.10, 2.02), side: THREE.DoubleSide })
  );
  topBox.position.set(0, 28, 6);
  topBox.lookAt(0, 0, 0);
  envScene.add(topBox);

  // Soft right fill softbox
  const rimBox = new THREE.Mesh(
    new THREE.PlaneGeometry(32, 40),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.65, 1.68, 1.74), side: THREE.DoubleSide })
  );
  rimBox.position.set(26, 6, 16);
  rimBox.lookAt(0, 0, 0);
  envScene.add(rimBox);

  // Gentle side studio negative-fill flags for natural 3D side-wall shading depth
  const flagLeft = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 34),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.42, 0.40, 0.38), side: THREE.DoubleSide })
  );
  flagLeft.position.set(-30, -2, -2);
  flagLeft.lookAt(0, 0, 0);
  envScene.add(flagLeft);

  const flagRight = new THREE.Mesh(
    new THREE.PlaneGeometry(18, 34),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.45, 0.44, 0.42), side: THREE.DoubleSide })
  );
  flagRight.position.set(28, -4, -10);
  flagRight.lookAt(0, 0, 0);
  envScene.add(flagRight);

  // Clean white studio bounce floor
  const floorBox = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 70),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.22, 1.18), side: THREE.DoubleSide })
  );
  floorBox.position.set(0, -24, 0);
  floorBox.lookAt(0, 0, 0);
  envScene.add(floorBox);

  const envRT = pmrem.fromScene(envScene, 0.045);
  pmrem.dispose();
  return envRT.texture;
}

/**
 * Creates a silky-smooth, low-frequency micro-anisotropic sheen texture (Zero random pixel noise!)
 */
export function createBrushedMetalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0.0, '#7e80ff');
  grad.addColorStop(0.5, '#8282ff');
  grad.addColorStop(1.0, '#7e80ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * 5 Iconic Soft-Matte Studio Color Variants for the KRYSTAL Walkin Shiny Edition Cassette Player
 * Tuned for creamy, smooth industrial product rendering (RayCue / Braun / FiiO studio quality):
 *  - Warm Studio Ivory & Brushed Champagne (Default)
 *  - Sky Blue & Studio Silver
 *  - Sunset Red & Studio Silver
 *  - Stealth Obsidian & Brushed Gold
 *  - Sage Green & Warm Ivory
 */
export const PLAYER_COLOR_VARIANTS = [
  {
    id: 'champagne',
    name: 'Warm Sandstone & Brushed Bronze',
    shortName: 'Sandstone',
    swatch: 'linear-gradient(135deg, #ab997c 0%, #87755a 52%, #d4ba82 52%, #9a7e48 100%)',
    swatchA: '#9c8b70',
    swatchB: '#bfa672',
    bodyColor: '#9c8b70',
    doorColor: '#b3a286',
    pinstripeColor: '#2a231b',
    rollerColor: '#c4a870',
    metalness: 0.14,
    roughness: 0.38,
    fasciaStops: ['#b89f6b', '#d8c292', '#c5ac78', '#9e8452'],
    fasciaInk: '#161411',
    bridgeStops: ['#b89f6b', '#d8c292', '#c5ac78', '#9e8452'],
    bridgeInk: '#161411',
    btnCapColor: '#7a6950',
    btnInk: '#12100c',
    lowerPanelBg: '#b8a480',
    lowerPanelInk: '#161411',
    lowerPanelLine: 'rgba(22, 20, 17, 0.52)',
  },
  {
    id: 'sky-blue',
    name: 'Sky Blue & Machined Titanium',
    shortName: 'Sky Blue',
    swatch: 'linear-gradient(135deg, #4b84b0 0%, #386b94 52%, #bcc7d6 52%, #8e9cad 100%)',
    swatchA: '#437aa4',
    swatchB: '#b0bccb',
    bodyColor: '#3f739e',
    doorColor: '#b0bccb',
    pinstripeColor: '#1a2f42',
    rollerColor: '#b8c4d4',
    metalness: 0.14,
    roughness: 0.38,
    fasciaStops: ['#b6c1cf', '#d8e0eb', '#c5cfdc', '#9eaab9'],
    fasciaInk: '#10151e',
    bridgeStops: ['#b6c1cf', '#d8e0eb', '#c5cfdc', '#9eaab9'],
    bridgeInk: '#10151e',
    btnCapColor: '#647b94',
    btnInk: '#0d131b',
    lowerPanelBg: '#b6c2d1',
    lowerPanelInk: '#10151e',
    lowerPanelLine: 'rgba(16, 21, 30, 0.52)',
  },
  {
    id: 'retro-red',
    name: 'Sunset Red & Gunmetal Silver',
    shortName: 'Sunset Red',
    swatch: 'linear-gradient(135deg, #c22c22 0%, #9c1d15 52%, #c0c8d4 52%, #929ca9 100%)',
    swatchA: '#ad261d',
    swatchB: '#b4bcc8',
    bodyColor: '#ad261d',
    doorColor: '#b4bcc8',
    pinstripeColor: '#380e0a',
    rollerColor: '#bcc4d0',
    metalness: 0.14,
    roughness: 0.38,
    fasciaStops: ['#b8c0cc', '#dae0e9', '#c6ced9', '#a0a9b7'],
    fasciaInk: '#161212',
    bridgeStops: ['#b8c0cc', '#dae0e9', '#c6ced9', '#a0a9b7'],
    bridgeInk: '#161212',
    btnCapColor: '#6c7482',
    btnInk: '#101216',
    lowerPanelBg: '#b8c0cc',
    lowerPanelInk: '#161212',
    lowerPanelLine: 'rgba(22, 18, 18, 0.52)',
  },
  {
    id: 'obsidian',
    name: 'Stealth Obsidian & Brushed Gold',
    shortName: 'Obsidian',
    swatch: 'linear-gradient(135deg, #262930 0%, #15171c 54%, #d8bc82 54%, #ae8f52 100%)',
    swatchA: '#1c1e24',
    swatchB: '#d4b678',
    bodyColor: '#1c1e24',
    doorColor: '#252830',
    pinstripeColor: '#c8aa6c',
    rollerColor: '#d6bc82',
    metalness: 0.16,
    roughness: 0.38,
    fasciaStops: ['#c8ae74', '#e8d4a4', '#d6bc86', '#b89c62'],
    fasciaInk: '#141416',
    bridgeStops: ['#c8ae74', '#e8d4a4', '#d6bc86', '#b89c62'],
    bridgeInk: '#141416',
    btnCapColor: '#b89858',
    btnInk: '#14120c',
    lowerPanelBg: '#23262e',
    lowerPanelInk: '#e4ca90',
    lowerPanelLine: 'rgba(228, 202, 144, 0.48)',
  },
  {
    id: 'sage-titanium',
    name: 'Sage Green & Warm Pewter',
    shortName: 'Sage Green',
    swatch: 'linear-gradient(135deg, #567864 0%, #3f5c4b 52%, #c8b282 52%, #9a804c 100%)',
    swatchA: '#486855',
    swatchB: '#b4ac9b',
    bodyColor: '#486855',
    doorColor: '#b4ac9b',
    pinstripeColor: '#1e2e24',
    rollerColor: '#c4ae82',
    metalness: 0.14,
    roughness: 0.38,
    fasciaStops: ['#b89f6b', '#d8c292', '#c5ac78', '#9e8452'],
    fasciaInk: '#121814',
    bridgeStops: ['#b89f6b', '#d8c292', '#c5ac78', '#9e8452'],
    bridgeInk: '#121814',
    btnCapColor: '#6a7e72',
    btnInk: '#101612',
    lowerPanelBg: '#b8b09e',
    lowerPanelInk: '#121814',
    lowerPanelLine: 'rgba(18, 24, 20, 0.52)',
  },
];

/**
 * Helper: Draws an ultra-smooth, continuous satin-anodized metal surface onto a 2D canvas context
 * (Zero horizontal stripe bars or pixel noise — pure creamy studio gradient!)
 */
function fillBrushedMetalSurface(ctx, w, h, stops) {
  const grad = ctx.createLinearGradient(0, 0, w, h * 0.25);
  grad.addColorStop(0.0, stops[0]);
  grad.addColorStop(0.28, stops[1]);
  grad.addColorStop(0.54, stops[2]);
  grad.addColorStop(0.80, stops[1]);
  grad.addColorStop(1.0, stops[3]);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft vertical studio softbox roll-off so the plaque looks smoothly contoured
  const vGrad = ctx.createLinearGradient(0, 0, 0, h);
  vGrad.addColorStop(0.0, 'rgba(255, 255, 255, 0.22)');
  vGrad.addColorStop(0.32, 'rgba(255, 255, 255, 0.04)');
  vGrad.addColorStop(0.72, 'rgba(0, 0, 0, 0.02)');
  vGrad.addColorStop(1.0, 'rgba(0, 0, 0, 0.09)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Helper: Draws a realistic metallic slotted/cross screw head on a 2D canvas
 */
function drawCanvasScrewHead(ctx, cx, cy, r) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 2.5, 0, Math.PI * 2);
  ctx.fill();

  const sGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sGrad.addColorStop(0, '#f8fafc');
  sGrad.addColorStop(0.5, '#c4cbd6');
  sGrad.addColorStop(1, '#727884');
  ctx.fillStyle = sGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(20, 22, 26, 0.82)';
  ctx.lineWidth = Math.max(2.2, r * 0.26);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.58, cy);
  ctx.lineTo(cx + r * 0.58, cy);
  ctx.moveTo(cx, cy - r * 0.58);
  ctx.lineTo(cx, cy + r * 0.58);
  ctx.stroke();
  ctx.restore();
}

/**
 * Creates the high-resolution 4-Screw Brushed Brass / Silver Lower Door Plaque Texture
 * Matches the user's KRYSTAL reference ("KRYSTAL / SERIES FP15 · OFC COPPER FLYWHEEL / Walkin Shiny Edition")
 */
export function createDoorFasciaTexture(variant = PLAYER_COLOR_VARIANTS[0]) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 2048, 360);

  const stops = variant.fasciaStops || PLAYER_COLOR_VARIANTS[0].fasciaStops;
  const ink = variant.fasciaInk || '#141416';

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(6, 6, 2036, 348, 32);
  ctx.clip();

  fillBrushedMetalSurface(ctx, 2048, 360, stops);

  // Crisp inner metallic bevel highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.54)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(12, 12, 2024, 336, 27);
  ctx.stroke();

  // 4 Corner Screws outside the inner rounded racetrack frame (exact match to reference!)
  const screwR = 17;
  drawCanvasScrewHead(ctx, 38, 38, screwR);
  drawCanvasScrewHead(ctx, 2010, 38, screwR);
  drawCanvasScrewHead(ctx, 38, 322, screwR);
  drawCanvasScrewHead(ctx, 2010, 322, screwR);

  // Inner black rounded-rectangle racetrack border
  ctx.strokeStyle = ink;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.roundRect(68, 26, 1912, 308, 38);
  ctx.stroke();

  // Horizontal center divider line inside the racetrack
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(68, 184);
  ctx.lineTo(1980, 184);
  ctx.stroke();

  // Vertical divider line in the lower half (x = 740)
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(740, 184);
  ctx.lineTo(740, 334);
  ctx.stroke();

  // Top-left geometric bold logo ("KRYSTAL")
  ctx.fillStyle = ink;
  ctx.font = '900 72px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('KRYSTAL', 116, 132);

  // Top-right specification line ("SERIES FP15 · OFC COPPER FLYWHEEL")
  ctx.font = '700 24px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '2.5px';
  ctx.fillText('SERIES FP15  ·  OFC COPPER FLYWHEEL', 1110, 122);

  // Bottom-left: [DS] badge + PURE ANALOG STAGE / TYPE I · II · IV METAL
  ctx.lineWidth = 4.5;
  ctx.strokeRect(116, 224, 52, 42);
  ctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '0px';
  ctx.fillText('DS', 126, 253);

  ctx.font = '700 20px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('PURE ANALOG STAGE', 184, 244);
  ctx.font = '600 17px "SF Mono", Consolas, monospace';
  ctx.letterSpacing = '1px';
  ctx.fillText('TYPE I · II · IV METAL', 184, 272);

  // Bottom-center: "Walkin Shiny Edition"
  ctx.font = '600 41px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '1px';
  ctx.fillText('Walkin Shiny Edition', 790, 272);

  // Bottom-right: Circular Dual Capstan emblem + text
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.arc(1465, 258, 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.font = '800 19px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('∞', 1455, 265);

  ctx.font = '700 21px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.letterSpacing = '1.5px';
  ctx.fillText('DUAL CAPSTAN', 1504, 250);
  ctx.font = '600 18px "SF Mono", Consolas, monospace';
  ctx.letterSpacing = '1px';
  ctx.fillText('AUTO-STOP SYST', 1504, 276);

  ctx.restore();

  // Outer recessed dark hairline groove around the rounded plaque
  ctx.strokeStyle = 'rgba(15, 16, 20, 0.58)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(6, 6, 2036, 348, 32);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates the Upper-Right Brushed Brass / Silver Control Plate Texture (`P ● N / POWER`)
 * Uses a rounded-rectangle alpha mask so the upper plate has crisp rounded corners (matching reference!)
 */
export function createUpperPillarPlateTexture(variant = PLAYER_COLOR_VARIANTS[0]) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1360;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 1360);

  const stops = variant.fasciaStops || PLAYER_COLOR_VARIANTS[0].fasciaStops;
  const ink = variant.fasciaInk || '#141416';

  // Clip to a clean rounded-rectangle plate so corners are smoothly rounded (no sharp black rectangle!)
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 1340, 48);
  ctx.clip();

  fillBrushedMetalSurface(ctx, 512, 1360, stops);

  // Inner metallic highlight rim
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.48)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(18, 18, 476, 1324, 42);
  ctx.stroke();

  // "P" and "N" flanking the top green Power LED (`y = 185`)
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 50px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.fillText('P', 102, 185);
  ctx.fillText('N', 410, 185);

  // "POWER" centered below the LED (`y = 370`)
  ctx.font = '700 46px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('POWER', 256, 370);

  // Dark recessed rectangular slot around the 3D horizontal knurled roller (`y = 510..810`)
  ctx.fillStyle = '#0d0e12';
  ctx.beginPath();
  ctx.roundRect(34, 515, 444, 290, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(36, 517, 440, 286, 18);
  ctx.stroke();

  // Circular shadow well for the reset push-button below the roller (`y = 975`)
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.arc(256, 975, 66, 0, Math.PI * 2);
  ctx.fill();

  // Small recessed rectangular sensor badge `[100]` near bottom of upper plate (`y = 1205`)
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(196, 1175, 120, 56, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.font = '700 28px "SF Mono", Consolas, monospace';
  ctx.fillText('100', 256, 1205);

  ctx.restore();

  // Outer recessed dark hairline groove around the rounded plate
  ctx.strokeStyle = 'rgba(15, 16, 20, 0.62)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 1340, 48);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates the Lower-Right Recessed I/O Legend Panel Texture
 * (`VOL`, `HOLD`, `USB-C`, `4.4mm`, `3.5mm` with hairline dividers & right pin-dots, exact match to reference!)
 */
export function createLowerPillarLegendTexture(variant = PLAYER_COLOR_VARIANTS[0]) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1760;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 1760);

  const stops = variant.fasciaStops || PLAYER_COLOR_VARIANTS[0].fasciaStops;
  const lineCol = variant.lowerPanelLine || 'rgba(20, 24, 32, 0.48)';
  const ink = variant.lowerPanelInk || '#16181e';

  // Clip to rounded rectangle so the panel sits seamlessly on the right pillar without sharp square corners
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 1740, 48);
  ctx.clip();

  if (variant.id === 'obsidian') {
    ctx.fillStyle = variant.lowerPanelBg || '#23262e';
    ctx.fillRect(0, 0, 512, 1760);
  } else {
    fillBrushedMetalSurface(ctx, 512, 1760, stops);
  }

  // Inner metallic highlight rim matching the upper POWER plate
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.roundRect(18, 18, 476, 1724, 42);
  ctx.stroke();

  const items = [
    { title: 'VOL', sub: 'LEVEL' },
    { title: 'HOLD', sub: 'LOCK' },
    { title: 'USB-C', sub: '5V IN' },
    { title: '4.4mm', sub: 'BAL OUT' },
    { title: '3.5mm', sub: 'PHONE' },
  ];

  const rowH = 1700 / 5;
  items.forEach((item, idx) => {
    const topY = 30 + idx * rowH;
    // Horizontal hairline divider between rows
    if (idx > 0) {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(42, topY);
      ctx.lineTo(470, topY);
      ctx.stroke();
    }

    // Left-aligned technical callout text (high-contrast & razor-sharp!)
    ctx.fillStyle = ink;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '800 56px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
    ctx.fillText(item.title, 58, topY + 148);

    ctx.globalAlpha = 0.86;
    ctx.font = '700 35px "SF Mono", Consolas, monospace';
    ctx.fillText(item.sub, 58, topY + 206);
    ctx.globalAlpha = 1.0;

    // Tiny pin-dot indicator on the right side of each row (matching reference photo!)
    ctx.beginPath();
    ctx.arc(434, topY + 166, 10, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();

  // Outer recessed dark hairline groove border matching the upper POWER plate
  ctx.strokeStyle = 'rgba(15, 16, 20, 0.62)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.roundRect(10, 10, 492, 1740, 48);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates a soft Ambient Occlusion (AO) contact shadow texture behind the raised cassette door
 * so the door casts a rich, grounded 3D shadow onto the front chassis just like the studio reference photo.
 */
function createDoorContactShadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 384;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 384);

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.52)';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetX = 4;
  ctx.shadowOffsetY = 6;
  ctx.beginPath();
  ctx.roundRect(28, 28, 456, 328, 26);
  ctx.fill();
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

/**
 * Creates a rich, luminous copper-bronze ferric-oxide magnetic tape spool texture for the cassette reels
 */
function createMagneticTapeSpoolTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5c3824';
  ctx.fillRect(0, 0, 512, 512);

  // Warm anisotropic radial sheen across the wound tape pack so the spools gleam inside the window
  const grad = ctx.createLinearGradient(0, 0, 512, 512);
  grad.addColorStop(0.0, 'rgba(255, 218, 180, 0.22)');
  grad.addColorStop(0.38, 'rgba(30, 14, 6, 0.16)');
  grad.addColorStop(0.54, 'rgba(255, 224, 190, 0.28)');
  grad.addColorStop(0.75, 'rgba(180, 110, 68, 0.16)');
  grad.addColorStop(1.0, 'rgba(28, 12, 5, 0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Concentric tightly-wound magnetic tape layer rings
  for (let r = 40; r < 252; r += 3) {
    ctx.strokeStyle = r % 6 === 0 ? 'rgba(255, 224, 192, 0.16)' : 'rgba(20, 8, 3, 0.20)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Creates the Interior Polished Head-Bridge Escutcheon Plate Texture
 * ("KRYSTAL          BORN FOR MUSIC &") visible through the lower part of the glass window!
 */
export function createInnerBridgePlateTexture(variant = PLAYER_COLOR_VARIANTS[0]) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 280;
  const ctx = canvas.getContext('2d');

  const stops = variant.bridgeStops || PLAYER_COLOR_VARIANTS[0].bridgeStops;
  const ink = variant.bridgeInk || '#1c1812';

  fillBrushedMetalSurface(ctx, 2048, 280, stops);

  // Top & bottom thin dark rules
  ctx.fillStyle = ink;
  ctx.globalAlpha = 0.72;
  ctx.fillRect(36, 18, 1976, 6);
  ctx.fillRect(36, 256, 1976, 6);
  ctx.globalAlpha = 1.0;

  // Left bold brand mark
  ctx.fillStyle = ink;
  ctx.font = '900 84px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '5px';
  ctx.fillText('KRYSTAL', 78, 172);

  // Right "BORN FOR MUSIC" motto + musical clef emblem
  ctx.font = '600 66px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('BORN FOR MUSIC  𝄞', 1020, 168);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates the Rear CNC Engraved Industrial Specification & Serial Badging Plate Texture
 * Mounted on the back of the player (`z = -15.65`) so rotating 180° reveals authentic Walkman/FiiO specs!
 */
export function createRearSpecPlateTexture(variant = PLAYER_COLOR_VARIANTS[0]) {
  const canvas = document.createElement('canvas');
  canvas.width = 1400;
  canvas.height = 920;
  const ctx = canvas.getContext('2d');

  // Subtle recessed dark-anodized / satin metallic spec plate
  const isDark = variant.id === 'obsidian';
  ctx.fillStyle = isDark ? '#181a20' : 'rgba(20, 22, 26, 0.08)';
  ctx.fillRect(0, 0, 1400, 920);

  const ink = isDark ? '#e3c78e' : '#1b1d22';
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;

  // Outer technical border frame
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(48, 48, 1304, 824, 32);
  ctx.stroke();

  // Inner header divider
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(88, 220);
  ctx.lineTo(1312, 220);
  ctx.moveTo(88, 660);
  ctx.lineTo(1312, 660);
  ctx.stroke();

  ctx.globalAlpha = 0.88;
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '6px';
  ctx.fillText('KRYSTAL AUDIO', 92, 148);

  ctx.font = '700 28px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.letterSpacing = '3px';
  ctx.fillText('MODEL KD-FP15 · STEREO CASSETTE PLAYER', 94, 192);

  // Right-top Hi-Res Analog & Dolby-style double-D emblem box
  ctx.lineWidth = 4;
  ctx.strokeRect(1040, 94, 268, 96);
  ctx.font = '800 26px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('PURE ANALOG', 1068, 136);
  ctx.font = '600 20px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('4.4mm + 3.5mm OUT', 1068, 168);

  // Center mechanical diagram & technical specifications
  ctx.globalAlpha = 0.78;
  ctx.font = '600 26px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  const specs = [
    '• DRIVE SYSTEM: DUAL-CAPSTAN BELT DRIVE WITH OFC COPPER FLYWHEEL',
    '• TAPE HEAD: CUSTOM PERMALLOY 2-CHANNEL STEREO PLAYBACK HEAD',
    '• AMPLIFIER: DIFFERENTIAL LOW-NOISE ANALOG OP-AMP STAGE (250mW)',
    '• POWER SUPPLY: 1800mAh LITHIUM POLYMER · USB TYPE-C 5V === 1.0A',
    '• FREQUENCY RESPONSE: 40Hz – 16,000Hz (±3dB TYPE I / II / IV TAPE)',
  ];
  specs.forEach((line, i) => {
    ctx.fillText(line, 96, 300 + i * 64);
  });

  // Bottom row: Serial Number Barcode & Regulatory Badges
  ctx.globalAlpha = 0.85;
  ctx.font = '700 24px "SF Mono", Consolas, monospace';
  ctx.fillText('S/N: KDFP15-2026-084921-AU', 96, 730);
  ctx.font = '500 22px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText('DESIGNED BY KRYSTAL ACOUSTIC LABS · WALKIN SHINY EDITION', 96, 774);

  // Simulated barcode bars on bottom right
  for (let bx = 940; bx < 1290; bx += 9) {
    const bw = (bx * 7) % 13 > 5 ? 5 : 2;
    ctx.fillRect(bx, 700, bw, 68);
  }
  ctx.font = '700 20px "SF Mono", Consolas, monospace';
  ctx.fillText('CE   FC   RoHS   ♻', 940, 804);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates a crisp knurled metallic flute texture wrapped around the horizontal roller drum on the upper-right plate
 */
function createKnurledRollerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#d8dde6';
  ctx.fillRect(0, 0, 256, 512);

  // 32 horizontal axial knurl grooves around the drum circumference
  const ribs = 32;
  const step = 512 / ribs;
  for (let i = 0; i < ribs; i++) {
    const y = i * step;
    const g = ctx.createLinearGradient(0, y, 0, y + step);
    g.addColorStop(0.0, '#3a3e47');
    g.addColorStop(0.22, '#f8fafc');
    g.addColorStop(0.55, '#c4cbd6');
    g.addColorStop(0.85, '#686e7a');
    g.addColorStop(1.0, '#2c3038');
    ctx.fillStyle = g;
    ctx.fillRect(0, y, 256, step);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Draws crisp geometric wireframe transport icons (`▷`, `▷||`, `◁◁`, `▷▷`, `A⇄B`, `■`) matching the reference buttons!
 */
function drawTransportIconOnCanvas(ctx, symbol, cx, cy, scale = 1.0, ink = '#14161b') {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.strokeStyle = ink;
  ctx.fillStyle = ink;
  ctx.lineWidth = 4.6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const drawTri = (x0, y0, x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();
    ctx.stroke();
  };

  if (symbol === '▶') {
    drawTri(-14, -14, 16, 0, -14, 14);
  } else if (symbol === '▶||') {
    drawTri(-22, -13, 2, 0, -22, 13);
    ctx.lineWidth = 4.8;
    ctx.beginPath();
    ctx.moveTo(11, -13);
    ctx.lineTo(11, 13);
    ctx.moveTo(21, -13);
    ctx.lineTo(21, 13);
    ctx.stroke();
  } else if (symbol === '◀◀') {
    drawTri(2, -13, -20, 0, 2, 13);
    drawTri(22, -13, 0, 0, 22, 13);
  } else if (symbol === '▶▶') {
    drawTri(-22, -13, 0, 0, -22, 13);
    drawTri(-2, -13, 20, 0, -2, 13);
  } else if (symbol === '■') {
    ctx.strokeRect(-12, -12, 24, 24);
  } else {
    ctx.font = '800 28px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(symbol, 0, 1);
  }
  ctx.restore();
}

/**
 * Creates a crisp 512x256 laser-engraved TOP & FRONT face texture for each physical transport button.
 * Includes a bold dark perimeter chamfer frame so the buttons stand out crisply against the white studio background!
 */
export function createButtonTopTexture(
  symbol,
  isRed = false,
  variant = PLAYER_COLOR_VARIANTS[0]
) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  const baseHex = isRed ? '#d43325' : variant.btnCapColor || '#b89d6b';
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 256);

  // Smooth satin studio keycap contour shading (Zero vertical stripe noise!)
  const topSheen = ctx.createLinearGradient(0, 0, 0, 256);
  topSheen.addColorStop(0.0, 'rgba(255, 255, 255, 0.16)');
  topSheen.addColorStop(0.30, 'rgba(255, 255, 255, 0.02)');
  topSheen.addColorStop(0.75, 'rgba(0, 0, 0, 0.04)');
  topSheen.addColorStop(1.0, 'rgba(0, 0, 0, 0.18)');
  ctx.fillStyle = topSheen;
  ctx.fillRect(0, 0, 512, 256);

  // Crisp dark machined outer perimeter rim so the button silhouette never mixes with the white studio backdrop
  ctx.strokeStyle = isRed ? 'rgba(68, 12, 8, 0.82)' : 'rgba(22, 26, 34, 0.76)';
  ctx.lineWidth = 14;
  ctx.strokeRect(5, 5, 502, 246);

  // Subtle inner metallic bevel highlight
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(15, 15, 482, 226, 16);
  ctx.stroke();

  // Clean laser-etched wireframe transport symbol centered on the keycap face
  drawTransportIconOnCanvas(
    ctx,
    symbol,
    256,
    120,
    2.25,
    isRed ? 'rgba(32, 6, 4, 0.88)' : variant.btnInk || '#14161b'
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates the Left-Side Debossed Brand & Louver Vent Texture (`KRYSTAL` + 4 horizontal acoustic louver slots,
 * inspired by the smooth side-wall detailing in the RayCue studio render!)
 */
function createLeftSideWallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 512, 1024);

  // Debossed "KRYSTAL" side-wall wordmark
  ctx.save();
  ctx.font = '800 56px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '4px';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fillText('KRYSTAL', 258, 562);
  ctx.fillStyle = 'rgba(20, 20, 24, 0.28)';
  ctx.fillText('KRYSTAL', 256, 560);
  ctx.restore();

  // 4 Precision Recessed Horizontal Acoustic / Cooling Louver Slots along lower side wall
  for (let i = 0; i < 4; i++) {
    const y = 660 + i * 54;
    // Lower bevel highlight lip
    ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.beginPath();
    ctx.roundRect(56, y + 4, 400, 22, 11);
    ctx.fill();

    // Recessed dark louver slot
    const slotGrad = ctx.createLinearGradient(0, y, 0, y + 22);
    slotGrad.addColorStop(0.0, 'rgba(12, 14, 18, 0.62)');
    slotGrad.addColorStop(0.45, 'rgba(20, 22, 28, 0.42)');
    slotGrad.addColorStop(1.0, 'rgba(28, 30, 36, 0.25)');
    ctx.fillStyle = slotGrad;
    ctx.beginPath();
    ctx.roundRect(56, y, 400, 20, 10);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Creates a Precision CNC Micro-Perforated Top-Deck Acoustic Grille Texture (inspired by the RayCue top deck!)
 */
function createTopSpeakerGrilleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 1024, 192);

  const cols = 29;
  const rows = 5;
  const startX = 64;
  const endX = 960;
  const stepX = (endX - startX) / (cols - 1);
  const startY = 34;
  const stepY = 31;

  for (let r = 0; r < rows; r++) {
    const rowOffset = (r % 2) * (stepX * 0.5);
    const count = r % 2 === 0 ? cols : cols - 1;
    for (let c = 0; c < count; c++) {
      const cx = startX + c * stepX + rowOffset;
      const cy = startY + r * stepY;
      const rHole = 6.2;

      // Subtle lower-right rim highlight around each CNC micro-hole
      ctx.fillStyle = 'rgba(255, 255, 255, 0.36)';
      ctx.beginPath();
      ctx.arc(cx + 1.2, cy + 1.4, rHole, 0, Math.PI * 2);
      ctx.fill();

      // Deep dark acoustic perforation well
      ctx.fillStyle = 'rgba(14, 16, 20, 0.68)';
      ctx.beginPath();
      ctx.arc(cx, cy, rHole, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Builds the complete KRYSTAL Walkin Shiny Edition 3D Cassette Player & Removable Cassette Scene Graph
 */
export function buildWalkmanPlayerScene(renderer, initialArtTexture) {
  const envMap = createStudioEnvironment(renderer);
  const initialVariant = PLAYER_COLOR_VARIANTS[0];
  const doorFasciaTex = createDoorFasciaTexture(initialVariant);
  const upperPillarTex = createUpperPillarPlateTexture(initialVariant);
  const lowerPillarTex = createLowerPillarLegendTexture(initialVariant);
  const bridgePlateTex = createInnerBridgePlateTexture(initialVariant);
  const rearSpecTex = createRearSpecPlateTexture(initialVariant);
  const knurledRollerTex = createKnurledRollerTexture();
  const doorShadowTex = createDoorContactShadowTexture();
  const tapeSpoolTex = createMagneticTapeSpoolTexture();
  const leftSideWallTex = createLeftSideWallTexture();
  const topGrilleTex = createTopSpeakerGrilleTexture();

  // Helper: Adds a subtle dark studio Fresnel silhouette contour at grazing angles
  // so no colorway or bevel edge ever washes out into the white studio background!
  const applySilhouetteContour = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        float rimNdotV = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float silhouetteEdge = pow(clamp(1.0 - rimNdotV, 0.0, 1.0), 2.4);
        gl_FragColor.rgb *= mix(1.0, 0.68, silhouetteEdge);
        #include <dithering_fragment>
        `
      );
    };
    return mat;
  };

  // --- Shared Physically-Based Soft-Matte Studio Materials (Creamy smooth RayCue / Braun industrial finish!) ---
  const champagneGoldMat = applySilhouetteContour(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialVariant.bodyColor),
      metalness: initialVariant.metalness,
      roughness: initialVariant.roughness,
      clearcoat: 0.08,
      clearcoatRoughness: 0.42,
      envMap,
      envMapIntensity: 0.66,
    })
  );

  const doorMetalMat = applySilhouetteContour(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialVariant.doorColor),
      metalness: initialVariant.metalness,
      roughness: initialVariant.roughness,
      clearcoat: 0.08,
      clearcoatRoughness: 0.40,
      envMap,
      envMapIntensity: 0.68,
    })
  );

  const btnBodyMat = applySilhouetteContour(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(initialVariant.btnCapColor || '#7a6950'),
      metalness: initialVariant.metalness,
      roughness: initialVariant.roughness,
      clearcoat: 0.10,
      clearcoatRoughness: 0.36,
      envMap,
      envMapIntensity: 0.72,
    })
  );

  const pinstripeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialVariant.pinstripeColor),
    transparent: true,
    opacity: 0.85,
    metalness: 0.18,
    roughness: 0.34,
    envMap,
    envMapIntensity: 0.68,
  });

  const shinyBrassMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#d8be84'),
    metalness: 0.82,
    roughness: 0.22,
    envMap,
    envMapIntensity: 1.04,
  });

  const darkAnodizedMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#14161b'),
    metalness: 0.28,
    roughness: 0.38,
    envMap,
    envMapIntensity: 0.74,
  });

  const deepWellBlackMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#08090c'),
    metalness: 0.12,
    roughness: 0.76,
    envMap,
    envMapIntensity: 0.30,
  });

  const chromeSteelMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e6ebf2'),
    metalness: 0.88,
    roughness: 0.16,
    envMap,
    envMapIntensity: 1.12,
  });

  const redButtonMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d83829'),
    metalness: 0.08,
    roughness: 0.38,
    sheen: 0.22,
    sheenRoughness: 0.42,
    sheenColor: new THREE.Color('#ffcfca'),
    clearcoat: 0.14,
    clearcoatRoughness: 0.32,
    envMap,
    envMapIntensity: 0.80,
  });

  // RayCue-Style Ultra-Clean Optical Window Glass Shader:
  // Features a single crisp diagonal studio softbox reflection tucked into the upper-left corner,
  // and 100% optical clarity (`alpha = 0.0`) across the cassette label and tape spools!
  const clearWindowGlassMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uEnvMap: { value: envMap },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vLocalPos = position;
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPos = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform samplerCube uEnvMap;
      varying vec3 vLocalPos;
      varying vec3 vWorldPos;
      varying vec3 vWorldNormal;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        float NoV = clamp(abs(dot(N, V)), 0.0, 1.0);
        float fresnel = pow(1.0 - NoV, 3.5);

        // 1. Signed distance to the rounded-rectangle window aperture (halfSize = 51.8 x 24.5 mm, r = 1.6 mm)
        vec2 q = abs(vLocalPos.xy) - vec2(50.2, 22.9);
        float sdf = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 1.6;
        float edgeDist = max(0.0, -sdf);

        // Crisp 1.1mm optical bevel highlight & inner gasket shadow right at the window border
        float bevelLine = exp(-pow((edgeDist - 0.95) / 0.28, 2.0));
        float gasketEdge = smoothstep(0.85, 0.0, edgeDist);

        // 2. Single Razor-Clean Diagonal Studio Softbox Reflection tucked into the upper-left corner
        vec3 R = reflect(-V, N);
        float parallax = R.x * 14.0 - R.y * 10.0;
        float diagCoord = vLocalPos.x * 0.64 - vLocalPos.y * 0.77 + parallax;

        // Crisp diagonal reflection boundary in upper-left corner (diagCoord < -26.5) so center text & reels stay 100% clear
        float splitEdge = 1.0 - smoothstep(-27.2, -26.0, diagCoord);
        float splitFade = smoothstep(-58.0, -26.5, diagCoord);
        float softboxSweep = splitEdge * (0.35 + 0.65 * splitFade);

        // 3. Combine crisp corner reflection & perimeter bevel (0.0 center haze!)
        float reflStrength = clamp(softboxSweep * 0.16 + bevelLine * 0.36 + fresnel * 0.08, 0.0, 0.48);
        vec3 glassCol = mix(vec3(0.06, 0.07, 0.09), vec3(0.99, 0.995, 1.0), clamp(reflStrength / max(reflStrength + gasketEdge * 0.36, 1e-4), 0.0, 1.0));
        float alpha = clamp(reflStrength + gasketEdge * 0.36, 0.0, 0.52);

        gl_FragColor = vec4(glassCol, alpha);
      }
    `,
  });

  // Polished 3D Optical Glass Edge Material (visible on the thickness of the window slab when door opens)
  const glassEdgeRimMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#d4e8f0'),
    transparent: true,
    opacity: 0.58,
    metalness: 0.08,
    roughness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
    envMap,
    envMapIntensity: 1.15,
  });

  // ==========================================================================
  // 1. MAIN WALKMAN UNIBODY CHASSIS GROUP (`playerRoot`)
  // ==========================================================================
  const playerRoot = new THREE.Group();
  const dismantleParts = [];
  const registerDismantle = (obj, dx, dy, dz) => {
    dismantleParts.push({
      obj,
      basePos: obj.position.clone(),
      deltaPos: new THREE.Vector3(dx, dy, dz),
    });
  };

  // A. Solid Back & Perimeter CNC / Injection-Sculpted Housing (142 x 98 mm)
  // Ultra-smooth `bevelSegments: 8, curveSegments: 48` + `computeCreaseSmoothNormals` for zero facet banding!
  const backBodyShape = makeRoundedRectShape(71.0, 49.0, 4.8);
  const backBodyGeo = new THREE.ExtrudeGeometry(backBodyShape, {
    depth: 7.0,
    bevelEnabled: true,
    bevelThickness: 1.35,
    bevelSize: 1.15,
    bevelSegments: 8,
    curveSegments: 48,
  });
  backBodyGeo.translate(0, 0, -15.0);
  computeCreaseSmoothNormals(backBodyGeo, 58);
  const backBodyMesh = new THREE.Mesh(backBodyGeo, champagneGoldMat);
  playerRoot.add(backBodyMesh);
  registerDismantle(backBodyMesh, 0, 0, -52.0);

  // Subtle CNC Housing Parting Seam Groove (`z = -8.2`) between Front Shell and Back Shell
  const chassisSeamShape = makeRoundedRectShape(71.65, 49.65, 5.1, 0, 0);
  const chassisSeamHole = makeRoundedRectHole(70.5, 48.5, 4.2, 0, 0);
  chassisSeamShape.holes.push(chassisSeamHole);
  const chassisSeamGeo = new THREE.ExtrudeGeometry(chassisSeamShape, {
    depth: 0.40,
    bevelEnabled: false,
    curveSegments: 48,
  });
  chassisSeamGeo.translate(0, 0, -8.35);
  computeCreaseSmoothNormals(chassisSeamGeo, 58);
  const chassisSeamMesh = new THREE.Mesh(chassisSeamGeo, darkAnodizedMat);
  playerRoot.add(chassisSeamMesh);
  registerDismantle(chassisSeamMesh, 0, 0, -26.0);

  // A2. Engraved Rear Technical Specification Plate & 4 Rear Corner Torx Screws (`z = -16.40`)
  const rearSpecMat = new THREE.MeshStandardMaterial({
    map: rearSpecTex,
    transparent: true,
    metalness: 0.45,
    roughness: 0.36,
    envMap,
    envMapIntensity: 0.85,
  });
  const rearSpecMesh = new THREE.Mesh(new THREE.PlaneGeometry(126.0, 82.0), rearSpecMat);
  rearSpecMesh.rotation.y = Math.PI;
  rearSpecMesh.position.set(0, 0, -16.42);
  playerRoot.add(rearSpecMesh);
  registerDismantle(rearSpecMesh, 0, 0, -68.0);

  [
    [-62.5, 40.5],
    [62.5, 40.5],
    [-62.5, -40.5],
    [62.5, -40.5],
  ].forEach(([rx, ry]) => {
    const rScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 1.2, 24),
      chromeSteelMat
    );
    rScrew.rotation.x = Math.PI * 0.5;
    rScrew.position.set(rx, ry, -16.15);
    playerRoot.add(rScrew);
    registerDismantle(rScrew, rx * 0.15, ry * 0.15, -76.0);
  });

  // A3. Left-Side Brushed Chrome Lanyard Bracket + RayCue-Style Debossed "KRYSTAL" & 4 Louver Vents (`x = -71.95`)
  const strapLoopGroup = new THREE.Group();
  const strapBase = new THREE.Mesh(new THREE.BoxGeometry(1.2, 17.0, 6.8), darkAnodizedMat);
  strapBase.position.set(-71.6, 22.0, -2.0);
  strapLoopGroup.add(strapBase);
  const strapBar = new THREE.Mesh(new THREE.BoxGeometry(1.8, 12.0, 1.6), chromeSteelMat);
  strapBar.position.set(-73.0, 22.0, -2.0);
  strapLoopGroup.add(strapBar);
  [-5.6, 5.6].forEach((dy) => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), chromeSteelMat);
    post.position.set(-72.2, 22.0 + dy, -2.0);
    strapLoopGroup.add(post);
  });

  // Left-side debossed "KRYSTAL" wordmark + 4 recessed horizontal ventilation louvers
  const leftSideMat = new THREE.MeshBasicMaterial({
    map: leftSideWallTex,
    transparent: true,
    depthWrite: false,
  });
  const leftSideDecal = new THREE.Mesh(new THREE.PlaneGeometry(18.5, 76.0), leftSideMat);
  leftSideDecal.rotation.y = -Math.PI * 0.5;
  leftSideDecal.position.set(-71.98, -6.0, 1.8);
  strapLoopGroup.add(leftSideDecal);

  playerRoot.add(strapLoopGroup);
  registerDismantle(strapLoopGroup, -36.0, 8.0, -4.0);

  // Top-Deck CNC Micro-Perforated Speaker Grille behind the transport buttons (`y = 50.02, z = -4.8`)
  const topGrilleMat = new THREE.MeshBasicMaterial({
    map: topGrilleTex,
    transparent: true,
    depthWrite: false,
  });
  const topGrilleMesh = new THREE.Mesh(new THREE.PlaneGeometry(92.0, 6.8), topGrilleMat);
  topGrilleMesh.rotation.x = -Math.PI * 0.5;
  topGrilleMesh.position.set(-6.0, 50.02, -4.8);
  playerRoot.add(topGrilleMesh);
  registerDismantle(topGrilleMesh, 0, 24.0, -8.0);

  // Front Outer Shell Frame with Recessed Cassette Compartment Cutout (front surface strictly at z = 13.30)
  // Ultra-smooth `bevelSegments: 8, curveSegments: 48` + `computeCreaseSmoothNormals` for pillowy sculpted edges!
  const frontWallShape = makeRoundedRectShape(71.0, 49.0, 4.8);
  const bayHole = makeRoundedRectHole(60.0, 40.5, 3.0, BAY_X, -3.0);
  frontWallShape.holes.push(bayHole);

  const frontWallGeo = new THREE.ExtrudeGeometry(frontWallShape, {
    depth: 21.0,
    bevelEnabled: true,
    bevelThickness: 0.85,
    bevelSize: 0.85,
    bevelSegments: 8,
    curveSegments: 48,
  });
  frontWallGeo.translate(0, 0, -8.55);
  computeCreaseSmoothNormals(frontWallGeo, 58);
  const frontWallMesh = new THREE.Mesh(frontWallGeo, champagneGoldMat);
  playerRoot.add(frontWallMesh);

  // A3-B. Subtle Debossed Inset Perimeter Pinstripe along outer front bezel (`x = ±68.8, y = ±46.8, z = 13.42`)
  const pinstripeShape = makeRoundedRectShape(69.0, 47.0, 4.0, 0, 0);
  const pinstripeHole = makeRoundedRectHole(68.48, 46.48, 3.5, 0, 0);
  pinstripeShape.holes.push(pinstripeHole);
  const pinstripeGeo = new THREE.ExtrudeGeometry(pinstripeShape, {
    depth: 0.08,
    bevelEnabled: false,
    curveSegments: 48,
  });
  pinstripeGeo.translate(0, 0, 13.42);
  const pinstripeMesh = new THREE.Mesh(pinstripeGeo, pinstripeMat);
  playerRoot.add(pinstripeMesh);
  registerDismantle(pinstripeMesh, 0, 0, 28.0);

  // Clean Machined Parting Grooves that NEVER cut across the white perimeter pinstripe (exact match to reference photo!):
  // 1) Left outer edge seam tick outside the pinstripe (`x = -70.45, y = 37.6`)
  const leftOuterSeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.55, 0.14),
    darkAnodizedMat
  );
  leftOuterSeam.position.set(-70.45, 37.6, 13.42);
  playerRoot.add(leftOuterSeam);

  // 2) Right pillar horizontal seam groove inside the pinstripe above the POWER plate (`x = 61.85, y = 37.6`)
  const rightPillarSeam = new THREE.Mesh(
    new THREE.BoxGeometry(13.0, 0.6, 0.14),
    darkAnodizedMat
  );
  rightPillarSeam.position.set(61.85, 37.6, 13.42);
  playerRoot.add(rightPillarSeam);

  // 3) Right outer edge seam tick outside the pinstripe (`x = 70.45, y = 37.6`)
  const rightOuterSeam = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.55, 0.14),
    darkAnodizedMat
  );
  rightOuterSeam.position.set(70.45, 37.6, 13.42);
  playerRoot.add(rightOuterSeam);

  // 4) Continuous Dark Top-Door Shadow Recess Groove along the upper edge of the cassette door (`x = BAY_X, y = 37.35`)
  const topDoorShadowSeam = new THREE.Mesh(
    new THREE.BoxGeometry(119.4, 0.95, 0.14),
    deepWellBlackMat
  );
  topDoorShadowSeam.position.set(BAY_X, 37.35, 13.38);
  playerRoot.add(topDoorShadowSeam);

  // Soft Ambient Occlusion Contact Shadow behind the raised cassette door (`z = 13.40`)
  const doorShadowMat = new THREE.MeshBasicMaterial({
    map: doorShadowTex,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
  });
  const doorShadowMesh = new THREE.Mesh(new THREE.PlaneGeometry(124.2, 84.2), doorShadowMat);
  doorShadowMesh.position.set(BAY_X + 0.45, -2.8, 13.40);
  playerRoot.add(doorShadowMesh);

  // A4. Right-Pillar Front Modules (`x = 62.9`):
  // Module 1: Upper Recessed Brushed Brass / Silver Control Plate (`P ● N / POWER` + 3D Knurled Roller + Push Button)
  // Positioned cleanly at `z = 13.48` (+0.18 mm in front of `frontWallMesh` at 13.30) + polygonOffset for zero Z-fighting!
  const upperPillarGroup = new THREE.Group();

  const upperPillarMat = new THREE.MeshStandardMaterial({
    map: upperPillarTex,
    transparent: true,
    alphaTest: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    metalness: 0.72,
    roughness: 0.25,
    envMap,
    envMapIntensity: 1.08,
  });
  const upperPillarPlate = new THREE.Mesh(
    new THREE.PlaneGeometry(11.9, 31.8),
    upperPillarMat
  );
  upperPillarPlate.position.set(62.9, 20.2, 13.48);
  upperPillarGroup.add(upperPillarPlate);

  // 1) Glowing Emerald Power LED Jewel flanked by "P" and "N" (`x = 62.9, y = 31.8`)
  // Dark gunmetal outer collar + silver inner ring + rich emerald green lens (never washed-out white!)
  const ledOuterRing = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.90, 0.65, 32),
    darkAnodizedMat
  );
  ledOuterRing.rotation.x = Math.PI * 0.5;
  ledOuterRing.position.set(62.9, 31.8, 13.52);
  upperPillarGroup.add(ledOuterRing);

  const ledBezelMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.48, 0.74, 32),
    chromeSteelMat
  );
  ledBezelMesh.rotation.x = Math.PI * 0.5;
  ledBezelMesh.position.set(62.9, 31.8, 13.56);
  upperPillarGroup.add(ledBezelMesh);

  const statusLedMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#16a34a'),
    emissive: new THREE.Color('#15803d'),
    emissiveIntensity: 0.58,
    roughness: 0.12,
    metalness: 0.05,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
  });
  const statusLedMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.22, 24, 24),
    statusLedMat
  );
  statusLedMesh.scale.set(1, 1, 0.52);
  statusLedMesh.position.set(62.9, 31.8, 13.82);
  upperPillarGroup.add(statusLedMesh);

  // 2) Tactile 3D Horizontal Knurled Cylindrical Roller Drum (`x = 62.9, y = 18.4, z = 13.25`, exact match to reference!)
  const rollerHousing = new THREE.Mesh(
    new THREE.BoxGeometry(10.5, 6.7, 1.4),
    deepWellBlackMat
  );
  rollerHousing.position.set(62.9, 18.4, 13.20);
  upperPillarGroup.add(rollerHousing);

  // Left & Right polished metallic bracket cheeks flanking the knurled roller
  [-4.95, 4.95].forEach((dx) => {
    const cheek = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 6.5, 1.52),
      chromeSteelMat
    );
    cheek.position.set(62.9 + dx, 18.4, 13.42);
    upperPillarGroup.add(cheek);
  });

  const rollerDrumMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(initialVariant.rollerColor || '#d4be92'),
    map: knurledRollerTex,
    roughness: 0.22,
    metalness: 0.86,
    envMap,
    envMapIntensity: 1.15,
  });
  const counterWheels = [];
  const knurledRollerDrum = new THREE.Mesh(
    new THREE.CylinderGeometry(2.9, 2.9, 9.0, 40),
    rollerDrumMat
  );
  knurledRollerDrum.rotation.z = Math.PI * 0.5;
  knurledRollerDrum.position.set(62.9, 18.4, 13.24);
  upperPillarGroup.add(knurledRollerDrum);
  counterWheels.push(knurledRollerDrum);

  // 3) Dark Circular Push-Button inside a Sleek Metallic & Dark Collar Ring below the roller (`x = 62.9, y = 11.2`)
  const resetOuterWell = new THREE.Mesh(
    new THREE.CylinderGeometry(2.05, 2.15, 0.62, 32),
    darkAnodizedMat
  );
  resetOuterWell.rotation.x = Math.PI * 0.5;
  resetOuterWell.position.set(62.9, 11.2, 13.50);
  upperPillarGroup.add(resetOuterWell);

  const resetCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.78, 1.85, 0.76, 32),
    chromeSteelMat
  );
  resetCollar.rotation.x = Math.PI * 0.5;
  resetCollar.position.set(62.9, 11.2, 13.55);
  upperPillarGroup.add(resetCollar);

  const counterResetBtn = new THREE.Mesh(
    new THREE.CylinderGeometry(1.32, 1.38, 1.05, 28),
    darkAnodizedMat
  );
  counterResetBtn.rotation.x = Math.PI * 0.5;
  counterResetBtn.position.set(62.9, 11.2, 13.66);
  upperPillarGroup.add(counterResetBtn);

  playerRoot.add(upperPillarGroup);
  registerDismantle(upperPillarGroup, 28.0, 10.0, 28.0);

  // Module 2: Lower Recessed I/O Legend Panel (`VOL`, `HOLD`, `USB-C`, `4.4mm`, `3.5mm` at `x = 62.9, y = -19.2`)
  // Positioned cleanly at `z = 13.48` (+0.18 mm in front of `frontWallMesh` at 13.30) + polygonOffset for 100% zero Z-fighting!
  const lowerPillarMat = new THREE.MeshStandardMaterial({
    map: lowerPillarTex,
    transparent: true,
    alphaTest: 0.05,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    metalness: 0.72,
    roughness: 0.25,
    envMap,
    envMapIntensity: 1.08,
  });
  const lowerPillarPanel = new THREE.Mesh(
    new THREE.PlaneGeometry(11.9, 41.6),
    lowerPillarMat
  );
  lowerPillarPanel.position.set(62.9, -19.2, 13.48);
  playerRoot.add(lowerPillarPanel);
  registerDismantle(lowerPillarPanel, 28.0, -10.0, 26.0);

  // B. Matte Black Anodized Inner Compartment Liner Frame (kept behind `z = 12.8` so it never Z-fights with the front face!)
  const linerShape = makeRoundedRectShape(60.2, 40.7, 2.8, BAY_X, -3.0);
  const linerHole = makeRoundedRectHole(57.2, 37.8, 2.0, BAY_X, -3.0);
  linerShape.holes.push(linerHole);
  const linerGeo = new THREE.ExtrudeGeometry(linerShape, {
    depth: 20.6,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.35,
    bevelSegments: 5,
    curveSegments: 36,
  });
  linerGeo.translate(0, 0, -8.2);
  computeCreaseSmoothNormals(linerGeo, 58);
  const linerMesh = new THREE.Mesh(linerGeo, darkAnodizedMat);
  linerMesh.receiveShadow = true;
  playerRoot.add(linerMesh);
  registerDismantle(linerMesh, 0, 0, -20.0);

  // Right-hand interior dark electronic baffle wall inside the bay (x = +46..+52, matching photo!)
  const rightBaffle = new THREE.Mesh(new THREE.BoxGeometry(6.5, 74.5, 19.5), darkAnodizedMat);
  rightBaffle.position.set(49.2, -3.0, 1.8);
  playerRoot.add(rightBaffle);
  registerDismantle(rightBaffle, 26.0, 0, -12.0);

  // Left-hand interior guide catch bracket inside the bay (x = -61, matching photo!)
  const leftGuideBracket = new THREE.Mesh(new THREE.BoxGeometry(4.2, 16.0, 10.0), darkAnodizedMat);
  leftGuideBracket.position.set(-60.2, 12.0, 2.0);
  playerRoot.add(leftGuideBracket);
  registerDismantle(leftGuideBracket, -24.0, 6.0, -10.0);

  // Top Phosphor-Bronze Cassette Stabilizer Leaf Spring inside upper bay ceiling (`y = 34.4`)
  const leafSpringMesh = new THREE.Mesh(new THREE.BoxGeometry(32.0, 0.9, 6.5), shinyBrassMat);
  leafSpringMesh.position.set(BAY_X, 34.4, 1.5);
  playerRoot.add(leafSpringMesh);
  registerDismantle(leafSpringMesh, 0, 18.0, -8.0);

  // C. Interior Compartment Backplate Details (Visible when door opens or through clear cassette!)
  // 1. Central Shiny Brushed Brass Retention Plate between the two spindles (exact match to photo!)
  const centerBrassShape = makeRoundedRectShape(12.5, 6.6, 1.2);
  const centerBrassGeo = new THREE.ExtrudeGeometry(centerBrassShape, {
    depth: 0.8,
    bevelEnabled: true,
    bevelThickness: 0.2,
    bevelSize: 0.2,
    bevelSegments: 4,
    curveSegments: 24,
  });
  computeCreaseSmoothNormals(centerBrassGeo, 58);
  const centerBrassMesh = new THREE.Mesh(centerBrassGeo, shinyBrassMat);
  centerBrassMesh.position.set(BAY_X, BAY_Y + 2.0, -8.1);
  playerRoot.add(centerBrassMesh);
  registerDismantle(centerBrassMesh, 0, 4.0, -34.0);

  // 1B. Exposed Pure Copper/Brass Flywheel Peek Window on the lower-right backplate (`x = 34.0, y = -16.0, z = -8.0`)
  const flywheelWell = new THREE.Mesh(
    new THREE.CylinderGeometry(8.8, 8.8, 1.0, 32),
    deepWellBlackMat
  );
  flywheelWell.rotation.x = Math.PI * 0.5;
  flywheelWell.position.set(BAY_X + 35.0, -15.0, -8.1);
  playerRoot.add(flywheelWell);
  registerDismantle(flywheelWell, 16.0, -8.0, -36.0);

  const flywheelRotor = new THREE.Group();
  flywheelRotor.position.set(BAY_X + 35.0, -15.0, -7.8);
  const flywheelDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(7.4, 7.4, 1.2, 32),
    shinyBrassMat
  );
  flywheelDisc.rotation.x = Math.PI * 0.5;
  flywheelRotor.add(flywheelDisc);
  for (let i = 0; i < 4; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(1.4, 13.5, 1.4), darkAnodizedMat);
    spoke.rotation.z = (i / 4) * Math.PI;
    flywheelRotor.add(spoke);
  }
  playerRoot.add(flywheelRotor);
  registerDismantle(flywheelRotor, 20.0, -8.0, -30.0);

  // 2. Top-Left & Top-Center Tape Sensor Cutouts & Metal Leaf Tab (matching photo!)
  const sensorCutoutL = new THREE.Mesh(new THREE.BoxGeometry(7.2, 6.2, 1.2), deepWellBlackMat);
  sensorCutoutL.position.set(BAY_X - 18.0, 29.5, -8.0);
  playerRoot.add(sensorCutoutL);
  registerDismantle(sensorCutoutL, -8.0, 10.0, -32.0);

  const sensorTab = new THREE.Mesh(new THREE.BoxGeometry(5.5, 1.2, 4.5), chromeSteelMat);
  sensorTab.position.set(BAY_X - 2.0, 32.0, -6.2);
  playerRoot.add(sensorTab);
  registerDismantle(sensorTab, 0, 14.0, -28.0);

  // 3. Recessed Black Oxide Micro-Screws in the Gold Backplate (matching photo!)
  const backplateScrews = [
    [BAY_X + 28.0, 22.0, 2.6],
    [BAY_X + 20.0, 26.5, 1.4],
    [BAY_X - 38.0, -14.0, 2.2],
  ];
  backplateScrews.forEach(([sx, sy, sr]) => {
    const screwWell = new THREE.Mesh(
      new THREE.CylinderGeometry(sr, sr, 0.8, 24),
      darkAnodizedMat
    );
    screwWell.rotation.x = Math.PI * 0.5;
    screwWell.position.set(sx, sy, -8.1);
    playerRoot.add(screwWell);
    registerDismantle(screwWell, 0, 0, -36.0);

    const screwCore = new THREE.Mesh(
      new THREE.CylinderGeometry(sr * 0.45, sr * 0.45, 1.0, 16),
      chromeSteelMat
    );
    screwCore.rotation.x = Math.PI * 0.5;
    screwCore.position.set(sx, sy, -8.0);
    playerRoot.add(screwCore);
    registerDismantle(screwCore, 0, 0, -26.0);
  });

  // D. Twin 3D Black 6-Spline Drive Spindles (`spindleL`, `spindleR`)
  const buildDriveSpindle = () => {
    const g = new THREE.Group();

    // Dark recessed circular well in backplate
    const well = new THREE.Mesh(
      new THREE.CylinderGeometry(7.6, 7.6, 1.2, 32),
      deepWellBlackMat
    );
    well.rotation.x = Math.PI * 0.5;
    well.position.z = -8.0;
    g.add(well);

    // Rotating spindle hub + 6 splines + conical tip + central steel shaft
    const rotor = new THREE.Group();
    const baseHub = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.8, 6.5, 28),
      darkAnodizedMat
    );
    baseHub.rotation.x = Math.PI * 0.5;
    baseHub.position.z = -4.5;
    rotor.add(baseHub);

    // Conical black nose cone
    const noseCone = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 4.8, 4.2, 24),
      darkAnodizedMat
    );
    noseCone.rotation.x = Math.PI * 0.5;
    noseCone.position.z = -0.2;
    rotor.add(noseCone);

    // 6 radial drive fins
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 10.6, 5.2), darkAnodizedMat);
      fin.rotation.z = a;
      fin.position.z = -3.8;
      rotor.add(fin);
    }

    // Central polished steel shaft tip
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 1.3, 10.5, 20),
      chromeSteelMat
    );
    shaft.rotation.x = Math.PI * 0.5;
    shaft.position.z = -2.5;
    rotor.add(shaft);

    g.add(rotor);
    return { group: g, rotor };
  };

  const spindleL = buildDriveSpindle();
  spindleL.group.position.set(REEL_L_POS[0], REEL_L_POS[1], 0);
  playerRoot.add(spindleL.group);
  registerDismantle(spindleL.group, -12.0, 5.0, -24.0);

  const spindleR = buildDriveSpindle();
  spindleR.group.position.set(REEL_R_POS[0], REEL_R_POS[1], 0);
  playerRoot.add(spindleR.group);
  registerDismantle(spindleR.group, 12.0, 5.0, -24.0);

  // E. Lower Trapezoidal Tape-Head & Capstan Bridge Housing (Exact match to FiiO CP13 photo!)
  const trapBridgeGroup = new THREE.Group();

  // Raised metallic trapezoidal cover plate at bottom of bay (y = -40..-13, z = -8.0..-1.5)
  const trapShape = new THREE.Shape();
  trapShape.moveTo(BAY_X - 42.0, -40.0);
  trapShape.lineTo(BAY_X + 42.0, -40.0);
  trapShape.lineTo(BAY_X + 34.0, -13.5);
  trapShape.lineTo(BAY_X - 34.0, -13.5);
  trapShape.closePath();

  // Cutout window in the lower half of the trapezoid revealing the playback head & rollers
  const trapCutout = new THREE.Path();
  trapCutout.moveTo(BAY_X - 33.0, -33.0);
  trapCutout.lineTo(BAY_X - 30.0, -23.5);
  trapCutout.lineTo(BAY_X + 30.0, -23.5);
  trapCutout.lineTo(BAY_X + 33.0, -33.0);
  trapCutout.closePath();
  trapShape.holes.push(trapCutout);

  const trapGeo = new THREE.ExtrudeGeometry(trapShape, {
    depth: 6.2,
    bevelEnabled: true,
    bevelThickness: 0.6,
    bevelSize: 0.6,
    bevelSegments: 5,
  });
  trapGeo.translate(0, 0, -8.0);
  computeCreaseSmoothNormals(trapGeo, 58);
  const trapMesh = new THREE.Mesh(trapGeo, doorMetalMat);
  trapMesh.receiveShadow = true;
  trapBridgeGroup.add(trapMesh);
  registerDismantle(trapMesh, 0, -20.0, 14.0);

  // Dark interior cavity behind the trapezoid cutout
  const headBayBack = new THREE.Mesh(new THREE.BoxGeometry(72.0, 14.0, 2.0), deepWellBlackMat);
  headBayBack.position.set(BAY_X, -28.5, -7.2);
  trapBridgeGroup.add(headBayBack);
  registerDismantle(headBayBack, 0, -16.0, -14.0);

  // Engaging Permalloy Magnetic Read-Head & Dual Rubber Pinch Rollers inside the cavity
  const headBridgeCarriage = new THREE.Group();
  const permalloyHead = new THREE.Mesh(new THREE.BoxGeometry(11.0, 6.5, 5.5), chromeSteelMat);
  permalloyHead.position.set(BAY_X, -28.0, -4.2);
  headBridgeCarriage.add(permalloyHead);
  registerDismantle(permalloyHead, 0, -26.0, 4.0);

  [-21.5, 21.5].forEach((px, idx) => {
    const roller = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 5.2, 24),
      darkAnodizedMat
    );
    roller.rotation.x = Math.PI * 0.5;
    roller.position.set(BAY_X + px, -28.5, -4.2);
    headBridgeCarriage.add(roller);
    registerDismantle(roller, idx === 0 ? -10.0 : 10.0, -26.0, 6.0);
  });
  trapBridgeGroup.add(headBridgeCarriage);

  // Twin Polished Chrome Capstan Shafts & Guide Pins sticking out forward (+Z) from the trapezoid!
  [-21.5, 21.5].forEach((px) => {
    // Dark circular collar base on the trapezoid face
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 1.6, 24),
      darkAnodizedMat
    );
    collar.rotation.x = Math.PI * 0.5;
    collar.position.set(BAY_X + px, -19.2, -1.4);
    trapBridgeGroup.add(collar);
    registerDismantle(collar, 0, -20.0, 18.0);

    // Long polished chrome steel pin projecting forward
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(1.15, 1.15, 9.5, 20),
      chromeSteelMat
    );
    pin.rotation.x = Math.PI * 0.5;
    pin.position.set(BAY_X + px, -19.2, 2.8);
    trapBridgeGroup.add(pin);
    registerDismantle(pin, 0, -20.0, 24.0);
  });

  // Small silver calibration screw on the upper trapezoid face (matching photo!)
  const calScrew = new THREE.Mesh(
    new THREE.CylinderGeometry(1.5, 1.5, 1.0, 18),
    chromeSteelMat
  );
  calScrew.rotation.x = Math.PI * 0.5;
  calScrew.position.set(BAY_X - 13.5, -17.5, -1.4);
  trapBridgeGroup.add(calScrew);
  registerDismantle(calScrew, 0, -20.0, 22.0);

  // Polished Lower Escutcheon Bar ("KRYSTAL   BORN FOR MUSIC") across the front bottom of the bay!
  const bridgePlateMat = new THREE.MeshStandardMaterial({
    map: bridgePlateTex,
    metalness: 0.82,
    roughness: 0.22,
    envMap,
    envMapIntensity: 1.15,
  });
  const bridgePlateGeo = new THREE.BoxGeometry(96.0, 11.2, 3.2);
  const bridgePlateMesh = new THREE.Mesh(bridgePlateGeo, [
    doorMetalMat,
    doorMetalMat,
    doorMetalMat,
    doorMetalMat,
    bridgePlateMat,
    doorMetalMat,
  ]);
  bridgePlateMesh.position.set(BAY_X, -35.8, 3.5);
  trapBridgeGroup.add(bridgePlateMesh);
  registerDismantle(bridgePlateMesh, 0, -32.0, 30.0);

  playerRoot.add(trapBridgeGroup);

  // ==========================================================================
  // F. PRECISION RIGHT-SIDE AUDIOPHILE I/O SPINE & RECESSED KNURLED VOLUME WHEEL
  // Zero flat black strip (`sideTrench` removed!) and zero Z-fighting — every control
  // sits in its own machined chamfered recess aligned with the front I/O callout rows!
  // ==========================================================================
  const sideIoGroup = new THREE.Group();

  // 1) Recessed Crimson-Red Knurled Thumbwheel in its own Machined Side Pocket (`y = 14.8, z = 1.5`)
  const volPocketBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 14.6, 5.2),
    darkAnodizedMat
  );
  volPocketBezel.position.set(71.68, 14.8, 1.5);
  sideIoGroup.add(volPocketBezel);

  const volPocketWell = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 13.4, 4.2),
    deepWellBlackMat
  );
  volPocketWell.position.set(71.82, 14.8, 1.5);
  sideIoGroup.add(volPocketWell);

  const volWheelGroup = new THREE.Group();
  volWheelGroup.position.set(69.2, 14.8, 1.5);

  const volRimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#a82419'),
    metalness: 0.20,
    roughness: 0.36,
    envMap,
  });

  // Main beveled crimson-red wheel body + stepped side dish + chrome center axle
  const volCore = new THREE.Mesh(
    new THREE.CylinderGeometry(5.1, 5.1, 2.5, 48),
    redButtonMat
  );
  volCore.rotation.x = Math.PI * 0.5;
  volWheelGroup.add(volCore);

  const volBevelCaps = new THREE.Mesh(
    new THREE.CylinderGeometry(4.55, 4.55, 3.0, 48),
    volRimMat
  );
  volBevelCaps.rotation.x = Math.PI * 0.5;
  volWheelGroup.add(volBevelCaps);

  const volAxlePin = new THREE.Mesh(
    new THREE.CylinderGeometry(1.75, 1.75, 3.25, 24),
    chromeSteelMat
  );
  volAxlePin.rotation.x = Math.PI * 0.5;
  volWheelGroup.add(volAxlePin);

  // 28 Precision Non-Overlapping Knurled Grip Ribs around the outer circumference
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.55, 2.35), volRimMat);
    rib.position.set(Math.cos(a) * 5.12, Math.sin(a) * 5.12, 0);
    rib.rotation.z = a;
    volWheelGroup.add(rib);
  }
  sideIoGroup.add(volWheelGroup);

  // 2) Row 1 (`y = -2.6`): `VOL / LEVEL` Recessed Gain/Attenuator Micro Trim Dial
  const gainTrimFlange = new THREE.Mesh(
    new THREE.CylinderGeometry(2.35, 2.35, 0.45, 32),
    chromeSteelMat
  );
  gainTrimFlange.rotation.z = Math.PI * 0.5;
  gainTrimFlange.position.set(71.72, -2.6, 1.5);
  sideIoGroup.add(gainTrimFlange);

  const gainTrimWell = new THREE.Mesh(
    new THREE.CylinderGeometry(1.85, 1.85, 0.52, 32),
    deepWellBlackMat
  );
  gainTrimWell.rotation.z = Math.PI * 0.5;
  gainTrimWell.position.set(71.85, -2.6, 1.5);
  sideIoGroup.add(gainTrimWell);

  const gainTrimCap = new THREE.Mesh(
    new THREE.CylinderGeometry(1.42, 1.42, 0.65, 28),
    shinyBrassMat
  );
  gainTrimCap.rotation.z = Math.PI * 0.5;
  gainTrimCap.position.set(71.98, -2.6, 1.5);
  sideIoGroup.add(gainTrimCap);

  const gainSlotLine = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 1.9, 0.36),
    deepWellBlackMat
  );
  gainSlotLine.position.set(72.22, -2.6, 1.5);
  sideIoGroup.add(gainSlotLine);

  // 3) Row 2 (`y = -10.9`): `HOLD / LOCK` Machined Slide Switch + 3 Tactile Grip Ridges + Orange Dot
  const holdBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 6.8, 3.6),
    chromeSteelMat
  );
  holdBezel.position.set(71.72, -10.9, 1.5);
  sideIoGroup.add(holdBezel);

  const holdWell = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 5.8, 2.6),
    deepWellBlackMat
  );
  holdWell.position.set(71.86, -10.9, 1.5);
  sideIoGroup.add(holdWell);

  const holdSliderKnob = new THREE.Mesh(
    new THREE.BoxGeometry(0.75, 3.2, 2.2),
    darkAnodizedMat
  );
  holdSliderKnob.position.set(72.12, -9.9, 1.5);
  sideIoGroup.add(holdSliderKnob);

  [-0.75, 0.0, 0.75].forEach((dy) => {
    const gripRidge = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.32, 1.8),
      chromeSteelMat
    );
    gripRidge.position.set(72.52, -9.9 + dy, 1.5);
    sideIoGroup.add(gripRidge);
  });

  const holdOrangeDot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.45, 20),
    redButtonMat
  );
  holdOrangeDot.rotation.z = Math.PI * 0.5;
  holdOrangeDot.position.set(71.95, -12.5, 1.5);
  sideIoGroup.add(holdOrangeDot);

  // 4) Row 3 (`y = -19.2`): `USB-C / 5V IN` Stainless Collar + Deep Black Cavity + Gold Contact Tongue
  const usbOuterCollar = new THREE.Mesh(
    new THREE.BoxGeometry(0.48, 7.4, 3.3),
    chromeSteelMat
  );
  usbOuterCollar.position.set(71.72, -19.2, 1.5);
  sideIoGroup.add(usbOuterCollar);

  const usbInnerCavity = new THREE.Mesh(
    new THREE.BoxGeometry(0.50, 6.1, 2.1),
    deepWellBlackMat
  );
  usbInnerCavity.position.set(71.88, -19.2, 1.5);
  sideIoGroup.add(usbInnerCavity);

  const usbCenterTongue = new THREE.Mesh(
    new THREE.BoxGeometry(0.45, 4.5, 0.55),
    shinyBrassMat
  );
  usbCenterTongue.position.set(72.02, -19.2, 1.5);
  sideIoGroup.add(usbCenterTongue);

  // 5) Row 4 (`y = -27.5`): `4.4mm / BAL OUT` Stepped Solid-Brass Pentaconn Jack + Deep Pitch-Black Bore
  const balOuterFlange = new THREE.Mesh(
    new THREE.CylinderGeometry(3.25, 3.25, 0.52, 36),
    shinyBrassMat
  );
  balOuterFlange.rotation.z = Math.PI * 0.5;
  balOuterFlange.position.set(71.74, -27.5, 1.5);
  sideIoGroup.add(balOuterFlange);

  const balStepRing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.55, 2.75, 0.68, 36),
    shinyBrassMat
  );
  balStepRing.rotation.z = Math.PI * 0.5;
  balStepRing.position.set(71.92, -27.5, 1.5);
  sideIoGroup.add(balStepRing);

  const balBoreHole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.92, 1.92, 0.78, 32),
    deepWellBlackMat
  );
  balBoreHole.rotation.z = Math.PI * 0.5;
  balBoreHole.position.set(72.04, -27.5, 1.5);
  sideIoGroup.add(balBoreHole);

  // 6) Row 5 (`y = -35.8`): `3.5mm / PHONE` Stepped Brushed-Chrome Headphone Jack + Deep Pitch-Black Bore
  const seOuterFlange = new THREE.Mesh(
    new THREE.CylinderGeometry(2.75, 2.75, 0.52, 36),
    chromeSteelMat
  );
  seOuterFlange.rotation.z = Math.PI * 0.5;
  seOuterFlange.position.set(71.74, -35.8, 1.5);
  sideIoGroup.add(seOuterFlange);

  const seStepRing = new THREE.Mesh(
    new THREE.CylinderGeometry(2.10, 2.25, 0.68, 36),
    chromeSteelMat
  );
  seStepRing.rotation.z = Math.PI * 0.5;
  seStepRing.position.set(71.92, -35.8, 1.5);
  sideIoGroup.add(seStepRing);

  const seBoreHole = new THREE.Mesh(
    new THREE.CylinderGeometry(1.52, 1.52, 0.78, 32),
    deepWellBlackMat
  );
  seBoreHole.rotation.z = Math.PI * 0.5;
  seBoreHole.position.set(72.04, -35.8, 1.5);
  sideIoGroup.add(seBoreHole);

  playerRoot.add(sideIoGroup);
  registerDismantle(sideIoGroup, 38.0, 0, 4.0);

  // G. Sculpted Top-Deck Transport Buttons with Front-Facing Engraved Icons (`▷`, `▷||`, `◁◁`, `▷▷`) + Textured Red Stop Key
  // Taller profile (`btnH = 5.6` / `6.2`) & forward Z alignment (`z = 2.8`) so buttons sit right behind the front bezel with 1:1 pointer hit accuracy!
  const buttonDefs = [
    { id: 'PLAY', symbol: '▶', x: -34.0, w: 17.6, isRed: false },
    { id: 'PAUSE', symbol: '▶||', x: -14.8, w: 17.6, isRed: false },
    { id: 'REW', symbol: '◀◀', x: 4.4, w: 17.6, isRed: false },
    { id: 'FF', symbol: '▶▶', x: 23.6, w: 17.6, isRed: false },
    { id: 'FLIP', symbol: 'A⇄B', x: 39.2, w: 10.6, isRed: false },
    { id: 'STOP', symbol: '■', x: 54.5, w: 17.8, isRed: true },
  ];
  const buttonMeshes = {};
  const buttonTopMats = [];
  const clickableButtons = [];

  buttonDefs.forEach((b, idx) => {
    // Dark recessed button well on top deck
    const wellMesh = new THREE.Mesh(
      new THREE.BoxGeometry(b.w + 1.2, 1.4, 14.2),
      deepWellBlackMat
    );
    wellMesh.position.set(b.x, 49.2, 4.2);
    playerRoot.add(wellMesh);
    registerDismantle(wellMesh, (idx - 2.5) * 4.5, 22.0, -4.0);

    // Engraved texture applied to BOTH the top face (+Y) AND front vertical face (+Z) so icons show from front view!
    const topTex = createButtonTopTexture(b.symbol, b.isRed, initialVariant);
    const topFaceMat = new THREE.MeshStandardMaterial({
      map: topTex,
      metalness: b.isRed ? 0.12 : initialVariant.metalness,
      roughness: b.isRed ? 0.32 : initialVariant.roughness,
      envMap,
      envMapIntensity: 0.88,
    });
    buttonTopMats.push({ mat: topFaceMat, def: b });
    const sideMat = b.isRed ? redButtonMat : btnBodyMat;

    const btnH = b.isRed ? 6.2 : 5.6;
    const btnGeo = new THREE.BoxGeometry(b.w, btnH, 13.4);
    const btnMesh = new THREE.Mesh(btnGeo, [
      sideMat,
      sideMat,
      topFaceMat,
      sideMat,
      topFaceMat,
      sideMat,
    ]);
    btnMesh.castShadow = true;
    btnMesh.receiveShadow = true;
    btnMesh.position.set(b.x, 49.4 + btnH * 0.5, 4.2);
    btnMesh.userData.buttonId = b.id;
    btnMesh.userData.dismantleOffset = new THREE.Vector3(
      (idx - 2.5) * 6.5,
      36.0 + Math.sin((idx / 5) * Math.PI) * 8.0,
      4.0
    );
    playerRoot.add(btnMesh);

    buttonMeshes[b.id] = btnMesh;
    clickableButtons.push(btnMesh);
  });

  // Dedicated Warm Studio Showcase Light in front of the cassette bay so the cassette gleams vividly when the door opens!
  const bayShowcaseLight = new THREE.PointLight(0xfff8ee, 1.35, 165, 1.4);
  bayShowcaseLight.position.set(BAY_X, 4.0, 26.0);
  playerRoot.add(bayShowcaseLight);

  // ==========================================================================
  // 2. BOTTOM-HINGED FRONT CASSETTE DOOR (`doorPivotGroup`)
  // Pivots forward around (0, DOOR_HINGE_Y = -42.5, DOOR_HINGE_Z = +13.2)
  // ==========================================================================
  const doorPivotGroup = new THREE.Group();
  doorPivotGroup.position.set(0, DOOR_HINGE_Y, DOOR_HINGE_Z);
  playerRoot.add(doorPivotGroup);

  const doorBody = new THREE.Group();
  // Offset back so door geometry can be authored in standard player XY coordinates
  doorBody.position.set(0, -DOOR_HINGE_Y, -DOOR_HINGE_Z);
  doorPivotGroup.add(doorBody);

  // A. Outer Door Frame with Large Upper Window Cutout
  // High segment counts (`bevelSegments: 8, curveSegments: 48`) + crease-smooth normals for silky SubD-grade bevels!
  const doorOuterShape = makeRoundedRectShape(59.6, 39.8, 3.4, BAY_X, -2.7);
  const doorWinHole = makeRoundedRectHole(53.5, 26.2, 2.2, BAY_X, 5.8);
  doorOuterShape.holes.push(doorWinHole);

  const doorFrameGeo = new THREE.ExtrudeGeometry(doorOuterShape, {
    depth: 2.8,
    bevelEnabled: true,
    bevelThickness: 0.55,
    bevelSize: 0.5,
    bevelSegments: 8,
    curveSegments: 48,
  });
  doorFrameGeo.translate(0, 0, 12.2);
  computeCreaseSmoothNormals(doorFrameGeo, 58);
  const doorFrameMesh = new THREE.Mesh(doorFrameGeo, doorMetalMat);
  doorFrameMesh.castShadow = true;
  doorFrameMesh.receiveShadow = true;
  doorBody.add(doorFrameMesh);
  registerDismantle(doorFrameMesh, 0, -4.0, 56.0);

  // B. Glossy Black Inner Window Gasket Frame (surrounding the glass window, matching reference photo!)
  const winBezelShape = makeRoundedRectShape(54.2, 26.9, 2.4, BAY_X, 5.8);
  const winBezelHole = makeRoundedRectHole(51.8, 24.5, 1.6, BAY_X, 5.8);
  winBezelShape.holes.push(winBezelHole);
  const winBezelGeo = new THREE.ExtrudeGeometry(winBezelShape, {
    depth: 2.9,
    bevelEnabled: true,
    bevelThickness: 0.22,
    bevelSize: 0.20,
    bevelSegments: 5,
    curveSegments: 40,
  });
  winBezelGeo.translate(0, 0, 12.18);
  computeCreaseSmoothNormals(winBezelGeo, 58);
  const winBezelMesh = new THREE.Mesh(winBezelGeo, darkAnodizedMat);
  winBezelMesh.castShadow = true;
  winBezelMesh.receiveShadow = true;
  doorBody.add(winBezelMesh);
  registerDismantle(winBezelMesh, 0, 2.0, 42.0);

  // C. Raised 4-Screw Brushed Brass / Silver Lower Door Plaque ("KRYSTAL / Walkin Shiny Edition")
  // Alpha-clipped rounded corners (`transparent: true, alphaTest: 0.05`) so there is zero sharp square border!
  const plaqueGroup = new THREE.Group();

  const fasciaMat = new THREE.MeshStandardMaterial({
    map: doorFasciaTex,
    transparent: true,
    alphaTest: 0.05,
    metalness: 0.72,
    roughness: 0.25,
    envMap,
    envMapIntensity: 1.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const fasciaMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(114.6, 19.6),
    fasciaMat
  );
  fasciaMesh.position.set(BAY_X, -31.2, 15.64);
  plaqueGroup.add(fasciaMesh);

  // 4 Physical 3D Slotted Corner Micro-Screws on the KRYSTAL Plaque (with dark recess ring + 3D cross-slot!)
  [
    [-55.1, 8.0],
    [55.1, 8.0],
    [-55.1, -8.0],
    [55.1, -8.0],
  ].forEach(([sx, sy]) => {
    const screwWell = new THREE.Mesh(
      new THREE.CylinderGeometry(1.05, 1.05, 0.14, 24),
      darkAnodizedMat
    );
    screwWell.rotation.x = Math.PI * 0.5;
    screwWell.position.set(BAY_X + sx, -31.2 + sy, 15.66);
    plaqueGroup.add(screwWell);

    const pScrew = new THREE.Mesh(
      new THREE.CylinderGeometry(0.86, 0.92, 0.20, 24),
      chromeSteelMat
    );
    pScrew.rotation.x = Math.PI * 0.5;
    pScrew.position.set(BAY_X + sx, -31.2 + sy, 15.72);
    plaqueGroup.add(pScrew);

    const slotH = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.20, 0.08),
      darkAnodizedMat
    );
    slotH.position.set(BAY_X + sx, -31.2 + sy, 15.80);
    plaqueGroup.add(slotH);

    const slotV = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 1.1, 0.08),
      darkAnodizedMat
    );
    slotV.position.set(BAY_X + sx, -31.2 + sy, 15.80);
    plaqueGroup.add(slotV);
  });

  doorBody.add(plaqueGroup);
  registerDismantle(plaqueGroup, 0, -14.0, 72.0);

  // D. Crystal-Clear Optical Mineral/Acrylic Viewing Window + 3D Beveled Glass Rim
  const glassRimShape = makeRoundedRectShape(51.8, 24.5, 1.6, BAY_X, 5.8);
  const glassRimHole = makeRoundedRectHole(50.3, 23.0, 1.2, BAY_X, 5.8);
  glassRimShape.holes.push(glassRimHole);
  const glassRimGeo = new THREE.ExtrudeGeometry(glassRimShape, {
    depth: 2.2,
    bevelEnabled: true,
    bevelThickness: 0.35,
    bevelSize: 0.35,
    bevelSegments: 5,
    curveSegments: 36,
  });
  glassRimGeo.translate(0, 0, 12.6);
  computeCreaseSmoothNormals(glassRimGeo, 58);
  const glassRimMesh = new THREE.Mesh(glassRimGeo, glassEdgeRimMat);
  glassRimMesh.renderOrder = 9;
  doorBody.add(glassRimMesh);
  registerDismantle(glassRimMesh, 0, 6.0, 78.0);

  const glassWinGeo = new THREE.PlaneGeometry(103.6, 49.0);
  const glassWinMesh = new THREE.Mesh(glassWinGeo, clearWindowGlassMat);
  glassWinMesh.position.set(BAY_X, 5.8, 14.55);
  glassWinMesh.renderOrder = 10;
  doorBody.add(glassWinMesh);
  registerDismantle(glassWinMesh, 0, 6.0, 82.0);

  // ==========================================================================
  // 3. DUAL DETAILED 3D REMOVABLE COMPACT CASSETTES (`activeCassette` & `incomingCassette`)
  // Features warm brown ferric-oxide magnetic tape spools & 6-tooth white drive hubs!
  // ==========================================================================
  const tapeOxideMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#ffffff'),
    map: tapeSpoolTex,
    metalness: 0.22,
    roughness: 0.30,
    envMap,
    envMapIntensity: 0.88,
  });

  const reelHubDarkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#1a1d24'),
    metalness: 0.34,
    roughness: 0.36,
    envMap,
    envMapIntensity: 0.72,
  });

  const reelToothWhiteMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#f8fafc'),
    emissive: new THREE.Color('#ffffff'),
    emissiveIntensity: 0.12,
    metalness: 0.10,
    roughness: 0.26,
    envMap,
    envMapIntensity: 0.85,
  });

  // Create crystal-clear 100 - 50 - 0 tape window scale gauge texture (NO milky grey fill over the reels!)
  const winScaleCanvas = document.createElement('canvas');
  winScaleCanvas.width = 512;
  winScaleCanvas.height = 160;
  const wctx = winScaleCanvas.getContext('2d');
  wctx.clearRect(0, 0, 512, 160);

  wctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  wctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
  wctx.lineWidth = 2.8;
  for (let i = 0; i <= 20; i++) {
    const tx = 136 + (i / 20) * 240;
    const th = i % 10 === 0 ? 18 : i % 5 === 0 ? 13 : 7;
    wctx.beginPath();
    wctx.moveTo(tx, 76 - th * 0.5);
    wctx.lineTo(tx, 76 + th * 0.5);
    wctx.stroke();
  }
  wctx.font = '800 18px "SF Mono", "JetBrains Mono", monospace';
  wctx.textAlign = 'center';
  wctx.fillText('100', 136, 114);
  wctx.fillText('50', 256, 114);
  wctx.fillText('0', 376, 114);
  const winScaleTex = new THREE.CanvasTexture(winScaleCanvas);
  winScaleTex.colorSpace = THREE.SRGBColorSpace;
  winScaleTex.minFilter = THREE.LinearFilter;
  winScaleTex.magFilter = THREE.LinearFilter;
  winScaleTex.generateMipmaps = false;
  winScaleTex.anisotropy = 16;

  const winScaleMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff'),
    map: winScaleTex,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
  });

  // Shared Cassette Geometries
  const casShape = makeRoundedRectShape(50.0, 31.5, 3.8);
  [[-22.5, 1.0], [22.5, 1.0]].forEach(([rx, ry]) => {
    const hole = new THREE.Path();
    hole.absarc(rx, ry, 7.4, 0, Math.PI * 2, true);
    casShape.holes.push(hole);
  });
  const casShellGeo = new THREE.ExtrudeGeometry(casShape, {
    depth: 7.4,
    bevelEnabled: true,
    bevelThickness: 0.5,
    bevelSize: 0.5,
    bevelSegments: 6,
    curveSegments: 36,
  });
  casShellGeo.translate(0, 0, -3.7);
  computeCreaseSmoothNormals(casShellGeo, 58);

  const labelShape = makeRoundedRectShape(46.5, 25.5, 2.6, 0, 2.2);
  const labelWinHole = makeRoundedRectHole(33.5, 11.2, 5.5, 0, 1.0);
  labelShape.holes.push(labelWinHole);
  const labelGeo = new THREE.ShapeGeometry(labelShape, 36);
  const uvAttr = labelGeo.attributes.uv;
  const posAttr = labelGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const u = posAttr.getX(i) / 96.0 + 0.5;
    const v = posAttr.getY(i) / 64.0 + 0.5;
    uvAttr.setXY(i, u, v);
  }
  uvAttr.needsUpdate = true;

  const casWinBezelShape = makeRoundedRectShape(33.75, 11.4, 5.6, 0, 1.0);
  const casWinBezelHole = makeRoundedRectHole(32.55, 10.25, 5.0, 0, 1.0);
  casWinBezelShape.holes.push(casWinBezelHole);
  const casWinBezelGeo = new THREE.ExtrudeGeometry(casWinBezelShape, {
    depth: 8.2,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.18,
    bevelSegments: 4,
    curveSegments: 28,
  });
  casWinBezelGeo.translate(0, 0, -4.1);
  computeCreaseSmoothNormals(casWinBezelGeo, 58);

  const casTrapShape = new THREE.Shape();
  casTrapShape.moveTo(-34.0, -31.5);
  casTrapShape.lineTo(34.0, -31.5);
  casTrapShape.lineTo(29.5, -21.5);
  casTrapShape.lineTo(-29.5, -21.5);
  casTrapShape.closePath();
  const casTrapGeo = new THREE.ExtrudeGeometry(casTrapShape, {
    depth: 9.2,
    bevelEnabled: true,
    bevelThickness: 0.4,
    bevelSize: 0.4,
    bevelSegments: 4,
  });
  casTrapGeo.translate(0, 0, -4.6);
  computeCreaseSmoothNormals(casTrapGeo, 58);

  // Authentic Cassette Reel Assembly with visible Brown Ferric-Oxide Magnetic Tape Spool & 6 White Teeth (matching reference!)
  const buildCassetteReel = (tapeRadius) => {
    const rg = new THREE.Group();
    const tapePack = new THREE.Mesh(
      new THREE.CylinderGeometry(tapeRadius, tapeRadius, 6.2, 48),
      tapeOxideMat
    );
    tapePack.rotation.x = Math.PI * 0.5;
    rg.add(tapePack);

    // Dark charcoal reel hub ring around the 6-spline drive hole (r = 7.3 .. 10.3)
    const hubShape = new THREE.Shape();
    hubShape.absarc(0, 0, 10.3, 0, Math.PI * 2, false);
    const hubHole = new THREE.Path();
    hubHole.absarc(0, 0, 7.3, 0, Math.PI * 2, true);
    hubShape.holes.push(hubHole);

    const hubGeo = new THREE.ExtrudeGeometry(hubShape, {
      depth: 7.8,
      bevelEnabled: false,
      curveSegments: 32,
    });
    hubGeo.translate(0, 0, -3.9);
    const hubMesh = new THREE.Mesh(hubGeo, reelHubDarkMat);
    rg.add(hubMesh);

    // Thin silver metallic clamp ring (r = 9.8 .. 10.4)
    const silverRingShape = new THREE.Shape();
    silverRingShape.absarc(0, 0, 10.4, 0, Math.PI * 2, false);
    const silverRingHole = new THREE.Path();
    silverRingHole.absarc(0, 0, 9.7, 0, Math.PI * 2, true);
    silverRingShape.holes.push(silverRingHole);
    const silverRingGeo = new THREE.ExtrudeGeometry(silverRingShape, {
      depth: 7.9,
      bevelEnabled: false,
      curveSegments: 32,
    });
    silverRingGeo.translate(0, 0, -3.95);
    rg.add(new THREE.Mesh(silverRingGeo, chromeSteelMat));

    // 6 crisp white internal drive spline teeth (matching reference cassette window!)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.5, 8.0), reelToothWhiteMat);
      tooth.position.set(Math.cos(a) * 6.5, Math.sin(a) * 6.5, 0);
      tooth.rotation.z = a + Math.PI * 0.5;
      rg.add(tooth);
    }
    return rg;
  };

  const buildSingleCassetteAssembly = (tex, registerExplode = false) => {
    const group = new THREE.Group();

    const shellMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#181b22'),
      metalness: 0.24,
      roughness: 0.22,
      clearcoat: 0.55,
      clearcoatRoughness: 0.18,
      envMap,
      envMapIntensity: 0.95,
    });

    // Satin-gloss metallic foil label material with subtle self-luminance so the cassette
    // artwork and typography look vivid and crisp both behind the window AND when the door opens!
    const artMat = new THREE.MeshPhysicalMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color('#ffffff'),
      emissiveIntensity: 0.22,
      metalness: 0.08,
      roughness: 0.22,
      clearcoat: 0.42,
      clearcoatRoughness: 0.20,
      envMap,
      envMapIntensity: 0.88,
    });

    const casShellMesh = new THREE.Mesh(casShellGeo, shellMat);
    casShellMesh.castShadow = true;
    casShellMesh.receiveShadow = true;
    group.add(casShellMesh);

    const frontLabel = new THREE.Mesh(labelGeo, artMat);
    frontLabel.position.z = 4.26;
    group.add(frontLabel);

    const backLabel = new THREE.Mesh(labelGeo, artMat);
    backLabel.rotation.y = Math.PI;
    backLabel.position.z = -4.26;
    group.add(backLabel);

    const casBezelMesh = new THREE.Mesh(casWinBezelGeo, darkAnodizedMat);
    group.add(casBezelMesh);

    // Clear center window pane with 100 - 50 - 0 gauge markings
    const winPaneF = new THREE.Mesh(new THREE.PlaneGeometry(64.0, 20.0), winScaleMat);
    winPaneF.position.set(0, 1.0, 4.32);
    group.add(winPaneF);

    const winPaneB = new THREE.Mesh(new THREE.PlaneGeometry(64.0, 20.0), winScaleMat);
    winPaneB.rotation.y = Math.PI;
    winPaneB.position.set(0, 1.0, -4.32);
    group.add(winPaneB);

    const casTrapMesh = new THREE.Mesh(casTrapGeo, shellMat);
    group.add(casTrapMesh);

    // Bottom exposed magnetic tape ribbon + center phosphor-bronze pressure pad + internal guide rollers
    const tapeRibbon = new THREE.Mesh(new THREE.BoxGeometry(58.0, 1.2, 3.8), tapeOxideMat);
    tapeRibbon.position.set(0, -30.8, 0);
    group.add(tapeRibbon);

    const pressurePadSpring = new THREE.Mesh(
      new THREE.BoxGeometry(10.5, 1.1, 4.4),
      shinyBrassMat
    );
    pressurePadSpring.position.set(0, -29.2, 0);
    group.add(pressurePadSpring);

    // Twin lower internal chrome tape guide rollers & capstan bushings (strictly recessed inside shell depth!)
    [-39.5, 39.5].forEach((gx) => {
      const guideRoller = new THREE.Mesh(
        new THREE.CylinderGeometry(2.8, 2.8, 6.4, 20),
        chromeSteelMat
      );
      guideRoller.rotation.x = Math.PI * 0.5;
      guideRoller.position.set(gx, -27.5, 0);
      group.add(guideRoller);
    });

    [-21.5, 21.5].forEach((cx) => {
      const capstanBushing = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.8, 7.0, 20),
        darkAnodizedMat
      );
      capstanBushing.rotation.x = Math.PI * 0.5;
      capstanBushing.position.set(cx, -28.2, 0);
      group.add(capstanBushing);
    });

    // 4 Corner Micro-Screws strictly recessed inside the outer shell border (outside the label!)
    [
      [-47.8, 28.8],
      [47.8, 28.8],
      [-47.8, -28.8],
      [47.8, -28.8],
    ].forEach(([sx, sy]) => {
      const screw = new THREE.Mesh(
        new THREE.CylinderGeometry(0.82, 0.82, 7.2, 16),
        chromeSteelMat
      );
      screw.rotation.x = Math.PI * 0.5;
      screw.position.set(sx, sy, 0);
      group.add(screw);
      if (registerExplode) {
        registerDismantle(screw, 0, 0, 16.0);
      }
    });

    const reelLeft = buildCassetteReel(19.6);
    reelLeft.position.set(-22.5, 1.0, 0);
    group.add(reelLeft);

    const reelRight = buildCassetteReel(15.2);
    reelRight.position.set(22.5, 1.0, 0);
    group.add(reelRight);

    if (registerExplode) {
      registerDismantle(backLabel, 0, 0, -8.0);
      registerDismantle(frontLabel, 0, 0, 8.0);
      registerDismantle(casBezelMesh, 0, 0, 14.0);
      registerDismantle(winPaneF, 0, 0, 18.0);
      registerDismantle(casTrapMesh, 0, -8.0, 6.0);
      registerDismantle(reelLeft, -6.0, 0, 5.0);
      registerDismantle(reelRight, 6.0, 0, 5.0);
    }

    return {
      group,
      shellMat,
      artMat,
      reelLeft,
      reelRight,
    };
  };

  const activeCassette = buildSingleCassetteAssembly(initialArtTexture, true);
  activeCassette.group.position.set(BAY_X, BAY_Y, 0);
  playerRoot.add(activeCassette.group);

  const incomingCassette = buildSingleCassetteAssembly(initialArtTexture, false);
  incomingCassette.group.visible = false;
  playerRoot.add(incomingCassette.group);

  // Cache textures per color variant so switching finishes has zero frame hitches,
  // and smoothly interpolate 3D anodized metal colors at 60fps!
  const variantTexCache = new Map();
  const getVariantTextures = (v) => {
    if (variantTexCache.has(v.id)) return variantTexCache.get(v.id);
    const entry = {
      fasciaTex: createDoorFasciaTexture(v),
      upperPillarTex: createUpperPillarPlateTexture(v),
      lowerPillarTex: createLowerPillarLegendTexture(v),
      bridgeTex: createInnerBridgePlateTexture(v),
      rearTex: createRearSpecPlateTexture(v),
      btnTextures: buttonTopMats.map(({ def }) =>
        def.isRed ? null : createButtonTopTexture(def.symbol, false, v)
      ),
    };
    variantTexCache.set(v.id, entry);
    return entry;
  };

  // Seed cache with initial variant
  variantTexCache.set(initialVariant.id, {
    fasciaTex: fasciaMat.map,
    upperPillarTex: upperPillarMat.map,
    lowerPillarTex: lowerPillarMat.map,
    bridgeTex: bridgePlateMat.map,
    rearTex: rearSpecMat.map,
    btnTextures: buttonTopMats.map(({ mat, def }) => (def.isRed ? null : mat.map)),
  });

  const targetBodyColor = new THREE.Color(initialVariant.bodyColor);
  const targetDoorColor = new THREE.Color(initialVariant.doorColor);
  const targetBtnColor = new THREE.Color(initialVariant.btnCapColor || '#e4d8be');
  const targetPinstripeColor = new THREE.Color(initialVariant.pinstripeColor);
  const targetRollerColor = new THREE.Color(initialVariant.rollerColor || '#e2e7ef');
  let targetMetalness = initialVariant.metalness;
  let targetRoughness = initialVariant.roughness;

  /**
   * Dynamically switches the 3D Cassette Player's industrial color finish with smooth 60fps interpolation!
   */
  const setColorVariant = (variantId) => {
    const v =
      PLAYER_COLOR_VARIANTS.find((item) => item.id === variantId) || PLAYER_COLOR_VARIANTS[0];

    targetBodyColor.set(v.bodyColor);
    targetDoorColor.set(v.doorColor);
    targetBtnColor.set(v.btnCapColor || '#e4d8be');
    targetPinstripeColor.set(v.pinstripeColor || '#f5efe2');
    targetRollerColor.set(v.rollerColor || '#e2e7ef');
    targetMetalness = v.metalness;
    targetRoughness = v.roughness;

    const cached = getVariantTextures(v);
    fasciaMat.map = cached.fasciaTex;
    fasciaMat.needsUpdate = true;

    upperPillarMat.map = cached.upperPillarTex;
    upperPillarMat.needsUpdate = true;

    lowerPillarMat.map = cached.lowerPillarTex;
    lowerPillarMat.needsUpdate = true;

    bridgePlateMat.map = cached.bridgeTex;
    bridgePlateMat.needsUpdate = true;

    rearSpecMat.map = cached.rearTex;
    rearSpecMat.needsUpdate = true;

    buttonTopMats.forEach(({ mat, def }, idx) => {
      if (!def.isRed && cached.btnTextures[idx]) {
        mat.map = cached.btnTextures[idx];
        mat.needsUpdate = true;
      }
    });
  };

  /**
   * Smoothly interpolates the 3D anodized chassis, door, and button finishes every frame
   */
  const updateColorTransition = (dt) => {
    const k = Math.min(1.0, dt * 8.5);
    champagneGoldMat.color.lerp(targetBodyColor, k);
    doorMetalMat.color.lerp(targetDoorColor, k);
    btnBodyMat.color.lerp(targetBtnColor, k);
    pinstripeMat.color.lerp(targetPinstripeColor, k);
    rollerDrumMat.color.lerp(targetRollerColor, k);
    champagneGoldMat.metalness += (targetMetalness - champagneGoldMat.metalness) * k;
    champagneGoldMat.roughness += (targetRoughness - champagneGoldMat.roughness) * k;
    doorMetalMat.metalness += (targetMetalness - doorMetalMat.metalness) * k;
    doorMetalMat.roughness += (targetRoughness - doorMetalMat.roughness) * k;
    btnBodyMat.metalness += (targetMetalness - btnBodyMat.metalness) * k;
    btnBodyMat.roughness += (targetRoughness - btnBodyMat.roughness) * k;
  };

  /**
   * Updates the front status LED jewel color (rich emerald green when playing, warm amber in standby)
   */
  const setLedState = (isPlaying) => {
    const colHex = isPlaying ? '#16a34a' : '#d97706';
    const emiHex = isPlaying ? '#15803d' : '#b45309';
    statusLedMat.color.set(colHex);
    statusLedMat.emissive.set(emiHex);
    statusLedMat.emissiveIntensity = isPlaying ? 0.58 : 0.35;
  };

  return {
    envMap,
    playerRoot,
    doorPivotGroup,
    cassetteRoot: activeCassette.group,
    cassetteArtMat: activeCassette.artMat,
    cassetteShellMat: activeCassette.shellMat,
    reelLeft: activeCassette.reelLeft,
    reelRight: activeCassette.reelRight,
    activeCassette,
    incomingCassette,
    spindleL: spindleL.rotor,
    spindleR: spindleR.rotor,
    flywheelRotor,
    counterWheels,
    headBridgeCarriage,
    buttonMeshes,
    clickableButtons,
    buttonDefs,
    dismantleParts,
    setColorVariant,
    updateColorTransition,
    setLedState,
  };
}

/**
 * Smoothly displaces all registered Walkman & Cassette sub-parts along their 3D explosion
 * vectors (`explodeT = 0.0` assembled -> `explodeT = 1.0` dismantled CAD exploded view!).
 */
export function applyPlayerDismantle(walkman, explodeT) {
  if (!walkman || !walkman.dismantleParts) return;
  for (let i = 0; i < walkman.dismantleParts.length; i++) {
    const p = walkman.dismantleParts[i];
    p.obj.position.set(
      p.basePos.x + p.deltaPos.x * explodeT,
      p.basePos.y + p.deltaPos.y * explodeT,
      p.basePos.z + p.deltaPos.z * explodeT
    );
  }
}

/**
 * Places a 3D cassette assembly inside or emerging from the player bay:
 * - When `slideAlongDoor = 0` (even when `doorAngle > 0`!), the cassette stays 100% FLAT
 *   (`rotation.x = 0, z = 0`) seated on the twin black 6-spline drive spindles inside the bay.
 * - As `slideAlongDoor` increases (`0 -> 88 mm`), it first pulls forward (`+13.5 mm` in `+Z`)
 *   off the spindles and then lifts cleanly out through the open door gap without clipping.
 */
export function placeCassetteOnDoorTrack(
  cassetteGroup,
  doorAngle,
  slideAlongDoor = 0,
  extraOffset = { x: 0, y: 0, z: 0 },
  extraRot = { x: 0, y: 0, z: 0 },
  scale = 1.0
) {
  const pullRaw = Math.min(1.0, Math.max(0.0, slideAlongDoor) / 16.0);
  const pullSmooth = pullRaw * pullRaw * (3.0 - 2.0 * pullRaw);

  const px = BAY_X + (extraOffset.x || 0);
  const py = BAY_Y + slideAlongDoor + (extraOffset.y || 0);
  const pz = pullSmooth * 13.5 + Math.max(0.0, slideAlongDoor) * 0.22 + (extraOffset.z || 0);
  const clearTilt = pullSmooth * 0.22;

  cassetteGroup.position.set(px, py, pz);
  cassetteGroup.rotation.set(
    clearTilt + (extraRot.x || 0),
    extraRot.y || 0,
    extraRot.z || 0,
    'YXZ'
  );
  cassetteGroup.scale.setScalar(scale);
}


