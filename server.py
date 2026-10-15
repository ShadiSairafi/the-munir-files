#!/usr/bin/env python3
"""
THE MUNIR FILES — Ultra-Fast Local Multi-User Server (Static + /api/state + /api/stream SSE)
Provides 0ms Server-Sent Events (SSE) push + CRDT Union-Merge / Tombstone synchronization.
"""

import json
import os
import queue
import sys
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shared_state.json")
STATE_LOCK = threading.Lock()
SSE_CLIENTS = set()
SSE_LOCK = threading.Lock()

SHARED_STATE = {
    "version": 1,
    "chatsByExhibit": {},
    "marksByExhibit": {},
    "notesByExhibit": {},
    "poiOverrides": {},
    "deletedIds": {},
    "clearedAtByExhibit": {},
    "cursorsByExhibit": {},
    "presenceByUser": {},
    "auditLog": [],
}


def load_persisted_state():
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    for k in (
                        "chatsByExhibit",
                        "marksByExhibit",
                        "notesByExhibit",
                        "poiOverrides",
                        "deletedIds",
                        "clearedAtByExhibit",
                        "auditLog",
                    ):
                        if k in data:
                            SHARED_STATE[k] = data[k]
                    SHARED_STATE["version"] = int(data.get("version", 1)) + 1
        except Exception:
            pass


def save_persisted_state():
    try:
        snapshot = {
            "version": SHARED_STATE["version"],
            "chatsByExhibit": SHARED_STATE["chatsByExhibit"],
            "marksByExhibit": SHARED_STATE["marksByExhibit"],
            "notesByExhibit": SHARED_STATE["notesByExhibit"],
            "poiOverrides": SHARED_STATE["poiOverrides"],
            "deletedIds": SHARED_STATE["deletedIds"],
            "clearedAtByExhibit": SHARED_STATE["clearedAtByExhibit"],
            "auditLog": SHARED_STATE["auditLog"][:350],
        }
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(snapshot, f)
    except Exception:
        pass


def make_uid(now_ms):
    return f"{now_ms:x}-{int(time.perf_counter() * 100000) % 100000:x}"


def merge_sync_bundle(bundle):
    if not isinstance(bundle, dict):
        return False
    changed = False

    del_ids = bundle.get("deletedIds")
    if isinstance(del_ids, dict):
        for did, dts in del_ids.items():
            ts_val = int(dts) if isinstance(dts, (int, float)) else 1
            if ts_val > SHARED_STATE["deletedIds"].get(did, 0):
                SHARED_STATE["deletedIds"][did] = ts_val
                changed = True

    clr_map = bundle.get("clearedAtByExhibit")
    if isinstance(clr_map, dict):
        for ex_id, cts in clr_map.items():
            ts_val = int(cts) if isinstance(cts, (int, float)) else 0
            if ts_val > SHARED_STATE["clearedAtByExhibit"].get(ex_id, 0):
                SHARED_STATE["clearedAtByExhibit"][ex_id] = ts_val
                changed = True

    inc_marks = bundle.get("marksByExhibit")
    if isinstance(inc_marks, dict):
        all_ex = set(SHARED_STATE["marksByExhibit"].keys()) | set(inc_marks.keys())
        for ex_id in all_ex:
            cur_list = SHARED_STATE["marksByExhibit"].get(ex_id, [])
            in_list = inc_marks.get(ex_id, [])
            if not isinstance(cur_list, list):
                cur_list = []
            if not isinstance(in_list, list):
                in_list = []
            cleared_at = SHARED_STATE["clearedAtByExhibit"].get(ex_id, 0)
            merged_map = {}
            for m in cur_list + in_list:
                if not isinstance(m, dict) or not m.get("id"):
                    continue
                mid = m["id"]
                if mid in SHARED_STATE["deletedIds"]:
                    continue
                if cleared_at > 0 and int(m.get("ts", 0)) <= cleared_at:
                    continue
                prev = merged_map.get(mid)
                m_ver = int(m.get("updatedTs") or m.get("ts") or 0)
                prev_ver = int(prev.get("updatedTs") or prev.get("ts") or 0) if prev else -1
                if prev is None or m_ver >= prev_ver:
                    merged_map[mid] = m
            merged_list = sorted(merged_map.values(), key=lambda x: int(x.get("ts", 0)))
            if len(merged_list) != len(cur_list):
                changed = True
            SHARED_STATE["marksByExhibit"][ex_id] = merged_list

    inc_chats = bundle.get("chatsByExhibit")
    if isinstance(inc_chats, dict):
        all_ex = set(SHARED_STATE["chatsByExhibit"].keys()) | set(inc_chats.keys())
        for ex_id in all_ex:
            cur_list = SHARED_STATE["chatsByExhibit"].get(ex_id, [])
            in_list = inc_chats.get(ex_id, [])
            if not isinstance(cur_list, list):
                cur_list = []
            if not isinstance(in_list, list):
                in_list = []
            merged_map = {}
            for c in cur_list + in_list:
                if not isinstance(c, dict) or not c.get("id"):
                    continue
                cid = c["id"]
                if cid in SHARED_STATE["deletedIds"]:
                    continue
                prev = merged_map.get(cid)
                if prev is None or int(c.get("ts", 0)) >= int(prev.get("ts", 0)):
                    merged_map[cid] = c
            merged_list = sorted(merged_map.values(), key=lambda x: int(x.get("ts", 0)))
            if len(merged_list) != len(cur_list):
                changed = True
            SHARED_STATE["chatsByExhibit"][ex_id] = merged_list

    return changed


