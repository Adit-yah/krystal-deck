'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import {
  CASSETTES,
  createDefaultCassetteAssets,
  createCustomSongTexture,
  extractAudioMetadata,
} from './cassettes';
import { BACKDROP_VERT, BACKDROP_FRAG } from './shaders';
import {
  BAY_X,
  BAY_Y,
  DOOR_HINGE_Y,
  DOOR_HINGE_Z,
  PLAYER_COLOR_VARIANTS,
  buildWalkmanPlayerScene,
  applyPlayerDismantle,
  placeCassetteOnDoorTrack,
} from './deckGeometry';
import { KrystalAudioEngine } from './audioEngine';
import {
  compressImageToDataUrl,
  saveCollectionToStorage,
  loadCollectionFromStorage,
  savePrefsToStorage,
  loadPrefsFromStorage,
  buildShareableDeckUrl,
  parseSharedDeckFromUrl,
  searchOnlineSongsClientFallback,
  resolveMediaUrlWithFallback,
  loadCoverImageWithFallback,
} from './clientMusicApi';

const BACKDROP_Z = -68;
const DOCK_CLEAR = 108;

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return 1 - Math.pow(1 - t, 3);
}

function formatTime(sec) {
  if (!sec || !isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export default function DeckStage() {
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const stageApiRef = useRef({});
  const audioInputRef = useRef(null);
  const coverInputRef = useRef(null);
  const cassetteListRef = useRef([]);
  const recommendedListRef = useRef([]);
  const queueModeRef = useRef('saved');
  const playedHistoryRef = useRef(new Set());
  const recSeedIdxRef = useRef(0);
  const recFetchInFlightRef = useRef(false);
  const maxAnisoRef = useRef(4);
  const transientCassetteRef = useRef(null);
  const playerColorIdRef = useRef('champagne');

  // Cassette Player & Sequenced Cassette Collection UI State
  const [ready, setReady] = useState(false);
  const [cassetteList, setCassetteList] = useState([]);
  const [recommendedList, setRecommendedList] = useState([]);
  const [isLoadingRecommendations, setIsLoadingRecommendations] = useState(false);
  const [queueMode, setQueueMode] = useState('saved'); // 'saved' | 'recommended'
  const [volume, setVolume] = useState(0.85);
  const [muted, setMuted] = useState(false);
  const [transientCassette, setTransientCassette] = useState(null);
  const [activeCassetteId, setActiveCassetteId] = useState('cas-0');
  const [autoMode, setAutoMode] = useState(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [draggedCassetteIdx, setDraggedCassetteIdx] = useState(null);
  const [playerColorId, setPlayerColorId] = useState('champagne');
  const [hoveredColorId, setHoveredColorId] = useState(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [transportMode, setTransportMode] = useState('PLAY'); // 'PLAY' | 'PAUSE' | 'REW' | 'FF' | 'STOP'
  const [doorOpen, setDoorOpen] = useState(false);
  const [tapeEjected, setTapeEjected] = useState(false);
  const [dismantled, setDismantled] = useState(false);
  const [autoSpin360, setAutoSpin360] = useState(false);
  const [side, setSide] = useState('A');
  const [isChangingCassette, setIsChangingCassette] = useState(false);
  const [choreoStepLabel, setChoreoStepLabel] = useState('');
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  // Right-Side Online Song Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [addingTrackId, setAddingTrackId] = useState(null);
  const [playingTrackId, setPlayingTrackId] = useState(null);

  // Custom Song Studio State (Local Audio File + YouTube + Spotify Links)
  const [showSongModal, setShowSongModal] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftArtist, setDraftArtist] = useState('');
  const [draftAccent, setDraftAccent] = useState('#ff3b1f');
  const [draftAudioFile, setDraftAudioFile] = useState(null);
  const [draftRemoteSource, setDraftRemoteSource] = useState(null);
  const [draftMediaUrl, setDraftMediaUrl] = useState('');
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [urlResolveStatus, setUrlResolveStatus] = useState(null);
  const [showSpotifyEmbed, setShowSpotifyEmbed] = useState(false);
  const [draftCoverImg, setDraftCoverImg] = useState(null);
  const [draftCoverPreview, setDraftCoverPreview] = useState(null);
  const [songProgress, setSongProgress] = useState({ currentTime: 0, duration: 0, progress: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 1. Initialize Clean Hardware-Antialiased WebGLRenderer with Supersampled Clarity
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    const dpr = Math.min((window.devicePixelRatio || 1) * 1.25, 2.5);
    renderer.setPixelRatio(dpr);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = false;
    container.appendChild(renderer.domElement);

    // 2. Initialize WebAudio Synthesizer & Custom Song Engine
    const audio = new KrystalAudioEngine();
    engineRef.current = audio;

    // 3. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(
      27,
      container.clientWidth / container.clientHeight,
      10,
      1500
    );
    camera.position.set(0, 0, 395);
    camera.lookAt(0, 0, 0);

    // 4. RayCue-Style Studio Softbox Lighting (Zero Shadow-Map Stipple Noise)
    const hemiLight = new THREE.HemisphereLight(0xfffdf9, 0xe8e2d8, 0.72);
    hemiLight.position.set(0, 200, 120);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf2, 1.55);
    keyLight.position.set(-125, 165, 235);
    keyLight.castShadow = false;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xf6f8ff, 0.88);
    rimLight.position.set(165, 95, 175);
    scene.add(rimLight);

    const bottomFill = new THREE.DirectionalLight(0xfffcf7, 0.48);
    bottomFill.position.set(0, -150, 150);
    scene.add(bottomFill);

    // 5. Restore Saved Preferences & Cassette Collection from Shared URL (`?deck=...`) or `localStorage`
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    maxAnisoRef.current = maxAniso;
    const sharedDeck = parseSharedDeckFromUrl();
    const savedPrefs = loadPrefsFromStorage();
    const savedCollection = loadCollectionFromStorage();

    const validSkinIds = new Set(PLAYER_COLOR_VARIANTS.map((v) => v.id));
    const initialSkinId =
      (sharedDeck?.playerColorId && validSkinIds.has(sharedDeck.playerColorId)
        ? sharedDeck.playerColorId
        : null) ||
      (savedPrefs?.playerColorId && validSkinIds.has(savedPrefs.playerColorId)
        ? savedPrefs.playerColorId
        : null) ||
      'champagne';

    const initialAutoMode =
      sharedDeck?.autoMode !== undefined
        ? Boolean(sharedDeck.autoMode)
        : savedPrefs?.autoMode !== undefined
        ? Boolean(savedPrefs.autoMode)
        : true;

    const initialQueueMode =
      savedPrefs?.queueMode === 'recommended' ? 'recommended' : 'saved';
    const initialVolume =
      typeof savedPrefs?.volume === 'number' && isFinite(savedPrefs.volume)
        ? Math.max(0, Math.min(1, savedPrefs.volume))
        : 0.85;
    const initialMuted = Boolean(savedPrefs?.muted);

    const initialLeftOpen =
      savedPrefs?.leftPanelOpen !== undefined ? Boolean(savedPrefs.leftPanelOpen) : true;
    const initialRightOpen =
      savedPrefs?.rightPanelOpen !== undefined ? Boolean(savedPrefs.rightPanelOpen) : true;

    playerColorIdRef.current = initialSkinId;
    queueModeRef.current = initialQueueMode;
    setPlayerColorId(initialSkinId);
    setAutoMode(initialAutoMode);
    setQueueMode(initialQueueMode);
    setVolume(initialVolume);
    setMuted(initialMuted);
    setLeftPanelOpen(initialLeftOpen);
    setRightPanelOpen(initialRightOpen);

    audio.setVolume(initialVolume);
    audio.setMuted(initialMuted);

    const buildDefaultCollection = () =>
      CASSETTES.map((c) => {
        const asset = createDefaultCassetteAssets(c);
        asset.texture.anisotropy = maxAniso;
        return {
          id: `cas-${c.id}`,
          externalId: `default-${c.id}`,
          title: c.title,
          artist: c.artist,
          subtitle: c.subtitle,
          shellAccent: c.shellAccent || '#253545',
          synthPreset: c.synthPreset,
          sourceType: c.streamUrl ? 'online' : c.youtubeId ? 'youtube' : 'synth',
          thumbUrl: asset.thumbUrl,
          coverUrl: null,
          coverDataUrl: null,
          texture: asset.texture,
          file: null,
          streamUrl: c.streamUrl || null,
          youtubeId: c.youtubeId || null,
          backupYoutubeIds: c.backupYoutubeIds || [],
          durationSec: c.durationSec || 210,
          spotifyId: null,
          spotifyType: 'track',
          isDefault: true,
        };
      });

    let initialCollection = [];
    const rawSavedList = sharedDeck?.list || savedCollection;
    const asyncCoverHydrations = [];

    if (Array.isArray(rawSavedList) && rawSavedList.length > 0) {
      initialCollection = rawSavedList
        .map((saved, idx) => {
          if (!saved || typeof saved !== 'object') return null;
          const defaultSpec = CASSETTES.find(
            (c) =>
              saved.id === `cas-${c.id}` ||
              saved.externalId === `default-${c.id}` ||
              (saved.isDefault &&
                saved.title?.toLowerCase() === c.title.toLowerCase() &&
                saved.artist?.toLowerCase() === c.artist.toLowerCase())
          );

          if (defaultSpec) {
            const asset = createDefaultCassetteAssets(defaultSpec);
            asset.texture.anisotropy = maxAniso;
            return {
              id: `cas-${defaultSpec.id}`,
              externalId: `default-${defaultSpec.id}`,
              onlineTrackId: saved.onlineTrackId || null,
              title: defaultSpec.title,
              artist: defaultSpec.artist,
              subtitle: defaultSpec.subtitle,
              shellAccent: defaultSpec.shellAccent || '#253545',
              synthPreset: defaultSpec.synthPreset,
              sourceType:
                defaultSpec.streamUrl
                  ? 'online'
                  : saved.sourceType || (defaultSpec.youtubeId ? 'youtube' : 'synth'),
              thumbUrl: asset.thumbUrl,
              coverUrl: null,
              coverDataUrl: null,
              texture: asset.texture,
              file: null,
              streamUrl: defaultSpec.streamUrl || saved.streamUrl || null,
              youtubeId: saved.youtubeId || defaultSpec.youtubeId || null,
              backupYoutubeIds:
                Array.isArray(saved.backupYoutubeIds) && saved.backupYoutubeIds.length > 0
                  ? saved.backupYoutubeIds
                  : defaultSpec.backupYoutubeIds || [],
              durationSec:
                defaultSpec.durationSec ||
                (saved.durationSec && saved.durationSec > 45 ? saved.durationSec : 210),
              spotifyId: saved.spotifyId || null,
              spotifyType: saved.spotifyType || 'track',
              isDefault: true,
            };
          }

          // Reconstruct custom / user-saved song cassette
          const { texture, dataUrl } = createCustomSongTexture({
            title: saved.title || 'Custom Track',
            artist: saved.artist || 'Studio Master',
            coverImg: null,
            accentColor: saved.shellAccent || '#ff3b1f',
          });
          texture.anisotropy = maxAniso;

          const entryId = saved.id || `cas-restored-${idx}-${Date.now()}`;
          const restoredTitle = saved.title || 'Custom Track';
          const restoredArtist = saved.artist || 'Studio Master';
          let restoredStreamUrl = saved.streamUrl || null;
          if (
            restoredStreamUrl &&
            !restoredStreamUrl.startsWith('gdstudio:') &&
            restoredStreamUrl.includes('itunes.apple.com')
          ) {
            restoredStreamUrl = `gdstudio:query:${restoredTitle} ${restoredArtist}||${restoredStreamUrl}`;
          } else if (!restoredStreamUrl && restoredTitle && saved.sourceType !== 'file') {
            restoredStreamUrl = `gdstudio:query:${restoredTitle} ${restoredArtist}||`;
          }

          const entry = {
            id: entryId,
            externalId: saved.externalId || saved.onlineTrackId || null,
            onlineTrackId: saved.onlineTrackId || saved.externalId || null,
            title: restoredTitle,
            artist: restoredArtist,
            subtitle: saved.subtitle || '',
            shellAccent: saved.shellAccent || '#ff3b1f',
            synthPreset: saved.synthPreset || 'custom-file',
            sourceType: restoredStreamUrl
              ? 'online'
              : saved.sourceType || (saved.youtubeId ? 'youtube' : 'synth'),
            thumbUrl: saved.coverUrl || dataUrl,
            coverUrl: saved.coverUrl || null,
            coverDataUrl:
              typeof saved.coverUrl === 'string' && saved.coverUrl.startsWith('data:')
                ? saved.coverUrl
                : null,
            cassetteUrl: dataUrl,
            texture,
            file: null,
            streamUrl: restoredStreamUrl,
            youtubeId: saved.youtubeId || null,
            backupYoutubeIds: Array.isArray(saved.backupYoutubeIds) ? saved.backupYoutubeIds : [],
            durationSec:
              saved.durationSec && saved.durationSec > 45 ? saved.durationSec : 210,
            spotifyId: saved.spotifyId || null,
            spotifyType: saved.spotifyType || 'track',
            isDefault: false,
          };

          if (saved.coverUrl) {
            asyncCoverHydrations.push({ entryId, coverUrl: saved.coverUrl });
          }

          return entry;
        })
        .filter(Boolean);
    }

    if (initialCollection.length === 0) {
      initialCollection = buildDefaultCollection();
    }

    const preferredActiveId = sharedDeck?.activeCassetteId || savedPrefs?.activeCassetteId;
    const initialActiveItem =
      initialCollection.find((c) => c.id === preferredActiveId) || initialCollection[0];

    cassetteListRef.current = initialCollection;
    setCassetteList(initialCollection);
    setActiveCassetteId(initialActiveItem.id);

    // Persist if loaded from a shared URL
    if (sharedDeck) {
      saveCollectionToStorage(initialCollection);
      savePrefsToStorage({
        playerColorId: initialSkinId,
        activeCassetteId: initialActiveItem.id,
        autoMode: initialAutoMode,
      });
    }

    // 6. Analytical White Studio Cyclorama Backdrop with Real-Time Soft Drop Shadows
    const mTrayInv = new THREE.Matrix4();
    const mLidInv = new THREE.Matrix4();
    const mCassetteInv = new THREE.Matrix4();
    const backdropMat = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT,
      fragmentShader: BACKDROP_FRAG,
      uniforms: {
        uTrayInv: { value: mTrayInv },
        uLidInv: { value: mLidInv },
        uCassetteInv: { value: mCassetteInv },
        uLight: { value: new THREE.Vector3(-0.28, 0.46, 1.0).normalize() },
        uScale: { value: 1.0 },
      },
      depthWrite: false,
    });
    const backdropMesh = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), backdropMat);
    backdropMesh.position.z = BACKDROP_Z;
    scene.add(backdropMesh);

    // 7. Build Detailed 3D FiiO CP13-Style Cassette Player & Removable Cassette
    const walkman = buildWalkmanPlayerScene(renderer, initialActiveItem.texture);
    if (playerColorIdRef.current) {
      walkman.setColorVariant?.(playerColorIdRef.current);
    }
    scene.environment = walkman.envMap;
    scene.add(walkman.playerRoot);

    // Create local bay anchors inside `playerRoot`, while placing `activeCassette.group` and
    // `incomingCassette.group` in `scene` so they can animate both inside the bay AND in Center 360° Stage!
    const bayAnchor = new THREE.Object3D();
    const incomingBayAnchor = new THREE.Object3D();
    walkman.playerRoot.add(bayAnchor);
    walkman.playerRoot.add(incomingBayAnchor);
    scene.add(walkman.activeCassette.group);
    scene.add(walkman.incomingCassette.group);

    // Helper to compute deep, rich dark anodized shell color per cassette (no pastel washout!)
    const getShellColorForAccent = (accentHex = '#253545') => {
      return new THREE.Color('#15171c').lerp(new THREE.Color(accentHex || '#253545'), 0.06);
    };

    const getCassetteById = (casId) => {
      const fromList = cassetteListRef.current.find((item) => item.id === casId);
      if (fromList) return fromList;
      const fromRec = recommendedListRef.current.find((item) => item.id === casId);
      if (fromRec) return fromRec;
      if (transientCassetteRef.current && transientCassetteRef.current.id === casId) {
        return transientCassetteRef.current;
      }
      return cassetteListRef.current[0];
    };

    // Initialize activeCassette shell color for initial active cassette
    walkman.activeCassette.shellMat.color.copy(
      getShellColorForAccent(initialActiveItem.shellAccent)
    );

    // ============================================================================
    // CASSETTE PLAYER STATE, 360° CENTER INSPECT & 6-STAGE DUAL-CASSETTE SWAP
    // ============================================================================
    const st = {
      mode: 'PLAY', // 'PLAY' | 'PAUSE' | 'REW' | 'FF' | 'STOP'
      doorOpen: false,
      tapeEjected: false,
      dismantled: false,
      targetDismantle: 0.0,
      currentDismantle: 0.0,
      doorAngle: 0.0,
      targetDoorAngle: 0.0,
      targetEjectLift: 0.0,
      currentEjectLift: 0.0,
      pendingCloseDoor: false,
      pendingTransportMode: null,
      reelAngle: 0.0,
      showPhase: 0.0,
      side: 'A',
      currentCassetteId: initialActiveItem.id,
      autoAdvance: initialAutoMode,

      // 360° Center Cassette Inspection State (when cassette is taken out of player)
      inspectYaw: 0.0,
      inspectPitch: 0.06,
      inspectVelYaw: 0.0,
      inspectVelPitch: 0.0,
      inspectAutoSpin: false,

      // Choreographed Dual-Cassette Change / Side Flip State
      choreoActive: false,
      choreoType: null, // 'INSPECT_SWAP' | 'SWAP' | 'FLIP'
      choreoTime: 0.0,
      choreoDuration: 1.75,
      choreoStartDoorAngle: 0.0,
      pendingCassetteId: initialActiveItem.id,
      midAirSwapped: false,
      ejectClickPlayed: false,
      seatClickPlayed: false,
      closeClickPlayed: false,
      lastStepCode: '',
      baseSideYaw: 0.0,
      displaySideYaw: 0.0,

      // Drag & pointer-lean spring state (starts angled slightly like the reference photo!)
      dragging: false,
      downX: 0,
      downY: 0,
      lastX: 0,
      lastY: 0,
      moved: 0,
      dragYaw: -0.28,
      dragPitch: 0.14,
      velYaw: 0,
      velPitch: 0,
      hoverX: 0,
      hoverY: 0,
      smoothHoverX: 0,
      smoothHoverY: 0,
      sceneScale: 0.82,
    };

    // Hydrate cover art images & missing ad-free streamUrls onto restored custom cassettes asynchronously
    if (asyncCoverHydrations.length > 0) {
      asyncCoverHydrations.forEach(async ({ entryId, coverUrl, hydrateStreamOnly, title, artist }) => {
        if (hydrateStreamOnly) {
          try {
            const q = `${title || ''} ${artist || ''}`.trim();
            if (!q) return;
            const itRes = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=5`
            );
            if (!itRes.ok) return;
            const itData = await itRes.json();
            const hit = Array.isArray(itData?.results)
              ? itData.results.find((r) => r && r.previewUrl)
              : null;
            if (!hit?.previewUrl) return;
            const target = cassetteListRef.current.find((c) => c.id === entryId);
            if (!target || target.streamUrl) return;
            target.streamUrl = hit.previewUrl;
            target.sourceType = 'online';
            saveCollectionToStorage(cassetteListRef.current);
            setCassetteList([...cassetteListRef.current]);
          } catch {
            // Optional hydration
          }
          return;
        }
        const { img, resolvedUrl, compressedDataUrl } = await loadCoverImageWithFallback(coverUrl);
        if (!img) return;
        const target = cassetteListRef.current.find((c) => c.id === entryId);
        if (!target) return;
        const { texture: newTex, dataUrl } = createCustomSongTexture({
          title: target.title,
          artist: target.artist,
          coverImg: img,
          accentColor: target.shellAccent || '#ff3b1f',
        });
        newTex.anisotropy = maxAniso;
        const oldTex = target.texture;
        target.texture = newTex;
        target.cassetteUrl = dataUrl;
        target.thumbUrl = resolvedUrl || dataUrl;
        if (compressedDataUrl) {
          target.coverDataUrl = compressedDataUrl;
          target.coverUrl = compressedDataUrl;
        }
        if (st.currentCassetteId === target.id) {
          walkman.activeCassette.artMat.map = newTex;
          walkman.activeCassette.artMat.emissiveMap = newTex;
          walkman.activeCassette.artMat.needsUpdate = true;
        }
        if (oldTex) {
          setTimeout(() => oldTex.dispose(), 1500);
        }
        setCassetteList([...cassetteListRef.current]);
      });
    }

    // Wire Auto-Advance Mode callback so when any song finishes, it automatically switches to the next cassette in sequence (Saved OR Continuous Recommended)!
    audio.setAutoAdvance(initialAutoMode);
    audio.onTrackEnded = () => {
      if (!st.autoAdvance) return;
      stageApiRef.current.playNextCassette?.();
    };

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2();

    const updateLayout = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      const curDpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(curDpr);
      renderer.setSize(w, h);

      camera.aspect = w / h;
      camera.clearViewOffset?.();
      camera.updateProjectionMatrix();

      const aspect = w / Math.max(1, h - DOCK_CLEAR);
      st.sceneScale = Math.min(0.84, Math.max(0.54, aspect * 0.64));
      backdropMat.uniforms.uScale.value = st.sceneScale;
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);

    // Pre-configure `incomingCassette` with the new tape's artwork & shell tint BEFORE it glides in!
    const prepareIncomingCassette = (casId) => {
      const item = getCassetteById(casId);
      if (!item) return;
      walkman.incomingCassette.artMat.map = item.texture;
      walkman.incomingCassette.artMat.emissiveMap = item.texture;
      walkman.incomingCassette.artMat.needsUpdate = true;
      walkman.incomingCassette.shellMat.color.copy(
        getShellColorForAccent(item.shellAccent)
      );
      walkman.incomingCassette.reelLeft.rotation.z = st.reelAngle;
      walkman.incomingCassette.reelRight.rotation.z = st.reelAngle * 1.18;
    };

    // Commit incoming cassette texture, shell tint, and audio onto `activeCassette`
    const commitIncomingCassetteToActive = (casId) => {
      const item = getCassetteById(casId);
      if (!item) return;

      walkman.activeCassette.artMat.map = item.texture;
      walkman.activeCassette.artMat.emissiveMap = item.texture;
      walkman.activeCassette.artMat.needsUpdate = true;
      walkman.activeCassette.shellMat.color.copy(
        getShellColorForAccent(item.shellAccent)
      );

      if (item.streamUrl) {
        audio.loadRemoteAudioStream(item.streamUrl);
        if (item.sourceType !== 'spotify') setShowSpotifyEmbed(false);
      } else if (item.youtubeId) {
        audio.loadYouTubeVideo(item.youtubeId, item.streamUrl, item.backupYoutubeIds);
        if (item.sourceType !== 'spotify') setShowSpotifyEmbed(false);
      } else if (item.sourceType === 'file' && item.file) {
        audio.loadCustomAudioFile(item.file);
        setShowSpotifyEmbed(false);
      } else {
        audio.setPreset(item.synthPreset || 'neon-rain', st.side);
        setShowSpotifyEmbed(false);
      }

      st.currentCassetteId = item.id;
      st.loadedAudioCassetteId = item.id;
      st.loadedAudioStreamUrl = item.streamUrl || null;
      setActiveCassetteId(item.id);

      const historyKey =
        item.onlineTrackId ||
        item.externalId ||
        item.youtubeId ||
        `${(item.title || '').toLowerCase()}|${(item.artist || '').toLowerCase()}`;
      if (historyKey) {
        playedHistoryRef.current.add(historyKey);
      }

      if (!item.isTransient && !item.isRecommended) {
        savePrefsToStorage({ activeCassetteId: item.id });
      }
    };

    // --- Expose Cassette Player & Collection Controls ---
    stageApiRef.current = {
      setPlayerColorVariant: (variantId) => {
        playerColorIdRef.current = variantId;
        walkman.setColorVariant?.(variantId);
        setPlayerColorId(variantId);
        savePrefsToStorage({ playerColorId: variantId });
        audio.playMechanicalClick('button');
      },

      toggleAutoMode: () => {
        st.autoAdvance = !st.autoAdvance;
        audio.setAutoAdvance(st.autoAdvance);
        setAutoMode(st.autoAdvance);
        savePrefsToStorage({ autoMode: st.autoAdvance });
        audio.playMechanicalClick('button');
      },

      playNextCassette: () => {
        if (queueModeRef.current === 'recommended') {
          const recList = recommendedListRef.current;
          if (recList && recList.length > 0) {
            const curIdx = recList.findIndex((c) => c.id === st.currentCassetteId);
            const nextIdx = curIdx >= 0 ? curIdx + 1 : 0;
            if (nextIdx < recList.length) {
              const nextRec = recList[nextIdx];
              stageApiRef.current.changeCassetteById?.(nextRec.id, {
                forceSwapEvenIfSame: true,
                forcePlay: true,
              });
              // Automatically replenish recommendations when nearing the end of the queue!
              if (recList.length - nextIdx <= 3) {
                stageApiRef.current.fetchMoreRecommendations?.(nextRec, { append: true });
              }
              return;
            }
          }
          // If recommended queue is empty or exhausted, fetch fresh recommendations and play immediately!
          const curItem = getCassetteById(st.currentCassetteId);
          stageApiRef.current.fetchMoreRecommendations?.(curItem, {
            append: false,
            playFirstWhenReady: true,
          });
          return;
        }

        const list = cassetteListRef.current;
        if (!list || list.length === 0) return;
        const curIdx = list.findIndex((c) => c.id === st.currentCassetteId);
        const nextItem = list[(curIdx + 1) % list.length];
        if (nextItem) {
          stageApiRef.current.changeCassetteById?.(nextItem.id, {
            forceSwapEvenIfSame: true,
            forcePlay: true,
          });
        }
      },

      playPrevCassette: () => {
        const activeList =
          queueModeRef.current === 'recommended' && recommendedListRef.current.length > 0
            ? recommendedListRef.current
            : cassetteListRef.current;
        if (!activeList || activeList.length === 0) return;
        const curIdx = activeList.findIndex((c) => c.id === st.currentCassetteId);
        const baseIdx = curIdx >= 0 ? curIdx : 0;
        const prevItem = activeList[(baseIdx - 1 + activeList.length) % activeList.length];
        if (prevItem) {
          stageApiRef.current.changeCassetteById?.(prevItem.id, {
            forceSwapEvenIfSame: true,
            forcePlay: true,
          });
        }
      },

      /**
       * Fetches a fresh batch of recommended songs based on the current/seed track and saved collection,
       * presses them onto 3D cassette textures, and populates or appends to `recommendedList`.
       */
      fetchMoreRecommendations: async (
        seedTrack = null,
        { append = false, playFirstWhenReady = false } = {}
      ) => {
        if (recFetchInFlightRef.current && append) return;
        recFetchInFlightRef.current = true;
        setIsLoadingRecommendations(true);

        try {
          const curItem = seedTrack || getCassetteById(st.currentCassetteId);
          const savedList = cassetteListRef.current || [];
          const genericArtists = new Set([
            'krystal audio lab',
            'studio master',
            'featured artist',
            'unknown artist',
            'custom track',
          ]);

          const candidateQueries = [];
          if (
            curItem?.artist &&
            !genericArtists.has(curItem.artist.toLowerCase().trim())
          ) {
            const primaryArtist = curItem.artist.split(',')[0].trim();
            candidateQueries.push(`${primaryArtist} hits`);
            if (curItem.title) {
              candidateQueries.push(`${primaryArtist} ${curItem.title}`);
            }
          }

          for (let i = 0; i < savedList.length; i++) {
            const s = savedList[i];
            if (s?.artist && !genericArtists.has(s.artist.toLowerCase().trim())) {
              const primary = s.artist.split(',')[0].trim();
              if (!candidateQueries.includes(`${primary} hits`)) {
                candidateQueries.push(`${primary} hits`);
              }
            }
          }

          const discoverySeeds = [
            'The Weeknd synthwave hits',
            'Daft Punk electronic classics',
            'Dua Lipa Tame Impala pop',
            'M83 Kavinsky retro synth',
            'Empire of the Sun Glass Animals',
            'Michael Jackson Prince 80s hits',
            'Coldplay Imagine Dragons hits',
            'Post Malone Bruno Mars hits',
          ];
          for (let i = 0; i < discoverySeeds.length; i++) {
            candidateQueries.push(discoverySeeds[i]);
          }

          const queryIdx = recSeedIdxRef.current % candidateQueries.length;
          recSeedIdxRef.current += 1;
          const chosenQuery = candidateQueries[queryIdx] || 'The Weeknd Daft Punk hits';

          let searchData = await searchOnlineSongsClientFallback(chosenQuery);
          let rawResults = Array.isArray(searchData?.results) ? searchData.results : [];

          const existingIds = new Set();
          const existingTitles = new Set();
          if (curItem) {
            if (curItem.externalId) existingIds.add(curItem.externalId);
            if (curItem.onlineTrackId) existingIds.add(curItem.onlineTrackId);
            if (curItem.title) existingTitles.add(curItem.title.toLowerCase().trim());
          }
          if (append) {
            for (const r of recommendedListRef.current) {
              if (r.externalId) existingIds.add(r.externalId);
              if (r.onlineTrackId) existingIds.add(r.onlineTrackId);
              if (r.title) existingTitles.add(r.title.toLowerCase().trim());
            }
          }
          for (const h of playedHistoryRef.current) {
            existingIds.add(h);
          }

          let filtered = rawResults.filter((t) => {
            if (!t || (!t.streamUrl && !t.youtubeId)) return false;
            const normTitle = (t.title || '').toLowerCase().trim();
            if (existingIds.has(t.id) || existingTitles.has(normTitle)) return false;
            return true;
          });

          // If too few tracks after filtering, fetch a fallback discovery seed
          if (filtered.length < 4) {
            const fallbackQuery =
              discoverySeeds[recSeedIdxRef.current % discoverySeeds.length];
            recSeedIdxRef.current += 1;
            const fbData = await searchOnlineSongsClientFallback(fallbackQuery);
            const fbResults = Array.isArray(fbData?.results) ? fbData.results : [];
            for (const t of fbResults) {
              if (!t || (!t.streamUrl && !t.youtubeId)) continue;
              const normTitle = (t.title || '').toLowerCase().trim();
              if (
                !existingIds.has(t.id) &&
                !existingTitles.has(normTitle) &&
                !filtered.some((f) => f.id === t.id)
              ) {
                filtered.push(t);
              }
            }
          }

          if (filtered.length === 0 && rawResults.length > 0) {
            playedHistoryRef.current.clear();
            filtered = rawResults.filter((t) => t && (t.streamUrl || t.youtubeId));
          }

          const accentPalette = [
            '#ff3b1f',
            '#2e6ef7',
            '#10b981',
            '#d97706',
            '#8b5cf6',
            '#ec4899',
          ];

          const newRecEntries = filtered.slice(0, 10).map((track, idx) => {
            const accentColor =
              track.accentColor || accentPalette[idx % accentPalette.length];
            const { texture, dataUrl } = createCustomSongTexture({
              title: track.title || 'Recommended Track',
              artist: track.artist || 'Featured Artist',
              coverImg: null,
              accentColor,
            });
            texture.anisotropy = maxAnisoRef.current || 4;

            const recEntry = {
              id: `cas-rec-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
              externalId: track.id,
              onlineTrackId: track.id,
              title: track.title || 'Recommended Track',
              artist: track.artist || 'Featured Artist',
              shellAccent: accentColor,
              synthPreset: 'custom-file',
              sourceType:
                track.sourceType ||
                (track.streamUrl ? 'online' : track.youtubeId ? 'youtube' : 'synth'),
              thumbUrl: track.thumbUrl || track.coverUrl || dataUrl,
              coverUrl: track.coverUrl || track.thumbUrl || null,
              coverDataUrl: null,
              coverImg: null,
              cassetteUrl: dataUrl,
              texture,
              file: null,
              streamUrl: track.streamUrl || null,
              youtubeId: track.youtubeId || null,
              backupYoutubeIds: track.backupYoutubeIds || [],
              durationSec: track.durationSec || 210,
              isDefault: false,
              isRecommended: true,
            };

            // Hydrate 3D cassette texture with album art asynchronously in the background
            if (recEntry.coverUrl) {
              loadCoverImageWithFallback(recEntry.coverUrl).then(
                ({ img, compressedDataUrl } = {}) => {
                  if (!img) return;
                  recEntry.coverImg = img;
                  const { texture: hydratedTex, dataUrl: hydratedUrl } =
                    createCustomSongTexture({
                      title: recEntry.title,
                      artist: recEntry.artist,
                      coverImg: img,
                      accentColor: recEntry.shellAccent,
                    });
                  hydratedTex.anisotropy = maxAnisoRef.current || 4;
                  const oldTex = recEntry.texture;
                  recEntry.texture = hydratedTex;
                  recEntry.cassetteUrl = hydratedUrl;
                  const comp =
                    compressedDataUrl || compressImageToDataUrl(img, 240, 0.82);
                  if (comp) {
                    recEntry.coverDataUrl = comp;
                    recEntry.thumbUrl = comp;
                  }
                  if (st.currentCassetteId === recEntry.id) {
                    setCassetteArtwork(
                      walkman.activeCassette,
                      hydratedTex,
                      recEntry.shellAccent
                    );
                  }
                  if (oldTex && oldTex !== hydratedTex) {
                    setTimeout(() => oldTex.dispose(), 1500);
                  }
                }
              );
            }

            return recEntry;
          });

          if (newRecEntries.length > 0) {
            const nextRecList = append
              ? [...recommendedListRef.current, ...newRecEntries].slice(-24)
              : newRecEntries;
            recommendedListRef.current = nextRecList;
            setRecommendedList(nextRecList);

            if (playFirstWhenReady) {
              stageApiRef.current.changeCassetteById?.(newRecEntries[0].id, {
                forceSwapEvenIfSame: true,
                forcePlay: true,
              });
            }
          }
        } catch {
          // Ignore transient network errors during background recommendation fetch
        } finally {
          recFetchInFlightRef.current = false;
          setIsLoadingRecommendations(false);
        }
      },

      /**
       * Plays an online song in the 3D Cassette Player WITHOUT adding it to the Left Cassette Collection!
       */
      playTransientOnlineTrack: (payload) => {
        audio.unlockAudioGesture(
          payload?.streamUrl || null,
          payload?.youtubeId || null,
          payload?.backupYoutubeIds || []
        );

        // 1. If this song is already in the Left Cassette Collection, play that cassette directly without duplicating
        const existingInList = cassetteListRef.current.find(
          (c) =>
            (payload.externalId && c.externalId === payload.externalId) ||
            (payload.onlineTrackId && c.onlineTrackId === payload.onlineTrackId) ||
            (payload.youtubeId && c.youtubeId === payload.youtubeId) ||
            (c.title.toLowerCase() === (payload.title || '').toLowerCase() &&
              c.artist.toLowerCase() === (payload.artist || '').toLowerCase())
        );
        if (existingInList) {
          if (payload.streamUrl && !existingInList.streamUrl) {
            existingInList.streamUrl = payload.streamUrl;
            if (existingInList.sourceType === 'synth') existingInList.sourceType = 'online';
          }
          if (payload.youtubeId && !existingInList.youtubeId) {
            existingInList.youtubeId = payload.youtubeId;
            existingInList.backupYoutubeIds = payload.backupYoutubeIds || [];
            if (existingInList.sourceType === 'synth') existingInList.sourceType = 'youtube';
          }
          saveCollectionToStorage(cassetteListRef.current);
          stageApiRef.current.changeCassetteById?.(existingInList.id, { forcePlay: true });
          return existingInList.id;
        }

        // 2. If this song is already the active transient cassette, just play/toggle it
        const prevTransient = transientCassetteRef.current;
        if (
          prevTransient &&
          ((payload.onlineTrackId && prevTransient.onlineTrackId === payload.onlineTrackId) ||
            (payload.externalId && prevTransient.externalId === payload.externalId) ||
            (payload.youtubeId && prevTransient.youtubeId === payload.youtubeId))
        ) {
          stageApiRef.current.changeCassetteById?.(prevTransient.id, { forcePlay: true });
          return prevTransient.id;
        }

        const { texture, dataUrl } = createCustomSongTexture({
          title: payload.title || 'Online Track',
          artist: payload.artist || 'Featured Artist',
          coverImg: payload.coverImg || null,
          accentColor: payload.accentColor || '#ff3b1f',
        });
        texture.anisotropy = maxAniso;
        const compressedCover = payload.coverImg
          ? compressImageToDataUrl(payload.coverImg, 240, 0.82)
          : null;

        const transientEntry = {
          id: `cas-online-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          externalId: payload.externalId || payload.onlineTrackId || null,
          onlineTrackId: payload.onlineTrackId || payload.externalId || null,
          title: payload.title || 'Online Track',
          artist: payload.artist || 'Featured Artist',
          shellAccent: payload.accentColor || '#ff3b1f',
          synthPreset: 'custom-file',
          sourceType:
            payload.sourceType ||
            (payload.streamUrl ? 'online' : payload.youtubeId ? 'youtube' : 'synth'),
          thumbUrl: compressedCover || payload.coverUrl || dataUrl,
          coverUrl: compressedCover || payload.coverUrl || null,
          coverDataUrl: compressedCover || null,
          cassetteUrl: dataUrl,
          texture,
          file: null,
          streamUrl: payload.streamUrl || null,
          youtubeId: payload.youtubeId || null,
          backupYoutubeIds: payload.backupYoutubeIds || [],
          durationSec: payload.durationSec || 210,
          spotifyId: payload.spotifyId || null,
          spotifyType: payload.spotifyType || 'track',
          isDefault: false,
          isTransient: true,
        };

        if (prevTransient && prevTransient.texture) {
          const oldTex = prevTransient.texture;
          setTimeout(() => {
            if (!cassetteListRef.current.some((c) => c.texture === oldTex)) {
              oldTex.dispose();
            }
          }, 2500);
        }

        transientCassetteRef.current = transientEntry;
        setTransientCassette(transientEntry);
        stageApiRef.current.changeCassetteById?.(transientEntry.id, { forcePlay: true });
        return transientEntry.id;
      },

      /**
       * Presses a new song (when user clicks `+ Add` in Right Online Search OR submits Bottom + Music Modal)
       * onto a 3D Cassette and appends it to the Left Cassette Collection!
       */
      addCassetteToCollection: (payload, { playImmediately = true } = {}) => {
        if (playImmediately) {
          audio.unlockAudioGesture(
            payload?.streamUrl || null,
            payload?.youtubeId || null,
            payload?.backupYoutubeIds || []
          );
        } else {
          audio.unlockAudioGesture(null);
        }

        const existing = cassetteListRef.current.find(
          (c) =>
            (payload.externalId && c.externalId === payload.externalId) ||
            (payload.onlineTrackId && c.onlineTrackId === payload.onlineTrackId) ||
            (payload.youtubeId && c.youtubeId === payload.youtubeId) ||
            (payload.spotifyId && c.spotifyId === payload.spotifyId) ||
            (c.title.toLowerCase() === (payload.title || '').toLowerCase() &&
              c.artist.toLowerCase() === (payload.artist || '').toLowerCase())
        );
        if (existing) {
          if (payload.streamUrl && !existing.streamUrl) {
            existing.streamUrl = payload.streamUrl;
            if (existing.sourceType === 'synth') existing.sourceType = 'online';
          }
          if (payload.youtubeId && !existing.youtubeId) {
            existing.youtubeId = payload.youtubeId;
            existing.backupYoutubeIds = payload.backupYoutubeIds || [];
            if (existing.sourceType === 'synth') existing.sourceType = 'youtube';
          }
          saveCollectionToStorage(cassetteListRef.current);
          if (playImmediately) {
            stageApiRef.current.changeCassetteById?.(existing.id, { forcePlay: true });
          } else {
            audio.playMechanicalClick('button');
          }
          return existing.id;
        }

        // If this track is currently loaded/playing as a transient cassette, promote it directly into the collection!
        const curTransient = transientCassetteRef.current;
        if (
          curTransient &&
          ((payload.onlineTrackId && curTransient.onlineTrackId === payload.onlineTrackId) ||
            (payload.externalId && curTransient.externalId === payload.externalId) ||
            (payload.youtubeId && curTransient.youtubeId === payload.youtubeId) ||
            (curTransient.title.toLowerCase() === (payload.title || '').toLowerCase() &&
              curTransient.artist.toLowerCase() === (payload.artist || '').toLowerCase()))
        ) {
          const promotedEntry = {
            ...curTransient,
            isTransient: false,
          };
          const nextList = [...cassetteListRef.current, promotedEntry];
          cassetteListRef.current = nextList;
          setCassetteList(nextList);
          saveCollectionToStorage(nextList);
          savePrefsToStorage({ activeCassetteId: promotedEntry.id });
          transientCassetteRef.current = null;
          setTransientCassette(null);
          if (playImmediately && st.currentCassetteId !== promotedEntry.id) {
            stageApiRef.current.changeCassetteById?.(promotedEntry.id, { forcePlay: true });
          } else {
            audio.playMechanicalClick('button');
          }
          return promotedEntry.id;
        }

        const { texture, dataUrl } = createCustomSongTexture({
          title: payload.title || 'Custom Track',
          artist: payload.artist || 'Studio Master',
          coverImg: payload.coverImg || null,
          accentColor: payload.accentColor || '#ff3b1f',
        });
        texture.anisotropy = maxAniso;
        const compressedCover = payload.coverImg
          ? compressImageToDataUrl(payload.coverImg, 240, 0.82)
          : null;

        const newEntry = {
          id: `cas-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          externalId: payload.externalId || payload.onlineTrackId || null,
          onlineTrackId: payload.onlineTrackId || payload.externalId || null,
          title: payload.title || 'Custom Track',
          artist: payload.artist || 'Studio Master',
          shellAccent: payload.accentColor || '#ff3b1f',
          synthPreset: 'custom-file',
          sourceType:
            payload.sourceType ||
            (payload.streamUrl
              ? 'online'
              : payload.youtubeId
              ? 'youtube'
              : payload.file
              ? 'file'
              : 'synth'),
          thumbUrl: compressedCover || payload.coverUrl || dataUrl,
          coverUrl: compressedCover || payload.coverUrl || null,
          coverDataUrl: compressedCover || null,
          cassetteUrl: dataUrl,
          texture,
          file: payload.file || null,
          streamUrl: payload.streamUrl || null,
          youtubeId: payload.youtubeId || null,
          backupYoutubeIds: payload.backupYoutubeIds || [],
          durationSec: payload.durationSec || 210,
          spotifyId: payload.spotifyId || null,
          spotifyType: payload.spotifyType || 'track',
          isDefault: false,
        };

        const nextList = [...cassetteListRef.current, newEntry];
        cassetteListRef.current = nextList;
        setCassetteList(nextList);
        saveCollectionToStorage(nextList);

        if (playImmediately) {
          savePrefsToStorage({ activeCassetteId: newEntry.id });
          stageApiRef.current.changeCassetteById?.(newEntry.id, { forcePlay: true });
        } else {
          audio.playMechanicalClick('button');
        }
        return newEntry.id;
      },

      moveCassetteInCollection: (casId, delta) => {
        const list = [...cassetteListRef.current];
        const idx = list.findIndex((c) => c.id === casId);
        if (idx < 0) return;
        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= list.length) return;
        const [item] = list.splice(idx, 1);
        list.splice(targetIdx, 0, item);
        cassetteListRef.current = list;
        setCassetteList(list);
        saveCollectionToStorage(list);
        audio.playMechanicalClick('button');
      },

      reorderCassetteInCollection: (fromIdx, toIdx) => {
        const list = [...cassetteListRef.current];
        if (
          fromIdx === null ||
          toIdx === null ||
          fromIdx === toIdx ||
          fromIdx < 0 ||
          toIdx < 0 ||
          fromIdx >= list.length ||
          toIdx >= list.length
        ) {
          return;
        }
        const [item] = list.splice(fromIdx, 1);
        list.splice(toIdx, 0, item);
        cassetteListRef.current = list;
        setCassetteList(list);
        saveCollectionToStorage(list);
        audio.playMechanicalClick('button');
      },

      deleteCassetteFromCollection: (casId) => {
        const list = [...cassetteListRef.current];
        if (list.length <= 1) return; // Always keep at least 1 cassette in the deck
        const idx = list.findIndex((c) => c.id === casId);
        if (idx < 0) return;
        const [removed] = list.splice(idx, 1);
        cassetteListRef.current = list;
        setCassetteList(list);
        saveCollectionToStorage(list);

        if (st.currentCassetteId === casId) {
          const nextActive = list[Math.min(idx, list.length - 1)] || list[0];
          if (nextActive) {
            savePrefsToStorage({ activeCassetteId: nextActive.id });
            stageApiRef.current.changeCassetteById?.(nextActive.id, { forceSwapEvenIfSame: true });
          }
        } else {
          audio.playMechanicalClick('button');
        }
        if (removed && !removed.isDefault && removed.texture) {
          setTimeout(() => removed.texture.dispose(), 2000);
        }
      },

      setTransport: (newMode) => {
        if (st.choreoActive && st.choreoType !== 'INSPECT_SWAP') return;
        const wasUnlocked = st.audioUnlocked;
        st.audioUnlocked = true;
        setAudioUnlocked(true);

        const curItem = getCassetteById(st.currentCassetteId);
        if (!wasUnlocked) {
          audio.unlockAudioGesture(
            curItem?.streamUrl || null,
            curItem?.youtubeId || null,
            curItem?.backupYoutubeIds || []
          );
        } else {
          audio.unlockAudioGesture();
        }

        if (newMode === 'FLIP') {
          stageApiRef.current.flipCassetteSide?.();
          return;
        }

        if (newMode === 'STOP') {
          st.pendingCloseDoor = false;
          st.pendingTransportMode = null;
          if (st.mode === 'STOP') {
            stageApiRef.current.toggleDoor?.();
            return;
          }
          st.mode = 'STOP';
          setTransportMode('STOP');
          audio.setTransportMode('STOP');
          audio.playMechanicalClick('button');
          return;
        }

        // If an out-of-player switch was mid-glide, commit it before returning cassette to bay
        if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
          if (!st.midAirSwapped) {
            st.midAirSwapped = true;
            commitIncomingCassetteToActive(st.pendingCassetteId);
          }
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          st.choreoActive = false;
        }

        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }

        // On first click when audio wasn't unlocked yet, always start PLAY rather than toggling to PAUSE!
        const targetMode =
          !wasUnlocked && newMode === 'PAUSE'
            ? 'PLAY'
            : st.mode === newMode && newMode !== 'PLAY'
            ? 'PLAY'
            : newMode;

        // Only initialize the current cassette's audio source if it hasn't been loaded yet
        // (NEVER re-call commitIncomingCassetteToActive when resuming PLAY from FF, REW, or PAUSE!)
        if (
          (targetMode === 'PLAY' || targetMode === 'FF' || targetMode === 'REW') &&
          curItem &&
          (st.loadedAudioCassetteId !== curItem.id ||
            (curItem.streamUrl && st.loadedAudioStreamUrl !== curItem.streamUrl))
        ) {
          commitIncomingCassetteToActive(curItem.id);
        }

        // 1. If the cassette is currently OUT of the player (`tapeEjected` or `currentEjectLift > 0.01`):
        //    Place the cassette inside the open player FIRST, and ONLY close the door & start playback AFTER it seats!
        if (st.tapeEjected || st.currentEjectLift > 0.01) {
          st.tapeEjected = false;
          st.targetEjectLift = 0.0;
          st.inspectVelYaw = 0.0;
          st.inspectVelPitch = 0.0;
          setTapeEjected(false);

          // Keep the door wide open while the cassette travels back into the bay!
          st.doorOpen = true;
          st.targetDoorAngle = 0.78;
          st.pendingCloseDoor = true;
          st.pendingTransportMode = targetMode;
          audio.playMechanicalClick('button');
          return;
        }

        // 2. If the cassette is already inside the bay (`currentEjectLift <= 0.01`), but the door is OPEN or reassembling:
        //    Close the door first, and engage playback as soon as the door latches shut!
        if (st.doorOpen || st.doorAngle > 0.08) {
          st.doorOpen = false;
          st.targetDoorAngle = 0.0;
          st.pendingCloseDoor = false;
          st.pendingTransportMode = targetMode;
          setDoorOpen(false);
          audio.playMechanicalClick('door');
          return;
        }

        // 3. Otherwise (cassette is inside and door is closed): engage transport immediately
        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;
        st.mode = targetMode;
        setTransportMode(targetMode);
        audio.setTransportMode(targetMode);
        setSongProgress(audio.getCustomAudioProgress());
      },

      toggleDoor: () => {
        if (st.choreoActive && st.choreoType !== 'INSPECT_SWAP') return;
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
          if (!st.midAirSwapped) {
            st.midAirSwapped = true;
            commitIncomingCassetteToActive(st.pendingCassetteId);
          }
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          st.choreoActive = false;
        }

        // If the cassette is currently out of the player (`tapeEjected` or `currentEjectLift > 0.01`),
        // clicking the door button puts the cassette back into the player FIRST, and then closes the door!
        if (st.tapeEjected || st.currentEjectLift > 0.01) {
          st.tapeEjected = false;
          st.targetEjectLift = 0.0;
          st.inspectVelYaw = 0.0;
          st.inspectVelPitch = 0.0;
          setTapeEjected(false);

          st.doorOpen = true;
          st.targetDoorAngle = 0.78;
          st.pendingCloseDoor = true;
          st.pendingTransportMode = null;
          audio.playMechanicalClick('button');
          return;
        }

        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;
        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }
        const nextOpen = !st.doorOpen;
        if (nextOpen && st.mode !== 'STOP') {
          st.mode = 'STOP';
          setTransportMode('STOP');
          audio.setTransportMode('STOP');
        }
        st.doorOpen = nextOpen;
        st.targetDoorAngle = nextOpen ? 0.76 : 0.0;
        setDoorOpen(nextOpen);
        audio.playMechanicalClick('door');
      },

      /**
       * Dismantles / Explodes all 25+ mechanical parts of the cassette player & cassette in 3D (`X` button / `X` key)
       */
      toggleDismantle: () => {
        if (st.choreoActive) return;
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;

        const nextDismantled = !st.dismantled;
        st.dismantled = nextDismantled;
        st.targetDismantle = nextDismantled ? 1.0 : 0.0;
        setDismantled(nextDismantled);

        if (nextDismantled) {
          if (st.mode !== 'STOP') {
            st.mode = 'STOP';
            setTransportMode('STOP');
            audio.setTransportMode('STOP');
          }
          if (st.tapeEjected) {
            st.tapeEjected = false;
            st.targetEjectLift = 0.0;
            setTapeEjected(false);
          }
          st.doorOpen = true;
          st.targetDoorAngle = 0.26;
          setDoorOpen(true);
        } else {
          st.doorOpen = false;
          st.targetDoorAngle = 0.0;
          setDoorOpen(false);
        }
        audio.playMechanicalClick('door');
      },

      /**
       * Takes the cassette out of the open player -> Player glides along a circular path to the left side &
       * Cassette animates along a circular path to Main View with full 360° rotation!
       * Calling again puts the cassette back into the player bay and returns the player to center.
       */
      toggleEjectCassette: () => {
        if (st.choreoActive && st.choreoType !== 'INSPECT_SWAP') return;
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }
        if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
          if (!st.midAirSwapped) {
            st.midAirSwapped = true;
            commitIncomingCassetteToActive(st.pendingCassetteId);
          }
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          st.choreoActive = false;
        }
        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;
        const nextEjected = !st.tapeEjected;
        if (nextEjected) {
          if (st.mode !== 'STOP') {
            st.mode = 'STOP';
            setTransportMode('STOP');
            audio.setTransportMode('STOP');
          }
          st.doorOpen = true;
          st.targetDoorAngle = 0.78;
          setDoorOpen(true);
          // Start 360° showcase stationary at a clean front angle (no auto-rotation by default!)
          st.inspectYaw = -0.12;
          st.inspectPitch = 0.05;
          st.inspectVelYaw = 0.0;
          st.inspectVelPitch = 0.0;
        } else {
          st.inspectVelYaw = 0.0;
          st.inspectVelPitch = 0.0;
        }
        st.tapeEjected = nextEjected;
        st.targetEjectLift = nextEjected ? 1.0 : 0.0;
        setTapeEjected(nextEjected);
        audio.playMechanicalClick('door');
      },

      toggleAutoSpin360: () => {
        st.inspectAutoSpin = !st.inspectAutoSpin;
        setAutoSpin360(st.inspectAutoSpin);
      },

      turnInspectCassette: (deltaYaw = Math.PI * 0.5, deltaPitch = 0) => {
        st.inspectVelYaw += deltaYaw * 0.14;
        st.inspectVelPitch += deltaPitch * 0.14;
        audio.playMechanicalClick('button');
      },

      resetInspectView: () => {
        st.inspectYaw = -0.12;
        st.inspectPitch = 0.05;
        st.inspectVelYaw = 0.0;
        st.inspectVelPitch = 0.0;
        audio.playMechanicalClick('button');
      },

      /**
       * Switches the 3D Cassette Player to any cassette in `cassetteListRef.current` by `casId`:
       * - `INSPECT_SWAP` when cassette is OUT of the player in 360° Main View (unless `forcePlay` is true)
       * - `SWAP` when cassette is inside the player (smooth door open + horizontal dual-cassette handoff)
       */
      changeCassetteById: (
        nextCasId,
        { forceSwapEvenIfSame = false, forcePlay = false } = {}
      ) => {
        const targetItem = getCassetteById(nextCasId);
        if (!targetItem) return;
        if (!targetItem.isTransient && !targetItem.isRecommended) {
          savePrefsToStorage({ activeCassetteId: targetItem.id });
        }

        const wasUnlocked = st.audioUnlocked;
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        audio.unlockAudioGesture(
          targetItem.streamUrl || null,
          targetItem.youtubeId || null,
          targetItem.backupYoutubeIds || []
        );

        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;
        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }

        // If the browser tab is hidden (`document.hidden`), `requestAnimationFrame` is paused by the browser.
        // Switch and play the next cassette IMMEDIATELY in the background without waiting for the 3D swap animation!
        if (typeof document !== 'undefined' && document.hidden) {
          audio._preloadingStream = false;
          audio._preloadingYouTube = false;
          st.choreoActive = false;
          st.midAirSwapped = true;
          st.pendingCassetteId = targetItem.id;
          st.tapeEjected = false;
          st.targetEjectLift = 0.0;
          st.currentEjectLift = 0.0;
          st.doorOpen = false;
          st.doorAngle = 0.0;
          st.targetDoorAngle = 0.0;
          setTapeEjected(false);
          setDoorOpen(false);
          setIsChangingCassette(false);
          setChoreoStepLabel('');

          st.mode = 'PLAY';
          setTransportMode('PLAY');
          audio.isPlaying = true;
          audio.mode = 'PLAY';
          audio.targetSpeed = 1.0;

          commitIncomingCassetteToActive(targetItem.id);
          audio.setTransportMode('PLAY');
          setSongProgress(audio.getCustomAudioProgress());

          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          placeCassetteOnDoorTrack(
            bayAnchor,
            0.0,
            0.0,
            { x: 0, y: 0, z: 0 },
            { x: 0, y: st.displaySideYaw, z: 0 },
            1.0
          );
          return;
        }

        // 1. Out-of-Player Cassette Switch (`tapeEjected === true` and not forcing immediate playback)
        if (st.tapeEjected && !forcePlay) {
          if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
            if (!st.midAirSwapped) {
              st.midAirSwapped = true;
              commitIncomingCassetteToActive(st.pendingCassetteId);
            }
            walkman.incomingCassette.group.visible = false;
            walkman.activeCassette.group.visible = true;
            st.choreoActive = false;
          }

          if (targetItem.id === st.currentCassetteId && !forceSwapEvenIfSame) {
            st.inspectVelYaw = 0.0;
            st.inspectVelPitch = 0.0;
            audio.playMechanicalClick('button');
            return;
          }

          audio.playMechanicalClick('button');
          prepareIncomingCassette(targetItem.id);

          st.currentEjectLift = 1.0;
          st.targetEjectLift = 1.0;
          st.inspectVelYaw = 0.0;
          st.inspectVelPitch = 0.0;

          st.choreoActive = true;
          st.choreoType = 'INSPECT_SWAP';
          st.choreoTime = 0.0;
          st.choreoDuration = 0.68;
          st.pendingCassetteId = targetItem.id;
          st.midAirSwapped = false;
          setActiveCassetteId(targetItem.id);
          return;
        }

        // 2. In-Player Cassette Switch (or `forcePlay === true`)
        if (st.choreoActive) {
          // If a swap is already mid-animation, smoothly retarget to the newly selected cassette!
          st.pendingCassetteId = targetItem.id;
          prepareIncomingCassette(targetItem.id);
          if (st.midAirSwapped) {
            commitIncomingCassetteToActive(targetItem.id);
          }
          setActiveCassetteId(targetItem.id);
          return;
        }

        if (targetItem.id === st.currentCassetteId && !forceSwapEvenIfSame) {
          commitIncomingCassetteToActive(targetItem.id);
          const nextMode =
            forcePlay || !wasUnlocked
              ? 'PLAY'
              : st.mode === 'PLAY'
              ? 'PAUSE'
              : 'PLAY';
          stageApiRef.current.setTransport(nextMode);
          return;
        }

        setIsChangingCassette(true);
        setChoreoStepLabel('1/5 · UNLATCHING & OPENING DOOR');
        st.lastStepCode = '1';

        st.tapeEjected = false;
        st.targetEjectLift = 0.0;
        st.currentEjectLift = 0.0;
        setTapeEjected(false);

        st.mode = 'STOP';
        setTransportMode('STOP');
        audio.setTransportMode('STOP');
        audio.playMechanicalClick('button');

        prepareIncomingCassette(targetItem.id);

        st.choreoActive = true;
        st.choreoType = 'SWAP';
        st.choreoTime = 0.0;
        st.choreoDuration = 1.75;
        st.choreoStartDoorAngle = st.doorAngle;
        st.pendingCassetteId = targetItem.id;
        st.midAirSwapped = false;
        st.ejectClickPlayed = false;
        st.seatClickPlayed = false;
        st.closeClickPlayed = false;
        setActiveCassetteId(targetItem.id);
      },

      /**
       * Triggers the 3D Eject + 180° Side A/B Flip + Re-insert Choreography (`FLIP`)
       */
      flipCassetteSide: () => {
        if (st.choreoActive && st.choreoType !== 'INSPECT_SWAP') return;
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        st.pendingCloseDoor = false;
        st.pendingTransportMode = null;
        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }

        const curCas = getCassetteById(st.currentCassetteId);
        audio.unlockAudioGesture(
          curCas?.streamUrl || null,
          curCas?.youtubeId || null,
          curCas?.backupYoutubeIds || []
        );

        // If cassette is currently in Center 360° Inspect Mode, smoothly turn it 180° to the other side!
        if (st.tapeEjected) {
          const nextSide = st.side === 'A' ? 'B' : 'A';
          st.side = nextSide;
          setSide(nextSide);
          st.baseSideYaw += Math.PI;
          if (!curCas?.streamUrl && !curCas?.youtubeId && curCas?.sourceType === 'synth') {
            audio.setPreset(curCas.synthPreset || 'neon-rain', nextSide);
          }
          audio.playMechanicalClick('button');
          return;
        }

        setIsChangingCassette(true);
        setChoreoStepLabel(`FLIPPING TO SIDE ${st.side === 'A' ? 'B' : 'A'}...`);
        st.lastStepCode = 'FLIP';

        st.tapeEjected = false;
        st.targetEjectLift = 0.0;
        setTapeEjected(false);

        st.mode = 'STOP';
        setTransportMode('STOP');
        audio.setTransportMode('STOP');
        audio.playMechanicalClick('button');

        st.choreoActive = true;
        st.choreoType = 'FLIP';
        st.choreoTime = 0.0;
        st.choreoDuration = 1.65;
        st.choreoStartDoorAngle = st.doorAngle;
        st.midAirSwapped = false;
        st.ejectClickPlayed = false;
        st.seatClickPlayed = false;
        st.closeClickPlayed = false;
      },
    };

    // --- Pointer Interaction (Click Cassette when Open -> Take Out to Center 360°, Drag to Turn 360°) ---
    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      st.dragging = true;
      st.downX = e.clientX;
      st.downY = e.clientY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.moved = 0;
      st.velYaw = 0;
      st.velPitch = 0;
      st.inspectVelYaw = 0;
      st.inspectVelPitch = 0;
      container.style.cursor = 'grabbing';

      if (!st.audioUnlocked && st.mode === 'PLAY') {
        st.audioUnlocked = true;
        setAudioUnlocked(true);
        const curItem = getCassetteById(st.currentCassetteId);
        audio.unlockAudioGesture(
          curItem?.streamUrl || null,
          curItem?.youtubeId || null,
          curItem?.backupYoutubeIds || []
        );
        commitIncomingCassetteToActive(st.currentCassetteId);
        audio.setTransportMode('PLAY');
      }
    };

    const onPointerMove = (e) => {
      const rect = container.getBoundingClientRect();
      st.hoverX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      st.hoverY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (!st.dragging) {
        pointerNDC.set(st.hoverX, st.hoverY);
        raycaster.setFromCamera(pointerNDC, camera);
        const btnHover = raycaster.intersectObjects(walkman.clickableButtons, false);
        if (btnHover.length > 0) {
          container.style.cursor = 'pointer';
        } else if (st.doorOpen) {
          const casHover = raycaster.intersectObject(walkman.activeCassette.group, true);
          container.style.cursor = casHover.length > 0 ? 'pointer' : 'grab';
        } else {
          container.style.cursor = 'grab';
        }
        return;
      }
      const dx = e.clientX - st.lastX;
      const dy = e.clientY - st.lastY;
      st.lastX = e.clientX;
      st.lastY = e.clientY;
      st.moved += Math.hypot(dx, dy);

      if (st.tapeEjected) {
        // Full 360° unrestricted rotation of the center cassette!
        st.inspectYaw += dx * 0.0115;
        st.inspectPitch += dy * 0.0115;
        st.inspectVelYaw = dx * 0.0115;
        st.inspectVelPitch = dy * 0.0115;
      } else {
        st.dragYaw += dx * 0.0085;
        st.dragPitch = Math.max(-0.95, Math.min(0.95, st.dragPitch + dy * 0.0075));
        st.velYaw = dx * 0.0085;
        st.velPitch = dy * 0.0075;
      }
    };

    const onPointerUp = (e) => {
      if (!st.dragging) return;
      st.dragging = false;
      container.style.cursor = 'grab';

      if (st.moved < 6) {
        const rect = container.getBoundingClientRect();
        pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNDC, camera);

        // 1. Check top transport buttons on the player
        const btnHits = raycaster.intersectObjects(walkman.clickableButtons, false);
        if (btnHits.length > 0 && btnHits[0].object.userData.buttonId) {
          if (st.dismantled) {
            st.dismantled = false;
            st.targetDismantle = 0.0;
            setDismantled(false);
          }
          stageApiRef.current.setTransport?.(btnHits[0].object.userData.buttonId);
          return;
        }

        // 2. Raycast against the 3D Cassette Player, Door, and Active Cassette:
        //    Clicking outside the player on the empty studio backdrop must NOT open/close the player!
        const playerHits = raycaster.intersectObject(walkman.playerRoot, true);
        const doorHits = raycaster.intersectObject(walkman.doorPivotGroup, true);
        const casHits = raycaster.intersectObject(walkman.activeCassette.group, true);
        if (playerHits.length === 0 && casHits.length === 0) {
          return;
        }

        // 3. If currently dismantled, clicking on the player reassembles all parts!
        if (st.dismantled) {
          stageApiRef.current.toggleDismantle?.();
          return;
        }

        // 4. If the cassette is currently in Center 360° Mode:
        //    Clicking the Cassette Player on the left side puts the cassette back into the player!
        if (st.tapeEjected) {
          if (playerHits.length > 0) {
            stageApiRef.current.toggleEjectCassette?.();
          }
          return;
        }

        // 5. When the Cassette Player Door is OPEN and user clicks on the CASSETTE:
        //    Take the cassette out of the player -> Player orbits to the left & Cassette orbits to Main View!
        if (st.doorOpen && casHits.length > 0) {
          stageApiRef.current.toggleEjectCassette?.();
          return;
        }

        // 6. Otherwise, clicking on the cassette door/window (or when door is open) opens or closes the door
        if (doorHits.length > 0 || casHits.length > 0 || st.doorOpen) {
          stageApiRef.current.toggleDoor?.();
        }
      }
    };

    const domEl = renderer.domElement;
    domEl.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    // Keyboard Shortcuts
    const onKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const k = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        if (st.dismantled) {
          st.dismantled = false;
          st.targetDismantle = 0.0;
          setDismantled(false);
        }
        stageApiRef.current.setTransport?.(st.mode === 'PLAY' ? 'PAUSE' : 'PLAY');
      } else if (k === 'x') {
        stageApiRef.current.toggleDismantle?.();
      } else if (k === 'o') {
        stageApiRef.current.toggleDoor?.();
      } else if (k === 'i') {
        stageApiRef.current.toggleEjectCassette?.();
      } else if (k === 'e') {
        stageApiRef.current.playNextCassette?.();
      } else if (k === 'f') {
        stageApiRef.current.flipCassetteSide?.();
      } else if (k === '[') {
        stageApiRef.current.setTransport?.('REW');
      } else if (k === ']') {
        stageApiRef.current.setTransport?.('FF');
      } else if (k === 's') {
        stageApiRef.current.setTransport?.(st.mode === 'PLAY' ? 'STOP' : 'PLAY');
      }
    };
    window.addEventListener('keydown', onKeyDown);

    // ============================================================================
    // 60FPS ANIMATION, CIRCULAR ORBIT TAKE-OUT, DISMANTLE & CASSETTE SWITCH LOOP
    // ============================================================================
    let rafId = null;
    let lastTime = performance.now();

    const mDoorPivotToOrigin = new THREE.Matrix4().makeTranslation(0, -DOOR_HINGE_Y, -DOOR_HINGE_Z);
    const mOriginToDoorPivot = new THREE.Matrix4().makeTranslation(0, DOOR_HINGE_Y, DOOR_HINGE_Z);
    const mDoorRot = new THREE.Matrix4();
    const mLidWorld = new THREE.Matrix4();

    const vBayWorldPos = new THREE.Vector3();
    const qBayWorldQuat = new THREE.Quaternion();
    const vBayWorldScale = new THREE.Vector3();

    const vIncWorldPos = new THREE.Vector3();
    const qIncWorldQuat = new THREE.Quaternion();
    const vIncWorldScale = new THREE.Vector3();

    const vCenterWorldPos = new THREE.Vector3();
    const qCenterWorldQuat = new THREE.Quaternion();
    const vCenterWorldScale = new THREE.Vector3();
    const eCenterEuler = new THREE.Euler(0, 0, 0, 'YXZ');

    const setStepIfChanged = (code, label) => {
      if (st.lastStepCode !== code) {
        st.lastStepCode = code;
        setChoreoStepLabel(label);
      }
    };

    const animate = (nowMs) => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(0.05, (nowMs - lastTime) * 0.001);
      lastTime = nowMs;

      // Smoothly interpolate Side A/B 180° orientation (`displaySideYaw -> baseSideYaw`)
      st.displaySideYaw += (st.baseSideYaw - st.displaySideYaw) * Math.min(1, dt * 12.0);

      // Smoothly interpolate 3D Dismantle / Exploded View (`currentDismantle -> targetDismantle`)
      if (st.currentDismantle < st.targetDismantle) {
        st.currentDismantle = Math.min(st.targetDismantle, st.currentDismantle + dt / 0.78);
      } else if (st.currentDismantle > st.targetDismantle) {
        st.currentDismantle = Math.max(st.targetDismantle, st.currentDismantle - dt / 0.68);
      }
      const explodeT = easeInOutCubic(st.currentDismantle);
      applyPlayerDismantle(walkman, explodeT);
      walkman.updateColorTransition?.(dt);

      // 1. Update WebAudio Engine (keep audio speed & pitch steady while rotating the 3D player)
      audio.update(dt, 0.0);
      const progInterval = st.mode === 'FF' || st.mode === 'REW' ? 65 : 200;
      if (Math.floor(nowMs / progInterval) !== Math.floor((nowMs - dt * 1000) / progInterval)) {
        setSongProgress(audio.getCustomAudioProgress());
      }

      // 2. Evaluate Choreography (`INSPECT_SWAP`, `SWAP`, `FLIP`) or Manual / Circular Orbit Mode
      let choreoCameraPitchOffset = 0.0;
      let choreoCameraYawOffset = 0.0;

      if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
        // --- OUT-OF-PLAYER CASSETTE SWITCH (`INSPECT_SWAP`):
        // Player stays calmly parked on the left while the outgoing cassette
        // glides smoothly away and the newly selected cassette glides into Main View!
        st.choreoTime += dt;
        const p = Math.min(1.0, st.choreoTime / st.choreoDuration);
        st.doorAngle += (st.targetDoorAngle - st.doorAngle) * Math.min(1, dt * 11);
        st.currentEjectLift = 1.0;

        if (p >= 1.0) {
          if (!st.midAirSwapped) {
            st.midAirSwapped = true;
            commitIncomingCassetteToActive(st.pendingCassetteId);
            st.mode = 'STOP';
            setTransportMode('STOP');
            audio.setTransportMode('STOP');
          }
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          st.choreoActive = false;
        }
      } else if (st.choreoActive) {
        st.choreoTime += dt;
        const p = Math.min(1.0, st.choreoTime / st.choreoDuration);
        st.currentEjectLift = 0.0;

        // Smoothly open door from `choreoStartDoorAngle` to 0.78 rad, hold while swapping, and close at the end
        const openBlend = easeInOutCubic(p / 0.18);
        const closeBlend = easeInOutCubic((p - 0.78) / 0.18);
        if (p < 0.18) {
          st.doorAngle = st.choreoStartDoorAngle + (0.78 - st.choreoStartDoorAngle) * openBlend;
        } else if (p < 0.78) {
          st.doorAngle = 0.78;
        } else if (p < 0.96) {
          st.doorAngle = 0.78 * (1.0 - closeBlend);
        } else {
          st.doorAngle = 0.0;
        }

        if (p >= 0.05 && !st.ejectClickPlayed) {
          st.ejectClickPlayed = true;
          audio.playMechanicalClick('door');
        }

        // Keep player steady during swap (no fixed-place yaw spinning!)
        const doorOpenRatio = st.doorAngle / 0.78;
        choreoCameraPitchOffset = doorOpenRatio * 0.04;
        choreoCameraYawOffset = 0.0;

        if (st.choreoType === 'SWAP') {
          if (p < 0.18) {
            setStepIfChanged('1', '1/5 · OPENING CASSETTE DOOR');
          } else if (p < 0.42) {
            setStepIfChanged('2', '2/5 · SLIDING OUT OLD CASSETTE');
          } else if (p < 0.58) {
            setStepIfChanged('3', '3/5 · GLIDING IN NEW CASSETTE');
          } else if (p < 0.78) {
            setStepIfChanged('4', '4/5 · SEATING ONTO DRIVE SPINDLES');
          } else {
            setStepIfChanged('5', '5/5 · CLOSING DOOR & ENGAGING HEAD');
          }

          // --- A. OUTGOING CASSETTE (`bayAnchor` -> `activeCassette`) until p = 0.78 ---
          if (p < 0.78) {
            const outSlideT = easeInOutCubic((p - 0.10) / 0.28);
            const outGlideT = easeInOutCubic((p - 0.22) / 0.32);
            const outScale = 1.0 - smoothstep(0.38, 0.54, p);

            walkman.activeCassette.group.visible = outScale > 0.01;
            placeCassetteOnDoorTrack(
              bayAnchor,
              st.doorAngle,
              outSlideT * 82.0,
              {
                x: -outGlideT * 124.0,
                y: outGlideT * 10.0,
                z: outGlideT * 16.0,
              },
              {
                x: 0.0,
                y: st.displaySideYaw,
                z: 0.0,
              },
              Math.max(0.001, outScale)
            );
          }

          // --- B. INCOMING CASSETTE (`incomingBayAnchor` -> `incomingCassette`) from p = 0.26 to 0.78 ---
          if (p >= 0.26 && p < 0.78) {
            walkman.incomingCassette.group.visible = true;
            const inGlideT = 1.0 - easeOutCubic((p - 0.26) / 0.28);
            const inScale = smoothstep(0.26, 0.38, p);
            const inInsertT = easeInOutCubic((p - 0.46) / 0.29);

            const slideDist = Math.max(0.0, (1.0 - inInsertT) * 82.0);

            placeCassetteOnDoorTrack(
              incomingBayAnchor,
              st.doorAngle,
              slideDist,
              {
                x: inGlideT * 124.0,
                y: inGlideT * 12.0,
                z: inGlideT * 16.0,
              },
              {
                x: 0.0,
                y: st.displaySideYaw,
                z: 0.0,
              },
              Math.max(0.001, inScale)
            );

            if (p >= 0.73 && !st.seatClickPlayed) {
              st.seatClickPlayed = true;
              audio.playMechanicalClick('button');
            }
          } else {
            walkman.incomingCassette.group.visible = false;
          }

          // --- C. HANDOFF COMMIT AT p >= 0.78 (Seated flat on spindles as door swings shut!) ---
          if (p >= 0.78) {
            if (!st.midAirSwapped) {
              st.midAirSwapped = true;
              commitIncomingCassetteToActive(st.pendingCassetteId);
            }
            walkman.incomingCassette.group.visible = false;
            walkman.activeCassette.group.visible = true;
            placeCassetteOnDoorTrack(
              bayAnchor,
              st.doorAngle,
              0.0,
              { x: 0, y: 0, z: 0 },
              { x: 0, y: st.displaySideYaw, z: 0 },
              1.0
            );
          }

          if (p >= 0.91 && !st.closeClickPlayed) {
            st.closeClickPlayed = true;
            audio.playMechanicalClick('door');
          }
        } else if (st.choreoType === 'FLIP') {
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;

          const slideT =
            p < 0.14
              ? 0.0
              : p < 0.38
              ? easeInOutCubic((p - 0.14) / 0.24)
              : p < 0.58
              ? 1.0
              : p < 0.80
              ? 1.0 - easeInOutCubic((p - 0.58) / 0.22)
              : 0.0;

          const flipT = easeInOutCubic((p - 0.32) / 0.32);
          const flipArcZ = Math.sin(flipT * Math.PI) * 18.0;

          placeCassetteOnDoorTrack(
            bayAnchor,
            st.doorAngle,
            slideT * 82.0,
            { x: 0, y: 0, z: flipArcZ },
            { x: 0, y: st.baseSideYaw + flipT * Math.PI, z: 0 },
            1.0
          );

          if (p >= 0.48 && !st.midAirSwapped) {
            st.midAirSwapped = true;
            const nextSide = st.side === 'A' ? 'B' : 'A';
            st.side = nextSide;
            setSide(nextSide);
            const curCas = getCassetteById(st.currentCassetteId);
            if (!curCas?.streamUrl && curCas?.sourceType === 'synth') {
              audio.setPreset(curCas.synthPreset || 'neon-rain', nextSide);
            }
            audio.playMechanicalClick('button');
          }

          if (p >= 0.91 && !st.closeClickPlayed) {
            st.closeClickPlayed = true;
            audio.playMechanicalClick('door');
          }
        }

        if (p >= 1.0) {
          if (st.choreoType === 'FLIP') {
            st.baseSideYaw = (st.baseSideYaw + Math.PI) % (Math.PI * 2);
            st.displaySideYaw = st.baseSideYaw;
          }
          walkman.incomingCassette.group.visible = false;
          walkman.activeCassette.group.visible = true;
          placeCassetteOnDoorTrack(
            bayAnchor,
            0.0,
            0.0,
            { x: 0, y: 0, z: 0 },
            { x: 0, y: st.displaySideYaw, z: 0 },
            1.0
          );

          st.choreoActive = false;
          st.doorAngle = 0.0;
          st.doorOpen = false;
          st.targetDoorAngle = 0.0;
          setDoorOpen(false);
          setIsChangingCassette(false);
          setChoreoStepLabel('');

          st.mode = 'PLAY';
          setTransportMode('PLAY');
          audio.setTransportMode('PLAY');
        }
      } else {
        // Manual / Idle / Time-Based Circular Orbit Take-Out & Put-Back state:
        // 1. Advance `currentEjectLift` smoothly in linear time (0.68s duration):
        if (st.currentEjectLift < st.targetEjectLift) {
          // Taking cassette OUT: wait until the door is open (>= 0.45 rad) before lifting the cassette out
          if (st.doorAngle >= 0.45) {
            st.currentEjectLift = Math.min(st.targetEjectLift, st.currentEjectLift + dt / 0.68);
          }
        } else if (st.currentEjectLift > st.targetEjectLift) {
          // Putting cassette BACK IN: door remains wide open while cassette arcs back & slides into bay
          const prevLift = st.currentEjectLift;
          st.currentEjectLift = Math.max(st.targetEjectLift, st.currentEjectLift - dt / 0.68);
          if (prevLift > 0.14 && st.currentEjectLift <= 0.14) {
            audio.playMechanicalClick('button');
          }
        }

        // 2. Only AFTER the cassette is completely seated inside the player (`currentEjectLift <= 0.005`),
        //    trigger any pending door-close!
        if (st.currentEjectLift <= 0.005 && st.pendingCloseDoor) {
          st.pendingCloseDoor = false;
          st.doorOpen = false;
          st.targetDoorAngle = 0.0;
          setDoorOpen(false);
          audio.playMechanicalClick('door');
        }

        // 3. Door angle interpolation:
        //    Never allow the door to close while the cassette is still outside the bay (`currentEjectLift > 0.005`)!
        const effectiveTargetDoorAngle =
          st.currentEjectLift > 0.005 ? Math.max(st.targetDoorAngle, 0.78) : st.targetDoorAngle;
        st.doorAngle += (effectiveTargetDoorAngle - st.doorAngle) * Math.min(1, dt * 11);

        // 4. Once the cassette is seated inside the player AND the door has closed (`doorAngle < 0.06`),
        //    engage any pending transport mode (PLAY / REW / FF)!
        if (
          st.pendingTransportMode &&
          !st.pendingCloseDoor &&
          st.currentEjectLift <= 0.005 &&
          st.doorAngle < 0.06
        ) {
          const nextMode = st.pendingTransportMode;
          st.pendingTransportMode = null;
          st.mode = nextMode;
          setTransportMode(nextMode);
          audio.setTransportMode(nextMode);
          audio.playMechanicalClick('button');
        }

        walkman.incomingCassette.group.visible = false;
        walkman.activeCassette.group.visible = true;

        const bayExtractSlide = smoothstep(0.0, 0.24, st.currentEjectLift) * 44.0;
        placeCassetteOnDoorTrack(
          bayAnchor,
          st.doorAngle,
          bayExtractSlide,
          { x: 0, y: 4.0 * explodeT, z: 22.0 * explodeT },
          { x: 0, y: st.displaySideYaw, z: 0 },
          1.0
        );
      }

      // 3. Animate Physical 3D Top Transport Keys & Engaging Magnetic Read-Head Bridge (+ Dismantle Offset)
      walkman.buttonDefs.forEach(({ id }) => {
        const mesh = walkman.buttonMeshes[id];
        if (!mesh) return;
        if (mesh.userData.baseX === undefined) {
          mesh.userData.baseX = mesh.position.x;
          mesh.userData.baseZ = mesh.position.z;
        }
        const dismOff = mesh.userData.dismantleOffset;
        const isInPlayerChoreo = st.choreoActive && st.choreoType !== 'INSPECT_SWAP';
        const isDepressed =
          (!st.choreoActive &&
            !st.tapeEjected &&
            !st.doorOpen &&
            !st.dismantled &&
            st.currentEjectLift <= 0.005 &&
            ((id === 'PLAY' && (st.mode === 'PLAY' || st.mode === 'PAUSE')) ||
              (id === 'REW' && st.mode === 'REW') ||
              (id === 'FF' && st.mode === 'FF') ||
              (id === 'PAUSE' && st.mode === 'PAUSE'))) ||
          (isInPlayerChoreo && id === 'STOP' && st.choreoTime < 0.36) ||
          (isInPlayerChoreo &&
            id === 'PLAY' &&
            st.choreoTime / st.choreoDuration > 0.91);
        const restY = id === 'STOP' ? 52.3 : 52.0;
        const baseY = isDepressed ? restY - 0.85 : restY;
        mesh.position.x = mesh.userData.baseX + (dismOff ? dismOff.x * explodeT : 0);
        const targetY = baseY + (dismOff ? dismOff.y * explodeT : 0);
        mesh.position.y += (targetY - mesh.position.y) * Math.min(1, dt * 18);
        mesh.position.z = mesh.userData.baseZ + (dismOff ? dismOff.z * explodeT : 0);
      });

      const headEngaged =
        (!st.choreoActive &&
          !st.tapeEjected &&
          !st.doorOpen &&
          !st.dismantled &&
          st.currentEjectLift <= 0.005 &&
          st.doorAngle < 0.08 &&
          (st.mode === 'PLAY' || st.mode === 'PAUSE')) ||
        (st.choreoActive && st.choreoType !== 'INSPECT_SWAP' && st.choreoTime / st.choreoDuration > 0.92);
      const targetHeadY = (headEngaged ? 3.2 : 0.0) - 22.0 * explodeT;
      walkman.headBridgeCarriage.position.y +=
        (targetHeadY - walkman.headBridgeCarriage.position.y) * Math.min(1, dt * 14);
      walkman.headBridgeCarriage.position.z = -10.0 * explodeT;

      // 4. Update Interactive Drag Rotation & 360° Center Cassette Rotation (No default auto-sway!)
      if (!st.dragging) {
        st.dragYaw += st.velYaw;
        st.dragPitch += st.velPitch;
        st.velYaw *= 0.9;
        st.velPitch *= 0.9;

        // When dismantled (`st.dismantled`), angle to a clean 3/4 isometric view so every exploded layer is visible;
        // when cassette is taken out (`tapeEjected`), angle the player on the left side gently inward;
        // when returning to normal, restore the clean studio angle!
        if (st.dismantled) {
          st.dragYaw += (-0.48 - st.dragYaw) * Math.min(1, dt * 4.2);
          st.dragPitch += (0.20 - st.dragPitch) * Math.min(1, dt * 4.2);
        } else if (st.tapeEjected) {
          st.dragYaw += (0.28 - st.dragYaw) * Math.min(1, dt * 4.0);
          st.dragPitch += (0.09 - st.dragPitch) * Math.min(1, dt * 4.0);
        } else if (st.currentEjectLift > 0.005 || st.currentDismantle > 0.005) {
          st.dragYaw += (-0.22 - st.dragYaw) * Math.min(1, dt * 4.5);
          st.dragPitch += (0.12 - st.dragPitch) * Math.min(1, dt * 4.5);
        }

        // Update 360° Center Cassette inertia & optional user-toggled 360° turntable spin
        st.inspectYaw += st.inspectVelYaw;
        st.inspectPitch += st.inspectVelPitch;
        st.inspectVelYaw *= 0.92;
        st.inspectVelPitch *= 0.92;
        if (st.tapeEjected && st.inspectAutoSpin && Math.abs(st.inspectVelYaw) < 0.003) {
          st.inspectYaw += dt * 0.85;
        }
      }

      // Smooth Cubic Circular Orbit Blend (`0 -> 1`):
      // During `[0.0 -> 0.18]`, the cassette slides cleanly in/out of the open door pocket;
      // during `[0.18 -> 1.0]`, it arcs between the open door lip and the right-side 360° showcase!
      const centerBlend =
        st.choreoActive && st.choreoType !== 'INSPECT_SWAP'
          ? 0.0
          : easeInOutCubic(Math.max(0.0, Math.min(1.0, (st.currentEjectLift - 0.18) / 0.82)));
      const orbitSin = Math.sin(centerBlend * Math.PI);

      const baseYaw = st.dragYaw + choreoCameraYawOffset;
      const basePitch = st.dragPitch + choreoCameraPitchOffset;
      const baseRoll = 0.0;

      // Balanced Vertical Centerline (`y = 0.5 * st.sceneScale`) — sits centered between top bar and dock with zero frustum offset!
      const baseCenterY = 0.5;
      const playerScale = st.sceneScale * (1.0 - 0.30 * centerBlend) * (1.0 - 0.14 * explodeT);
      walkman.playerRoot.position.set(
        (-76.0 * centerBlend - orbitSin * 14.0) * st.sceneScale,
        (baseCenterY - orbitSin * 16.0) * st.sceneScale,
        -18.0 * centerBlend - orbitSin * 20.0
      );
      walkman.playerRoot.scale.setScalar(playerScale);
      walkman.playerRoot.rotation.set(basePitch, baseYaw, baseRoll, 'YXZ');

      // Rotate Bottom-Hinged Door forward around its bottom hinge (+X)
      walkman.doorPivotGroup.rotation.x = st.doorAngle;

      // 5. Spin Dual Cassette Reels, Walkman Drive Spindles, Interior Brass Flywheel, & 3-Digit Mechanical Counter
      const speedMul =
        st.choreoActive || st.tapeEjected || st.doorOpen || st.dismantled || st.mode === 'STOP' || st.mode === 'PAUSE'
          ? 0.0
          : st.mode === 'FF'
          ? 3.4
          : st.mode === 'REW'
          ? -3.4
          : 1.0;

      if (Math.abs(speedMul) > 0.01) {
        st.reelAngle -= dt * 2.25 * speedMul;
      }

      walkman.reelLeft.rotation.z = st.reelAngle;
      walkman.reelRight.rotation.z = st.reelAngle * 1.18;
      walkman.spindleL.rotation.z = st.reelAngle;
      walkman.spindleR.rotation.z = st.reelAngle * 1.18;
      if (walkman.flywheelRotor) {
        walkman.flywheelRotor.rotation.z = -st.reelAngle * 2.4;
      }
      if (walkman.counterWheels && walkman.counterWheels.length === 3) {
        const totalCounts = Math.abs(st.reelAngle) * 1.65;
        const ones = totalCounts % 10;
        const tens = Math.floor(totalCounts / 10) + Math.pow(ones / 10, 4);
        const hundreds = Math.floor(totalCounts / 100) + Math.pow((tens % 10) / 10, 4);
        const stepRad = (Math.PI * 2) / 10;
        walkman.counterWheels[2].rotation.x = ones * stepRad;
        walkman.counterWheels[1].rotation.x = tens * stepRad;
        walkman.counterWheels[0].rotation.x = hundreds * stepRad;
      }
      walkman.setLedState?.(
        st.mode === 'PLAY' && !st.choreoActive && !st.tapeEjected && !st.doorOpen && !st.dismantled,
        st.mode,
        nowMs * 0.001
      );

      // 6. Update Player World Matrix & Compute `activeCassette` + `incomingCassette` World Poses
      walkman.playerRoot.updateMatrixWorld(true);
      bayAnchor.getWorldPosition(vBayWorldPos);
      bayAnchor.getWorldQuaternion(qBayWorldQuat);
      bayAnchor.getWorldScale(vBayWorldScale);

      if (st.choreoActive && st.choreoType === 'SWAP' && walkman.incomingCassette.group.visible) {
        incomingBayAnchor.getWorldPosition(vIncWorldPos);
        incomingBayAnchor.getWorldQuaternion(qIncWorldQuat);
        incomingBayAnchor.getWorldScale(vIncWorldScale);
        walkman.incomingCassette.group.position.copy(vIncWorldPos);
        walkman.incomingCassette.group.quaternion.copy(qIncWorldQuat);
        walkman.incomingCassette.group.scale.copy(vIncWorldScale);
        walkman.incomingCassette.group.updateMatrixWorld(true);
      }

      const heroX = 52.0 * st.sceneScale;
      const heroY = baseCenterY * st.sceneScale;
      const heroZ = 8.0;
      const heroScale = st.sceneScale * 0.88;

      if (st.choreoActive && st.choreoType === 'INSPECT_SWAP') {
        // --- SMOOTH OUT-OF-PLAYER CASSETTE REPLACEMENT GLIDE (ZERO IN-PLACE ROTATION!) ---
        const p = Math.min(1.0, st.choreoTime / st.choreoDuration);

        // Keep exact showcase orientation without any Euler twisting in place
        eCenterEuler.set(
          st.inspectPitch,
          st.displaySideYaw + st.inspectYaw,
          0.0,
          'YXZ'
        );
        qCenterWorldQuat.setFromEuler(eCenterEuler);

        // 1. Outgoing Cassette glides smoothly right & back into depth (`p = 0.0 -> 0.56`)
        if (p < 0.56) {
          const outT = easeInOutCubic(p / 0.56);
          walkman.activeCassette.group.visible = true;
          walkman.activeCassette.group.position.set(
            heroX + outT * 108.0 * st.sceneScale,
            heroY + outT * 6.0 * st.sceneScale,
            heroZ - outT * 36.0
          );
          walkman.activeCassette.group.quaternion.copy(qCenterWorldQuat);
          walkman.activeCassette.group.scale.setScalar(
            Math.max(0.001, heroScale * (1.0 - outT))
          );
        } else {
          walkman.activeCassette.group.visible = false;
        }

        // 2. Incoming Cassette glides smoothly up & in along a pure monotonic `easeOutCubic` path (`p = 0.06 -> 1.0`)
        if (p >= 0.06) {
          const inT = easeOutCubic((p - 0.06) / 0.94);
          walkman.incomingCassette.group.visible = true;
          walkman.incomingCassette.group.position.set(
            (heroX - 68.0 * st.sceneScale) * (1.0 - inT) + heroX * inT,
            (heroY - 42.0 * st.sceneScale) * (1.0 - inT) + heroY * inT,
            (heroZ - 22.0) * (1.0 - inT) + heroZ * inT
          );
          walkman.incomingCassette.group.quaternion.copy(qCenterWorldQuat);
          walkman.incomingCassette.group.scale.setScalar(
            heroScale * (0.48 + 0.52 * inT)
          );
          walkman.incomingCassette.group.updateMatrixWorld(true);
        } else {
          walkman.incomingCassette.group.visible = false;
        }
      } else if (centerBlend <= 0.0001) {
        walkman.activeCassette.group.position.copy(vBayWorldPos);
        walkman.activeCassette.group.quaternion.copy(qBayWorldQuat);
        walkman.activeCassette.group.scale.copy(vBayWorldScale);
      } else {
        // --- SMOOTH CIRCULAR ORBIT ANIMATION FROM PLAYER BAY TO MAIN CASSETTE VIEW ---
        // Compensates for the player's leftward shift so X progresses smoothly without stalling,
        // while Y and Z trace a clean circular arc and orientation slerps with zero in-place wobble!
        const cancelPlayerShiftX = 76.0 * centerBlend * (1.0 - centerBlend) * st.sceneScale;
        const circleX = cancelPlayerShiftX + orbitSin * 12.0 * st.sceneScale;
        const circleY = -orbitSin * 20.0 * st.sceneScale;
        const circleZ = orbitSin * 28.0;

        vCenterWorldPos.set(heroX, heroY, heroZ);
        eCenterEuler.set(
          st.inspectPitch,
          st.displaySideYaw + st.inspectYaw,
          0.0,
          'YXZ'
        );
        qCenterWorldQuat.setFromEuler(eCenterEuler);
        vCenterWorldScale.set(heroScale, heroScale, heroScale);

        walkman.activeCassette.group.position.lerpVectors(
          vBayWorldPos,
          vCenterWorldPos,
          centerBlend
        );
        walkman.activeCassette.group.position.x += circleX;
        walkman.activeCassette.group.position.y += circleY;
        walkman.activeCassette.group.position.z += circleZ;

        walkman.activeCassette.group.quaternion.slerpQuaternions(
          qBayWorldQuat,
          qCenterWorldQuat,
          centerBlend
        );
        walkman.activeCassette.group.scale.lerpVectors(
          vBayWorldScale,
          vCenterWorldScale,
          centerBlend
        );
      }
      walkman.activeCassette.group.updateMatrixWorld(true);

      // Update analytical floor drop-shadow matrices
      mTrayInv.copy(walkman.playerRoot.matrixWorld).invert();

      const shadowCassetteGroup =
        walkman.incomingCassette.group.visible &&
        st.choreoActive &&
        (st.choreoType === 'INSPECT_SWAP'
          ? st.choreoTime / st.choreoDuration >= 0.30
          : st.choreoTime / st.choreoDuration >= 0.44)
          ? walkman.incomingCassette.group
          : walkman.activeCassette.group;
      mCassetteInv.copy(shadowCassetteGroup.matrixWorld).invert();

      mDoorRot.makeRotationX(st.doorAngle);
      mLidWorld
        .copy(walkman.playerRoot.matrixWorld)
        .multiply(mOriginToDoorPivot)
        .multiply(mDoorRot)
        .multiply(mDoorPivotToOrigin);
      mLidInv.copy(mLidWorld).invert();

      // 7. Render Clean Antialiased Studio Scene
      renderer.render(scene, camera);
    };

    // Background-tab watchdog: When the user switches to another tab (`document.hidden === true`),
    // browsers suspend `requestAnimationFrame`. Ensure any in-progress 3D cassette swap finishes
    // immediately and `audio.update` continues running in the background so tracks switch on time!
    const finishPendingSwapInBackground = () => {
      if (typeof document === 'undefined' || !document.hidden) return;
      if (st.choreoActive) {
        audio._preloadingStream = false;
        audio._preloadingYouTube = false;
        if (st.choreoType === 'FLIP') {
          if (!st.midAirSwapped) {
            st.midAirSwapped = true;
            const nextSide = st.side === 'A' ? 'B' : 'A';
            st.side = nextSide;
            setSide(nextSide);
            const curCas = getCassetteById(st.currentCassetteId);
            if (!curCas?.streamUrl && curCas?.sourceType === 'synth') {
              audio.setPreset(curCas.synthPreset || 'neon-rain', nextSide);
            }
          }
          st.baseSideYaw = (st.baseSideYaw + Math.PI) % (Math.PI * 2);
          st.displaySideYaw = st.baseSideYaw;
        } else if (!st.midAirSwapped) {
          st.midAirSwapped = true;
          st.mode = 'PLAY';
          audio.isPlaying = true;
          audio.mode = 'PLAY';
          commitIncomingCassetteToActive(st.pendingCassetteId);
        }

        walkman.incomingCassette.group.visible = false;
        walkman.activeCassette.group.visible = true;
        placeCassetteOnDoorTrack(
          bayAnchor,
          0.0,
          0.0,
          { x: 0, y: 0, z: 0 },
          { x: 0, y: st.displaySideYaw, z: 0 },
          1.0
        );

        st.choreoActive = false;
        st.doorAngle = 0.0;
        st.doorOpen = false;
        st.targetDoorAngle = 0.0;
        setDoorOpen(false);
        setIsChangingCassette(false);
        setChoreoStepLabel('');

        if (st.choreoType !== 'INSPECT_SWAP') {
          st.mode = 'PLAY';
          setTransportMode('PLAY');
          audio.setTransportMode('PLAY');
        }
      } else if (st.pendingTransportMode) {
        const nextMode = st.pendingTransportMode;
        st.pendingTransportMode = null;
        st.pendingCloseDoor = false;
        st.currentEjectLift = 0.0;
        st.targetEjectLift = 0.0;
        st.doorAngle = 0.0;
        st.doorOpen = false;
        st.targetDoorAngle = 0.0;
        setTapeEjected(false);
        setDoorOpen(false);
        st.mode = nextMode;
        setTransportMode(nextMode);
        audio.setTransportMode(nextMode);
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        finishPendingSwapInBackground();
      } else {
        lastTime = performance.now();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const bgIntervalId = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        finishPendingSwapInBackground();
        audio.update(0.25, 0.0);
        setSongProgress(audio.getCustomAudioProgress());
      }
    }, 250);

    rafId = requestAnimationFrame(animate);
    setReady(true);

    // Pre-fetch recommended tracks so the Recommended queue is ready immediately
    stageApiRef.current.fetchMoreRecommendations?.(initialActiveItem, { append: false });

    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(bgIntervalId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      domEl.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updateLayout);
      audio.dispose();
      walkman.envMap.dispose();
      renderer.dispose();
      if (domEl.parentNode === container) {
        container.removeChild(domEl);
      }
    };
  }, []);

  // --- Master Volume & Mute Controls (Persisted to localStorage) ---
  const handleVolumeChange = useCallback((nextVal) => {
    const clamped = Math.max(0, Math.min(1, Number(nextVal)));
    setVolume(clamped);
    if (clamped > 0 && muted) {
      setMuted(false);
      engineRef.current?.setMuted(false);
      savePrefsToStorage({ volume: clamped, muted: false });
    } else {
      savePrefsToStorage({ volume: clamped });
    }
    engineRef.current?.setVolume(clamped);
  }, [muted]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      engineRef.current?.setMuted(next);
      engineRef.current?.playMechanicalClick('button');
      savePrefsToStorage({ muted: next });
      return next;
    });
  }, []);

  // --- Toggle Cassette Queue Mode: 'saved' vs 'recommended' (Continuous Auto-Play) ---
  const handleSwitchQueueMode = useCallback((nextMode) => {
    const normalized = nextMode === 'recommended' ? 'recommended' : 'saved';
    queueModeRef.current = normalized;
    setQueueMode(normalized);
    savePrefsToStorage({ queueMode: normalized });
    engineRef.current?.playMechanicalClick('button');

    if (normalized === 'recommended') {
      // Ensure Auto Mode is ON when switching to Continuous Recommended mode
      if (!autoMode) {
        stageApiRef.current.toggleAutoMode?.();
      }
      if (recommendedListRef.current.length === 0) {
        stageApiRef.current.fetchMoreRecommendations?.(null, { append: false });
      }
    }
  }, [autoMode]);

  const handleSaveRecommendedTrack = useCallback((recCas, e) => {
    if (e) e.stopPropagation();
    if (!recCas) return;
    stageApiRef.current.addCassetteToCollection?.(
      {
        externalId: recCas.externalId || recCas.onlineTrackId,
        onlineTrackId: recCas.onlineTrackId || recCas.externalId,
        title: recCas.title,
        artist: recCas.artist,
        accentColor: recCas.shellAccent || '#ff3b1f',
        coverImg: recCas.coverImg || null,
        coverUrl: recCas.coverDataUrl || recCas.coverUrl || recCas.thumbUrl,
        streamUrl: recCas.streamUrl || null,
        youtubeId: recCas.youtubeId || null,
        backupYoutubeIds: recCas.backupYoutubeIds || [],
        durationSec: recCas.durationSec || 210,
        sourceType: recCas.sourceType || 'online',
      },
      { playImmediately: false }
    );
  }, []);

  // --- Share Curated Player Skin & Cassette Collection Link (for GitHub Pages / Audience Sharing) ---
  const handleShareDeck = useCallback(async () => {
    const shareUrl = buildShareableDeckUrl({
      playerColorId: playerColorIdRef.current || playerColorId,
      activeCassetteId,
      autoMode,
      list: cassetteListRef.current,
    });
    engineRef.current?.playMechanicalClick('button');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      if (typeof window !== 'undefined' && window.history?.replaceState) {
        window.history.replaceState(null, '', shareUrl);
      }
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2400);
    } catch {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2400);
    }
  }, [playerColorId, activeCassetteId, autoMode]);

  // --- Online Song Search & Instant Add-to-Cassette-Collection Handlers ---
  const handleSearchOnlineSongs = useCallback(async (queryStr) => {
    const q = (queryStr ?? '').trim();
    setIsSearchingOnline(true);
    setSearchError(null);
    try {
      const data = await searchOnlineSongsClientFallback(
        q || 'The Weeknd Daft Punk Dua Lipa'
      );
      if (!data || !data.ok) {
        setSearchError(data?.error || 'Search temporarily unavailable.');
      } else {
        const results = data.results || [];
        setSearchResults(results);

        // Also enrich any default cassettes with resolved full-length streamUrl or YouTube IDs if matched
        let updatedAny = false;
        const nextCollection = cassetteListRef.current.map((cas) => {
          if (cas.streamUrl && cas.youtubeId) return cas;
          const match = results.find(
            (r) =>
              (r.streamUrl || r.youtubeId) &&
              r.title.toLowerCase().includes(cas.title.toLowerCase()) &&
              r.artist.toLowerCase().includes(cas.artist.toLowerCase().split(' ')[0])
          );
          if (match) {
            updatedAny = true;
            return {
              ...cas,
              streamUrl: cas.streamUrl || match.streamUrl || null,
              youtubeId: cas.youtubeId || match.youtubeId || null,
              backupYoutubeIds:
                cas.backupYoutubeIds?.length > 0
                  ? cas.backupYoutubeIds
                  : match.backupYoutubeIds || [],
              onlineTrackId: cas.onlineTrackId || match.id,
            };
          }
          return cas;
        });
        if (updatedAny) {
          cassetteListRef.current = nextCollection;
          setCassetteList(nextCollection);
          saveCollectionToStorage(nextCollection);
        }
      }
    } catch {
      setSearchError('Network error while searching online songs.');
    } finally {
      setIsSearchingOnline(false);
    }
  }, []);

  // Populate initial online song catalog on mount
  useEffect(() => {
    handleSearchOnlineSongs('The Weeknd Daft Punk Dua Lipa');
  }, [handleSearchOnlineSongs]);

  /**
   * Adds an online song to the Left Cassette Collection ONLY when the user explicitly clicks `+ Add`
   */
  const handleAddOnlineTrack = useCallback(async (track) => {
    if (!track) return;

    setAudioUnlocked(true);
    engineRef.current?.unlockAudioGesture(null);

    // 1. Check if this song is already in the user's cassette collection
    const existing = cassetteListRef.current.find(
      (c) =>
        c.onlineTrackId === track.id ||
        c.externalId === track.id ||
        (track.youtubeId && c.youtubeId === track.youtubeId) ||
        (c.title.toLowerCase() === track.title.toLowerCase() &&
          c.artist.toLowerCase() === track.artist.toLowerCase())
    );
    if (existing) {
      if (track.streamUrl && !existing.streamUrl) {
        existing.streamUrl = track.streamUrl;
      }
      if (track.youtubeId && !existing.youtubeId) {
        existing.youtubeId = track.youtubeId;
        existing.backupYoutubeIds = track.backupYoutubeIds || [];
      }
      existing.onlineTrackId = track.id;
      setCassetteList([...cassetteListRef.current]);
      saveCollectionToStorage(cassetteListRef.current);
      engineRef.current?.playMechanicalClick('button');
      return;
    }

    // 2. If this track is already currently playing as a transient online cassette, promote it immediately!
    const curTransient = transientCassetteRef.current;
    if (
      curTransient &&
      (curTransient.onlineTrackId === track.id ||
        curTransient.externalId === track.id ||
        (track.youtubeId && curTransient.youtubeId === track.youtubeId) ||
        (curTransient.title.toLowerCase() === track.title.toLowerCase() &&
          curTransient.artist.toLowerCase() === track.artist.toLowerCase()))
    ) {
      stageApiRef.current.addCassetteToCollection?.(
        {
          externalId: track.id,
          onlineTrackId: track.id,
          title: track.title || 'Online Track',
          artist: track.artist || 'Featured Artist',
          youtubeId: track.youtubeId || null,
        },
        { playImmediately: false }
      );
      return;
    }

    setAddingTrackId(track.id);
    try {
      const rawCover = track.coverUrl || track.thumbUrl || null;
      const { img: loadedImg, resolvedUrl } = await loadCoverImageWithFallback(rawCover);

      stageApiRef.current.addCassetteToCollection?.(
        {
          externalId: track.id,
          onlineTrackId: track.id,
          title: track.title || 'Online Track',
          artist: track.artist || 'Featured Artist',
          sourceType: track.sourceType || (track.streamUrl ? 'online' : 'youtube'),
          streamUrl: track.streamUrl || null,
          youtubeId: track.youtubeId || null,
          backupYoutubeIds: track.backupYoutubeIds || [],
          durationSec: track.durationSec || 210,
          coverImg: loadedImg,
          coverUrl: resolvedUrl || rawCover,
          accentColor: track.accentColor || '#ff3b1f',
        },
        { playImmediately: false }
      );
    } finally {
      setAddingTrackId(null);
    }
  }, []);

  /**
   * Plays an online song in the 3D Cassette Player WITHOUT adding it to the Left Cassette Collection!
   */
  const handlePlayOnlineTrack = useCallback(async (track) => {
    if (!track) return;

    // 1. Synchronously unlock WebAudio + HTMLAudioElement / YouTube Player inside the user's click gesture BEFORE any await!
    setAudioUnlocked(true);
    engineRef.current?.unlockAudioGesture(
      track.streamUrl || null,
      track.youtubeId || null,
      track.backupYoutubeIds || []
    );

    // 2. If this song is already in the user's cassette collection, just play that cassette without adding anything
    const existing = cassetteListRef.current.find(
      (c) =>
        c.onlineTrackId === track.id ||
        c.externalId === track.id ||
        (track.youtubeId && c.youtubeId === track.youtubeId) ||
        (c.title.toLowerCase() === track.title.toLowerCase() &&
          c.artist.toLowerCase() === track.artist.toLowerCase())
    );
    if (existing) {
      if (track.streamUrl && !existing.streamUrl) {
        existing.streamUrl = track.streamUrl;
      }
      if (track.youtubeId && !existing.youtubeId) {
        existing.youtubeId = track.youtubeId;
        existing.backupYoutubeIds = track.backupYoutubeIds || [];
      }
      existing.onlineTrackId = track.id;
      saveCollectionToStorage(cassetteListRef.current);
      stageApiRef.current.changeCassetteById?.(existing.id, { forcePlay: true });
      return;
    }

    // 3. If this song is already loaded as the active transient cassette, just trigger play on it
    const curTransient = transientCassetteRef.current;
    if (
      curTransient &&
      (curTransient.onlineTrackId === track.id ||
        curTransient.externalId === track.id ||
        (track.youtubeId && curTransient.youtubeId === track.youtubeId) ||
        (curTransient.title.toLowerCase() === track.title.toLowerCase() &&
          curTransient.artist.toLowerCase() === track.artist.toLowerCase()))
    ) {
      stageApiRef.current.changeCassetteById?.(curTransient.id, { forcePlay: true });
      return;
    }

    setPlayingTrackId(track.id);
    try {
      const rawCover = track.coverUrl || track.thumbUrl || null;
      const { img: loadedImg, resolvedUrl } = await loadCoverImageWithFallback(rawCover);

      stageApiRef.current.playTransientOnlineTrack?.({
        externalId: track.id,
        onlineTrackId: track.id,
        title: track.title || 'Online Track',
        artist: track.artist || 'Featured Artist',
        sourceType: track.sourceType || (track.streamUrl ? 'online' : 'youtube'),
        streamUrl: track.streamUrl || null,
        youtubeId: track.youtubeId || null,
        backupYoutubeIds: track.backupYoutubeIds || [],
        durationSec: track.durationSec || 210,
        coverImg: loadedImg,
        coverUrl: resolvedUrl || rawCover,
        accentColor: track.accentColor || '#ff3b1f',
      });
    } finally {
      setPlayingTrackId(null);
    }
  }, []);

  // --- Custom Song Handlers (Local Audio Files + YouTube Links + Spotify Links) ---
  const handleSelectAudioFile = useCallback(async (file) => {
    if (!file) return;
    setDraftAudioFile(file);
    setDraftRemoteSource(null);
    setUrlResolveStatus(null);
    setShowSongModal(true);

    const meta = await extractAudioMetadata(file);
    setDraftTitle(meta.title || 'Custom Track');
    setDraftArtist(meta.artist || 'Studio Master');
    if (meta.coverImg && meta.coverUrl) {
      setDraftCoverImg(meta.coverImg);
      setDraftCoverPreview(meta.coverUrl);
    } else {
      setDraftCoverImg(null);
      setDraftCoverPreview(null);
    }
    if (meta.accentColor) {
      setDraftAccent(meta.accentColor);
    }
  }, []);

  const handleResolveMediaUrl = useCallback(async (rawUrl) => {
    const urlStr = (rawUrl || '').trim();
    if (!urlStr) return;
    setIsResolvingUrl(true);
    setUrlResolveStatus({
      ok: true,
      loading: true,
      message: 'Fetching track info, cover art & full-length audio stream…',
    });

    try {
      const data = await resolveMediaUrlWithFallback(urlStr);
      if (!data || !data.ok) {
        setUrlResolveStatus({
          ok: false,
          message: data?.error || 'Could not resolve link. Paste a valid YouTube or Spotify URL.',
        });
        setIsResolvingUrl(false);
        return;
      }

      setDraftTitle(data.title || 'Streamed Track');
      setDraftArtist(
        data.artist || (data.platform === 'spotify' ? 'Spotify Artist' : 'YouTube Creator')
      );
      setDraftAudioFile(null);

      const defaultAccent = data.platform === 'spotify' ? '#10b981' : '#ff3b1f';
      setDraftAccent(defaultAccent);

      if (data.coverUrl) {
        setDraftCoverPreview(data.coverUrl);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          setDraftCoverImg(img);
          try {
            const c = document.createElement('canvas');
            c.width = 16;
            c.height = 16;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            const px = ctx.getImageData(0, 0, 16, 16).data;
            let bestSat = -1;
            let bestHex = defaultAccent;
            for (let i = 0; i < px.length; i += 4) {
              const r = px[i] / 255;
              const g = px[i + 1] / 255;
              const b = px[i + 2] / 255;
              const max = Math.max(r, g, b);
              const min = Math.min(r, g, b);
              const l = (max + min) / 2;
              const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
              if (l > 0.18 && l < 0.82 && s > bestSat) {
                bestSat = s;
                const toHex = (v) =>
                  Math.round(v * 255)
                    .toString(16)
                    .padStart(2, '0');
                bestHex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
              }
            }
            if (bestSat > 0.25) setDraftAccent(bestHex);
          } catch {
            // Keep default platform accent
          }
        };
        img.src = data.coverUrl;
      }

      setDraftRemoteSource({
        sourceType: data.platform,
        youtubeId: data.videoId || null,
        backupYoutubeIds: data.backupYoutubeIds || [],
        streamUrl: data.audioPreviewUrl || null,
        spotifyId: data.spotifyId || null,
        spotifyType: data.spotifyType || 'track',
      });

      setUrlResolveStatus({
        ok: true,
        platform: data.platform,
        message:
          data.platform === 'youtube'
            ? `✓ YouTube Ready: "${data.title}" — Full-Length Audio Stream`
            : data.audioPreviewUrl || data.videoId
            ? `✓ Spotify Ready: "${data.title}" — Full-Length Audio + Cover Art`
            : `✓ Spotify Metadata Ready: "${data.title}" (Use Spotify Widget or Synth Backing)`,
      });
    } catch {
      setUrlResolveStatus({
        ok: false,
        message: 'Network error while resolving link. Please check the URL and try again.',
      });
    } finally {
      setIsResolvingUrl(false);
    }
  }, []);

  const handleSelectCoverFile = useCallback((file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setDraftCoverPreview(url);
    const img = new Image();
    img.onload = () => setDraftCoverImg(img);
    img.src = url;
  }, []);

  const handleApplyCustomSong = useCallback(
    async (e) => {
      e.preventDefault();
      // If user typed a YouTube/Spotify URL but hasn't clicked Fetch yet, resolve it automatically and add to collection!
      if (draftMediaUrl.trim() && !draftRemoteSource && !draftAudioFile) {
        setIsResolvingUrl(true);
        try {
          const data = await resolveMediaUrlWithFallback(draftMediaUrl.trim());
          if (data && data.ok) {
            let loadedImg = draftCoverImg;
            if (data.coverUrl) {
              const { img } = await loadCoverImageWithFallback(data.coverUrl);
              if (img) loadedImg = img;
            }
            stageApiRef.current.addCassetteToCollection?.(
              {
                title: draftTitle || data.title || 'Streamed Track',
                artist: draftArtist || data.artist || 'Studio Master',
                sourceType: data.platform,
                youtubeId: data.videoId || null,
                backupYoutubeIds: data.backupYoutubeIds || [],
                streamUrl: data.audioPreviewUrl || null,
                spotifyId: data.spotifyId || null,
                spotifyType: data.spotifyType || 'track',
                coverImg: loadedImg,
                coverUrl: data.coverUrl || draftCoverPreview,
                accentColor: draftAccent,
              },
              { playImmediately: true }
            );
            setIsResolvingUrl(false);
            setShowSongModal(false);
            setDraftMediaUrl('');
            setDraftRemoteSource(null);
            setUrlResolveStatus(null);
            return;
          }
        } catch {
          // Fall through to default apply
        }
        setIsResolvingUrl(false);
      }

      // Add the uploaded file or resolved YouTube/Spotify link into the Left Cassette Collection AND play it!
      stageApiRef.current.addCassetteToCollection?.(
        {
          title: draftTitle || 'Custom Track',
          artist: draftArtist || 'Studio Master',
          sourceType: draftRemoteSource?.sourceType || (draftAudioFile ? 'file' : 'synth'),
          youtubeId: draftRemoteSource?.youtubeId || null,
          backupYoutubeIds: draftRemoteSource?.backupYoutubeIds || [],
          streamUrl: draftRemoteSource?.streamUrl || null,
          spotifyId: draftRemoteSource?.spotifyId || null,
          spotifyType: draftRemoteSource?.spotifyType || 'track',
          file: draftAudioFile,
          coverImg: draftCoverImg,
          coverUrl: draftCoverPreview,
          accentColor: draftAccent,
        },
        { playImmediately: true }
      );
      setShowSongModal(false);
      setDraftMediaUrl('');
      setDraftRemoteSource(null);
      setUrlResolveStatus(null);
    },
    [
      draftTitle,
      draftArtist,
      draftAudioFile,
      draftRemoteSource,
      draftMediaUrl,
      draftCoverImg,
      draftCoverPreview,
      draftAccent,
    ]
  );

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    if (draggedCassetteIdx !== null) return;
    setIsDraggingOver(true);
  }, [draggedCassetteIdx]);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const onDrop = useCallback(
    async (e) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (draggedCassetteIdx !== null) return;
      const files = Array.from(e.dataTransfer?.files || []);
      const audioFile = files.find(
        (f) => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name)
      );
      const imgFile = files.find((f) => f.type.startsWith('image/'));
      if (audioFile) {
        await handleSelectAudioFile(audioFile);
      }
      if (imgFile) {
        handleSelectCoverFile(imgFile);
      }
    },
    [handleSelectAudioFile, handleSelectCoverFile, draggedCassetteIdx]
  );

  const activeCassette =
    cassetteList.find((c) => c.id === activeCassetteId) ||
    recommendedList.find((c) => c.id === activeCassetteId) ||
    (transientCassette && transientCassette.id === activeCassetteId ? transientCassette : null) ||
    cassetteList[0] ||
    CASSETTES[0];

  const effectiveVolPct = Math.round((muted ? 0 : volume) * 100);

  return (
    <main
      className="kd-main"
      data-ready={ready || undefined}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* 3D WebGL Studio Stage */}
      <div ref={containerRef} className="kd-stage" />

      {/* Top Studio Status & Universal Audio Scrubber Pill */}
      <header className="kd-top-bar">
        <div className="kd-top-track">
          <span
            className="kd-meta-dot"
            data-live={
              (transportMode === 'PLAY' && !isChangingCassette && !tapeEjected && !dismantled) ||
              undefined
            }
          />
          <span
            className="kd-top-art"
            style={{
              backgroundImage: `url(${
                activeCassette?.thumbUrl || activeCassette?.coverUrl || activeCassette?.art
              })`,
            }}
          />
          {activeCassette?.sourceType === 'youtube' && (
            <span className="kd-source-badge" data-source="youtube">
              YT
            </span>
          )}
          {activeCassette?.sourceType === 'spotify' && (
            <span className="kd-source-badge" data-source="spotify">
              SPOTIFY
            </span>
          )}
          {(activeCassette?.sourceType === 'stream' ||
            activeCassette?.sourceType === 'online') && (
            <span className="kd-source-badge" data-source="stream">
              {activeCassette?.isRecommended ? 'REC' : 'ONLINE'}
            </span>
          )}
          <span className="kd-meta-title">{activeCassette.title}</span>
          <span className="kd-meta-sep">·</span>
          <span className="kd-meta-artist">{activeCassette.artist}</span>
        </div>

        {(songProgress.duration > 0 || activeCassette?.spotifyId) && (
          <div className="kd-top-scrubber">
            {songProgress.duration > 0 && (
              <>
                <span className="kd-np-time">{formatTime(songProgress.currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.001"
                  value={songProgress.progress || 0}
                  onChange={(e) => engineRef.current?.seekCustomAudio(parseFloat(e.target.value))}
                  className="kd-np-scrubber"
                  aria-label="Seek track"
                />
                <span className="kd-np-time">{formatTime(songProgress.duration)}</span>
              </>
            )}
            {activeCassette?.spotifyId && (
              <button
                type="button"
                className="kd-np-edit kd-np-spotify-toggle"
                data-on={showSpotifyEmbed || undefined}
                onClick={() => setShowSpotifyEmbed((v) => !v)}
                title="Toggle Official Spotify Mini-Player"
              >
                {showSpotifyEmbed ? 'Hide Spotify' : 'Spotify Widget'}
              </button>
            )}
          </div>
        )}

        <span className="kd-meta-mode" data-ejected={tapeEjected || dismantled || undefined}>
          {isChangingCassette
            ? choreoStepLabel || 'Changing tape…'
            : dismantled
            ? 'Dismantled · 25 parts'
            : tapeEjected
            ? `360° view · Side ${side}`
            : doorOpen
            ? 'Door open'
            : `${
                transportMode === 'PLAY'
                  ? 'Playing'
                  : transportMode === 'PAUSE'
                  ? 'Paused'
                  : transportMode === 'REW'
                  ? 'Rewinding'
                  : transportMode === 'FF'
                  ? 'Fast-forward'
                  : 'Stopped'
              } · Side ${side}${
                autoMode
                  ? queueMode === 'recommended'
                    ? ' · Auto Rec'
                    : ' · Auto'
                  : ''
              }`}
        </span>
      </header>

      {/* ==================== LEFT STUDIO PANEL: CASSETTE COLLECTION & AUTO-SWITCH QUEUE ==================== */}
      <aside
        className="kd-side-panel kd-left-panel"
        data-open={leftPanelOpen || undefined}
        aria-label="Cassette collection and sequence queue"
      >
        <button
          type="button"
          className="kd-panel-edge-toggle kd-left-toggle"
          onClick={() =>
            setLeftPanelOpen((v) => {
              const next = !v;
              savePrefsToStorage({ leftPanelOpen: next });
              return next;
            })
          }
          title={leftPanelOpen ? 'Collapse cassette collection' : 'Open cassette collection'}
          aria-label="Toggle cassette collection panel"
        >
          <span className="kd-toggle-chevron" aria-hidden="true">
            {leftPanelOpen ? '‹' : '›'}
          </span>
          <span className="kd-toggle-vertical-label">Cassettes ({cassetteList.length})</span>
        </button>

        <div className="kd-panel-inner">
          <div className="kd-panel-header">
            <div className="kd-panel-title-wrap">
              <div className="kd-panel-eyebrow">
                <span>Cassette deck</span>
                <span className="kd-panel-count">
                  {queueMode === 'recommended' ? recommendedList.length : cassetteList.length}
                </span>
              </div>
              <p className="kd-panel-sub">
                {queueMode === 'recommended'
                  ? 'Continuous recommended auto-play'
                  : 'Saved automatically · Auto-plays next'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
              {/* Share Curated Collection + Skin Link with Audience */}
              <button
                type="button"
                className="kd-auto-switch-btn"
                data-on={shareCopied || undefined}
                onClick={handleShareDeck}
                title="Copy shareable link with your current cassette list & player skin to share with your audience"
              >
                <span>{shareCopied ? '✓ Link copied' : 'Share'}</span>
              </button>

              {/* Auto-Switch Mode Toggle */}
              <button
                type="button"
                className="kd-auto-switch-btn"
                data-on={autoMode || undefined}
                onClick={() => stageApiRef.current.toggleAutoMode?.()}
                aria-pressed={autoMode}
                title={
                  autoMode
                    ? 'Auto mode on: Automatically switches to the next cassette when song ends'
                    : 'Turn on Auto mode to automatically switch cassettes when song ends'
                }
              >
                <span className="kd-auto-dot" data-on={autoMode || undefined} aria-hidden="true" />
                <span>Auto {autoMode ? 'on' : 'off'}</span>
              </button>
            </div>
          </div>

          {/* Segmented Queue Mode Toggle: Saved Collection vs Continuous Recommended */}
          <div className="kd-queue-mode-bar" role="tablist" aria-label="Playback queue source">
            <button
              type="button"
              role="tab"
              aria-selected={queueMode === 'saved'}
              className="kd-queue-tab"
              data-active={queueMode === 'saved' || undefined}
              onClick={() => handleSwitchQueueMode('saved')}
              title="Play sequentially through your saved cassettes"
            >
              <span>Saved</span>
              <span className="kd-queue-tab-badge">{cassetteList.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={queueMode === 'recommended'}
              className="kd-queue-tab"
              data-active={queueMode === 'recommended' || undefined}
              onClick={() => handleSwitchQueueMode('recommended')}
              title="Continuously auto-play recommended songs without stopping"
            >
              <span className="kd-queue-rec-dot" data-active={queueMode === 'recommended' || undefined} />
              <span>Recommended</span>
              <span className="kd-queue-tab-badge">
                {isLoadingRecommendations ? '…' : recommendedList.length || '∞'}
              </span>
            </button>
            {queueMode === 'recommended' && (
              <button
                type="button"
                className="kd-queue-refresh-btn"
                disabled={isLoadingRecommendations}
                onClick={() =>
                  stageApiRef.current.fetchMoreRecommendations?.(activeCassette, {
                    append: false,
                  })
                }
                title="Refresh recommended songs based on current track"
                aria-label="Refresh recommendations"
              >
                {isLoadingRecommendations ? '…' : '↻'}
              </button>
            )}
          </div>

          {/* Sequenced Cassette List (Saved OR Continuous Recommended) */}
          <div className="kd-cassette-list" role="list">
            {queueMode === 'saved' ? (
              cassetteList.map((cas, idx) => {
                const isCurrent = cas.id === activeCassetteId;
                const isPlayingNow =
                  isCurrent &&
                  transportMode === 'PLAY' &&
                  !isChangingCassette &&
                  !tapeEjected &&
                  !dismantled;

                return (
                  <div
                    key={cas.id}
                    role="listitem"
                    tabIndex={0}
                    className="kd-cassette-item"
                    data-active={isCurrent || undefined}
                    data-playing={isPlayingNow || undefined}
                    data-dragging={draggedCassetteIdx === idx || undefined}
                    draggable
                    onDragStart={(e) => {
                      setDraggedCassetteIdx(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (draggedCassetteIdx !== null && draggedCassetteIdx !== idx) {
                        stageApiRef.current.reorderCassetteInCollection?.(draggedCassetteIdx, idx);
                      }
                      setDraggedCassetteIdx(null);
                    }}
                    onDragEnd={() => setDraggedCassetteIdx(null)}
                    onClick={() => stageApiRef.current.changeCassetteById?.(cas.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        stageApiRef.current.changeCassetteById?.(cas.id);
                      }
                    }}
                  >
                    {/* Sequence Number or Live Playing Bars */}
                    <div className="kd-cas-seq">
                      {isPlayingNow ? (
                        <span className="kd-eq-bars" aria-label="Playing">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        <span>{String(idx + 1).padStart(2, '0')}</span>
                      )}
                    </div>

                    {/* Mini Cassette Cover Thumbnail */}
                    <div
                      className="kd-cas-thumb"
                      style={{
                        backgroundImage: `url(${cas.thumbUrl || cas.coverUrl || cas.art})`,
                      }}
                    >
                      <span className="kd-cas-reel-overlay" aria-hidden="true" />
                    </div>

                    {/* Cassette Metadata */}
                    <div className="kd-cas-info">
                      <div className="kd-cas-title-row">
                        <span className="kd-cas-title">{cas.title}</span>
                      </div>
                      <div className="kd-cas-sub-row">
                        <span className="kd-cas-artist">{cas.artist}</span>
                        <span className="kd-cas-badge" data-type={cas.sourceType || 'synth'}>
                          {cas.sourceType === 'youtube'
                            ? 'YT'
                            : cas.sourceType === 'spotify'
                            ? 'Spotify'
                            : cas.sourceType === 'stream' || cas.sourceType === 'online'
                            ? 'Stream'
                            : cas.sourceType === 'file'
                            ? 'File'
                            : 'Tape'}
                        </span>
                      </div>
                    </div>

                    {/* Sequence Up / Down & Delete Controls */}
                    <div
                      className="kd-cas-actions"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className="kd-cas-ctrl-btn"
                        disabled={idx === 0}
                        onClick={() => stageApiRef.current.moveCassetteInCollection?.(cas.id, -1)}
                        title="Move up in sequence"
                        aria-label={`Move ${cas.title} up`}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="kd-cas-ctrl-btn"
                        disabled={idx === cassetteList.length - 1}
                        onClick={() => stageApiRef.current.moveCassetteInCollection?.(cas.id, 1)}
                        title="Move down in sequence"
                        aria-label={`Move ${cas.title} down`}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="kd-cas-ctrl-btn kd-cas-del-btn"
                        disabled={cassetteList.length <= 1}
                        onClick={() => stageApiRef.current.deleteCassetteFromCollection?.(cas.id)}
                        title={
                          cassetteList.length <= 1
                            ? 'At least 1 cassette must remain in the player'
                            : 'Remove cassette from collection'
                        }
                        aria-label={`Delete ${cas.title}`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })
            ) : isLoadingRecommendations && recommendedList.length === 0 ? (
              <div className="kd-search-empty">
                Curating continuous recommendations for your deck…
              </div>
            ) : recommendedList.length === 0 ? (
              <div className="kd-search-empty">
                No recommendations loaded yet. Click ↻ to fetch recommended tracks.
              </div>
            ) : (
              <>
                {recommendedList.map((cas, idx) => {
                  const isCurrent = cas.id === activeCassetteId;
                  const isPlayingNow =
                    isCurrent &&
                    transportMode === 'PLAY' &&
                    !isChangingCassette &&
                    !tapeEjected &&
                    !dismantled;
                  const isSavedInCollection = cassetteList.some(
                    (saved) =>
                      (cas.externalId && saved.externalId === cas.externalId) ||
                      (cas.onlineTrackId && saved.onlineTrackId === cas.onlineTrackId) ||
                      (saved.title.toLowerCase() === cas.title.toLowerCase() &&
                        saved.artist.toLowerCase() === cas.artist.toLowerCase())
                  );

                  return (
                    <div
                      key={cas.id}
                      role="listitem"
                      tabIndex={0}
                      className="kd-cassette-item"
                      data-active={isCurrent || undefined}
                      data-playing={isPlayingNow || undefined}
                      onClick={() =>
                        stageApiRef.current.changeCassetteById?.(cas.id, { forcePlay: true })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          stageApiRef.current.changeCassetteById?.(cas.id, { forcePlay: true });
                        }
                      }}
                    >
                      <div className="kd-cas-seq">
                        {isPlayingNow ? (
                          <span className="kd-eq-bars" aria-label="Playing">
                            <i />
                            <i />
                            <i />
                          </span>
                        ) : (
                          <span>{String(idx + 1).padStart(2, '0')}</span>
                        )}
                      </div>

                      <div
                        className="kd-cas-thumb"
                        style={{
                          backgroundImage: `url(${cas.thumbUrl || cas.coverUrl || cas.cassetteUrl})`,
                        }}
                      >
                        <span className="kd-cas-reel-overlay" aria-hidden="true" />
                      </div>

                      <div className="kd-cas-info">
                        <div className="kd-cas-title-row">
                          <span className="kd-cas-title">{cas.title}</span>
                        </div>
                        <div className="kd-cas-sub-row">
                          <span className="kd-cas-artist">{cas.artist}</span>
                          <span className="kd-cas-badge" data-type="stream">
                            Auto Rec
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="kd-rec-save-btn"
                        data-saved={isSavedInCollection || undefined}
                        onClick={(e) => handleSaveRecommendedTrack(cas, e)}
                        title={
                          isSavedInCollection
                            ? 'Saved in your cassette collection'
                            : 'Save this recommended song to your Saved cassettes'
                        }
                      >
                        {isSavedInCollection ? '✓ Saved' : '+ Save'}
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  className="kd-rec-more-btn"
                  disabled={isLoadingRecommendations}
                  onClick={() =>
                    stageApiRef.current.fetchMoreRecommendations?.(
                      recommendedList[recommendedList.length - 1] || activeCassette,
                      { append: true }
                    )
                  }
                >
                  {isLoadingRecommendations
                    ? 'Loading more recommendations…'
                    : '+ Load more recommended songs'}
                </button>
              </>
            )}
          </div>

          {/* Studio Master Volume Control Bar */}
          <div className="kd-volume-bar" role="group" aria-label="Player volume control">
            <button
              type="button"
              className="kd-volume-mute-btn"
              data-muted={muted || volume === 0 || undefined}
              onClick={handleToggleMute}
              title={muted || volume === 0 ? 'Unmute audio' : 'Mute audio'}
              aria-label={muted || volume === 0 ? 'Unmute audio' : 'Mute audio'}
            >
              {muted || volume === 0 ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8.5 2.75a.75.75 0 0 0-1.23-.57L4.22 4.75H2.25c-.69 0-1.25.56-1.25 1.25v4c0 .69.56 1.25 1.25 1.25h1.97l3.05 2.57a.75.75 0 0 0 1.23-.57V2.75Zm2.72 3.22a.75.75 0 0 1 1.06 0L13.5 7.19l1.22-1.22a.75.75 0 1 1 1.06 1.06L14.56 8.25l1.22 1.22a.75.75 0 1 1-1.06 1.06L13.5 9.31l-1.22 1.22a.75.75 0 0 1-1.06-1.06l1.22-1.22-1.22-1.22a.75.75 0 0 1 0-1.06Z" />
                </svg>
              ) : volume < 0.5 ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8.5 2.75a.75.75 0 0 0-1.23-.57L4.22 4.75H2.25c-.69 0-1.25.56-1.25 1.25v4c0 .69.56 1.25 1.25 1.25h1.97l3.05 2.57a.75.75 0 0 0 1.23-.57V2.75Zm2.46 2.86a.75.75 0 0 1 1.06.08 4.25 4.25 0 0 1 0 5.62.75.75 0 1 1-1.14-.98 2.75 2.75 0 0 0 0-3.66.75.75 0 0 1 .08-1.06Z" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                  <path d="M8.5 2.75a.75.75 0 0 0-1.23-.57L4.22 4.75H2.25c-.69 0-1.25.56-1.25 1.25v4c0 .69.56 1.25 1.25 1.25h1.97l3.05 2.57a.75.75 0 0 0 1.23-.57V2.75Zm2.46 2.86a.75.75 0 0 1 1.06.08 4.25 4.25 0 0 1 0 5.62.75.75 0 1 1-1.14-.98 2.75 2.75 0 0 0 0-3.66.75.75 0 0 1 .08-1.06Zm1.96-1.92a.75.75 0 0 1 1.06.04 7.25 7.25 0 0 1 0 9.54.75.75 0 1 1-1.1-1.02 5.75 5.75 0 0 0 0-7.5.75.75 0 0 1 .04-1.06Z" />
                </svg>
              )}
            </button>
            <span className="kd-volume-label">Vol</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="kd-volume-slider"
              style={{ '--vol-pct': `${effectiveVolPct}%` }}
              aria-label="Master volume"
            />
            <span className="kd-volume-pct">
              {muted || volume === 0 ? 'Mute' : `${effectiveVolPct}%`}
            </span>
          </div>

          {/* Collection Footer: Prev / Next Cassette + Add via Link/Upload */}
          <div className="kd-panel-footer">
            <button
              type="button"
              className="kd-panel-foot-btn"
              onClick={() => stageApiRef.current.playPrevCassette?.()}
              title="Previous cassette in sequence"
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M3.5 3a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-1.5 0v-8.5A.75.75 0 0 1 3.5 3Zm8.78.47a.75.75 0 0 1 .47.69v7.68a.75.75 0 0 1-1.18.62L6.2 8.62a.75.75 0 0 1 0-1.24l5.37-3.84a.75.75 0 0 1 .71-.07Z" />
              </svg>
              <span>Prev</span>
            </button>
            <button
              type="button"
              className="kd-panel-foot-btn"
              onClick={() => stageApiRef.current.playNextCassette?.()}
              title="Next cassette in sequence"
            >
              <span>Next</span>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M12.5 3a.75.75 0 0 1 .75.75v8.5a.75.75 0 0 1-1.5 0v-8.5A.75.75 0 0 1 12.5 3ZM3.72 3.47a.75.75 0 0 1 .71.07l5.37 3.84a.75.75 0 0 1 0 1.24l-5.37 3.84a.75.75 0 0 1-1.18-.62V4.16a.75.75 0 0 1 .47-.69Z" />
              </svg>
            </button>
            <button
              type="button"
              className="kd-panel-foot-btn kd-panel-foot-primary"
              onClick={() => setShowSongModal(true)}
              title="Upload audio file or paste YouTube / Spotify link"
            >
              <span>+ Link / File</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ==================== RIGHT STUDIO PANEL: ONLINE SONG SEARCH & INSTANT ADD ==================== */}
      <aside
        className="kd-side-panel kd-right-panel"
        data-open={rightPanelOpen || undefined}
        aria-label="Search songs online"
      >
        <button
          type="button"
          className="kd-panel-edge-toggle kd-right-toggle"
          onClick={() =>
            setRightPanelOpen((v) => {
              const next = !v;
              savePrefsToStorage({ rightPanelOpen: next });
              return next;
            })
          }
          title={rightPanelOpen ? 'Collapse online song search' : 'Open online song search'}
          aria-label="Toggle online song search panel"
        >
          <span className="kd-toggle-chevron" aria-hidden="true">
            {rightPanelOpen ? '›' : '‹'}
          </span>
          <span className="kd-toggle-vertical-label">Search songs</span>
        </button>

        <div className="kd-panel-inner">
          <div className="kd-panel-header">
            <div className="kd-panel-title-wrap">
              <div className="kd-panel-eyebrow">
                <span>Online song search</span>
                <span className="kd-live-pill">Instant</span>
              </div>
              <p className="kd-panel-sub">Search any song or artist &amp; add to your cassette rack</p>
            </div>
          </div>

          {/* Search Input Form */}
          <form
            className="kd-search-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSearchOnlineSongs(searchQuery);
            }}
          >
            <div className="kd-search-input-wrap">
              <svg
                viewBox="0 0 24 24"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="kd-search-icon"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <line x1="20" y1="20" x2="16.2" y2="16.2" />
              </svg>
              <input
                type="text"
                className="kd-search-input"
                placeholder="Search songs, artists, albums…"
                aria-label="Search songs, artists, or albums"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="kd-search-clear"
                  onClick={() => {
                    setSearchQuery('');
                    handleSearchOnlineSongs('');
                  }}
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              type="submit"
              className="kd-search-submit"
              disabled={isSearchingOnline}
              aria-label="Search online catalog"
            >
              {isSearchingOnline ? '…' : 'Search'}
            </button>
          </form>

          {/* Quick Genre / Artist Chips */}
          <div className="kd-search-chips" role="toolbar" aria-label="Quick artist filters">
            {[
              { label: 'Popular', q: 'The Weeknd Daft Punk Dua Lipa' },
              { label: 'The Weeknd', q: 'The Weeknd' },
              { label: 'Daft Punk', q: 'Daft Punk' },
              { label: 'Coldplay', q: 'Coldplay' },
              { label: 'Arctic Monkeys', q: 'Arctic Monkeys' },
              { label: 'Billie Eilish', q: 'Billie Eilish' },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                className="kd-chip-btn"
                data-active={
                  (searchQuery.toLowerCase() === chip.q.toLowerCase() ||
                    (!searchQuery && chip.label === 'Popular')) ||
                  undefined
                }
                onClick={() => {
                  const nextQ = chip.label === 'Popular' ? '' : chip.q;
                  setSearchQuery(nextQ);
                  handleSearchOnlineSongs(chip.q);
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Search Results List */}
          <div className="kd-search-results" role="list">
            {!searchError && isSearchingOnline && searchResults.length === 0 && (
              <div className="kd-skeleton-list" aria-label="Loading search results">
                {[0, 1, 2, 3, 4].map((idx) => (
                  <div key={idx} className="kd-skeleton-card" aria-hidden="true">
                    <span className="kd-skel-art" />
                    <span className="kd-skel-meta">
                      <i className="kd-skel-line kd-skel-title" />
                      <i className="kd-skel-line kd-skel-sub" />
                    </span>
                    <span className="kd-skel-btns">
                      <i className="kd-skel-pill" />
                      <i className="kd-skel-pill" />
                    </span>
                  </div>
                ))}
              </div>
            )}

            {(searchError || (!isSearchingOnline && searchResults.length === 0)) && (
              <div className="kd-search-empty">
                <p>{searchError || 'No songs matched that query.'}</p>
                <button
                  type="button"
                  className="kd-empty-action-btn"
                  onClick={() => {
                    setSearchQuery('');
                    handleSearchOnlineSongs('The Weeknd Daft Punk Dua Lipa');
                  }}
                >
                  Load popular tracks
                </button>
              </div>
            )}

            {searchResults.map((track) => {
              const inCollection = cassetteList.find(
                (c) =>
                  c.onlineTrackId === track.id ||
                  c.externalId === track.id ||
                  (track.youtubeId && c.youtubeId === track.youtubeId) ||
                  (c.title.toLowerCase() === track.title.toLowerCase() &&
                    c.artist.toLowerCase() === track.artist.toLowerCase())
              );
              const isAdding = addingTrackId === track.id;
              const isLoadingPlay = playingTrackId === track.id;
              const isActiveTrack =
                activeCassette &&
                (activeCassette.onlineTrackId === track.id ||
                  activeCassette.externalId === track.id ||
                  (track.youtubeId && activeCassette.youtubeId === track.youtubeId) ||
                  (activeCassette.title.toLowerCase() === track.title.toLowerCase() &&
                    activeCassette.artist.toLowerCase() === track.artist.toLowerCase()));
              const isPlayingTrack =
                Boolean(isActiveTrack) &&
                transportMode === 'PLAY' &&
                !isChangingCassette &&
                !tapeEjected &&
                !dismantled;

              return (
                <div
                  key={track.id}
                  role="listitem"
                  className="kd-result-card"
                  data-added={Boolean(inCollection) || undefined}
                >
                  <img
                    src={track.thumbUrl || track.coverUrl}
                    alt=""
                    className="kd-result-art"
                    loading="lazy"
                  />

                  <div className="kd-result-meta">
                    <span className="kd-result-title" title={track.title}>
                      {track.title}
                    </span>
                    <span className="kd-result-artist" title={`${track.artist} · ${track.album}`}>
                      {track.artist}
                      {track.durationSec ? ` · ${formatTime(track.durationSec)}` : ''}
                    </span>
                  </div>

                  <div className="kd-result-actions">
                    {/* Add to Left Cassette Collection ONLY when user clicks + Add */}
                    <button
                      type="button"
                      className="kd-res-btn kd-res-add"
                      data-in={Boolean(inCollection) || undefined}
                      disabled={Boolean(inCollection) || isAdding}
                      onClick={() => handleAddOnlineTrack(track)}
                      title={
                        inCollection
                          ? 'Already in your cassette collection'
                          : 'Add to left cassette collection'
                      }
                    >
                      {isAdding ? '…' : inCollection ? '✓ Added' : '+ Add'}
                    </button>

                    {/* Play Immediately in 3D Cassette Player WITHOUT adding to Collection */}
                    <button
                      type="button"
                      className="kd-res-btn kd-res-play"
                      data-playing={isPlayingTrack || undefined}
                      disabled={isLoadingPlay}
                      onClick={() => handlePlayOnlineTrack(track)}
                      title="Play now in 3D cassette player (without adding to collection)"
                    >
                      {isLoadingPlay ? '…' : isPlayingTrack ? 'Playing' : '▶ Play'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="kd-panel-footer kd-search-footer">
            <span className="kd-search-foot-note">
              {isSearchingOnline
                ? 'Searching full-length streams…'
                : `${searchResults.length} tracks ready · Full-length audio`}
            </span>
          </div>
        </div>
      </aside>

      {/* Optional Floating Official Spotify Mini-Player Widget */}
      {activeCassette?.spotifyId && showSpotifyEmbed && (
        <div className="kd-spotify-float">
          <div className="kd-spotify-float-bar">
            <span>Spotify Full-Track Web Player</span>
            <button
              type="button"
              onClick={() => setShowSpotifyEmbed(false)}
              aria-label="Minimize Spotify Player"
            >
              ✕
            </button>
          </div>
          <iframe
            src={`https://open.spotify.com/embed/${activeCassette.spotifyType || 'track'}/${activeCassette.spotifyId}?utm_source=generator&theme=0`}
            width="300"
            height="80"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            title="Spotify Embedded Player"
          />
        </div>
      )}

      {/* Floating 360° Cassette Turntable Controls (Appears cleanly when cassette is taken out) */}
      {tapeEjected && !isChangingCassette && !dismantled && (
        <div className="kd-inspect-pill" role="toolbar" aria-label="360° cassette controls">
          <button
            type="button"
            className="kd-inspect-btn"
            data-active={autoSpin360 || undefined}
            aria-pressed={autoSpin360}
            onClick={() => stageApiRef.current.toggleAutoSpin360?.()}
          >
            <span className="kd-spin-dot" data-on={autoSpin360 || undefined} aria-hidden="true" />
            Auto-spin {autoSpin360 ? 'on' : 'off'}
          </button>
          <button
            type="button"
            className="kd-inspect-btn"
            onClick={() => stageApiRef.current.turnInspectCassette?.(Math.PI * 0.5, 0)}
          >
            Turn 90° ↻
          </button>
          <button
            type="button"
            className="kd-inspect-btn"
            onClick={() => stageApiRef.current.flipCassetteSide?.()}
          >
            Flip side {side === 'A' ? 'B' : 'A'} ⇄
          </button>
          <button
            type="button"
            className="kd-inspect-btn kd-inspect-primary"
            onClick={() => stageApiRef.current.toggleEjectCassette?.()}
          >
            ← Put back in player
          </button>
        </div>
      )}

      {/* Subtle Interactive Micro-Hint */}
      <p
        className="kd-hint"
        data-shifted={(tapeEjected && !isChangingCassette && !dismantled) || undefined}
      >
        {isChangingCassette ? (
          <strong>{choreoStepLabel || 'Loading cassette into player…'}</strong>
        ) : dismantled ? (
          <>
            Drag to <strong>orbit dismantled parts</strong> · click <strong>X</strong> or the{' '}
            <strong>player</strong> to reassemble
          </>
        ) : tapeEjected ? (
          <>
            Drag to <strong>turn 360°</strong> · click any <strong>cassette</strong> to switch ·
            click the <strong>player</strong> to put back
          </>
        ) : doorOpen ? (
          <>
            Door is open — <strong>click the cassette inside</strong> to take it out &amp; inspect{' '}
            <strong>360°</strong>
          </>
        ) : (
          <>
            Sequence your <strong>Cassette collection</strong> on the left · search &amp; add{' '}
            <strong>Online songs</strong> on the right
          </>
        )}
      </p>

      {/* Floating Frosted-Glass Studio Control Dock (Redundant Cassette Swatches Removed!) */}
      <nav className="kd-dock" aria-label="Cassette player controls">
        {/* 1. Player Anodized Finish / Color Variants (Strict Circular Hit Targets + Standalone Hover Tooltip) */}
        <div
          className="kd-color-variants"
          role="group"
          aria-label="Player color finishes"
          onMouseLeave={() => setHoveredColorId(null)}
        >
          {hoveredColorId && (
            <div className="kd-finish-tooltip" aria-hidden="true">
              {PLAYER_COLOR_VARIANTS.find((v) => v.id === hoveredColorId)?.name}
            </div>
          )}
          {PLAYER_COLOR_VARIANTS.map((v) => {
            const isActive = playerColorId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                className="kd-finish-btn"
                data-active={isActive || undefined}
                aria-pressed={isActive}
                onMouseEnter={() => setHoveredColorId(v.id)}
                onFocus={() => setHoveredColorId(v.id)}
                onBlur={() => setHoveredColorId((prev) => (prev === v.id ? null : prev))}
                onClick={() => stageApiRef.current.setPlayerColorVariant?.(v.id)}
                aria-label={`Player finish: ${v.name}`}
              >
                <span className="kd-finish-dot" style={{ background: v.swatch }} />
              </button>
            );
          })}
        </div>

        <div className="kd-dock-divider" aria-hidden="true" />

        {/* 2. Recessed Tactile Transport Capsule (PREV / REW / PLAY-PAUSE / FF / NEXT) */}
        <div className="kd-transport-capsule" role="group" aria-label="Tape transport">
          <button
            type="button"
            className="kd-transport-btn"
            onClick={() => stageApiRef.current.playPrevCassette?.()}
            title="Previous cassette in collection"
            aria-label="Previous cassette"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 6h2.2v12H6zm3.8 6l8.2 6V6z" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="kd-transport-btn"
            data-on={transportMode === 'REW' || undefined}
            onClick={() => stageApiRef.current.setTransport?.('REW')}
            title="Rewind tape ([)"
            aria-label="Rewind tape"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M11.5 6.5v11L3 12l8.5-5.5zm9 0v11L12 12l8.5-5.5z" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="kd-transport-btn kd-transport-play"
            data-on={
              (transportMode === 'PLAY' && !isChangingCassette && !tapeEjected && !dismantled) ||
              undefined
            }
            onClick={() =>
              stageApiRef.current.setTransport?.(transportMode === 'PLAY' ? 'PAUSE' : 'PLAY')
            }
            title={transportMode === 'PLAY' ? 'Pause tape (Space)' : 'Play tape (Space)'}
            aria-label="Play or pause cassette"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              {transportMode !== 'PLAY' || tapeEjected || dismantled ? (
                <path d="M7.5 4.8v14.4L19.5 12z" fill="currentColor" />
              ) : (
                <path d="M6.8 5h3.8v14H6.8zm6.6 0h3.8v14h-3.8z" fill="currentColor" />
              )}
            </svg>
          </button>

          <button
            type="button"
            className="kd-transport-btn"
            data-on={transportMode === 'FF' || undefined}
            onClick={() => stageApiRef.current.setTransport?.('FF')}
            title="Fast-forward tape (])"
            aria-label="Fast-forward tape"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
              <path d="M3.5 6.5v11L12 12 3.5 6.5zm9 0v11L21 12l-8.5-5.5z" fill="currentColor" />
            </svg>
          </button>

          <button
            type="button"
            className="kd-transport-btn"
            onClick={() => stageApiRef.current.playNextCassette?.()}
            title="Next cassette in collection (E)"
            aria-label="Next cassette"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M6 18l8.2-6L6 6v12zM15.8 6H18v12h-2.2z" fill="currentColor" />
            </svg>
          </button>
        </div>

        <div className="kd-dock-divider" aria-hidden="true" />

        {/* 3. Structured Deck Mechanism Actions (Door, 360° Take-Out, Side A/B Flip, X Dismantle) */}
        <div className="kd-deck-actions" role="group" aria-label="Deck actions">
          {/* Open / Close Door */}
          <button
            type="button"
            className="kd-action-pill"
            data-active={(doorOpen && !tapeEjected && !dismantled) || undefined}
            aria-pressed={doorOpen && !tapeEjected && !dismantled}
            onClick={() => stageApiRef.current.toggleDoor?.()}
            title="Open / close cassette door (O)"
            aria-label="Open or close door"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
              <path d="M12 4.5l-6.5 7.5h13L12 4.5zM5.5 15.5h13v2.6h-13z" fill="currentColor" />
            </svg>
            <span>{doorOpen && !dismantled ? 'Door open' : 'Door'}</span>
          </button>

          {/* Take Out / Put Back 360° Cassette */}
          <button
            type="button"
            className="kd-action-pill"
            data-active={tapeEjected || undefined}
            aria-pressed={tapeEjected}
            onClick={() => stageApiRef.current.toggleEjectCassette?.()}
            title={
              tapeEjected
                ? 'Put cassette back in player (I)'
                : 'Take out cassette for 360° view (I)'
            }
            aria-label="Take out or put back cassette"
          >
            <svg
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="6" width="18" height="12" rx="2.5" />
              <circle cx="8.5" cy="12" r="1.8" />
              <circle cx="15.5" cy="12" r="1.8" />
            </svg>
            <span>{tapeEjected ? 'In 360°' : '360°'}</span>
          </button>

          {/* Flip Side A / B */}
          <button
            type="button"
            className="kd-action-pill kd-side-pill"
            data-active={side === 'B' || undefined}
            onClick={() => stageApiRef.current.flipCassetteSide?.()}
            title={`Flip cassette to Side ${side === 'A' ? 'B' : 'A'} (F)`}
            aria-label="Flip cassette Side A/B"
          >
            <span>Side {side}</span>
            <i className="kd-flip-arrow" aria-hidden="true">
              ⇄
            </i>
          </button>

          {/* X Button — Dismantle / Explode all 3D parts of the Cassette Player */}
          <button
            type="button"
            className="kd-action-pill kd-x-pill"
            data-active={dismantled || undefined}
            aria-pressed={dismantled}
            onClick={() => stageApiRef.current.toggleDismantle?.()}
            title={
              dismantled
                ? 'Reassemble cassette player parts (X)'
                : 'Dismantle cassette player parts (X)'
            }
            aria-label="Dismantle or reassemble cassette player"
          >
            <span className="kd-x-badge" aria-hidden="true">
              X
            </span>
            <span>{dismantled ? 'Assemble' : 'Dismantle'}</span>
          </button>
        </div>

        <div className="kd-dock-divider" aria-hidden="true" />

        {/* 4. Custom Music Studio Trigger (Also Adds to Left Cassette Collection) */}
        <button
          type="button"
          className="kd-studio-trigger"
          data-on={showSongModal || undefined}
          onClick={() => setShowSongModal((v) => !v)}
          title="Upload local file or paste YouTube / Spotify link (adds to cassette collection)"
          aria-label="Add custom music"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <span>+ Music</span>
        </button>
      </nav>

      {/* Creator Signature Mark (Clickable Adit-Yah -> https://x.com/Adidotdev) */}
      <div className="kd-creator-mark">
        <span>Made by</span>
        <a
          href="https://x.com/Adidotdev"
          target="_blank"
          rel="noopener noreferrer"
          className="kd-creator-link"
          title="Visit Adit-Yah on X (@Adidotdev)"
        >
          <span>Adit-Yah</span>
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            className="kd-creator-x-icon"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </a>
      </div>

      {/* Clean Custom Cassette Studio Modal (Supports YouTube Links, Spotify Links, & Local Audio Files — Adds directly to Collection!) */}
      {showSongModal && (
        <div
          className="kd-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="kd-modal-title"
          onClick={() => setShowSongModal(false)}
        >
          <form
            className="kd-song-studio"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleApplyCustomSong}
          >
            <div className="kd-studio-header">
              <div>
                <h3 id="kd-modal-title">Add song via link or local file</h3>
                <p>
                  Paste a YouTube / Spotify link or upload an audio file — it will be pressed onto a
                  3D cassette and added to your cassette collection.
                </p>
              </div>
              <button
                type="button"
                className="kd-close-btn"
                onClick={() => setShowSongModal(false)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {/* 1. YouTube / Spotify Link Input Box */}
            <div className="kd-url-box">
              <div className="kd-url-label-row">
                <span className="kd-url-title">Paste YouTube or Spotify link</span>
                <div className="kd-url-badges">
                  <span className="kd-url-badge" data-brand="youtube">
                    YouTube
                  </span>
                  <span className="kd-url-badge" data-brand="spotify">
                    Spotify
                  </span>
                </div>
              </div>
              <div className="kd-url-input-row">
                <input
                  type="url"
                  className="kd-url-input"
                  aria-label="YouTube or Spotify URL"
                  placeholder="https://www.youtube.com/watch?v=... or https://open.spotify.com/track/..."
                  value={draftMediaUrl}
                  onChange={(e) => setDraftMediaUrl(e.target.value)}
                  onPaste={(e) => {
                    const pasted = e.clipboardData?.getData('text') || '';
                    if (
                      pasted &&
                      (pasted.includes('youtube.com') ||
                        pasted.includes('youtu.be') ||
                        pasted.includes('spotify.com') ||
                        pasted.startsWith('spotify:'))
                    ) {
                      setTimeout(() => handleResolveMediaUrl(pasted), 30);
                    }
                  }}
                />
                <button
                  type="button"
                  className="kd-url-fetch-btn"
                  disabled={isResolvingUrl || !draftMediaUrl.trim()}
                  onClick={() => handleResolveMediaUrl(draftMediaUrl)}
                >
                  {isResolvingUrl ? 'Fetching…' : 'Fetch link'}
                </button>
              </div>
              {urlResolveStatus && (
                <div
                  className="kd-url-status"
                  role="status"
                  data-ok={urlResolveStatus.ok || undefined}
                  data-error={!urlResolveStatus.ok || undefined}
                >
                  {urlResolveStatus.message}
                </div>
              )}
            </div>

            <div className="kd-or-divider">
              <span>Or upload local audio file</span>
            </div>

            {/* 2. Audio File Picker Box */}
            <div
              className="kd-file-drop"
              role="button"
              tabIndex={0}
              onClick={() => audioInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  audioInputRef.current?.click();
                }
              }}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
                hidden
                onChange={(e) => handleSelectAudioFile(e.target.files?.[0])}
              />
              <div className="kd-file-icon" aria-hidden="true">
                ♪
              </div>
              <div className="kd-file-text">
                <strong>
                  {draftAudioFile ? draftAudioFile.name : 'Choose an audio file (.mp3, .wav, .m4a)'}
                </strong>
                <span>
                  {draftAudioFile
                    ? `${(draftAudioFile.size / (1024 * 1024)).toFixed(2)} MB · ID3 title, artist & cover extracted`
                    : 'Or drag & drop any song file onto the window'}
                </span>
              </div>
              <span className="kd-file-pill">{draftAudioFile ? 'Change' : 'Browse'}</span>
            </div>

            <div className="kd-form-grid">
              <label className="kd-field">
                <span>Cassette title</span>
                <input
                  type="text"
                  placeholder="e.g. Midnight Tape"
                  value={draftTitle}
                  onChange={(e) => setDraftTitle(e.target.value)}
                />
              </label>
              <label className="kd-field">
                <span>Artist / imprint</span>
                <input
                  type="text"
                  placeholder="e.g. Studio Master"
                  value={draftArtist}
                  onChange={(e) => setDraftArtist(e.target.value)}
                />
              </label>
            </div>

            {/* Optional Cover Image + Label Accent Color */}
            <div className="kd-cover-row">
              <button
                type="button"
                className="kd-cover-btn"
                onClick={() => coverInputRef.current?.click()}
              >
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => handleSelectCoverFile(e.target.files?.[0])}
                />
                {draftCoverPreview ? (
                  <img src={draftCoverPreview} alt="" className="kd-cover-thumb" />
                ) : (
                  <span className="kd-cover-plus" aria-hidden="true">
                    +
                  </span>
                )}
                <span>{draftCoverPreview ? 'Change cover art' : 'Upload cover art (optional)'}</span>
              </button>

              <div className="kd-accent-picker" role="group" aria-label="Label accent color">
                {['#ff3b1f', '#2563eb', '#10b981', '#d97706', '#151515'].map((col) => (
                  <button
                    key={col}
                    type="button"
                    className="kd-color-dot"
                    style={{ background: col }}
                    data-selected={draftAccent === col || undefined}
                    onClick={() => setDraftAccent(col)}
                    aria-label={`Select accent ${col}`}
                  />
                ))}
              </div>
            </div>

            <div className="kd-studio-actions">
              <button
                type="button"
                className="kd-btn-secondary"
                onClick={() => setShowSongModal(false)}
              >
                Cancel
              </button>
              <button type="submit" className="kd-btn-primary" disabled={isResolvingUrl}>
                {isResolvingUrl ? 'Resolving Link…' : 'Add to Collection & Play'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Drag-and-Drop Overlay */}
      {isDraggingOver && (
        <div className="kd-drop-overlay">
          <div className="kd-drop-pill">
            Drop audio or cover image to add to your Cassette Collection
          </div>
        </div>
      )}
    </main>
  );
}

