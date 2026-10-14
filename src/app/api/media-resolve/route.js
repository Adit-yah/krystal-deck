import { NextResponse } from 'next/server';

/**
 * Parses a YouTube or Spotify URL and returns:
 * - platform: 'youtube' | 'spotify'
 * - id: videoId or spotifyId
 * - spotifyType: 'track' | 'album' | 'playlist' (if spotify)
 */
function parseMediaUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  // 1. Check Spotify URI (`spotify:track:xxxx`)
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

  // 2. Check YouTube (`youtube.com`, `youtu.be`, `music.youtube.com`)
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
      return {
        platform: 'youtube',
        id: videoId,
      };
    }
  }

  // 3. Check Spotify (`open.spotify.com`)
  if (host.endsWith('spotify.com')) {
    const parts = urlObj.pathname
      .split('/')
      .filter(Boolean)
      .filter((p) => !p.startsWith('intl-'));
    // e.g. /track/4cOdK2wGLETKBW3PvgPWqT or /embed/track/...
    const idx = parts[0] === 'embed' ? 1 : 0;
    const type = parts[idx];
    const id = parts[idx + 1];
    if ((type === 'track' || type === 'album' || type === 'playlist') && id) {
      return {
        platform: 'spotify',
        spotifyType: type,
        id,
      };
    }
  }

  return null;
}

