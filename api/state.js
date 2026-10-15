/**
 * Vercel Serverless API Endpoint: /api/state
 * Handles real-time multi-user state synchronization for THE MUNIR FILES with:
 * - CRDT Union-Merge by ID + Tombstone tracking (deletedIds, clearedAtByExhibit)
 * - Cross-container state healing (syncBundle) + /tmp persistence across warm invocations
 * - Online detective presence stack (presence_ping, presence_leave)
 * - Live multi-user drawing cursors & active strokes (cursor_update, cursor_leave)
 * - Shared vector pencil strokes, redactions, & highlights (add_mark, update_mark, delete_mark, clear_marks)
 * - Per-page exhibit discussion chat (chat_message, delete_chat_message)
 * - Shared investigator sticky notes & POI overrides (save_note, update_poi, log_event)
 */

const fs = require("fs");
const TMP_STATE_PATH = "/tmp/munir_shared_state_v2.json";

function createDefaultStore() {
  return {
    version: 1,
    chatsByExhibit: {},
    marksByExhibit: {},
    notesByExhibit: {},
    poiOverrides: {},
    deletedIds: {},
    clearedAtByExhibit: {},
    cursorsByExhibit: {},
    presenceByUser: {},
    auditLog: []
  };
}

if (!globalThis.__MUNIR_SHARED_STATE__) {
  const initial = createDefaultStore();
  try {
    if (fs.existsSync(TMP_STATE_PATH)) {
      const raw = fs.readFileSync(TMP_STATE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        Object.assign(initial, parsed);
      }
    }
  } catch (_e) {}
  globalThis.__MUNIR_SHARED_STATE__ = initial;
}

function saveTmpStore(store) {
  try {
    const snapshot = {
      version: store.version,
      chatsByExhibit: store.chatsByExhibit,
      marksByExhibit: store.marksByExhibit,
      notesByExhibit: store.notesByExhibit,
      poiOverrides: store.poiOverrides,
      deletedIds: store.deletedIds,
      clearedAtByExhibit: store.clearedAtByExhibit,
      auditLog: (store.auditLog || []).slice(0, 350)
    };
    fs.writeFileSync(TMP_STATE_PATH, JSON.stringify(snapshot), "utf8");
  } catch (_e) {}
}

function uid(now) {
  return now.toString(36) + "-" + Math.random().toString(36).slice(2, 8);
}

