import * as THREE from 'three';

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const CASSETTES = [
  {
    id: 'blinding-lights',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    year: '2020',
    art: `${BASE_PATH}/krystal-deck/rose.jpg`,
    theme: 'blinding-lights',
    accentColor: '#e11d48',
    holoStrength: 0.72,
    shellAccent: '#42131c',
    synthPreset: 'neon-rain',
    bpm: 171,
    youtubeId: 'XwxLwG2_Sxk',
    backupYoutubeIds: ['2VzS2p2XkrQ', 'fHI8X4OXluQ', 'Htv0ibH8bO0'],
    durationSec: 200,
  },
  {
    id: 'get-lucky',
    title: 'Get Lucky',
    artist: 'Daft Punk ft. Pharrell',
    album: 'Random Access Memories',
    year: '2013',
    art: `${BASE_PATH}/krystal-deck/stickers.jpg`,
    theme: 'get-lucky',
    accentColor: '#f59e0b',
    holoStrength: 0.68,
    shellAccent: '#3b2814',
    synthPreset: 'dub-techno',
    bpm: 116,
    youtubeId: '5glDAaCaazc',
    backupYoutubeIds: ['HXEJjtBouRA', '5NV6Rdv1a3I', 'H75AFiLGd8Y'],
    durationSec: 246,
  },
  {
    id: 'as-it-was',
    title: 'As It Was',
    artist: 'Harry Styles',
    album: "Harry's House",
    year: '2022',
    art: `${BASE_PATH}/krystal-deck/chrome.jpg`,
    theme: 'as-it-was',
    accentColor: '#2563eb',
    holoStrength: 0.52,
    shellAccent: '#1c2d45',
    synthPreset: 'acid-prism',
    bpm: 174,
    youtubeId: 'Qfm6nfz1QNQ',
    backupYoutubeIds: ['EsY5kRIBM8Y', 'CjIUVRei27g', '5icKSmNoB2Y'],
    durationSec: 165,
  },
  {
    id: 'sweater-weather',
    title: 'Sweater Weather',
    artist: 'The Neighbourhood',
    album: 'I Love You.',
    year: '2013',
    art: `${BASE_PATH}/krystal-deck/liquid.jpg`,
    theme: 'sweater-weather',
    accentColor: '#8b5cf6',
    holoStrength: 0.74,
    shellAccent: '#261d3a',
    synthPreset: 'solar-drift',
    bpm: 124,
    youtubeId: 'tu8B4jxLrAY',
    backupYoutubeIds: ['7pzOBI3PD8E', '08WiUcJmnZc', 'UDVLn4Xvyz8'],
    durationSec: 240,
  },
];

/**
 * Draws the custom album cover artwork for each of the 4 famous English songs
 * onto any 2D canvas context `(ctx, w, h)`.
 */
