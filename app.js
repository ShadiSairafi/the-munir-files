/**
 * THE MUNIR FILES — Interactive Declassified Case File Webapp (v3.0 Tactile Forensic Edition)
 * Features:
 *  - 2-Sided 3D Tactile Manila Folder Cover (Zero bleed-through when closed + hand-tilt + finger-peel + physical hand-open & hand-close)
 *  - Realistic Multi-Layered Procedural Acoustic Foley Engine (Clasp & Twine, Cardstock Flex, 3-Phase Page Flip, Stamp Slam, Felt Marker)
 *  - 12 Full-Bleed Borderless Detective Avatars + 4 Custom Persons of Interest Portraits (All Editable via Presets, File Upload, or Image URL)
 *  - Cookie + LocalStorage Persistence for Light-Table Sidebar Tab (Dossier vs Page Chat vs Audit Log)
 *  - 3-Ring Case Binder Spread with 3D Turning Page Leaf Animation, Chapter Side Tabs, Curled Corners & Inline Read-Width Zoom
 *  - Upgraded Light-Table Zoom & Pan Engine with "Read 2x" Top-of-Chat Fit, Exact DOM Bounds & Interactive Mini-Map Radar
 *  - Fine-Tuned Redact & Highlight Studio with Stamp Labels, 4 Marker Colors, Undo (Ctrl+Z), Live Crosshair & Drag-to-Move / Corner-Resize
 *  - Red-String Board 3D Hand-Tilt Paper Hover Physics
 */

