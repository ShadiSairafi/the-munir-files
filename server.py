#!/usr/bin/env python3
"""
THE MUNIR FILES — Ultra-Fast Local Multi-User Server (Static + /api/state + /api/stream SSE)
Provides 0ms Server-Sent Events (SSE) push + versioned /api/state synchronization.
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
                    for k in ("chatsByExhibit", "marksByExhibit", "notesByExhibit", "poiOverrides", "auditLog"):
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
            "auditLog": SHARED_STATE["auditLog"][:350],
        }
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(snapshot, f)
    except Exception:
        pass


def make_uid(now_ms):
    return f"{now_ms:x}-{int(time.perf_counter() * 100000) % 100000:x}"


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
            elif action == "log_event":
                SHARED_STATE["auditLog"].insert(0, {
                    "id": make_uid(now_ms),
                    "type": payload.get("eventType") or "entry",
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "detail": payload.get("detail") or "Activity recorded",
                    "ts": now_ms,
                })
                persist_needed = True
            elif action == "chat_message" and exhibit_id and payload.get("text"):
                lst = SHARED_STATE["chatsByExhibit"].setdefault(exhibit_id, [])
                text = str(payload.get("text")).strip()[:400]
                msg = {
                    "id": make_uid(now_ms),
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "text": text,
                    "ts": now_ms,
                }
                lst.append(msg)
                SHARED_STATE["auditLog"].insert(0, {
                    "id": make_uid(now_ms),
                    "type": "chat",
                    "userId": user_id,
                    "userName": user_name,
                    "avatarId": avatar_id,
                    "customAvatarUrl": custom_avatar_url,
                    "exhibitId": exhibit_id,
                    "detail": f'Commented on {exhibit_id}: "{text[:70]}"',
                    "ts": now_ms,
                })
                persist_needed = True
            elif action == "delete_chat_message" and exhibit_id and payload.get("messageId"):
                lst = SHARED_STATE["chatsByExhibit"].get(exhibit_id, [])
                SHARED_STATE["chatsByExhibit"][exhibit_id] = [
                    m for m in lst if m.get("id") != payload.get("messageId")
                ]
                persist_needed = True
            elif action == "add_mark" and exhibit_id and isinstance(payload.get("mark"), dict):
                mk = payload["mark"]
                mtype = mk.get("type") if mk.get("type") in ("pencil", "highlight", "redact") else "redact"
                new_mark = {
                    "id": make_uid(now_ms),
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
                    "ts": now_ms,
                }
                SHARED_STATE["marksByExhibit"].setdefault(exhibit_id, []).append(new_mark)
                SHARED_STATE["auditLog"].insert(0, {
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
                })
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
                        m["ts"] = now_ms
                        break
                persist_needed = True
            elif action == "delete_mark" and exhibit_id and payload.get("markId"):
                lst = SHARED_STATE["marksByExhibit"].get(exhibit_id, [])
                SHARED_STATE["marksByExhibit"][exhibit_id] = [
                    m for m in lst if m.get("id") != payload.get("markId")
                ]
                persist_needed = True
            elif action == "clear_marks" and exhibit_id:
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
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    load_persisted_state()
    server = ThreadingHTTPServer(("127.0.0.1", port), MunirRequestHandler)
    print(f"Munir Files Live Server running at http://127.0.0.1:{port}")
    server.serve_forever()