function drawSongAlbumArt(ctx, w, h, cassette) {
  ctx.save();
  const theme = cassette.theme || cassette.id;

  if (theme === 'blinding-lights') {
    // AFTER HOURS — Deep crimson-black nocturnal neon portrait aesthetic
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.42, w * 0.05, w * 0.5, h * 0.5, w * 0.72);
    bg.addColorStop(0, '#dc2626');
    bg.addColorStop(0.42, '#7f1d1d');
    bg.addColorStop(0.78, '#28070a');
    bg.addColorStop(1, '#090304');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Nocturnal city highway light streaks
    const streakColors = ['#fb7185', '#f43f5e', '#f59e0b', '#ef4444'];
    for (let i = 0; i < 18; i++) {
      const y = h * (0.14 + ((i * 37) % 72) / 100);
      const x = w * (((i * 53) % 80) / 100);
      const len = w * (0.12 + ((i * 19) % 22) / 100);
      const grad = ctx.createLinearGradient(x, y, x + len, y);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, streakColors[i % streakColors.length] + 'aa');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, len, h * 0.018);
    }

    // Iconic crimson suit silhouette & neon sunglasses reflection in center
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.moveTo(w * 0.24, h);
    ctx.quadraticCurveTo(w * 0.28, h * 0.62, w * 0.5, h * 0.62);
    ctx.quadraticCurveTo(w * 0.72, h * 0.62, w * 0.76, h);
    ctx.closePath();
    ctx.fill();

    // Neon sunglasses visor glow
    ctx.fillStyle = '#111115';
    ctx.fillRect(w * 0.35, h * 0.34, w * 0.13, h * 0.07);
    ctx.fillRect(w * 0.52, h * 0.34, w * 0.13, h * 0.07);
    ctx.fillStyle = '#fda4af';
    ctx.fillRect(w * 0.36, h * 0.355, w * 0.09, h * 0.018);
    ctx.fillRect(w * 0.53, h * 0.355, w * 0.09, h * 0.018);
  } else if (theme === 'get-lucky') {
    // RANDOM ACCESS MEMORIES — Warm sunset disco gradient + split Gold & Chrome robot helmets
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#12091c');
    sky.addColorStop(0.32, '#4c1130');
    sky.addColorStop(0.62, '#c2410c');
    sky.addColorStop(0.84, '#f59e0b');
    sky.addColorStop(1, '#fef08a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // Glowing sunset sun disc
    const sun = ctx.createRadialGradient(w * 0.5, h * 0.56, w * 0.02, w * 0.5, h * 0.56, w * 0.32);
    sun.addColorStop(0, 'rgba(254, 240, 138, 0.95)');
    sun.addColorStop(0.5, 'rgba(245, 158, 11, 0.45)');
    sun.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    // Split Left Gold / Right Silver Robot Visor Emblem
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.arc(w * 0.49, h * 0.48, w * 0.21, Math.PI * 0.5, Math.PI * 1.5);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(w * 0.51, h * 0.48, w * 0.21, -Math.PI * 0.5, Math.PI * 0.5);
    ctx.fill();

    // Dark LED visor slit across both helmets
    ctx.fillStyle = '#090a0f';
    ctx.fillRect(w * 0.31, h * 0.43, w * 0.38, h * 0.075);
    ctx.fillStyle = '#10b981';
    ctx.fillRect(w * 0.34, h * 0.455, w * 0.13, h * 0.022);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(w * 0.53, h * 0.455, w * 0.13, h * 0.022);
  } else if (theme === 'as-it-was') {
    // HARRY'S HOUSE — Warm cream, architectural coral-red & cobalt-blue geometric studio art
    ctx.fillStyle = '#f5ebe1';
    ctx.fillRect(0, 0, w, h);

    // Inverted room ceiling & geometric color blocks
    ctx.fillStyle = '#e6ccb2';
    ctx.fillRect(0, 0, w, h * 0.38);

    ctx.fillStyle = '#1d4ed8';
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.5, w * 0.24, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#dc2626';
    ctx.fillRect(w * 0.14, h * 0.26, w * 0.36, h * 0.48);

    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.moveTo(w * 0.32, h * 0.74);
    ctx.lineTo(w * 0.56, h * 0.32);
    ctx.lineTo(w * 0.78, h * 0.74);
    ctx.closePath();
    ctx.fill();
  } else {
    // SWEATER WEATHER — Moody noir silver-violet clouds, crescent moon & California palm silhouettes
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f0c1b');
    bg.addColorStop(0.45, '#2e1f47');
    bg.addColorStop(0.78, '#6d28d9');
    bg.addColorStop(1, '#1e1b2e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Soft atmospheric silver-violet glow
    const moon = ctx.createRadialGradient(w * 0.5, h * 0.38, w * 0.02, w * 0.5, h * 0.38, w * 0.34);
    moon.addColorStop(0, 'rgba(243, 232, 255, 0.92)');
    moon.addColorStop(0.45, 'rgba(167, 139, 250, 0.38)');
    moon.addColorStop(1, 'rgba(167, 139, 250, 0)');
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, w, h);

    // Noir horizon & palm silhouettes
    ctx.fillStyle = '#09080d';
    ctx.fillRect(0, h * 0.76, w, h * 0.24);
    [0.24, 0.5, 0.76].forEach((px, idx) => {
      const tx = w * px;
      const ty = h * (0.34 + (idx % 2) * 0.08);
      ctx.strokeStyle = '#09080d';
      ctx.lineWidth = Math.max(2, w * 0.022);
      ctx.beginPath();
      ctx.moveTo(tx, h * 0.78);
      ctx.quadraticCurveTo(tx + w * 0.02, (ty + h * 0.78) * 0.5, tx, ty);
      ctx.stroke();

      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.quadraticCurveTo(
          tx + Math.cos(a) * w * 0.08,
          ty + Math.sin(a) * h * 0.04 - h * 0.02,
          tx + Math.cos(a) * w * 0.12,
          ty + Math.sin(a) * h * 0.08 + h * 0.02
        );
        ctx.stroke();
      }
    });
  }

  ctx.restore();
}