def prune_stale_ephemeral(now_ms):
    changed = False
    for ex_id, cmap in list(SHARED_STATE["cursorsByExhibit"].items()):
        if isinstance(cmap, dict):
            for uid, cobj in list(cmap.items()):
                if not isinstance(cobj, dict) or now_ms - int(cobj.get("ts", 0)) > 14000:
                    del cmap[uid]
                    changed = True
    for uid, pobj in list(SHARED_STATE["presenceByUser"].items()):
        if not isinstance(pobj, dict) or now_ms - int(pobj.get("ts", 0)) > 20000:
            del SHARED_STATE["presenceByUser"][uid]
            changed = True
    if changed:
        SHARED_STATE["version"] += 1
    return changed


def broadcast_sse(sender_id=None, ephemeral_delta=None):
    with STATE_LOCK:
        if ephemeral_delta is not None:
            msg_obj = {
                "ok": True,
                "version": SHARED_STATE["version"],
                "senderId": sender_id,
                "ephemeral": True,
                "delta": ephemeral_delta,
            }
        else:
            msg_obj = {
                "ok": True,
                "version": SHARED_STATE["version"],
                "senderId": sender_id,
                "state": dict(SHARED_STATE),
            }
        payload = f"data: {json.dumps(msg_obj)}\n\n".encode("utf-8")

    with SSE_LOCK:
        dead = []
        for q in SSE_CLIENTS:
            try:
                q.put_nowait(payload)
            except Exception:
                dead.append(q)
        for q in dead:
            SSE_CLIENTS.discard(q)


class MunirRequestHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/state":
            now_ms = int(time.time() * 1000)
            qs = urllib.parse.parse_qs(parsed.query)
            since = 0
            try:
                since = int(qs.get("since", ["0"])[0])
            except Exception:
                since = 0

            with STATE_LOCK:
                prune_stale_ephemeral(now_ms)
                ver = SHARED_STATE["version"]
                if since > 0 and since >= ver:
                    body = json.dumps({"ok": True, "unchanged": True, "version": ver}).encode("utf-8")
                else:
                    body = json.dumps({
                        "ok": True,
                        "version": ver,
                        "state": SHARED_STATE,
                    }).encode("utf-8")

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return

        if parsed.path == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            client_q = queue.Queue(maxsize=64)
            with SSE_LOCK:
                SSE_CLIENTS.add(client_q)

            try:
                with STATE_LOCK:
                    init_msg = json.dumps({
                        "ok": True,
                        "version": SHARED_STATE["version"],
                        "state": SHARED_STATE,
                    })
                self.wfile.write(f"data: {init_msg}\n\n".encode("utf-8"))
                self.wfile.flush()

                while True:
                    try:
                        chunk = client_q.get(timeout=12.0)
                        self.wfile.write(chunk)
                        self.wfile.flush()
                    except queue.Empty:
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except Exception:
                pass
            finally:
                with SSE_LOCK:
                    SSE_CLIENTS.discard(client_q)
            return

        return super().do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path != "/api/state":
            self.send_response(404)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length) if length > 0 else b"{}"
        try:
            payload = json.loads(raw_body.decode("utf-8"))
        except Exception:
            payload = {}

        now_ms = int(time.time() * 1000)
        action = payload.get("action")
        exhibit_id = payload.get("exhibitId")
        user_id = payload.get("userId")
        user_name = payload.get("userName") or "Detective"
        avatar_id = payload.get("avatarId") or "cat-sherlock"
        custom_avatar_url = payload.get("customAvatarUrl") or ""
        persist_needed = False

        with STATE_LOCK:
            prune_stale_ephemeral(now_ms)

            if isinstance(payload.get("syncBundle"), dict):
                if merge_sync_bundle(payload["syncBundle"]):
                    persist_needed = True

            if action == "presence_ping" and user_id:
                SHARED_STATE["presenceByUser"][user_id] = {
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "locationLabel": payload.get("locationLabel") or "In Dossier",
                    "ts": now_ms,
                }
            elif action == "presence_leave" and user_id:
                SHARED_STATE["presenceByUser"].pop(user_id, None)
            elif action == "sync_bundle":
                persist_needed = True
            elif action == "log_event":
                entry = payload.get("auditEntry") or {
                    "id": make_uid(now_ms),
                    "type": payload.get("eventType") or "entry",
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "detail": payload.get("detail") or "Activity recorded",
                    "ts": now_ms,
                }
                if not any(e.get("id") == entry.get("id") for e in SHARED_STATE["auditLog"]):
                    SHARED_STATE["auditLog"].insert(0, entry)
                persist_needed = True
            elif action == "chat_message" and exhibit_id and (payload.get("text") or payload.get("chatMsg")):
                lst = SHARED_STATE["chatsByExhibit"].setdefault(exhibit_id, [])
                text = str(payload.get("text") or "").strip()[:400]
                msg = payload.get("chatMsg") or {
                    "id": make_uid(now_ms),
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "text": text,
                    "replyTo": payload.get("replyTo") or None,
                    "ts": now_ms,
                }
                if msg.get("id") not in SHARED_STATE["deletedIds"] and not any(
                    c.get("id") == msg.get("id") for c in lst
                ):
                    lst.append(msg)
                audit_entry = payload.get("auditEntry") or {
                    "id": make_uid(now_ms),
                    "type": "chat",
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "detail": f'Commented on {exhibit_id}: "{str(msg.get("text", ""))[:70]}"',
                    "ts": now_ms,
                }
                if not any(e.get("id") == audit_entry.get("id") for e in SHARED_STATE["auditLog"]):
                    SHARED_STATE["auditLog"].insert(0, audit_entry)
                persist_needed = True
            elif action == "delete_chat_message" and exhibit_id and payload.get("messageId"):
                mid = payload.get("messageId")
                SHARED_STATE["deletedIds"][mid] = int(payload.get("deletedTs") or now_ms)
                lst = SHARED_STATE["chatsByExhibit"].get(exhibit_id, [])
                SHARED_STATE["chatsByExhibit"][exhibit_id] = [
                    m for m in lst if m.get("id") != mid
                ]
                persist_needed = True
            elif action == "add_mark" and exhibit_id and isinstance(payload.get("mark"), dict):
                mk = payload["mark"]
                mtype = mk.get("type") if mk.get("type") in ("pencil", "highlight", "redact") else "redact"
                mid = mk.get("id") or make_uid(now_ms)
                mts = int(mk.get("ts") or now_ms)
                new_mark = {
                    "id": mid,
                    "type": mtype,
                    "x": mk.get("x", 0),
                    "y": mk.get("y", 0),
                    "w": mk.get("w", 0.1),
                    "h": mk.get("h", 0.1),
                    "color": mk.get("color", "yellow"),
                    "strokeWidth": mk.get("strokeWidth", 3.5),
                    "arrowTip": bool(mk.get("arrowTip")),
                    "points": mk.get("points") if isinstance(mk.get("points"), list) else None,
                    "label": mk.get("label", "REDACTED"),
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "ts": mts,
                    "updatedTs": int(mk.get("updatedTs") or mts),
                }
                lst = SHARED_STATE["marksByExhibit"].setdefault(exhibit_id, [])
                if mid not in SHARED_STATE["deletedIds"] and not any(m.get("id") == mid for m in lst):
                    lst.append(new_mark)
                if user_id and exhibit_id in SHARED_STATE["cursorsByExhibit"]:
                    if user_id in SHARED_STATE["cursorsByExhibit"][exhibit_id]:
                        SHARED_STATE["cursorsByExhibit"][exhibit_id][user_id]["activePoints"] = None
                audit_entry = payload.get("auditEntry") or {
                    "id": make_uid(now_ms),
                    "type": "edit",
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "detail": (
                        f"Drew a {str(new_mark['color']).upper()} pencil {'arrow' if new_mark['arrowTip'] else 'annotation'} on {exhibit_id}"
                        if mtype == "pencil"
                        else f"Added forensic {mtype.upper()} box on {exhibit_id}"
                    ),
                    "ts": now_ms,
                }
                if not any(e.get("id") == audit_entry.get("id") for e in SHARED_STATE["auditLog"]):
                    SHARED_STATE["auditLog"].insert(0, audit_entry)
                persist_needed = True
            elif action == "cursor_update" and exhibit_id and user_id:
                SHARED_STATE["cursorsByExhibit"].setdefault(exhibit_id, {})[user_id] = {
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "tool": payload.get("tool") or "pencil",
                    "color": payload.get("color") or "yellow",
                    "x": float(payload.get("x", 0.5)),
                    "y": float(payload.get("y", 0.5)),
                    "activePoints": payload.get("activePoints") if isinstance(payload.get("activePoints"), list) else None,
                    "ts": now_ms,
                }
            elif action == "cursor_leave" and exhibit_id and user_id:
                SHARED_STATE["cursorsByExhibit"].get(exhibit_id, {}).pop(user_id, None)
            elif action == "update_mark" and exhibit_id and payload.get("markId") and isinstance(payload.get("patch"), dict):
                patch = payload["patch"]
                for m in SHARED_STATE["marksByExhibit"].get(exhibit_id, []):
                    if m.get("id") == payload.get("markId"):
                        for k in ("x", "y", "w", "h", "color", "label"):
                            if k in patch:
                                m[k] = patch[k]
                        m["updatedTs"] = int(payload.get("updatedTs") or now_ms)
                        break
                persist_needed = True
            elif action == "delete_mark" and exhibit_id and payload.get("markId"):
                mid = payload.get("markId")
                SHARED_STATE["deletedIds"][mid] = int(payload.get("deletedTs") or now_ms)
                lst = SHARED_STATE["marksByExhibit"].get(exhibit_id, [])
                SHARED_STATE["marksByExhibit"][exhibit_id] = [
                    m for m in lst if m.get("id") != mid
                ]
                persist_needed = True
            elif action == "clear_marks" and exhibit_id:
                clr_ts = int(payload.get("clearedTs") or now_ms)
                for m in SHARED_STATE["marksByExhibit"].get(exhibit_id, []):
                    if m.get("id"):
                        SHARED_STATE["deletedIds"][m["id"]] = clr_ts
                SHARED_STATE["clearedAtByExhibit"][exhibit_id] = max(
                    SHARED_STATE["clearedAtByExhibit"].get(ex_id, 0) if (ex_id := exhibit_id) else 0,
                    clr_ts,
                )
                SHARED_STATE["marksByExhibit"][exhibit_id] = []
                persist_needed = True
            elif action == "save_note" and exhibit_id:
                SHARED_STATE["notesByExhibit"][exhibit_id] = {
                    "text": str(payload.get("noteText") or "")[:1200],
                    "updatedBy": user_name,
                    "ts": now_ms,
                }
                persist_needed = True
            elif action == "update_poi" and payload.get("poiId") and isinstance(payload.get("poiData"), dict):
                poi_data = dict(payload["poiData"])
                poi_data["updatedBy"] = user_name
                poi_data["ts"] = now_ms
                SHARED_STATE["poiOverrides"][payload["poiId"]] = poi_data
                persist_needed = True

            if user_id and action != "presence_leave":
                existing = SHARED_STATE["presenceByUser"].get(user_id, {})
                SHARED_STATE["presenceByUser"][user_id] = {
                    "userId": user_id,
                    "userName": user_name or existing.get("userName") or "Detective",
                    "avatarId": avatar_id or existing.get("avatarId") or "cat-sherlock",
                    "customAvatarUrl": custom_avatar_url if custom_avatar_url else existing.get("customAvatarUrl", ""),
                    "exhibitId": exhibit_id if exhibit_id is not None else existing.get("exhibitId"),
                    "locationLabel": payload.get("locationLabel") or existing.get("locationLabel") or "In Dossier",
                    "ts": now_ms,
                }

            SHARED_STATE["auditLog"] = SHARED_STATE["auditLog"][:350]
            SHARED_STATE["version"] += 1

            if persist_needed:
                save_persisted_state()

            is_ephemeral = action in ("presence_ping", "presence_leave", "cursor_update", "cursor_leave")
            if is_ephemeral:
                resp_bytes = json.dumps({
                    "ok": True,
                    "version": SHARED_STATE["version"],
                }).encode("utf-8")
            else:
                resp_bytes = json.dumps({
                    "ok": True,
                    "version": SHARED_STATE["version"],
                    "state": SHARED_STATE,
                }).encode("utf-8")

        broadcast_sse(
            sender_id=user_id,
            ephemeral_delta=payload if is_ephemeral else None,
        )

        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(resp_bytes)))
        self.end_headers()
        self.wfile.write(resp_bytes)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv[1:]) >= 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    load_persisted_state()
    server = ThreadingHTTPServer(("127.0.0.1", port), MunirRequestHandler)
    print(f"Munir Files Live Server running at http://127.0.0.1:{port}")
    server.serve_forever()
