/**
 * KRYSTAL-DECK // Studio WebAudio Synthesizer, Custom Audio Streaming & Mechanical Foley
 */

export class KrystalAudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.musicGain = null;
    this.hissGain = null;

    this.isPlaying = false;
    this.mode = 'STOP'; // 'STOP' | 'PLAY' | 'PAUSE'
    this.preset = 'neon-rain';
    this.side = 'A';
    this.volume = 0.85;

    // Tape transport velocity (1.0 = normal speed)
    this.targetSpeed = 0.0;
    this.currentSpeed = 0.0;

    // Procedural sequencer state & track cycle timer (so Auto Mode & Scrubber work on all cassettes!)
    this.stepIndex = 0;
    this.stepAccum = 0;
    this.synthElapsed = 0;
    this.synthDuration = 28;

    // Auto-Switch Cassette Mode & Track End Callback
    this.autoAdvance = true;
    this.onTrackEnded = null;

    // Custom audio sources: 'file' | 'stream' | 'youtube'
    this.customSourceType = null;
    this.audioEl = null;
    this.streamAudioEl = null;
    this.mediaNode = null;
    this.customObjectUrl = null;
    this.hasCustomSong = false;

    // YouTube IFrame Player state
    this.ytPlayer = null;
    this.ytReady = false;
    this.ytVideoId = null;
    this.ytLoadedVideoId = null;
    this.ytBackupQueue = [];
    this.ytFallbackStreamUrl = null;
    this._preloadingStream = false;
    this._preloadingYouTube = false;
    this._loadedFile = null;

    // Continuous Fast-Forward (FF) & Rewind (REW) scrub cursor state
    this._scrubCursor = null;
    this._scrubSyncTimer = 0;

    this.fftData = new Uint8Array(128);
    this.smoothedLevels = new Float32Array(12);

    if (typeof window !== 'undefined') {
      // Pre-initialize the YouTube IFrame API & hidden player mount on load so `ytReady` is true before first click!
      setTimeout(() => this._ensureYouTubePlayerMounted('XwxLwG2_Sxk'), 120);
    }
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.9;

      // Lush stereo tape delay for synth tracks
      this.delayL = this.ctx.createDelay(1.0);
      this.delayR = this.ctx.createDelay(1.0);
      this.delayL.delayTime.value = 0.27;
      this.delayR.delayTime.value = 0.36;

      this.delayFb = this.ctx.createGain();
      this.delayFb.gain.value = 0.3;

      this.delayFilter = this.ctx.createBiquadFilter();
      this.delayFilter.type = 'bandpass';
      this.delayFilter.frequency.value = 1600;
      this.delayFilter.Q.value = 0.85;

      this.delayWet = this.ctx.createGain();
      this.delayWet.gain.value = 0.24;

      this.musicGain.connect(this.delayFilter);
      this.delayFilter.connect(this.delayL);
      this.delayL.connect(this.delayR);
      this.delayR.connect(this.delayFb);
      this.delayFb.connect(this.delayFilter);

      this.delayL.connect(this.delayWet);
      this.delayR.connect(this.delayWet);

      this.musicGain.connect(this.analyser);
      this.delayWet.connect(this.analyser);
      this.analyser.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this._initTapeHiss();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  _initTapeHiss() {
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const out = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.997 * b0 + white * 0.029;
      b1 = 0.985 * b1 + white * 0.032;
      b2 = 0.950 * b2 + white * 0.048;
      out[i] = (b0 + b1 + b2 + white * 0.018) * 0.28;
    }

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuffer;
    noiseSrc.loop = true;

    const hissFilter = this.ctx.createBiquadFilter();
    hissFilter.type = 'bandpass';
    hissFilter.frequency.value = 5200;
    hissFilter.Q.value = 0.7;

    this.hissGain = this.ctx.createGain();
    this.hissGain.gain.value = 0.0;

    noiseSrc.connect(hissFilter);
    hissFilter.connect(this.hissGain);
    this.hissGain.connect(this.masterGain);
    noiseSrc.start();
  }

  getEffectiveVolume() {
    return this.muted ? 0 : this.volume;
  }

  setVolume(val) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.volume > 0 && this.muted) {
      this.muted = false;
    }
    this._applyVolumeToOutputs();
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    this._applyVolumeToOutputs();
  }

  _applyVolumeToOutputs() {
    const eff = this.getEffectiveVolume();
    const factor = this.mode === 'FF' || this.mode === 'REW' ? 0.35 : 1.0;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(eff, this.ctx.currentTime, 0.02);
    }
    if (this.streamAudioEl && !this._preloadingStream) {
      this.streamAudioEl.muted = Boolean(this.muted);
      this.streamAudioEl.volume = eff * factor;
    }
    if (this.audioEl) {
      this.audioEl.muted = Boolean(this.muted);
      this.audioEl.volume = eff * factor;
    }
    if (
      this.ytPlayer &&
      this.ytReady &&
      !this._preloadingYouTube &&
      typeof this.ytPlayer.setVolume === 'function'
    ) {
      try {
        if (this.muted) {
          this.ytPlayer.setVolume(0);
        } else {
          if (typeof this.ytPlayer.unMute === 'function') this.ytPlayer.unMute();
          this.ytPlayer.setVolume(Math.round(eff * 100 * factor));
        }
      } catch {
        // Ignore transient YT errors
      }
    }
  }

  playMechanicalClick(type = 'button') {
    this.ensureContext();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (type === 'door') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(92, now + 0.065);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(640, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.035);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    }

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  _ensureStreamAudioEl() {
    if (!this.streamAudioEl && typeof window !== 'undefined') {
      this.streamAudioEl = new Audio();
      this.streamAudioEl.loop = false;
      this.streamAudioEl.preload = 'auto';
      this.streamAudioEl.referrerPolicy = 'no-referrer';
      this.streamAudioEl.volume = this.volume;
      this.streamAudioEl.addEventListener('ended', () => {
        if (this.preset === 'custom-file' && this.customSourceType === 'stream') {
          this._handleTrackEnded(this.streamAudioEl);
        }
      });
      this.streamAudioEl.addEventListener('error', () => {
        // 1. If a gdstudio stream spec has a fallback direct stream after '||', switch to it on error
        if (
          this._rawStreamSpec &&
          this._rawStreamSpec.includes('||') &&
          !this._usingFallbackSpecUrl
        ) {
          const fallbackUrl = this._rawStreamSpec.split('||')[1];
          if (fallbackUrl) {
            this._usingFallbackSpecUrl = true;
            this._rawStreamUrl = fallbackUrl;
            this.streamAudioEl.src = fallbackUrl;
            this.streamAudioEl.load();
            if (
              this.isPlaying &&
              this.preset === 'custom-file' &&
              this.customSourceType === 'stream'
            ) {
              this.streamAudioEl.muted = Boolean(this.muted);
              this.streamAudioEl.volume = this.getEffectiveVolume();
              this.streamAudioEl.play().catch(() => {});
            }
            return;
          }
        }
        // 2. Automatic fallback to same-origin stream proxy if direct CDN stream is blocked
        if (
          this._rawStreamUrl &&
          !this._rawStreamUrl.startsWith('data:') &&
          !this._usingStreamProxy
        ) {
          this._usingStreamProxy = true;
          const proxied = `/api/music-search?stream=${encodeURIComponent(this._rawStreamUrl)}`;
          this.streamAudioEl.src = proxied;
          this.streamAudioEl.load();
          if (this.isPlaying && this.preset === 'custom-file' && this.customSourceType === 'stream') {
            this.streamAudioEl.muted = Boolean(this.muted);
            this.streamAudioEl.volume = this.getEffectiveVolume();
            this.streamAudioEl.play().catch(() => {});
          }
        }
      });
    }
    return this.streamAudioEl;
  }

  _getCachedDirectUrl(streamSpec) {
    if (!streamSpec) return null;
    if (!streamSpec.startsWith('gdstudio:')) return streamSpec;
    if (!this._resolvedStreamCache) this._resolvedStreamCache = new Map();
    const cached = this._resolvedStreamCache.get(streamSpec);
    if (cached && cached.url && Date.now() - cached.ts < 12 * 60 * 1000) {
      return cached.url;
    }
    return null;
  }

  async _resolvePlayableStreamUrl(streamSpec) {
    if (!streamSpec) return null;
    const cached = this._getCachedDirectUrl(streamSpec);
    if (cached) return cached;

    if (!this._inflightStreamPromises) this._inflightStreamPromises = new Map();
    if (this._inflightStreamPromises.has(streamSpec)) {
      return this._inflightStreamPromises.get(streamSpec);
    }

    const promise = (async () => {
      const [specPart, fallbackUrl = ''] = String(streamSpec).split('||');
      try {
        let neteaseId = null;
        if (specPart.startsWith('gdstudio:netease:')) {
          neteaseId = specPart.slice('gdstudio:netease:'.length).trim();
        } else if (specPart.startsWith('gdstudio:query:')) {
          const query = specPart.slice('gdstudio:query:'.length).trim();
          if (query) {
            const sRes = await fetch(
              `https://music-api.gdstudio.xyz/api.php?types=search&source=netease&name=${encodeURIComponent(query)}&count=6`
            );
            if (sRes.ok) {
              const sJson = await sRes.json();
              if (Array.isArray(sJson) && sJson.length > 0) {
                const goodHit =
                  sJson.find((item) => {
                    if (!item || !item.url_id) return false;
                    const txt = `${item.name || ''} ${(item.artist || []).join(' ')} ${item.album || ''}`.toLowerCase();
                    return !/karaoke|instrumental|tribute|8-bit|ringtone|lullaby|originally performed/i.test(
                      txt
                    );
                  }) || sJson[0];
                if (goodHit?.url_id) {
                  neteaseId = String(goodHit.url_id);
                }
              }
            }
          }
        }

        if (neteaseId) {
          const uRes = await fetch(
            `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${encodeURIComponent(neteaseId)}&br=320`
          );
          if (uRes.ok) {
            const uJson = await uRes.json();
            if (uJson?.url) {
              const secureUrl = String(uJson.url).replace(/^http:\/\//i, 'https://');
              if (!this._resolvedStreamCache) this._resolvedStreamCache = new Map();
              this._resolvedStreamCache.set(streamSpec, {
                url: secureUrl,
                ts: Date.now(),
              });
              return secureUrl;
            }
          }
        }
      } catch {
        // Fall through to fallbackUrl
      }
      return fallbackUrl || null;
    })();

    this._inflightStreamPromises.set(streamSpec, promise);
    try {
      return await promise;
    } finally {
      this._inflightStreamPromises.delete(streamSpec);
    }
  }

  _applyResolvedStreamSpec(streamSpec, isTabHidden = false) {
    this._resolvePlayableStreamUrl(streamSpec).then((resolvedUrl) => {
      if (!resolvedUrl || this._rawStreamSpec !== streamSpec) return;
      const el = this._ensureStreamAudioEl();
      if (!el) return;
      if (this._rawStreamUrl !== resolvedUrl) {
        this._rawStreamUrl = resolvedUrl;
        this._usingStreamProxy = false;
        this._usingFallbackSpecUrl = false;
        el.src = resolvedUrl;
        el.load();
      }
      if (this.customSourceType === 'stream' && this.preset === 'custom-file') {
        this._syncCustomTransport();
      } else if (this._preloadingStream) {
        el.muted = Boolean(this.muted);
        el.volume = isTabHidden ? this.getEffectiveVolume() : 0;
        el.play().catch(() => {});
      }
    });
  }

  /**
   * Call synchronously inside any user click/pointer gesture (`onClick` / `onPointerDown`).
   * Starts `streamAudioEl.play()` or `ytPlayer.loadVideoById()` synchronously inside the click gesture
   * ONLY when switching to a new stream/video during the 1.75s 3D cassette swap animation.
   * Never resets `currentTime = 0` if the stream/video is already loaded!
   */
  unlockAudioGesture(preloadStreamUrl = null, preloadYoutubeId = null, backupYoutubeIds = []) {
    this.ensureContext();
    const el = this._ensureStreamAudioEl();
    const isTabHidden = typeof document !== 'undefined' && document.hidden;

    if (preloadStreamUrl) {
      // If this exact stream is ALREADY loaded and active, do NOT set `_preloadingStream = true` (which would reset currentTime to 0!)
      if (
        (this._rawStreamSpec === preloadStreamUrl || this._rawStreamUrl === preloadStreamUrl) &&
        this.customSourceType === 'stream'
      ) {
        if (el && el.paused && this.isPlaying && this._rawStreamUrl) {
          el.muted = Boolean(this.muted);
          el.volume = this.getEffectiveVolume();
          el.play().catch(() => {});
        }
        return;
      }

      this._rawStreamSpec = preloadStreamUrl;
      this._preloadingStream = !isTabHidden;
      this._preloadingYouTube = false;
      this._scrubCursor = null;
      this._endHandledForTrack = false;

      const cachedDirectUrl = this._getCachedDirectUrl(preloadStreamUrl);
      if (cachedDirectUrl) {
        if (el) {
          if (this._rawStreamUrl !== cachedDirectUrl) {
            this._rawStreamUrl = cachedDirectUrl;
            this._usingStreamProxy = false;
            this._usingFallbackSpecUrl = false;
            el.src = cachedDirectUrl;
          }
          el.muted = Boolean(this.muted);
          el.volume = isTabHidden ? this.getEffectiveVolume() : 0;
          el.play().catch(() => {});
        }
      } else {
        // Unlock the HTMLAudioElement synchronously inside the click gesture while the 320kbps MP3 URL resolves
        if (el && !this._streamGestureUnlocked) {
          this._streamGestureUnlocked = true;
          this._rawStreamUrl =
            'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
          el.src = this._rawStreamUrl;
          el.volume = 0;
          el.play().catch(() => {});
        }
        this._applyResolvedStreamSpec(preloadStreamUrl, isTabHidden);
      }
      return;
    }

    if (preloadYoutubeId) {
      // If this exact YouTube video is ALREADY loaded and active, do NOT set `_preloadingYouTube = true` (which would seekTo(0)!)
      if (this.ytLoadedVideoId === preloadYoutubeId && this.customSourceType === 'youtube') {
        return;
      }

      this._preloadingYouTube = !isTabHidden;
      this._preloadingStream = false;
      this._scrubCursor = null;
      this._endHandledForTrack = false;
      this.ytVideoId = preloadYoutubeId;
      this.ytBackupQueue = Array.isArray(backupYoutubeIds) ? [...backupYoutubeIds] : [];
      if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.loadVideoById === 'function') {
        try {
          this.ytPlayer.setVolume(isTabHidden ? Math.round(this.volume * 100) : 0);
          if (this.ytLoadedVideoId !== preloadYoutubeId) {
            this.ytLoadedVideoId = preloadYoutubeId;
            this.ytPlayer.loadVideoById(preloadYoutubeId);
          } else {
            this.ytPlayer.playVideo();
          }
        } catch {
          // Ignore transient YT state errors
        }
      } else {
        this._ensureYouTubePlayerMounted(preloadYoutubeId);
      }
    }
  }

  _getRawCurrentTimeAndDuration() {
    if (this.preset !== 'custom-file' || !this.hasCustomSong) {
      return { cur: this.synthElapsed || 0, dur: this.synthDuration || 28 };
    }
    if (this.customSourceType === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        const dur = this.ytPlayer.getDuration?.() || 0;
        const cur = this.ytPlayer.getCurrentTime?.() || 0;
        return { cur, dur };
      } catch {
        return { cur: 0, dur: 0 };
      }
    }
    const activeEl = this.customSourceType === 'stream' ? this.streamAudioEl : this.audioEl;
    if (!activeEl) return { cur: 0, dur: 0 };
    const dur = isFinite(activeEl.duration) ? activeEl.duration : 0;
    const cur = activeEl.currentTime || 0;
    return { cur, dur };
  }

  _commitScrubTime(targetSec) {
    if (targetSec === null || targetSec === undefined || !isFinite(targetSec)) return;
    const clampedSec = Math.max(0, targetSec);
    if (this.preset !== 'custom-file' || !this.hasCustomSong) {
      this.synthElapsed = Math.min(this.synthDuration, clampedSec);
      return;
    }
    if (this.customSourceType === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        const dur = this.ytPlayer.getDuration?.() || 0;
        const dest = dur > 0 ? Math.min(dur - 0.25, clampedSec) : clampedSec;
        this.ytPlayer.seekTo(Math.max(0, dest), true);
      } catch {
        // Ignore
      }
      return;
    }
    const activeEl = this.customSourceType === 'stream' ? this.streamAudioEl : this.audioEl;
    if (activeEl) {
      try {
        const dur = isFinite(activeEl.duration) ? activeEl.duration : 0;
        activeEl.currentTime = dur > 0 ? Math.min(dur - 0.15, clampedSec) : clampedSec;
      } catch {
        // Ignore
      }
    }
  }

  _syncCustomTransport() {
    if (this.preset !== 'custom-file') {
      if (this.audioEl) this.audioEl.pause();
      if (this.streamAudioEl && !this._preloadingStream) {
        this.streamAudioEl.pause();
      }
      if (
        this.ytPlayer &&
        this.ytReady &&
        !this._preloadingYouTube &&
        typeof this.ytPlayer.pauseVideo === 'function'
      ) {
        try {
          this.ytPlayer.pauseVideo();
        } catch {
          // Ignore
        }
      }
      return;
    }

    const activeEl =
      this.customSourceType === 'file'
        ? this.audioEl
        : this.customSourceType === 'stream'
        ? this.streamAudioEl
        : null;

    const effVol = this.getEffectiveVolume();
    if (activeEl) {
      if (
        activeEl === this.streamAudioEl &&
        (!this._rawStreamUrl || this._rawStreamUrl.startsWith('data:'))
      ) {
        return;
      }
      if (this.isPlaying) {
        if (activeEl === this.streamAudioEl && this._preloadingStream) {
          this._preloadingStream = false;
          try {
            activeEl.currentTime = 0;
          } catch {
            // Ignore if metadata not yet seekable
          }
        }
        activeEl.muted = Boolean(this.muted);
        // Slightly lower audio element volume while fast-forwarding/rewinding so tape transport feels authentic
        activeEl.volume =
          this.mode === 'FF' || this.mode === 'REW' ? effVol * 0.35 : effVol;
        if (this.mode === 'PLAY') {
          activeEl.playbackRate = 1.0;
        }
        if (activeEl.paused) {
          activeEl.play().catch(() => {});
        }
      } else {
        if (activeEl === this.streamAudioEl && this._preloadingStream) {
          // Keep pre-rolling silently during the 1.75s 3D cassette swap animation!
          activeEl.volume = 0;
        } else {
          activeEl.pause();
        }
      }
    }

    if (this.customSourceType === 'youtube' && this.ytPlayer && this.ytReady) {
      try {
        if (this.isPlaying) {
          if (this._preloadingYouTube) {
            this._preloadingYouTube = false;
            try {
              this.ytPlayer.seekTo(0, true);
            } catch {
              // Ignore
            }
          }
          if (!this.muted && typeof this.ytPlayer.unMute === 'function') {
            this.ytPlayer.unMute();
          }
          const volFactor = this.mode === 'FF' || this.mode === 'REW' ? 0.35 : 1.0;
          this.ytPlayer.setVolume(Math.round(effVol * 100 * volFactor));
          this.ytPlayer.playVideo();
          if (typeof this.ytPlayer.setPlaybackRate === 'function') {
            this.ytPlayer.setPlaybackRate(this.mode === 'FF' ? 2.0 : 1.0);
          }
        } else {
          if (this._preloadingYouTube) {
            this.ytPlayer.setVolume(0);
          } else {
            this.ytPlayer.pauseVideo();
          }
        }
      } catch {
        // Ignore transient YT player state errors
      }
    }
  }

  setTransportMode(mode) {
    this.ensureContext();
    const prevMode = this.mode;
    if (prevMode !== mode) {
      this.playMechanicalClick(mode === 'STOP' ? 'door' : 'button');
    }

    // 1. Entering FF or REW: capture current playback timestamp into `_scrubCursor`
    if ((mode === 'FF' || mode === 'REW') && prevMode !== 'FF' && prevMode !== 'REW') {
      const { cur } = this._getRawCurrentTimeAndDuration();
      this._scrubCursor = cur;
      this._scrubSyncTimer = 0;
    }

    // 2. Leaving FF or REW (e.g. pressing PLAY, PAUSE, or STOP): commit `_scrubCursor` to the player!
    if ((prevMode === 'FF' || prevMode === 'REW') && mode !== 'FF' && mode !== 'REW') {
      if (this._scrubCursor !== null) {
        this._commitScrubTime(this._scrubCursor);
        this._scrubCursor = null;
      }
    }

    this.mode = mode;

    if (mode === 'PLAY') {
      this.isPlaying = true;
      this.targetSpeed = 1.0;
    } else if (mode === 'FF') {
      this.isPlaying = true;
      this.targetSpeed = 2.6;
    } else if (mode === 'REW') {
      this.isPlaying = true;
      this.targetSpeed = -2.6;
    } else {
      // PAUSE or STOP
      this.isPlaying = false;
      this.targetSpeed = 0.0;
    }
    this._syncCustomTransport();
  }

  setSpin(spinning) {
    this.setTransportMode(spinning ? 'PLAY' : 'STOP');
  }

  setAutoAdvance(enabled) {
    this.autoAdvance = Boolean(enabled);
  }

  _handleTrackEnded(mediaElement = null) {
    if (this._endHandledForTrack) return;
    this._endHandledForTrack = true;
    this._scrubCursor = null;
    if (this.autoAdvance && typeof this.onTrackEnded === 'function') {
      this.onTrackEnded();
    } else if (mediaElement) {
      this._endHandledForTrack = false;
      mediaElement.currentTime = 0;
      if (this.isPlaying) {
        mediaElement.play().catch(() => {});
      }
    }
  }

  setPreset(presetId, side = 'A') {
    const presetChanged = this.preset !== presetId;
    this.preset = presetId;
    this.side = side;
    if (presetId !== 'custom-file') {
      this.hasCustomSong = false;
      if (presetChanged) {
        this.synthElapsed = 0;
        this._scrubCursor = null;
        this._endHandledForTrack = false;
      }
    }
    this._syncCustomTransport();
  }

  _stopAllCustomSources() {
    if (this.audioEl) this.audioEl.pause();
    if (this.streamAudioEl && !this._preloadingStream) {
      this.streamAudioEl.pause();
    }
    if (
      this.ytPlayer &&
      this.ytReady &&
      !this._preloadingYouTube &&
      typeof this.ytPlayer.pauseVideo === 'function'
    ) {
      try {
        this.ytPlayer.pauseVideo();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * 1. Loads a user-provided local audio file (.mp3, .wav, .m4a, .ogg, .flac)
   */
  loadCustomAudioFile(file) {
    this.ensureContext();
    if (this._loadedFile === file && this.customSourceType === 'file' && this.preset === 'custom-file') {
      this._syncCustomTransport();
      return;
    }
    this._loadedFile = file;
    this._preloadingStream = false;
    this._preloadingYouTube = false;
    this._scrubCursor = null;
    this._endHandledForTrack = false;
    this._stopAllCustomSources();

    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
    }
    this.customObjectUrl = URL.createObjectURL(file);

    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.crossOrigin = 'anonymous';
      this.audioEl.loop = false;
      this.audioEl.addEventListener('ended', () => {
        if (this.preset === 'custom-file' && this.customSourceType === 'file') {
          this._handleTrackEnded(this.audioEl);
        }
      });

      this.mediaNode = this.ctx.createMediaElementSource(this.audioEl);
      this.mediaNode.connect(this.analyser);
    }

    this.audioEl.src = this.customObjectUrl;
    this.audioEl.load();
    this.customSourceType = 'file';
    this.hasCustomSong = true;
    this.preset = 'custom-file';
    this._syncCustomTransport();
  }

  /**
   * 2. Loads a remote audio stream URL (e.g. Full-Length 320kbps Online Search / Spotify stream)
   * without CORS WebAudio restrictions so any external CDN stream plays reliably.
   */
  loadRemoteAudioStream(streamUrl) {
    this.ensureContext();
    this._preloadingYouTube = false;
    this._endHandledForTrack = false;
    if (this.audioEl) this.audioEl.pause();
    if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.pauseVideo === 'function') {
      try {
        this.ytPlayer.pauseVideo();
      } catch {
        // Ignore
      }
    }

    const el = this._ensureStreamAudioEl();
    this._rawStreamSpec = streamUrl;
    const cachedDirectUrl = this._getCachedDirectUrl(streamUrl);

    if (cachedDirectUrl) {
      if (this._rawStreamUrl !== cachedDirectUrl) {
        this._rawStreamUrl = cachedDirectUrl;
        this._usingStreamProxy = false;
        this._usingFallbackSpecUrl = false;
        this._scrubCursor = null;
        el.src = cachedDirectUrl;
        el.load();
      }
      this.customSourceType = 'stream';
      this.hasCustomSong = true;
      this.preset = 'custom-file';
      this._syncCustomTransport();
    } else {
      this._scrubCursor = null;
      this.customSourceType = 'stream';
      this.hasCustomSong = true;
      this.preset = 'custom-file';
      this._applyResolvedStreamSpec(streamUrl, typeof document !== 'undefined' && document.hidden);
    }
  }

  _ensureYouTubePlayerMounted(initialVideoId = 'XwxLwG2_Sxk') {
    if (typeof window === 'undefined') return;

    const mountPlayer = () => {
      if (this.ytPlayer) return;

      let host = document.getElementById('kd-yt-hidden-host');
      if (!host) {
        host = document.createElement('div');
        host.id = 'kd-yt-hidden-host';
        // Keep inside viewport bounds at 0.001 opacity so browsers never throttle the iframe in background tabs
        host.style.cssText =
          'position:fixed;width:200px;height:200px;left:0;bottom:0;opacity:0.001;pointer-events:none;z-index:-1;';
        const inner = document.createElement('div');
        inner.id = 'kd-yt-player-mount';
        host.appendChild(inner);
        document.body.appendChild(host);
      }

      const targetVid = this.ytVideoId || initialVideoId;
      this.ytLoadedVideoId = targetVid;

      this.ytPlayer = new window.YT.Player('kd-yt-player-mount', {
        width: '200',
        height: '200',
        videoId: targetVid,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          loop: 0,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: (ev) => {
            this.ytReady = true;
            const activeVid = this.ytVideoId || targetVid;
            if (this.ytLoadedVideoId !== activeVid) {
              this.ytLoadedVideoId = activeVid;
              if (this.isPlaying || this._preloadingYouTube) {
                ev.target.loadVideoById(activeVid);
              } else {
                ev.target.cueVideoById(activeVid);
              }
            }
            ev.target.setVolume(
              this._preloadingYouTube && !this.isPlaying ? 0 : Math.round(this.volume * 100)
            );
            this._syncCustomTransport();
          },
          onStateChange: (ev) => {
            if (ev.data === 1) {
              // YT.PlayerState.PLAYING === 1: reset end-handled guard once playback is actively running
              const { cur, dur } = this._getRawCurrentTimeAndDuration();
              if (dur === 0 || cur < dur - 2.0) {
                this._endHandledForTrack = false;
              }
            }
            // When video ends (YT.PlayerState.ENDED === 0), either auto-advance to next cassette or loop!
            if (ev.data === 0 && this.isPlaying && this.preset === 'custom-file') {
              if (this.autoAdvance && typeof this.onTrackEnded === 'function') {
                this._handleTrackEnded(null);
              } else {
                this._endHandledForTrack = false;
                ev.target.seekTo(0, true);
                ev.target.playVideo();
              }
            }
          },
          onError: () => {
            // 1. If a YouTube upload restricts embedding (Error 150/101), try the next full-length backup videoId!
            if (this.ytBackupQueue && this.ytBackupQueue.length > 0 && this.ytPlayer && this.ytReady) {
              const nextVid = this.ytBackupQueue.shift();
              if (nextVid) {
                this.ytVideoId = nextVid;
                this.ytLoadedVideoId = nextVid;
                this._endHandledForTrack = false;
                try {
                  this.ytPlayer.loadVideoById(nextVid);
                  return;
                } catch {
                  // Fall through
                }
              }
            }
            // 2. If all YouTube backup IDs are exhausted, switch to fallback direct audio stream if available
            if (this.ytFallbackStreamUrl) {
              this.loadRemoteAudioStream(this.ytFallbackStreamUrl);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      mountPlayer();
    } else {
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        mountPlayer();
      };
      if (!document.getElementById('kd-yt-iframe-script')) {
        const tag = document.createElement('script');
        tag.id = 'kd-yt-iframe-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    }
  }

  /**
   * 3. Loads and streams a full-length YouTube track by videoId via the official YouTube IFrame API
   *    (with automatic failover across `backupYoutubeIds` and `fallbackStreamUrl`!)
   */
  loadYouTubeVideo(videoId, fallbackStreamUrl = null, backupYoutubeIds = []) {
    if (fallbackStreamUrl) {
      this.loadRemoteAudioStream(fallbackStreamUrl);
      return;
    }
    this.ensureContext();
    if (this.audioEl) this.audioEl.pause();
    if (this.streamAudioEl && !this._preloadingStream) {
      this.streamAudioEl.pause();
    }

    const videoChanged = this.ytVideoId !== videoId;
    this.ytVideoId = videoId;
    this.ytFallbackStreamUrl = fallbackStreamUrl;
    this._endHandledForTrack = false;
    if (videoChanged && Array.isArray(backupYoutubeIds) && backupYoutubeIds.length > 0) {
      this.ytBackupQueue = [...backupYoutubeIds];
    }
    if (videoChanged) {
      this._scrubCursor = null;
    }
    this.customSourceType = 'youtube';
    this.hasCustomSong = true;
    this.preset = 'custom-file';

    if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.loadVideoById === 'function') {
      try {
        if (this.ytLoadedVideoId !== videoId) {
          this.ytLoadedVideoId = videoId;
          if (this.isPlaying || this._preloadingYouTube) {
            this.ytPlayer.loadVideoById(videoId);
          } else {
            this.ytPlayer.cueVideoById(videoId);
          }
        }
        this._syncCustomTransport();
      } catch {
        // Ignore transient player state error
      }
      return;
    }

    this._ensureYouTubePlayerMounted(videoId);
  }

  seekCustomAudio(normProgress) {
    const clamped = Math.max(0, Math.min(1, normProgress));
    this._endHandledForTrack = false;
    if (this.preset !== 'custom-file') {
      const target = clamped * this.synthDuration;
      this.synthElapsed = target;
      if (this._scrubCursor !== null) this._scrubCursor = target;
      return;
    }
    if (this.customSourceType === 'file' && this.audioEl && isFinite(this.audioEl.duration)) {
      const target = clamped * this.audioEl.duration;
      this.audioEl.currentTime = target;
      if (this._scrubCursor !== null) this._scrubCursor = target;
    } else if (
      this.customSourceType === 'stream' &&
      this.streamAudioEl &&
      isFinite(this.streamAudioEl.duration)
    ) {
      const target = clamped * this.streamAudioEl.duration;
      this.streamAudioEl.currentTime = target;
      if (this._scrubCursor !== null) this._scrubCursor = target;
    } else if (
      this.customSourceType === 'youtube' &&
      this.ytPlayer &&
      this.ytReady &&
      typeof this.ytPlayer.getDuration === 'function'
    ) {
      const dur = this.ytPlayer.getDuration();
      if (dur > 0) {
        const target = clamped * dur;
        this.ytPlayer.seekTo(target, true);
        if (this._scrubCursor !== null) this._scrubCursor = target;
      }
    }
  }

  getCustomAudioProgress() {
    const { cur: rawCur, dur } = this._getRawCurrentTimeAndDuration();
    const cur =
      (this.mode === 'FF' || this.mode === 'REW') && this._scrubCursor !== null
        ? Math.max(0, dur > 0 ? Math.min(dur, this._scrubCursor) : this._scrubCursor)
        : rawCur;
    return {
      currentTime: cur,
      duration: dur,
      progress: dur > 0 ? Math.max(0, Math.min(1, cur / dur)) : 0,
    };
  }

  update(dt) {
    if (!this.ctx) return;

    this.currentSpeed += (this.targetSpeed - this.currentSpeed) * Math.min(1, dt * 14);

    const absSpeed = Math.abs(this.currentSpeed);
    const now = this.ctx.currentTime;

    if (this.hissGain) {
      const hissLevel = Math.min(0.035, absSpeed * 0.014);
      this.hissGain.gain.setTargetAtTime(hissLevel, now, 0.05);
    }

    // Continuous Fast-Forward (FF) & Rewind / Reverse (REW) scrubbing across all audio sources!
    if (this.isPlaying && (this.mode === 'FF' || this.mode === 'REW')) {
      const { cur, dur } = this._getRawCurrentTimeAndDuration();
      if (this._scrubCursor === null) {
        this._scrubCursor = cur;
      }
      const scrubDir = this.mode === 'FF' ? 1 : -1;
      const scrubRate = 8.5; // 8.5 seconds of song scrubbed per 1 second of holding FF/REW
      const nextTime = this._scrubCursor + dt * scrubRate * scrubDir;
      this._scrubCursor =
        dur > 0 ? Math.max(0, Math.min(dur - 0.2, nextTime)) : Math.max(0, nextTime);

      if (this.preset !== 'custom-file' || !this.hasCustomSong) {
        this.synthElapsed = this._scrubCursor;
      } else {
        this._scrubSyncTimer += dt;
        const syncInterval = this.customSourceType === 'youtube' ? 0.25 : 0.16;
        if (this._scrubSyncTimer >= syncInterval) {
          this._scrubSyncTimer = 0;
          this._commitScrubTime(this._scrubCursor);
        }
      }
    }

    // If playing custom song (file, Online/Spotify stream, or YouTube), handle playback rate & background track-end watchdog
    if (this.preset === 'custom-file') {
      const activeEl =
        this.customSourceType === 'file'
          ? this.audioEl
          : this.customSourceType === 'stream'
          ? this.streamAudioEl
          : null;
      if (activeEl && this.isPlaying) {
        const rate = this.mode === 'PLAY' ? 1.0 : this.mode === 'FF' ? 1.65 : 1.0;
        if (Math.abs(activeEl.playbackRate - rate) > 0.005) {
          activeEl.playbackRate = rate;
        }
        if (activeEl.ended && !this._endHandledForTrack) {
          this._handleTrackEnded(activeEl);
          return;
        }
      }
      if (this.isPlaying && this.mode === 'PLAY' && !this._endHandledForTrack) {
        if (this.customSourceType === 'youtube' && this.ytPlayer && this.ytReady) {
          try {
            const ytState = this.ytPlayer.getPlayerState?.();
            const { cur, dur } = this._getRawCurrentTimeAndDuration();
            if (ytState === 0 || (dur > 5 && cur >= dur - 0.35)) {
              this._handleTrackEnded(null);
              return;
            }
          } catch {
            // Ignore
          }
        } else if (activeEl) {
          const { cur, dur } = this._getRawCurrentTimeAndDuration();
          if (dur > 5 && cur >= dur - 0.2) {
            this._handleTrackEnded(activeEl);
            return;
          }
        }
      }
      return;
    }

    // Otherwise advance the built-in procedural studio synthesizer + track timer
    if (absSpeed > 0.08) {
      const dir = this.currentSpeed >= 0 ? 1 : -1;
      if (this.mode === 'PLAY') {
        this.synthElapsed = Math.max(0, this.synthElapsed + dt);
      }
      if (this.synthElapsed >= this.synthDuration) {
        this.synthElapsed = 0;
        if (this.autoAdvance && typeof this.onTrackEnded === 'function') {
          this.onTrackEnded();
          return;
        }
      }

      const bpmMap = {
        'neon-rain': 88,
        'acid-prism': 132,
        'solar-drift': 106,
        'dub-techno': 118,
      };
      const baseBpm = bpmMap[this.preset] || 100;
      const stepsPerSec = (baseBpm / 60) * 4;
      const effectiveSpeed = this.mode === 'PLAY' ? 1.0 : absSpeed;
      this.stepAccum += dt * stepsPerSec * effectiveSpeed;

      while (this.stepAccum >= 1.0) {
        this.stepAccum -= 1.0;
        this.stepIndex = (this.stepIndex + dir + 64) % 64;
        this._triggerStep(
          this.stepIndex,
          this.mode === 'PLAY' ? 1.0 : Math.min(2.2, Math.max(0.4, absSpeed))
        );
      }
    }
  }

  _triggerStep(step, pitchMul) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const sideShift = this.side === 'B' ? 0.9438 : 1.0;
    const p = pitchMul * sideShift;

    if (this.preset === 'neon-rain') {
      this._playNeonRainStep(step, now, p);
    } else if (this.preset === 'acid-prism') {
      this._playAcidPrismStep(step, now, p);
    } else if (this.preset === 'solar-drift') {
      this._playSolarDriftStep(step, now, p);
    } else {
      this._playDubTechnoStep(step, now, p);
    }
  }

  _playNeonRainStep(step, now, p) {
    const s16 = step % 16;
    if (s16 === 0 || s16 === 7 || s16 === 10) {
      this._synthKick(now, 118 * p, 44 * p, 0.24, 0.38);
    }
    if (s16 === 4 || s16 === 12) {
      this._synthSnare(now, 0.15, 1800 * p, 0.2);
    }
    if (s16 % 2 === 0 || s16 === 15) {
      this._synthHat(now, s16 % 4 === 2 ? 0.08 : 0.035, 6800 * p, 0.06);
    }
    const chords = [
      [261.63, 311.13, 392.0, 466.16],
      [233.08, 293.66, 349.23, 440.0],
      [207.65, 261.63, 311.13, 392.0],
      [196.0, 246.94, 293.66, 369.99],
    ];
    const bar = Math.floor(step / 16) % 4;
    if (s16 === 0 || s16 === 6 || s16 === 12) {
      chords[bar].forEach((freq, idx) => {
        this._synthRhodes(now + idx * 0.012, freq * p, 0.5, 0.08);
      });
    }
    const bassNotes = [65.41, 58.27, 51.91, 49.0];
    if (s16 === 0 || s16 === 6 || s16 === 10) {
      this._synthBass(now, bassNotes[bar] * p, 0.3, 0.2, 'sine');
    }
  }

  _playAcidPrismStep(step, now, p) {
    const s16 = step % 16;
    if (s16 % 4 === 0) {
      this._synthKick(now, 145 * p, 46 * p, 0.18, 0.42);
    }
    if (s16 === 4 || s16 === 12) {
      this._synthSnare(now, 0.14, 2300 * p, 0.22);
    }
    this._synthHat(now, s16 % 4 === 2 ? 0.12 : 0.03, 8200 * p, s16 % 4 === 2 ? 0.09 : 0.04);
    const acidNotes = [
      110, 110, 220, 110, 130.81, 146.83, 110, 220,
      164.81, 110, 130.81, 220, 146.83, 130.81, 98.0, 110,
    ];
    const accents = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
    const isAcc = accents[s16] === 1;
    this._synthAcid303(now, acidNotes[s16] * p, isAcc ? 0.17 : 0.11, isAcc ? 2600 * p : 1100 * p, isAcc ? 0.2 : 0.13);
  }

  _playSolarDriftStep(step, now, p) {
    const s16 = step % 16;
    if (s16 === 0 || s16 === 8 || s16 === 10) {
      this._synthKick(now, 128 * p, 42 * p, 0.24, 0.4);
    }
    if (s16 === 4 || s16 === 12) {
      this._synthSnare(now, 0.22, 1500 * p, 0.24);
    }
    if (s16 % 2 === 0) {
      this._synthHat(now, 0.045, 7200 * p, 0.055);
    }
    const bar = Math.floor(step / 16) % 4;
    const roots = [110.0, 87.31, 130.81, 98.0];
    const arpIntervals = [1, 1.2, 1.5, 2.0, 1.5, 1.2, 1, 2.0];
    this._synthBass(now, roots[bar] * arpIntervals[s16 % 8] * 2.0 * p, 0.15, 0.11, 'sawtooth');
    if (s16 % 4 === 0) {
      this._synthBass(now, roots[bar] * 0.5 * p, 0.24, 0.22, 'sawtooth');
    }
  }

  _playDubTechnoStep(step, now, p) {
    const s16 = step % 16;
    if (s16 % 4 === 0) {
      this._synthKick(now, 124 * p, 40 * p, 0.26, 0.42);
    }
    if (s16 % 4 === 2) {
      this._synthHat(now, 0.08, 6400 * p, 0.07);
    }
    if (s16 === 0 || s16 === 11) {
      [293.66, 349.23, 440.0, 523.25].forEach((f) => {
        this._synthRhodes(now, f * p, 0.22, 0.085);
      });
    }
    if (s16 === 2 || s16 === 6 || s16 === 14) {
      this._synthBass(now, 73.42 * p, 0.22, 0.2, 'triangle');
    }
  }

  _synthKick(now, startFreq, endFreq, dur, amp) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(24, endFreq), now + dur);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _synthSnare(now, dur, toneFreq, amp) {
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.32));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = Math.min(8000, Math.max(400, toneFreq));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    noise.start(now);
  }

  _synthHat(now, dur, freq, amp) {
    const bufLen = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufLen, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufLen * 0.25));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = Math.min(12000, Math.max(2000, freq));
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    noise.connect(hp);
    hp.connect(gain);
    gain.connect(this.musicGain);
    noise.start(now);
  }

  _synthRhodes(now, freq, dur, amp) {
    const osc = this.ctx.createOscillator();
    const tine = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const tineGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    tine.type = 'triangle';
    tine.frequency.setValueAtTime(freq * 2.0, now);
    tineGain.gain.setValueAtTime(amp * 0.35, now);
    tineGain.gain.exponentialRampToValueAtTime(0.0005, now + dur * 0.35);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    tine.connect(tineGain);
    tineGain.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    tine.start(now);
    osc.stop(now + dur + 0.02);
    tine.stop(now + dur + 0.02);
  }

  _synthBass(now, freq, dur, amp, type = 'sawtooth') {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq * 4.2, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(80, freq * 1.3), now + dur);
    filter.Q.value = 2.2;
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  _synthAcid303(now, freq, dur, cutoff, amp) {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, now);
    filter.type = 'lowpass';
    filter.Q.value = 11.5;
    filter.frequency.setValueAtTime(Math.min(10000, cutoff), now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(140, freq * 1.4), now + dur);
    gain.gain.setValueAtTime(amp, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.musicGain);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  dispose() {
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
    }
    if (this.streamAudioEl) {
      this.streamAudioEl.pause();
      this.streamAudioEl.src = '';
    }
    if (this.ytPlayer && typeof this.ytPlayer.destroy === 'function') {
      try {
        this.ytPlayer.destroy();
      } catch {
        // Ignore
      }
      this.ytPlayer = null;
    }
    if (this.customObjectUrl) {
      URL.revokeObjectURL(this.customObjectUrl);
    }
    if (this.ctx) {
      this.ctx.close();
      this.ctx = null;
    }
  }
}