/**
 * Cleans up raw filenames and YouTube/stream titles by stripping common downloader prefixes/suffixes
 * e.g. "[SPOTDOWNLOADER.COM] Aaya Tere Dar Par.mp3" -> "Aaya Tere Dar Par"
 * e.g. "Cassette Love (Official Lyric Video)" -> "Cassette Love"
 */
export function cleanTrackFilename(rawName = '') {
  let s = rawName.replace(/\.[^/.]+$/, '');
  s = s.replace(/\s*\|.*$/g, '');
  s = s.replace(/^\s*\[[^\]]+\]\s*/g, '');
  s = s.replace(
    /\s*\[(?:[^\]]*\b(?:download|spotify|youtube|mp3|official|lyric|lyrics|audio|video|original|visualizer|hd|hq|4k|remastered)\b[^\]]*)\]\s*/gi,
    ' '
  );
  s = s.replace(
    /\s*\((?:[^)]*\b(?:official|lyric|lyrics|audio|video|original|visualizer|hd|hq|4k|remastered|320\s*kbps|full\s*song)\b[^)]*)\)\s*/gi,
    ' '
  );
  s = s.replace(/[_]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  return s || rawName.replace(/\.[^/.]+$/, '');
}

/**
 * Shared studio-grade 1024x1024 cassette label frame & typography renderer.
 * Positioned strictly inside the upper (`canvasY = 74..290`) and lower (`canvasY = 696..876`)
 * label zones so that `labelWinHole` (`canvasY = 305..680`) and `casWinBezelMesh` NEVER clip any text!
 */
