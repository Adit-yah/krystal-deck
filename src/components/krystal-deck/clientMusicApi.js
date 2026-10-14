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
function resolveItunesSubQueries(rawQuery) {
  const q = (rawQuery || '').trim();
  const lower = q.toLowerCase().replace(/\s+/g, ' ');

  if (
    !q ||
    lower === 'the weeknd daft punk dua lipa' ||
    /^(global\s*pop|pop(\s*hits|\s*songs|\s*music)?|english\s*(pop|hits|songs)|famous(\s*songs|\s*hits)?|popular(\s*songs|\s*hits)?|top(\s*hits|\s*songs)?|trending(\s*songs|\s*hits)?|billboard(\s*hits|\s*hot\s*100)?|global(\s*hits|\s*songs)?|viral(\s*hits|\s*songs)?)$/i.test(
      lower
    )
  ) {
    return [
      'The Weeknd',
      'Bruno Mars',
      'Dua Lipa',
      'Billie Eilish',
      'Sabrina Carpenter',
      'Taylor Swift',
      'Post Malone',
      'Ariana Grande',
    ];
  }
  if (
    /^(r&b|rnb|r\s*&\s*b|r\s*and\s*b|soul)(\s*(hits|songs|music|mix|classics))?$/i.test(
      lower
    ) ||
    lower.includes('r&b') ||
    lower.includes('rnb')
  ) {
    return [
      'The Weeknd',
      'SZA',
      'Bruno Mars',
      'Rihanna',
      'Frank Ocean',
      'Chris Brown',
      'Daniel Caesar',
      'Usher',
    ];
  }
  if (
    /^(synthwave|retro|outrun|cyberpunk|vaporwave)(\s*(hits|songs|music|mix))?$/i.test(
      lower
    )
  ) {
    return ['The Weeknd', 'Daft Punk', 'Kavinsky', 'M83', 'Empire of the Sun'];
  }
  if (
    /^(80s|90s|2000s|00s|classics|retro\s*hits)(\s*(hits|songs|music|pop|rock|classics))?$/i.test(
      lower
    )
  ) {
    return ['Michael Jackson', 'Prince', 'Tears for Fears', 'a-ha', 'Queen', 'Backstreet Boys'];
  }
  if (
    /^(indie|chill|alternative|dream\s*pop|lofi|lo-fi|bedroom\s*pop)(\s*(hits|songs|music|mix|vibes))?$/i.test(
      lower
    )
  ) {
    return [
      'Tame Impala',
      'Arctic Monkeys',
      'The Neighbourhood',
      'Lana Del Rey',
      'Glass Animals',
      'Cigarettes After Sex',
    ];
  }
  if (
    /^(hip\s*hop|hip-hop|hiphop|rap|trap)(\s*(hits|songs|music|mix|bangers))?$/i.test(
      lower
    )
  ) {
    return [
      'Travis Scott',
      'Kendrick Lamar',
      'Drake',
      'Post Malone',
      'Metro Boomin',
      'Future',
      'Eminem',
      'Kanye West',
    ];
  }
  if (/^(rock|classic\s*rock|alt\s*rock|metal)(\s*(hits|songs|music|classics))?$/i.test(lower)) {
    return ['Linkin Park', 'Queen', 'Nirvana', 'Coldplay', 'Imagine Dragons', 'Arctic Monkeys'];
  }
  if (
    /^(edm|electronic|house|dance|techno|club)(\s*(hits|songs|music|mix))?$/i.test(
      lower
    )
  ) {
    return ['Daft Punk', 'Calvin Harris', 'Avicii', 'Fred again', 'Zedd', 'David Guetta'];
  }
  if (/^(kpop|k-pop|korean)(\s*(hits|songs|music|pop))?$/i.test(lower)) {
    return ['BTS', 'BLACKPINK', 'NewJeans', 'Jungkook', 'ROSÉ', 'Stray Kids'];
  }
  if (/^(latin|reggaeton|spanish)(\s*(hits|songs|music|pop))?$/i.test(lower)) {
    return ['Bad Bunny', 'Karol G', 'Peso Pluma', 'Shakira', 'Feid', 'Rauw Alejandro'];
  }
  if (/^(afro|afrobeats|afrobeat)(\s*(hits|songs|music))?$/i.test(lower)) {
    return ['Burna Boy', 'Rema', 'Tems', 'Wizkid', 'Ayra Starr', 'Asake'];
  }
  if (/^(punjabi|desi|bhangra)(\s*(hits|songs|music))?$/i.test(lower)) {
    return ['Diljit Dosanjh', 'Karan Aujla', 'AP Dhillon', 'Shubh', 'Sidhu Moose Wala'];
  }
  if (/^(bollywood|hindi|indian)(\s*(hits|songs|music|pop))?$/i.test(lower)) {
    return ['Arijit Singh', 'Pritam', 'Atif Aslam', 'Shreya Ghoshal', 'AR Rahman', 'KK'];
  }

  const cleaned = q
    .replace(/\b(hits|hit|songs|song|tracks|track|music|playlist|mix|top|best|popular|famous|global)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [cleaned.length >= 2 ? cleaned : q];
}

function normalizeClientTitleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[（\[]/g, '(')
    .replace(/[）\]]/g, ')')
    .replace(/\s*\((?!.*?\bremix\b).*?\)\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clientArtistsOverlap(a = '', b = '') {
  const clean = (s) =>
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !['the', 'and', 'feat', 'ft', 'with', 'music', 'official'].includes(w)
      );
  const wordsA = clean(a);
  const wordsB = clean(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  return wordsA.some((w) => wordsB.includes(w));
}

function isFakeCoverOrInstrumentalClient(item, title, artist, album, hiResImg, rawQuery) {
  const lang = String(item?.language || '').toLowerCase();
  const qLower = String(rawQuery || '').toLowerCase();
  if (lang === 'instrumental' && !qLower.includes('instrumental')) return true;
  if (
    hiResImg &&
    hiResImg.toLowerCase().includes('-instrumental-') &&
    !qLower.includes('instrumental')
  ) {
    return true;
  }
  const normTitle = String(title || '').replace(/[（]/g, '(').replace(/[）]/g, ')');
  const combined = `${normTitle} ${artist} ${album} ${item?.label || ''}`.toLowerCase();
  const badPhrases = [
    'karaoke',
    'kidz bop',
    'originally performed',
    'originally perfomed',
    'made famous by',
    'in the style of',
    '8-bit',
    'ringtone',
    'tribute to',
    'covers culture',
    'pop covers',
    'piano instrumental',
    'lullaby version',
    'salsa version',
    'salsa versión',
    'bachata version',
    'ukulele bros',
    'sound tower',
    'sunset roses',
    'caletta remixes',
    'sell your music',
    'tallions',
    'hafizur rahman',
    '7thcloud',
  ];
  for (const phrase of badPhrases) {
    if (combined.includes(phrase)) return true;
  }
  if (
    !qLower.includes('cover') &&
    (/\bcover\b/i.test(artist) ||
      /\bcover\b/i.test(album) ||
      /\((?:[^)]*\bcover\b[^)]*)\)/i.test(normTitle) ||
      /\[(?:[^\]]*\bcover\b[^\]]*)\]/i.test(normTitle))
  ) {
    return true;
  }
  const remixTags = ['nightcore', 'hardstyle', 'ambient version', 'slowed', 'sped up', 'lofi flip', 'cover.lofi'];
  for (const tag of remixTags) {
    if (combined.includes(tag) && !qLower.includes(tag)) return true;
  }
  return false;
}