(function () {
  "use strict";

  const RAW_META = window.CASE_METADATA || { subjects: [], chapters: [] };
  const ICON_MAP = window.SVG_ICONS || {};
  function ICON(key, extraClass = "") {
    if (typeof ICON_MAP === "function") return ICON_MAP(key, extraClass);
    const rawSvg = ICON_MAP[key] || ICON_MAP.folder || "";
    if (!extraClass) return rawSvg;
    return rawSvg.replace('class="svg-icon', `class="svg-icon ${extraClass}`);
  }
  const AVATARS = window.DETECTIVE_AVATARS || [];
  const RANDOM_NAMES = window.RANDOM_DETECTIVE_NAMES || ["Detective Paws"];

  // Default custom full-bleed portraits for the 4 Persons of Interest
  const DEFAULT_POI_PORTRAITS = {
    munir: "./avatars/poi_munir.jpg?v=4",
    aseel: "./avatars/poi_aseel.jpg?v=2",
    hala: "./avatars/poi_hala.jpg?v=2",
    collateral: "./avatars/poi_collateral.jpg?v=2"
  };

  // Normalize all 49 exhibits from data.js so every property is guaranteed present
  const EXHIBITS = (window.EXHIBITS_DATA || []).map((raw, idx) => {
    const numId = typeof raw.id === "number" ? raw.id : idx + 1;
    const codeId =
      typeof raw.id === "string" && raw.id.startsWith("EX-")
        ? raw.id
        : `EX-${String(numId).padStart(2, "0")}`;
    return {
      ...raw,
      numId,
      id: codeId,
      order: numId,
      filename: raw.filename || raw.file || "",
      chapterId: raw.chapterId || raw.chapter || "ch1",
      dateLabel: raw.dateLabel || raw.dateStr || "",
      timeRange: raw.timeRange || "",
      phoneClock: raw.phoneClock || "",
      battery: raw.battery || "",
      severity: raw.severity || raw.importance || "high",
      duplicateOfCode: raw.duplicateOf
        ? `EX-${String(raw.duplicateOf).padStart(2, "0")}`
        : null
    };
  });

  // Normalize subjects & chapters from data.js
  const META = {
    ...RAW_META,
    subjects: (RAW_META.subjects || []).map((s) => ({
      ...s,
      id: s.id || "munir",
      codename: s.codename || s.code || "SUBJECT",
      realName: s.realName || s.name || "Subject",
      role: s.role || s.alias || "",
      status: s.status || "ACTIVE",
      iconKey: s.iconKey || "subject",
      defaultAvatarUrl:
        DEFAULT_POI_PORTRAITS[s.id] || "./avatars/poi_munir.jpg?v=2",
      summary: s.summary || s.notes || "",
      linkedExhibits: Array.isArray(s.linkedExhibits) ? s.linkedExhibits : []
    })),
    chapters: (RAW_META.chapters || []).map((ch) => {
      const count =
        ch.id === "all"
          ? EXHIBITS.length
          : EXHIBITS.filter((e) => e.chapterId === ch.id).length;
      return {
        ...ch,
        count,
        iconKey: ch.id === "all" ? "folder" : "clock"
      };
    })
  };

  const STORAGE_KEYS = {
    USER_PROFILE: "munir_detective_profile_v2",
    SHARED_STATE_CACHE: "munir_shared_state_cache_v2",
    PINNED_SET: "munir_pinned_exhibits_v2",
    SESSION_ENTERED: "munir_session_entered_v2",
    SIDEBAR_TAB_COOKIE: "munir_sidebar_tab",
    LOCK_ZOOM_COOKIE: "munir_lock_zoom",
    USER_ID_COOKIE: "munir_user_id",
    USER_NAME_COOKIE: "munir_user_name",
    USER_AVATAR_COOKIE: "munir_user_avatar",
    USER_PROFILE_COOKIE: "munir_user_profile"
  };

  function setCookieVal(name, val, maxAgeSec = 31536000) {
    try {
      document.cookie = `${name}=${encodeURIComponent(
        String(val ?? "")
      )}; path=/; max-age=${maxAgeSec}; SameSite=Lax`;
    } catch (_e) {}
  }

  function getCookieVal(name) {
    try {
      const match = document.cookie.match(
        new RegExp(`(?:^|; )${name}=([^;]*)`)
      );
      if (match && match[1] !== undefined) {
        return decodeURIComponent(match[1]);
      }
    } catch (_e) {}
    return null;
  }

  // Cookie + localStorage helpers for saving the user's preferred sidebar tab
  function saveSidebarTabCookie(tabId) {
    if (!tabId) return;
    setCookieVal(STORAGE_KEYS.SIDEBAR_TAB_COOKIE, tabId);
    try {
      localStorage.setItem(STORAGE_KEYS.SIDEBAR_TAB_COOKIE, tabId);
    } catch (_e) {}
  }

  function getSavedSidebarTab() {
    const isValid = (v) => v === "dossier" || v === "chat" || v === "log";
    const cVal = getCookieVal(STORAGE_KEYS.SIDEBAR_TAB_COOKIE);
    if (isValid(cVal)) return cVal;
    try {
      const ls = localStorage.getItem(STORAGE_KEYS.SIDEBAR_TAB_COOKIE);
      if (isValid(ls)) return ls;
    } catch (_e) {}
    return "dossier";
  }

  // Cookie + localStorage helpers for saving Lock Zoom preference
  function saveLockZoomCookie(locked) {
    const val = locked ? "1" : "0";
    setCookieVal(STORAGE_KEYS.LOCK_ZOOM_COOKIE, val);
    try {
      localStorage.setItem(STORAGE_KEYS.LOCK_ZOOM_COOKIE, val);
    } catch (_e) {}
  }

  function getSavedLockZoom() {
    const cVal = getCookieVal(STORAGE_KEYS.LOCK_ZOOM_COOKIE);
    if (cVal === "1" || cVal === "true") return true;
    if (cVal === "0" || cVal === "false") return false;
    try {
      const ls = localStorage.getItem(STORAGE_KEYS.LOCK_ZOOM_COOKIE);
      if (ls === "1" || ls === "true") return true;
    } catch (_e) {}
    return false;
  }

  // Cookie + localStorage helpers for persisting the user's detective name & icon
  function saveUserProfileCookies(profile) {
    if (!profile || !profile.id || !profile.name) return;
    setCookieVal(STORAGE_KEYS.USER_ID_COOKIE, profile.id);
    setCookieVal(STORAGE_KEYS.USER_NAME_COOKIE, profile.name);
    setCookieVal(
      STORAGE_KEYS.USER_AVATAR_COOKIE,
      profile.avatarId || "cat-sherlock"
    );
    // Store compact JSON in cookie if customAvatarUrl is a normal URL (not a huge base64 data URI)
    const compactProfile = {
      id: profile.id,
      name: profile.name,
      avatarId: profile.avatarId || "cat-sherlock",
      customAvatarUrl:
        profile.customAvatarUrl && !profile.customAvatarUrl.startsWith("data:")
          ? profile.customAvatarUrl
          : "",
      createdAt: profile.createdAt || Date.now()
    };
    setCookieVal(
      STORAGE_KEYS.USER_PROFILE_COOKIE,
      JSON.stringify(compactProfile)
    );
    try {
      localStorage.setItem(STORAGE_KEYS.USER_PROFILE, JSON.stringify(profile));
    } catch (_e) {}
  }

  function loadUserProfileFromCookies() {
    let lsProfile = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER_PROFILE);
      if (raw) lsProfile = JSON.parse(raw);
    } catch (_e) {}

    let cookieProfile = null;
    try {
      const rawCookie = getCookieVal(STORAGE_KEYS.USER_PROFILE_COOKIE);
      if (rawCookie) cookieProfile = JSON.parse(rawCookie);
    } catch (_e) {}

    const cookieId = getCookieVal(STORAGE_KEYS.USER_ID_COOKIE);
    const cookieName = getCookieVal(STORAGE_KEYS.USER_NAME_COOKIE);
    const cookieAvatar = getCookieVal(STORAGE_KEYS.USER_AVATAR_COOKIE);

    if (cookieName && (cookieId || lsProfile?.id)) {
      return {
        id: cookieId || cookieProfile?.id || lsProfile?.id,
        name: cookieName,
        avatarId:
          cookieAvatar ||
          cookieProfile?.avatarId ||
          lsProfile?.avatarId ||
          "cat-sherlock",
        customAvatarUrl:
          lsProfile?.customAvatarUrl || cookieProfile?.customAvatarUrl || "",
        createdAt:
          lsProfile?.createdAt || cookieProfile?.createdAt || Date.now()
      };
    }

    if (cookieProfile && cookieProfile.id && cookieProfile.name) {
      return {
        ...cookieProfile,
        customAvatarUrl:
          lsProfile?.customAvatarUrl || cookieProfile.customAvatarUrl || ""
      };
    }

    if (lsProfile && lsProfile.id && lsProfile.name) {
      return lsProfile;
    }

    return null;
  }

  const SENSITIVE_TERMS = [
    "Walter Nigga",
    "Walter",
    "Hala",
    "yearner",
    "codependent",
    "love bombing",
    "block you",
    "blocked me",
    "my wife",
    "6:33 AM",
    "6:33 am",
    "rage baiting",
    "manipulative",
    "insane",
    "apologize",
    "piece of cake",
    "Good girl",
    "I miss you"
  ];

  // Alternating hand-held degree tilt angles for the Manila folder cover so each time it rests in a fresh direction
  const FOLDER_REST_ANGLES = [
    -5.6,
    5.2,
    -4.5,
    6.0,
    -6.2,
    4.8,
    -5.0,
    5.5
  ];

  const VAULT_PASSCODE = "FilesPavelion";
  const VAULT_STORAGE_KEY = "munir_vault_unlocked_v1";

  // ============================================================================
  // APPLICATION STATE
  // ============================================================================
  const state = {
    vaultLocked:
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem(VAULT_STORAGE_KEY) !== "1"
        : true,
    coverOpen: false,
    coverAnimating: false,
    folderTiltIndex: 0,
    isPeelingCover: false,
    peelHoldTimer: null,
    peelPointerStartX: 0,
    peelDragDeltaX: 0,
    activeChapter: "all",
    activeSubjectFilter: null,
    searchQuery: "",
    viewMode: "grid", // 'grid' | 'binder' | 'stream' | 'foia' | 'corkboard'
    redactionsArmed: true,
    pinnedOnly: false,
    hideDuplicates: false,
    briefingCollapsed: false,
    soundEnabled: true,
    pinnedSet: new Set(),

    // Current User Detective Identity (No Login Required, Cookie-Persisted)
    userProfile: null,
    editingAvatarId: "cat-sherlock",
    editingCustomAvatarUrl: "",

    // Person of Interest Modal Editor State
    editingPoiId: null,
    editingPoiAvatarUrl: "",

    // Shared Multi-User State
    sharedVersion: 0,
    shared: {
      chatsByExhibit: {},
      marksByExhibit: {},
      notesByExhibit: {},
      poiOverrides: {},
      deletedIds: {},
      clearedAtByExhibit: {},
      cursorsByExhibit: {},
      presenceByUser: {},
      auditLog: []
    },
    auditFilter: "all",

    // Binder Page-by-Page state
    binderIndex: 0,
    binderReadZoom: false,
    binderFlipping: false,

    // Lightbox & Zoom/Pan state
    lightboxOpen: false,
    currentExhibitIndex: 0,
    activeSidebarTab: getSavedSidebarTab(),
    lockZoom: getSavedLockZoom(),
    zoomLevel: 1,
    panX: 0,
    panY: 0,
    isDraggingPan: false,
    hasDragged: false,
    dragStartX: 0,
    dragStartY: 0,
    isScrubbingMiniMap: false,
    loupeActive: false,
    compareActive: false,

    // Fine-Tuned Pencil, Redact & Highlight state
    drawMode: null, // null | 'pencil' | 'redact' | 'highlight'
    activeRedactLabel: "REDACTED",
    activeHighlightColor: "yellow", // 'red' | 'yellow' | 'green' | 'cyan' | 'orange' | 'white'
    activePencilWidth: 3.5,
    pencilArrowTip: false,
    currentPencilPoints: [],
    lastCursorBroadcastTs: 0,
    isDrawingMark: false,
    drawStartNormX: 0,
    drawStartNormY: 0,
    activeMarkInteraction: null,
    imageFilter: "none",
    sidebarVisible: true,
    autoplayTimer: null,
    replyingToChat: null,
    pendingChatMediaUrl: null,
    gifDrawerOpen: false,
    emojiDrawerOpen: false,
    globalChatDrawerOpen: false,
    activeGifCategory: "unhinged",
    gifSearchQuery: "",
    gifRemoteResults: null,
    activeEmojiCategory: "hype",
    emojiSearchQuery: ""
  };

  const broadcastChannel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel("munir_dossier_live_channel_v2")
      : null;

  // ============================================================================
  // STUDIO-GRADE REAL FOLEY AUDIO ENGINE (MASTERED WAV SAMPLES + WEB AUDIO POOL)
  // ============================================================================
  const FOLEY_MANIFEST = {
    folder_peel: ["./audio/folder_peel.wav?v=2"],
    folder_open: ["./audio/folder_open.wav?v=2"],
    folder_close: ["./audio/folder_close.wav?v=2"],
    page_flip: [
      "./audio/page_turn_1.wav?v=2",
      "./audio/page_turn_2.wav?v=2",
      "./audio/page_turn_3.wav?v=2"
    ],
    page_open: ["./audio/page_open.wav?v=2"],
    scan_inspect: ["./audio/scan_inspect.wav?v=2"],
    stamp: ["./audio/stamp_slam.wav?v=2"],
    marker: ["./audio/marker_stroke.wav?v=2"],
    pencil_loop: ["./audio/pencil_loop.wav?v=2"],
    click: ["./audio/tactile_click.wav?v=2"]
  };

  let audioCtx = null;
  const decodedFoleyBuffers = {};
  const htmlAudioPool = {};
  let foleyPreloadStarted = false;
  let pageTurnRoundRobin = 0;

  // Continuous speed-reactive pen/pencil drawing sound state
  let activePenSource = null;
  let activePenGain = null;
  let activePenFilter = null;
  let activePenHtmlAudio = null;
  let penIdleSilenceTimer = null;
  let paperGrainBuffer = null;

  function ensureAudioContext() {
    if (!audioCtx) {
      const AudioContextClass =
        window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    if (!foleyPreloadStarted) {
      preloadFoleyAssets();
    }
    return audioCtx;
  }

  function getOrCreatePaperGrainBuffer(ctx) {
    if (paperGrainBuffer) return paperGrainBuffer;
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 2.4);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    // Generate warm brown/pink paper-fiber noise with subtle organic micro-grain
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    let lastOut = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.045;
      b6 = white * 0.115926;

      // Blend with warm brown integration so there is zero harshness
      lastOut = (lastOut + 0.06 * white) / 1.06;
      const fiberMod = 0.78 + 0.22 * Math.sin(i * 0.0031) * Math.cos(i * 0.00073);
      data[i] = (pink * 0.65 + lastOut * 0.45) * fiberMod;
    }
    paperGrainBuffer = buffer;
    return buffer;
  }

  function preloadFoleyAssets() {
    foleyPreloadStarted = true;
    Object.entries(FOLEY_MANIFEST).forEach(([key, urls]) => {
      decodedFoleyBuffers[key] = [];
      htmlAudioPool[key] = [];
      urls.forEach((url, idx) => {
        try {
          const audioEl = new Audio(url);
          audioEl.preload = "auto";
          htmlAudioPool[key][idx] = audioEl;
        } catch (_e) {}

        fetch(url)
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
          .then((arr) => {
            const ctx =
              audioCtx ||
              new (window.AudioContext || window.webkitAudioContext)();
            audioCtx = ctx;
            return ctx.decodeAudioData(arr);
          })
          .then((decoded) => {
            decodedFoleyBuffers[key][idx] = decoded;
          })
          .catch(() => {});
      });
    });
  }

  // Start preloading real WAV foley immediately in background
  setTimeout(preloadFoleyAssets, 60);

  function startContinuousPenSound() {
    if (!state.soundEnabled) return;
    stopContinuousPenSound();
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const buf = getOrCreatePaperGrainBuffer(ctx);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const offset = Math.random() * 1.8;

      // Warm paper resonance bandpass + soft lowpass rolloff (no high-pitched hiss)
      const bandFilter = ctx.createBiquadFilter();
      bandFilter.type = "bandpass";
      bandFilter.frequency.setValueAtTime(520, ctx.currentTime);
      bandFilter.Q.setValueAtTime(0.9, ctx.currentTime);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(1360, ctx.currentTime);

      const gainNode = ctx.createGain();
      // Start completely silent until the pen actually moves across the paper
      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);

      src.connect(bandFilter);
      bandFilter.connect(lowpass);
      lowpass.connect(gainNode);
      gainNode.connect(ctx.destination);
      src.start(0, offset);

      activePenSource = src;
      activePenFilter = bandFilter;
      activePenGain = gainNode;
    } catch (_e) {}
  }

  function updateContinuousPenSound(moveDistPx) {
    if (!state.soundEnabled) return;
    if (!activePenSource) {
      startContinuousPenSound();
    }
    try {
      const speed = Math.max(0, Math.min(36, moveDistPx));
      // Warm, clearly audible graphite-on-manila-paper friction (3.6% to 14.5% max gain)
      const targetVol = Math.min(0.145, 0.036 + speed * 0.003);
      const targetFreq = Math.min(780, 480 + speed * 8.0);

      if (activePenGain && audioCtx) {
        const now = audioCtx.currentTime;
        activePenGain.gain.setTargetAtTime(targetVol, now, 0.018);
        if (activePenFilter) {
          activePenFilter.frequency.setTargetAtTime(targetFreq, now, 0.024);
        }
      }

      if (penIdleSilenceTimer) clearTimeout(penIdleSilenceTimer);
      penIdleSilenceTimer = setTimeout(() => {
        if (activePenGain && audioCtx) {
          const now = audioCtx.currentTime;
          // Fade to complete silence as soon as the hand pauses
          activePenGain.gain.setTargetAtTime(0.0001, now, 0.02);
        }
      }, 48);
    } catch (_e) {}
  }

  function stopContinuousPenSound() {
    if (penIdleSilenceTimer) {
      clearTimeout(penIdleSilenceTimer);
      penIdleSilenceTimer = null;
    }
    if (activePenSource) {
      const src = activePenSource;
      const gain = activePenGain;
      activePenSource = null;
      activePenGain = null;
      activePenFilter = null;
      try {
        if (gain && audioCtx) {
          const now = audioCtx.currentTime;
          gain.gain.setTargetAtTime(0.0001, now, 0.012);
          setTimeout(() => {
            try {
              src.stop();
              src.disconnect();
            } catch (_e) {}
          }, 35);
        } else {
          src.stop();
          src.disconnect();
        }
      } catch (_e) {}
    }
    if (activePenHtmlAudio) {
      try {
        activePenHtmlAudio.pause();
      } catch (_e) {}
      activePenHtmlAudio = null;
    }
  }

  function playForensicSound(type) {
    if (!state.soundEnabled) return;
    try {
      const ctx = ensureAudioContext();

      // Map aliases to our studio foley keys with tailored volume & natural pitch variation
      let key = "click";
      let baseGain = 0.72;
      let rateMin = 0.96;
      let rateMax = 1.04;

      if (type === "folder_peel") {
        key = "folder_peel";
        baseGain = 0.84;
        rateMin = 0.96;
        rateMax = 1.03;
      } else if (type === "unseal" || type === "folder_open") {
        key = "folder_open";
        baseGain = 0.92;
        rateMin = 0.97;
        rateMax = 1.03;
      } else if (type === "folder_close") {
        key = "folder_close";
        baseGain = 0.88;
        rateMin = 0.97;
        rateMax = 1.03;
      } else if (type === "page" || type === "page_flip") {
        key = "page_flip";
        baseGain = 0.85;
        rateMin = 0.94;
        rateMax = 1.06;
      } else if (type === "page_open") {
        key = "page_open";
        baseGain = 0.84;
        rateMin = 0.96;
        rateMax = 1.04;
      } else if (type === "scan" || type === "scan_inspect") {
        key = "scan_inspect";
        baseGain = 0.78;
        rateMin = 0.97;
        rateMax = 1.03;
      } else if (type === "stamp") {
        key = "stamp";
        baseGain = 0.82;
        rateMin = 0.95;
        rateMax = 1.05;
      } else if (type === "marker") {
        key = "marker";
        baseGain = 0.76;
        rateMin = 0.94;
        rateMax = 1.06;
      } else if (type === "chat") {
        key = "click";
        baseGain = 0.56;
        rateMin = 1.06;
        rateMax = 1.14;
      } else {
        key = "click";
        baseGain = 0.62;
        rateMin = 0.95;
        rateMax = 1.05;
      }

      const buffers = (decodedFoleyBuffers[key] || []).filter(Boolean);
      const playbackRate =
        rateMin + Math.random() * Math.max(0.001, rateMax - rateMin);

      if (ctx && buffers.length > 0) {
        const chosenBuffer =
          key === "page_flip"
            ? buffers[pageTurnRoundRobin++ % buffers.length]
            : buffers[Math.floor(Math.random() * buffers.length)];

        const src = ctx.createBufferSource();
        src.buffer = chosenBuffer;
        src.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(baseGain, ctx.currentTime);

        src.connect(gainNode);
        gainNode.connect(ctx.destination);
        src.start(0);
        return;
      }

      // Instant HTMLAudioElement fallback if decodeAudioData is still in flight
      const pool = (htmlAudioPool[key] || []).filter(Boolean);
      if (pool.length > 0) {
        const template =
          key === "page_flip"
            ? pool[pageTurnRoundRobin++ % pool.length]
            : pool[0];
        const clone = template.cloneNode();
        clone.volume = Math.min(1, baseGain);
        clone.playbackRate = playbackRate;
        clone.play().catch(() => {});
      }
    } catch (_e) {}
  }

  // ============================================================================
  // TACTILE 2-SIDED MANILA FOLDER: ALTERNATING TILT + HOLD-PEEL + SMOOTH DOLLY
  // ============================================================================
  function resetFolderStraight() {
    const wrapper = document.getElementById("manilaFolderWrapper");
    if (!wrapper) return;
    wrapper.style.setProperty("--folder-rest-z", "0deg");
    wrapper.style.setProperty("--hand-rz", "0deg");
    wrapper.style.setProperty("--hand-rx", "0deg");
    wrapper.style.setProperty("--hand-ry", "0deg");
  }

  function applyNextFolderHoverTilt() {
    const wrapper = document.getElementById("manilaFolderWrapper");
    if (!wrapper || state.coverOpen || state.coverAnimating) return;
    const hoverAngles = [-3.2, 3.0, -2.5, 3.5, -3.6, 2.8, -2.9, 3.3];
    const deg = hoverAngles[state.folderTiltIndex % hoverAngles.length];
    state.folderTiltIndex = (state.folderTiltIndex + 1) % hoverAngles.length;
    wrapper.style.setProperty("--hand-rz", `${deg}deg`);
  }

  function startFolderPeel(clientX) {
    const coverStage = document.getElementById("dossierCoverStage");
    const wrapper = document.getElementById("manilaFolderWrapper");
    if (!coverStage || state.coverOpen || state.coverAnimating) return;

    state.isPeelingCover = true;
    state.peelPointerStartX = clientX || window.innerWidth / 2;
    state.peelDragDeltaX = 0;
    playForensicSound("folder_peel");

    if (wrapper) {
      wrapper.style.setProperty("--hand-peel", "-22deg");
    }
    coverStage.classList.add("is-peeling");
  }

  function updateFolderPeelDrag(clientX) {
    if (!state.isPeelingCover || state.coverOpen || state.coverAnimating) return;
    const wrapper = document.getElementById("manilaFolderWrapper");
    if (!wrapper) return;
    // Semi-open cover while holding (-16deg to -38deg)
    const dx = state.peelPointerStartX - clientX;
    state.peelDragDeltaX = dx;
    const angle = Math.max(-38, Math.min(-16, -22 - dx * 0.12));
    wrapper.style.setProperty("--hand-peel", `${angle.toFixed(1)}deg`);
  }

  function cancelFolderPeel() {
    if (state.peelHoldTimer) {
      clearTimeout(state.peelHoldTimer);
      state.peelHoldTimer = null;
    }
    if (!state.isPeelingCover) return;
    state.isPeelingCover = false;
    state.peelDragDeltaX = 0;
    const coverStage = document.getElementById("dossierCoverStage");
    const wrapper = document.getElementById("manilaFolderWrapper");
    coverStage?.classList.remove("is-peeling");
    if (wrapper) {
      wrapper.style.setProperty("--hand-peel", "0deg");
    }
  }

  function playVaultChainSfx(mode = "rattle") {
    if (!state.soundEnabled) return;
    try {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      const now = ctx.currentTime;

      if (mode === "rattle") {
        // 3 rapid metallic chain clinks
        [0, 0.065, 0.135].forEach((offset, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "triangle";
          osc.frequency.setValueAtTime(920 + idx * 190, now + offset);
          osc.frequency.exponentialRampToValueAtTime(240, now + offset + 0.055);
          gain.gain.setValueAtTime(0.18, now + offset);
          gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.06);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(now + offset);
          osc.stop(now + offset + 0.065);
        });
      } else if (mode === "unlock") {
        // Stage 1: Heavy brass shackle spring pop (0.04s)
        const boltOsc = ctx.createOscillator();
        const boltGain = ctx.createGain();
        boltOsc.type = "sawtooth";
        boltOsc.frequency.setValueAtTime(320, now + 0.04);
        boltOsc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        boltGain.gain.setValueAtTime(0.22, now + 0.04);
        boltGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        boltOsc.connect(boltGain);
        boltGain.connect(ctx.destination);
        boltOsc.start(now + 0.04);
        boltOsc.stop(now + 0.19);

        // Stage 2: Cascading steel links whipping off the folder (0.22s - 0.55s)
        [0.22, 0.28, 0.34, 0.41, 0.48].forEach((offset, idx) => {
          const linkOsc = ctx.createOscillator();
          const linkGain = ctx.createGain();
          linkOsc.type = "square";
          linkOsc.frequency.setValueAtTime(1150 - idx * 95, now + offset);
          linkOsc.frequency.exponentialRampToValueAtTime(310, now + offset + 0.06);
          linkGain.gain.setValueAtTime(0.12, now + offset);
          linkGain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.065);
          linkOsc.connect(linkGain);
          linkGain.connect(ctx.destination);
          linkOsc.start(now + offset);
          linkOsc.stop(now + offset + 0.07);
        });
      }
    } catch (_e) {}
  }

  function shakeVaultPadlock() {
    playForensicSound("click");
    playVaultChainSfx("rattle");
    const overlay = document.getElementById("coverLockedVaultOverlay");
    const card = document.getElementById("vaultPadlockCard");
    if (overlay) {
      overlay.classList.remove("is-rattling");
      void overlay.offsetWidth;
      overlay.classList.add("is-rattling");
    }
    if (card) {
      card.classList.remove("is-shake-error");
      void card.offsetWidth;
      card.classList.add("is-shake-error");
    }
    const input = document.getElementById("vaultPasscodeInput");
    input?.focus();
  }

  function applyVaultLockState(locked) {
    state.vaultLocked = Boolean(locked);
    document.body.classList.toggle("is-vault-locked", state.vaultLocked);
    if (!state.vaultLocked) {
      document.body.classList.remove("is-unsealing-active");
    }
    const tabBadge = document.getElementById("folderTabBadge");
    if (tabBadge) {
      tabBadge.textContent = state.vaultLocked ? "SEALED" : "UNSEALED";
    }
    document.title = state.vaultLocked
      ? "RESTRICTED ARCHIVE // CLEARANCE REQUIRED (VAULT #0049-X)"
      : "THE MUNIR FILES // Declassified Investigative Case Dossier (Case 1:26-cv-00049-MF)";
  }

  function unlockVaultWithPasscode(enteredCode) {
    const clean = String(enteredCode || "").trim();
    const errEl = document.getElementById("vaultErrorMsg");
    const overlay = document.getElementById("coverLockedVaultOverlay");
    const card = document.getElementById("vaultPadlockCard");
    const statusBadge = document.getElementById("vaultStatusBadge");
    if (clean.toLowerCase() === VAULT_PASSCODE.toLowerCase()) {
      if (errEl) errEl.hidden = true;
      playForensicSound("stamp");
      playVaultChainSfx("unlock");
      setTimeout(() => playForensicSound("folder_peel"), 260);

      if (statusBadge) {
        statusBadge.innerHTML = `<span class="vault-status-dot"></span><span>CLEARANCE VERIFIED // UNSHACKLING CHAINS...</span>`;
      }

      // Reveal real cover underneath while the chains whip off & wax seal splits!
      document.body.classList.add("is-unsealing-active");
      overlay?.classList.remove("is-rattling");
      card?.classList.remove("is-shake-error");
      overlay?.classList.add("is-unlocking-vault");

      try {
        sessionStorage.setItem(VAULT_STORAGE_KEY, "1");
      } catch (_e) {}

      setTimeout(() => {
        applyVaultLockState(false);
        overlay?.classList.remove("is-unlocking-vault");
        if (statusBadge) {
          statusBadge.innerHTML = `<span class="vault-status-dot"></span><span>LEVEL-5 CLASSIFIED LOCKDOWN // SEAL INTACT</span>`;
        }
      }, 940);
    } else {
      if (errEl) errEl.hidden = false;
      shakeVaultPadlock();
    }
  }

  function lockVaultNow() {
    playForensicSound("folder_close");
    playVaultChainSfx("rattle");
    try {
      sessionStorage.removeItem(VAULT_STORAGE_KEY);
    } catch (_e) {}
    if (state.lightboxOpen) {
      closeLightbox();
    }
    if (state.globalChatDrawerOpen) {
      toggleGlobalChatDrawer(false);
    }
    const coverStage = document.getElementById("dossierCoverStage");
    if (coverStage) {
      coverStage.style.display = "";
      coverStage.classList.remove(
        "is-opened",
        "is-hidden",
        "is-opening",
        "is-dolly-into-pages",
        "is-closing-start",
        "is-closing-swing",
        "is-peeling",
        "is-anticipating"
      );
    }
    state.coverOpen = false;
    state.coverAnimating = false;
    const overlay = document.getElementById("coverLockedVaultOverlay");
    overlay?.classList.remove("is-unlocking-vault", "is-rattling");
    const statusBadge = document.getElementById("vaultStatusBadge");
    if (statusBadge) {
      statusBadge.innerHTML = `<span class="vault-status-dot"></span><span>LEVEL-5 CLASSIFIED LOCKDOWN // SEAL INTACT</span>`;
    }
    const input = document.getElementById("vaultPasscodeInput");
    if (input) input.value = "";
    const errEl = document.getElementById("vaultErrorMsg");
    if (errEl) errEl.hidden = true;
    applyVaultLockState(true);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function openDossierCinematically(fromPeel = false) {
    if (state.vaultLocked) {
      shakeVaultPadlock();
      return;
    }
    const coverStage = document.getElementById("dossierCoverStage");
    if (!coverStage || state.coverOpen || state.coverAnimating) return;

    if (state.peelHoldTimer) {
      clearTimeout(state.peelHoldTimer);
      state.peelHoldTimer = null;
    }
    const wasPeeling = fromPeel || state.isPeelingCover;
    state.isPeelingCover = false;
    state.coverAnimating = true;

    const wrapper = document.getElementById("manilaFolderWrapper");
    if (wrapper) {
      wrapper.style.setProperty("--hand-rz", "0deg");
      wrapper.style.setProperty("--hand-rx", "0deg");
      wrapper.style.setProperty("--hand-ry", "0deg");
      wrapper.style.setProperty("--hand-peel", "0deg");
    }

    playForensicSound("folder_open");
    coverStage.style.display = "";
    coverStage.classList.remove(
      "is-opened",
      "is-hidden",
      "is-opening",
      "is-dolly-into-pages",
      "is-closing-start",
      "is-closing-swing"
    );

    const isMobileViewport =
      window.innerWidth <= 860 ||
      Boolean(window.matchMedia && window.matchMedia("(max-width: 860px)").matches);

    if (isMobileViewport) {
      coverStage.classList.remove("is-peeling", "is-anticipating");
      coverStage.classList.add("is-opening");
      setTimeout(() => {
        coverStage.classList.add("is-opened", "is-hidden");
        coverStage.classList.remove(
          "is-anticipating",
          "is-opening",
          "is-dolly-into-pages",
          "is-peeling"
        );
        coverStage.style.display = "none";
        state.coverOpen = true;
        state.coverAnimating = false;
        window.scrollTo({ top: 0, behavior: "instant" });
      }, 320);
      return;
    }

    if (wasPeeling) {
      // Smoothly continue directly from the semi-open angle into full swing open!
      coverStage.classList.remove("is-peeling");
      coverStage.classList.add("is-opening");
    } else {
      coverStage.classList.add("is-anticipating");
      setTimeout(() => {
        coverStage.classList.add("is-opening");
      }, 170);
    }

    // Prepare workspace cards underneath so they are ready as camera dollies in
    const dollyDelay = wasPeeling ? 440 : 620;
    setTimeout(() => {
      triggerWorkspaceCardCascade();
      coverStage.classList.add("is-dolly-into-pages");
    }, dollyDelay);

    // Complete smooth camera dolly & cross-dissolve into workspace pages
    const finishDelay = wasPeeling ? 920 : 1100;
    setTimeout(() => {
      coverStage.classList.add("is-opened", "is-hidden");
      coverStage.classList.remove(
        "is-anticipating",
        "is-opening",
        "is-dolly-into-pages",
        "is-peeling"
      );
      coverStage.style.display = "none";
      state.coverOpen = true;
      state.coverAnimating = false;
    }, finishDelay);
  }

  function closeDossierCinematically() {
    const coverStage = document.getElementById("dossierCoverStage");
    if (!coverStage || state.coverAnimating) return;

    state.coverAnimating = true;
    state.coverOpen = false;
    resetFolderStraight();
    playForensicSound("folder_close");

    coverStage.style.display = "";
    coverStage.classList.remove(
      "is-opened",
      "is-hidden",
      "is-anticipating",
      "is-peeling",
      "is-opening",
      "is-dolly-into-pages",
      "is-closing-swing"
    );
    coverStage.classList.add("is-closing-start");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        coverStage.classList.remove("is-closing-start");
        coverStage.classList.add("is-closing-swing");
      });
    });

    setTimeout(() => {
      coverStage.classList.remove("is-closing-swing");
      state.coverAnimating = false;
    }, 860);
  }

  function triggerWorkspaceCardCascade() {
    // Lightweight no-op: avoids forcing 55 synchronous reflows or GPU layer allocations on mobile WebViews
  }

  // ============================================================================
  // LOCAL STORAGE & MULTI-USER STATE SYNC
  // ============================================================================
  function loadLocalStorageState() {
    try {
      const savedPins = localStorage.getItem(STORAGE_KEYS.PINNED_SET);
      if (savedPins) {
        state.pinnedSet = new Set(JSON.parse(savedPins));
      }
      const cachedShared = localStorage.getItem(STORAGE_KEYS.SHARED_STATE_CACHE);
      if (cachedShared) {
        mergeSharedState(JSON.parse(cachedShared));
      }
    } catch (e) {
      console.warn("Storage load warning:", e);
    }
  }

  function savePinnedState() {
    try {
      localStorage.setItem(
        STORAGE_KEYS.PINNED_SET,
        JSON.stringify(Array.from(state.pinnedSet))
      );
    } catch (_e) {}
  }

  let saveCacheTimer = null;
  function saveSharedCache() {
    if (saveCacheTimer) return;
    saveCacheTimer = setTimeout(() => {
      saveCacheTimer = null;
      try {
        const persistentOnly = {
          chatsByExhibit: state.shared.chatsByExhibit,
          marksByExhibit: state.shared.marksByExhibit,
          notesByExhibit: state.shared.notesByExhibit,
          poiOverrides: state.shared.poiOverrides,
          deletedIds: state.shared.deletedIds,
          clearedAtByExhibit: state.shared.clearedAtByExhibit,
          auditLog: (state.shared.auditLog || []).slice(0, 200)
        };
        localStorage.setItem(
          STORAGE_KEYS.SHARED_STATE_CACHE,
          JSON.stringify(persistentOnly)
        );
      } catch (_e) {}
    }, 650);
  }

  // ============================================================================
  // CUTE DETECTIVE PROFILE INITIALIZATION & AVATAR RENDERING (COOKIE PERSISTED)
  // ============================================================================
  function getAvatarObj(avatarId) {
    return AVATARS.find((a) => a.id === avatarId) || AVATARS[0];
  }

  function renderAvatarHtml(profileOrItem) {
    const customUrl = profileOrItem?.customAvatarUrl || "";
    const avatarObj = getAvatarObj(profileOrItem?.avatarId);

    if (customUrl && customUrl.trim()) {
      return `<img src="${escapeHtmlAttr(customUrl)}" alt="Detective Profile Pic" loading="lazy" />`;
    }
    if (avatarObj && avatarObj.imgUrl) {
      return `<img src="${escapeHtmlAttr(avatarObj.imgUrl)}" alt="${escapeHtmlAttr(avatarObj.name)}" loading="lazy" />`;
    }
    return avatarObj ? avatarObj.svg : ICON("user");
  }

  function initDetectiveIdentity() {
    let stored = loadUserProfileFromCookies();

    if (!stored || !stored.id || !stored.name) {
      const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)] || {
        id: "cat-sherlock",
        name: "Sherlock Paws"
      };
      const baseName =
        RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)] ||
        randomAvatar.name;
      const badgeNum = Math.floor(100 + Math.random() * 900);

      stored = {
        id:
          "det-" +
          Date.now().toString(36) +
          "-" +
          Math.random().toString(36).slice(2, 6),
        name: `${baseName} #${badgeNum}`,
        avatarId: randomAvatar.id,
        customAvatarUrl: "",
        createdAt: Date.now()
      };
    }

    saveUserProfileCookies(stored);
    state.userProfile = stored;
    state.editingAvatarId = stored.avatarId;
    state.editingCustomAvatarUrl = stored.customAvatarUrl || "";
    updateIdentityBadgeUI();

    const alreadyEnteredSession = sessionStorage.getItem(
      STORAGE_KEYS.SESSION_ENTERED
    );
    if (!alreadyEnteredSession) {
      sessionStorage.setItem(STORAGE_KEYS.SESSION_ENTERED, "1");
      const av = getAvatarObj(stored.avatarId);
      dispatchSharedAction({
        action: "log_event",
        eventType: "entry",
        userId: stored.id,
        userName: stored.name,
        avatarId: stored.avatarId,
        customAvatarUrl: stored.customAvatarUrl,
        exhibitId: null,
        detail: `Entered the declassified dossier as ${stored.name} (${av ? av.name : "Detective"} PFP)`
      });
    }
  }

  function updateIdentityBadgeUI() {
    const avatarEl = document.getElementById("headerUserAvatar");
    const nameEl = document.getElementById("headerUserName");
    if (avatarEl && state.userProfile) {
      avatarEl.innerHTML = renderAvatarHtml(state.userProfile);
    }
    if (nameEl && state.userProfile) {
      nameEl.textContent = state.userProfile.name;
    }
  }

  // ============================================================================
  // PERSONS OF INTEREST (POI) EFFECTIVE PROFILE & MUGSHOT EDITOR
  // ============================================================================
  function getEffectiveSubject(subj) {
    const ov = (state.shared.poiOverrides || {})[subj.id] || {};
    return {
      ...subj,
      realName: ov.realName || subj.realName,
      role: ov.role || subj.role,
      status: ov.status || subj.status,
      avatarUrl: ov.avatarUrl || subj.defaultAvatarUrl
    };
  }

  function updateCoverMugshotIfNeeded() {
    const coverImg = document.getElementById("coverMugshotImg");
    if (!coverImg) return;
    const munirSubj = META.subjects.find((s) => s.id === "munir");
    if (munirSubj) {
      const eff = getEffectiveSubject(munirSubj);
      if (coverImg.dataset.lastSrc !== eff.avatarUrl) {
        coverImg.dataset.lastSrc = eff.avatarUrl;
        coverImg.src = eff.avatarUrl;
      }
    }
  }

  function openPoiModal(subjectId) {
    const subj = META.subjects.find((s) => s.id === subjectId);
    const modal = document.getElementById("poiModal");
    if (!subj || !modal) return;

    playForensicSound("click");
    const eff = getEffectiveSubject(subj);
    state.editingPoiId = subj.id;
    state.editingPoiAvatarUrl = eff.avatarUrl;

    const codenameEl = document.getElementById("poiModalCodename");
    const nameInput = document.getElementById("poiNameInput");
    const roleInput = document.getElementById("poiRoleInput");
    const statusInput = document.getElementById("poiStatusInput");
    const urlInput = document.getElementById("poiAvatarUrlInput");

    if (codenameEl) codenameEl.textContent = eff.codename;
    if (nameInput) nameInput.value = eff.realName;
    if (roleInput) roleInput.value = eff.role;
    if (statusInput) statusInput.value = eff.status;
    if (urlInput) {
      urlInput.value =
        state.editingPoiAvatarUrl.startsWith("data:") ||
        state.editingPoiAvatarUrl.startsWith("./avatars/")
          ? ""
          : state.editingPoiAvatarUrl;
    }

    renderPoiPresetGrid();
    updatePoiModalPreview();
    if (!modal.open) modal.showModal();
  }

  function updatePoiModalPreview() {
    const preview = document.getElementById("poiModalPreviewAvatar");
    if (!preview) return;
    const url =
      state.editingPoiAvatarUrl ||
      DEFAULT_POI_PORTRAITS[state.editingPoiId] ||
      "./avatars/poi_munir.jpg?v=2";
    preview.innerHTML = `<img src="${escapeHtmlAttr(url)}" alt="POI Mugshot Preview" />`;
  }

  function renderPoiPresetGrid() {
    const grid = document.getElementById("poiPresetGrid");
    if (!grid) return;

    const poiPresets = [
      {
        id: "poi-munir",
        name: "Walter (6:33 AM)",
        imgUrl: DEFAULT_POI_PORTRAITS.munir
      },
      {
        id: "poi-aseel",
        name: "Aseel (Mediator)",
        imgUrl: DEFAULT_POI_PORTRAITS.aseel
      },
      {
        id: "poi-hala",
        name: "Hala (DND Mode)",
        imgUrl: DEFAULT_POI_PORTRAITS.hala
      },
      {
        id: "poi-collateral",
        name: "Ahmad & Rahaf",
        imgUrl: DEFAULT_POI_PORTRAITS.collateral
      },
      ...AVATARS.map((a) => ({
        id: a.id,
        name: a.name,
        imgUrl: a.imgUrl
      }))
    ];

    grid.innerHTML = poiPresets
      .map((p) => {
        const selected = state.editingPoiAvatarUrl === p.imgUrl;
        return `
          <button
            type="button"
            class="avatar-choice-btn ${selected ? "is-selected" : ""}"
            data-pick-poi-preset="${escapeHtmlAttr(p.imgUrl)}"
          >
            <span class="detective-avatar-frame size-lg">
              <img src="${escapeHtmlAttr(p.imgUrl)}" alt="${escapeHtmlAttr(p.name)}" loading="lazy" />
            </span>
            <span>${escapeHtml(p.name)}</span>
          </button>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-pick-poi-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("click");
        state.editingPoiAvatarUrl =
          btn.getAttribute("data-pick-poi-preset") || "";
        const urlInput = document.getElementById("poiAvatarUrlInput");
        if (urlInput) urlInput.value = "";
        renderPoiPresetGrid();
        updatePoiModalPreview();
      });
    });
  }

  function savePoiModalChanges() {
    if (!state.editingPoiId) return;
    const subj = META.subjects.find((s) => s.id === state.editingPoiId);
    if (!subj) return;

    const nameInput = document.getElementById("poiNameInput");
    const roleInput = document.getElementById("poiRoleInput");
    const statusInput = document.getElementById("poiStatusInput");
    const urlInput = document.getElementById("poiAvatarUrlInput");
    const modal = document.getElementById("poiModal");

    if (urlInput && urlInput.value.trim()) {
      state.editingPoiAvatarUrl = urlInput.value.trim();
    }

    const poiData = {
      realName: (nameInput?.value || "").trim() || subj.realName,
      role: (roleInput?.value || "").trim() || subj.role,
      status: (statusInput?.value || "").trim() || subj.status,
      avatarUrl: state.editingPoiAvatarUrl || subj.defaultAvatarUrl
    };

    playForensicSound("stamp");
    dispatchSharedAction({
      action: "update_poi",
      poiId: subj.id,
      poiData,
      userId: state.userProfile.id,
      userName: state.userProfile.name,
      avatarId: state.userProfile.avatarId,
      customAvatarUrl: state.userProfile.customAvatarUrl
    });

    if (modal && modal.open) modal.close();
  }

  // ============================================================================
  // MULTI-USER STATE SYNC (CRDT UNION-MERGE + TOMBSTONES + SERVER HEALING)
  // ============================================================================
  let persistentPostInFlightCount = 0;
  let serverHealTimer = null;

  function buildClientSyncBundle() {
    return {
      deletedIds: state.shared.deletedIds || {},
      clearedAtByExhibit: state.shared.clearedAtByExhibit || {},
      marksByExhibit: state.shared.marksByExhibit || {},
      chatsByExhibit: state.shared.chatsByExhibit || {},
      notesByExhibit: state.shared.notesByExhibit || {},
      poiOverrides: state.shared.poiOverrides || {}
    };
  }

  function scheduleServerHealPush() {
    if (serverHealTimer || persistentPostInFlightCount > 0) return;
    serverHealTimer = setTimeout(async () => {
      serverHealTimer = null;
      if (persistentPostInFlightCount > 0) return;
      try {
        await fetch("/api/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "sync_bundle",
            senderId: state.userProfile?.id,
            userId: state.userProfile?.id,
            userName: state.userProfile?.name,
            avatarId: state.userProfile?.avatarId,
            customAvatarUrl: state.userProfile?.customAvatarUrl,
            syncBundle: buildClientSyncBundle()
          })
        });
      } catch (_e) {}
    }, 180);
  }

  function mergeSharedState(incoming, fromServer = false) {
    if (!incoming || typeof incoming !== "object") return;

    if (!state.shared.deletedIds) state.shared.deletedIds = {};
    if (!state.shared.clearedAtByExhibit) state.shared.clearedAtByExhibit = {};

    let serverMissingLocalData = false;

    // 1. Merge deletion tombstones first so deleted items never resurrect
    if (incoming.deletedIds && typeof incoming.deletedIds === "object") {
      for (const [delId, delTs] of Object.entries(incoming.deletedIds)) {
        const curTs = state.shared.deletedIds[delId] || 0;
        const incTs = Number(delTs) || 1;
        if (incTs > curTs) {
          state.shared.deletedIds[delId] = incTs;
        }
      }
    }
    if (fromServer && state.shared.deletedIds) {
      const incDel = incoming.deletedIds || {};
      for (const [delId, localDelTs] of Object.entries(state.shared.deletedIds)) {
        if (!incDel[delId] || (Number(localDelTs) || 1) > (Number(incDel[delId]) || 0)) {
          serverMissingLocalData = true;
          break;
        }
      }
    }

    // 2. Merge per-exhibit clear timestamps
    if (
      incoming.clearedAtByExhibit &&
      typeof incoming.clearedAtByExhibit === "object"
    ) {
      for (const [exId, clrTs] of Object.entries(incoming.clearedAtByExhibit)) {
        const curTs = state.shared.clearedAtByExhibit[exId] || 0;
        const incTs = Number(clrTs) || 0;
        if (incTs > curTs) {
          state.shared.clearedAtByExhibit[exId] = incTs;
        }
      }
    }
    if (fromServer && state.shared.clearedAtByExhibit) {
      const incClr = incoming.clearedAtByExhibit || {};
      for (const [exId, localClrTs] of Object.entries(state.shared.clearedAtByExhibit)) {
        if ((Number(localClrTs) || 0) > (Number(incClr[exId]) || 0)) {
          serverMissingLocalData = true;
          break;
        }
      }
    }

    // 3. CRDT Union-Merge for chatsByExhibit (keyed by chat.id)
    const chatExIds = new Set([
      ...Object.keys(state.shared.chatsByExhibit || {}),
      ...Object.keys(incoming.chatsByExhibit || {})
    ]);
    for (const exId of chatExIds) {
      const localList = Array.isArray(state.shared.chatsByExhibit[exId])
        ? state.shared.chatsByExhibit[exId]
        : [];
      const incList =
        incoming.chatsByExhibit && Array.isArray(incoming.chatsByExhibit[exId])
          ? incoming.chatsByExhibit[exId]
          : [];
      const incIdSet = new Set(incList.map((c) => c && c.id).filter(Boolean));
      const mergedMap = new Map();

      for (const c of [...localList, ...incList]) {
        if (!c || !c.id) continue;
        if (state.shared.deletedIds[c.id]) continue;
        const prev = mergedMap.get(c.id);
        if (!prev || (c.ts || 0) >= (prev.ts || 0)) {
          mergedMap.set(c.id, c);
        }
      }

      const mergedArr = Array.from(mergedMap.values()).sort(
        (a, b) => (a.ts || 0) - (b.ts || 0)
      );
      state.shared.chatsByExhibit[exId] = mergedArr;

      if (
        fromServer &&
        (mergedArr.some((c) => !incIdSet.has(c.id)) ||
          incList.some((c) => c && c.id && state.shared.deletedIds[c.id]))
      ) {
        serverMissingLocalData = true;
      }
    }

    // 4. CRDT Union-Merge for marksByExhibit (keyed by mark.id)
    const markExIds = new Set([
      ...Object.keys(state.shared.marksByExhibit || {}),
      ...Object.keys(incoming.marksByExhibit || {})
    ]);
    for (const exId of markExIds) {
      const localList = Array.isArray(state.shared.marksByExhibit[exId])
        ? state.shared.marksByExhibit[exId]
        : [];
      const incList =
        incoming.marksByExhibit && Array.isArray(incoming.marksByExhibit[exId])
          ? incoming.marksByExhibit[exId]
          : [];
      const incIdSet = new Set(incList.map((m) => m && m.id).filter(Boolean));
      const clearedAt = state.shared.clearedAtByExhibit[exId] || 0;
      const mergedMap = new Map();

      for (const m of [...localList, ...incList]) {
        if (!m || !m.id) continue;
        if (state.shared.deletedIds[m.id]) continue;
        if (clearedAt > 0 && (m.ts || 0) <= clearedAt) continue;
        const prev = mergedMap.get(m.id);
        const mVerTs = m.updatedTs || m.ts || 0;
        const prevVerTs = prev ? prev.updatedTs || prev.ts || 0 : -1;
        if (!prev || mVerTs >= prevVerTs) {
          mergedMap.set(m.id, m);
        }
      }

      const mergedArr = Array.from(mergedMap.values()).sort(
        (a, b) => (a.ts || 0) - (b.ts || 0)
      );
      state.shared.marksByExhibit[exId] = mergedArr;

      if (
        fromServer &&
        (mergedArr.some((m) => !incIdSet.has(m.id)) ||
          incList.some(
            (m) =>
              m &&
              m.id &&
              (state.shared.deletedIds[m.id] ||
                (clearedAt > 0 && (m.ts || 0) <= clearedAt))
          ))
      ) {
        serverMissingLocalData = true;
      }
    }

    if (incoming.notesByExhibit && typeof incoming.notesByExhibit === "object") {
      for (const [exId, noteObj] of Object.entries(incoming.notesByExhibit)) {
        const cur = state.shared.notesByExhibit[exId];
        if (!cur || (noteObj && noteObj.ts >= cur.ts)) {
          state.shared.notesByExhibit[exId] = noteObj;
        }
      }
    }

    if (incoming.poiOverrides && typeof incoming.poiOverrides === "object") {
      if (!state.shared.poiOverrides) state.shared.poiOverrides = {};
      for (const [poiId, poiObj] of Object.entries(incoming.poiOverrides)) {
        const cur = state.shared.poiOverrides[poiId];
        if (!cur || (poiObj && (poiObj.ts || 0) >= (cur.ts || 0))) {
          state.shared.poiOverrides[poiId] = poiObj;
        }
      }
    }

    if (incoming.cursorsByExhibit && typeof incoming.cursorsByExhibit === "object") {
      if (!state.shared.cursorsByExhibit) state.shared.cursorsByExhibit = {};
      const now = Date.now();
      for (const [exId, cursorMap] of Object.entries(incoming.cursorsByExhibit)) {
        if (cursorMap && typeof cursorMap !== "object") continue;
        if (!state.shared.cursorsByExhibit[exId]) {
          state.shared.cursorsByExhibit[exId] = {};
        }
        for (const [uid, cObj] of Object.entries(cursorMap || {})) {
          if (cObj && now - (cObj.ts || 0) <= 14000) {
            const cur = state.shared.cursorsByExhibit[exId][uid];
            if (!cur || (cObj.ts || 0) >= (cur.ts || 0)) {
              state.shared.cursorsByExhibit[exId][uid] = cObj;
            }
          } else {
            delete state.shared.cursorsByExhibit[exId][uid];
          }
        }
      }
    }

    if (incoming.presenceByUser && typeof incoming.presenceByUser === "object") {
      if (!state.shared.presenceByUser) state.shared.presenceByUser = {};
      const now = Date.now();
      for (const [uid, pObj] of Object.entries(incoming.presenceByUser)) {
        if (pObj && now - (pObj.ts || 0) <= 20000) {
          const cur = state.shared.presenceByUser[uid];
          if (!cur || (pObj.ts || 0) >= (cur.ts || 0)) {
            state.shared.presenceByUser[uid] = pObj;
          }
        } else {
          delete state.shared.presenceByUser[uid];
        }
      }
    }

    if (typeof incoming.version === "number" && incoming.version > state.sharedVersion) {
      state.sharedVersion = incoming.version;
    }

    if (Array.isArray(incoming.auditLog)) {
      const map = new Map();
      (state.shared.auditLog || []).forEach((e) => {
        if (e && e.id) map.set(e.id, e);
      });
      incoming.auditLog.forEach((e) => {
        if (e && e.id) map.set(e.id, e);
      });
      state.shared.auditLog = Array.from(map.values())
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 350);
    }

    saveSharedCache();
    refreshLiveCollaborativeViews();

    if (fromServer && serverMissingLocalData) {
      scheduleServerHealPush();
    }
  }

  function applyIncomingEphemeral(delta) {
    if (!delta || typeof delta !== "object") return;
    if (delta.senderId && delta.senderId === state.userProfile?.id) return;

    const now = Date.now();
    const { action, exhibitId, userId } = delta;

    if (action === "cursor_update" && exhibitId && userId) {
      if (!state.shared.cursorsByExhibit) state.shared.cursorsByExhibit = {};
      if (!state.shared.cursorsByExhibit[exhibitId]) {
        state.shared.cursorsByExhibit[exhibitId] = {};
      }
      state.shared.cursorsByExhibit[exhibitId][userId] = {
        userId,
        userName: delta.userName || "Detective",
        avatarId: delta.avatarId || "cat-sherlock",
        customAvatarUrl: delta.customAvatarUrl || "",
        tool: delta.tool || "pencil",
        color: delta.color || "yellow",
        x: Number(delta.x ?? 0.5),
        y: Number(delta.y ?? 0.5),
        activePoints: Array.isArray(delta.activePoints)
          ? delta.activePoints
          : null,
        ts: now
      };
      if (state.lightboxOpen) {
        const curEx = EXHIBITS[state.currentExhibitIndex];
        if (curEx && curEx.id === exhibitId) {
          renderMultiUserCursorsLayer(curEx);
        }
      }
    } else if (action === "cursor_leave" && exhibitId && userId) {
      if (
        state.shared.cursorsByExhibit &&
        state.shared.cursorsByExhibit[exhibitId]
      ) {
        delete state.shared.cursorsByExhibit[exhibitId][userId];
      }
      if (state.lightboxOpen) {
        const curEx = EXHIBITS[state.currentExhibitIndex];
        if (curEx && curEx.id === exhibitId) {
          renderMultiUserCursorsLayer(curEx);
        }
      }
    } else if (action === "presence_ping" && userId) {
      if (!state.shared.presenceByUser) state.shared.presenceByUser = {};
      state.shared.presenceByUser[userId] = {
        userId,
        userName: delta.userName || "Detective",
        avatarId: delta.avatarId || "cat-sherlock",
        customAvatarUrl: delta.customAvatarUrl || "",
        exhibitId: exhibitId || null,
        locationLabel: delta.locationLabel || "In Dossier",
        ts: now
      };
      renderOnlineUsersWidget();
    } else if (action === "presence_leave" && userId) {
      if (state.shared.presenceByUser) {
        delete state.shared.presenceByUser[userId];
      }
      renderOnlineUsersWidget();
    }
  }

  let ephemeralPostInFlight = false;
  let queuedCursorPayload = null;

  async function flushEphemeralPost(payload) {
    if (ephemeralPostInFlight || persistentPostInFlightCount > 0) {
      if (payload.action === "cursor_update") {
        queuedCursorPayload = payload;
      }
      return;
    }
    ephemeralPostInFlight = true;
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && typeof data.version === "number" && data.version > state.sharedVersion) {
          state.sharedVersion = data.version;
        }
      }
    } catch (_e) {
    } finally {
      ephemeralPostInFlight = false;
      if (queuedCursorPayload && persistentPostInFlightCount === 0) {
        const next = queuedCursorPayload;
        queuedCursorPayload = null;
        flushEphemeralPost(next);
      }
    }
  }

  function sendEphemeralSync(payload) {
    const now = Date.now();
    const withSender = {
      ...payload,
      senderId: state.userProfile?.id || payload.userId
    };

    if (payload.action === "presence_ping" && payload.userId) {
      if (!state.shared.presenceByUser) state.shared.presenceByUser = {};
      state.shared.presenceByUser[payload.userId] = {
        userId: payload.userId,
        userName: payload.userName || "Detective",
        avatarId: payload.avatarId || "cat-sherlock",
        customAvatarUrl: payload.customAvatarUrl || "",
        exhibitId: payload.exhibitId || null,
        locationLabel: payload.locationLabel || "In Dossier",
        ts: now
      };
      renderOnlineUsersWidget();
    }

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: "EPHEMERAL_SYNC",
          delta: withSender
        });
      } catch (_e) {}
    }

    flushEphemeralPost(withSender);
  }

  let fetchInFlight = false;
  async function fetchServerState(forceFull = false) {
    if (!forceFull && liveEventSource && liveEventSource.readyState === 1) {
      // SSE stream is actively pushing updates in 0ms; only refresh local online users expiry
      renderOnlineUsersWidget();
      return;
    }
    if (!forceFull && (state.isDrawingMark || persistentPostInFlightCount > 0)) {
      return;
    }
    if (fetchInFlight) return;
    fetchInFlight = true;
    try {
      const sinceParam = forceFull ? 0 : state.sharedVersion || 0;
      const res = await fetch(`/api/state?since=${sinceParam}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store"
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data && data.ok) {
        if (typeof data.version === "number" && data.version > state.sharedVersion) {
          state.sharedVersion = data.version;
        }
        if (!data.unchanged && data.state) {
          mergeSharedState(data.state, true);
        } else {
          renderOnlineUsersWidget();
        }
      }
    } catch (_e) {
      renderOnlineUsersWidget();
    } finally {
      fetchInFlight = false;
    }
  }

  let liveEventSource = null;
  function connectLiveEventStream() {
    if (typeof EventSource === "undefined" || liveEventSource) return;
    try {
      const es = new EventSource("/api/stream");
      liveEventSource = es;
      es.onmessage = (ev) => {
        try {
          const payload = JSON.parse(ev.data);
          if (!payload) return;
          if (typeof payload.version === "number" && payload.version > state.sharedVersion) {
            state.sharedVersion = payload.version;
          }
          // Ignore self-echo so local UI never stutters or re-merges its own actions
          if (payload.senderId && payload.senderId === state.userProfile?.id) {
            return;
          }
          if (payload.ephemeral && payload.delta) {
            applyIncomingEphemeral(payload.delta);
            return;
          }
          if (payload.state) {
            mergeSharedState(payload.state, true);
          }
        } catch (_err) {}
      };
      es.onerror = () => {
        try {
          es.close();
        } catch (_e) {}
        liveEventSource = null;
      };
    } catch (_e) {}
  }

  async function dispatchSharedAction(payload) {
    // Route high-frequency ephemeral actions through the non-blocking fast path
    if (
      payload.action === "cursor_update" ||
      payload.action === "cursor_leave" ||
      payload.action === "presence_ping" ||
      payload.action === "presence_leave"
    ) {
      sendEphemeralSync(payload);
      return;
    }

    const now = Date.now();
    const uid = () =>
      now.toString(36) + "-" + Math.random().toString(36).slice(2, 8);

    if (!state.shared.deletedIds) state.shared.deletedIds = {};
    if (!state.shared.clearedAtByExhibit) state.shared.clearedAtByExhibit = {};

    const {
      action,
      exhibitId,
      userId,
      userName,
      avatarId,
      customAvatarUrl
    } = payload;

    if (action === "log_event") {
      const entry = {
        id: uid(),
        type: payload.eventType || "entry",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId: exhibitId || null,
        detail: payload.detail || "Activity recorded",
        ts: now
      };
      state.shared.auditLog.unshift(entry);
      payload.auditEntry = entry;
    } else if (
      action === "chat_message" &&
      exhibitId &&
      (payload.text || payload.mediaUrl)
    ) {
      if (!state.shared.chatsByExhibit[exhibitId]) {
        state.shared.chatsByExhibit[exhibitId] = [];
      }
      const cleanText = (payload.text || "").trim();
      const mediaUrl = payload.mediaUrl || null;
      const msg = {
        id: uid(),
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        text: cleanText,
        mediaUrl,
        replyTo: payload.replyTo || null,
        ts: now
      };
      state.shared.chatsByExhibit[exhibitId].push(msg);
      const summaryLabel = cleanText
        ? `"${cleanText.slice(0, 70)}"`
        : mediaUrl
        ? "[Sent GIF / Picture]"
        : "";
      const auditEntry = {
        id: uid(),
        type: "chat",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: msg.replyTo
          ? `Replied to ${msg.replyTo.userName || "Detective"} on ${exhibitId}: ${summaryLabel}`
          : `Commented on ${exhibitId}: ${summaryLabel}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.chatMsg = msg;
      payload.auditEntry = auditEntry;
    } else if (
      action === "delete_chat_message" &&
      exhibitId &&
      payload.messageId
    ) {
      state.shared.deletedIds[payload.messageId] = now;
      const list = state.shared.chatsByExhibit[exhibitId] || [];
      state.shared.chatsByExhibit[exhibitId] = list.filter(
        (m) => m.id !== payload.messageId
      );
      const auditEntry = {
        id: uid(),
        type: "chat",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Deleted own chat message on ${exhibitId}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.deletedTs = now;
      payload.auditEntry = auditEntry;
    } else if (action === "add_mark" && exhibitId && payload.mark) {
      if (!state.shared.marksByExhibit[exhibitId]) {
        state.shared.marksByExhibit[exhibitId] = [];
      }
      const markType =
        payload.mark.type === "pencil"
          ? "pencil"
          : payload.mark.type === "highlight"
          ? "highlight"
          : "redact";

      const newMark = {
        id: payload.mark.id || uid(),
        type: markType,
        x: payload.mark.x,
        y: payload.mark.y,
        w: payload.mark.w,
        h: payload.mark.h,
        color: payload.mark.color || "yellow",
        strokeWidth: payload.mark.strokeWidth || 3.5,
        arrowTip: Boolean(payload.mark.arrowTip),
        points: Array.isArray(payload.mark.points) ? payload.mark.points : null,
        label:
          payload.mark.label !== undefined ? payload.mark.label : "REDACTED",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        ts: now,
        updatedTs: now
      };
      state.shared.marksByExhibit[exhibitId].push(newMark);
      const auditEntry = {
        id: uid(),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail:
          markType === "pencil"
            ? `Drew a ${newMark.color.toUpperCase()} pencil ${
                newMark.arrowTip ? "arrow" : "annotation"
              } on ${exhibitId}`
            : `Added forensic ${markType.toUpperCase()} box on ${exhibitId}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.mark = newMark;
      payload.auditEntry = auditEntry;
    } else if (
      action === "update_mark" &&
      exhibitId &&
      payload.markId &&
      payload.patch
    ) {
      const list = state.shared.marksByExhibit[exhibitId] || [];
      const target = list.find((m) => m.id === payload.markId);
      if (target) {
        if (typeof payload.patch.x === "number") target.x = payload.patch.x;
        if (typeof payload.patch.y === "number") target.y = payload.patch.y;
        if (typeof payload.patch.w === "number") target.w = payload.patch.w;
        if (typeof payload.patch.h === "number") target.h = payload.patch.h;
        if (payload.patch.color) target.color = payload.patch.color;
        if (payload.patch.label !== undefined) target.label = payload.patch.label;
        target.updatedTs = now;
      }
      payload.updatedTs = now;
    } else if (action === "delete_mark" && exhibitId && payload.markId) {
      state.shared.deletedIds[payload.markId] = now;
      const list = state.shared.marksByExhibit[exhibitId] || [];
      state.shared.marksByExhibit[exhibitId] = list.filter(
        (m) => m.id !== payload.markId
      );
      const auditEntry = {
        id: uid(),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Removed a forensic mark on ${exhibitId}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.deletedTs = now;
      payload.auditEntry = auditEntry;
    } else if (action === "clear_marks" && exhibitId) {
      const existingMarks = state.shared.marksByExhibit[exhibitId] || [];
      existingMarks.forEach((m) => {
        if (m && m.id) state.shared.deletedIds[m.id] = now;
      });
      state.shared.clearedAtByExhibit[exhibitId] = now;
      state.shared.marksByExhibit[exhibitId] = [];
      const auditEntry = {
        id: uid(),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Cleared forensic marks on ${exhibitId}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.clearedTs = now;
      payload.auditEntry = auditEntry;
    } else if (action === "save_note" && exhibitId) {
      state.shared.notesByExhibit[exhibitId] = {
        text: String(payload.noteText || "").slice(0, 1200),
        updatedBy: userName,
        ts: now
      };
      const auditEntry = {
        id: uid(),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Updated shared investigator sticky note on ${exhibitId}`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.auditEntry = auditEntry;
    } else if (action === "update_poi" && payload.poiId && payload.poiData) {
      if (!state.shared.poiOverrides) state.shared.poiOverrides = {};
      state.shared.poiOverrides[payload.poiId] = {
        ...payload.poiData,
        updatedBy: userName,
        ts: now
      };
      const auditEntry = {
        id: uid(),
        type: "identity",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId: null,
        detail: `Updated Person of Interest dossier for ${
          payload.poiData.realName || payload.poiId
        }`,
        ts: now
      };
      state.shared.auditLog.unshift(auditEntry);
      payload.auditEntry = auditEntry;
    }

    saveSharedCache();
    refreshLiveCollaborativeViews();

    if (broadcastChannel) {
      try {
        broadcastChannel.postMessage({
          type: "STATE_SYNC",
          senderId: state.userProfile?.id,
          state: state.shared
        });
      } catch (_e) {}
    }

    persistentPostInFlightCount += 1;
    try {
      const res = await fetch("/api/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          senderId: state.userProfile?.id || userId,
          syncBundle: buildClientSyncBundle()
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          if (typeof data.version === "number" && data.version > state.sharedVersion) {
            state.sharedVersion = data.version;
          }
          if (data.state) {
            mergeSharedState(data.state, true);
          }
        }
      }
    } catch (_e) {
    } finally {
      persistentPostInFlightCount = Math.max(0, persistentPostInFlightCount - 1);
    }
  }

  function getCurrentUserLocationInfo() {
    if (state.lightboxOpen) {
      const ex = EXHIBITS[state.currentExhibitIndex];
      if (ex) {
        const modeDesc = state.drawMode
          ? `Drawing (${state.drawMode.toUpperCase()}) on ${ex.id}`
          : `Inspecting ${ex.id}`;
        return { exhibitId: ex.id, locationLabel: modeDesc };
      }
    }
    if (!state.coverOpen) {
      return { exhibitId: null, locationLabel: "At Manila Cover" };
    }
    if (state.viewMode === "binder") {
      const filtered = getFilteredExhibits();
      const ex = filtered[state.binderIndex] || EXHIBITS[0];
      return {
        exhibitId: ex ? ex.id : null,
        locationLabel: ex ? `Case Binder • ${ex.id}` : "Case Binder"
      };
    }
    const modeMap = {
      grid: "Dossier Grid",
      stream: "Chat Scroll",
      foia: "Court Release",
      corkboard: "Red-String Board"
    };
    return {
      exhibitId: null,
      locationLabel: modeMap[state.viewMode] || "In Dossier"
    };
  }

  function sendPresenceHeartbeat() {
    if (!state.userProfile || !state.userProfile.id) return;
    const loc = getCurrentUserLocationInfo();
    sendEphemeralSync({
      action: "presence_ping",
      userId: state.userProfile.id,
      userName: state.userProfile.name,
      avatarId: state.userProfile.avatarId,
      customAvatarUrl: state.userProfile.customAvatarUrl,
      exhibitId: loc.exhibitId,
      locationLabel: loc.locationLabel,
      deletedIds: state.shared.deletedIds || {},
      clearedAtByExhibit: state.shared.clearedAtByExhibit || {}
    });
  }

  function getActiveOnlineUsersList() {
    const now = Date.now();
    const map = new Map();

    if (state.userProfile && state.userProfile.id) {
      const loc = getCurrentUserLocationInfo();
      map.set(state.userProfile.id, {
        userId: state.userProfile.id,
        userName: state.userProfile.name,
        avatarId: state.userProfile.avatarId,
        customAvatarUrl: state.userProfile.customAvatarUrl,
        exhibitId: loc.exhibitId,
        locationLabel: loc.locationLabel,
        isSelf: true,
        ts: now
      });
    }

    const presenceMap = state.shared.presenceByUser || {};
    for (const [uid, pObj] of Object.entries(presenceMap)) {
      if (!pObj || !uid) continue;
      if (now - (pObj.ts || 0) <= 20000) {
        if (map.has(uid)) {
          const cur = map.get(uid);
          if (!cur.isSelf && (pObj.ts || 0) > (cur.ts || 0)) {
            map.set(uid, { ...pObj, isSelf: false });
          }
        } else {
          map.set(uid, { ...pObj, isSelf: false });
        }
      } else {
        delete presenceMap[uid];
      }
    }

    const cursorsByEx = state.shared.cursorsByExhibit || {};
    for (const [exId, cMap] of Object.entries(cursorsByEx)) {
      if (!cMap || typeof cMap !== "object") continue;
      for (const [uid, cObj] of Object.entries(cMap)) {
        if (cObj && now - (cObj.ts || 0) <= 14000 && !map.has(uid)) {
          map.set(uid, {
            userId: uid,
            userName: cObj.userName || "Detective",
            avatarId: cObj.avatarId || "cat-sherlock",
            customAvatarUrl: cObj.customAvatarUrl || "",
            exhibitId: exId,
            locationLabel: `Drawing on ${exId}`,
            isSelf: false,
            ts: cObj.ts
          });
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.isSelf) return -1;
      if (b.isSelf) return 1;
      return (b.ts || 0) - (a.ts || 0);
    });
  }

  function renderOnlineUsersWidget() {
    const activeUsers = getActiveOnlineUsersList();
    const count = activeUsers.length;

    const targets = [
      {
        stack: document.getElementById("onlineAvatarsStack"),
        num: document.getElementById("onlineUsersCountNum")
      },
      {
        stack: document.getElementById("lbOnlineAvatarsStack"),
        num: document.getElementById("lbOnlineUsersCountNum")
      }
    ];

    const stackHtml = activeUsers
      .slice(0, 6)
      .map((u, idx) => {
        const zIndex = 20 - idx;
        const badgeTag = u.isSelf
          ? "YOU"
          : u.exhibitId
          ? u.exhibitId
          : "";
        return `
          <div
            class="online-user-chip ${u.isSelf ? "is-self" : ""}"
            style="z-index:${zIndex};"
            ${u.exhibitId ? `data-jump-online-exhibit="${escapeHtmlAttr(u.exhibitId)}"` : ""}
          >
            <span class="online-user-chip-avatar">${renderAvatarHtml(u)}</span>
            <span class="online-user-chip-name">
              <span>${escapeHtml(u.userName)}</span>
              ${badgeTag ? `<span class="online-user-chip-tag">${escapeHtml(badgeTag)}</span>` : ""}
            </span>
          </div>
        `;
      })
      .join("");

    targets.forEach((t) => {
      if (t.num && t.num.textContent !== String(count)) {
        t.num.textContent = String(count);
      }
      if (t.stack && t.stack.dataset.lastSig !== stackHtml) {
        t.stack.dataset.lastSig = stackHtml;
        t.stack.innerHTML = stackHtml;
        t.stack.querySelectorAll("[data-jump-online-exhibit]").forEach((chip) => {
          chip.addEventListener("click", (e) => {
            e.stopPropagation();
            const exId = chip.getAttribute("data-jump-online-exhibit");
            const idx = EXHIBITS.findIndex((item) => item.id === exId);
            if (idx !== -1) {
              openLightbox(idx, "saved");
            }
          });
        });
      }
    });
  }

  function refreshLiveCollaborativeViews() {
    const logBadge = document.getElementById("auditLogCountBadge");
    if (logBadge) {
      logBadge.textContent = String((state.shared.auditLog || []).length);
    }

    renderOnlineUsersWidget();
    updateCoverMugshotIfNeeded();
    renderSubjectsGrid();
    renderGlobalChat();

    if (state.lightboxOpen) {
      const ex = EXHIBITS[state.currentExhibitIndex];
      if (ex) {
        renderLightboxChat(ex);
        if (!state.activeMarkInteraction) {
          renderSharedMarksOverlay(ex);
        }
        renderMultiUserCursorsLayer(ex);
        renderSidebarAuditLog();
      }
    }

    const auditModal = document.getElementById("auditLogModal");
    if (auditModal && auditModal.open) {
      renderGlobalAuditLog();
    }

    if (state.viewMode === "binder") {
      renderBinderSpreadLiveParts();
    }
  }

  // ============================================================================
  // HELPER FORMATTING
  // ============================================================================
  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeHtmlAttr(str) {
    return escapeHtml(str).replace(/'/g, "&#39;");
  }

  function formatRelativeTime(ts) {
    if (!ts) return "just now";
    const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (diffSec < 10) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    return new Date(ts).toLocaleDateString();
  }

  function formatForensicText(rawText) {
    if (!rawText) return "";
    let html = escapeHtml(rawText);

    html = html.replace(
      /\[MISSED VOICE CALL([^\]]*)\]/gi,
      `<span class="inline-log-badge badge-missed">${ICON("phoneMissed", "icon-sm")} MISSED VOICE CALL$1</span>`
    );
    html = html.replace(
      /\[VOICE CALL([^\]]*)\]/gi,
      `<span class="inline-log-badge">${ICON("phoneCall", "icon-sm")} VOICE CALL$1</span>`
    );

    if (state.redactionsArmed) {
      const sortedTerms = [...SENSITIVE_TERMS].sort(
        (a, b) => b.length - a.length
      );
      sortedTerms.forEach((term) => {
        const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(${escapedTerm})(?![^<]*>)`, "gi");
        html = html.replace(
          regex,
          `<span class="redacted-bar" title="Click or hover to declassify">$1</span>`
        );
      });
    }

    if (state.searchQuery.trim().length > 1) {
      const q = state.searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const qRegex = new RegExp(`(${q})(?![^<]*>)`, "gi");
      html = html.replace(qRegex, `<mark class="search-highlight">$1</mark>`);
    }

    return html;
  }

  function getFilteredExhibits() {
    const q = state.searchQuery.trim().toLowerCase();
    return EXHIBITS.filter((ex) => {
      if (state.hideDuplicates && ex.isDuplicate) return false;
      if (state.pinnedOnly && !state.pinnedSet.has(ex.id)) return false;
      if (
        state.activeChapter !== "all" &&
        ex.chapterId !== state.activeChapter
      ) {
        return false;
      }

      if (state.activeSubjectFilter) {
        const subj = META.subjects.find(
          (s) => s.id === state.activeSubjectFilter
        );
        if (subj) {
          const inLinked =
            Array.isArray(subj.linkedExhibits) &&
            subj.linkedExhibits.includes(ex.numId);
          const blob = `${ex.title} ${ex.summary} ${ex.keyQuote} ${ex.transcript}`.toLowerCase();
          const inText = blob.includes(subj.id.toLowerCase());
          if (!inLinked && !inText) return false;
        }
      }

      if (q) {
        const haystack = `${ex.id} ${ex.bates} ${ex.dateLabel} ${ex.timeRange} ${ex.title} ${ex.summary} ${ex.keyQuote} ${ex.transcript} ${(ex.tags || []).join(" ")}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }

  // ============================================================================
  // RENDER TOP TOOLBAR BUTTONS
  // ============================================================================
  function renderToolbarButtons() {
    document.body.classList.toggle("redactions-off", !state.redactionsArmed);

    const redactBtn = document.getElementById("toggleRedactionsBtn");
    if (redactBtn) {
      redactBtn.classList.toggle("is-active", state.redactionsArmed);
      redactBtn.innerHTML = `${ICON("redact")} <span>Redactions: ${
        state.redactionsArmed ? "ON" : "OFF"
      }</span>`;
    }

    const pinBtn = document.getElementById("togglePinnedOnlyBtn");
    if (pinBtn) {
      pinBtn.classList.toggle("is-active", state.pinnedOnly);
      pinBtn.innerHTML = `${ICON("pin")} <span>Pinned (${state.pinnedSet.size})</span>`;
    }

    const dupBtn = document.getElementById("toggleDuplicateBtn");
    if (dupBtn) {
      dupBtn.classList.toggle("is-active", state.hideDuplicates);
      dupBtn.innerHTML = `${ICON("duplicate")} <span>${
        state.hideDuplicates ? "Showing 48 Unique" : "All 49 Scans"
      }</span>`;
    }

    const autoBtn = document.getElementById("autoplaySlideshowBtn");
    if (autoBtn) {
      const running = Boolean(state.autoplayTimer);
      autoBtn.classList.toggle("is-active", running);
      autoBtn.innerHTML = `${ICON(running ? "pause" : "play")} <span>${
        running ? "Stop Briefing" : "Auto-Briefing"
      }</span>`;
    }

    const soundBtn = document.getElementById("toggleSoundBtn");
    if (soundBtn) {
      soundBtn.classList.toggle("is-active", state.soundEnabled);
      soundBtn.innerHTML = `${ICON(
        state.soundEnabled ? "volumeOn" : "volumeOff"
      )} <span>Audio: ${state.soundEnabled ? "ON" : "MUTE"}</span>`;
    }
  }

  // ============================================================================
  // RENDER CHAPTER TABS & SUBJECT PROFILES (WITH EDITABLE CUSTOM MUGSHOTS)
  // ============================================================================
  function renderChapterTabs() {
    const container = document.getElementById("chapterTabs");
    if (!container) return;

    container.innerHTML = META.chapters
      .map((ch) => {
        const isActive = state.activeChapter === ch.id;
        return `
          <button
            type="button"
            role="tab"
            aria-selected="${isActive}"
            class="chapter-tab ${isActive ? "is-active" : ""}"
            data-chapter-id="${escapeHtmlAttr(ch.id)}"
            title="${escapeHtmlAttr(ch.description || ch.label)}"
          >
            ${ICON(ch.iconKey || "folder", "icon-sm")}
            <span>${escapeHtml(ch.shortLabel || ch.label)}</span>
            <span style="opacity:0.75; font-size:0.66rem;">(${ch.count})</span>
          </button>
        `;
      })
      .join("");

    container.querySelectorAll(".chapter-tab").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("page_flip");
        state.activeChapter = btn.getAttribute("data-chapter-id") || "all";
        state.binderIndex = 0;
        renderChapterTabs();
        renderFilterBanner();
        renderExhibitsView();
      });
    });
  }

  function renderSubjectsGrid() {
    const grid = document.getElementById("subjectsGrid");
    if (!grid) return;

    const html = META.subjects
      .map((rawSubj, idx) => {
        const s = getEffectiveSubject(rawSubj);
        const isSelected = state.activeSubjectFilter === s.id;
        return `
          <article
            class="subject-card ${isSelected ? "is-selected" : ""}"
            style="--stagger-i:${idx};"
            data-subject-id="${escapeHtmlAttr(s.id)}"
            title="Click to filter exhibits involving ${escapeHtmlAttr(s.realName)}"
          >
            <div class="subject-card-top">
              <div class="subject-avatar-wrap" data-edit-poi="${escapeHtmlAttr(s.id)}" title="Click to edit ${escapeHtmlAttr(s.realName)}'s mugshot &amp; profile">
                <img src="${escapeHtmlAttr(s.avatarUrl)}" alt="${escapeHtmlAttr(s.realName)}" loading="lazy" />
                <div class="subject-avatar-edit-overlay">
                  ${ICON("edit", "icon-sm")}
                  <span>EDIT PIC</span>
                </div>
              </div>
              <div style="flex:1; min-width:0;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                  <div class="subject-codename">${escapeHtml(s.codename)}</div>
                  <button
                    type="button"
                    class="poi-edit-pill-btn"
                    data-edit-poi="${escapeHtmlAttr(s.id)}"
                    title="Edit ${escapeHtmlAttr(s.realName)}'s portrait, name, or role"
                  >
                    ${ICON("edit", "icon-sm")}
                    <span>Edit</span>
                  </button>
                </div>
                <div class="subject-name">${escapeHtml(s.realName)}</div>
                <div style="font-family:var(--font-mono); font-size:0.68rem; color:#a8a093;">
                  ${escapeHtml(s.role)} • <strong style="color:var(--manila-base);">${escapeHtml(s.status)}</strong>
                </div>
              </div>
            </div>

            <p class="subject-summary">${formatForensicText(s.summary)}</p>

            <div class="subject-exhibit-chips">
              ${(s.linkedExhibits || [])
                .slice(0, 8)
                .map((num) => {
                  const code = `EX-${String(num).padStart(2, "0")}`;
                  return `<button type="button" class="exhibit-jump-chip" data-chip-exhibit="${code}" title="Inspect ${code}">${code}</button>`;
                })
                .join("")}
            </div>
          </article>
        `;
      })
      .join("");

    if (grid.dataset.lastSig === html) return;
    grid.dataset.lastSig = html;
    grid.innerHTML = html;

    grid.querySelectorAll("[data-edit-poi]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        const poiId = el.getAttribute("data-edit-poi");
        if (poiId) openPoiModal(poiId);
      });
    });

    grid.querySelectorAll(".subject-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (
          e.target.closest("[data-chip-exhibit]") ||
          e.target.closest("[data-edit-poi]") ||
          e.target.closest(".redacted-bar")
        ) {
          return;
        }
        playForensicSound("click");
        const clickedId = card.getAttribute("data-subject-id");
        state.activeSubjectFilter =
          state.activeSubjectFilter === clickedId ? null : clickedId;
        state.binderIndex = 0;
        renderSubjectsGrid();
        renderFilterBanner();
        renderExhibitsView();
      });
    });

    grid.querySelectorAll("[data-chip-exhibit]").forEach((chip) => {
      chip.addEventListener("click", (e) => {
        e.stopPropagation();
        const code = chip.getAttribute("data-chip-exhibit");
        const idx = EXHIBITS.findIndex((x) => x.id === code);
        if (idx !== -1) openLightbox(idx, "saved");
      });
    });
  }

  function renderFilterBanner() {
    const banner = document.getElementById("activeFilterBanner");
    if (!banner) return;

    const filtered = getFilteredExhibits();
    const parts = [];
    if (state.activeChapter !== "all") {
      const ch = META.chapters.find((c) => c.id === state.activeChapter);
      if (ch) parts.push(`CHAPTER: ${ch.label}`);
    }
    if (state.activeSubjectFilter) {
      const subj = META.subjects.find((s) => s.id === state.activeSubjectFilter);
      if (subj) parts.push(`SUBJECT: ${getEffectiveSubject(subj).realName}`);
    }
    if (state.pinnedOnly) parts.push("PINNED EVIDENCE ONLY");
    if (state.hideDuplicates) parts.push("DUPLICATE SCAN HIDDEN");
    if (state.searchQuery.trim()) parts.push(`SEARCH: "${state.searchQuery.trim()}"`);

    if (parts.length === 0) {
      banner.classList.remove("is-visible");
      banner.innerHTML = "";
      return;
    }

    banner.classList.add("is-visible");
    banner.innerHTML = `
      <div>
        <strong style="color:var(--manila-base);">ACTIVE FORENSIC FILTER (${filtered.length} OF ${EXHIBITS.length} EXHIBITS):</strong>
        <span style="margin-left:8px;">${escapeHtml(parts.join("  •  "))}</span>
      </div>
      <button type="button" class="tool-btn" id="resetAllFiltersBtn" style="padding:4px 10px; font-size:0.7rem;">
        RESET FILTERS
      </button>
    `;

    document.getElementById("resetAllFiltersBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      state.activeChapter = "all";
      state.activeSubjectFilter = null;
      state.pinnedOnly = false;
      state.hideDuplicates = false;
      state.searchQuery = "";
      const searchInput = document.getElementById("globalSearchInput");
      if (searchInput) searchInput.value = "";
      renderToolbarButtons();
      renderChapterTabs();
      renderSubjectsGrid();
      renderFilterBanner();
      renderExhibitsView();
    });
  }

  // ============================================================================
  // RENDER EXHIBITS WORKSPACE (5 VIEW MODES)
  // ============================================================================
  function renderExhibitsView() {
    const mount = document.getElementById("exhibitsMount");
    if (!mount) return;

    const filtered = getFilteredExhibits();

    if (filtered.length === 0) {
      mount.innerHTML = `
        <div style="text-align:center; padding:3.5rem 1.5rem; background:#161310; border:1px dashed #453c30; border-radius:8px; font-family:var(--font-mono);">
          <h3 style="color:var(--manila-base); margin:0 0 8px;">NO DECLASSIFIED EXHIBITS MATCH YOUR FILTER</h3>
          <p style="font-size:0.82rem; color:#9ca3af; margin:0;">Try clearing your search query or clicking "ALL (49)" above.</p>
        </div>
      `;
      return;
    }

    if (state.viewMode === "grid") {
      renderDossierGridView(mount, filtered);
    } else if (state.viewMode === "binder") {
      renderCaseBinderView(mount, filtered);
    } else if (state.viewMode === "stream") {
      renderContinuousStreamView(mount, filtered);
    } else if (state.viewMode === "foia") {
      renderFoiaSheetView(mount, filtered);
    } else if (state.viewMode === "corkboard") {
      renderCorkboardView(mount, filtered);
    }
  }

  function getInkHexColor(colorName) {
    const map = {
      red: "#f87171",
      yellow: "#facc15",
      green: "#4ade80",
      cyan: "#38bdf8",
      orange: "#fb923c",
      white: "#f8fafc"
    };
    return map[colorName] || "#facc15";
  }

  function computeArrowHeadGeometry(pts, scaleX, scaleY, strokeWidth = 3.5) {
    if (!Array.isArray(pts) || pts.length < 2) return null;
    const last = pts[pts.length - 1];
    const tx = last[0] * scaleX;
    const ty = last[1] * scaleY;

    // Walk backward along the stroke to find a point ~22px back from the tip so wrist release jitter doesn't twist the arrow
    const targetBackDist = Math.max(16, strokeWidth * 5.2);
    let anchor = pts[0];
    for (let i = pts.length - 2; i >= 0; i--) {
      const px = pts[i][0] * scaleX;
      const py = pts[i][1] * scaleY;
      anchor = pts[i];
      if (Math.hypot(tx - px, ty - py) >= targetBackDist) {
        break;
      }
    }

    const dx = tx - anchor[0] * scaleX;
    const dy = ty - anchor[1] * scaleY;
    if (Math.hypot(dx, dy) < 3) return null;

    const angle = Math.atan2(dy, dx);
    const headLen = Math.max(15, strokeWidth * 4.4);
    const wingAngle = 0.46; // Sleek ~26.5° detective arrow spread
    const wx1 = tx - headLen * Math.cos(angle - wingAngle);
    const wy1 = ty - headLen * Math.sin(angle - wingAngle);
    const wx2 = tx - headLen * Math.cos(angle + wingAngle);
    const wy2 = ty - headLen * Math.sin(angle + wingAngle);
    const nx = tx - headLen * 0.66 * Math.cos(angle);
    const ny = ty - headLen * 0.66 * Math.sin(angle);

    return { tx, ty, wx1, wy1, wx2, wy2, nx, ny, angle, headLen };
  }

  function buildSmoothSvgPath(scaledPts) {
    if (scaledPts.length === 0) return "";
    if (scaledPts.length === 1) {
      return `M ${scaledPts[0][0].toFixed(1)} ${scaledPts[0][1].toFixed(1)}`;
    }
    if (scaledPts.length === 2) {
      return `M ${scaledPts[0][0].toFixed(1)} ${scaledPts[0][1].toFixed(1)} L ${scaledPts[1][0].toFixed(1)} ${scaledPts[1][1].toFixed(1)}`;
    }
    let d = `M ${scaledPts[0][0].toFixed(1)} ${scaledPts[0][1].toFixed(1)}`;
    for (let i = 1; i < scaledPts.length - 1; i++) {
      const cx = scaledPts[i][0];
      const cy = scaledPts[i][1];
      const mx = (cx + scaledPts[i + 1][0]) * 0.5;
      const my = (cy + scaledPts[i + 1][1]) * 0.5;
      d += ` Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    const last = scaledPts[scaledPts.length - 1];
    d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
    return d;
  }

  function buildPencilSvgHtml(m) {
    const strokeHex = getInkHexColor(m.color);
    const pts = Array.isArray(m.points) ? m.points : [];
    if (pts.length < 2) return "";

    // Use aspect-proportional coordinate space so arrowheads never squish on horizontal or vertical strokes
    const vw = Math.max(24, Math.round((Number(m.w) || 0.12) * 520));
    const vh = Math.max(24, Math.round((Number(m.h) || 0.12) * 920));
    const sw = Number(m.strokeWidth || 3.5);

    const scaledPts = pts.map((pt) => [pt[0] * vw, pt[1] * vh]);
    const pathD = buildSmoothSvgPath(scaledPts);

    let arrowMarkup = "";
    if (m.arrowTip && pts.length >= 2) {
      const ah = computeArrowHeadGeometry(pts, vw, vh, sw);
      if (ah) {
        arrowMarkup = `
          <polygon points="${ah.tx.toFixed(1)},${ah.ty.toFixed(1)} ${ah.wx1.toFixed(1)},${ah.wy1.toFixed(1)} ${ah.nx.toFixed(1)},${ah.ny.toFixed(1)} ${ah.wx2.toFixed(1)},${ah.wy2.toFixed(1)}" fill="${strokeHex}" fill-opacity="0.88" />
          <path d="M ${ah.wx1.toFixed(1)} ${ah.wy1.toFixed(1)} L ${ah.tx.toFixed(1)} ${ah.ty.toFixed(1)} L ${ah.wx2.toFixed(1)} ${ah.wy2.toFixed(1)}" fill="none" stroke="${strokeHex}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        `;
      }
    }

    return `
      <svg class="mark-pencil-svg" viewBox="0 0 ${vw} ${vh}" preserveAspectRatio="none">
        <path d="${pathD}" fill="none" stroke="${strokeHex}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
        ${arrowMarkup}
      </svg>
    `;
  }

  function renderStaticMarkHtml(m) {
    const style = `left:${(m.x * 100).toFixed(2)}%; top:${(m.y * 100).toFixed(2)}%; width:${(m.w * 100).toFixed(2)}%; height:${(m.h * 100).toFixed(2)}%; pointer-events:none;`;
    if (m.type === "pencil") {
      return `<div class="shared-mark-box mark-pencil" style="${style}">${buildPencilSvgHtml(m)}</div>`;
    }
    if (m.type === "highlight") {
      const colorClass = `hl-${m.color || "yellow"}`;
      return `<div class="shared-mark-box mark-highlight ${escapeHtmlAttr(colorClass)}" style="${style}"></div>`;
    }
    const labelText = m.label !== undefined ? m.label : "REDACTED";
    return `<div class="shared-mark-box mark-redact" style="${style}"><span>${escapeHtml(labelText)}</span></div>`;
  }

  // 1. DOSSIER GRID VIEW
  function renderDossierGridView(mount, exhibits) {
    mount.innerHTML = `
      <div class="exhibits-grid">
        ${exhibits
          .map((ex, i) => {
            const isPinned = state.pinnedSet.has(ex.id);
            const isCritical = ex.severity === "critical";
            const chatCount = (state.shared.chatsByExhibit[ex.id] || []).length;
            const markCount = (state.shared.marksByExhibit[ex.id] || []).length;

            return `
              <article
                class="exhibit-card ${isCritical ? "is-critical" : ""} ${ex.isDuplicate ? "is-duplicate" : ""}"
                style="--stagger-i:${Math.min(i, 16)};"
                data-exhibit-id="${ex.id}"
              >
                <div class="card-court-header">
                  <span>${escapeHtml(ex.bates)}</span>
                  <span>PAGE ${ex.order} OF 49</span>
                </div>

                <div class="card-top-bar">
                  <span class="exhibit-number-badge">
                    ${ICON("folder", "icon-sm")}
                    <span>EXHIBIT ${escapeHtml(ex.id)}</span>
                  </span>
                  <span class="exhibit-timestamp-pill">${escapeHtml(ex.dateLabel)} • ${escapeHtml(ex.timeRange)}</span>
                </div>

                <div class="card-image-stage" data-open-exhibit="${ex.id}" data-open-tab="saved">
                  <img
                    src="./${encodeURI(ex.filename)}"
                    alt="${escapeHtmlAttr(ex.id)} — ${escapeHtmlAttr(ex.title)}"
                    loading="lazy"
                    decoding="async"
                  />
                  ${
                    isCritical
                      ? `<div class="critical-stamp-overlay">KEY EVIDENCE</div>`
                      : ex.isDuplicate
                      ? `<div class="critical-stamp-overlay" style="background:#44403c; border-color:#a8a29e;">DUPLICATE OF ${escapeHtml(ex.duplicateOfCode)}</div>`
                      : ""
                  }
                  <div class="card-zoom-overlay">
                    <span class="zoom-cta-badge">
                      ${ICON("loupe", "icon-sm")}
                      <span>OPEN LIGHT-TABLE &amp; CHAT</span>
                    </span>
                    <span style="font-family:var(--font-mono); font-size:0.68rem; color:#f5eedc; background:rgba(0,0,0,0.75); padding:3px 7px; border-radius:3px;">
                      ${chatCount} Chats${markCount ? ` • ${markCount} Marks` : ""}
                    </span>
                  </div>
                </div>

                <div class="card-body">
                  <h3 class="card-title">${escapeHtml(ex.title)}</h3>
                  <p class="card-summary">${formatForensicText(ex.summary)}</p>

                  <blockquote class="card-quote-box">
                    "${formatForensicText(ex.keyQuote)}"
                  </blockquote>

                  <div class="card-tags-row">
                    ${(ex.tags || [])
                      .map((t) => `<span class="evidence-tag">#${escapeHtml(t)}</span>`)
                      .join("")}
                  </div>
                </div>

                <div class="card-actions-bar">
                  <button type="button" class="pin-btn ${isPinned ? "is-pinned" : ""}" data-pin-exhibit="${ex.id}">
                    ${ICON("pin", "icon-sm")}
                    <span>${isPinned ? "PINNED" : "PIN"}</span>
                  </button>
                  <button type="button" class="card-action-btn" data-open-exhibit="${ex.id}" data-open-tab="chat" title="Open Live Chat for ${escapeHtmlAttr(ex.id)}">
                    ${ICON("chat", "icon-sm")}
                    <span>CHAT (${chatCount})</span>
                  </button>
                  <button type="button" class="card-action-btn btn-primary-inspect" data-open-exhibit="${ex.id}" data-open-tab="saved">
                    ${ICON("loupe", "icon-sm")}
                    <span>INSPECT${markCount ? ` (${markCount})` : ""}</span>
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    `;

    bindExhibitCardEvents(mount);
  }

  // 2. CASE BINDER (OPEN 3-RING TWO-PAGE DETECTIVE DOSSIER SPREAD + ZERO-TELEPORT 3D PAGE FLIPPING)
  function buildBinderLeftPageInnerHtml(ex, prevEx, includeIds = true) {
    if (!ex) return "";
    const marks = state.shared.marksByExhibit[ex.id] || [];
    return `
      <div class="binder-left-toolbar">
        <span><strong>BATES:</strong> ${escapeHtml(ex.bates)}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <button
            type="button"
            class="poi-edit-pill-btn"
            ${includeIds ? 'id="binderZoomToggleBtn"' : ""}
            style="background:${state.binderReadZoom ? "#1c1917" : "#efe6d2"}; color:${state.binderReadZoom ? "#f5eedc" : "#1c1917"}; border-color:#8a7b61;"
            title="Toggle inline 2x reading width inside the binder"
          >
            ${ICON("loupe", "icon-sm")}
            <span>${state.binderReadZoom ? "Fit Page (1x)" : "Read Width (2x)"}</span>
          </button>
          <button
            type="button"
            class="poi-edit-pill-btn"
            data-open-exhibit="${ex.id}"
            data-open-tab="saved"
            style="background:#8b1a1a; color:#fff; border-color:#7f1d1d;"
            title="Open on Full Light-Table for Pan, Redact &amp; Highlight"
          >
            <span>Light-Table</span>
          </button>
        </div>
      </div>

      <div
        class="binder-photo-mount ${state.binderReadZoom ? "is-zoomed-read" : ""}"
        ${includeIds ? 'id="binderPhotoMount"' : ""}
        data-open-exhibit="${state.binderReadZoom ? "" : ex.id}"
        data-open-tab="saved"
        title="${state.binderReadZoom ? "Scroll vertically to read screenshot" : "Click to open full Light-Table Zoom, Pan & Redact tools"}"
      >
        <div class="binder-img-stage">
          <img src="./${encodeURI(ex.filename)}" alt="${escapeHtmlAttr(ex.title)}" />
          <div class="shared-marks-layer" style="top:0; left:0; width:100%; height:100%;">
            ${marks.map(renderStaticMarkHtml).join("")}
          </div>
        </div>
      </div>

      <div style="margin-top:auto; display:flex; justify-content:space-between; align-items:center; padding-top:10px; font-size:0.7rem; color:#575043;">
        <span>CLOCK: <strong>${escapeHtml(ex.phoneClock)}</strong> • BAT: <strong>${escapeHtml(ex.battery)}</strong></span>
        <button type="button" class="open-dossier-btn" data-open-exhibit="${ex.id}" data-open-tab="saved" style="padding:7px 14px; font-size:0.74rem;">
          ${ICON("loupe")}
          <span>FULL LIGHT-TABLE &amp; REDACT</span>
        </button>
      </div>

      ${
        prevEx
          ? `<div class="page-corner-curl curl-left" ${includeIds ? 'id="binderCurlPrev"' : ""} title="Flip back to ${escapeHtmlAttr(prevEx.id)}"></div>`
          : ""
      }
    `;
  }

  function buildBinderRightPageInnerHtml(ex, nextEx, includeIds = true) {
    if (!ex) return "";
    const chats = state.shared.chatsByExhibit[ex.id] || [];
    return `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; border-bottom:2px solid #1c1917; padding-bottom:10px; margin-bottom:12px;">
        <div>
          <div style="font-size:0.72rem; color:var(--court-blue); font-weight:700;">
            EXHIBIT ${escapeHtml(ex.id)} // ${escapeHtml(ex.dateLabel)} (${escapeHtml(ex.timeRange)})
          </div>
          <h2 style="font-size:1.12rem; margin:4px 0 0; color:#111;">${escapeHtml(ex.title)}</h2>
        </div>
        <span class="rubber-stamp">DECLASSIFIED</span>
      </div>

      <!-- Structured 4-Cell Forensic Telemetry Grid -->
      <div class="binder-telemetry-grid">
        <div class="binder-telemetry-cell">
          <span class="cell-label">BATES STAMP ID</span>
          <span class="cell-val">${escapeHtml(ex.bates)}</span>
        </div>
        <div class="binder-telemetry-cell">
          <span class="cell-label">INTERCEPT WINDOW</span>
          <span class="cell-val">${escapeHtml(ex.dateLabel)} • ${escapeHtml(ex.timeRange)}</span>
        </div>
        <div class="binder-telemetry-cell">
          <span class="cell-label">DEVICE STATUS</span>
          <span class="cell-val">Clock ${escapeHtml(ex.phoneClock)} • Battery ${escapeHtml(ex.battery)}</span>
        </div>
        <div class="binder-telemetry-cell">
          <span class="cell-label">CONTINUITY STATUS</span>
          <span class="cell-val" style="color:${ex.isDuplicate ? "#b45309" : "#15803d"};">
            ${ex.isDuplicate ? `Duplicate of ${escapeHtml(ex.duplicateOfCode)}` : "Verified Sequential Scan"}
          </span>
        </div>
      </div>

      <div style="background:#efe6d2; border-left:3px solid var(--court-blue); padding:7px 10px; font-size:0.73rem; margin-bottom:10px;">
        <strong>CHAIN OF CUSTODY CONTINUITY:</strong> ${escapeHtml(ex.continuityBridge)}
      </div>

      <p style="font-size:0.8rem; line-height:1.48; margin:0 0 8px;">
        <strong>Forensic Summary:</strong> ${formatForensicText(ex.summary)}
      </p>

      <blockquote class="card-quote-box" style="margin:0 0 10px; font-size:0.76rem;">
        "${formatForensicText(ex.keyQuote)}"
      </blockquote>

      <!-- Declassified Transcript Excerpt -->
      <div style="margin-bottom:10px;">
        <div style="font-size:0.66rem; font-weight:800; color:#575043; letter-spacing:0.08em; margin-bottom:4px;">
          DECLASSIFIED TRANSCRIPT LOG (${escapeHtml(ex.id)})
        </div>
        <div style="background:#f3ebd9; border:1px solid #c8ba9e; border-radius:4px; padding:8px 10px; font-size:0.72rem; line-height:1.48; max-height:110px; overflow-y:auto; white-space:pre-wrap; color:#1c1917;">${formatForensicText(ex.transcript)}</div>
      </div>

      <!-- Embedded Live Per-Page Chat Room -->
      <div style="background:#161310; color:#f5eedc; border:1px solid #352e25; border-radius:6px; padding:10px 12px; display:flex; flex-direction:column; gap:7px; margin-top:auto;">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; color:var(--manila-base);">
          <span>${ICON("chat", "icon-sm")} <strong>${escapeHtml(ex.id)} PAGE CHAT ROOM (${chats.length})</strong></span>
          <button type="button" class="tool-btn" ${includeIds ? 'id="binderEditIdentityBtn"' : ""} style="padding:2px 8px; font-size:0.65rem;">
            ${ICON("edit", "icon-sm")} Edit My Alias/PFP
          </button>
        </div>

        <div class="page-chat-feed" ${includeIds ? 'id="binderChatFeed"' : ""} style="max-height:135px; min-height:82px;">
          ${renderChatMessagesHtml(chats, ex.id)}
        </div>

        <div class="chat-composer-shell" ${includeIds ? 'id="binderChatComposerShell"' : ""}>
          <div class="chat-reply-banner" ${includeIds ? 'id="binderChatReplyBanner"' : ""} hidden></div>
          <div class="chat-media-preview" ${includeIds ? 'id="binderChatMediaPreview"' : ""} hidden></div>
          <div class="chat-gif-drawer" ${includeIds ? 'id="binderGifPickerDrawer"' : ""} hidden></div>
          <div class="chat-emoji-drawer" ${includeIds ? 'id="binderEmojiPickerDrawer"' : ""} hidden></div>
          <form class="page-chat-form" ${includeIds ? 'id="binderChatForm"' : ""} autocomplete="off">
            <input
              type="file"
              ${includeIds ? 'id="binderChatFileInput"' : ""}
              accept="image/*,.gif,.webp,.png,.jpg,.jpeg"
              hidden
            />
            <button
              type="button"
              class="tool-btn chat-media-btn"
              ${includeIds ? 'id="binderChatUploadBtn"' : ""}
              title="Upload Picture or GIF"
            >
              <svg class="svg-icon icon-sm" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            </button>
            <button
              type="button"
              class="tool-btn chat-emoji-btn"
              ${includeIds ? 'id="binderChatEmojiBtn"' : ""}
              title="Open Emoji Library (Quick PC Emoji Picker)"
            >
              <span>😀</span>
            </button>
            <button
              type="button"
              class="tool-btn chat-gif-btn"
              ${includeIds ? 'id="binderChatGifBtn"' : ""}
              title="Open Unhinged & Reaction GIF Library"
            >
              <span>GIF</span>
            </button>
            <input
              type="text"
              ${includeIds ? 'id="binderChatInput"' : ""}
              class="page-chat-input"
              placeholder="Message, paste pic/GIF, or drop link..."
              maxlength="400"
              autocomplete="off"
              data-form-type="other"
            />
            <button type="submit" class="tool-btn is-active">
              ${ICON("send", "icon-sm")}
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

      ${
        nextEx
          ? `<div class="page-corner-curl curl-right" ${includeIds ? 'id="binderCurlNext"' : ""} title="Flip forward to ${escapeHtmlAttr(nextEx.id)}"></div>`
          : ""
      }
    `;
  }

  function renderCaseBinderView(mount, exhibits) {
    if (state.binderIndex >= exhibits.length) state.binderIndex = 0;
    if (state.binderIndex < 0) state.binderIndex = exhibits.length - 1;

    const ex = exhibits[state.binderIndex];
    const prevEx = state.binderIndex > 0 ? exhibits[state.binderIndex - 1] : null;
    const nextEx =
      state.binderIndex < exhibits.length - 1
        ? exhibits[state.binderIndex + 1]
        : null;

    mount.innerHTML = `
      <div class="binder-spread-stage">
        <div class="binder-nav-bar">
          <button type="button" class="tool-btn" id="binderPrevBtn" ${!prevEx ? "disabled style='opacity:0.4;pointer-events:none;'" : ""}>
            ${ICON("chevronLeft", "icon-sm")}
            <span>FLIP BACK (${prevEx ? escapeHtml(prevEx.id) : "START"})</span>
          </button>

          <div style="text-align:center;">
            <strong style="color:var(--manila-base); font-size:0.86rem; letter-spacing:0.06em;">
              3-RING CASE BINDER SPREAD // ${escapeHtml(ex.id)} (SHEET ${state.binderIndex + 1} OF ${exhibits.length})
            </strong>
            <div style="font-size:0.7rem; color:#9ca3af;">
              ${escapeHtml(ex.bates)} • ${escapeHtml(ex.dateLabel)} (${escapeHtml(ex.timeRange)}) • Use ← / → or click page corners to flip
            </div>
          </div>

          <button type="button" class="tool-btn is-active" id="binderNextBtn" ${!nextEx ? "disabled style='opacity:0.4;pointer-events:none;'" : ""}>
            <span>FLIP NEXT (${nextEx ? escapeHtml(nextEx.id) : "END"})</span>
            ${ICON("chevronRight", "icon-sm")}
          </button>
        </div>

        <div class="binder-open-book-shell">
          <!-- Side Index Tabs on Right Edge of Binder -->
          <div class="binder-side-tabs" aria-label="Binder Chapter Dividers">
            ${META.chapters
              .filter((c) => c.id !== "all")
              .map(
                (ch, idx) => `
                <button
                  type="button"
                  class="binder-side-tab ${ex.chapterId === ch.id ? "is-active" : ""}"
                  data-binder-chapter="${escapeHtmlAttr(ch.id)}"
                  title="Jump to ${escapeHtmlAttr(ch.label)}"
                >
                  CH.0${idx + 1}
                </button>
              `
              )
              .join("")}
          </div>

          <div class="binder-open-book" id="binderOpenBook">
            <!-- 3-Ring Metallic Spine Gutter -->
            <div class="binder-spine-gutter" aria-hidden="true">
              <div class="binder-ring"></div>
              <div class="binder-ring"></div>
              <div class="binder-ring"></div>
            </div>

            <!-- 3D Turning Page Leaf (Populated & Animated during turnBinderPage with 1:1 exact page faces) -->
            <div class="binder-turning-leaf" id="binderTurningLeaf" aria-hidden="true">
              <div class="leaf-face leaf-front" id="binderLeafFront"></div>
              <div class="leaf-face leaf-back" id="binderLeafBack"></div>
            </div>

            <!-- Left Page: Mounted Evidence Photograph with Inline Zoom Toggle -->
            <div class="binder-page-left" id="binderPageLeft">
              ${buildBinderLeftPageInnerHtml(ex, prevEx, true)}
            </div>

            <!-- Right Page: Structured Forensic Dossier, Transcript Excerpt & Embedded Live Page Chat -->
            <div class="binder-page-right" id="binderPageRight">
              ${buildBinderRightPageInnerHtml(ex, nextEx, true)}
            </div>
          </div>
        </div>
      </div>
    `;

    bindExhibitCardEvents(mount);
    bindChatDeleteButtons(mount);
    updateChatReplyBanners(ex.id);

    document
      .getElementById("binderPrevBtn")
      ?.addEventListener("click", () => turnBinderPage(-1, exhibits.length));
    document
      .getElementById("binderNextBtn")
      ?.addEventListener("click", () => turnBinderPage(1, exhibits.length));
    document
      .getElementById("binderCurlPrev")
      ?.addEventListener("click", () => turnBinderPage(-1, exhibits.length));
    document
      .getElementById("binderCurlNext")
      ?.addEventListener("click", () => turnBinderPage(1, exhibits.length));

    document
      .getElementById("binderZoomToggleBtn")
      ?.addEventListener("click", (e) => {
        e.stopPropagation();
        playForensicSound("click");
        state.binderReadZoom = !state.binderReadZoom;
        renderExhibitsView();
      });

    mount.querySelectorAll("[data-binder-chapter]").forEach((tabBtn) => {
      tabBtn.addEventListener("click", () => {
        const chId = tabBtn.getAttribute("data-binder-chapter");
        const targetIdx = exhibits.findIndex((item) => item.chapterId === chId);
        if (targetIdx !== -1 && targetIdx !== state.binderIndex) {
          turnBinderPage(targetIdx - state.binderIndex, exhibits.length);
        } else if (targetIdx === -1 && chId) {
          state.activeChapter = chId;
          state.binderIndex = 0;
          renderChapterTabs();
          renderFilterBanner();
          renderExhibitsView();
        }
      });
    });

    document
      .getElementById("binderEditIdentityBtn")
      ?.addEventListener("click", openIdentityModal);

    updateChatMediaPreviews();
    renderGifPickerDrawers();
    renderEmojiPickerDrawers();

    document
      .getElementById("binderChatUploadBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        document.getElementById("binderChatFileInput")?.click();
      });

    document
      .getElementById("binderChatFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) processChatImageOrGifFile(file);
        e.target.value = "";
      });

    document
      .getElementById("binderChatEmojiBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.emojiDrawerOpen = !state.emojiDrawerOpen;
        if (state.emojiDrawerOpen) state.gifDrawerOpen = false;
        renderGifPickerDrawers();
        renderEmojiPickerDrawers();
      });

    document
      .getElementById("binderChatGifBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.gifDrawerOpen = !state.gifDrawerOpen;
        if (state.gifDrawerOpen) state.emojiDrawerOpen = false;
        renderEmojiPickerDrawers();
        renderGifPickerDrawers();
      });

    document
      .getElementById("binderChatInput")
      ?.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              processChatImageOrGifFile(file);
              break;
            }
          }
        }
      });

    document.getElementById("binderChatForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = document.getElementById("binderChatInput");
      const val = input ? input.value.trim() : "";
      if (!val && !state.pendingChatMediaUrl) return;
      submitPageChatMessage(ex.id, val);
      if (input) input.value = "";
    });
  }

  function turnBinderPage(delta, totalCount) {
    if (state.binderFlipping || totalCount <= 1) return;
    const filtered = getFilteredExhibits();
    const nextIdx = (state.binderIndex + delta + totalCount) % totalCount;
    if (nextIdx === state.binderIndex) return;

    const currentEx = filtered[state.binderIndex];
    const targetEx = filtered[nextIdx];
    const targetPrevEx = nextIdx > 0 ? filtered[nextIdx - 1] : null;
    const targetNextEx =
      nextIdx < filtered.length - 1 ? filtered[nextIdx + 1] : null;

    playForensicSound("page_flip");
    const leaf = document.getElementById("binderTurningLeaf");
    const frontEl = document.getElementById("binderLeafFront");
    const backEl = document.getElementById("binderLeafBack");
    const leftPageEl = document.getElementById("binderPageLeft");
    const rightPageEl = document.getElementById("binderPageRight");

    if (!leaf || !frontEl || !backEl || !leftPageEl || !rightPageEl) {
      state.binderIndex = nextIdx;
      renderExhibitsView();
      return;
    }

    state.binderFlipping = true;
    leaf.classList.remove(
      "turn-forward",
      "turn-backward",
      "flip-next",
      "flip-prev"
    );

    if (delta > 0) {
      // Flipping forward (Right page lifts and turns over onto Left page):
      // 1. Leaf front matches current Right page; Leaf back matches target Left page
      frontEl.innerHTML = buildBinderRightPageInnerHtml(currentEx, null, false);
      backEl.innerHTML = buildBinderLeftPageInnerHtml(targetEx, targetPrevEx, false);

      // 2. Show leaf at 0deg (covering Right page) and immediately reveal target Right page underneath
      void leaf.offsetWidth;
      leaf.classList.add("turn-forward");
      rightPageEl.innerHTML = buildBinderRightPageInnerHtml(targetEx, targetNextEx, false);
    } else {
      // Flipping backward (Left page lifts and turns over onto Right page):
      // 1. Leaf back matches current Left page; Leaf front matches target Right page
      backEl.innerHTML = buildBinderLeftPageInnerHtml(currentEx, null, false);
      frontEl.innerHTML = buildBinderRightPageInnerHtml(targetEx, targetNextEx, false);

      // 2. Show leaf at -180deg (covering Left page) and immediately reveal target Left page underneath
      void leaf.offsetWidth;
      leaf.classList.add("turn-backward");
      leftPageEl.innerHTML = buildBinderLeftPageInnerHtml(targetEx, targetPrevEx, false);
    }

    // 3. Wait until the leaf lands flat (640ms), then finalize the spread underneath with zero visual jump
    setTimeout(() => {
      state.binderIndex = nextIdx;
      state.binderFlipping = false;
      renderExhibitsView();
    }, 640);
  }

  function renderBinderSpreadLiveParts() {
    const filtered = getFilteredExhibits();
    const ex = filtered[state.binderIndex];
    if (!ex) return;
    const feed = document.getElementById("binderChatFeed");
    if (feed) {
      const chats = state.shared.chatsByExhibit[ex.id] || [];
      feed.innerHTML = renderChatMessagesHtml(chats, ex.id);
      bindChatDeleteButtons(feed);
      feed.scrollTop = feed.scrollHeight;
    }
  }

  // 3. CONTINUOUS CHAT SCROLL VIEW
  function renderContinuousStreamView(mount, exhibits) {
    let lastChapter = null;
    const blocks = [];

    exhibits.forEach((ex, idx) => {
      if (ex.chapterId !== lastChapter) {
        lastChapter = ex.chapterId;
        const chObj = META.chapters.find((c) => c.id === ex.chapterId);
        if (chObj) {
          blocks.push(`
            <div class="stream-chapter-divider">
              <h3>${ICON("folder")} <span>${escapeHtml(chObj.label)}</span></h3>
              <p>${escapeHtml(chObj.description)}</p>
            </div>
          `);
        }
      }

      const chatCount = (state.shared.chatsByExhibit[ex.id] || []).length;
      blocks.push(`
        <article class="stream-item" style="--stagger-i:${Math.min(idx, 12)};" data-exhibit-id="${ex.id}">
          <div class="stream-phone-frame" data-open-exhibit="${ex.id}" data-open-tab="saved" title="Click to inspect on Light-Table">
            <img src="./${encodeURI(ex.filename)}" alt="${escapeHtmlAttr(ex.id)}" loading="lazy" />
          </div>
          <div class="stream-case-notes">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <span class="exhibit-number-badge">${escapeHtml(ex.id)} // ${escapeHtml(ex.bates)}</span>
              <span style="font-family:var(--font-mono); font-size:0.74rem; color:var(--manila-base);">
                ${escapeHtml(ex.dateLabel)} • ${escapeHtml(ex.timeRange)}
              </span>
            </div>

            <h3 style="font-family:var(--font-mono); font-size:1.05rem; margin:0; color:#fff;">
              ${escapeHtml(ex.title)}
            </h3>

            <div class="continuity-bridge-box">
              <strong>CHAIN OF CUSTODY:</strong> ${escapeHtml(ex.continuityBridge)}
            </div>

            <p style="font-size:0.84rem; color:#d6cfc2; line-height:1.5; margin:0;">
              ${formatForensicText(ex.summary)}
            </p>

            <div class="stream-transcript-pre">${formatForensicText(ex.transcript)}</div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="tool-btn is-active" data-open-exhibit="${ex.id}" data-open-tab="saved">
                ${ICON("loupe")}
                <span>Light-Table Zoom &amp; Redact</span>
              </button>
              <button type="button" class="tool-btn" data-open-exhibit="${ex.id}" data-open-tab="chat">
                ${ICON("chat")}
                <span>Page Chat (${chatCount})</span>
              </button>
            </div>
          </div>
        </article>
      `);
    });

    mount.innerHTML = `<div class="chronological-stream">${blocks.join("")}</div>`;
    bindExhibitCardEvents(mount);
  }

  // 4. COURT FOIA RELEASE VIEW
  function renderFoiaSheetView(mount, exhibits) {
    mount.innerHTML = `
      <div class="foia-document-stack">
        ${exhibits
          .map(
            (ex, idx) => `
          <section class="foia-legal-page" style="--stagger-i:${Math.min(idx, 10)};" data-exhibit-id="${ex.id}">
            <div class="foia-court-header">
              Case 1:26-cv-00049-MF &nbsp; Document ${ex.order} &nbsp; Filed 10/15/26 &nbsp; Page ${ex.order} of 49
            </div>

            <div class="foia-page-grid">
              <div class="foia-scan-box" data-open-exhibit="${ex.id}" data-open-tab="saved" title="Click to inspect full scan">
                <img src="./${encodeURI(ex.filename)}" alt="${escapeHtmlAttr(ex.id)}" loading="lazy" />
              </div>

              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #999; padding-bottom:6px; margin-bottom:10px;">
                  <strong style="font-size:0.98rem;">EXHIBIT ${escapeHtml(ex.id)}: ${escapeHtml(ex.title.toUpperCase())}</strong>
                  <span class="rubber-stamp">UNSEALED</span>
                </div>

                <p style="font-size:0.79rem; margin:0 0 8px;">
                  <strong>INTERCEPT TIMESTAMP:</strong> ${escapeHtml(ex.dateLabel)} (${escapeHtml(ex.timeRange)})
                </p>
                <p style="font-size:0.81rem; line-height:1.5; margin:0 0 12px;">
                  <strong>FORENSIC FINDING:</strong> ${formatForensicText(ex.summary)}
                </p>

                <div style="background:#f3efe4; border:1px solid #888; padding:10px; font-size:0.77rem; line-height:1.55; white-space:pre-wrap;">${formatForensicText(ex.transcript)}</div>
              </div>
            </div>

            <div class="foia-bates-footer">
              <span>BATES NO. ${escapeHtml(ex.bates)}</span>
              <div style="display:flex; gap:8px;">
                <button type="button" class="card-action-btn" data-open-exhibit="${ex.id}" data-open-tab="chat">
                  ${ICON("chat", "icon-sm")} Chat (${(state.shared.chatsByExhibit[ex.id] || []).length})
                </button>
                <button type="button" class="card-action-btn btn-primary-inspect" data-open-exhibit="${ex.id}" data-open-tab="saved">
                  ${ICON("loupe", "icon-sm")} Inspect
                </button>
              </div>
            </div>
          </section>
        `
          )
          .join("")}
      </div>
    `;
    bindExhibitCardEvents(mount);
  }

  // 5. RED-STRING DETECTIVE CORKBOARD VIEW (WITH 3D HAND-TILT HOVER PHYSICS)
  function renderCorkboardView(mount, exhibits) {
    const rows = [];
    for (let i = 0; i < exhibits.length; i += 4) {
      rows.push(exhibits.slice(i, i + 4));
    }

    mount.innerHTML = `
      <div class="corkboard-container" id="corkboardStage">
        <svg class="corkboard-svg-layer" id="corkboardSvgLines"></svg>
        <div class="corkboard-nodes-layer">
          ${rows
            .map(
              (row) => `
            <div class="corkboard-row">
              ${row
                .map((ex) => {
                  const tilt = ((ex.order * 7) % 7) - 3;
                  return `
                    <div
                      class="cork-node"
                      style="--base-tilt:${tilt}deg; --stagger-i:${Math.min(ex.order, 16)};"
                      data-open-exhibit="${ex.id}"
                      data-open-tab="saved"
                    >
                      <div class="pushpin"></div>
                      <img src="./${encodeURI(ex.filename)}" alt="${escapeHtmlAttr(ex.id)}" loading="lazy" />
                      <div style="font-size:0.68rem; color:var(--stamp-red); font-weight:700;">
                        ${escapeHtml(ex.id)} • ${escapeHtml(ex.dateLabel)}
                      </div>
                      <div style="font-size:0.74rem; font-weight:700; margin-top:2px; line-height:1.25;">
                        ${escapeHtml(ex.title)}
                      </div>
                    </div>
                  `;
                })
                .join("")}
            </div>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    bindExhibitCardEvents(mount);
    bindCorkboardHandTilt(mount);
    requestAnimationFrame(drawCorkboardRedStrings);
  }

  function bindCorkboardHandTilt(container) {
    container.querySelectorAll(".cork-node").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const rect = card.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width; // 0..1
        const ny = (e.clientY - rect.top) / rect.height; // 0..1
        const ry = ((nx - 0.5) * 22).toFixed(2);
        const rx = ((0.5 - ny) * 18).toFixed(2);
        card.style.setProperty("--rx", `${rx}deg`);
        card.style.setProperty("--ry", `${ry}deg`);
        card.style.setProperty("--glare-x", `${(nx * 100).toFixed(1)}%`);
        card.style.setProperty("--glare-y", `${(ny * 100).toFixed(1)}%`);
      });

      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  function drawCorkboardRedStrings() {
    const svg = document.getElementById("corkboardSvgLines");
    const stage = document.getElementById("corkboardStage");
    if (!svg || !stage) return;

    const stageRect = stage.getBoundingClientRect();
    const cards = Array.from(stage.querySelectorAll(".cork-node"));
    if (cards.length < 2) {
      svg.innerHTML = "";
      return;
    }

    const lines = [];
    for (let i = 0; i < cards.length - 1; i++) {
      const r1 = cards[i].getBoundingClientRect();
      const r2 = cards[i + 1].getBoundingClientRect();
      const x1 = r1.left - stageRect.left + r1.width / 2;
      const y1 = r1.top - stageRect.top + 6;
      const x2 = r2.left - stageRect.left + r2.width / 2;
      const y2 = r2.top - stageRect.top + 6;
      lines.push(
        `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#dc2626" stroke-width="2.4" stroke-opacity="0.78" />`
      );
    }
    svg.innerHTML = lines.join("");
  }

  function bindExhibitCardEvents(container) {
    container.querySelectorAll("[data-open-exhibit]").forEach((el) => {
      el.addEventListener("click", (e) => {
        const exId = el.getAttribute("data-open-exhibit");
        if (!exId) return;
        e.stopPropagation();
        const tabAttr = el.getAttribute("data-open-tab") || "saved";
        const idx = EXHIBITS.findIndex((item) => item.id === exId);
        if (idx !== -1) {
          openLightbox(idx, tabAttr);
        }
      });
    });

    container.querySelectorAll("[data-pin-exhibit]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const exId = btn.getAttribute("data-pin-exhibit");
        togglePinExhibit(exId);
      });
    });
  }

  function togglePinExhibit(exId) {
    playForensicSound("click");
    if (state.pinnedSet.has(exId)) {
      state.pinnedSet.delete(exId);
    } else {
      state.pinnedSet.add(exId);
    }
    savePinnedState();
    renderToolbarButtons();
    renderExhibitsView();
    if (state.lightboxOpen) {
      updateLightboxPinButton();
    }
  }

  // ============================================================================
  // FORENSIC LIGHTBOX (DETECTIVE LIGHT-TABLE + ZOOM/PAN + REDACT/CHAT/LOG)
  // ============================================================================
  function openLightbox(index, requestedTab = "saved") {
    const dialog = document.getElementById("forensicLightbox");
    if (!dialog) return;

    playForensicSound("page_open");
    setTimeout(() => playForensicSound("stamp"), 150);

    state.currentExhibitIndex = Math.max(
      0,
      Math.min(EXHIBITS.length - 1, index)
    );
    state.lightboxOpen = true;
    toggleGlobalChatDrawer(false);
    const fabBtn = document.getElementById("globalChatFabBtn");
    if (fabBtn) fabBtn.hidden = true;

    const lockCheckbox = document.getElementById("lbLockZoomCheckbox");
    if (lockCheckbox) {
      lockCheckbox.checked = Boolean(state.lockZoom);
    }

    // Resolve sidebar tab from cookie unless explicitly opening chat
    const targetTab =
      requestedTab === "saved" ? getSavedSidebarTab() : requestedTab;
    if (requestedTab === "chat") {
      saveSidebarTabCookie("chat");
    }

    if (!dialog.open) {
      dialog.showModal();
    }

    switchSidebarTab(targetTab, false);
    if (state.lockZoom && state.zoomLevel > 1.02) {
      const { maxPanY } = getPanLimits();
      state.panX = 0;
      state.panY = maxPanY;
      applyZoomAndPanTransform();
    } else {
      resetZoomAndPan();
    }
    renderLightboxContent("none");
    renderFilmstrip();
    sendPresenceHeartbeat();
  }

  function closeLightbox() {
    const ex = EXHIBITS[state.currentExhibitIndex];
    if (ex && state.userProfile) {
      dispatchSharedAction({
        action: "cursor_leave",
        exhibitId: ex.id,
        userId: state.userProfile.id
      });
    }
    const dialog = document.getElementById("forensicLightbox");
    if (dialog && dialog.open) {
      dialog.close();
    }
    state.lightboxOpen = false;
    const fabBtn = document.getElementById("globalChatFabBtn");
    if (fabBtn) fabBtn.hidden = false;
    stopAutoplay();
    sendPresenceHeartbeat();
  }

  function navigateLightbox(delta) {
    const total = EXHIBITS.length;
    const prevEx = EXHIBITS[state.currentExhibitIndex];
    const nextIdx = (state.currentExhibitIndex + delta + total) % total;
    const direction = delta >= 0 ? "forward" : "backward";

    if (prevEx && state.userProfile) {
      dispatchSharedAction({
        action: "cursor_leave",
        exhibitId: prevEx.id,
        userId: state.userProfile.id
      });
    }

    playForensicSound("page_flip");
    setTimeout(() => playForensicSound("stamp"), 175);

    const performUpdate = () => {
      state.currentExhibitIndex = nextIdx;
      // Preserve the user's saved sidebar tab across pages
      switchSidebarTab(getSavedSidebarTab(), false);
      if (state.lockZoom && state.zoomLevel > 1.02) {
        // Keep the user's locked zoom level across pages and position at top of new page
        const { maxPanY } = getPanLimits();
        state.panX = 0;
        state.panY = maxPanY;
        applyZoomAndPanTransform();
      } else {
        resetZoomAndPan();
      }
      renderLightboxContent(direction);
      highlightActiveFilmstripThumb();
      sendPresenceHeartbeat();
    };

    if (document.startViewTransition) {
      document.startViewTransition({
        update: performUpdate,
        types: [direction]
      });
    } else {
      performUpdate();
    }
  }

  function renderLightboxContent(direction = "none") {
    const ex = EXHIBITS[state.currentExhibitIndex];
    if (!ex) return;

    const badge = document.getElementById("lbBadge");
    const title = document.getElementById("lbTitle");
    const meta = document.getElementById("lbMeta");
    const img = document.getElementById("lbImage");
    const miniMapImg = document.getElementById("lbMiniMapImg");
    const batesEl = document.getElementById("carrierPlateBates");
    const timeEl = document.getElementById("carrierPlateTime");
    const stampEl = document.getElementById("carrierStamp");
    const plate = document.getElementById("primaryCarrierPlate");
    const dossierPanel = document.getElementById("sidebarPanelDossier");

    if (badge) badge.textContent = `${ex.id} // ${ex.order} OF ${EXHIBITS.length}`;
    if (title) title.textContent = ex.title;
    if (meta) {
      meta.textContent = `${ex.bates} • ${ex.dateLabel} (${ex.timeRange}) • Phone: ${ex.phoneClock} (${ex.battery})`;
    }
    if (batesEl) batesEl.textContent = `${ex.bates} // ${ex.id}`;
    if (timeEl) {
      timeEl.textContent = `${ex.dateLabel} • ${ex.timeRange} [BAT ${ex.battery}]`;
    }

    if (stampEl) {
      stampEl.textContent = `DECLASSIFIED // ${ex.id}`;
      stampEl.style.animation = "none";
      void stampEl.offsetWidth;
      stampEl.style.animation = "";
    }

    if (plate) {
      plate.classList.remove(
        "inspect-anim-next",
        "inspect-anim-prev",
        "is-scanning"
      );
      void plate.offsetWidth;
      if (direction === "forward") {
        plate.classList.add("inspect-anim-next", "is-scanning");
      } else if (direction === "backward") {
        plate.classList.add("inspect-anim-prev", "is-scanning");
      } else {
        plate.classList.add("is-scanning");
      }
      setTimeout(() => playForensicSound("scan_inspect"), 85);
    }

    if (dossierPanel) {
      dossierPanel.classList.remove("sidebar-animate-in");
      void dossierPanel.offsetWidth;
      dossierPanel.classList.add("sidebar-animate-in");
    }

    const encodedSrc = `./${encodeURI(ex.filename)}`;
    if (miniMapImg) {
      miniMapImg.src = encodedSrc;
    }
    if (img) {
      img.src = encodedSrc;
      img.alt = `${ex.id} — ${ex.title}`;
      img.onload = () => {
        resizeAnnotationCanvas();
        renderSharedMarksOverlay(ex);
        renderMultiUserCursorsLayer(ex);
        if (state.lockZoom && state.zoomLevel > 1.02) {
          clampPanBounds();
          applyZoomAndPanTransform();
        } else {
          updateMiniMapRadar();
        }
      };
    }

    const nextEx = EXHIBITS[(state.currentExhibitIndex + 1) % EXHIBITS.length];
    const zoomContainer = document.getElementById("zoomPanContainer");
    const compImg = document.getElementById("lbCompImage");
    const compBates = document.getElementById("compPlateBates");
    const compStamp = document.getElementById("compStamp");

    if (zoomContainer) {
      zoomContainer.classList.toggle("compare-mode-active", state.compareActive);
    }
    if (nextEx && compImg) {
      compImg.src = `./${encodeURI(nextEx.filename)}`;
      if (compBates) compBates.textContent = `${nextEx.id} (${nextEx.bates})`;
      if (compStamp) compStamp.textContent = `OVERLAP CHECK // ${nextEx.id}`;
    }

    const contEl = document.getElementById("lbContinuity");
    const sumEl = document.getElementById("lbSummary");
    const quoteEl = document.getElementById("lbQuote");
    const transEl = document.getElementById("lbTranscript");
    const noteEl = document.getElementById("lbInvestigatorNote");
    const fileEl = document.getElementById("lbFilename");

    if (contEl) {
      contEl.textContent =
        ex.continuityBridge ||
        `Verified chronological transition for Exhibit ${ex.id}.`;
    }
    if (sumEl) sumEl.innerHTML = formatForensicText(ex.summary);
    if (quoteEl) quoteEl.innerHTML = formatForensicText(ex.keyQuote);
    if (transEl) transEl.innerHTML = formatForensicText(ex.transcript);
    if (fileEl) fileEl.textContent = ex.filename;

    if (noteEl) {
      const savedNote = state.shared.notesByExhibit[ex.id];
      noteEl.value = savedNote ? savedNote.text : "";
    }

    updateLightboxPinButton();
    renderLightboxChat(ex);
    renderGlobalChat();
    renderSharedMarksOverlay(ex);
    renderMultiUserCursorsLayer(ex);
    renderSidebarAuditLog();
  }

  function updateLightboxPinButton() {
    const ex = EXHIBITS[state.currentExhibitIndex];
    const btn = document.getElementById("lbPinBtn");
    if (!btn || !ex) return;
    const pinned = state.pinnedSet.has(ex.id);
    btn.classList.toggle("is-active", pinned);
    btn.innerHTML = `${ICON("pin")} <span>${pinned ? "Pinned" : "Pin"}</span>`;
  }

  function renderFilmstrip() {
    const strip = document.getElementById("lbFilmstrip");
    if (!strip) return;

    strip.innerHTML = EXHIBITS.map(
      (ex, idx) => `
      <div
        class="filmstrip-thumb ${idx === state.currentExhibitIndex ? "is-active" : ""}"
        data-filmstrip-idx="${idx}"
        title="${escapeHtmlAttr(ex.id)}: ${escapeHtmlAttr(ex.title)}"
      >
        <img src="./${encodeURI(ex.filename)}" alt="${escapeHtmlAttr(ex.id)}" loading="lazy" />
        <span>${escapeHtml(ex.id)}</span>
        ${ex.severity === "critical" ? `<span class="filmstrip-critical-dot"></span>` : ""}
      </div>
    `
    ).join("");

    strip.querySelectorAll(".filmstrip-thumb").forEach((thumb) => {
      thumb.addEventListener("click", () => {
        const targetIdx = Number(thumb.getAttribute("data-filmstrip-idx"));
        if (targetIdx !== state.currentExhibitIndex) {
          navigateLightbox(targetIdx - state.currentExhibitIndex);
        }
      });
    });

    highlightActiveFilmstripThumb();
  }

  function highlightActiveFilmstripThumb() {
    const strip = document.getElementById("lbFilmstrip");
    if (!strip) return;
    strip.querySelectorAll(".filmstrip-thumb").forEach((el, idx) => {
      const active = idx === state.currentExhibitIndex;
      el.classList.toggle("is-active", active);
      if (active) {
        el.scrollIntoView({
          behavior: "smooth",
          inline: "center",
          block: "nearest"
        });
      }
    });
  }

  // ============================================================================
  // UPGRADED ZOOM & PAN ENGINE + "READ 2X" FIT + INTERACTIVE MINI-MAP RADAR
  // ============================================================================
  function getPanLimits() {
    const plate = document.getElementById("primaryCarrierPlate");
    const viewport = document.getElementById("lbViewport");
    if (!plate || !viewport) {
      return { maxPanX: 250, maxPanY: 380 };
    }
    const scaledW = plate.offsetWidth * state.zoomLevel;
    const scaledH = plate.offsetHeight * state.zoomLevel;
    const viewW = viewport.clientWidth - 40;
    const viewH = viewport.clientHeight - 54;

    const maxPanX =
      state.zoomLevel <= 1.01
        ? 0
        : Math.max(80, (scaledW - viewW) / 2 + 70);
    const maxPanY =
      state.zoomLevel <= 1.01
        ? 0
        : Math.max(120, (scaledH - viewH) / 2 + 80);

    return { maxPanX, maxPanY };
  }

  function resetZoomAndPan() {
    state.zoomLevel = 1;
    state.panX = 0;
    state.panY = 0;
    applyZoomAndPanTransform();
  }

  function activateReadWidthZoom() {
    playForensicSound("click");
    if (Math.abs(state.zoomLevel - 2.2) < 0.15) {
      resetZoomAndPan();
      return;
    }
    state.zoomLevel = 2.2;
    state.panX = 0;
    const { maxPanY } = getPanLimits();
    // Position right at the top of the WhatsApp conversation so the user can read downward
    state.panY = maxPanY;
    applyZoomAndPanTransform();
  }

  function setZoomLevel(newZoom, focusOffsetX = 0, focusOffsetY = 0) {
    const prevZoom = state.zoomLevel;
    const clamped = Math.max(1, Math.min(4, Number(newZoom.toFixed(2))));

    if (clamped <= 1.01) {
      state.zoomLevel = 1;
      state.panX = 0;
      state.panY = 0;
    } else {
      const scaleRatio = clamped / prevZoom;
      state.panX = state.panX * scaleRatio - focusOffsetX * (scaleRatio - 1);
      state.panY = state.panY * scaleRatio - focusOffsetY * (scaleRatio - 1);
      state.zoomLevel = clamped;
      clampPanBounds();
    }

    applyZoomAndPanTransform();
  }

  function panByDelta(dx, dy) {
    state.panX += dx;
    state.panY += dy;
    clampPanBounds();
    applyZoomAndPanTransform();
  }

  function jumpToVerticalEdge(edge) {
    if (state.zoomLevel < 1.45 && (edge === "top" || edge === "bottom")) {
      state.zoomLevel = 2.1;
    }
    const { maxPanY } = getPanLimits();
    if (edge === "top") {
      state.panY = maxPanY;
    } else if (edge === "bottom") {
      state.panY = -maxPanY;
    } else {
      state.panX = 0;
      state.panY = 0;
    }
    applyZoomAndPanTransform();
  }

  function clampPanBounds() {
    const { maxPanX, maxPanY } = getPanLimits();
    state.panX = Math.max(-maxPanX, Math.min(maxPanX, state.panX));
    state.panY = Math.max(-maxPanY, Math.min(maxPanY, state.panY));
  }

  function applyZoomAndPanTransform() {
    const container = document.getElementById("zoomPanContainer");
    const slider = document.getElementById("lbZoomSlider");
    const readout = document.getElementById("lbZoomReadout");
    const hud = document.getElementById("hudCoordsReadout");
    const readWidthBtn = document.getElementById("lbZoomReadWidthBtn");

    const pct = Math.round(state.zoomLevel * 100);
    if (container) {
      container.style.transform = `translate3d(${state.panX.toFixed(1)}px, ${state.panY.toFixed(1)}px, 0) scale(${state.zoomLevel})`;
    }
    if (slider) slider.value = String(pct);
    if (readout) readout.textContent = `${pct}%`;
    if (readWidthBtn) {
      readWidthBtn.classList.toggle(
        "is-active",
        Math.abs(state.zoomLevel - 2.2) < 0.15
      );
    }
    if (hud) {
      hud.textContent = `PAN X:${Math.round(state.panX)} Y:${Math.round(state.panY)} // MAG: ${pct}%`;
    }
    updateMiniMapRadar();
  }

  function updateMiniMapRadar() {
    const miniMap = document.getElementById("lbMiniMap");
    const rectEl = document.getElementById("lbMiniMapRect");
    if (!miniMap || !rectEl) return;

    miniMap.hidden = false;

    if (state.zoomLevel <= 1.04) {
      rectEl.style.height = "100%";
      rectEl.style.width = "100%";
      rectEl.style.top = "0%";
      rectEl.style.left = "0%";
      return;
    }

    const { maxPanX, maxPanY } = getPanLimits();
    const visibleHeightPct = Math.max(
      18,
      Math.min(100, (1 / state.zoomLevel) * 100)
    );
    const visibleWidthPct = Math.max(
      35,
      Math.min(100, (1 / state.zoomLevel) * 100)
    );

    // normY: 0 when at top (panY = +maxPanY), 1 when at bottom (panY = -maxPanY)
    const normY =
      maxPanY > 0
        ? Math.max(0, Math.min(1, (maxPanY - state.panY) / (2 * maxPanY)))
        : 0.5;
    const normX =
      maxPanX > 0
        ? Math.max(0, Math.min(1, (maxPanX - state.panX) / (2 * maxPanX)))
        : 0.5;

    const topPct = normY * (100 - visibleHeightPct);
    const leftPct = normX * (100 - visibleWidthPct);

    rectEl.style.height = `${visibleHeightPct.toFixed(1)}%`;
    rectEl.style.width = `${visibleWidthPct.toFixed(1)}%`;
    rectEl.style.top = `${topPct.toFixed(1)}%`;
    rectEl.style.left = `${leftPct.toFixed(1)}%`;
  }

  function scrubMiniMapFromPointer(e) {
    const track = document.getElementById("lbMiniMapTrack");
    if (!track) return;
    if (state.zoomLevel <= 1.04) {
      state.zoomLevel = 1.65;
    }
    const rect = track.getBoundingClientRect();
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const { maxPanX, maxPanY } = getPanLimits();
    state.panY = maxPanY - ny * (2 * maxPanY);
    state.panX = maxPanX - nx * (2 * maxPanX);
    clampPanBounds();
    applyZoomAndPanTransform();
  }

  // ============================================================================
  // MULTI-USER COLORED PENCIL, REDACT & HIGHLIGHT STUDIO + FLOATING CURSOR AVATAR
  // ============================================================================
  let cursorFollowerTargetX = 0;
  let cursorFollowerTargetY = 0;
  let cursorFollowerCurrentX = 0;
  let cursorFollowerCurrentY = 0;
  let cursorFollowerRafId = null;
  let cursorFollowerInitialized = false;

  function stepCursorFollowerLerp() {
    const follower = document.getElementById("localToolCursorFollower");
    if (!follower || follower.hidden) {
      cursorFollowerRafId = null;
      return;
    }
    const dx = cursorFollowerTargetX - cursorFollowerCurrentX;
    const dy = cursorFollowerTargetY - cursorFollowerCurrentY;
    cursorFollowerCurrentX += dx * 0.42;
    cursorFollowerCurrentY += dy * 0.42;
    follower.style.transform = `translate3d(${cursorFollowerCurrentX.toFixed(1)}px, ${cursorFollowerCurrentY.toFixed(1)}px, 0)`;

    if (Math.hypot(dx, dy) > 0.35) {
      cursorFollowerRafId = requestAnimationFrame(stepCursorFollowerLerp);
    } else {
      cursorFollowerCurrentX = cursorFollowerTargetX;
      cursorFollowerCurrentY = cursorFollowerTargetY;
      follower.style.transform = `translate3d(${cursorFollowerTargetX.toFixed(1)}px, ${cursorFollowerTargetY.toFixed(1)}px, 0)`;
      cursorFollowerRafId = null;
    }
  }

  function refreshLocalCursorFollowerBadge() {
    const follower = document.getElementById("localToolCursorFollower");
    if (!follower) return;
    if (!state.drawMode || !state.userProfile) {
      follower.hidden = true;
      cursorFollowerInitialized = false;
      return;
    }

    const accent =
      state.drawMode === "redact"
        ? "#ef4444"
        : getInkHexColor(state.activeHighlightColor);
    const modeLabel =
      state.drawMode === "pencil"
        ? `PENCIL${state.pencilArrowTip ? " + ARROW" : ""}`
        : state.drawMode === "highlight"
        ? "HIGHLIGHTER"
        : "REDACT STAMP";

    follower.style.setProperty("--cursor-accent", accent);
    follower.innerHTML = `
      <span class="detective-avatar-frame">${renderAvatarHtml(state.userProfile)}</span>
      <div class="tool-cursor-meta">
        <span class="tool-cursor-name">${escapeHtml(state.userProfile.name)}</span>
        <span class="tool-cursor-mode"><span class="tool-cursor-dot"></span>${escapeHtml(modeLabel)}</span>
      </div>
    `;
  }

  function updateLocalCursorFollowerPosition(clientX, clientY) {
    const follower = document.getElementById("localToolCursorFollower");
    const viewport = document.getElementById("lbViewport");
    if (!follower || !viewport) return;
    if (!state.drawMode || !state.userProfile) {
      follower.hidden = true;
      cursorFollowerInitialized = false;
      return;
    }
    const vRect = viewport.getBoundingClientRect();
    if (
      clientX < vRect.left ||
      clientX > vRect.right ||
      clientY < vRect.top ||
      clientY > vRect.bottom
    ) {
      follower.hidden = true;
      cursorFollowerInitialized = false;
      return;
    }
    const wasHidden = follower.hidden;
    follower.hidden = false;
    cursorFollowerTargetX = clientX - vRect.left + 14;
    cursorFollowerTargetY = clientY - vRect.top + 14;

    if (!cursorFollowerInitialized || wasHidden) {
      cursorFollowerCurrentX = cursorFollowerTargetX;
      cursorFollowerCurrentY = cursorFollowerTargetY;
      cursorFollowerInitialized = true;
      follower.style.transform = `translate3d(${cursorFollowerTargetX.toFixed(1)}px, ${cursorFollowerTargetY.toFixed(1)}px, 0)`;
    } else if (!cursorFollowerRafId) {
      cursorFollowerRafId = requestAnimationFrame(stepCursorFollowerLerp);
    }
  }

  function broadcastCursorPosition(normX, normY, activePoints = null, force = false) {
    if (!state.lightboxOpen || !state.drawMode || !state.userProfile) return;
    const now = Date.now();
    if (!force && now - state.lastCursorBroadcastTs < 110) return;
    state.lastCursorBroadcastTs = now;

    const ex = EXHIBITS[state.currentExhibitIndex];
    if (!ex) return;

    dispatchSharedAction({
      action: "cursor_update",
      exhibitId: ex.id,
      userId: state.userProfile.id,
      userName: state.userProfile.name,
      avatarId: state.userProfile.avatarId,
      customAvatarUrl: state.userProfile.customAvatarUrl,
      tool: state.drawMode,
      color: state.activeHighlightColor,
      x: Number(normX.toFixed(4)),
      y: Number(normY.toFixed(4)),
      activePoints: Array.isArray(activePoints)
        ? activePoints.slice(-90)
        : null
    });
  }

  function renderMultiUserCursorsLayer(ex) {
    const layer = document.getElementById("multiUserCursorsLayer");
    if (!layer || !ex) return;

    const cursorMap = (state.shared.cursorsByExhibit || {})[ex.id] || {};
    const now = Date.now();
    const myId = state.userProfile?.id;

    const remoteEntries = Object.values(cursorMap).filter(
      (c) => c && c.userId && c.userId !== myId && now - (c.ts || 0) <= 14000
    );

    if (remoteEntries.length === 0) {
      if (layer.dataset.lastSig !== "") {
        layer.dataset.lastSig = "";
        layer.innerHTML = "";
      }
      return;
    }

    const svgStrokes = [];
    const cursorBadges = [];

    remoteEntries.forEach((c) => {
      const hex =
        c.tool === "redact" ? "#ef4444" : getInkHexColor(c.color || "yellow");
      const leftPct = Math.max(0, Math.min(100, Number(c.x || 0) * 100));
      const topPct = Math.max(0, Math.min(100, Number(c.y || 0) * 100));
      const toolLabel =
        c.tool === "pencil"
          ? "PENCIL"
          : c.tool === "highlight"
          ? "HIGHLIGHT"
          : "REDACT";

      if (Array.isArray(c.activePoints) && c.activePoints.length >= 2) {
        const d = c.activePoints
          .map(
            (pt, idx) =>
              `${idx === 0 ? "M" : "L"} ${(Number(pt[0]) * 100).toFixed(2)} ${(Number(pt[1]) * 100).toFixed(2)}`
          )
          .join(" ");
        svgStrokes.push(
          `<path d="${d}" fill="none" stroke="${hex}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`
        );
      }

      cursorBadges.push(`
        <div class="remote-user-cursor" style="left:${leftPct.toFixed(2)}%; top:${topPct.toFixed(2)}%; --remote-color:${hex};">
          <span class="detective-avatar-frame">${renderAvatarHtml(c)}</span>
          <div class="tool-cursor-meta">
            <span class="tool-cursor-name">${escapeHtml(c.userName || "Detective")}</span>
            <span class="tool-cursor-mode" style="color:${hex};"><span class="tool-cursor-dot" style="background:${hex}; box-shadow:0 0 6px ${hex};"></span>${escapeHtml(toolLabel)}</span>
          </div>
        </div>
      `);
    });

    const liveSvgHtml =
      svgStrokes.length > 0
        ? `<svg class="mark-pencil-svg" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%;">${svgStrokes.join("")}</svg>`
        : "";

    const combinedHtml = `${liveSvgHtml}${cursorBadges.join("")}`;
    if (layer.dataset.lastSig === combinedHtml) return;
    layer.dataset.lastSig = combinedHtml;
    layer.innerHTML = combinedHtml;
  }

  function setDrawMode(mode) {
    playForensicSound("click");
    const nextMode = state.drawMode === mode ? null : mode;
    const prevMode = state.drawMode;
    state.drawMode = nextMode;

    if (!nextMode && prevMode && state.lightboxOpen && state.userProfile) {
      const ex = EXHIBITS[state.currentExhibitIndex];
      if (ex) {
        dispatchSharedAction({
          action: "cursor_leave",
          exhibitId: ex.id,
          userId: state.userProfile.id
        });
      }
    }

    const pencilBtn = document.getElementById("lbDrawPencilBtn");
    const redactBtn = document.getElementById("lbDrawRedactBtn");
    const highlightBtn = document.getElementById("lbDrawHighlightBtn");
    const canvas = document.getElementById("annotationCanvas");
    const subBar = document.getElementById("annotationSubBar");
    const redactGroup = document.getElementById("redactStyleGroup");
    const highlightGroup = document.getElementById("highlightColorGroup");
    const pencilGroup = document.getElementById("pencilStyleGroup");

    if (pencilBtn) {
      pencilBtn.classList.toggle("is-active", state.drawMode === "pencil");
    }
    if (redactBtn) {
      redactBtn.classList.toggle("is-active", state.drawMode === "redact");
    }
    if (highlightBtn) {
      highlightBtn.classList.toggle("is-active", state.drawMode === "highlight");
    }
    if (canvas) {
      canvas.classList.toggle("drawing-enabled", Boolean(state.drawMode));
    }
    if (subBar) {
      subBar.hidden = !state.drawMode;
    }
    if (redactGroup) {
      redactGroup.hidden = state.drawMode !== "redact";
    }
    if (highlightGroup) {
      highlightGroup.hidden =
        state.drawMode !== "highlight" && state.drawMode !== "pencil";
    }
    if (pencilGroup) {
      pencilGroup.hidden = state.drawMode !== "pencil";
    }

    refreshLocalCursorFollowerBadge();
  }

  function undoLastMarkOnCurrentExhibit() {
    const ex = EXHIBITS[state.currentExhibitIndex];
    if (!ex) return;
    const list = state.shared.marksByExhibit[ex.id] || [];
    if (list.length === 0) return;
    const lastMark = list[list.length - 1];
    playForensicSound("click");
    dispatchSharedAction({
      action: "delete_mark",
      exhibitId: ex.id,
      markId: lastMark.id,
      userId: state.userProfile.id,
      userName: state.userProfile.name,
      avatarId: state.userProfile.avatarId,
      customAvatarUrl: state.userProfile.customAvatarUrl
    });
  }

  function resizeAnnotationCanvas() {
    const img = document.getElementById("lbImage");
    const canvas = document.getElementById("annotationCanvas");
    if (!img || !canvas) return;
    canvas.width = img.clientWidth || 360;
    canvas.height = img.clientHeight || 640;
  }

  function renderSharedMarksOverlay(ex) {
    const layer = document.getElementById("sharedMarksLayer");
    if (!layer || !ex || state.activeMarkInteraction) return;

    const marks = state.shared.marksByExhibit[ex.id] || [];
    const html = marks
      .map((m) => {
        const style = `left:${(m.x * 100).toFixed(2)}%; top:${(m.y * 100).toFixed(2)}%; width:${(m.w * 100).toFixed(2)}%; height:${(m.h * 100).toFixed(2)}%;`;
        const authorTag = `<span class="mark-author-tag">${escapeHtml(m.userName || "Detective")}</span>`;
        const deleteBtn = `<button type="button" class="mark-delete-btn" data-delete-mark="${escapeHtmlAttr(m.id)}" title="Delete this mark">×</button>`;
        const resizeHandle = `<span class="mark-resize-handle" data-resize-mark="${escapeHtmlAttr(m.id)}" title="Drag corner to resize"></span>`;

        if (m.type === "pencil") {
          return `
            <div class="shared-mark-box mark-pencil" data-mark-id="${escapeHtmlAttr(m.id)}" style="${style}" title="Pencil stroke by ${escapeHtmlAttr(m.userName || "Detective")} • Drag to move • Click × to delete">
              ${buildPencilSvgHtml(m)}
              ${authorTag}
              ${deleteBtn}
            </div>
          `;
        }

        if (m.type === "highlight") {
          const colorClass = `hl-${m.color || "yellow"}`;
          return `
            <div class="shared-mark-box mark-highlight ${escapeHtmlAttr(colorClass)}" data-mark-id="${escapeHtmlAttr(m.id)}" style="${style}" title="Drag to move • Drag bottom-right corner to resize">
              ${authorTag}
              ${deleteBtn}
              ${resizeHandle}
            </div>
          `;
        }

        const labelText = m.label !== undefined ? m.label : "REDACTED";
        return `
          <div class="shared-mark-box mark-redact" data-mark-id="${escapeHtmlAttr(m.id)}" style="${style}" title="Drag to move • Drag bottom-right corner to resize">
            <span>${escapeHtml(labelText)}</span>
            ${authorTag}
            ${deleteBtn}
            ${resizeHandle}
          </div>
        `;
      })
      .join("");

    if (layer.dataset.lastSig === html) return;
    layer.dataset.lastSig = html;
    layer.innerHTML = html;

    // Delete button click
    layer.querySelectorAll("[data-delete-mark]").forEach((btn) => {
      btn.addEventListener("pointerdown", (e) => e.stopPropagation());
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const markId = btn.getAttribute("data-delete-mark");
        if (!markId) return;
        playForensicSound("click");
        dispatchSharedAction({
          action: "delete_mark",
          exhibitId: ex.id,
          markId,
          userId: state.userProfile.id,
          userName: state.userProfile.name,
          avatarId: state.userProfile.avatarId,
          customAvatarUrl: state.userProfile.customAvatarUrl
        });
      });
    });

    // Drag-to-move or Corner-resize on existing marks
    layer.querySelectorAll(".shared-mark-box").forEach((box) => {
      box.addEventListener("pointerdown", (e) => {
        if (e.button !== 0 || e.target.closest("[data-delete-mark]")) return;
        e.stopPropagation();
        const markId = box.getAttribute("data-mark-id");
        const markObj = (state.shared.marksByExhibit[ex.id] || []).find(
          (item) => item.id === markId
        );
        if (!markObj) return;

        const isResize = Boolean(e.target.closest("[data-resize-mark]"));
        box.classList.add("is-selected");
        state.activeMarkInteraction = {
          type: isResize ? "resize" : "move",
          markId,
          exhibitId: ex.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          origX: markObj.x,
          origY: markObj.y,
          origW: markObj.w,
          origH: markObj.h,
          curX: markObj.x,
          curY: markObj.y,
          curW: markObj.w,
          curH: markObj.h,
          boxEl: box
        };
        box.setPointerCapture?.(e.pointerId);
      });

      box.addEventListener("pointermove", (e) => {
        const act = state.activeMarkInteraction;
        if (!act || act.boxEl !== box) return;
        e.stopPropagation();
        const layerRect = layer.getBoundingClientRect();
        if (!layerRect.width || !layerRect.height) return;

        const dxNorm = (e.clientX - act.startClientX) / layerRect.width;
        const dyNorm = (e.clientY - act.startClientY) / layerRect.height;

        if (act.type === "move") {
          act.curX = Math.max(0, Math.min(1 - act.origW, act.origX + dxNorm));
          act.curY = Math.max(0, Math.min(1 - act.origH, act.origY + dyNorm));
        } else {
          act.curW = Math.max(
            0.02,
            Math.min(1 - act.origX, act.origW + dxNorm)
          );
          act.curH = Math.max(
            0.015,
            Math.min(1 - act.origY, act.origH + dyNorm)
          );
        }

        box.style.left = `${(act.curX * 100).toFixed(2)}%`;
        box.style.top = `${(act.curY * 100).toFixed(2)}%`;
        box.style.width = `${(act.curW * 100).toFixed(2)}%`;
        box.style.height = `${(act.curH * 100).toFixed(2)}%`;
      });

      const finishMarkInteraction = (e) => {
        const act = state.activeMarkInteraction;
        if (!act || act.boxEl !== box) return;
        e.stopPropagation();
        box.classList.remove("is-selected");
        state.activeMarkInteraction = null;

        const changed =
          Math.abs(act.curX - act.origX) > 0.002 ||
          Math.abs(act.curY - act.origY) > 0.002 ||
          Math.abs(act.curW - act.origW) > 0.002 ||
          Math.abs(act.curH - act.origH) > 0.002;

        if (changed) {
          playForensicSound("click");
          dispatchSharedAction({
            action: "update_mark",
            exhibitId: act.exhibitId,
            markId: act.markId,
            patch: {
              x: Number(act.curX.toFixed(4)),
              y: Number(act.curY.toFixed(4)),
              w: Number(act.curW.toFixed(4)),
              h: Number(act.curH.toFixed(4))
            },
            userId: state.userProfile.id,
            userName: state.userProfile.name,
            avatarId: state.userProfile.avatarId,
            customAvatarUrl: state.userProfile.customAvatarUrl
          });
        }
      };

      box.addEventListener("pointerup", finishMarkInteraction);
      box.addEventListener("pointercancel", finishMarkInteraction);
    });
  }

  // ============================================================================
  // PER-PAGE LIVE DETECTIVE CHAT & COOKIE-SAVED SIDEBAR TAB + DELETE OWN MESSAGE
  // ============================================================================
  const GIPHY_PUBLIC_API_KEY = "GlVGYHkr3WSBnllca54iNt0yFbjz7L65";

  const CURATED_GIFS_BY_CATEGORY = {
    unhinged: [
      { id: "kUo63tSytK1k4", title: "Walter White Collapse" },
      { id: "l0IylOPCNkiqOgMyA", title: "Charlie Day Conspiracy" },
      { id: "s5wFafpHxqKbIEERl9", title: "Speed Holding Laugh" },
      { id: "h3oVuFhMh6dZbAXigo", title: "Homelander Unhinged Stare" },
      { id: "QnwhZzo7g3yHXnX6PT", title: "Saul Goodman 3D" },
      { id: "3YuR0bdGXlP6U", title: "Patrick Bateman Stare" },
      { id: "f3foFwyuZGWHMtyA8s", title: "Walter Screaming in Car" },
      { id: "XzJJaNFsRnJlhOUVFy", title: "IShowSpeed Trying Not To Laugh" },
      { id: "IZ0IshI0uKhQgXuCVx", title: "Homelander Eye Twitch" },
      { id: "d6xAHHirkPBTJlaGE5", title: "Pepe Silvia Panic" }
    ],
    sus: [
      { id: "MVoX99cLXXU0gq7QuG", title: "Doakes Stare" },
      { id: "lf5zfD1fYZmvGraZg0", title: "Surprise Doakes" },
      { id: "ACZqfCpSGhG8h6HRV6", title: "Rock Eyebrow Raise" },
      { id: "dLhoOYRmsJVOhKbyTK", title: "Caught in 4K Camera" },
      { id: "H5C8CevNMbpBqNqFjl", title: "Side Eye Monkey" },
      { id: "2PDAWO2juLlN5pQqmb", title: "Suspicious Squint" },
      { id: "JaNtIG4UnKzD2", title: "Rock Taking Off Glasses" },
      { id: "1rjEPbv5qlEX82ocC6", title: "Caught Red Handed" }
    ],
    cooked: [
      { id: "ltoVrEYgv30GJvSDOk", title: "Shaq Timeout" },
      { id: "Btnye7ETaBO3HjBGCa", title: "Shocked Stare" },
      { id: "26FPzgftlRfgwkEw0", title: "Crying Jordan" },
      { id: "gqnJhylmhj7AxiZwI9", title: "Skeleton Explosion" },
      { id: "jmSjPi6soIoQCFwaXJ", title: "FBI Open Up" },
      { id: "IYjcAIri8C7f8LvLor", title: "Oh No Shocked" },
      { id: "rhYsUMhhd6yA0", title: "Mind Blown Nuclear" },
      { id: "0g75kK2gtijxwlClCX", title: "Calm Down Timeout" }
    ]
  };

  function isDirectMediaUrl(str) {
    if (!str || typeof str !== "string") return false;
    const s = str.trim();
    if (s.startsWith("data:image/")) return true;
    if (!/^https?:\/\/\S+$/i.test(s)) return false;
    return (
      /\.(gif|png|jpe?g|webp|avif)(\?.*)?$/i.test(s) ||
      /media\d*\.giphy\.com\/media\//i.test(s) ||
      /media\.tenor\.com\//i.test(s) ||
      /c\.tenor\.com\//i.test(s) ||
      /i\.imgur\.com\//i.test(s)
    );
  }

  const CHAT_GROUP_BUFFER_MS = 3 * 60 * 1000; // 3-minute continuous message grouping buffer

  function areChatMessagesGrouped(prev, curr) {
    if (!prev || !curr) return false;
    const sameSender =
      (prev.userId && curr.userId && prev.userId === curr.userId) ||
      (prev.userName && curr.userName && prev.userName === curr.userName);
    if (!sameSender) return false;
    const deltaMs = Math.abs((curr.ts || 0) - (prev.ts || 0));
    return deltaMs <= CHAT_GROUP_BUFFER_MS;
  }

  function renderChatMessagesHtml(chats, exhibitId) {
    if (!chats || chats.length === 0) {
      return `
        <div class="chat-empty-state">
          <div class="chat-empty-stamp">ENCRYPTED CHANNEL READY</div>
          <div>No messages in <strong>${escapeHtml(exhibitId)}</strong> yet.<br/>Drop a text, picture, or GIF below.</div>
        </div>
      `;
    }

    const myId = state.userProfile?.id;
    const myName = state.userProfile?.name;

    return chats
      .map((m, idx) => {
        const isMine =
          Boolean(myId && m.userId && m.userId === myId) ||
          Boolean(myName && m.userName && m.userName === myName);

        const prevMsg = idx > 0 ? chats[idx - 1] : null;
        const nextMsg = idx < chats.length - 1 ? chats[idx + 1] : null;
        const isGroupStart = !areChatMessagesGrouped(prevMsg, m);
        const isGroupEnd = !areChatMessagesGrouped(m, nextMsg);

        const rawText = (m.text || "").trim();
        const textIsMedia = !m.mediaUrl && isDirectMediaUrl(rawText);
        const effectiveMediaUrl = m.mediaUrl || (textIsMedia ? rawText : null);
        const displayCaption = textIsMedia ? "" : rawText;

        const replySnippetText = displayCaption
          ? displayCaption.slice(0, 90)
          : effectiveMediaUrl
          ? "📷 [GIF / Photo]"
          : "";

        const quotedHtml =
          m.replyTo && (m.replyTo.text || m.replyTo.userName)
            ? `
              <div class="chat-quoted-reply" data-jump-chat-id="${escapeHtmlAttr(m.replyTo.id || "")}" title="Jump to original message">
                <span class="chat-quoted-author">${escapeHtml(m.replyTo.userName || "Detective")}</span>
                <span class="chat-quoted-text">${escapeHtml(m.replyTo.text || "📷 [GIF / Photo]")}</span>
              </div>
            `
            : "";

        const mediaHtml = effectiveMediaUrl
          ? `
            <div class="chat-msg-media-wrap">
              <img
                src="${escapeHtmlAttr(effectiveMediaUrl)}"
                alt="Chat media"
                class="chat-msg-media-img"
                loading="lazy"
                data-open-media="${escapeHtmlAttr(effectiveMediaUrl)}"
              />
            </div>
          `
          : "";

        const groupClasses = [
          isMine ? "is-own-msg" : "is-other-msg",
          isGroupStart ? "is-group-start" : "is-group-continuation",
          isGroupEnd ? "is-group-end" : "is-group-middle"
        ].join(" ");

        return `
        <div class="chat-msg-item ${groupClasses}" data-chat-msg-id="${escapeHtmlAttr(m.id || "")}">
          <div class="chat-avatar-col">
            ${
              isGroupStart
                ? `<span class="detective-avatar-frame chat-avatar-pill" title="${escapeHtmlAttr(m.userName || "Detective")}">${renderAvatarHtml(m)}</span>`
                : ""
            }
            <span class="chat-msg-time-outside">${escapeHtml(formatRelativeTime(m.ts))}</span>
          </div>
          <div class="chat-msg-stack">
            ${
              isGroupStart
                ? `<div class="chat-sender-label-outside">${escapeHtml(m.userName || "Detective")}</div>`
                : ""
            }
            <div class="chat-msg-bubble-row">
              <div class="chat-msg-body ${effectiveMediaUrl && !displayCaption ? "is-media-only" : ""}">
                ${quotedHtml}
                ${mediaHtml}
                ${
                  displayCaption
                    ? `<div class="chat-msg-text">${escapeHtml(displayCaption)}</div>`
                    : ""
                }
              </div>
              <div class="chat-msg-actions">
                <button
                  type="button"
                  class="chat-reply-btn"
                  data-reply-chat="${escapeHtmlAttr(m.id || "")}"
                  data-reply-author="${escapeHtmlAttr(m.userName || "Detective")}"
                  data-reply-text="${escapeHtmlAttr(replySnippetText)}"
                  data-chat-exhibit="${escapeHtmlAttr(exhibitId)}"
                  title="Reply"
                >↩</button>
                ${
                  isMine && m.id
                    ? `<button type="button" class="chat-delete-btn" data-delete-chat="${escapeHtmlAttr(m.id)}" data-chat-exhibit="${escapeHtmlAttr(exhibitId)}" title="Delete message">×</button>`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
      `;
      })
      .join("");
  }

  function updateChatReplyBanners(activeExhibitId) {
    const r = state.replyingToChat;
    const pageBanners = [
      document.getElementById("lbChatReplyBanner"),
      document.getElementById("binderChatReplyBanner")
    ];
    const globalBanners = [
      document.getElementById("globalChatReplyBanner"),
      document.getElementById("lbGlobalChatReplyBanner")
    ];

    pageBanners.forEach((banner) => {
      if (!banner) return;
      if (
        !r ||
        r.exhibitId === "GLOBAL" ||
        (activeExhibitId &&
          activeExhibitId !== "GLOBAL" &&
          r.exhibitId !== activeExhibitId)
      ) {
        banner.hidden = true;
        banner.innerHTML = "";
        return;
      }
      banner.hidden = false;
      banner.innerHTML = `
        <div class="chat-reply-banner-info">
          <span class="chat-reply-banner-tag">↩ Replying to ${escapeHtml(r.userName || "Detective")}</span>
          <span class="chat-reply-banner-snippet">${escapeHtml(r.text || "📷 [GIF / Photo]")}</span>
        </div>
        <button type="button" class="chat-reply-cancel-btn" data-cancel-reply title="Cancel reply">×</button>
      `;
      banner
        .querySelector("[data-cancel-reply]")
        ?.addEventListener("click", () => {
          playForensicSound("click");
          state.replyingToChat = null;
          updateChatReplyBanners(activeExhibitId);
        });
    });

    globalBanners.forEach((banner) => {
      if (!banner) return;
      if (!r || r.exhibitId !== "GLOBAL") {
        banner.hidden = true;
        banner.innerHTML = "";
        return;
      }
      banner.hidden = false;
      banner.innerHTML = `
        <div class="chat-reply-banner-info">
          <span class="chat-reply-banner-tag">↩ Replying to ${escapeHtml(r.userName || "Detective")}</span>
          <span class="chat-reply-banner-snippet">${escapeHtml(r.text || "📷 [GIF / Photo]")}</span>
        </div>
        <button type="button" class="chat-reply-cancel-btn" data-cancel-reply title="Cancel reply">×</button>
      `;
      banner
        .querySelector("[data-cancel-reply]")
        ?.addEventListener("click", () => {
          playForensicSound("click");
          state.replyingToChat = null;
          updateChatReplyBanners("GLOBAL");
        });
    });
  }

  function updateChatMediaPreviews() {
    const url = state.pendingChatMediaUrl;
    const previews = [
      document.getElementById("lbChatMediaPreview"),
      document.getElementById("binderChatMediaPreview"),
      document.getElementById("globalChatMediaPreview"),
      document.getElementById("lbGlobalChatMediaPreview")
    ];

    previews.forEach((el) => {
      if (!el) return;
      if (!url) {
        el.hidden = true;
        el.innerHTML = "";
        return;
      }
      el.hidden = false;
      el.innerHTML = `
        <div class="chat-media-preview-inner">
          <img src="${escapeHtmlAttr(url)}" alt="Attached preview" class="chat-media-preview-thumb" />
          <span class="chat-media-preview-label">Ready to send (add caption or press Enter)</span>
          <button type="button" class="chat-reply-cancel-btn" data-clear-media title="Remove attachment">×</button>
        </div>
      `;
      el.querySelector("[data-clear-media]")?.addEventListener("click", () => {
        playForensicSound("click");
        state.pendingChatMediaUrl = null;
        updateChatMediaPreviews();
      });
    });
  }

  let gifSearchDebounceTimer = null;
  let gifCurrentOffset = 0;
  let gifIsFetchingMore = false;
  let gifHasMore = true;

  const GIF_CATEGORY_LIVE_QUERIES = {
    unhinged: "unhinged meme walter white homelander speed",
    sus: "caught in 4k suspicious stare doakes side eye",
    cooked: "shaq timeout crying meme skeleton explosion fbi",
    memes: "funny reaction meme shitpost bruh",
    trending: "__TRENDING__"
  };

  function mapGiphyItems(rawList, fallbackTitle = "GIF") {
    return (rawList || [])
      .map((g) => ({
        id: g.id,
        title: g.title || fallbackTitle,
        previewUrl:
          g.images?.fixed_width_small?.url ||
          g.images?.fixed_height_small?.url ||
          g.images?.fixed_height?.url ||
          `https://media.giphy.com/media/${g.id}/200.gif`,
        fullUrl:
          g.images?.fixed_height?.url ||
          `https://media.giphy.com/media/${g.id}/giphy.gif`
      }))
      .filter((x) => x.id);
  }

  async function fetchGiphyFeed({ query, category, append = false }) {
    if (gifIsFetchingMore && append) return;
    gifIsFetchingMore = true;
    if (!append) {
      gifCurrentOffset = 0;
      gifHasMore = true;
    }
    updateGifDrawersGridOnly();

    const q = (query || "").trim();
    const cat = category || state.activeGifCategory || "unhinged";
    const limit = 50;
    const offset = gifCurrentOffset;

    try {
      let url = "";
      if (q) {
        url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_PUBLIC_API_KEY}&q=${encodeURIComponent(
          q
        )}&limit=${limit}&offset=${offset}&rating=r`;
      } else if (GIF_CATEGORY_LIVE_QUERIES[cat] === "__TRENDING__") {
        url = `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_PUBLIC_API_KEY}&limit=${limit}&offset=${offset}&rating=r`;
      } else {
        const catQuery =
          GIF_CATEGORY_LIVE_QUERIES[cat] || GIF_CATEGORY_LIVE_QUERIES.unhinged;
        url = `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_PUBLIC_API_KEY}&q=${encodeURIComponent(
          catQuery
        )}&limit=${limit}&offset=${offset}&rating=r`;
      }

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const fetched = mapGiphyItems(data.data, q || cat);
        gifHasMore = fetched.length >= 25;
        gifCurrentOffset += fetched.length;

        // Prepend curated favorites on page 0 when browsing a category without a custom search query
        let baseList = [];
        if (!q && !append && CURATED_GIFS_BY_CATEGORY[cat]) {
          baseList = CURATED_GIFS_BY_CATEGORY[cat].map((item) => ({
            id: item.id,
            title: item.title,
            previewUrl: `https://media.giphy.com/media/${item.id}/200.gif`,
            fullUrl: `https://media.giphy.com/media/${item.id}/giphy.gif`
          }));
        }

        const existing = append && Array.isArray(state.gifRemoteResults)
          ? state.gifRemoteResults
          : baseList;

        const seen = new Set(existing.map((i) => i.id));
        const merged = [...existing];
        fetched.forEach((item) => {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        });
        state.gifRemoteResults = merged;
      }
    } catch (_e) {
      // Keep curated fallback silently
    } finally {
      gifIsFetchingMore = false;
      updateGifDrawersGridOnly();
    }
  }

  function getActiveExhibitIdForChat() {
    if (state.lightboxOpen) {
      return EXHIBITS[state.currentExhibitIndex]?.id || "EX-01";
    }
    const filtered = getFilteredExhibits();
    return filtered[state.binderIndex]?.id || EXHIBITS[0]?.id || "EX-01";
  }

  function getDisplayedGifList() {
    const cat = state.activeGifCategory || "unhinged";
    const curated = (
      CURATED_GIFS_BY_CATEGORY[cat] || CURATED_GIFS_BY_CATEGORY.unhinged
    ).map((item) => ({
      id: item.id,
      title: item.title,
      previewUrl: `https://media.giphy.com/media/${item.id}/200.gif`,
      fullUrl: `https://media.giphy.com/media/${item.id}/giphy.gif`
    }));

    if (Array.isArray(state.gifRemoteResults) && state.gifRemoteResults.length) {
      return state.gifRemoteResults;
    }
    return curated;
  }

  // Updates ONLY the GIF grid & category button states so the search <input> NEVER loses focus while typing!
  function updateGifDrawersGridOnly() {
    const drawers = [
      document.getElementById("lbGifPickerDrawer"),
      document.getElementById("binderGifPickerDrawer"),
      document.getElementById("globalGifPickerDrawer"),
      document.getElementById("lbGlobalGifPickerDrawer")
    ];
    const cat = state.activeGifCategory || "unhinged";
    const list = getDisplayedGifList();

    drawers.forEach((drawer) => {
      if (!drawer || drawer.hidden) return;

      drawer.querySelectorAll("[data-gif-cat]").forEach((btn) => {
        const bCat = btn.getAttribute("data-gif-cat");
        btn.classList.toggle(
          "is-active",
          !state.gifSearchQuery && bCat === cat
        );
      });

      const grid = drawer.querySelector(".gif-grid");
      if (!grid) return;

      if (!list.length && !gifIsFetchingMore) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:18px;font-size:0.7rem;color:#9ca3af;">No GIFs found for "${escapeHtml(
          state.gifSearchQuery
        )}". Try another keyword or paste a direct URL below!</div>`;
        return;
      }

      grid.innerHTML = `
        ${list
          .map(
            (g) => `
          <button
            type="button"
            class="gif-grid-item"
            data-pick-gif-url="${escapeHtmlAttr(g.fullUrl)}"
            title="${escapeHtmlAttr(g.title)}"
          >
            <img src="${escapeHtmlAttr(g.previewUrl)}" alt="${escapeHtmlAttr(g.title)}" loading="lazy" />
          </button>
        `
          )
          .join("")}
        ${
          gifHasMore
            ? `<button type="button" class="tool-btn gif-load-more-btn" data-load-more-gifs style="grid-column:1/-1; justify-content:center; padding:6px; font-size:0.66rem; margin-top:4px;">
                ${gifIsFetchingMore ? "Loading more GIFs..." : "+ Load 50 More GIFs"}
              </button>`
            : ""
        }
      `;

      grid.querySelectorAll("[data-pick-gif-url]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const gifUrl = btn.getAttribute("data-pick-gif-url");
          if (!gifUrl) return;
          const isGlobalDrawer =
            drawer.id === "globalGifPickerDrawer" ||
            drawer.id === "lbGlobalGifPickerDrawer";
          const exId = isGlobalDrawer ? "GLOBAL" : getActiveExhibitIdForChat();
          const inputEl =
            drawer.id === "globalGifPickerDrawer"
              ? document.getElementById("globalChatInput")
              : drawer.id === "lbGlobalGifPickerDrawer"
              ? document.getElementById("lbGlobalChatInput")
              : drawer.id === "binderGifPickerDrawer"
              ? document.getElementById("binderChatInput")
              : document.getElementById("lbChatInput");
          const caption = inputEl ? inputEl.value.trim() : "";
          if (inputEl) inputEl.value = "";
          state.gifDrawerOpen = false;
          renderGifPickerDrawers();
          submitPageChatMessage(exId, caption, gifUrl);
        });
      });

      grid
        .querySelector("[data-load-more-gifs]")
        ?.addEventListener("click", (e) => {
          e.stopPropagation();
          fetchGiphyFeed({
            query: state.gifSearchQuery,
            category: state.activeGifCategory,
            append: true
          });
        });
    });
  }

  function renderGifPickerDrawers() {
    const drawers = [
      document.getElementById("lbGifPickerDrawer"),
      document.getElementById("binderGifPickerDrawer"),
      document.getElementById("globalGifPickerDrawer"),
      document.getElementById("lbGlobalGifPickerDrawer")
    ];

    drawers.forEach((drawer) => {
      if (!drawer) return;
      if (!state.gifDrawerOpen) {
        drawer.hidden = true;
        return;
      }
      drawer.hidden = false;

      // Only build the shell once so typing in .gif-search-input NEVER loses focus!
      if (!drawer.querySelector(".gif-drawer-header")) {
        const cat = state.activeGifCategory || "unhinged";
        drawer.innerHTML = `
          <div class="gif-drawer-header">
            <input
              type="text"
              class="gif-search-input"
              placeholder="Search millions of GIFs & memes..."
              value="${escapeHtmlAttr(state.gifSearchQuery || "")}"
              autocomplete="off"
            />
            <button type="button" class="chat-reply-cancel-btn" data-close-gif-drawer title="Close GIFs">×</button>
          </div>
          <div class="gif-category-tabs">
            <button type="button" class="gif-cat-btn ${!state.gifSearchQuery && cat === "unhinged" ? "is-active" : ""}" data-gif-cat="unhinged">🔥 Unhinged</button>
            <button type="button" class="gif-cat-btn ${!state.gifSearchQuery && cat === "sus" ? "is-active" : ""}" data-gif-cat="sus">🕵️ Sus / 4K</button>
            <button type="button" class="gif-cat-btn ${!state.gifSearchQuery && cat === "cooked" ? "is-active" : ""}" data-gif-cat="cooked">💀 Cooked</button>
            <button type="button" class="gif-cat-btn ${!state.gifSearchQuery && cat === "memes" ? "is-active" : ""}" data-gif-cat="memes">😂 Memes</button>
            <button type="button" class="gif-cat-btn ${!state.gifSearchQuery && cat === "trending" ? "is-active" : ""}" data-gif-cat="trending">📈 Hot</button>
          </div>
          <div class="gif-grid"></div>
          <div class="gif-custom-url-bar">
            <input
              type="url"
              class="gif-custom-url-input"
              placeholder="Or paste ANY direct .gif / image URL here..."
            />
            <button type="button" class="tool-btn is-active gif-send-url-btn">Send URL</button>
          </div>
        `;

        const searchInput = drawer.querySelector(".gif-search-input");
        searchInput?.addEventListener("input", (e) => {
          state.gifSearchQuery = e.target.value;
          if (gifSearchDebounceTimer) clearTimeout(gifSearchDebounceTimer);
          gifSearchDebounceTimer = setTimeout(() => {
            fetchGiphyFeed({
              query: state.gifSearchQuery,
              category: state.activeGifCategory,
              append: false
            });
          }, 220);
        });

        // Prevent Lightbox keyboard shortcuts while typing in GIF search
        searchInput?.addEventListener("keydown", (e) => {
          e.stopPropagation();
        });

        drawer
          .querySelector("[data-close-gif-drawer]")
          ?.addEventListener("click", () => {
            playForensicSound("click");
            state.gifDrawerOpen = false;
            renderGifPickerDrawers();
          });

        drawer.querySelectorAll("[data-gif-cat]").forEach((btn) => {
          btn.addEventListener("click", () => {
            playForensicSound("click");
            state.activeGifCategory =
              btn.getAttribute("data-gif-cat") || "unhinged";
            state.gifSearchQuery = "";
            const sInput = drawer.querySelector(".gif-search-input");
            if (sInput) sInput.value = "";
            state.gifRemoteResults = null;
            fetchGiphyFeed({
              query: "",
              category: state.activeGifCategory,
              append: false
            });
          });
        });

        const gridEl = drawer.querySelector(".gif-grid");
        gridEl?.addEventListener("scroll", () => {
          if (
            !gifIsFetchingMore &&
            gifHasMore &&
            gridEl.scrollTop + gridEl.clientHeight >= gridEl.scrollHeight - 40
          ) {
            fetchGiphyFeed({
              query: state.gifSearchQuery,
              category: state.activeGifCategory,
              append: true
            });
          }
        });

        const customUrlInput = drawer.querySelector(".gif-custom-url-input");
        const customUrlBtn = drawer.querySelector(".gif-send-url-btn");
        const sendCustomUrl = () => {
          const val = (customUrlInput?.value || "").trim();
          if (!val) return;
          const isGlobalDrawer =
            drawer.id === "globalGifPickerDrawer" ||
            drawer.id === "lbGlobalGifPickerDrawer";
          const exId = isGlobalDrawer ? "GLOBAL" : getActiveExhibitIdForChat();
          customUrlInput.value = "";
          state.gifDrawerOpen = false;
          renderGifPickerDrawers();
          submitPageChatMessage(exId, "", val);
        };
        customUrlBtn?.addEventListener("click", sendCustomUrl);
        customUrlInput?.addEventListener("keydown", (e) => {
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            sendCustomUrl();
          }
        });
      } else {
        const searchInput = drawer.querySelector(".gif-search-input");
        if (
          searchInput &&
          document.activeElement !== searchInput &&
          searchInput.value !== (state.gifSearchQuery || "")
        ) {
          searchInput.value = state.gifSearchQuery || "";
        }
      }
    });

    updateGifDrawersGridOnly();

    // Auto-fetch 50 live GIFs the first time the drawer opens if not yet loaded
    if (state.gifDrawerOpen && !state.gifRemoteResults && !gifIsFetchingMore) {
      fetchGiphyFeed({
        query: state.gifSearchQuery,
        category: state.activeGifCategory,
        append: false
      });
    }
  }

  // ============================================================================
  // QUICK PC EMOJI LIBRARY DRAWER (SEARCHABLE & CATEGORIZED)
  // ============================================================================
  const EMOJI_LIBRARY_BY_CATEGORY = {
    hype: [
      { char: "💀", tags: "skull dead dying laugh rip" },
      { char: "😭", tags: "cry sobbing tears laughing" },
      { char: "😂", tags: "joy laugh tears" },
      { char: "🤣", tags: "rofl rolling laughing" },
      { char: "🔥", tags: "fire lit hot" },
      { char: "🤡", tags: "clown circus" },
      { char: "🗿", tags: "moai stone chad bruh" },
      { char: "🗣️", tags: "speaking facts loud" },
      { char: "💯", tags: "100 hundred facts" },
      { char: "👀", tags: "eyes looking sus" },
      { char: "🫡", tags: "salute respect sir" },
      { char: "🤨", tags: "raised eyebrow rock sus" },
      { char: "📸", tags: "camera caught in 4k" },
      { char: "🚨", tags: "siren alarm police emergency" },
      { char: "🧢", tags: "cap lie no cap" },
      { char: "🐐", tags: "goat greatest" },
      { char: "👑", tags: "crown king queen" },
      { char: "💔", tags: "broken heart" },
      { char: "🙏", tags: "pray please thank you" },
      { char: "🥶", tags: "cold freezing" },
      { char: "🥵", tags: "hot sweating" },
      { char: "🤓", tags: "nerd glasses" },
      { char: "😈", tags: "devil evil grin" },
      { char: "👻", tags: "ghost boo" },
      { char: "💩", tags: "poop trash" },
      { char: "🙈", tags: "see no evil monkey" },
      { char: "🙉", tags: "hear no evil monkey" },
      { char: "🙊", tags: "speak no evil monkey" },
      { char: "💥", tags: "boom explosion" },
      { char: "⚡", tags: "lightning zap" },
      { char: "💣", tags: "bomb" },
      { char: "💤", tags: "sleep zzz" }
    ],
    faces: [
      { char: "😀", tags: "grin happy smile" },
      { char: "😃", tags: "smiley happy" },
      { char: "😄", tags: "smile laugh" },
      { char: "😁", tags: "beaming grin" },
      { char: "😆", tags: "xd squinting laugh" },
      { char: "😅", tags: "sweat smile nervous" },
      { char: "🙂", tags: "slight smile" },
      { char: "🙃", tags: "upside down" },
      { char: "😉", tags: "wink" },
      { char: "😊", tags: "blush happy" },
      { char: "😇", tags: "angel halo innocent" },
      { char: "🥰", tags: "love hearts smile" },
      { char: "😍", tags: "heart eyes love" },
      { char: "🤩", tags: "star struck" },
      { char: "😘", tags: "kiss blow" },
      { char: "😋", tags: "yum tongue" },
      { char: "😜", tags: "wink tongue crazy" },
      { char: "🤪", tags: "zany goofy" },
      { char: "🤑", tags: "money rich" },
      { char: "🤗", tags: "hug" },
      { char: "🤭", tags: "giggle cover mouth" },
      { char: "🫢", tags: "gasp shock" },
      { char: "🫣", tags: "peeking" },
      { char: "🤫", tags: "shh quiet secret" },
      { char: "🤔", tags: "thinking hmm" },
      { char: "🤐", tags: "zipper mouth" },
      { char: "😐", tags: "neutral straight face" },
      { char: "😑", tags: "expressionless" },
      { char: "😶", tags: "no mouth speechless" },
      { char: "😏", tags: "smirk" },
      { char: "😒", tags: "unamused side eye" },
      { char: "🙄", tags: "eye roll" },
      { char: "😬", tags: "grimace awkward" },
      { char: "😮‍💨", tags: "exhale sigh" },
      { char: "🤥", tags: "lying pinocchio" },
      { char: "😌", tags: "relieved" },
      { char: "😔", tags: "pensive sad" },
      { char: "😪", tags: "sleepy" },
      { char: "🤤", tags: "drooling" },
      { char: "😴", tags: "sleeping" },
      { char: "😷", tags: "mask sick" },
      { char: "🤒", tags: "thermometer sick" },
      { char: "🤕", tags: "bandage hurt" },
      { char: "🤢", tags: "nauseated green" },
      { char: "🤮", tags: "vomit puke" },
      { char: "🤧", tags: "sneeze" },
      { char: "😵", tags: "dizzy" },
      { char: "😵‍💫", tags: "spiral eyes" },
      { char: "🤯", tags: "mind blown exploding head" },
      { char: "🤠", tags: "cowboy" },
      { char: "🥳", tags: "party celebrate" },
      { char: "😎", tags: "cool sunglasses" },
      { char: "🧐", tags: "monocle inspect" },
      { char: "😕", tags: "confused" },
      { char: "😟", tags: "worried" },
      { char: "🙁", tags: "frown" },
      { char: "😮", tags: "open mouth wow" },
      { char: "😯", tags: "hushed" },
      { char: "😲", tags: "astonished shocked" },
      { char: "😳", tags: "flushed embarrassed" },
      { char: "🥺", tags: "pleading puppy eyes" },
      { char: "🥹", tags: "holding back tears" },
      { char: "😦", tags: "frowning" },
      { char: "😧", tags: "anguished" },
      { char: "😨", tags: "fearful scared" },
      { char: "😰", tags: "anxious sweat" },
      { char: "😥", tags: "sad relief" },
      { char: "😢", tags: "crying tear" },
      { char: "😱", tags: "scream shock" },
      { char: "😖", tags: "confounded" },
      { char: "😣", tags: "persevering" },
      { char: "😞", tags: "disappointed" },
      { char: "😓", tags: "downcast sweat" },
      { char: "😩", tags: "weary" },
      { char: "😫", tags: "tired" },
      { char: "🥱", tags: "yawn bored" },
      { char: "😤", tags: "steam nose triumph" },
      { char: "😡", tags: "rage angry red" },
      { char: "😠", tags: "angry" },
      { char: "🤬", tags: "cursing swearing" }
    ],
    detective: [
      { char: "🕵️", tags: "detective spy investigator" },
      { char: "🕵️‍♂️", tags: "man detective" },
      { char: "🕵️‍♀️", tags: "woman detective" },
      { char: "🔍", tags: "magnifying glass search zoom" },
      { char: "🔎", tags: "magnifying glass right" },
      { char: "📁", tags: "file folder manila" },
      { char: "📂", tags: "open folder dossier" },
      { char: "🗂️", tags: "card index dividers" },
      { char: "📄", tags: "page document exhibit" },
      { char: "📃", tags: "page curl" },
      { char: "📑", tags: "bookmark tabs" },
      { char: "📌", tags: "pushpin pin corkboard" },
      { char: "📍", tags: "round pin location" },
      { char: "📎", tags: "paperclip" },
      { char: "🖍️", tags: "crayon marker highlight" },
      { char: "✏️", tags: "pencil draw" },
      { char: "✒️", tags: "black nib redact" },
      { char: "🔒", tags: "locked classified" },
      { char: "🔓", tags: "unlocked unsealed" },
      { char: "⚖️", tags: "scales justice court" },
      { char: "👨‍⚖️", tags: "judge court" },
      { char: "🏛️", tags: "courthouse tribunal" },
      { char: "🚓", tags: "police car" },
      { char: "🪪", tags: "id card badge" },
      { char: "📼", tags: "videocassette tape" },
      { char: "🎥", tags: "movie camera" },
      { char: "📞", tags: "telephone receiver call" },
      { char: "☎️", tags: "telephone" },
      { char: "💻", tags: "laptop pc computer" },
      { char: "🕶️", tags: "dark sunglasses agent" },
      { char: "🧥", tags: "trench coat" },
      { char: "☕", tags: "coffee mug" },
      { char: "🐱", tags: "cat" },
      { char: "🐈‍⬛", tags: "black cat" },
      { char: "🐾", tags: "paw prints" },
      { char: "🦊", tags: "fox" },
      { char: "🦉", tags: "owl" },
      { char: "🐕", tags: "dog hound" },
      { char: "🧬", tags: "dna forensic" },
      { char: "🔬", tags: "microscope lab" }
    ],
    hands: [
      { char: "👍", tags: "thumbs up ok good" },
      { char: "👎", tags: "thumbs down bad" },
      { char: "👊", tags: "fist bump punch" },
      { char: "✊", tags: "raised fist" },
      { char: "🤛", tags: "left fist" },
      { char: "🤜", tags: "right fist" },
      { char: "🤞", tags: "crossed fingers luck" },
      { char: "✌️", tags: "peace victory" },
      { char: "🫰", tags: "hand with index and thumb crossed" },
      { char: "🤟", tags: "love you gesture" },
      { char: "🤘", tags: "rock on horns" },
      { char: "👌", tags: "ok hand" },
      { char: "🤌", tags: "pinched fingers italian" },
      { char: "🤏", tags: "pinching hand small" },
      { char: "👈", tags: "point left" },
      { char: "👉", tags: "point right" },
      { char: "👆", tags: "point up" },
      { char: "👇", tags: "point down" },
      { char: "☝️", tags: "index pointing up" },
      { char: "✋", tags: "raised hand stop" },
      { char: "🤚", tags: "raised back of hand" },
      { char: "🖐️", tags: "hand fingers splayed" },
      { char: "👋", tags: "wave hello bye" },
      { char: "🤙", tags: "call me shaka" },
      { char: "💪", tags: "flex bicep strong" },
      { char: "🖕", tags: "middle finger" },
      { char: "✍️", tags: "writing hand" },
      { char: "🤝", tags: "handshake deal" },
      { char: "👏", tags: "clap applause" },
      { char: "🙌", tags: "raising hands hooray" },
      { char: "👐", tags: "open hands" },
      { char: "🤲", tags: "palms up" },
      { char: "🤷", tags: "shrug idk" },
      { char: "🤦", tags: "facepalm" },
      { char: "🙅", tags: "no gesture" },
      { char: "🙆", tags: "ok gesture" },
      { char: "🙇", tags: "bowing" },
      { char: "🙋", tags: "raising hand" },
      { char: "🫶", tags: "heart hands" },
      { char: "💅", tags: "nail polish slay" }
    ],
    hearts: [
      { char: "❤️", tags: "red heart love" },
      { char: "🧡", tags: "orange heart" },
      { char: "💛", tags: "yellow heart" },
      { char: "💚", tags: "green heart" },
      { char: "💙", tags: "blue heart" },
      { char: "💜", tags: "purple heart" },
      { char: "🖤", tags: "black heart" },
      { char: "🤍", tags: "white heart" },
      { char: "🤎", tags: "brown heart" },
      { char: "❤️‍🔥", tags: "heart on fire" },
      { char: "❤️‍🩹", tags: "mending heart" },
      { char: "💕", tags: "two hearts" },
      { char: "💞", tags: "revolving hearts" },
      { char: "💓", tags: "beating heart" },
      { char: "💗", tags: "growing heart" },
      { char: "💖", tags: "sparkling heart" },
      { char: "💘", tags: "heart with arrow" },
      { char: "💝", tags: "heart with ribbon" },
      { char: "✅", tags: "check mark yes" },
      { char: "❌", tags: "cross mark no" },
      { char: "⚠️", tags: "warning" },
      { char: "🚫", tags: "prohibited" },
      { char: "❓", tags: "question mark" },
      { char: "❗", tags: "exclamation mark" },
      { char: "‼️", tags: "double exclamation" },
      { char: "⁉️", tags: "exclamation question" },
      { char: "💢", tags: "anger symbol" },
      { char: "💫", tags: "dizzy star" },
      { char: "💦", tags: "sweat droplets" },
      { char: "💨", tags: "dash wind" },
      { char: "🎉", tags: "party popper" },
      { char: "🎊", tags: "confetti ball" },
      { char: "🏆", tags: "trophy winner" },
      { char: "🥇", tags: "first place gold medal" },
      { char: "🎯", tags: "bullseye target" },
      { char: "🎲", tags: "dice game" },
      { char: "✨", tags: "sparkles" },
      { char: "⭐", tags: "star" },
      { char: "🌟", tags: "glowing star" },
      { char: "💎", tags: "gem diamond" }
    ]
  };

  function getDisplayedEmojiList() {
    const q = (state.emojiSearchQuery || "").trim().toLowerCase();
    if (q) {
      const seen = new Set();
      const matches = [];
      for (const list of Object.values(EMOJI_LIBRARY_BY_CATEGORY)) {
        for (const item of list) {
          if (
            !seen.has(item.char) &&
            (item.char.includes(q) || item.tags.toLowerCase().includes(q))
          ) {
            seen.add(item.char);
            matches.push(item);
          }
        }
      }
      return matches;
    }
    const cat = state.activeEmojiCategory || "hype";
    return EMOJI_LIBRARY_BY_CATEGORY[cat] || EMOJI_LIBRARY_BY_CATEGORY.hype;
  }

  function insertEmojiIntoChatInput(inputEl, emojiChar) {
    if (!inputEl || !emojiChar) return;
    const start =
      typeof inputEl.selectionStart === "number"
        ? inputEl.selectionStart
        : inputEl.value.length;
    const end =
      typeof inputEl.selectionEnd === "number"
        ? inputEl.selectionEnd
        : inputEl.value.length;
    const before = inputEl.value.slice(0, start);
    const after = inputEl.value.slice(end);
    inputEl.value = `${before}${emojiChar}${after}`.slice(0, 400);
    inputEl.focus();
    const nextPos = Math.min(400, start + emojiChar.length);
    try {
      inputEl.setSelectionRange(nextPos, nextPos);
    } catch (_e) {}
  }

  function updateEmojiDrawersGridOnly() {
    const drawers = [
      document.getElementById("lbEmojiPickerDrawer"),
      document.getElementById("binderEmojiPickerDrawer"),
      document.getElementById("globalEmojiPickerDrawer")
    ];
    const cat = state.activeEmojiCategory || "hype";
    const list = getDisplayedEmojiList();

    drawers.forEach((drawer) => {
      if (!drawer || drawer.hidden) return;

      drawer.querySelectorAll("[data-emoji-cat]").forEach((btn) => {
        const bCat = btn.getAttribute("data-emoji-cat");
        btn.classList.toggle(
          "is-active",
          !state.emojiSearchQuery && bCat === cat
        );
      });

      const grid = drawer.querySelector(".emoji-grid");
      if (!grid) return;

      grid.innerHTML = list.length
        ? list
            .map(
              (item) => `
              <button
                type="button"
                class="emoji-grid-item"
                data-pick-emoji="${escapeHtmlAttr(item.char)}"
                title="${escapeHtmlAttr(item.tags)}"
              >${item.char}</button>
            `
            )
            .join("")
        : `<div style="grid-column:1/-1; text-align:center; padding:14px 6px; font-family:var(--font-mono); font-size:0.65rem; color:#9ca3af;">
            No matching emojis found.
          </div>`;

      grid.querySelectorAll("[data-pick-emoji]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const emojiChar = btn.getAttribute("data-pick-emoji");
          if (!emojiChar) return;
          playForensicSound("click");
          const inputEl =
            drawer.id === "globalEmojiPickerDrawer"
              ? document.getElementById("globalChatInput")
              : drawer.id === "binderEmojiPickerDrawer"
              ? document.getElementById("binderChatInput")
              : document.getElementById("lbChatInput");
          insertEmojiIntoChatInput(inputEl, emojiChar);
        });
      });
    });
  }

  function renderEmojiPickerDrawers() {
    const drawers = [
      document.getElementById("lbEmojiPickerDrawer"),
      document.getElementById("binderEmojiPickerDrawer"),
      document.getElementById("globalEmojiPickerDrawer")
    ];

    drawers.forEach((drawer) => {
      if (!drawer) return;
      if (!state.emojiDrawerOpen) {
        drawer.hidden = true;
        return;
      }
      drawer.hidden = false;

      if (!drawer.querySelector(".emoji-drawer-header")) {
        const cat = state.activeEmojiCategory || "hype";
        drawer.innerHTML = `
          <div class="emoji-drawer-header">
            <input
              type="text"
              class="emoji-search-input"
              placeholder="Search emojis (skull, fire, laugh, detective, cat)..."
              value="${escapeHtmlAttr(state.emojiSearchQuery || "")}"
            />
            <button type="button" class="tool-btn btn-danger-accent" data-close-emoji-drawer style="padding:3px 7px; font-size:0.62rem;">
              CLOSE
            </button>
          </div>
          <div class="emoji-category-tabs">
            <button type="button" class="emoji-cat-btn ${cat === "hype" ? "is-active" : ""}" data-emoji-cat="hype">🔥 HYPE</button>
            <button type="button" class="emoji-cat-btn ${cat === "faces" ? "is-active" : ""}" data-emoji-cat="faces">😀 FACES</button>
            <button type="button" class="emoji-cat-btn ${cat === "detective" ? "is-active" : ""}" data-emoji-cat="detective">🕵️ CASE</button>
            <button type="button" class="emoji-cat-btn ${cat === "hands" ? "is-active" : ""}" data-emoji-cat="hands">🙌 HANDS</button>
            <button type="button" class="emoji-cat-btn ${cat === "hearts" ? "is-active" : ""}" data-emoji-cat="hearts">❤️ SYMBOLS</button>
          </div>
          <div class="emoji-grid"></div>
        `;

        const searchInput = drawer.querySelector(".emoji-search-input");
        searchInput?.addEventListener("input", (e) => {
          state.emojiSearchQuery = e.target.value;
          updateEmojiDrawersGridOnly();
        });
        searchInput?.addEventListener("keydown", (e) => {
          e.stopPropagation();
        });

        drawer
          .querySelector("[data-close-emoji-drawer]")
          ?.addEventListener("click", () => {
            playForensicSound("click");
            state.emojiDrawerOpen = false;
            renderEmojiPickerDrawers();
          });

        drawer.querySelectorAll("[data-emoji-cat]").forEach((btn) => {
          btn.addEventListener("click", () => {
            playForensicSound("click");
            state.activeEmojiCategory =
              btn.getAttribute("data-emoji-cat") || "hype";
            state.emojiSearchQuery = "";
            const sInput = drawer.querySelector(".emoji-search-input");
            if (sInput) sInput.value = "";
            updateEmojiDrawersGridOnly();
          });
        });
      } else {
        const searchInput = drawer.querySelector(".emoji-search-input");
        if (
          searchInput &&
          document.activeElement !== searchInput &&
          searchInput.value !== (state.emojiSearchQuery || "")
        ) {
          searchInput.value = state.emojiSearchQuery || "";
        }
      }
    });

    updateEmojiDrawersGridOnly();
  }

  function processChatImageOrGifFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result;
      if (typeof dataUrl !== "string") return;

      // Preserve animated GIFs directly if reasonably sized (< 700 KB)
      if (file.type === "image/gif" && file.size <= 700 * 1024) {
        state.pendingChatMediaUrl = dataUrl;
        updateChatMediaPreviews();
        return;
      }

      // Compress/resize static images so they sync fast across all users
      const img = new Image();
      img.onload = () => {
        const maxDim = 540;
        let w = img.naturalWidth || img.width || 320;
        let h = img.naturalHeight || img.height || 320;
        if (w > maxDim || h > maxDim) {
          const ratio = Math.min(maxDim / w, maxDim / h);
          w = Math.max(1, Math.round(w * ratio));
          h = Math.max(1, Math.round(h * ratio));
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        state.pendingChatMediaUrl = c.toDataURL("image/webp", 0.82);
        updateChatMediaPreviews();
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function bindChatDeleteButtons(container) {
    if (!container) return;
    container.querySelectorAll("[data-delete-chat]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const messageId = btn.getAttribute("data-delete-chat");
        const exhibitId = btn.getAttribute("data-chat-exhibit");
        if (!messageId || !exhibitId || !state.userProfile) return;
        playForensicSound("click");
        if (state.replyingToChat && state.replyingToChat.id === messageId) {
          state.replyingToChat = null;
          updateChatReplyBanners(exhibitId);
        }
        dispatchSharedAction({
          action: "delete_chat_message",
          exhibitId,
          messageId,
          userId: state.userProfile.id,
          userName: state.userProfile.name,
          avatarId: state.userProfile.avatarId,
          customAvatarUrl: state.userProfile.customAvatarUrl
        });
      });
    });

    container.querySelectorAll("[data-reply-chat]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = btn.getAttribute("data-reply-chat") || "";
        const userName = btn.getAttribute("data-reply-author") || "Detective";
        const text = btn.getAttribute("data-reply-text") || "";
        const exhibitId = btn.getAttribute("data-chat-exhibit") || "";
        playForensicSound("click");
        state.replyingToChat = { id, userName, text, exhibitId };
        updateChatReplyBanners(exhibitId);
        const targetInput =
          container.id === "globalChatFeed"
            ? document.getElementById("globalChatInput")
            : container.id === "lbGlobalChatFeed"
            ? document.getElementById("lbGlobalChatInput")
            : container.id === "binderChatFeed" ||
              container.closest("#binderPageRight")
            ? document.getElementById("binderChatInput")
            : document.getElementById("lbChatInput");
        targetInput?.focus();
      });
    });

    container.querySelectorAll("[data-jump-chat-id]").forEach((quoteEl) => {
      quoteEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetId = quoteEl.getAttribute("data-jump-chat-id");
        if (!targetId) return;
        const targetMsg = container.querySelector(
          `[data-chat-msg-id="${CSS.escape(targetId)}"]`
        );
        if (targetMsg) {
          playForensicSound("click");
          targetMsg.scrollIntoView({ behavior: "smooth", block: "nearest" });
          targetMsg.classList.remove("is-highlighted-msg");
          void targetMsg.offsetWidth;
          targetMsg.classList.add("is-highlighted-msg");
          setTimeout(() => {
            targetMsg.classList.remove("is-highlighted-msg");
          }, 1400);
        }
      });
    });

    container.querySelectorAll("[data-open-media]").forEach((imgEl) => {
      imgEl.addEventListener("click", (e) => {
        e.stopPropagation();
        const url = imgEl.getAttribute("data-open-media");
        if (url && !url.startsWith("data:")) {
          window.open(url, "_blank", "noopener");
        }
      });
    });
  }

  function renderLightboxChat(ex) {
    const titleEl = document.getElementById("lbChatRoomTitle");
    const badgeEl = document.getElementById("lbChatCountBadge");
    const feedEl = document.getElementById("lbChatFeed");
    const inputEl = document.getElementById("lbChatInput");

    if (
      state.replyingToChat &&
      state.replyingToChat.exhibitId &&
      state.replyingToChat.exhibitId !== "GLOBAL" &&
      state.replyingToChat.exhibitId !== ex.id
    ) {
      state.replyingToChat = null;
    }
    updateChatReplyBanners(ex.id);
    updateChatMediaPreviews();

    const chats = state.shared.chatsByExhibit[ex.id] || [];
    if (titleEl)
      titleEl.textContent = `${ex.id} DISCUSSION ROOM (${chats.length})`;
    if (badgeEl) badgeEl.textContent = String(chats.length);
    if (inputEl) {
      inputEl.placeholder = `Message ${ex.id}, paste pic/GIF...`;
    }
    if (feedEl) {
      const chatSig = `${ex.id}:${chats.length}:${chats.map((c) => c.id).join(",")}:${state.userProfile?.id || ""}:${state.userProfile?.name || ""}:${state.userProfile?.avatarId || ""}:${state.userProfile?.customAvatarUrl || ""}`;
      if (feedEl.dataset.lastSig !== chatSig) {
        feedEl.dataset.lastSig = chatSig;
        feedEl.innerHTML = renderChatMessagesHtml(chats, ex.id);
        bindChatDeleteButtons(feedEl);
        feedEl.scrollTop = feedEl.scrollHeight;
      }
    }
  }

  function renderGlobalChat() {
    const chats = state.shared.chatsByExhibit["GLOBAL"] || [];
    const countStr = String(chats.length);

    const topBadge = document.getElementById("globalChatTopBadge");
    const fabBadge = document.getElementById("globalChatFabBadge");
    const lbBadge = document.getElementById("lbGlobalChatCountBadge");
    const drawerTitle = document.getElementById("globalDrawerTitle");
    const lbTitle = document.getElementById("lbGlobalChatRoomTitle");

    if (topBadge && topBadge.textContent !== countStr)
      topBadge.textContent = countStr;
    if (fabBadge && fabBadge.textContent !== countStr)
      fabBadge.textContent = countStr;
    if (lbBadge && lbBadge.textContent !== countStr)
      lbBadge.textContent = countStr;
    if (drawerTitle)
      drawerTitle.textContent = `GLOBAL HQ CHAT (${chats.length})`;
    if (lbTitle)
      lbTitle.textContent = `GLOBAL HQ CHAT — SITE-WIDE (${chats.length})`;

    updateChatReplyBanners();
    updateChatMediaPreviews();

    const chatSig = `GLOBAL:${chats.length}:${chats.map((c) => c.id).join(",")}:${state.userProfile?.id || ""}:${state.userProfile?.name || ""}:${state.userProfile?.avatarId || ""}:${state.userProfile?.customAvatarUrl || ""}`;
    const feeds = [
      document.getElementById("globalChatFeed"),
      document.getElementById("lbGlobalChatFeed")
    ];

    feeds.forEach((feedEl) => {
      if (!feedEl) return;
      if (feedEl.dataset.lastSig !== chatSig) {
        feedEl.dataset.lastSig = chatSig;
        feedEl.innerHTML = renderChatMessagesHtml(chats, "GLOBAL");
        bindChatDeleteButtons(feedEl);
        feedEl.scrollTop = feedEl.scrollHeight;
      }
    });
  }

  function toggleGlobalChatDrawer(forceState) {
    const nextOpen =
      typeof forceState === "boolean"
        ? forceState
        : !state.globalChatDrawerOpen;
    state.globalChatDrawerOpen = nextOpen;

    const drawer = document.getElementById("globalChatDrawer");
    const fabBtn = document.getElementById("globalChatFabBtn");
    const topBtn = document.getElementById("openGlobalChatBtn");

    if (drawer) {
      drawer.hidden = !nextOpen;
      if (nextOpen) {
        drawer.removeAttribute("hidden");
      } else {
        drawer.setAttribute("hidden", "");
      }
      drawer.classList.toggle("is-open", nextOpen);
      drawer.setAttribute("aria-hidden", nextOpen ? "false" : "true");
    }
    if (fabBtn) {
      fabBtn.classList.toggle("is-active", nextOpen);
    }
    if (topBtn) {
      topBtn.classList.toggle("is-active", nextOpen);
    }

    if (nextOpen) {
      renderGlobalChat();
      const feedEl = document.getElementById("globalChatFeed");
      if (feedEl) feedEl.scrollTop = feedEl.scrollHeight;
      setTimeout(() => {
        document.getElementById("globalChatInput")?.focus();
      }, 80);
    }
  }

  function submitPageChatMessage(exhibitId, text, explicitMediaUrl = null) {
    const cleanText = (text || "").trim();
    let mediaUrl = explicitMediaUrl || state.pendingChatMediaUrl || null;
    let finalCaption = cleanText;

    // If user pasted a direct GIF/image URL into the text box without a separate media attachment, promote it to mediaUrl
    if (!mediaUrl && isDirectMediaUrl(cleanText)) {
      mediaUrl = cleanText;
      finalCaption = "";
    }

    if (!finalCaption && !mediaUrl) return;
    if (!exhibitId) return;

    playForensicSound("chat");
    const replyTo =
      state.replyingToChat && state.replyingToChat.exhibitId === exhibitId
        ? {
            id: state.replyingToChat.id,
            userName: state.replyingToChat.userName,
            text: state.replyingToChat.text
          }
        : null;
    state.replyingToChat = null;
    state.pendingChatMediaUrl = null;
    updateChatReplyBanners(exhibitId);
    updateChatMediaPreviews();

    dispatchSharedAction({
      action: "chat_message",
      exhibitId,
      text: finalCaption,
      mediaUrl,
      replyTo,
      userId: state.userProfile.id,
      userName: state.userProfile.name,
      avatarId: state.userProfile.avatarId,
      customAvatarUrl: state.userProfile.customAvatarUrl
    });
  }

  function switchSidebarTab(tabId, persistToCookie = true) {
    const validTab =
      tabId === "chat" || tabId === "log" ? tabId : "dossier";
    state.activeSidebarTab = validTab;
    if (persistToCookie) {
      saveSidebarTabCookie(validTab);
    }

    document.querySelectorAll("[data-sidebar-tab]").forEach((btn) => {
      btn.classList.toggle(
        "is-active",
        btn.getAttribute("data-sidebar-tab") === validTab
      );
    });

    document
      .getElementById("sidebarPanelDossier")
      ?.classList.toggle("is-active", validTab === "dossier");
    document
      .getElementById("sidebarPanelChat")
      ?.classList.toggle("is-active", validTab === "chat");
    document
      .getElementById("sidebarPanelLog")
      ?.classList.toggle("is-active", validTab === "log");
  }

  // ============================================================================
  // LIVE AUDIT LOG OF ENTRIES & FORENSIC EDITS
  // ============================================================================
  function renderAuditItemsHtml(items) {
    if (!items || items.length === 0) {
      return `<div style="padding:16px; text-align:center; color:#8c8273; font-family:var(--font-mono); font-size:0.75rem;">No log entries recorded for this filter yet.</div>`;
    }

    return items
      .map((item) => {
        const typeClass = `type-${item.type || "entry"}`;
        const typeLabel =
          item.type === "entry"
            ? "USER ENTRY"
            : item.type === "edit"
            ? "FORENSIC EDIT"
            : item.type === "identity"
            ? "PROFILE EDIT"
            : item.exhibitId === "GLOBAL"
            ? "GLOBAL CHAT"
            : "PAGE CHAT";

        return `
          <div class="audit-log-item ${typeClass}">
            <span class="detective-avatar-frame">${renderAvatarHtml(item)}</span>
            <div style="flex:1; min-width:0;">
              <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:3px;">
                <strong style="color:var(--manila-base);">${escapeHtml(item.userName || "Detective")}</strong>
                <span style="font-size:0.62rem; color:#8c8273;">${escapeHtml(formatRelativeTime(item.ts))} • ${typeLabel}</span>
              </div>
              <div style="color:#dfd7c8; line-height:1.4;">
                ${escapeHtml(item.detail)}
                ${
                  item.exhibitId === "GLOBAL"
                    ? `<button type="button" class="tool-btn" data-jump-global-chat style="padding:1px 6px; font-size:0.64rem; margin-left:6px; display:inline-flex;">
                        Open Global Chat
                      </button>`
                    : item.exhibitId
                    ? `<button type="button" class="tool-btn" data-jump-exhibit="${escapeHtmlAttr(item.exhibitId)}" style="padding:1px 6px; font-size:0.64rem; margin-left:6px; display:inline-flex;">
                        Inspect ${escapeHtml(item.exhibitId)}
                      </button>`
                    : ""
                }
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function bindAuditJumpButtons(container) {
    if (!container) return;
    container.querySelectorAll("[data-jump-exhibit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const exId = btn.getAttribute("data-jump-exhibit");
        const idx = EXHIBITS.findIndex((x) => x.id === exId);
        if (idx !== -1) {
          const auditModal = document.getElementById("auditLogModal");
          if (auditModal && auditModal.open) auditModal.close();
          openLightbox(idx, "saved");
        }
      });
    });
    container.querySelectorAll("[data-jump-global-chat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("click");
        const auditModal = document.getElementById("auditLogModal");
        if (auditModal && auditModal.open) auditModal.close();
        if (state.lightboxOpen) {
          closeLightbox();
        }
        toggleGlobalChatDrawer(true);
      });
    });
  }

  function renderSidebarAuditLog() {
    const feed = document.getElementById("lbSidebarAuditFeed");
    if (!feed) return;
    feed.innerHTML = renderAuditItemsHtml(
      (state.shared.auditLog || []).slice(0, 60)
    );
    bindAuditJumpButtons(feed);
  }

  function renderGlobalAuditLog() {
    const feed = document.getElementById("globalAuditLogFeed");
    if (!feed) return;
    const all = state.shared.auditLog || [];
    const filtered =
      state.auditFilter === "all"
        ? all
        : all.filter((item) => item.type === state.auditFilter);
    feed.innerHTML = renderAuditItemsHtml(filtered);
    bindAuditJumpButtons(feed);
  }

  // ============================================================================
  // DETECTIVE IDENTITY & CUTE PROFILE PICTURE CUSTOMIZER MODAL
  // ============================================================================
  function openIdentityModal() {
    const modal = document.getElementById("identityModal");
    if (!modal || !state.userProfile) return;

    playForensicSound("click");
    state.editingAvatarId = state.userProfile.avatarId;
    state.editingCustomAvatarUrl = state.userProfile.customAvatarUrl || "";

    const nameInput = document.getElementById("detectiveNameInput");
    const urlInput = document.getElementById("customAvatarUrlInput");
    if (nameInput) nameInput.value = state.userProfile.name;
    if (urlInput) {
      urlInput.value = state.editingCustomAvatarUrl.startsWith("data:")
        ? ""
        : state.editingCustomAvatarUrl;
    }

    renderAvatarPickerModalGrid();
    updateModalPreviewAvatar();
    if (!modal.open) modal.showModal();
  }

  function updateModalPreviewAvatar() {
    const preview = document.getElementById("modalPreviewAvatar");
    if (!preview) return;
    preview.innerHTML = renderAvatarHtml({
      avatarId: state.editingAvatarId,
      customAvatarUrl: state.editingCustomAvatarUrl
    });
  }

  function renderAvatarPickerModalGrid() {
    const grid = document.getElementById("avatarPickerGrid");
    if (!grid) return;

    grid.innerHTML = AVATARS.map((av) => {
      const selected =
        !state.editingCustomAvatarUrl && state.editingAvatarId === av.id;
      return `
        <button
          type="button"
          class="avatar-choice-btn ${selected ? "is-selected" : ""}"
          data-pick-avatar="${av.id}"
        >
          <span class="detective-avatar-frame size-lg">
            <img src="${escapeHtmlAttr(av.imgUrl)}" alt="${escapeHtmlAttr(av.name)}" />
          </span>
          <span>${escapeHtml(av.name)}</span>
        </button>
      `;
    }).join("");

    grid.querySelectorAll("[data-pick-avatar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("click");
        state.editingAvatarId =
          btn.getAttribute("data-pick-avatar") || "cat-sherlock";
        state.editingCustomAvatarUrl = "";
        const urlInput = document.getElementById("customAvatarUrlInput");
        if (urlInput) urlInput.value = "";
        renderAvatarPickerModalGrid();
        updateModalPreviewAvatar();
      });
    });
  }

  function saveDetectiveIdentityChanges() {
    const nameInput = document.getElementById("detectiveNameInput");
    const urlInput = document.getElementById("customAvatarUrlInput");
    const modal = document.getElementById("identityModal");

    const oldName = state.userProfile.name;
    const oldAvatarId = state.userProfile.avatarId;
    const oldCustom = state.userProfile.customAvatarUrl;

    const newName = (nameInput?.value || "").trim() || oldName;
    if (urlInput && urlInput.value.trim()) {
      state.editingCustomAvatarUrl = urlInput.value.trim();
    }

    state.userProfile.name = newName.slice(0, 32);
    state.userProfile.avatarId = state.editingAvatarId;
    state.userProfile.customAvatarUrl = state.editingCustomAvatarUrl;

    saveUserProfileCookies(state.userProfile);
    updateIdentityBadgeUI();
    refreshLocalCursorFollowerBadge();

    if (
      oldName !== state.userProfile.name ||
      oldAvatarId !== state.userProfile.avatarId ||
      oldCustom !== state.userProfile.customAvatarUrl
    ) {
      const avObj = getAvatarObj(state.userProfile.avatarId);
      const picDesc = state.userProfile.customAvatarUrl
        ? "custom uploaded profile picture"
        : `${avObj ? avObj.name : "Detective"} PFP`;

      dispatchSharedAction({
        action: "log_event",
        eventType: "identity",
        userId: state.userProfile.id,
        userName: state.userProfile.name,
        avatarId: state.userProfile.avatarId,
        customAvatarUrl: state.userProfile.customAvatarUrl,
        exhibitId: null,
        detail: `Updated detective profile: "${oldName}" -> "${state.userProfile.name}" (${picDesc})`
      });
    }

    playForensicSound("stamp");
    if (modal && modal.open) modal.close();
    if (state.viewMode === "binder") renderExhibitsView();
  }

  // ============================================================================
  // AUTOPLAY BRIEFING SLIDESHOW
  // ============================================================================
  function toggleAutoplay() {
    if (state.autoplayTimer) {
      stopAutoplay();
    } else {
      if (!state.lightboxOpen) {
        openLightbox(0, "saved");
      }
      state.autoplayTimer = setInterval(() => {
        navigateLightbox(1);
      }, 4200);
      renderToolbarButtons();
    }
  }

  function stopAutoplay() {
    if (state.autoplayTimer) {
      clearInterval(state.autoplayTimer);
      state.autoplayTimer = null;
      renderToolbarButtons();
    }
  }

  // ============================================================================
  // EVENT LISTENERS & INTERACTION WIRING
  // ============================================================================
  function bindGlobalEvents() {
    // 1. 3D Manila Cover: Alternating Rest Tilt + Click-and-Hold Peel + Smooth Open Dolly
    const openCoverBtn = document.getElementById("openDossierBtn");
    const brassClasp = document.getElementById("folderBrassClasp");
    const folderFlap = document.getElementById("manilaFolderFlap");
    const folderWrapper = document.getElementById("manilaFolderWrapper");
    const closeCoverBtn = document.getElementById("closeCoverBtn");

    let coverPointerDown = false;
    let coverPressStartedOnOpenBtn = false;

    const beginCoverPress = (e, fromOpenButton = false) => {
      if (state.vaultLocked) {
        if (e.target && e.target.closest && e.target.closest("#vaultPadlockCard")) {
          return;
        }
        shakeVaultPadlock();
        return;
      }
      if (state.coverOpen || state.coverAnimating) return;
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest(".redacted-bar")) return;
      const isDirectOpenTrigger = Boolean(
        fromOpenButton ||
          e.target.closest("#openDossierBtn") ||
          e.target.closest("#folderBrassClasp")
      );
      // On touch screens (phones/Instagram WebView), touching the folder body to scroll should NOT open the cover
      if (!isDirectOpenTrigger && e.pointerType === "touch") {
        return;
      }
      coverPointerDown = true;
      coverPressStartedOnOpenBtn = isDirectOpenTrigger;
      if (state.peelHoldTimer) clearTimeout(state.peelHoldTimer);
      const startX = e.clientX;
      state.peelHoldTimer = setTimeout(() => {
        if (coverPointerDown && !state.coverOpen && !state.coverAnimating) {
          startFolderPeel(startX);
        }
      }, 165);
    };

    const completeCoverPress = (e) => {
      if (!coverPointerDown) return;
      coverPointerDown = false;
      const shouldForceOpen = coverPressStartedOnOpenBtn;
      coverPressStartedOnOpenBtn = false;

      if (state.peelHoldTimer) {
        clearTimeout(state.peelHoldTimer);
        state.peelHoldTimer = null;
      }
      if (state.coverOpen || state.coverAnimating) return;
      if (e && e.target && e.target.closest && e.target.closest(".redacted-bar")) {
        cancelFolderPeel();
        return;
      }
      // If user held to peel/fold the corner, releasing folds it back down (unless they clicked the Open button or dragged far left)
      if (state.isPeelingCover && !shouldForceOpen && state.peelDragDeltaX < 130) {
        cancelFolderPeel();
        applyNextFolderRestTilt();
        return;
      }
      openDossierCinematically(state.isPeelingCover);
    };

    folderFlap?.addEventListener("pointerdown", (e) => beginCoverPress(e, false));
    openCoverBtn?.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      beginCoverPress(e, true);
    });
    brassClasp?.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      beginCoverPress(e, true);
    });

    window.addEventListener("pointerup", (e) => {
      if (coverPointerDown) {
        completeCoverPress(e);
      }
    });

    window.addEventListener("pointercancel", () => {
      coverPointerDown = false;
      coverPressStartedOnOpenBtn = false;
      cancelFolderPeel();
    });

    if (folderWrapper) {
      folderWrapper.addEventListener("pointerenter", () => {
        if (state.coverOpen || state.coverAnimating) return;
        applyNextFolderHoverTilt();
      });

      folderWrapper.addEventListener("pointermove", (e) => {
        if (state.coverOpen || state.coverAnimating) return;
        if (state.isPeelingCover && !state.vaultLocked) {
          updateFolderPeelDrag(e.clientX);
        }
        const rect = folderWrapper.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width; // 0..1
        const ny = (e.clientY - rect.top) / rect.height; // 0..1
        const tiltY = ((nx - 0.5) * 8).toFixed(2);
        const tiltX = ((0.5 - ny) * 6).toFixed(2);
        const peekAngle = state.vaultLocked
          ? 0
          : nx > 0.55
          ? -Math.min(14, (nx - 0.55) * 28)
          : -3;
        folderWrapper.style.setProperty("--hand-rx", `${tiltX}deg`);
        folderWrapper.style.setProperty("--hand-ry", `${tiltY}deg`);
        folderWrapper.style.setProperty("--folder-tilt-x", `${tiltX}deg`);
        folderWrapper.style.setProperty("--folder-tilt-y", `${tiltY}deg`);
        folderWrapper.style.setProperty(
          "--flap-peek-angle",
          `${peekAngle.toFixed(1)}deg`
        );
      });

      folderWrapper.addEventListener("pointerleave", () => {
        if (state.coverOpen || state.coverAnimating) return;
        resetFolderStraight();
        folderWrapper.style.setProperty("--folder-tilt-x", "0deg");
        folderWrapper.style.setProperty("--folder-tilt-y", "0deg");
        folderWrapper.style.setProperty("--flap-peek-angle", "0deg");
        if (state.isPeelingCover && !coverPointerDown) {
          cancelFolderPeel();
        }
      });
    }

    closeCoverBtn?.addEventListener("click", () => {
      closeDossierCinematically();
    });

    document.getElementById("lockVaultBtn")?.addEventListener("click", () => {
      lockVaultNow();
    });

    const vaultForm = document.getElementById("vaultPasscodeForm");
    const vaultInput = document.getElementById("vaultPasscodeInput");
    const vaultToggleVisBtn = document.getElementById("vaultToggleVisBtn");

    vaultForm?.addEventListener("submit", (e) => {
      e.preventDefault();
      e.stopPropagation();
      unlockVaultWithPasscode(vaultInput?.value || "");
    });

    vaultInput?.addEventListener("keydown", (e) => {
      e.stopPropagation();
    });

    vaultInput?.addEventListener("input", () => {
      const errEl = document.getElementById("vaultErrorMsg");
      if (errEl) errEl.hidden = true;
    });

    vaultToggleVisBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!vaultInput) return;
      playForensicSound("click");
      const isPwd = vaultInput.type === "password";
      vaultInput.type = isPwd ? "text" : "password";
      vaultToggleVisBtn.textContent = isPwd ? "🙈" : "👁️";
      vaultInput.focus();
    });

    // 2. Search Input
    const searchInput = document.getElementById("globalSearchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        state.searchQuery = searchInput.value;
        state.binderIndex = 0;
        renderSubjectsGrid();
        renderFilterBanner();
        renderExhibitsView();
      });
    }
    if (clearSearchBtn && searchInput) {
      clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        state.searchQuery = "";
        renderSubjectsGrid();
        renderFilterBanner();
        renderExhibitsView();
      });
    }

    // 3. Top Command Bar Buttons & Global Chat Drawer
    document
      .getElementById("userIdentityPill")
      ?.addEventListener("click", openIdentityModal);
    document
      .getElementById("lbEditIdentityFromChatBtn")
      ?.addEventListener("click", openIdentityModal);
    document
      .getElementById("lbEditIdentityFromGlobalChatBtn")
      ?.addEventListener("click", openIdentityModal);
    document
      .getElementById("globalDrawerEditIdBtn")
      ?.addEventListener("click", openIdentityModal);

    document
      .getElementById("openGlobalChatBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        toggleGlobalChatDrawer();
      });
    document
      .getElementById("globalChatFabBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        toggleGlobalChatDrawer();
      });
    document
      .getElementById("closeGlobalChatDrawerBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        toggleGlobalChatDrawer(false);
      });

    document.getElementById("openAuditLogBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      renderGlobalAuditLog();
      document.getElementById("auditLogModal")?.showModal();
    });

    document
      .getElementById("closeAuditLogModalBtn")
      ?.addEventListener("click", () => {
        document.getElementById("auditLogModal")?.close();
      });

    document
      .querySelectorAll("#auditFilterTabs [data-audit-filter]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          playForensicSound("click");
          state.auditFilter = btn.getAttribute("data-audit-filter") || "all";
          document
            .querySelectorAll("#auditFilterTabs [data-audit-filter]")
            .forEach((b) => {
              b.classList.toggle("is-active", b === btn);
            });
          renderGlobalAuditLog();
        });
      });

    document
      .getElementById("toggleRedactionsBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.redactionsArmed = !state.redactionsArmed;
        renderToolbarButtons();
        renderSubjectsGrid();
        renderExhibitsView();
        if (state.lightboxOpen) renderLightboxContent("none");
      });

    document
      .getElementById("togglePinnedOnlyBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.pinnedOnly = !state.pinnedOnly;
        state.binderIndex = 0;
        renderToolbarButtons();
        renderFilterBanner();
        renderExhibitsView();
      });

    document
      .getElementById("toggleDuplicateBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.hideDuplicates = !state.hideDuplicates;
        state.binderIndex = 0;
        renderToolbarButtons();
        renderFilterBanner();
        renderExhibitsView();
      });

    document
      .getElementById("autoplaySlideshowBtn")
      ?.addEventListener("click", toggleAutoplay);

    document.getElementById("toggleSoundBtn")?.addEventListener("click", () => {
      state.soundEnabled = !state.soundEnabled;
      renderToolbarButtons();
      if (state.soundEnabled) playForensicSound("click");
    });

    // 4. View Mode Switcher
    document.querySelectorAll("[data-view-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("page_flip");
        state.viewMode = btn.getAttribute("data-view-mode") || "grid";
        document.querySelectorAll("[data-view-mode]").forEach((b) => {
          b.classList.toggle("is-active", b === btn);
        });
        if (document.startViewTransition) {
          document.startViewTransition(() => {
            renderExhibitsView();
          });
        } else {
          renderExhibitsView();
        }
      });
    });

    // 5. Collapse / Expand Briefing
    const toggleBriefingBtn = document.getElementById("toggleBriefingBtn");
    const briefingBody = document.getElementById("briefingBody");
    if (toggleBriefingBtn && briefingBody) {
      toggleBriefingBtn.addEventListener("click", () => {
        playForensicSound("click");
        state.briefingCollapsed = !state.briefingCollapsed;
        briefingBody.style.display = state.briefingCollapsed ? "none" : "block";
        toggleBriefingBtn.innerHTML = `${ICON(
          state.briefingCollapsed ? "chevronDown" : "chevronUp"
        )} <span>${
          state.briefingCollapsed
            ? "Expand Cast & Case Summary"
            : "Collapse Cast & Case Summary"
        }</span>`;
      });
    }

    // 6. Click-to-reveal individual FOIA black bars
    document.addEventListener("click", (e) => {
      const bar = e.target.closest(".redacted-bar");
      if (bar) {
        playForensicSound("click");
        bar.classList.toggle("is-revealed");
      }
    });

    // 7. Identity Modal Controls
    document
      .getElementById("closeIdentityModalBtn")
      ?.addEventListener("click", () => {
        document.getElementById("identityModal")?.close();
      });

    document
      .getElementById("randomizeNameBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        const rName =
          RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
        const num = Math.floor(100 + Math.random() * 900);
        const input = document.getElementById("detectiveNameInput");
        if (input) input.value = `${rName} #${num}`;
      });

    document
      .getElementById("customAvatarFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 160;
            canvas.height = 160;
            const ctx = canvas.getContext("2d");
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 160, 160);
            state.editingCustomAvatarUrl = canvas.toDataURL("image/jpeg", 0.84);
            renderAvatarPickerModalGrid();
            updateModalPreviewAvatar();
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });

    document
      .getElementById("customAvatarUrlInput")
      ?.addEventListener("input", (e) => {
        state.editingCustomAvatarUrl = e.target.value.trim();
        renderAvatarPickerModalGrid();
        updateModalPreviewAvatar();
      });

    document
      .getElementById("clearCustomAvatarBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.editingCustomAvatarUrl = "";
        const urlInput = document.getElementById("customAvatarUrlInput");
        if (urlInput) urlInput.value = "";
        renderAvatarPickerModalGrid();
        updateModalPreviewAvatar();
      });

    document
      .getElementById("saveIdentityBtn")
      ?.addEventListener("click", saveDetectiveIdentityChanges);

    // 7B. Person of Interest (POI) Editor Modal Controls
    document
      .getElementById("closePoiModalBtn")
      ?.addEventListener("click", () => {
        document.getElementById("poiModal")?.close();
      });

    document
      .getElementById("poiAvatarFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = 180;
            canvas.height = 180;
            const ctx = canvas.getContext("2d");
            const minSide = Math.min(img.width, img.height);
            const sx = (img.width - minSide) / 2;
            const sy = (img.height - minSide) / 2;
            ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, 180, 180);
            state.editingPoiAvatarUrl = canvas.toDataURL("image/jpeg", 0.85);
            renderPoiPresetGrid();
            updatePoiModalPreview();
          };
          img.src = String(reader.result);
        };
        reader.readAsDataURL(file);
      });

    document
      .getElementById("poiAvatarUrlInput")
      ?.addEventListener("input", (e) => {
        state.editingPoiAvatarUrl = e.target.value.trim();
        renderPoiPresetGrid();
        updatePoiModalPreview();
      });

    document
      .getElementById("resetPoiDefaultBtn")
      ?.addEventListener("click", () => {
        if (!state.editingPoiId) return;
        const rawSubj = META.subjects.find((s) => s.id === state.editingPoiId);
        if (!rawSubj) return;
        playForensicSound("click");
        state.editingPoiAvatarUrl = rawSubj.defaultAvatarUrl;
        const nameInput = document.getElementById("poiNameInput");
        const roleInput = document.getElementById("poiRoleInput");
        const statusInput = document.getElementById("poiStatusInput");
        const urlInput = document.getElementById("poiAvatarUrlInput");
        if (nameInput) nameInput.value = rawSubj.realName;
        if (roleInput) roleInput.value = rawSubj.role;
        if (statusInput) statusInput.value = rawSubj.status;
        if (urlInput) urlInput.value = "";
        renderPoiPresetGrid();
        updatePoiModalPreview();
      });

    document
      .getElementById("savePoiBtn")
      ?.addEventListener("click", savePoiModalChanges);

    // 8. Lightbox Controls + Lock Zoom Checkbox
    document
      .getElementById("lbCloseBtn")
      ?.addEventListener("click", closeLightbox);
    document
      .getElementById("lbPrevBtn")
      ?.addEventListener("click", () => navigateLightbox(-1));
    document
      .getElementById("lbNextBtn")
      ?.addEventListener("click", () => navigateLightbox(1));

    document.getElementById("lbZoomInBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      setZoomLevel(state.zoomLevel + 0.35);
    });
    document.getElementById("lbZoomOutBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      setZoomLevel(state.zoomLevel - 0.35);
    });
    document.getElementById("lbZoomResetBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      resetZoomAndPan();
    });
    document
      .getElementById("lbZoomReadWidthBtn")
      ?.addEventListener("click", activateReadWidthZoom);
    document.getElementById("lbZoomSlider")?.addEventListener("input", (e) => {
      const val = Number(e.target.value) / 100;
      setZoomLevel(val);
    });

    const lockZoomCheckbox = document.getElementById("lbLockZoomCheckbox");
    if (lockZoomCheckbox) {
      lockZoomCheckbox.checked = Boolean(state.lockZoom);
      lockZoomCheckbox.addEventListener("change", (e) => {
        playForensicSound("click");
        state.lockZoom = Boolean(e.target.checked);
        saveLockZoomCookie(state.lockZoom);
      });
    }

    // Mini-Map Radar Scrubbing & Left-Edge Drawer Toggle
    const miniMapEl = document.getElementById("lbMiniMap");
    const miniMapToggleBtn = document.getElementById("lbMiniMapToggleBtn");
    const miniMapChevron = document.getElementById("lbMiniMapChevron");
    if (miniMapEl && miniMapToggleBtn) {
      const savedRadarCollapsed =
        localStorage.getItem("munir_radar_drawer_collapsed") === "1";
      miniMapEl.classList.toggle("is-collapsed", savedRadarCollapsed);
      if (miniMapChevron) {
        miniMapChevron.textContent = savedRadarCollapsed ? "▸" : "◂";
      }
      miniMapToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playForensicSound("click");
        const collapsed = miniMapEl.classList.toggle("is-collapsed");
        if (miniMapChevron) {
          miniMapChevron.textContent = collapsed ? "▸" : "◂";
        }
        try {
          localStorage.setItem(
            "munir_radar_drawer_collapsed",
            collapsed ? "1" : "0"
          );
        } catch (_err) {
          // ignore storage quota errors
        }
      });
    }

    const miniMapTrack = document.getElementById("lbMiniMapTrack");
    if (miniMapTrack) {
      miniMapTrack.addEventListener("pointerdown", (e) => {
        e.stopPropagation();
        state.isScrubbingMiniMap = true;
        miniMapTrack.setPointerCapture?.(e.pointerId);
        scrubMiniMapFromPointer(e);
      });
      miniMapTrack.addEventListener("pointermove", (e) => {
        if (!state.isScrubbingMiniMap) return;
        e.stopPropagation();
        scrubMiniMapFromPointer(e);
      });
      const stopMiniMapScrub = () => {
        state.isScrubbingMiniMap = false;
      };
      miniMapTrack.addEventListener("pointerup", stopMiniMapScrub);
      miniMapTrack.addEventListener("pointercancel", stopMiniMapScrub);
    }

    // On-screen Pan Pad & Right-Edge Drawer Toggle
    const panPadEl = document.getElementById("lbPanPad");
    const panPadToggleBtn = document.getElementById("lbPanPadToggleBtn");
    const panPadChevron = document.getElementById("lbPanPadChevron");
    if (panPadEl && panPadToggleBtn) {
      const savedPanCollapsed =
        localStorage.getItem("munir_pan_drawer_collapsed") === "1";
      panPadEl.classList.toggle("is-collapsed", savedPanCollapsed);
      if (panPadChevron) {
        panPadChevron.textContent = savedPanCollapsed ? "◂" : "▸";
      }
      panPadToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        playForensicSound("click");
        const collapsed = panPadEl.classList.toggle("is-collapsed");
        if (panPadChevron) {
          panPadChevron.textContent = collapsed ? "◂" : "▸";
        }
        try {
          localStorage.setItem(
            "munir_pan_drawer_collapsed",
            collapsed ? "1" : "0"
          );
        } catch (_err) {
          // ignore storage quota errors
        }
      });
    }

    document.getElementById("panTopBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      jumpToVerticalEdge("top");
    });
    document.getElementById("panBotBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      jumpToVerticalEdge("bottom");
    });
    document.getElementById("panCenterBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      jumpToVerticalEdge("center");
    });
    document.getElementById("panUpBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      if (state.zoomLevel === 1) state.zoomLevel = 1.65;
      panByDelta(0, 145);
    });
    document.getElementById("panDownBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      if (state.zoomLevel === 1) state.zoomLevel = 1.65;
      panByDelta(0, -145);
    });
    document.getElementById("panLeftBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      panByDelta(110, 0);
    });
    document.getElementById("panRightBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      panByDelta(-110, 0);
    });

    // Loupe & Compare
    document.getElementById("lbLoupeBtn")?.addEventListener("click", (e) => {
      playForensicSound("click");
      state.loupeActive = !state.loupeActive;
      e.currentTarget.classList.toggle("is-active", state.loupeActive);
      const loupe = document.getElementById("magnifyingLoupe");
      if (loupe && !state.loupeActive) loupe.style.display = "none";
    });

    document.getElementById("lbCompareBtn")?.addEventListener("click", (e) => {
      playForensicSound("page_flip");
      state.compareActive = !state.compareActive;
      e.currentTarget.classList.toggle("is-active", state.compareActive);
      document
        .getElementById("zoomPanContainer")
        ?.classList.toggle("compare-mode-active", state.compareActive);
    });

    // Shared Pencil, Redact & Highlight Drawing Buttons + Contextual Sub-Bar Chips
    document
      .getElementById("lbDrawPencilBtn")
      ?.addEventListener("click", () => setDrawMode("pencil"));
    document
      .getElementById("lbDrawRedactBtn")
      ?.addEventListener("click", () => setDrawMode("redact"));
    document
      .getElementById("lbDrawHighlightBtn")
      ?.addEventListener("click", () => setDrawMode("highlight"));
    document
      .getElementById("annotationDoneBtn")
      ?.addEventListener("click", () => setDrawMode(null));
    document
      .getElementById("lbUndoMarkBtn")
      ?.addEventListener("click", undoLastMarkOnCurrentExhibit);

    document.querySelectorAll("[data-redact-label]").forEach((chip) => {
      chip.addEventListener("click", () => {
        playForensicSound("click");
        state.activeRedactLabel =
          chip.getAttribute("data-redact-label") ?? "REDACTED";
        document.querySelectorAll("[data-redact-label]").forEach((c) => {
          c.classList.toggle("is-selected", c === chip);
        });
      });
    });

    document.querySelectorAll("[data-hl-color]").forEach((chip) => {
      chip.addEventListener("click", () => {
        playForensicSound("click");
        state.activeHighlightColor =
          chip.getAttribute("data-hl-color") || "yellow";
        document.querySelectorAll("[data-hl-color]").forEach((c) => {
          c.classList.toggle("is-selected", c === chip);
        });
        refreshLocalCursorFollowerBadge();
      });
    });

    document.querySelectorAll("[data-pencil-width]").forEach((chip) => {
      chip.addEventListener("click", () => {
        playForensicSound("click");
        state.activePencilWidth =
          Number(chip.getAttribute("data-pencil-width")) || 3.5;
        document.querySelectorAll("[data-pencil-width]").forEach((c) => {
          c.classList.toggle("is-selected", c === chip);
        });
      });
    });

    const arrowToggleBtn = document.getElementById("pencilArrowToggleBtn");
    arrowToggleBtn?.addEventListener("click", () => {
      playForensicSound("click");
      state.pencilArrowTip = !state.pencilArrowTip;
      arrowToggleBtn.classList.toggle("is-selected", state.pencilArrowTip);
      arrowToggleBtn.textContent = `Arrow Tip: ${
        state.pencilArrowTip ? "ON" : "OFF"
      }`;
      refreshLocalCursorFollowerBadge();
    });

    document
      .getElementById("lbClearCanvasBtn")
      ?.addEventListener("click", () => {
        const ex = EXHIBITS[state.currentExhibitIndex];
        if (!ex) return;
        playForensicSound("click");
        dispatchSharedAction({
          action: "clear_marks",
          exhibitId: ex.id,
          userId: state.userProfile.id,
          userName: state.userProfile.name,
          avatarId: state.userProfile.avatarId,
          customAvatarUrl: state.userProfile.customAvatarUrl
        });
      });

    document
      .getElementById("lbFilterSelect")
      ?.addEventListener("change", (e) => {
        state.imageFilter = e.target.value;
        const img = document.getElementById("lbImage");
        const compImg = document.getElementById("lbCompImage");
        [img, compImg].forEach((el) => {
          if (!el) return;
          el.classList.remove("filter-foia", "filter-sepia", "filter-uv");
          if (state.imageFilter !== "none") {
            el.classList.add(`filter-${state.imageFilter}`);
          }
        });
      });

    document.getElementById("lbPinBtn")?.addEventListener("click", () => {
      const ex = EXHIBITS[state.currentExhibitIndex];
      if (ex) togglePinExhibit(ex.id);
    });

    document
      .getElementById("lbToggleTranscriptBtn")
      ?.addEventListener("click", (e) => {
        playForensicSound("click");
        state.sidebarVisible = !state.sidebarVisible;
        e.currentTarget.classList.toggle("is-active", state.sidebarVisible);
        document
          .getElementById("lbMainSplit")
          ?.classList.toggle("transcript-collapsed", !state.sidebarVisible);
      });

    // Sidebar Tabs (Persist to Cookie when clicked)
    document.querySelectorAll("[data-sidebar-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        playForensicSound("click");
        switchSidebarTab(btn.getAttribute("data-sidebar-tab") || "dossier", true);
      });
    });

    document
      .getElementById("lbCopyTranscriptBtn")
      ?.addEventListener("click", (e) => {
        const ex = EXHIBITS[state.currentExhibitIndex];
        if (!ex) return;
        navigator.clipboard?.writeText(ex.transcript || "");
        const span = e.currentTarget.querySelector("span");
        if (span) {
          span.textContent = "Copied!";
          setTimeout(() => {
            span.textContent = "Copy";
          }, 1400);
        }
      });

    document.getElementById("lbSaveNoteBtn")?.addEventListener("click", (e) => {
      const ex = EXHIBITS[state.currentExhibitIndex];
      const noteEl = document.getElementById("lbInvestigatorNote");
      if (!ex || !noteEl) return;
      playForensicSound("stamp");
      dispatchSharedAction({
        action: "save_note",
        exhibitId: ex.id,
        noteText: noteEl.value,
        userId: state.userProfile.id,
        userName: state.userProfile.name,
        avatarId: state.userProfile.avatarId,
        customAvatarUrl: state.userProfile.customAvatarUrl
      });
      const btn = e.currentTarget;
      btn.textContent = "Saved to Log!";
      setTimeout(() => {
        btn.textContent = "Save Note";
      }, 1400);
    });

    document
      .getElementById("lbChatUploadBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        document.getElementById("lbChatFileInput")?.click();
      });

    document
      .getElementById("lbChatFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) processChatImageOrGifFile(file);
        e.target.value = "";
      });

    document.getElementById("lbChatEmojiBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      state.emojiDrawerOpen = !state.emojiDrawerOpen;
      if (state.emojiDrawerOpen) state.gifDrawerOpen = false;
      renderGifPickerDrawers();
      renderEmojiPickerDrawers();
    });

    document.getElementById("lbChatGifBtn")?.addEventListener("click", () => {
      playForensicSound("click");
      state.gifDrawerOpen = !state.gifDrawerOpen;
      if (state.gifDrawerOpen) state.emojiDrawerOpen = false;
      renderEmojiPickerDrawers();
      renderGifPickerDrawers();
    });

    document.getElementById("lbChatInput")?.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            processChatImageOrGifFile(file);
            break;
          }
        }
      }
    });

    document.getElementById("lbChatForm")?.addEventListener("submit", (e) => {
      e.preventDefault();
      const ex = EXHIBITS[state.currentExhibitIndex];
      const input = document.getElementById("lbChatInput");
      if (!ex) return;
      const val = input ? input.value.trim() : "";
      if (!val && !state.pendingChatMediaUrl) return;
      if (state.emojiDrawerOpen) {
        state.emojiDrawerOpen = false;
        renderEmojiPickerDrawers();
      }
      submitPageChatMessage(ex.id, val);
      if (input) input.value = "";
    });

    // Global Chat Forms (Floating Drawer)
    document
      .getElementById("globalChatUploadBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        document.getElementById("globalChatFileInput")?.click();
      });

    document
      .getElementById("globalChatFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) processChatImageOrGifFile(file);
        e.target.value = "";
      });

    document
      .getElementById("globalChatEmojiBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.emojiDrawerOpen = !state.emojiDrawerOpen;
        if (state.emojiDrawerOpen) state.gifDrawerOpen = false;
        renderGifPickerDrawers();
        renderEmojiPickerDrawers();
      });

    document
      .getElementById("globalChatGifBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.gifDrawerOpen = !state.gifDrawerOpen;
        if (state.gifDrawerOpen) state.emojiDrawerOpen = false;
        renderEmojiPickerDrawers();
        renderGifPickerDrawers();
      });

    document
      .getElementById("globalChatInput")
      ?.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              processChatImageOrGifFile(file);
              break;
            }
          }
        }
      });

    document
      .getElementById("globalChatForm")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("globalChatInput");
        const val = input ? input.value.trim() : "";
        if (!val && !state.pendingChatMediaUrl) return;
        if (state.emojiDrawerOpen) {
          state.emojiDrawerOpen = false;
          renderEmojiPickerDrawers();
        }
        submitPageChatMessage("GLOBAL", val);
        if (input) input.value = "";
      });

    document
      .getElementById("lbGlobalChatUploadBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        document.getElementById("lbGlobalChatFileInput")?.click();
      });

    document
      .getElementById("lbGlobalChatFileInput")
      ?.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) processChatImageOrGifFile(file);
        e.target.value = "";
      });

    document
      .getElementById("lbGlobalChatGifBtn")
      ?.addEventListener("click", () => {
        playForensicSound("click");
        state.gifDrawerOpen = !state.gifDrawerOpen;
        renderGifPickerDrawers();
      });

    document
      .getElementById("lbGlobalChatInput")
      ?.addEventListener("paste", (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (const item of items) {
          if (item.type && item.type.startsWith("image/")) {
            const file = item.getAsFile();
            if (file) {
              e.preventDefault();
              processChatImageOrGifFile(file);
              break;
            }
          }
        }
      });

    document
      .getElementById("lbGlobalChatForm")
      ?.addEventListener("submit", (e) => {
        e.preventDefault();
        const input = document.getElementById("lbGlobalChatInput");
        const val = input ? input.value.trim() : "";
        if (!val && !state.pendingChatMediaUrl) return;
        submitPageChatMessage("GLOBAL", val);
        if (input) input.value = "";
      });

    bindViewportInteractions();

    // Keyboard Shortcuts
    window.addEventListener("keydown", (e) => {
      const activeTag = document.activeElement?.tagName;
      if (
        activeTag === "INPUT" ||
        activeTag === "TEXTAREA" ||
        activeTag === "SELECT"
      ) {
        return;
      }

      if (state.lightboxOpen) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
          e.preventDefault();
          undoLastMarkOnCurrentExhibit();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          navigateLightbox(1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          navigateLightbox(-1);
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          if (state.zoomLevel === 1) state.zoomLevel = 1.65;
          panByDelta(0, 115);
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          if (state.zoomLevel === 1) state.zoomLevel = 1.65;
          panByDelta(0, -115);
        } else if (e.key === "+" || e.key === "=") {
          e.preventDefault();
          setZoomLevel(state.zoomLevel + 0.35);
        } else if (e.key === "-") {
          e.preventDefault();
          setZoomLevel(state.zoomLevel - 0.35);
        } else if (e.key === "0") {
          e.preventDefault();
          resetZoomAndPan();
        } else if (e.key.toLowerCase() === "r") {
          e.preventDefault();
          activateReadWidthZoom();
        } else if (e.key.toLowerCase() === "p") {
          e.preventDefault();
          setDrawMode("pencil");
        } else if (e.key.toLowerCase() === "m") {
          e.preventDefault();
          document.getElementById("lbLoupeBtn")?.click();
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          document.getElementById("lbCompareBtn")?.click();
        }
      } else if (state.viewMode === "binder") {
        const filtered = getFilteredExhibits();
        if (e.key === "ArrowRight" && filtered.length) {
          turnBinderPage(1, filtered.length);
        } else if (e.key === "ArrowLeft" && filtered.length) {
          turnBinderPage(-1, filtered.length);
        }
      }
    });

    window.addEventListener("resize", () => {
      if (state.viewMode === "corkboard") {
        requestAnimationFrame(drawCorkboardRedStrings);
      }
      if (state.lightboxOpen) {
        resizeAnnotationCanvas();
        updateMiniMapRadar();
      }
    });
  }

  function bindViewportInteractions() {
    const viewport = document.getElementById("lbViewport");
    const zoomContainer = document.getElementById("zoomPanContainer");
    const canvas = document.getElementById("annotationCanvas");
    const img = document.getElementById("lbImage");
    const loupe = document.getElementById("magnifyingLoupe");
    if (!viewport || !canvas || !img) return;

    viewport.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const offsetX = e.clientX - (rect.left + rect.width / 2);
        const offsetY = e.clientY - (rect.top + rect.height / 2);

        if (!e.ctrlKey && !e.metaKey && state.zoomLevel > 1.04) {
          panByDelta(-e.deltaX * 0.9, -e.deltaY * 1.05);
        } else {
          const zoomDelta = e.deltaY < 0 ? 0.28 : -0.28;
          setZoomLevel(state.zoomLevel + zoomDelta, offsetX, offsetY);
        }
      },
      { passive: false }
    );

    viewport.addEventListener("dblclick", (e) => {
      if (
        e.target.closest(".lightbox-nav-arrow") ||
        e.target.closest(".pan-control-pad") ||
        e.target.closest(".lb-minimap") ||
        e.target.closest(".shared-mark-box")
      ) {
        return;
      }
      playForensicSound("click");
      const rect = viewport.getBoundingClientRect();
      const offsetX = e.clientX - (rect.left + rect.width / 2);
      const offsetY = e.clientY - (rect.top + rect.height / 2);

      if (state.zoomLevel < 2.05) {
        setZoomLevel(2.2, offsetX, offsetY);
      } else {
        resetZoomAndPan();
      }
    });

    viewport.addEventListener("pointerdown", (e) => {
      if (
        state.drawMode ||
        e.button !== 0 ||
        e.target.closest(".lightbox-nav-arrow") ||
        e.target.closest(".pan-control-pad") ||
        e.target.closest(".lb-minimap") ||
        e.target.closest(".shared-mark-box") ||
        e.target.closest(".annotation-subbar")
      ) {
        return;
      }
      state.isDraggingPan = true;
      state.hasDragged = false;
      state.dragStartX = e.clientX - state.panX;
      state.dragStartY = e.clientY - state.panY;
      zoomContainer?.classList.add("is-dragging");
      viewport.setPointerCapture?.(e.pointerId);
    });

    viewport.addEventListener("pointermove", (e) => {
      if (state.drawMode) {
        updateLocalCursorFollowerPosition(e.clientX, e.clientY);
      }

      if (state.loupeActive && loupe && img) {
        const imgRect = img.getBoundingClientRect();
        if (
          e.clientX >= imgRect.left &&
          e.clientX <= imgRect.right &&
          e.clientY >= imgRect.top &&
          e.clientY <= imgRect.bottom
        ) {
          const vRect = viewport.getBoundingClientRect();
          loupe.style.display = "block";
          loupe.style.left = `${e.clientX - vRect.left - 100}px`;
          loupe.style.top = `${e.clientY - vRect.top - 100}px`;
          loupe.style.backgroundImage = `url("${img.src}")`;
          const relX = (e.clientX - imgRect.left) / imgRect.width;
          const relY = (e.clientY - imgRect.top) / imgRect.height;
          loupe.style.backgroundSize = `${imgRect.width * 2.4}px ${
            imgRect.height * 2.4
          }px`;
          loupe.style.backgroundPosition = `${relX * 100}% ${relY * 100}%`;
        } else {
          loupe.style.display = "none";
        }
      }

      if (!state.isDraggingPan) return;
      const newPanX = e.clientX - state.dragStartX;
      const newPanY = e.clientY - state.dragStartY;
      if (
        Math.abs(newPanX - state.panX) > 3 ||
        Math.abs(newPanY - state.panY) > 3
      ) {
        state.hasDragged = true;
      }
      state.panX = newPanX;
      state.panY = newPanY;
      clampPanBounds();
      applyZoomAndPanTransform();
    });

    viewport.addEventListener("pointerleave", () => {
      const follower = document.getElementById("localToolCursorFollower");
      if (follower) follower.hidden = true;
    });

    const endPanDrag = () => {
      if (!state.isDraggingPan) return;
      state.isDraggingPan = false;
      zoomContainer?.classList.remove("is-dragging");
    };
    viewport.addEventListener("pointerup", endPanDrag);
    viewport.addEventListener("pointercancel", endPanDrag);

    // Fine-Tuned Pencil, Redact & Highlight Drawing on `#annotationCanvas`
    let lastDrawClientX = 0;
    let lastDrawClientY = 0;
    let activeCanvasRect = null;
    let lastRectRefreshTs = 0;

    canvas.addEventListener("pointerdown", (e) => {
      if (!state.drawMode || e.button !== 0) return;
      e.stopPropagation();
      resizeAnnotationCanvas();
      const rect = canvas.getBoundingClientRect();
      activeCanvasRect = rect;
      lastRectRefreshTs = performance.now();
      const startX = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const startY = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height)
      );
      state.isDrawingMark = true;
      state.drawStartNormX = startX;
      state.drawStartNormY = startY;
      lastDrawClientX = e.clientX;
      lastDrawClientY = e.clientY;

      if (state.drawMode === "pencil") {
        state.currentPencilPoints = [[startX, startY]];
        startContinuousPenSound();
      } else if (state.drawMode === "highlight") {
        startContinuousPenSound();
      }

      updateLocalCursorFollowerPosition(e.clientX, e.clientY);
      broadcastCursorPosition(
        startX,
        startY,
        state.drawMode === "pencil" ? state.currentPencilPoints : null,
        true
      );
      canvas.setPointerCapture?.(e.pointerId);
    });

    canvas.addEventListener("pointermove", (e) => {
      if (!state.drawMode) return;
      updateLocalCursorFollowerPosition(e.clientX, e.clientY);

      const nowPerf = performance.now();
      if (!activeCanvasRect || (!state.isDrawingMark && nowPerf - lastRectRefreshTs > 180)) {
        activeCanvasRect = canvas.getBoundingClientRect();
        lastRectRefreshTs = nowPerf;
      }
      const rect = activeCanvasRect;
      if (!rect || !rect.width || !rect.height) return;
      const curX = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const curY = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height)
      );

      if (state.isDrawingMark) {
        const movePx = Math.hypot(
          e.clientX - lastDrawClientX,
          e.clientY - lastDrawClientY
        );
        lastDrawClientX = e.clientX;
        lastDrawClientY = e.clientY;
        if (
          (state.drawMode === "pencil" || state.drawMode === "highlight") &&
          movePx > 0.4
        ) {
          updateContinuousPenSound(movePx);
        }
      }

      if (state.drawMode === "pencil" && state.isDrawingMark) {
        const pts = state.currentPencilPoints;
        const lastPt = pts[pts.length - 1];
        if (
          !lastPt ||
          Math.hypot(curX - lastPt[0], curY - lastPt[1]) > 0.0025
        ) {
          pts.push([curX, curY]);
        }
      }

      broadcastCursorPosition(
        curX,
        curY,
        state.drawMode === "pencil" && state.isDrawingMark
          ? state.currentPencilPoints
          : null
      );

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (!state.isDrawingMark) return;

      if (state.drawMode === "pencil") {
        const pts = state.currentPencilPoints;
        if (pts.length >= 2) {
          const strokeHex = getInkHexColor(state.activeHighlightColor);
          const sw = state.activePencilWidth || 3.5;
          ctx.save();
          ctx.strokeStyle = strokeHex;
          ctx.fillStyle = strokeHex;
          ctx.lineWidth = sw;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
          ctx.shadowBlur = 2;
          ctx.beginPath();
          ctx.moveTo(pts[0][0] * canvas.width, pts[0][1] * canvas.height);
          for (let i = 1; i < pts.length - 1; i++) {
            const cx = pts[i][0] * canvas.width;
            const cy = pts[i][1] * canvas.height;
            const mx = ((pts[i][0] + pts[i + 1][0]) * 0.5) * canvas.width;
            const my = ((pts[i][1] + pts[i + 1][1]) * 0.5) * canvas.height;
            ctx.quadraticCurveTo(cx, cy, mx, my);
          }
          const last = pts[pts.length - 1];
          ctx.lineTo(last[0] * canvas.width, last[1] * canvas.height);
          ctx.stroke();

          if (state.pencilArrowTip) {
            const ah = computeArrowHeadGeometry(
              pts,
              canvas.width,
              canvas.height,
              sw
            );
            if (ah) {
              ctx.beginPath();
              ctx.moveTo(ah.tx, ah.ty);
              ctx.lineTo(ah.wx1, ah.wy1);
              ctx.lineTo(ah.nx, ah.ny);
              ctx.lineTo(ah.wx2, ah.wy2);
              ctx.closePath();
              ctx.globalAlpha = 0.88;
              ctx.fill();
              ctx.globalAlpha = 1;

              ctx.beginPath();
              ctx.moveTo(ah.wx1, ah.wy1);
              ctx.lineTo(ah.tx, ah.ty);
              ctx.lineTo(ah.wx2, ah.wy2);
              ctx.stroke();
            }
          }
          ctx.restore();
        }
        return;
      }

      const x = Math.min(state.drawStartNormX, curX) * canvas.width;
      const y = Math.min(state.drawStartNormY, curY) * canvas.height;
      const w = Math.abs(curX - state.drawStartNormX) * canvas.width;
      const h = Math.abs(curY - state.drawStartNormY) * canvas.height;

      if (state.drawMode === "redact") {
        ctx.fillStyle = "rgba(7, 7, 7, 0.94)";
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
        if (w > 48 && h > 16 && state.activeRedactLabel) {
          ctx.fillStyle = "#ef4444";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(state.activeRedactLabel, x + w / 2, y + h / 2);
        }
      } else {
        const colorMap = {
          yellow: { fill: "rgba(250, 204, 21, 0.36)", stroke: "#eab308" },
          red: { fill: "rgba(248, 113, 113, 0.36)", stroke: "#ef4444" },
          green: { fill: "rgba(74, 222, 128, 0.34)", stroke: "#22c55e" },
          cyan: { fill: "rgba(56, 189, 248, 0.34)", stroke: "#0ea5e9" },
          orange: { fill: "rgba(251, 146, 60, 0.36)", stroke: "#f97316" },
          white: { fill: "rgba(248, 250, 252, 0.3)", stroke: "#f8fafc" }
        };
        const pal = colorMap[state.activeHighlightColor] || colorMap.yellow;
        ctx.fillStyle = pal.fill;
        ctx.strokeStyle = pal.stroke;
        ctx.lineWidth = 2;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    });

    canvas.addEventListener("pointerleave", () => {
      if (!state.isDrawingMark) {
        stopContinuousPenSound();
        const ctx = canvas.getContext("2d");
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
    });

    canvas.addEventListener("pointercancel", () => {
      state.isDrawingMark = false;
      stopContinuousPenSound();
      const ctx = canvas.getContext("2d");
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    });

    canvas.addEventListener("pointerup", (e) => {
      stopContinuousPenSound();
      if (!state.isDrawingMark || !state.drawMode) return;
      state.isDrawingMark = false;
      const rect = activeCanvasRect || canvas.getBoundingClientRect();
      const endX = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width)
      );
      const endY = Math.max(
        0,
        Math.min(1, (e.clientY - rect.top) / rect.height)
      );

      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const ex = EXHIBITS[state.currentExhibitIndex];
      if (!ex) return;

      if (state.drawMode === "pencil") {
        const pts = state.currentPencilPoints || [];
        pts.push([endX, endY]);
        state.currentPencilPoints = [];

        if (pts.length < 2) return;

        let minX = 1;
        let minY = 1;
        let maxX = 0;
        let maxY = 0;
        pts.forEach(([px, py]) => {
          if (px < minX) minX = px;
          if (py < minY) minY = py;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        });

        const spanX = maxX - minX;
        const spanY = maxY - minY;
        if (spanX < 0.008 && spanY < 0.008) return;

        // Add generous padding around stroke so arrowheads & straight lines never clip
        const pad = 0.022;
        const boxX = Math.max(0, minX - pad);
        const boxY = Math.max(0, minY - pad);
        const boxW = Math.max(0.032, Math.min(1 - boxX, maxX - minX + pad * 2));
        const boxH = Math.max(0.032, Math.min(1 - boxY, maxY - minY + pad * 2));

        const relPoints = pts.map(([px, py]) => [
          Number(((px - boxX) / boxW).toFixed(4)),
          Number(((py - boxY) / boxH).toFixed(4))
        ]);

        queuedCursorPayload = null;
        dispatchSharedAction({
          action: "add_mark",
          exhibitId: ex.id,
          mark: {
            type: "pencil",
            x: Number(boxX.toFixed(4)),
            y: Number(boxY.toFixed(4)),
            w: Number(boxW.toFixed(4)),
            h: Number(boxH.toFixed(4)),
            color: state.activeHighlightColor,
            strokeWidth: state.activePencilWidth,
            arrowTip: state.pencilArrowTip,
            points: relPoints
          },
          userId: state.userProfile.id,
          userName: state.userProfile.name,
          avatarId: state.userProfile.avatarId,
          customAvatarUrl: state.userProfile.customAvatarUrl
        });
        return;
      }

      const x = Math.min(state.drawStartNormX, endX);
      const y = Math.min(state.drawStartNormY, endY);
      const w = Math.abs(endX - state.drawStartNormX);
      const h = Math.abs(endY - state.drawStartNormY);

      if (w < 0.015 || h < 0.01) return;

      if (state.drawMode === "redact") {
        playForensicSound("stamp");
      }
      dispatchSharedAction({
        action: "add_mark",
        exhibitId: ex.id,
        mark: {
          type: state.drawMode,
          x: Number(x.toFixed(4)),
          y: Number(y.toFixed(4)),
          w: Number(w.toFixed(4)),
          h: Number(h.toFixed(4)),
          color: state.activeHighlightColor,
          label: state.activeRedactLabel
        },
        userId: state.userProfile.id,
        userName: state.userProfile.name,
        avatarId: state.userProfile.avatarId,
        customAvatarUrl: state.userProfile.customAvatarUrl
      });
    });
  }

  // ============================================================================
  // BOOTSTRAP APPLICATION
  // ============================================================================
  function forceApplyFavicon() {
    const dataLink = document.getElementById("siteFaviconData");
    const href = dataLink?.getAttribute("href");
    if (!href) return;
    document
      .querySelectorAll('link[rel="icon"], link[rel="shortcut icon"]')
      .forEach((el) => {
        if (el !== dataLink) el.remove();
      });
    // Re-append a fresh <link rel="icon"> so Firefox/Zen Browser immediately refreshes the tab icon
    const fresh = document.createElement("link");
    fresh.rel = "icon";
    fresh.type = "image/png";
    fresh.sizes = "64x64";
    fresh.href = href;
    document.head.appendChild(fresh);
  }

  function init() {
    applyVaultLockState(state.vaultLocked);
    forceApplyFavicon();
    resetFolderStraight();
    bindGlobalEvents();
    loadLocalStorageState();
    initDetectiveIdentity();
    updateCoverMugshotIfNeeded();
    renderToolbarButtons();
    renderChapterTabs();
    renderSubjectsGrid();
    renderFilterBanner();
    renderExhibitsView();
    renderOnlineUsersWidget();
    renderGlobalChat();

    if (broadcastChannel) {
      broadcastChannel.onmessage = (ev) => {
        if (!ev.data) return;
        if (ev.data.type === "EPHEMERAL_SYNC" && ev.data.delta) {
          applyIncomingEphemeral(ev.data.delta);
        } else if (ev.data.type === "STATE_SYNC" && ev.data.state) {
          mergeSharedState(ev.data.state);
        }
      };
    }

    window.addEventListener("beforeunload", () => {
      if (state.userProfile && state.userProfile.id) {
        const leavePayload = JSON.stringify({
          action: "presence_leave",
          userId: state.userProfile.id
        });
        if (navigator.sendBeacon) {
          const blob = new Blob([leavePayload], { type: "application/json" });
          navigator.sendBeacon("/api/state", blob);
        }
      }
    });

    sendPresenceHeartbeat();
    fetchServerState(true);
    connectLiveEventStream();

    // Fast fallback versioned sync (700ms) + 4s presence heartbeat
    setInterval(() => fetchServerState(false), 700);
    setInterval(sendPresenceHeartbeat, 4000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

