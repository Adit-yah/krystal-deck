/**
 * Client-side Persistence (localStorage + Shareable URL) & Static-Host (GitHub Pages) Music Search / Link Resolver
 * Ensures Krystal Deck works both with Next.js API routes AND as a 100% static export on GitHub Pages.
 */

const STORAGE_COLLECTION_KEY = 'krystal_deck_collection_v1';
const STORAGE_PREFS_KEY = 'krystal_deck_prefs_v1';

const ACCENT_PALETTE = [
  '#ff3b1f',
  '#2563eb',
  '#10b981',
  '#d97706',
  '#9333ea',
  '#e11d48',
  '#0891b2',
];

function decodeHtmlEntities(str) {
  if (!str) return '';
  return String(str)
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Compresses an HTMLImageElement into a compact 240x240 JPEG Data URL (~8-14 KB)
 * so custom cover art can be stored reliably inside `localStorage` without hitting quota limits.
 */
export function compressImageToDataUrl(img, maxDim = 240, quality = 0.82) {
  if (!img || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = maxDim;
    canvas.height = maxDim;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const iw = img.naturalWidth || img.width || maxDim;
    const ih = img.naturalHeight || img.height || maxDim;
    const scale = Math.max(maxDim / iw, maxDim / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (maxDim - dw) * 0.5;
    const dy = (maxDim - dh) * 0.5;

    ctx.fillStyle = '#141418';
    ctx.fillRect(0, 0, maxDim, maxDim);
    ctx.drawImage(img, dx, dy, dw, dh);
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

/**
 * Serializes a cassette item for `localStorage` (stripping non-serializable Three.js textures and File blobs).
 */
export function serializeCassetteItem(cas) {
  if (!cas) return null;
  // Keep coverUrl compact: if thumbUrl is a huge 2048x2048 PNG canvas dataUrl, omit it so we regenerate it on load
  const isHugeCanvasUrl = (u) => typeof u === 'string' && u.startsWith('data:image/png') && u.length > 80000;
  const persistedCoverUrl =
    cas.coverDataUrl ||
    (!isHugeCanvasUrl(cas.coverUrl) ? cas.coverUrl : null) ||
    (!isHugeCanvasUrl(cas.thumbUrl) ? cas.thumbUrl : null) ||
    null;

  return {
    id: cas.id,
    externalId: cas.externalId || null,
    onlineTrackId: cas.onlineTrackId || null,
    title: cas.title || 'Custom Track',
    artist: cas.artist || 'Studio Master',
    subtitle: cas.subtitle || '',
    shellAccent: cas.shellAccent || '#253545',
    synthPreset: cas.synthPreset || 'neon-rain',
    sourceType: cas.sourceType === 'file' ? 'synth' : cas.sourceType || 'synth',
    coverUrl: persistedCoverUrl,
    streamUrl: cas.streamUrl || null,
    youtubeId: cas.youtubeId || null,
    backupYoutubeIds: Array.isArray(cas.backupYoutubeIds) ? cas.backupYoutubeIds.slice(0, 4) : [],
    durationSec: cas.durationSec || 210,
    spotifyId: cas.spotifyId || null,
    spotifyType: cas.spotifyType || 'track',
    isDefault: Boolean(cas.isDefault),
  };
}

export function saveCollectionToStorage(list) {
  if (typeof window === 'undefined' || !Array.isArray(list)) return;
  try {
    const serialized = list.map(serializeCassetteItem).filter(Boolean);
    window.localStorage.setItem(STORAGE_COLLECTION_KEY, JSON.stringify(serialized));
  } catch {
    // If quota exceeded due to data URLs, retry without data URLs
    try {
      const fallback = list
        .map((c) => {
          const item = serializeCassetteItem(c);
          if (item && typeof item.coverUrl === 'string' && item.coverUrl.startsWith('data:')) {
            item.coverUrl = null;
          }
          return item;
        })
        .filter(Boolean);
      window.localStorage.setItem(STORAGE_COLLECTION_KEY, JSON.stringify(fallback));
    } catch {
      // Ignore storage errors in private browsing
    }
  }
}

export function loadCollectionFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_COLLECTION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Ignore corrupted storage
  }
  return null;
}

export function savePrefsToStorage(prefs) {
  if (typeof window === 'undefined' || !prefs) return;
  try {
    const existing = loadPrefsFromStorage() || {};
    const merged = { ...existing, ...prefs };
    window.localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage errors
  }
}

export function loadPrefsFromStorage() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Encodes the user's current player skin + cassette collection into a shareable URL parameter (`?deck=...`)
 * so they can share their exact curated cassette player & playlist on GitHub Pages with their audience!
 */
export function buildShareableDeckUrl({ playerColorId, activeCassetteId, autoMode, list }) {
  if (typeof window === 'undefined') return '';
  try {
    const compactTracks = (list || []).slice(0, 20).map((c) => ({
      i: c.id,
      e: c.externalId || undefined,
      o: c.onlineTrackId || undefined,
      t: c.title,
      a: c.artist,
      ac: c.shellAccent,
      p: c.synthPreset,
      st: c.sourceType === 'file' ? 'synth' : c.sourceType,
      c:
        c.coverUrl && !String(c.coverUrl).startsWith('data:')
          ? c.coverUrl
          : c.thumbUrl && !String(c.thumbUrl).startsWith('data:')
          ? c.thumbUrl
          : undefined,
      u: c.streamUrl || undefined,
      y: c.youtubeId || undefined,
      by: Array.isArray(c.backupYoutubeIds) && c.backupYoutubeIds.length ? c.backupYoutubeIds.slice(0, 2) : undefined,
      d: c.durationSec || 210,
      sp: c.spotifyId || undefined,
      spt: c.spotifyId ? c.spotifyType || 'track' : undefined,
      df: c.isDefault ? 1 : 0,
    }));

    const payload = {
      v: 1,
      skin: playerColorId || 'champagne',
      act: activeCassetteId || undefined,
      auto: autoMode !== false ? 1 : 0,
      list: compactTracks,
    };

    const jsonStr = JSON.stringify(payload);
    const encoded = btoa(encodeURIComponent(jsonStr));
    const url = new URL(window.location.href);
    url.searchParams.set('deck', encoded);
    return url.toString();
  } catch {
    return window.location.href;
  }
}

/**
 * Reads `?deck=...` from the URL if someone opened a shared link from the creator.
 */
export function parseSharedDeckFromUrl() {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('deck');
    if (!encoded) return null;
    const jsonStr = decodeURIComponent(atob(encoded));
    const data = JSON.parse(jsonStr);
    if (!data || !Array.isArray(data.list) || data.list.length === 0) return null;

    const list = data.list.map((item, idx) => ({
      id: item.i || `cas-shared-${idx}`,
      externalId: item.e || null,
      onlineTrackId: item.o || null,
      title: item.t || 'Shared Track',
      artist: item.a || 'Featured Artist',
      shellAccent: item.ac || '#253545',
      synthPreset: item.p || 'neon-rain',
      sourceType: item.st || (item.u ? 'online' : item.y ? 'youtube' : 'synth'),
      coverUrl: item.c || null,
      streamUrl: item.u || null,
      youtubeId: item.y || null,
      backupYoutubeIds: Array.isArray(item.by) ? item.by : [],
      durationSec: item.d || 210,
      spotifyId: item.sp || null,
      spotifyType: item.spt || 'track',
      isDefault: Boolean(item.df),
    }));

    return {
      playerColorId: data.skin || 'champagne',
      activeCassetteId: data.act || list[0]?.id,
      autoMode: data.auto !== 0,
      list,
    };
  } catch {
    return null;
  }
}

/**
 * Direct client-side online music search fallback (used automatically on GitHub Pages where `/api/music-search` is static/unavailable).
 */
export async function searchOnlineSongsClientFallback(rawQuery) {
  const query = (rawQuery || '').trim() || 'The Weeknd Daft Punk Dua Lipa';

  // 1. Try Next.js API route first (when running locally or on a Node server)
  try {
    const apiRes = await fetch(`/api/music-search?q=${encodeURIComponent(query)}`);
    if (apiRes.ok) {
      const contentType = apiRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (apiData && apiData.ok && Array.isArray(apiData.results)) {
          return apiData;
        }
      }
    }
  } catch {
    // Fall through to direct client-side CORS search (for GitHub Pages!)
  }

  // 2. Direct Client-Side Search via JioSaavn API + iTunes Search API (both support CORS `Access-Control-Allow-Origin: *`)
  try {
    const [saavnRes, itunesRes] = await Promise.allSettled([
      fetch(`https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=14`),
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=12`),
    ]);

    const tracks = [];
    if (saavnRes.status === 'fulfilled' && saavnRes.value.ok) {
      const json = await saavnRes.value.json();
      const raw = Array.isArray(json?.data?.results) ? json.data.results : [];
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const durationSec = Number(item?.duration) || 0;
        if (durationSec < 75) continue;

        const title = decodeHtmlEntities(item.name || '');
        const artistList =
          item.artists?.primary?.map((a) => decodeHtmlEntities(a.name)).filter(Boolean) || [];
        const artist = artistList.join(', ') || 'Featured Artist';

        const downloads = Array.isArray(item.downloadUrl) ? item.downloadUrl : [];
        const bestStream =
          downloads.find((d) => d.quality === '320kbps')?.url ||
          downloads.find((d) => d.quality === '160kbps')?.url ||
          downloads[downloads.length - 1]?.url ||
          null;
        if (!bestStream) continue;

        const images = Array.isArray(item.image) ? item.image : [];
        const hiResImg =
          images.find((im) => im.quality === '500x500')?.url ||
          images[images.length - 1]?.url ||
          null;
        const thumbImg =
          images.find((im) => im.quality === '150x150')?.url || hiResImg;

        tracks.push({
          id: `saavn-${item.id}`,
          title,
          artist,
          album: decodeHtmlEntities(item.album?.name || ''),
          coverUrl: hiResImg,
          thumbUrl: thumbImg,
          streamUrl: bestStream,
          youtubeId: null,
          backupYoutubeIds: [],
          durationSec,
          fullTrackDurationSec: durationSec,
          sourceType: 'online',
          accentColor: ACCENT_PALETTE[tracks.length % ACCENT_PALETTE.length],
        });
      }
    }

    if (tracks.length === 0 && itunesRes.status === 'fulfilled' && itunesRes.value.ok) {
      const itData = await itunesRes.value.json();
      const itResults = Array.isArray(itData?.results) ? itData.results : [];
      for (let i = 0; i < itResults.length; i++) {
        const it = itResults[i];
        if (!it.previewUrl) continue;
        const hiRes = (it.artworkUrl100 || '').replace('100x100bb', '600x600bb');
        tracks.push({
          id: `itunes-${it.trackId || i}`,
          title: it.trackName || 'Track',
          artist: it.artistName || 'Artist',
          album: it.collectionName || '',
          coverUrl: hiRes || it.artworkUrl100,
          thumbUrl: it.artworkUrl100,
          streamUrl: it.previewUrl,
          youtubeId: null,
          backupYoutubeIds: [],
          durationSec: Math.round((it.trackTimeMillis || 180000) / 1000),
          sourceType: 'online',
          accentColor: ACCENT_PALETTE[tracks.length % ACCENT_PALETTE.length],
        });
      }
    }

    return {
      ok: true,
      query,
      results: tracks.slice(0, 16),
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.message || 'Search unavailable',
      results: [],
    };
  }
}

/**
 * Parses a YouTube or Spotify URL directly in the browser.
 */
function parseMediaUrlClient(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  const spotifyUriMatch = trimmed.match(/^spotify:(track|album|playlist):([a-zA-Z0-9]+)/i);
  if (spotifyUriMatch) {
    return {
      platform: 'spotify',
      spotifyType: spotifyUriMatch[1].toLowerCase(),
      id: spotifyUriMatch[2],
    };
  }

  let urlObj;
  try {
    urlObj = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  const host = urlObj.hostname.replace(/^www\./, '').toLowerCase();
  if (
    host === 'youtube.com' ||
    host === 'm.youtube.com' ||
    host === 'music.youtube.com' ||
    host === 'youtu.be'
  ) {
    let videoId = null;
    if (host === 'youtu.be') {
      videoId = urlObj.pathname.split('/').filter(Boolean)[0];
    } else if (urlObj.searchParams.get('v')) {
      videoId = urlObj.searchParams.get('v');
    } else {
      const parts = urlObj.pathname.split('/').filter(Boolean);
      if ((parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'v') && parts[1]) {
        videoId = parts[1];
      }
    }
    if (videoId && /^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) {
      return { platform: 'youtube', id: videoId };
    }
  }

  if (host.endsWith('spotify.com')) {
    const parts = urlObj.pathname
      .split('/')
      .filter(Boolean)
      .filter((p) => !p.startsWith('intl-'));
    const idx = parts[0] === 'embed' ? 1 : 0;
    const type = parts[idx];
    const id = parts[idx + 1];
    if ((type === 'track' || type === 'album' || type === 'playlist') && id) {
      return { platform: 'spotify', spotifyType: type, id };
    }
  }

  return null;
}

/**
 * Resolves a YouTube or Spotify URL with automatic client-side fallback for GitHub Pages.
 */
export async function resolveMediaUrlWithFallback(rawUrl) {
  const urlStr = (rawUrl || '').trim();
  if (!urlStr) return { ok: false, error: 'Empty URL' };

  // 1. Try Next.js API route first
  try {
    const res = await fetch(`/api/media-resolve?url=${encodeURIComponent(urlStr)}`);
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (data && data.ok) return data;
      }
    }
  } catch {
    // Fall through to client-side resolution
  }

  // 2. Client-side resolution for static hosting (GitHub Pages)
  const parsed = parseMediaUrlClient(urlStr);
  if (!parsed) {
    return { ok: false, error: 'Please enter a valid YouTube or Spotify song link.' };
  }

  if (parsed.platform === 'youtube') {
    const videoId = parsed.id;
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let title = 'YouTube Track';
    let artist = 'YouTube Music';
    let coverUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedRes = await fetch(
        `https://noembed.com/embed?url=${encodeURIComponent(canonicalUrl)}`
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        if (data.title) title = data.title;
        if (data.author_name) artist = data.author_name.replace(/\s*-\s*Topic$/i, '').trim();
        if (data.thumbnail_url) coverUrl = data.thumbnail_url;
      }
    } catch {
      // Keep default thumbnail
    }

    let audioPreviewUrl = null;
    try {
      const searchData = await searchOnlineSongsClientFallback(`${title} ${artist}`);
      const streamHit = searchData?.results?.find((r) => r.streamUrl);
      if (streamHit?.streamUrl) {
        audioPreviewUrl = streamHit.streamUrl;
      }
    } catch {
      // Optional stream enrichment
    }

    return {
      ok: true,
      platform: 'youtube',
      id: videoId,
      videoId,
      backupYoutubeIds: [],
      title,
      artist,
      coverUrl,
      audioPreviewUrl,
      externalUrl: canonicalUrl,
    };
  }

  if (parsed.platform === 'spotify') {
    const { spotifyType, id } = parsed;
    const canonicalUrl = `https://open.spotify.com/${spotifyType}/${id}`;
    let title = 'Spotify Track';
    let artist = 'Spotify Artist';
    let coverUrl = null;

    try {
      const oembedRes = await fetch(
        `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`
      );
      if (oembedRes.ok) {
        const data = await oembedRes.json();
        if (data.title) title = data.title;
        if (data.thumbnail_url) coverUrl = data.thumbnail_url;
      }
    } catch {
      // Ignore
    }

    let audioPreviewUrl = null;
    if (title !== 'Spotify Track') {
      try {
        const searchData = await searchOnlineSongsClientFallback(title);
        const topHit = searchData?.results?.[0];
        if (topHit?.streamUrl) {
          audioPreviewUrl = topHit.streamUrl;
          if (topHit.artist && artist === 'Spotify Artist') {
            artist = topHit.artist;
          }
        }
      } catch {
        // Ignore
      }
    }

    return {
      ok: true,
      platform: 'spotify',
      spotifyType,
      id,
      spotifyId: id,
      videoId: null,
      backupYoutubeIds: [],
      title,
      artist,
      coverUrl,
      audioPreviewUrl,
      externalUrl: canonicalUrl,
    };
  }

  return { ok: false, error: 'Unsupported link format.' };
}

/**
 * Loads an external image URL into an HTMLImageElement, trying `/api/music-search?cover=...` first
 * and falling back to direct `crossOrigin = 'anonymous'` loading on GitHub Pages.
 */
export async function loadCoverImageWithFallback(rawCoverUrl) {
  if (!rawCoverUrl || typeof window === 'undefined') {
    return { img: null, resolvedUrl: null, compressedDataUrl: null };
  }

  let resolvedUrl = rawCoverUrl;
  if (!rawCoverUrl.startsWith('data:')) {
    try {
      const proxyRes = await fetch(`/api/music-search?cover=${encodeURIComponent(rawCoverUrl)}`);
      if (proxyRes.ok) {
        const contentType = proxyRes.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const proxyData = await proxyRes.json();
          if (proxyData?.ok && proxyData.coverDataUrl) {
            resolvedUrl = proxyData.coverDataUrl;
          }
        }
      }
    } catch {
      // Fallback to direct image load on static host
    }
  }

  const img = await new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = resolvedUrl;
  });

  const compressedDataUrl = img ? compressImageToDataUrl(img, 240, 0.82) : null;
  return {
    img,
    resolvedUrl: compressedDataUrl || resolvedUrl,
    compressedDataUrl,
  };
}