async function fetchSingleItunesClient(term, limit = 15) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

async function fetchItunesCatalogClient(rawQuery) {
  const subQueries = resolveItunesSubQueries(rawQuery);
  if (subQueries.length > 1) {
    const buckets = await Promise.all(
      subQueries.map((sq) => fetchSingleItunesClient(sq, 5))
    );
    const interleaved = [];
    const seenTitleKeys = new Set();
    const maxLen = Math.max(...buckets.map((b) => b.length), 0);
    for (let row = 0; row < maxLen; row++) {
      for (let col = 0; col < buckets.length; col++) {
        const it = buckets[col][row];
        if (!it || !it.previewUrl) continue;
        if (
          isFakeCoverOrInstrumentalClient(
            null,
            it.trackName,
            it.artistName,
            it.collectionName,
            it.artworkUrl100,
            rawQuery
          )
        ) {
          continue;
        }
        const titleKey = normalizeClientTitleKey(it.trackName);
        if (!titleKey || seenTitleKeys.has(titleKey)) continue;
        seenTitleKeys.add(titleKey);
        interleaved.push(it);
      }
    }
    return interleaved;
  }

  const primaryTerm = subQueries[0] || rawQuery || 'The Weeknd';
  const rawList = await fetchSingleItunesClient(primaryTerm, 20);
  const deduped = [];
  const seenTitleKeys = new Set();

  for (const it of rawList) {
    if (!it || !it.previewUrl) continue;
    if (
      isFakeCoverOrInstrumentalClient(
        null,
        it.trackName,
        it.artistName,
        it.collectionName,
        it.artworkUrl100,
        rawQuery
      )
    ) {
      continue;
    }
    const titleKey = normalizeClientTitleKey(it.trackName);
    if (!titleKey || seenTitleKeys.has(titleKey)) continue;
    seenTitleKeys.add(titleKey);
    deduped.push(it);
  }

  if (deduped.length > 0 && deduped.length < 6) {
    const topArtistRaw = deduped[0].artistName || '';
    const artistParts = topArtistRaw
      .split(/[,&]|feat\.|ft\./i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(0, 2);

    if (artistParts.length > 0) {
      const extraBuckets = await Promise.all(
        artistParts.map((ap) => fetchSingleItunesClient(ap, 8))
      );
      for (const bucket of extraBuckets) {
        for (const it of bucket) {
          if (!it || !it.previewUrl) continue;
          if (
            isFakeCoverOrInstrumentalClient(
              null,
              it.trackName,
              it.artistName,
              it.collectionName,
              it.artworkUrl100,
              rawQuery
            )
          ) {
            continue;
          }
          const titleKey = normalizeClientTitleKey(it.trackName);
          if (!titleKey || seenTitleKeys.has(titleKey)) continue;
          seenTitleKeys.add(titleKey);
          deduped.push(it);
        }
      }
    }
  }

  return deduped;
}

async function fetchNeteaseCatalogClient(query, rawQuery) {
  try {
    const res = await fetch(
      `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(query)}&count=12&pages=1`
    );
    if (!res.ok) return [];
    const list = await res.json();
    if (!Array.isArray(list)) return [];

    const tracks = [];
    const seenTitleKeys = new Set();

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const neteaseId = item?.url_id || item?.id;
      if (!neteaseId) continue;

      const title = decodeHtmlEntities(item.name || '').trim();
      const artist = Array.isArray(item.artist)
        ? item.artist.map((a) => decodeHtmlEntities(a)).filter(Boolean).join(', ')
        : decodeHtmlEntities(String(item.artist || 'Featured Artist'));
      const album = decodeHtmlEntities(item.album || '').trim();

      if (
        !title ||
        isFakeCoverOrInstrumentalClient(null, title, artist, album, null, rawQuery)
      ) {
        continue;
      }

      const titleKey = normalizeClientTitleKey(title);
      if (!titleKey || seenTitleKeys.has(titleKey)) continue;
      seenTitleKeys.add(titleKey);

      tracks.push({
        id: `netease-${neteaseId}`,
        neteaseId: String(neteaseId),
        picId: item.pic_id ? String(item.pic_id) : null,
        title,
        artist,
        album,
        coverUrl: null,
        thumbUrl: null,
        streamUrl: `gdstudio:netease:${neteaseId}`,
        youtubeId: null,
        backupYoutubeIds: [],
        durationSec: 215,
        fullTrackDurationSec: 215,
        sourceType: 'online',
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

async function resolveNeteasePicClient(picId) {
  if (!picId) return null;
  try {
    const res = await fetch(
      `https://music-api.gdstudio.xyz/api.php?types=pic&source=netease&id=${encodeURIComponent(picId)}&size=500`
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url && typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * Direct client-side online music search fallback (used automatically on GitHub Pages where `/api/music-search` is static/unavailable).
 */
export async function searchOnlineSongsClientFallback(rawQuery) {
  const subQueries = resolveItunesSubQueries(rawQuery);
  const query = subQueries[0] || rawQuery || 'The Weeknd';
  const allAllowedArtistQuery = subQueries.join(' ');

  // 1. Try Next.js API route first (when running locally or on a Node server)
  try {
    const apiRes = await fetch(`/api/music-search?q=${encodeURIComponent(rawQuery || '')}`);
    if (apiRes.ok) {
      const contentType = apiRes.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const apiData = await apiRes.json();
        if (apiData && apiData.ok && Array.isArray(apiData.results) && apiData.results.length > 0) {
          return apiData;
        }
      }
    }
  } catch {
    // Fall through to direct client-side CORS search (for GitHub Pages!)
  }

  // 2. Direct Client-Side Search via Apple iTunes Search API + NetEase Global 320kbps + JioSaavn API (all support CORS `Access-Control-Allow-Origin: *`)
  try {
    const [itResults, neteaseTracks, saavnRes] = await Promise.all([
      fetchItunesCatalogClient(rawQuery),
      fetchNeteaseCatalogClient(query, rawQuery),
      fetch(`https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=16`).catch(
        () => null
      ),
    ]);

    const itunesTracks = [];
    for (let i = 0; i < itResults.length; i++) {
      const it = itResults[i];
      if (!it.previewUrl) continue;
      const hiRes = (it.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      const fullDurSec = Math.max(90, Math.round((it.trackTimeMillis || 210000) / 1000));
      const trackTitle = it.trackName || 'Track';
      const trackArtist = it.artistName || 'Artist';

      const matchedNetease = neteaseTracks.find(
        (nt) =>
          (normalizeClientTitleKey(nt.title) === normalizeClientTitleKey(trackTitle) ||
            nt.title.toLowerCase().includes(trackTitle.toLowerCase()) ||
            trackTitle.toLowerCase().includes(nt.title.toLowerCase())) &&
          clientArtistsOverlap(nt.artist, trackArtist)
      );

      const streamSpec = matchedNetease
        ? `gdstudio:netease:${matchedNetease.neteaseId}||${it.previewUrl}`
        : `gdstudio:query:${trackTitle} ${trackArtist}||${it.previewUrl}`;

      itunesTracks.push({
        id: `itunes-${it.trackId || i}`,
        title: trackTitle,
        artist: trackArtist,
        album: it.collectionName || '',
        coverUrl: hiRes || it.artworkUrl100,
        thumbUrl: it.artworkUrl100,
        streamUrl: streamSpec,
        youtubeId: null,
        backupYoutubeIds: [],
        durationSec: fullDurSec,
        fullTrackDurationSec: fullDurSec,
        sourceType: 'online',
      });
    }

    const saavnTracks = [];
    if (saavnRes && saavnRes.ok) {
      const json = await saavnRes.json();
      const raw = Array.isArray(json?.data?.results) ? json.data.results : [];
      for (let i = 0; i < raw.length; i++) {
        const item = raw[i];
        const durationSec = Number(item?.duration) || 0;
        if (durationSec < 75) continue;

        const title = decodeHtmlEntities(item.name || '');
        const artistList =
          item.artists?.primary?.map((a) => decodeHtmlEntities(a.name)).filter(Boolean) || [];
        const artist = artistList.join(', ') || 'Featured Artist';
        const album = decodeHtmlEntities(item.album?.name || '');

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

        if (isFakeCoverOrInstrumentalClient(item, title, artist, album, hiResImg, rawQuery)) {
          continue;
        }

        if (
          itunesTracks.length > 0 &&
          !itunesTracks.some((it) => clientArtistsOverlap(artist, it.artist)) &&
          !clientArtistsOverlap(artist, allAllowedArtistQuery)
        ) {
          continue;
        }

        saavnTracks.push({
          id: `saavn-${item.id}`,
          title,
          artist,
          album,
          coverUrl: hiResImg,
          thumbUrl: thumbImg,
          streamUrl: bestStream,
          youtubeId: null,
          backupYoutubeIds: [],
          durationSec,
          fullTrackDurationSec: durationSec,
          sourceType: 'online',
        });
      }
    }

    // Upgrade iTunes tracks to full-length 320kbps Saavn stream whenever BOTH title & artist match
    for (const it of itunesTracks) {
      const matchedSaavn = saavnTracks.find(
        (st) =>
          (st.title.toLowerCase().includes(it.title.toLowerCase()) ||
            it.title.toLowerCase().includes(st.title.toLowerCase())) &&
          clientArtistsOverlap(st.artist, it.artist)
      );
      if (matchedSaavn) {
        it.streamUrl = matchedSaavn.streamUrl;
        it.durationSec = matchedSaavn.durationSec;
        it.id = matchedSaavn.id;
      }
    }

    // Enrich NetEase tracks missing from US iTunes (e.g. Blinding Lights, House of Balloons, FE!N)
    const unmatchedNetease = [];
    for (const nt of neteaseTracks) {
      const alreadyInItunes = itunesTracks.some(
        (it) =>
          normalizeClientTitleKey(it.title) === normalizeClientTitleKey(nt.title) &&
          clientArtistsOverlap(it.artist, nt.artist)
      );
      if (alreadyInItunes) continue;

      const sameArtistItunes = itResults.find(
        (it) =>
          it.artworkUrl100 &&
          clientArtistsOverlap(nt.artist, it.artistName || '') &&
          (!nt.album ||
            (it.collectionName || '').toLowerCase().includes(nt.album.toLowerCase()) ||
            nt.album.toLowerCase().includes((it.collectionName || '').toLowerCase()))
      );
      if (sameArtistItunes?.artworkUrl100) {
        nt.coverUrl = sameArtistItunes.artworkUrl100.replace('100x100bb', '600x600bb');
        nt.thumbUrl = sameArtistItunes.artworkUrl100;
      }
      if (sameArtistItunes?.previewUrl) {
        nt.streamUrl = `gdstudio:netease:${nt.neteaseId}||${sameArtistItunes.previewUrl}`;
      }
      unmatchedNetease.push(nt);
    }

    const needsPicResolve = unmatchedNetease.filter((nt) => !nt.coverUrl && nt.picId).slice(0, 4);
    if (needsPicResolve.length > 0) {
      await Promise.all(
        needsPicResolve.map(async (nt) => {
          const picUrl = await resolveNeteasePicClient(nt.picId);
          if (picUrl) {
            nt.coverUrl = picUrl;
            nt.thumbUrl = picUrl;
          }
        })
      );
    }

    // Combine official iTunes + NetEase + verified Saavn tracks without duplicates
    const combined = [];
    const seenKeys = new Set();
    const titleCounts = new Map();
    for (const item of [...itunesTracks, ...unmatchedNetease, ...saavnTracks]) {
      const titleKey = normalizeClientTitleKey(item.title);
      const artistKey = item.artist
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .slice(0, 12);
      const pairKey = `${titleKey}|${artistKey}`;
      const curCount = titleCounts.get(titleKey) || 0;
      if (!seenKeys.has(pairKey) && curCount < 2) {
        seenKeys.add(pairKey);
        titleCounts.set(titleKey, curCount + 1);
        combined.push(item);
      }
    }

    const isSpecificQuery = subQueries.length === 1 && Boolean(rawQuery);
    const qNorm = isSpecificQuery ? normalizeClientTitleKey(query) : '';
    combined.sort((a, b) => {
      if (qNorm.length >= 2) {
        const aExactTitle = normalizeClientTitleKey(a.title).includes(qNorm);
        const bExactTitle = normalizeClientTitleKey(b.title).includes(qNorm);
        if (aExactTitle !== bExactTitle) return aExactTitle ? -1 : 1;

        if (aExactTitle && bExactTitle && !qNorm.includes('remix')) {
          const aIsRemix = /\bremix\b/i.test(a.title);
          const bIsRemix = /\bremix\b/i.test(b.title);
          if (aIsRemix !== bIsRemix) return aIsRemix ? 1 : -1;
        }
      }

      const aMatch =
        clientArtistsOverlap(a.artist, allAllowedArtistQuery) ||
        a.title.toLowerCase().includes((rawQuery || '').toLowerCase().trim());
      const bMatch =
        clientArtistsOverlap(b.artist, allAllowedArtistQuery) ||
        b.title.toLowerCase().includes((rawQuery || '').toLowerCase().trim());
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return 0;
    });

    const finalResults = combined.slice(0, 24).map((item, idx) => ({
      ...item,
      accentColor: ACCENT_PALETTE[idx % ACCENT_PALETTE.length],
    }));

    return {
      ok: true,
      query: rawQuery || query,
      results: finalResults,
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