function drawCassetteStudioTypography(
  ctx,
  {
    title = 'STUDIO MASTER',
    artist = 'FEATURED ARTIST',
    album = 'MASTER EDITION',
    year = 'LP',
    accentColor = '#e11d48',
    coverImg = null,
  }
) {
  const cleanTitle = cleanTrackFilename(title).toUpperCase();
  const cleanArtist = (artist || 'STUDIO MASTER').toUpperCase();
  const cleanAlbum = (album || 'MASTER AUDIO').toUpperCase();

  // 1. Upper Label Header Band (`y = 66 .. 292`)
  // Uses a sleek translucent gradient scrim on the left for text legibility while letting
  // the vivid album artwork & rich color palette shine through across the label!
  const topBand = ctx.createLinearGradient(16, 66, 1008, 292);
  topBand.addColorStop(0.0, 'rgba(10, 12, 18, 0.78)');
  topBand.addColorStop(0.55, 'rgba(12, 15, 22, 0.52)');
  topBand.addColorStop(1.0, 'rgba(10, 12, 18, 0.34)');
  ctx.fillStyle = topBand;
  ctx.fillRect(16, 66, 992, 226);

  // Top luminous accent crown bar (`y = 66..78`)
  ctx.fillStyle = accentColor;
  ctx.fillRect(24, 68, 976, 10);

  // Crisp metallic accent stripe + warm champagne-gold rule along bottom of upper header (`y = 282`, safely above bezel at 305)
  ctx.fillStyle = accentColor;
  ctx.fillRect(24, 280, 976, 6);
  ctx.fillStyle = '#f5deb0';
  ctx.fillRect(24, 288, 976, 3);

  // Left "A" Side Index Box (`x = 44..136, y = 118..252`) with bright white rim
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(44, 120, 90, 130, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = '900 62px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.fillText('A', 89, 196);
  ctx.font = '800 16px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText('STEREO', 89, 230);

  // Song Title & Artist + Album with razor-sharp high-contrast typography (zero blurry shadow halo!)
  ctx.save();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 46px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  ctx.fillText(cleanTitle.slice(0, 22), 154, 174);

  ctx.fillStyle = '#fde6b0';
  ctx.font = '800 23px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText(`${cleanArtist.slice(0, 24)}  ·  ${cleanAlbum.slice(0, 18)}`, 154, 218);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.font = '700 17px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText('CHROME / METAL POSITION  ·  70µs EQ  ·  DOLBY B-C NR', 154, 256);
  ctx.restore();

  // Far-Right Upper Corner: Framed High-Contrast Album Cover Art Badge (`x = 832..978, y = 112..258`)
  if (coverImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(834, 114, 144, 144, 14);
    ctx.clip();
    ctx.drawImage(coverImg, 834, 114, 144, 144);
    ctx.restore();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(834, 114, 144, 144, 14);
    ctx.stroke();
  } else {
    ctx.fillStyle = 'rgba(15, 18, 26, 0.75)';
    ctx.beginPath();
    ctx.roundRect(834, 120, 144, 132, 12);
    ctx.fill();
    ctx.strokeStyle = '#fde6b0';
    ctx.lineWidth = 3.5;
    ctx.stroke();
    ctx.fillStyle = '#fde6b0';
    ctx.textAlign = 'center';
    ctx.font = '900 26px "SF Mono", "JetBrains Mono", monospace';
    ctx.fillText('TYPE IV', 906, 172);
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 18px "SF Mono", "JetBrains Mono", monospace';
    ctx.fillText('METAL', 906, 202);
    ctx.fillText(String(year || 'MASTER'), 906, 230);
  }

  // 2. Left & Right Vertical Flanking Strips (`x = 16..148` & `x = 876..1008`, `y = 300..686`)
  // Keep translucent (`0.36`) so the vivid song artwork colors wrap around the center window!
  ctx.fillStyle = 'rgba(12, 15, 22, 0.36)';
  ctx.fillRect(16, 300, 132, 386);
  ctx.fillRect(876, 300, 132, 386);

  // Left vertical calibration ruler ticks (bright metallic ivory)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.lineWidth = 2.8;
  for (let y = 330; y <= 650; y += 20) {
    const wTick = y % 60 === 10 ? 32 : 16;
    ctx.beginPath();
    ctx.moveTo(44, y);
    ctx.lineTo(44 + wTick, y);
    ctx.stroke();
  }

  // Right vertical color-coded studio racing bars (vivid high-saturation stripes)
  ctx.fillStyle = accentColor;
  ctx.fillRect(904, 326, 18, 332);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(928, 326, 12, 332);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(946, 326, 12, 332);

  // 3. Lower Label Brushed Champagne-Silver Metallic Foil Strip (`y = 692 .. 884`)
  // High-contrast metallic foil lower band (inspired by Sony Metal Master / TDK MA-R) so the cassette
  // looks bright, intricate, and unmistakably premium inside the bay!
  const botBand = ctx.createLinearGradient(16, 692, 1008, 886);
  botBand.addColorStop(0.0, '#e6decb');
  botBand.addColorStop(0.32, '#f5efe2');
  botBand.addColorStop(0.65, '#dcd2bc');
  botBand.addColorStop(1.0, '#c8bca2');
  ctx.fillStyle = botBand;
  ctx.fillRect(16, 692, 992, 194);

  // Top accent rule along lower label strip (`y = 692`, safely below center window bezel at 680)
  ctx.fillStyle = accentColor;
  ctx.fillRect(16, 692, 992, 8);
  ctx.fillStyle = 'rgba(20, 22, 28, 0.25)';
  ctx.fillRect(16, 700, 992, 2);

  // Left lower technical typography in crisp dark charcoal-black on the metallic foil band
  ctx.textAlign = 'left';
  ctx.fillStyle = '#14161c';
  ctx.font = '900 30px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText(`TYPE IV · METAL MASTER · ${year || 'LP'}`, 48, 756);

  ctx.fillStyle = 'rgba(20, 22, 28, 0.85)';
  ctx.font = '700 18px "SF Mono", "JetBrains Mono", monospace';
  ctx.fillText('HIGH BIAS 70µs EQ   ·   DOLBY NR   ·   KRYSTAL LABS', 48, 794);

  // Dark recessed bezel pill on the right of the lower foil band for the glowing LED VU Peak Meter (`x = 620..982, y = 716..806`)
  ctx.fillStyle = '#12151c';
  ctx.beginPath();
  ctx.roundRect(622, 716, 358, 88, 12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const vuLabels = ['-20', '-10', '-5', '-3', '0', '+3', '+6dB'];
  ctx.font = '800 15px "SF Mono", "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  vuLabels.forEach((lbl, i) => {
    const vx = 652 + i * 48;
    ctx.fillStyle = i >= 5 ? '#fb7185' : i === 4 ? '#fbbf24' : '#e2e8f0';
    ctx.fillText(lbl, vx, 742);
  });

  for (let seg = 0; seg < 22; seg++) {
    const sx = 638 + seg * 14.8;
    ctx.fillStyle =
      seg >= 17 ? '#f43f5e' : seg >= 13 ? '#fbbf24' : '#10b981';
    ctx.fillRect(sx, 754, 10.5, 16);
    ctx.globalAlpha = 0.55;
    ctx.fillRect(sx, 775, 10.5, 12);
    ctx.globalAlpha = 1.0;
  }

  // Outer perimeter metallic frame border around the cassette label
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 70, 984, 812);
}

/**
 * Generates both a crisp dock/list swatch thumbnail (`thumbUrl`) and an ultra-crisp
 * 2048x2048 3D cassette label texture (`texture`) for a famous English song cassette.
 */
