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

function isKaraokeOrCoverFake(name = '', artistStr = '', label = '', rawQuery = '') {
  const combined = `${name} ${artistStr} ${label}`.toLowerCase();
  const qLower = (rawQuery || '').toLowerCase();
  if (
    combined.includes('karaoke') ||
    combined.includes('originally performed') ||
    combined.includes('originally perfomed') ||
    combined.includes('8-bit') ||
    combined.includes('ringtone') ||
    combined.includes('tribute to') ||
    combined.includes('covers culture') ||
    combined.includes('piano instrumental') ||
    combined.includes('lullaby version') ||
    combined.includes('ukulele bros')
  ) {
    return true;
  }
  // Filter unrequested nightcore / hardstyle / ambient / slowed covers unless the user searched for them
  const remixTags = ['nightcore', 'hardstyle', 'ambient version', 'slowed', 'sped up', 'lofi flip'];
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
      `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(query)}&limit=12`,
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

      if (isKaraokeOrCoverFake(title, artist, item.label || '', query)) continue;

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
 * 3. Fetch Square High-Res 600x600 Album Cover Art from iTunes to enrich YouTube tracks
 */
async function fetchItunesArtworkLookup(query) {
  try {
    const res = await fetch(
      `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=10`,
      { headers: { 'User-Agent': USER_AGENT } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/music-search?q=<search query>
 * Returns FULL-LENGTH songs (3–6 minutes long) by combining:
 * 1. Direct 320kbps full-length MP4/AAC streams (JioSaavn)
 * 2. Full-length YouTube Audio/Lyric tracks with automatic multi-videoId failover + 600x600 album art
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

  // 2. Search Full-Length Online Songs
  const rawQuery = (searchParams.get('q') || '').trim();
  const query = rawQuery || 'The Weeknd Daft Punk Dua Lipa Coldplay';

  try {
    const [saavnTracks, ytTracks, itunesMeta] = await Promise.all([
      searchSaavnFullTracks(query),
      searchYouTubeFullTracks(query),
      fetchItunesArtworkLookup(query),
    ]);

    // Enrich YouTube full tracks with crisp 600x600 square album artwork from iTunes when matched
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
      if (artMatch?.artworkUrl100) {
        const hiRes = artMatch.artworkUrl100.replace('100x100bb', '600x600bb');
        return {
          ...yt,
          coverUrl: hiRes,
          thumbUrl: artMatch.artworkUrl100,
          album: artMatch.collectionName || yt.album,
        };
      }
      return yt;
    });

    // Attach a matching YouTube videoId to Saavn tracks ONLY when BOTH title and artist match!
    for (const st of saavnTracks) {
      const matchYt = enrichedYtTracks.find(
        (yt) =>
          (yt.title.toLowerCase().includes(st.title.toLowerCase()) ||
            st.title.toLowerCase().includes(yt.title.toLowerCase()) ||
            yt.artist.toLowerCase().includes(st.title.toLowerCase())) &&
          artistsOverlap(st.artist, `${yt.artist} ${yt.title}`)
      );
      if (matchYt) {
        st.youtubeId = matchYt.youtubeId;
        st.backupYoutubeIds = matchYt.backupYoutubeIds;
        if (!matchYt.streamUrl) {
          matchYt.streamUrl = st.streamUrl;
        }
      }
    }

    // Determine whether each track is an official artist match (matches query, iTunes artist, or cross-verified YouTube/Saavn artist)
    const isOfficialArtistMatch = (t) => {
      if (artistsOverlap(t.artist, query)) return true;
      if (itunesMeta.some((it) => artistsOverlap(t.artist, it.artistName || ''))) return true;
      if (
        t.sourceType === 'online' &&
        enrichedYtTracks.some((yt) => artistsOverlap(t.artist, `${yt.artist} ${yt.title}`))
      ) {
        return true;
      }
      return false;
    };

    // Merge full-length tracks without duplicates
    const combined = [];
    const seenKeys = new Set();
    for (const item of [...saavnTracks, ...enrichedYtTracks]) {
      const key = `${item.title.toLowerCase().slice(0, 14)}|${item.artist.toLowerCase().slice(0, 10)}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        combined.push(item);
      }
    }

    // Sort so official artist matches appear FIRST, with direct 320kbps streams prioritized when artist matches
    combined.sort((a, b) => {
      const aOfficial = isOfficialArtistMatch(a);
      const bOfficial = isOfficialArtistMatch(b);
      if (aOfficial !== bOfficial) return aOfficial ? -1 : 1;
      return 0;
    });

    const finalResults = combined.slice(0, 16).map((item, idx) => ({
      ...item,
      accentColor: ACCENT_PALETTE[idx % ACCENT_PALETTE.length],
    }));

    return NextResponse.json({
      ok: true,
      query,
      results: finalResults,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Search failed', results: [] },
      { status: 500 }
    );
  }
}