async function fetchImageAsDataUrl(imgUrl) {
  if (!imgUrl) return null;
  try {
    const res = await fetch(imgUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
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
 * Clean up common YouTube title suffixes like "(Official Video)" and split "Artist - Title"
 */
function splitArtistAndTitle(rawTitle, fallbackAuthor) {
  let cleaned = (rawTitle || '')
    .replace(/\s*\((official\s*(music\s*)?video|official\s*audio|lyric\s*video|lyrics|visualizer|hd|4k|remastered.*?)\)/gi, '')
    .replace(/\s*\[(official\s*(music\s*)?video|official\s*audio|lyric\s*video|lyrics|visualizer|hd|4k|remastered.*?)\]/gi, '')
    .trim();

  const authorCleaned = (fallbackAuthor || '').replace(/\s*-\s*Topic$/i, '').trim();

  const sepMatch = cleaned.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (sepMatch) {
    return {
      artist: sepMatch[1].trim(),
      title: sepMatch[2].trim().replace(/^["']|["']$/g, ''),
    };
  }
  return {
    title: cleaned || 'Stream Track',
    artist: authorCleaned || 'Studio Stream',
  };
}

export async function GET(request) {
  const { searchParams, origin } = new URL(request.url);
  const rawUrl = searchParams.get('url');
  const parsed = parseMediaUrl(rawUrl);

  if (!parsed) {
    return NextResponse.json(
      { error: 'Please enter a valid YouTube or Spotify song link.' },
      { status: 400 }
    );
  }

  try {
    if (parsed.platform === 'youtube') {
      const videoId = parsed.id;
      const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
      let rawTitle = 'YouTube Track';
      let rawAuthor = 'YouTube Music';
      let thumbUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`
        );
        if (oembedRes.ok) {
          const data = await oembedRes.json();
          rawTitle = data.title || rawTitle;
          rawAuthor = data.author_name || rawAuthor;
          if (data.thumbnail_url) thumbUrl = data.thumbnail_url;
        }
      } catch {
        // Fallback to default thumbnail
      }

      const { title, artist } = splitArtistAndTitle(rawTitle, rawAuthor);

      // Query our full-length music search for backup embed-friendly YouTube IDs & direct 320kbps streams
      let audioPreviewUrl = null;
      let backupYoutubeIds = [];
      try {
        const q = `${title} ${artist !== 'YouTube Music' ? artist : ''}`.trim();
        const searchRes = await fetch(`${origin}/api/music-search?q=${encodeURIComponent(q)}`);
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = Array.isArray(searchData?.results) ? searchData.results : [];
          const streamHit = results.find((r) => r.streamUrl);
          if (streamHit?.streamUrl) {
            audioPreviewUrl = streamHit.streamUrl;
          }
          const ytHits = results
            .flatMap((r) => [r.youtubeId, ...(r.backupYoutubeIds || [])])
            .filter((id) => id && id !== videoId);
          backupYoutubeIds = [...new Set(ytHits)].slice(0, 4);
        }
      } catch {
        // Optional fallback
      }

      const coverDataUrl = await fetchImageAsDataUrl(thumbUrl);

      return NextResponse.json({
        ok: true,
        platform: 'youtube',
        id: videoId,
        videoId,
        backupYoutubeIds,
        title,
        artist,
        coverUrl: coverDataUrl || thumbUrl,
        audioPreviewUrl,
        externalUrl: canonicalUrl,
      });
    }

    if (parsed.platform === 'spotify') {
      const { spotifyType, id } = parsed;
      const canonicalUrl = `https://open.spotify.com/${spotifyType}/${id}`;
      let title = 'Spotify Track';
      let artist = 'Spotify Artist';
      let thumbUrl = null;
      let audioPreviewUrl = null;
      let resolvedVideoId = null;
      let backupYoutubeIds = [];

      // 1. Fetch Spotify Embed HTML to extract __NEXT_DATA__ (contains exact title, artist & cover art!)
      try {
        const embedRes = await fetch(`https://open.spotify.com/embed/${spotifyType}/${id}`, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
        });
        if (embedRes.ok) {
          const html = await embedRes.text();
          const nextDataMatch = html.match(
            /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
          );
          if (nextDataMatch && nextDataMatch[1]) {
            const nextJson = JSON.parse(nextDataMatch[1]);
            const entity = nextJson?.props?.pageProps?.state?.data?.entity;
            if (entity) {
              if (entity.title || entity.name) title = entity.title || entity.name;
              if (Array.isArray(entity.artists) && entity.artists.length > 0) {
                artist = entity.artists.map((a) => a.name).join(', ');
              } else if (entity.subtitle) {
                artist = entity.subtitle;
              }
              if (entity.visualIdentity?.image?.length > 0) {
                const imgs = entity.visualIdentity.image;
                thumbUrl = imgs[imgs.length - 1]?.url || imgs[0]?.url;
              } else if (entity.coverArt?.sources?.length > 0) {
                thumbUrl = entity.coverArt.sources[0]?.url;
              }
            }
          }
        }
      } catch {
        // Ignore and fallback to oEmbed
      }

      // 2. Fallback / supplement with Spotify oEmbed API
      if (!thumbUrl || title === 'Spotify Track') {
        try {
          const oembedRes = await fetch(
            `https://open.spotify.com/oembed?url=${encodeURIComponent(canonicalUrl)}`
          );
          if (oembedRes.ok) {
            const data = await oembedRes.json();
            if (data.title && title === 'Spotify Track') {
              title = data.title;
            }
            if (data.thumbnail_url && !thumbUrl) {
              thumbUrl = data.thumbnail_url;
            }
          }
        } catch {
          // Ignore
        }
      }

      // 3. Resolve a FULL-LENGTH 320kbps stream or full-length YouTube Audio track for this Spotify song!
      if (title && title !== 'Spotify Track') {
        try {
          const q = `${title} ${artist !== 'Spotify Artist' ? artist : ''}`.trim();
          const searchRes = await fetch(`${origin}/api/music-search?q=${encodeURIComponent(q)}`);
          if (searchRes.ok) {
            const searchData = await searchRes.json();
            const results = Array.isArray(searchData?.results) ? searchData.results : [];
            const topHit = results[0];
            if (topHit) {
              if (topHit.streamUrl) {
                audioPreviewUrl = topHit.streamUrl;
              }
              if (topHit.youtubeId) {
                resolvedVideoId = topHit.youtubeId;
                backupYoutubeIds = topHit.backupYoutubeIds || [];
              }
            }
            if (!resolvedVideoId) {
              const ytHit = results.find((r) => r.youtubeId);
              if (ytHit) {
                resolvedVideoId = ytHit.youtubeId;
                backupYoutubeIds = ytHit.backupYoutubeIds || [];
              }
            }
          }
        } catch {
          // Ignore
        }
      }

      const coverDataUrl = await fetchImageAsDataUrl(thumbUrl);

      return NextResponse.json({
        ok: true,
        platform: 'spotify',
        spotifyType,
        id,
        spotifyId: id,
        videoId: resolvedVideoId,
        backupYoutubeIds,
        title,
        artist,
        coverUrl: coverDataUrl || thumbUrl,
        audioPreviewUrl,
        externalUrl: canonicalUrl,
      });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || 'Failed to resolve media link.' },
      { status: 500 }
    );
  }
}