export function createDefaultCassetteAssets(cassette) {
  // 1. Generate Crisp Collection Thumbnail (320 x 208)
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 320;
  thumbCanvas.height = 208;
  const tctx = thumbCanvas.getContext('2d');
  drawSongAlbumArt(tctx, 320, 208, cassette);

  const tScrim = tctx.createLinearGradient(0, 96, 0, 208);
  tScrim.addColorStop(0, 'rgba(8, 9, 13, 0.0)');
  tScrim.addColorStop(0.45, 'rgba(8, 9, 13, 0.65)');
  tScrim.addColorStop(1, 'rgba(8, 9, 13, 0.92)');
  tctx.fillStyle = tScrim;
  tctx.fillRect(0, 96, 320, 112);

  tctx.fillStyle = cassette.accentColor || '#e11d48';
  tctx.fillRect(16, 148, 4, 42);

  tctx.fillStyle = '#ffffff';
  tctx.font = '800 22px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  tctx.fillText(cassette.title.slice(0, 16), 28, 169);

  tctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  tctx.font = '600 15px -apple-system, BlinkMacSystemFont, "Inter", sans-serif';
  tctx.fillText(cassette.artist.slice(0, 22), 28, 190);

  const thumbUrl = thumbCanvas.toDataURL('image/jpeg', 0.92);

  // 2. Generate 2048x2048 Ultra-Sharp 3D Cassette Label Texture
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  drawSongAlbumArt(ctx, 1024, 1024, cassette);
  drawCassetteStudioTypography(ctx, {
    title: cassette.title,
    artist: cassette.artist,
    album: cassette.album || 'STUDIO MASTER',
    year: cassette.year || 'LP',
    accentColor: cassette.accentColor || '#e11d48',
    coverImg: thumbCanvas,
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = 16;
  texture.needsUpdate = true;

  return { texture, thumbUrl };
}

/**
 * Decodes an ID3 text buffer according to the ID3v2 encoding byte:
 * 0 = ISO-8859-1 (or UTF-8 in many modern taggers)
 * 1 = UTF-16 with BOM
 * 2 = UTF-16BE without BOM
 * 3 = UTF-8
 */
function decodeId3Text(bytes) {
  if (!bytes || bytes.length === 0) return '';
  const enc = bytes[0];
  const payload = bytes.subarray(1);
  let text = '';
  try {
    if (enc === 1) {
      text = new TextDecoder('utf-16').decode(payload);
    } else if (enc === 2) {
      text = new TextDecoder('utf-16be').decode(payload);
    } else if (enc === 3) {
      text = new TextDecoder('utf-8').decode(payload);
    } else {
      // Try UTF-8 first, fallback to windows-1252 / iso-8859-1
      const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(payload);
      text = utf8.includes('\uFFFD')
        ? new TextDecoder('windows-1252').decode(payload)
        : utf8;
    }
  } catch {
    text = new TextDecoder('utf-8').decode(payload);
  }
  return text.replace(/\0/g, '').trim();
}

/**
 * Finds the start of embedded JPEG / PNG / WebP image data inside a binary buffer
 * and returns a Blob if found.
 */
function extractImageBlobFromBytes(bytes) {
  if (!bytes || bytes.length < 16) return null;
  const limit = Math.min(bytes.length - 4, 512);
  for (let i = 0; i < limit; i++) {
    // JPEG magic bytes: FF D8 FF
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      return new Blob([bytes.subarray(i)], { type: 'image/jpeg' });
    }
    // PNG magic bytes: 89 50 4E 47 (0x89 'P' 'N' 'G')
    if (
      bytes[i] === 0x89 &&
      bytes[i + 1] === 0x50 &&
      bytes[i + 2] === 0x4e &&
      bytes[i + 3] === 0x47
    ) {
      return new Blob([bytes.subarray(i)], { type: 'image/png' });
    }
    // WebP magic bytes: 'RIFF' .... 'WEBP'
    if (
      i + 12 < bytes.length &&
      bytes[i] === 0x52 &&
      bytes[i + 1] === 0x49 &&
      bytes[i + 2] === 0x46 &&
      bytes[i + 3] === 0x46 &&
      bytes[i + 8] === 0x57 &&
      bytes[i + 9] === 0x45 &&
      bytes[i + 10] === 0x42 &&
      bytes[i + 11] === 0x50
    ) {
      return new Blob([bytes.subarray(i)], { type: 'image/webp' });
    }
  }
  return null;
}

/**
 * Loads a Blob into an HTMLImageElement and extracts a vibrant accent hex color
 */
function loadBlobAsImageWithAccent(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      let accentHex = null;
      try {
        const c = document.createElement('canvas');
        c.width = 32;
        c.height = 32;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let bestScore = -1;
        let bestRGB = [255, 59, 31];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const sat = max === 0 ? 0 : (max - min) / max;
          const lum = (r + g + b) / (3 * 255);
          const score = sat * (1 - Math.abs(lum - 0.55));
          if (score > bestScore && max > 60) {
            bestScore = score;
            bestRGB = [r, g, b];
          }
        }
        accentHex =
          '#' +
          bestRGB
            .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
            .join('');
      } catch {
        accentHex = null;
      }
      resolve({ coverImg: img, coverUrl: url, accentColor: accentHex });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ coverImg: null, coverUrl: null, accentColor: null });
    };
    img.src = url;
  });
}

