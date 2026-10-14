import { NextResponse } from 'next/server';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseDurationToSeconds(durationText) {
  if (!durationText || typeof durationText !== 'string') return 210;
  const parts = durationText.split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return 210;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 210;
}

function cleanYouTubeTitleAndArtist(rawTitle, channelName) {
  let cleaned = decodeHtmlEntities(rawTitle || '')
    // Remove anything after a pipe '|' (e.g. "| trending | @channel")
    .replace(/\s*\|.*$/g, '')
    // Remove parenthetical or bracketed tags containing official, lyric, video, audio, original, visualizer, hd, 4k, remastered, full song, etc.
    .replace(
      /\s*\((?:[^)]*\b(?:official|lyric|lyrics|video|audio|original|visualizer|hd|hq|4k|remastered|mv|full\s*song|music\s*video)\b[^)]*)\)/gi,
      ''
    )
    .replace(
      /\s*\[(?:[^\]]*\b(?:official|lyric|lyrics|video|audio|original|visualizer|hd|hq|4k|remastered|mv|full\s*song|music\s*video)\b[^\]]*)\]/gi,
      ''
    )
    .replace(/\s+-\s+(?:official\s*(?:music\s*|lyric\s*)?video|lyrics?|audio)$/gi, '')
    .trim();

  const cleanedChannel = decodeHtmlEntities(channelName || '')
    .replace(/\s*-\s*Topic$/i, '')
    .replace(/VEVO$/i, '')
    .trim();

  const sepMatch = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (sepMatch) {
    const left = sepMatch[1].trim();
    const right = sepMatch[2].trim().replace(/^["']|["']$/g, '');
    // If right side is just "Lyrics" or "Audio", keep left as title
    if (/^(?:lyrics?|official\s*audio|audio)$/i.test(right)) {
      return {
        title: left,
        artist: cleanedChannel || 'Featured Artist',
      };
    }
    return {
      artist: left,
      title: right,
    };
  }
  return {
    title: cleaned || 'Full Track',
    artist: cleanedChannel || 'Featured Artist',
  };
}

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

  // Strip trailing/leading generic filler words like "hits", "songs", "best", "top" so iTunes matches studio albums
  const cleaned = q
    .replace(/\b(hits|hit|songs|song|tracks|track|music|playlist|mix|top|best|popular|famous|global)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [cleaned.length >= 2 ? cleaned : q];
}

function expandCategorySearchQuery(rawQuery) {
  const subs = resolveItunesSubQueries(rawQuery);
  return subs[0] || rawQuery || 'The Weeknd';
}

function normalizeSongTitleKey(title = '') {
  return String(title)
    .toLowerCase()
    .replace(/[（\[]/g, '(')
    .replace(/[）\]]/g, ')')
    .replace(/\s*\((?!.*?\bremix\b).*?\)\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isKaraokeOrCoverFake(
  name = '',
  artistStr = '',
  label = '',
  rawQuery = '',
  language = '',
  hiResImg = ''
) {
  const normName = String(name).replace(/[（]/g, '(').replace(/[）]/g, ')');
  const combined = `${normName} ${artistStr} ${label}`.toLowerCase();
  const qLower = (rawQuery || '').toLowerCase();
  if (
    String(language).toLowerCase() === 'instrumental' &&
    !qLower.includes('instrumental')
  ) {
    return true;
  }
  if (
    hiResImg &&
    String(hiResImg).toLowerCase().includes('-instrumental-') &&
    !qLower.includes('instrumental')
  ) {
    return true;
  }
  if (
    combined.includes('karaoke') ||
    combined.includes('kidz bop') ||
    combined.includes('originally performed') ||
    combined.includes('originally perfomed') ||
    combined.includes('made famous by') ||
    combined.includes('in the style of') ||
    combined.includes('8-bit') ||
    combined.includes('ringtone') ||
    combined.includes('tribute to') ||
    combined.includes('covers culture') ||
    combined.includes('pop covers') ||
    combined.includes('piano instrumental') ||
    combined.includes('lullaby version') ||
    combined.includes('salsa version') ||
    combined.includes('salsa versión') ||
    combined.includes('bachata version') ||
    combined.includes('ukulele bros') ||
    combined.includes('sound tower') ||
    combined.includes('sunset roses') ||
    combined.includes('caletta remixes') ||
    combined.includes('sell your music') ||
    combined.includes('tallions') ||
    combined.includes('hafizur rahman') ||
    combined.includes('7thcloud') ||
    (!qLower.includes('cover') &&
      (/\bcover\b/i.test(artistStr) ||
        /\bcover\b/i.test(label) ||
        /\((?:[^)]*\bcover\b[^)]*)\)/i.test(normName) ||
        /\[(?:[^\]]*\bcover\b[^\]]*)\]/i.test(normName)))
  ) {
    return true;
  }
  const remixTags = ['nightcore', 'hardstyle', 'ambient version', 'slowed', 'sped up', 'lofi flip', 'cover.lofi'];
  for (const tag of remixTags) {
    if (combined.includes(tag) && !qLower.includes(tag)) {
      return true;
    }
  }
  return false;
}

