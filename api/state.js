/**
 * Vercel Serverless API Endpoint: /api/state
 * Handles ultra-fast real-time multi-user state synchronization for THE MUNIR FILES:
 * - Online detective presence stack (presence_ping, presence_leave)
 * - Live multi-user drawing cursors & active strokes (cursor_update, cursor_leave)
 * - Shared vector pencil strokes, redactions, & highlights (add_mark, update_mark, delete_mark, clear_marks)
 * - Per-page exhibit discussion chat (chat_message, delete_chat_message)
 * - Shared investigator sticky notes & POI overrides (save_note, update_poi, log_event)
 */

if (!globalThis.__MUNIR_SHARED_STATE__) {
  globalThis.__MUNIR_SHARED_STATE__ = {
    version: 1,
    chatsByExhibit: {},
    marksByExhibit: {},
    notesByExhibit: {},
    poiOverrides: {},
    cursorsByExhibit: {},
    presenceByUser: {},
    auditLog: []
  };
}

function uid(now) {
  return now.toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function pruneStaleEphemeral(store, now) {
  let pruned = false;
  // Prune cursors older than 14s
  if (store.cursorsByExhibit) {
    for (const [exId, cMap] of Object.entries(store.cursorsByExhibit)) {
      if (!cMap || typeof cMap !== "object") continue;
      for (const [u, cObj] of Object.entries(cMap)) {
        if (!cObj || now - (cObj.ts || 0) > 14000) {
          delete cMap[u];
          pruned = true;
        }
      }
    }
  }
  // Prune presence older than 20s
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
  const now = Date.now();
  pruneStaleEphemeral(store, now);

  if (req.method === "GET") {
    const since = Number(req.query?.since || 0);
    if (since > 0 && since >= store.version) {
      return res.status(200).json({
        ok: true,
        unchanged: true,
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
    } else if (action === "log_event") {
      store.auditLog.unshift({
        id: uid(now),
        type: payload.eventType || "entry",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId: exhibitId || null,
        detail: payload.detail || "Activity recorded",
        ts: now
      });
    } else if (action === "chat_message" && exhibitId && payload.text) {
      if (!store.chatsByExhibit[exhibitId]) {
        store.chatsByExhibit[exhibitId] = [];
      }
      const msg = {
        id: uid(now),
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        text: String(payload.text).trim().slice(0, 400),
        ts: now
      };
      store.chatsByExhibit[exhibitId].push(msg);
      store.auditLog.unshift({
        id: uid(now),
        type: "chat",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Commented on ${exhibitId}: "${msg.text.slice(0, 70)}"`,
        ts: now
      });
    } else if (
      action === "delete_chat_message" &&
      exhibitId &&
      payload.messageId
    ) {
      const list = store.chatsByExhibit[exhibitId] || [];
      store.chatsByExhibit[exhibitId] = list.filter(
        (m) => m.id !== payload.messageId
      );
      store.auditLog.unshift({
        id: uid(now),
        type: "chat",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Deleted own chat message on ${exhibitId}`,
        ts: now
      });
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
      const newMark = {
        id: uid(now),
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
        ts: now
      };
      store.marksByExhibit[exhibitId].push(newMark);
      store.auditLog.unshift({
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
      });
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
      const target = list.find((m) => m.id === payload.markId);
      if (target) {
        if (typeof payload.patch.x === "number") target.x = payload.patch.x;
        if (typeof payload.patch.y === "number") target.y = payload.patch.y;
        if (typeof payload.patch.w === "number") target.w = payload.patch.w;
        if (typeof payload.patch.h === "number") target.h = payload.patch.h;
        if (payload.patch.color) target.color = payload.patch.color;
        if (payload.patch.label !== undefined) target.label = payload.patch.label;
        target.ts = now;
      }
    } else if (action === "delete_mark" && exhibitId && payload.markId) {
      const list = store.marksByExhibit[exhibitId] || [];
      store.marksByExhibit[exhibitId] = list.filter(
        (m) => m.id !== payload.markId
      );
      store.auditLog.unshift({
        id: uid(now),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Removed a forensic mark on ${exhibitId}`,
        ts: now
      });
    } else if (action === "clear_marks" && exhibitId) {
      store.marksByExhibit[exhibitId] = [];
      store.auditLog.unshift({
        id: uid(now),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Cleared forensic marks on ${exhibitId}`,
        ts: now
      });
    } else if (action === "save_note" && exhibitId) {
      store.notesByExhibit[exhibitId] = {
        text: String(payload.noteText || "").slice(0, 1200),
        updatedBy: userName,
        ts: now
      };
      store.auditLog.unshift({
        id: uid(now),
        type: "edit",
        userId,
        userName,
        avatarId,
        customAvatarUrl,
        exhibitId,
        detail: `Updated shared investigator sticky note on ${exhibitId}`,
        ts: now
      });
    } else if (action === "update_poi" && payload.poiId && payload.poiData) {
      store.poiOverrides[payload.poiId] = {
        ...payload.poiData,
        updatedBy: userName,
        ts: now
      };
      store.auditLog.unshift({
        id: uid(now),
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
      });
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
        cursorsByExhibit: store.cursorsByExhibit,
        presenceByUser: store.presenceByUser,
        auditLog: store.auditLog
      }
    });
  }

  return res.status(405).json({ ok: false, error: "Method Not Allowed" });
};