/**
 * Parses ID3v2 (v2.2, v2.3, v2.4), FLAC, and MP4/M4A tags directly from an audio File
 * to automatically extract Title, Artist, Album, and Embedded Cover Thumbnail!
 */
export async function extractAudioMetadata(file) {
  const rawFallback = cleanTrackFilename(file?.name || 'Custom Track');
  let fallbackTitle = rawFallback;
  let fallbackArtist = '';

  // If filename has "Artist - Title" pattern, split it as a smart fallback
  if (rawFallback.includes(' - ')) {
    const parts = rawFallback.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      fallbackArtist = parts[0];
      fallbackTitle = parts.slice(1).join(' - ');
    }
  }

  const result = {
    title: fallbackTitle,
    artist: fallbackArtist || 'Studio Master',
    album: '',
    coverImg: null,
    coverUrl: null,
    accentColor: null,
  };

  if (!file) return result;

  try {
    // Read up to first 6 MB of the audio file (covers ID3v2 / FLAC / M4A headers + high-res cover art)
    const sliceSize = Math.min(file.size, 6 * 1024 * 1024);
    const buf = await file.slice(0, sliceSize).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const view = new DataView(buf);

    let title = '';
    let artist = '';
    let album = '';
    let imageBlob = null;

    // ------------------------------------------------------------------------
    // 1. Check for ID3v2 Header ('ID3' at offset 0)
    // ------------------------------------------------------------------------
    if (
      bytes.length > 10 &&
      bytes[0] === 0x49 && // 'I'
      bytes[1] === 0x44 && // 'D'
      bytes[2] === 0x33    // '3'
    ) {
      const version = bytes[3]; // 2, 3, or 4
      const flags = bytes[5];
      const tagSize =
        ((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f);

      const endOffset = Math.min(bytes.length, 10 + tagSize);
      let offset = 10;

      // Skip optional extended header if present
      if ((flags & 0x40) !== 0 && offset + 4 < endOffset) {
        const extSize =
          version === 4
            ? ((bytes[offset] & 0x7f) << 21) |
              ((bytes[offset + 1] & 0x7f) << 14) |
              ((bytes[offset + 2] & 0x7f) << 7) |
              (bytes[offset + 3] & 0x7f)
            : view.getUint32(offset, false);
        offset += extSize;
      }

      while (offset + (version === 2 ? 6 : 10) <= endOffset) {
        if (bytes[offset] === 0) break; // Padding reached

        let frameId = '';
        let frameSize = 0;
        let frameHeaderSize = 10;
        let frameFlags2 = 0;

        if (version === 2) {
          frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
          frameSize =
            (bytes[offset + 3] << 16) | (bytes[offset + 4] << 8) | bytes[offset + 5];
          frameHeaderSize = 6;
        } else {
          frameId = String.fromCharCode(
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3]
          );
          if (version === 4) {
            // Some v2.4 taggers write synchsafe sizes, others write standard uint32.
            const synchSize =
              ((bytes[offset + 4] & 0x7f) << 21) |
              ((bytes[offset + 5] & 0x7f) << 14) |
              ((bytes[offset + 6] & 0x7f) << 7) |
              (bytes[offset + 7] & 0x7f);
            const rawSize = view.getUint32(offset + 4, false);
            frameSize =
               (bytes[offset + 4] & 0x80) !== 0 ||
              (bytes[offset + 5] & 0x80) !== 0 ||
              (bytes[offset + 6] & 0x80) !== 0 ||
              (bytes[offset + 7] & 0x80) !== 0
                ? rawSize
                : synchSize;
            // Verify if rawSize makes more sense by checking next frame ID
            if (
              synchSize !== rawSize &&
              offset + 10 + rawSize + 4 <= endOffset &&
              /^[A-Z0-9]{4}$/.test(
                String.fromCharCode(
                  bytes[offset + 10 + rawSize],
                  bytes[offset + 11 + rawSize],
                  bytes[offset + 12 + rawSize],
                  bytes[offset + 13 + rawSize]
                )
              )
            ) {
              frameSize = rawSize;
            }
          } else {
            frameSize = view.getUint32(offset + 4, false);
          }
          frameFlags2 = bytes[offset + 9];
          frameHeaderSize = 10;
        }

        if (frameSize <= 0 || offset + frameHeaderSize + frameSize > endOffset) {
          break;
        }

        let frameData = bytes.subarray(offset + frameHeaderSize, offset + frameHeaderSize + frameSize);
        // If ID3v2.4 data length indicator flag (0x01) is set, skip the 4-byte length prefix
        if (version === 4 && (frameFlags2 & 0x01) !== 0 && frameData.length > 4) {
          frameData = frameData.subarray(4);
        }

        if (frameId === 'TIT2' || frameId === 'TT2') {
          const val = decodeId3Text(frameData);
          if (val) title = cleanTrackFilename(val);
        } else if (frameId === 'TPE1' || frameId === 'TP1') {
          const val = decodeId3Text(frameData);
          if (val) artist = val;
        } else if ((frameId === 'TPE2' || frameId === 'TP2') && !artist) {
          const val = decodeId3Text(frameData);
          if (val) artist = val;
        } else if (frameId === 'TALB' || frameId === 'TAL') {
          const val = decodeId3Text(frameData);
          if (val) album = val;
        } else if (frameId === 'APIC' || frameId === 'PIC') {
          const blob = extractImageBlobFromBytes(frameData);
          if (blob) imageBlob = blob;
        }

        offset += frameHeaderSize + frameSize;
      }
    }
    // ------------------------------------------------------------------------
    // 2. Check for FLAC Header ('fLaC' at offset 0)
    // ------------------------------------------------------------------------
    else if (
      bytes.length > 8 &&
      bytes[0] === 0x66 && // 'f'
      bytes[1] === 0x4c && // 'L'
      bytes[2] === 0x61 && // 'a'
      bytes[3] === 0x43    // 'C'
    ) {
      let offset = 4;
      let isLast = false;
      while (!isLast && offset + 4 <= bytes.length) {
        isLast = (bytes[offset] & 0x80) !== 0;
        const blockType = bytes[offset] & 0x7f;
        const blockLen =
          (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
        offset += 4;
        if (offset + blockLen > bytes.length) break;

        const blockData = bytes.subarray(offset, offset + blockLen);
        if (blockType === 4 && blockData.length > 8) {
          // Vorbis Comment Block (little-endian lengths)
          let p = 0;
          const vendorLen = view.getUint32(offset + p, true);
          p += 4 + vendorLen;
          if (p + 4 <= blockLen) {
            const count = view.getUint32(offset + p, true);
            p += 4;
            for (let i = 0; i < count && p + 4 <= blockLen; i++) {
              const cLen = view.getUint32(offset + p, true);
              p += 4;
              if (p + cLen > blockLen) break;
              const str = new TextDecoder('utf-8').decode(
                bytes.subarray(offset + p, offset + p + cLen)
              );
              p += cLen;
              const eq = str.indexOf('=');
              if (eq > 0) {
                const k = str.slice(0, eq).toUpperCase();
                const v = str.slice(eq + 1).trim();
                if (k === 'TITLE' && v) title = cleanTrackFilename(v);
                else if (k === 'ARTIST' && v) artist = v;
                else if (k === 'ALBUMARTIST' && v && !artist) artist = v;
                else if (k === 'ALBUM' && v) album = v;
              }
            }
          }
        } else if (blockType === 6) {
          // FLAC Picture Block
          const blob = extractImageBlobFromBytes(blockData);
          if (blob) imageBlob = blob;
        }
        offset += blockLen;
      }
    }
    // ------------------------------------------------------------------------
    // 3. Fallback / M4A / MP4 ('ftyp' / 'ilst') & Embedded Cover Art Scan
    // ------------------------------------------------------------------------
    if (!imageBlob && bytes.length > 64) {
      // Scan for MP4 'covr' atom or embedded ID3 'APIC' anywhere in first 2MB
      const scanLen = Math.min(bytes.length - 16, 2 * 1024 * 1024);
      for (let i = 0; i < scanLen; i++) {
        // Check for 'covr' atom in M4A/MP4
        if (
          bytes[i] === 0x63 && // 'c'
          bytes[i + 1] === 0x6f && // 'o'
          bytes[i + 2] === 0x76 && // 'v'
          bytes[i + 3] === 0x72    // 'r'
        ) {
          const atomSize = i >= 4 ? view.getUint32(i - 4, false) : 0;
          const end = atomSize > 16 ? Math.min(bytes.length, i - 4 + atomSize) : Math.min(bytes.length, i + 512 * 1024);
          const blob = extractImageBlobFromBytes(bytes.subarray(i + 4, end));
          if (blob) {
            imageBlob = blob;
            break;
          }
        }
      }
    }

    if (title) result.title = title;
    if (artist) result.artist = artist;
    if (album) result.album = album;

    if (imageBlob) {
      const loaded = await loadBlobAsImageWithAccent(imageBlob);
      if (loaded.coverImg) {
        result.coverImg = loaded.coverImg;
        result.coverUrl = loaded.coverUrl;
        if (loaded.accentColor) {
          result.accentColor = loaded.accentColor;
        }
      }
    }
  } catch (err) {
    console.warn('Metadata extraction fallback used:', err);
  }

  return result;
}