function mergeSyncBundleIntoStore(store, bundle) {
  if (!bundle || typeof bundle !== "object") return false;
  let changed = false;

  if (!store.deletedIds) store.deletedIds = {};
  if (!store.clearedAtByExhibit) store.clearedAtByExhibit = {};

  if (bundle.deletedIds && typeof bundle.deletedIds === "object") {
    for (const [delId, delTs] of Object.entries(bundle.deletedIds)) {
      const incTs = Number(delTs) || 1;
      if (!store.deletedIds[delId] || incTs > store.deletedIds[delId]) {
        store.deletedIds[delId] = incTs;
        changed = true;
      }
    }
  }

  if (
    bundle.clearedAtByExhibit &&
    typeof bundle.clearedAtByExhibit === "object"
  ) {
    for (const [exId, clrTs] of Object.entries(bundle.clearedAtByExhibit)) {
      const incTs = Number(clrTs) || 0;
      if (
        !store.clearedAtByExhibit[exId] ||
        incTs > store.clearedAtByExhibit[exId]
      ) {
        store.clearedAtByExhibit[exId] = incTs;
        changed = true;
      }
    }
  }

  // Union-merge marksByExhibit by mark.id with tombstones
  const allMarkExIds = new Set([
    ...Object.keys(store.marksByExhibit || {}),
    ...Object.keys(bundle.marksByExhibit || {})
  ]);
  for (const exId of allMarkExIds) {
    const curList = Array.isArray(store.marksByExhibit[exId])
      ? store.marksByExhibit[exId]
      : [];
    const incList =
      bundle.marksByExhibit && Array.isArray(bundle.marksByExhibit[exId])
        ? bundle.marksByExhibit[exId]
        : [];
    const clearedAt = store.clearedAtByExhibit[exId] || 0;
    const map = new Map();

    for (const m of [...curList, ...incList]) {
      if (!m || !m.id) continue;
      if (store.deletedIds[m.id]) continue;
      if (clearedAt > 0 && (m.ts || 0) <= clearedAt) continue;
      const prev = map.get(m.id);
      const mVer = m.updatedTs || m.ts || 0;
      const prevVer = prev ? prev.updatedTs || prev.ts || 0 : -1;
      if (!prev || mVer >= prevVer) {
        map.set(m.id, m);
      }
    }

    const merged = Array.from(map.values()).sort(
      (a, b) => (a.ts || 0) - (b.ts || 0)
    );
    if (merged.length !== curList.length) changed = true;
    store.marksByExhibit[exId] = merged;
  }

  // Union-merge chatsByExhibit by chat.id with tombstones
  const allChatExIds = new Set([
    ...Object.keys(store.chatsByExhibit || {}),
    ...Object.keys(bundle.chatsByExhibit || {})
  ]);
  for (const exId of allChatExIds) {
    const curList = Array.isArray(store.chatsByExhibit[exId])
      ? store.chatsByExhibit[exId]
      : [];
    const incList =
      bundle.chatsByExhibit && Array.isArray(bundle.chatsByExhibit[exId])
        ? bundle.chatsByExhibit[exId]
        : [];
    const map = new Map();

    for (const c of [...curList, ...incList]) {
      if (!c || !c.id) continue;
      if (store.deletedIds[c.id]) continue;
      const prev = map.get(c.id);
      if (!prev || (c.ts || 0) >= (prev.ts || 0)) {
        map.set(c.id, c);
      }
    }

    const merged = Array.from(map.values()).sort(
      (a, b) => (a.ts || 0) - (b.ts || 0)
    );
    if (merged.length !== curList.length) changed = true;
    store.chatsByExhibit[exId] = merged;
  }

  if (bundle.notesByExhibit && typeof bundle.notesByExhibit === "object") {
    for (const [exId, noteObj] of Object.entries(bundle.notesByExhibit)) {
      const cur = store.notesByExhibit[exId];
      if (!cur || (noteObj && (noteObj.ts || 0) > (cur.ts || 0))) {
        store.notesByExhibit[exId] = noteObj;
        changed = true;
      }
    }
  }

  if (bundle.poiOverrides && typeof bundle.poiOverrides === "object") {
    for (const [poiId, poiObj] of Object.entries(bundle.poiOverrides)) {
      const cur = store.poiOverrides[poiId];
      if (!cur || (poiObj && (poiObj.ts || 0) > (cur.ts || 0))) {
        store.poiOverrides[poiId] = poiObj;
        changed = true;
      }
    }
  }

  return changed;
}