function artistsOverlap(a = '', b = '') {
  const clean = (s) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !['the', 'and', 'feat', 'ft', 'with', 'music', 'official'].includes(w));
  const wordsA = clean(a);
  const wordsB = clean(b);
  if (wordsA.length === 0 || wordsB.length === 0) return false;
  return wordsA.some((w) => wordsB.includes(w));
}

async function fetchImageAsDataUrl(imgUrl) {
  if (!imgUrl) return null;
  try {
    const res = await fetch(imgUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${contentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

/**
 * 1. Fetch Full-Length 320kbps MP4/AAC Direct Streams from JioSaavn API
 */
async function searchSaavnFullTracks(query) {
  try {
    const res = await fetch(
      `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=14`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) return [];
    const json = await res.json();
    const raw = Array.isArray(json?.data?.results) ? json.data.results : [];

    const tracks = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      const durationSec = Number(item?.duration) || 0;
      if (durationSec < 75) continue; // Skip short clips/ringtones

      const title = decodeHtmlEntities(item.name || '');
      const artistList =
        item.artists?.primary?.map((a) => decodeHtmlEntities(a.name)).filter(Boolean) || [];
      const artist = artistList.join(', ') || 'Featured Artist';
      const album = decodeHtmlEntities(item.album?.name || '');

      const images = Array.isArray(item.image) ? item.image : [];
      const hiResImg =
        images.find((im) => im.quality === '500x500')?.url ||
        images[images.length - 1]?.url ||
        null;
      const thumbImg =
        images.find((im) => im.quality === '150x150')?.url || hiResImg;

      if (
        isKaraokeOrCoverFake(
          title,
          artist,
          `${item.label || ''} ${album}`,
          query,
          item.language,
          hiResImg
        )
      ) {
        continue;
      }

      const downloads = Array.isArray(item.downloadUrl) ? item.downloadUrl : [];
      const bestStream =
        downloads.find((d) => d.quality === '320kbps')?.url ||
        downloads.find((d) => d.quality === '160kbps')?.url ||
        downloads[downloads.length - 1]?.url ||
        null;

      if (!bestStream) continue;

      tracks.push({
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
        sourceType: 'online', // Direct full-length 320kbps AAC/MP4 stream!
      });
    }
    return tracks;
  } catch {
    return [];
  }
}

/**
 * 2. Search YouTube for Full-Length Audio / Lyric Tracks (3–6 min full songs)
 */
async function searchYouTubeFullTracks(query) {
  try {
    const searchQ = `${query} lyrics audio`;
    const res = await fetch(
      `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQ)}`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(/var ytInitialData = (\{[\s\S]*?\});<\/script>/);
    if (!match || !match[1]) return [];

    const data = JSON.parse(match[1]);
    const sectionList =
      data?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents || [];

    const rawVideos = [];
    for (const sec of sectionList) {
      const items = sec?.itemSectionRenderer?.contents || [];
      for (const it of items) {
        if (it?.videoRenderer?.videoId) {
          rawVideos.push(it.videoRenderer);
        }
      }
    }

    const parsedVideos = [];
    for (const v of rawVideos) {
      const videoId = v.videoId;
      const rawTitle = v.title?.runs?.[0]?.text || '';
      const channelName = v.ownerText?.runs?.[0]?.text || '';
      const durationText = v.lengthText?.simpleText || '';
      if (!durationText) continue; // Skip live streams

      const durationSec = parseDurationToSeconds(durationText);
      // Keep full-length songs (between 1m15s and 10m00s)
      if (durationSec < 75 || durationSec > 600) continue;

      const lowerRaw = rawTitle.toLowerCase();
      const isEmbedFriendlyLyricOrAudio =
        lowerRaw.includes('lyric') ||
        lowerRaw.includes('audio') ||
        channelName.toLowerCase().includes('7clouds') ||
        channelName.toLowerCase().includes('topic');

      const { title, artist } = cleanYouTubeTitleAndArtist(rawTitle, channelName);
      const thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      parsedVideos.push({
        videoId,
        rawTitle,
        title,
        artist,
        durationSec,
        thumbUrl,
        isEmbedFriendlyLyricOrAudio,
      });
    }

    // Sort embed-friendly Lyric/Audio uploads ahead of Official Music Videos so YT.Player never hits VEVO Error 150
    parsedVideos.sort((a, b) => {
      if (a.isEmbedFriendlyLyricOrAudio !== b.isEmbedFriendlyLyricOrAudio) {
        return a.isEmbedFriendlyLyricOrAudio ? -1 : 1;
      }
      return 0;
    });

    const allIds = parsedVideos.map((v) => v.videoId);

    return parsedVideos.slice(0, 10).map((v) => ({
      id: `yt-${v.videoId}`,
      title: v.title,
      artist: v.artist,
      album: 'Full Track · YouTube Audio',
      coverUrl: v.thumbUrl,
      thumbUrl: v.thumbUrl,
      streamUrl: null,
      youtubeId: v.videoId,
      backupYoutubeIds: allIds.filter((id) => id !== v.videoId).slice(0, 4),
      durationSec: v.durationSec,
      fullTrackDurationSec: v.durationSec,
      sourceType: 'youtube',
    }));
  } catch {
    return [];
  }
}

/**
 * 3. Fetch Official Apple Music / iTunes Catalog (100% Ad-Free Direct AAC Streams + 600x600 Studio Art)
 */
async function fetchSingleItunesQuery(term, limit = 15) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&limit=${limit}`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

async function fetchItunesCatalogLookup(rawQuery) {
  const subQueries = resolveItunesSubQueries(rawQuery);

  if (subQueries.length > 1) {
    const buckets = await Promise.all(
      subQueries.map((sq) => fetchSingleItunesQuery(sq, 5))
    );
    const interleaved = [];
    const seenTitleKeys = new Set();
    const maxLen = Math.max(...buckets.map((b) => b.length), 0);
    for (let row = 0; row < maxLen; row++) {
      for (let col = 0; col < buckets.length; col++) {
        const it = buckets[col][row];
        if (!it || !it.previewUrl) continue;
        if (
          isKaraokeOrCoverFake(
            it.trackName,
            it.artistName,
            it.collectionName,
            rawQuery
          )
        ) {
          continue;
        }
        const titleKey = normalizeSongTitleKey(it.trackName);
        if (!titleKey || seenTitleKeys.has(titleKey)) continue;
        seenTitleKeys.add(titleKey);
        interleaved.push(it);
      }
    }
    return interleaved;
  }

  const primaryTerm = subQueries[0] || rawQuery || 'The Weeknd';
  const rawList = await fetchSingleItunesQuery(primaryTerm, 20);
  const deduped = [];
  const seenTitleKeys = new Set();

  for (const it of rawList) {
    if (!it || !it.previewUrl) continue;
    if (
      isKaraokeOrCoverFake(
        it.trackName,
        it.artistName,
        it.collectionName,
        rawQuery
      )
    ) {
      continue;
    }
    const titleKey = normalizeSongTitleKey(it.trackName);
    if (!titleKey || seenTitleKeys.has(titleKey)) continue;
    seenTitleKeys.add(titleKey);
    deduped.push(it);
  }

  // If the user searched a specific song title (like "Die With A Smile") and title-deduplication
  // stripped out cover versions leaving < 6 unique tracks, backfill with official hits by the primary artist!
  if (deduped.length > 0 && deduped.length < 6) {
    const topArtistRaw = deduped[0].artistName || '';
    const artistParts = topArtistRaw
      .split(/[,&]|feat\.|ft\./i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2)
      .slice(0, 2);

    if (artistParts.length > 0) {
      const extraBuckets = await Promise.all(
        artistParts.map((ap) => fetchSingleItunesQuery(ap, 8))
      );
      for (const bucket of extraBuckets) {
        for (const it of bucket) {
          if (!it || !it.previewUrl) continue;
          if (
            isKaraokeOrCoverFake(
              it.trackName,
              it.artistName,
              it.collectionName,
              rawQuery
            )
          ) {
            continue;
          }
          const titleKey = normalizeSongTitleKey(it.trackName);
          if (!titleKey || seenTitleKeys.has(titleKey)) continue;
          seenTitleKeys.add(titleKey);
          deduped.push(it);
        }
      }
    }
  }

  return deduped;
}

/**
 * 4. Fetch Global Full-Length 320kbps Catalog from NetEase (`music-api.gdstudio.xyz`)
 * Covers songs missing from US iTunes slices (e.g., Blinding Lights, House of Balloons, FE!N, Timeless)
 * and pre-populates exact `gdstudio:netease:<id>` stream specs for instant 320kbps playback.
 */
async function searchNeteaseFullTracks(query, rawQuery) {
  try {
    const res = await fetch(
      `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(query)}&count=12&pages=1`,
      { headers: { 'User-Agent': USER_AGENT } }
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

      if (!title || isKaraokeOrCoverFake(title, artist, album, rawQuery)) {
        continue;
      }

      const titleKey = normalizeSongTitleKey(title);
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

async function resolveNeteasePicUrl(picId) {
  if (!picId) return null;
  try {
    const res = await fetch(
      `https://music-api.gdstudio.xyz/api.php?types=pic&source=netease&id=${encodeURIComponent(picId)}&size=500`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.url && typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/music-search?q=<search query>
 * Returns 100% AD-FREE full-length 320kbps audio streams by combining:
 * 1. Official Apple Music / iTunes catalog upgraded to full-length 320kbps streams
 * 2. NetEase global catalog (captures tracks missing from regional iTunes slices)
 * 3. Verified JioSaavn 320kbps full-length streams
 * 4. Enriched YouTube tracks upgraded to full-length 320kbps streams
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  // 1. Convert an external album artwork URL to a CORS-safe Base64 Data URL for 3D Cassette CanvasTexture
  const coverToFetch = searchParams.get('cover');
  if (coverToFetch) {
    const dataUrl = await fetchImageAsDataUrl(coverToFetch);
    return NextResponse.json({
      ok: Boolean(dataUrl),
      coverDataUrl: dataUrl || coverToFetch,
    });
  }

  // 1B. Optional Same-Origin Audio Stream Proxy (?stream=<audioUrl>)
  const streamToProxy = searchParams.get('stream');
  if (streamToProxy) {
    try {
      const upstream = await fetch(streamToProxy, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!upstream.ok) {
        return new NextResponse('Upstream audio unavailable', { status: 502 });
      }
      const contentType = upstream.headers.get('content-type') || 'audio/mp4';
      const arrayBuf = await upstream.arrayBuffer();
      return new NextResponse(arrayBuf, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=3600',
          'Accept-Ranges': 'bytes',
        },
      });
    } catch {
      return new NextResponse('Stream proxy error', { status: 500 });
    }
  }

  // 2. Search Online Songs
  const rawQuery = (searchParams.get('q') || '').trim();
  const subQueries = resolveItunesSubQueries(rawQuery);
  const query = subQueries[0] || rawQuery || 'The Weeknd';

  try {
    const [rawSaavnTracks, ytTracks, itunesMeta, neteaseTracks] = await Promise.all([
      searchSaavnFullTracks(query),
      searchYouTubeFullTracks(query),
      fetchItunesCatalogLookup(rawQuery),
      searchNeteaseFullTracks(query, rawQuery),
    ]);

    // Convert official iTunes catalog entries into first-class ad-free full-length playable tracks
    const itunesTracks = [];
    for (let i = 0; i < itunesMeta.length; i++) {
      const it = itunesMeta[i];
      if (!it.previewUrl) continue;
      const hiRes = (it.artworkUrl100 || '').replace('100x100bb', '600x600bb');
      const fullDurSec = Math.max(90, Math.round((it.trackTimeMillis || 210000) / 1000));
      const trackTitle = it.trackName || 'Track';
      const trackArtist = it.artistName || 'Artist';

      // Check if NetEase search already returned the exact song ID so we don't even need a search step on play
      const matchedNetease = neteaseTracks.find(
        (nt) =>
          (normalizeSongTitleKey(nt.title) === normalizeSongTitleKey(trackTitle) ||
            nt.title.toLowerCase().includes(trackTitle.toLowerCase()) ||
            trackTitle.toLowerCase().includes(nt.title.toLowerCase())) &&
          artistsOverlap(nt.artist, trackArtist)
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

    // Filter out Saavn knockoff covers when iTunes has official tracks
    const allAllowedArtistQuery = subQueries.join(' ');
    const saavnTracks = rawSaavnTracks.filter((st) => {
      if (
        itunesTracks.length > 0 &&
        !itunesTracks.some((it) => artistsOverlap(st.artist, it.artist)) &&
        !artistsOverlap(st.artist, allAllowedArtistQuery)
      ) {
        return false;
      }
      return true;
    });

    // Upgrade iTunes tracks to direct 320kbps Saavn stream whenever BOTH title & artist match
    for (const it of itunesTracks) {
      const matchedSaavn = saavnTracks.find(
        (st) =>
          (st.title.toLowerCase().includes(it.title.toLowerCase()) ||
            it.title.toLowerCase().includes(st.title.toLowerCase())) &&
          artistsOverlap(st.artist, it.artist)
      );
      if (matchedSaavn) {
        it.streamUrl = matchedSaavn.streamUrl;
        it.durationSec = matchedSaavn.durationSec;
        it.id = matchedSaavn.id;
      }
    }

    // Enrich NetEase tracks that were missing from US iTunes (e.g. Blinding Lights, House of Balloons, FE!N)
    const unmatchedNetease = [];
    for (const nt of neteaseTracks) {
      const alreadyInItunes = itunesTracks.some(
        (it) =>
          normalizeSongTitleKey(it.title) === normalizeSongTitleKey(nt.title) &&
          artistsOverlap(it.artist, nt.artist)
      );
      if (alreadyInItunes) continue;

      // Try matching artwork/duration from YouTube or same-artist iTunes results first
      const ytMatch = ytTracks.find(
        (yt) =>
          (yt.title.toLowerCase().includes(nt.title.toLowerCase()) ||
            nt.title.toLowerCase().includes(yt.title.toLowerCase())) &&
          artistsOverlap(nt.artist, `${yt.artist} ${yt.title}`)
      );
      const sameArtistItunes = itunesMeta.find(
        (it) =>
          it.artworkUrl100 &&
          artistsOverlap(nt.artist, it.artistName || '') &&
          (!nt.album ||
            (it.collectionName || '').toLowerCase().includes(nt.album.toLowerCase()) ||
            nt.album.toLowerCase().includes((it.collectionName || '').toLowerCase()))
      );

      if (ytMatch?.durationSec) {
        nt.durationSec = ytMatch.durationSec;
        nt.fullTrackDurationSec = ytMatch.durationSec;
        nt.youtubeId = ytMatch.youtubeId;
        nt.backupYoutubeIds = ytMatch.backupYoutubeIds;
      }

      if (sameArtistItunes?.artworkUrl100) {
        nt.coverUrl = sameArtistItunes.artworkUrl100.replace('100x100bb', '600x600bb');
        nt.thumbUrl = sameArtistItunes.artworkUrl100;
      } else if (ytMatch?.coverUrl) {
        nt.coverUrl = ytMatch.coverUrl;
        nt.thumbUrl = ytMatch.thumbUrl;
      }

      if (sameArtistItunes?.previewUrl) {
        nt.streamUrl = `gdstudio:netease:${nt.neteaseId}||${sameArtistItunes.previewUrl}`;
      }

      unmatchedNetease.push(nt);
    }

    // Resolve official 500x500 NetEase album cover for top unmatched NetEase tracks that still need cover art
    const needsPicResolve = unmatchedNetease.filter((nt) => !nt.coverUrl && nt.picId).slice(0, 4);
    if (needsPicResolve.length > 0) {
      await Promise.all(
        needsPicResolve.map(async (nt) => {
          const picUrl = await resolveNeteasePicUrl(nt.picId);
          if (picUrl) {
            nt.coverUrl = picUrl;
            nt.thumbUrl = picUrl;
          }
        })
      );
    }

    // Enrich YouTube tracks with crisp 600x600 square album artwork AND full-length 320kbps gdstudio streamUrl!
    const enrichedYtTracks = ytTracks.map((yt) => {
      const normTitle = yt.title.toLowerCase();
      const artMatch =
        itunesMeta.find((it) => {
          const itTitle = (it.trackName || '').toLowerCase();
          return (
            (normTitle.includes(itTitle) || itTitle.includes(normTitle)) &&
            artistsOverlap(yt.artist, it.artistName || '')
          );
        }) ||
        itunesMeta.find((it) => {
          const itTitle = (it.trackName || '').toLowerCase();
          return normTitle.includes(itTitle) || itTitle.includes(normTitle);
        });
      const resolvedTitle = artMatch?.trackName || yt.title;
      const resolvedArtist = artMatch?.artistName || yt.artist;
      const fullDur =
        yt.durationSec ||
        Math.max(90, Math.round((artMatch?.trackTimeMillis || 210000) / 1000));
      const fallbackPreview = artMatch?.previewUrl || '';
      const hiRes = artMatch?.artworkUrl100
        ? artMatch.artworkUrl100.replace('100x100bb', '600x600bb')
        : yt.coverUrl;
      return {
        ...yt,
        title: resolvedTitle,
        artist: resolvedArtist,
        coverUrl: hiRes,
        thumbUrl: artMatch?.artworkUrl100 || yt.thumbUrl,
        album: artMatch?.collectionName || yt.album,
        streamUrl:
          yt.streamUrl ||
          `gdstudio:query:${resolvedTitle} ${resolvedArtist}||${fallbackPreview}`,
        durationSec: fullDur,
        fullTrackDurationSec: fullDur,
        sourceType: 'online',
      };
    });

    // Attach a matching YouTube videoId to Saavn/iTunes tracks when BOTH title and artist match
    for (const st of [...saavnTracks, ...itunesTracks]) {
      const matchYt = enrichedYtTracks.find(
        (yt) =>
          (yt.title.toLowerCase().includes(st.title.toLowerCase()) ||
            st.title.toLowerCase().includes(yt.title.toLowerCase())) &&
          artistsOverlap(st.artist, `${yt.artist} ${yt.title}`)
      );
      if (matchYt) {
        st.youtubeId = matchYt.youtubeId;
        st.backupYoutubeIds = matchYt.backupYoutubeIds;
        if (st.id.startsWith('saavn-')) {
          matchYt.streamUrl = st.streamUrl;
          matchYt.durationSec = st.durationSec;
          matchYt.sourceType = 'online';
        }
      }
    }

    // Merge ad-free full-length official tracks (iTunes + NetEase + verified Saavn + enriched YT) without duplicates
    const combined = [];
    const seenKeys = new Set();
    const titleCounts = new Map();
    for (const item of [...itunesTracks, ...unmatchedNetease, ...saavnTracks, ...enrichedYtTracks]) {
      const titleKey = normalizeSongTitleKey(item.title);
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

    // Sort so exact title matches (for specific song searches) and tracks with direct ad-free streamUrl appear FIRST
    const isSpecificQuery = subQueries.length === 1 && Boolean(rawQuery);
    const qNorm = isSpecificQuery ? normalizeSongTitleKey(query) : '';
    combined.sort((a, b) => {
      const aHasStream = Boolean(a.streamUrl);
      const bHasStream = Boolean(b.streamUrl);
      if (aHasStream !== bHasStream) return aHasStream ? -1 : 1;

      if (qNorm.length >= 2) {
        const aExactTitle = normalizeSongTitleKey(a.title).includes(qNorm);
        const bExactTitle = normalizeSongTitleKey(b.title).includes(qNorm);
        if (aExactTitle !== bExactTitle) return aExactTitle ? -1 : 1;

        if (aExactTitle && bExactTitle && !qNorm.includes('remix')) {
          const aIsRemix = /\bremix\b/i.test(a.title);
          const bIsRemix = /\bremix\b/i.test(b.title);
          if (aIsRemix !== bIsRemix) return aIsRemix ? 1 : -1;
        }
      }

      const aMatch =
        artistsOverlap(a.artist, allAllowedArtistQuery) ||
        (rawQuery && a.title.toLowerCase().includes(rawQuery.toLowerCase()));
      const bMatch =
        artistsOverlap(b.artist, allAllowedArtistQuery) ||
        (rawQuery && b.title.toLowerCase().includes(rawQuery.toLowerCase()));
      if (aMatch !== bMatch) return aMatch ? -1 : 1;
      return 0;
    });

    const finalResults = combined.slice(0, 24).map((item, idx) => ({
      ...item,
      accentColor: ACCENT_PALETTE[idx % ACCENT_PALETTE.length],
    }));

    return NextResponse.json({
      ok: true,
      query: rawQuery || query,
      results: finalResults,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Search failed', results: [] },
      { status: 500 }
    );
  }
}