/**
 * Generates a studio-grade 1024x1024 custom cassette artwork texture when the user
 * adds their own audio file (with automatic or custom cover image, song title, & artist).
 */
export function createCustomSongTexture({
  title = 'CUSTOM MASTER TRACK',
  artist = 'STUDIO REFERENCE',
  coverImg = null,
  accentColor = '#ff3b1f',
}) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);

  // 1. Deep, rich studio obsidian & brushed charcoal base (Zero washed-out white blocks!)
  const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
  bg.addColorStop(0, '#121318');
  bg.addColorStop(0.5, '#1b1d24');
  bg.addColorStop(1, '#0e0f13');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 1024);

  // Normalize coverImg (unwrap `{ img }` if passed and verify it is a valid drawable HTMLImageElement / HTMLCanvasElement)
  const rawImg = coverImg && typeof coverImg === 'object' && 'img' in coverImg ? coverImg.img : coverImg;
  const validCoverImg =
    rawImg &&
    typeof rawImg.width === 'number' &&
    rawImg.width > 0 &&
    typeof rawImg.height === 'number' &&
    rawImg.height > 0
      ? rawImg
      : null;

  // If cover art exists (automatically grabbed from the audio file, online search, or uploaded), draw it vividly!
  if (validCoverImg) {
    try {
      const scale = Math.max(1024 / validCoverImg.width, 1024 / validCoverImg.height);
      const dw = validCoverImg.width * scale;
      const dh = validCoverImg.height * scale;
      ctx.drawImage(validCoverImg, (1024 - dw) * 0.5, (1024 - dh) * 0.5, dw, dh);
    } catch {
      // Fallback if image is not drawable
    }
  } else {
    // Rich dark Dieter Rams / Sony Metal Master studio cassette design (dark charcoal + warm gold & accent stripes)
    ctx.fillStyle = '#181a20';
    ctx.fillRect(0, 0, 1024, 320);

    // Subtle horizontal technical grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 2;
    for (let y = 100; y < 880; y += 28) {
      ctx.beginPath();
      ctx.moveTo(56, y);
      ctx.lineTo(968, y);
      ctx.stroke();
    }

    // Precision color-coded studio racing bands across the middle
    ctx.fillStyle = accentColor;
    ctx.fillRect(0, 378, 1024, 56);
    ctx.fillStyle = '#d4b475';
    ctx.fillRect(0, 434, 1024, 24);
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(0, 458, 1024, 40);

    // Fine technical ruler ticks
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    for (let x = 56; x <= 968; x += 16) {
      const h = x % 64 === 0 ? 26 : 12;
      ctx.beginPath();
      ctx.moveTo(x, 520);
      ctx.lineTo(x, 520 + h);
      ctx.stroke();
    }
  }

  // Draw the precision non-overlapping studio cassette typography, Side A badge, framed cover art, and LED VU meter
  drawCassetteStudioTypography(ctx, {
    title,
    artist,
    accentColor,
    sideCode: 'A',
    tapeSpec: 'TYPE IV · METAL MASTER 70µs',
    subSpec: 'DOLBY B-C NR   ·   STUDIO EDITION',
    coverImg: validCoverImg,
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.anisotropy = 16;
  tex.needsUpdate = true;
  return {
    texture: tex,
    dataUrl: canvas.toDataURL('image/jpeg', 0.92),
  };
}