function pruneStaleEphemeral(store, now) {
  let pruned = false;
  if (store.cursorsByExhibit) {
    for (const [, cMap] of Object.entries(store.cursorsByExhibit)) {
      if (!cMap || typeof cMap !== "object") continue;
      for (const [u, cObj] of Object.entries(cMap)) {
        if (!cObj || now - (cObj.ts || 0) > 14000) {
          delete cMap[u];
          pruned = true;
        }
      }
    }
  }
  if (store.presenceByUser) {
    for (const [u, pObj] of Object.entries(store.presenceByUser)) {
      if (!pObj || now - (pObj.ts || 0) > 20000) {
        delete store.presenceByUser[u];
        pruned = true;
      }
    }
  }
  if (pruned) {
    store.version += 1;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const store = globalThis.__MUNIR_SHARED_STATE__;
  if (!store.deletedIds) store.deletedIds = {};
  if (!store.clearedAtByExhibit) store.clearedAtByExhibit = {};

  const now = Date.now();
  pruneStaleEphemeral(store, now);

  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      version: store.version,
      state: {
        version: store.version,
        chatsByExhibit: store.chatsByExhibit,
        marksByExhibit: store.marksByExhibit,
        notesByExhibit: store.notesByExhibit,
        poiOverrides: store.poiOverrides,
        deletedIds: store.deletedIds,
        clearedAtByExhibit: store.clearedAtByExhibit,
        cursorsByExhibit: store.cursorsByExhibit,
        presenceByUser: store.presenceByUser,
        auditLog: store.auditLog
      }
    });
  }

  if (req.method === "POST") {
    let payload = req.body;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (_e) {
        payload = {};
      }
    }
    payload = payload || {};

    const {
      action,
      exhibitId,
      userId,
      userName,
      avatarId,
      customAvatarUrl
    } = payload;

    let persistNeeded = false;

    if (payload.syncBundle && typeof payload.syncBundle === "object") {
      if (mergeSyncBundleIntoStore(store, payload.syncBundle)) {
        persistNeeded = true;
      }
    }

    // Merge top-level deletion tombstones & clear timestamps (gossiped on presence_ping & actions)
    if (payload.deletedIds && typeof payload.deletedIds === "object") {
      let tombstoneAdded = false;
      for (const [delId, delTs] of Object.entries(payload.deletedIds)) {
        const incTs = Number(delTs) || 1;
        if (!store.deletedIds[delId] || incTs > store.deletedIds[delId]) {
          store.deletedIds[delId] = incTs;
          tombstoneAdded = true;
        }
      }
      if (tombstoneAdded) {
        persistNeeded = true;
      }
    }

    if (
      payload.clearedAtByExhibit &&
      typeof payload.clearedAtByExhibit === "object"
    ) {
      for (const [exId, clrTs] of Object.entries(payload.clearedAtByExhibit)) {
        const incTs = Number(clrTs) || 0;
        if (
          !store.clearedAtByExhibit[exId] ||
          incTs > store.clearedAtByExhibit[exId]
        ) {
          store.clearedAtByExhibit[exId] = incTs;
          persistNeeded = true;
        }
      }
    }

    // Enforce tombstones across all stored chats and marks immediately
    for (const [exId, chatList] of Object.entries(store.chatsByExhibit || {})) {
      if (Array.isArray(chatList)) {
        const filtered = chatList.filter(
          (c) => c && c.id && !store.deletedIds[c.id]
        );
        if (filtered.length !== chatList.length) {
          store.chatsByExhibit[exId] = filtered;
          persistNeeded = true;
        }
      }
    }
    for (const [exId, markList] of Object.entries(store.marksByExhibit || {})) {
      if (Array.isArray(markList)) {
        const clrTs = store.clearedAtByExhibit[exId] || 0;
        const filtered = markList.filter(
          (m) =>
            m &&
            m.id &&
            !store.deletedIds[m.id] &&
            !(clrTs > 0 && (m.ts || 0) <= clrTs)
        );
        if (filtered.length !== markList.length) {
          store.marksByExhibit[exId] = filtered;
          persistNeeded = true;
        }
      }
    }

    if (action === "presence_ping" && userId) {
      store.presenceByUser[userId] = {
        userId,
        userName: userName || "Detective",
        avatarId: avatarId || "cat-sherlock",
        customAvatarUrl: customAvatarUrl || "",
        exhibitId: exhibitId || null,
        locationLabel: payload.locationLabel || "In Dossier",
        ts: now
      };
    } else if (action === "presence_leave" && userId) {
      delete store.presenceByUser[userId];
    } else if (action === "sync_bundle") {
      persistNeeded = true;
    } else if (action === "log_event") {
      const entry = payload.auditEntry || {
        id: uid(now),
        type: payload.eventType || "entry",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId: exhibitId || null,
        detail: payload.detail || "Activity recorded",
        ts: now
      };
      if (!store.auditLog.some((e) => e && e.id === entry.id)) {
        store.auditLog.unshift(entry);
      }
      persistNeeded = true;
    } else if (
      action === "chat_message" &&
      exhibitId &&
      (payload.text || payload.mediaUrl || payload.chatMsg)
    ) {
      if (!store.chatsByExhibit[exhibitId]) {
        store.chatsByExhibit[exhibitId] = [];
      }
      const msg = payload.chatMsg || {
        id: uid(now),
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        text: String(payload.text || "").trim().slice(0, 400),
        mediaUrl: payload.mediaUrl || null,
        replyTo: payload.replyTo || null,
        ts: now
      };
      if (!store.deletedIds[msg.id] && !store.chatsByExhibit[exhibitId].some((c) => c && c.id === msg.id)) {
        store.chatsByExhibit[exhibitId].push(msg);
      }
      const auditEntry = payload.auditEntry || {
        id: uid(now),
        type: "chat",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Commented on ${exhibitId}: "${String(msg.text || "").slice(0, 70)}"`,
        ts: now
      };
      if (!store.auditLog.some((e) => e && e.id === auditEntry.id)) {
        store.auditLog.unshift(auditEntry);
      }
      persistNeeded = true;
    } else if (
      action === "delete_chat_message" &&
      exhibitId &&
      payload.messageId
    ) {
      store.deletedIds[payload.messageId] = Number(payload.deletedTs) || now;
      const list = store.chatsByExhibit[exhibitId] || [];
      store.chatsByExhibit[exhibitId] = list.filter(
        (m) => m && m.id !== payload.messageId
      );
      if (payload.auditEntry && !store.auditLog.some((e) => e && e.id === payload.auditEntry.id)) {
        store.auditLog.unshift(payload.auditEntry);
      }
      persistNeeded = true;
    } else if (action === "add_mark" && exhibitId && payload.mark) {
      if (!store.marksByExhibit[exhibitId]) {
        store.marksByExhibit[exhibitId] = [];
      }
      const markType =
        payload.mark.type === "pencil"
          ? "pencil"
          : payload.mark.type === "highlight"
          ? "highlight"
          : "redact";
      const markId = payload.mark.id || uid(now);
      const markTs = Number(payload.mark.ts) || now;
      const newMark = {
        id: markId,
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
        ts: markTs,
        updatedTs: Number(payload.mark.updatedTs) || markTs
      };
      if (
        !store.deletedIds[markId] &&
        !store.marksByExhibit[exhibitId].some((m) => m && m.id === markId)
      ) {
        store.marksByExhibit[exhibitId].push(newMark);
      }
      // Clear active live stroke points on user's cursor now that the stroke is committed
      if (
        userId &&
        store.cursorsByExhibit[exhibitId] &&
        store.cursorsByExhibit[exhibitId][userId]
      ) {
        store.cursorsByExhibit[exhibitId][userId].activePoints = null;
      }
      const auditEntry = payload.auditEntry || {
        id: uid(now),
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
      if (!store.auditLog.some((e) => e && e.id === auditEntry.id)) {
        store.auditLog.unshift(auditEntry);
      }
      persistNeeded = true;
    } else if (action === "cursor_update" && exhibitId && userId) {
      if (!store.cursorsByExhibit[exhibitId]) {
        store.cursorsByExhibit[exhibitId] = {};
      }
      store.cursorsByExhibit[exhibitId][userId] = {
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        tool: payload.tool || "pencil",
        color: payload.color || "yellow",
        x: Number(payload.x ?? 0.5),
        y: Number(payload.y ?? 0.5),
        activePoints: Array.isArray(payload.activePoints)
          ? payload.activePoints
          : null,
        ts: now
      };
    } else if (action === "cursor_leave" && exhibitId && userId) {
      if (store.cursorsByExhibit[exhibitId]) {
        delete store.cursorsByExhibit[exhibitId][userId];
      }
    } else if (
      action === "update_mark" &&
      exhibitId &&
      payload.markId &&
      payload.patch
    ) {
      const list = store.marksByExhibit[exhibitId] || [];
      const target = list.find((m) => m && m.id === payload.markId);
      if (target) {
        if (typeof payload.patch.x === "number") target.x = payload.patch.x;
        if (typeof payload.patch.y === "number") target.y = payload.patch.y;
        if (typeof payload.patch.w === "number") target.w = payload.patch.w;
        if (typeof payload.patch.h === "number") target.h = payload.patch.h;
        if (payload.patch.color) target.color = payload.patch.color;
        if (payload.patch.label !== undefined) target.label = payload.patch.label;
        target.updatedTs = Number(payload.updatedTs) || now;
      }
      persistNeeded = true;
    } else if (action === "delete_mark" && exhibitId && payload.markId) {
      store.deletedIds[payload.markId] = Number(payload.deletedTs) || now;
      const list = store.marksByExhibit[exhibitId] || [];
      store.marksByExhibit[exhibitId] = list.filter(
        (m) => m && m.id !== payload.markId
      );
      if (payload.auditEntry && !store.auditLog.some((e) => e && e.id === payload.auditEntry.id)) {
        store.auditLog.unshift(payload.auditEntry);
      }
      persistNeeded = true;
    } else if (action === "clear_marks" && exhibitId) {
      const clrTs = Number(payload.clearedTs) || now;
      const existing = store.marksByExhibit[exhibitId] || [];
      existing.forEach((m) => {
        if (m && m.id) store.deletedIds[m.id] = clrTs;
      });
      store.clearedAtByExhibit[exhibitId] = Math.max(
        store.clearedAtByExhibit[exhibitId] || 0,
        clrTs
      );
      store.marksByExhibit[exhibitId] = [];
      if (payload.auditEntry && !store.auditLog.some((e) => e && e.id === payload.auditEntry.id)) {
        store.auditLog.unshift(payload.auditEntry);
      }
      persistNeeded = true;
    } else if (action === "save_note" && exhibitId) {
      store.notesByExhibit[exhibitId] = {
        text: String(payload.noteText || "").slice(0, 1200),
        updatedBy: userName,
        ts: now
      };
      if (payload.auditEntry && !store.auditLog.some((e) => e && e.id === payload.auditEntry.id)) {
        store.auditLog.unshift(payload.auditEntry);
      }
      persistNeeded = true;
    } else if (action === "update_poi" && payload.poiId && payload.poiData) {
      store.poiOverrides[payload.poiId] = {
        ...payload.poiData,
        updatedBy: userName,
        ts: now
      };
      if (payload.auditEntry && !store.auditLog.some((e) => e && e.id === payload.auditEntry.id)) {
        store.auditLog.unshift(payload.auditEntry);
      }
      persistNeeded = true;
    }

    if (userId && action !== "presence_leave") {
      const existing = store.presenceByUser[userId] || {};
      store.presenceByUser[userId] = {
        userId,
        userName: userName || existing.userName || "Detective",
        avatarId: avatarId || existing.avatarId || "cat-sherlock",
        customAvatarUrl:
          customAvatarUrl !== undefined
            ? customAvatarUrl
            : existing.customAvatarUrl || "",
        exhibitId:
          exhibitId !== undefined ? exhibitId : existing.exhibitId || null,
        locationLabel:
          payload.locationLabel ||
          existing.locationLabel ||
          (exhibitId ? `Inspecting ${exhibitId}` : "In Dossier"),
        ts: now
      };
    }

    if (store.auditLog.length > 350) {
      store.auditLog = store.auditLog.slice(0, 350);
    }

    store.version += 1;

    if (persistNeeded) {
      saveTmpStore(store);
    }

    const isEphemeral =
      action === "presence_ping" ||
      action === "presence_leave" ||
      action === "cursor_update" ||
      action === "cursor_leave";

    if (isEphemeral) {
      return res.status(200).json({
        ok: true,
        version: store.version
      });
    }

    return res.status(200).json({
      ok: true,
      version: store.version,
      state: {
        version: store.version,
        chatsByExhibit: store.chatsByExhibit,
        marksByExhibit: store.marksByExhibit,
        notesByExhibit: store.notesByExhibit,
        poiOverrides: store.poiOverrides,
        deletedIds: store.deletedIds,
        clearedAtByExhibit: store.clearedAtByExhibit,
        cursorsByExhibit: store.cursorsByExhibit,
        presenceByUser: store.presenceByUser,
        auditLog: store.auditLog
      }
    });
  }

  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
};
