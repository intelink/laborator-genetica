#!/usr/bin/env python3
"""Laborator virtual de genetica moleculara.

Frontend static (public/) + endpoint SSE pentru asistent AI Claude.
"""
from pathlib import Path
import json
import logging
import queue
import subprocess
import threading
import time

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

from asistent import (
    streaming_ask,
    streaming_ask_ollama,
    streaming_ask_codex,
    streaming_ask_grok,
    list_all_models,
    CLAUDE_BIN,
    CLAUDE_MODEL,
    LAB_DIR,
)
from andes_vcf import run_andes_vcf

APP_DIR = Path(__file__).resolve().parent
PUBLIC = APP_DIR / "public"
PORT = 8780
HOST = "0.0.0.0"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("genetica")

app = Flask(__name__, static_folder=str(PUBLIC), static_url_path="/static")


@app.route("/")
def index():
    return send_from_directory(str(PUBLIC), "index.html")


@app.route("/js/<path:p>")
def js(p):
    return send_from_directory(str(PUBLIC / "js"), p)


@app.route("/css/<path:p>")
def css(p):
    return send_from_directory(str(PUBLIC / "css"), p)


@app.route("/health")
def health():
    return jsonify({"ok": True, "port": PORT, "lab": "genetica", "ai": True})


@app.route("/api/ai/models")
def ai_models():
    """Lista de modele disponibile pentru asistent: Claude (cloud) + Ollama (local/cloud)."""
    return jsonify({
        "models": list_all_models(),
        "default": f"claude:{CLAUDE_MODEL}",
    })


@app.route("/api/ai/ask", methods=["POST"])
def ai_ask():
    """Primeste { question, seqA, seqB, model } -> SSE stream cu Claude sau Ollama."""
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    seqA = data.get("seqA")
    seqB = data.get("seqB")
    model = (data.get("model") or f"claude:{CLAUDE_MODEL}").strip()
    if not question:
        return jsonify({"error": "question required"}), 400

    # Dispatch: claude:* → claude, codex:* → codex, grok:* → grok, altceva → Ollama
    if model.startswith("claude:"):
        sub_model = model.split(":", 1)[1] or CLAUDE_MODEL
        stream = streaming_ask(question, seqA, seqB, claude_model=sub_model)
    elif model.startswith("codex:"):
        slug = model.split(":", 1)[1]
        stream = streaming_ask_codex(slug, question, seqA, seqB)
    elif model.startswith("grok:"):
        slug = model.split(":", 1)[1]
        stream = streaming_ask_grok(slug, question, seqA, seqB)
    else:
        stream = streaming_ask_ollama(model, question, seqA, seqB)

    def gen():
        for evt, payload in stream:
            yield f"event: {evt}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(gen()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/lab/build", methods=["POST"])
def lab_build():
    """Spawneaza claude --dangerously-skip-permissions pentru a implementa un feature nou."""
    data = request.get_json(silent=True) or {}
    description = (data.get("description") or "").strip()
    if not description:
        return jsonify({"error": "description required"}), 400

    def gen():
        prompt = (
            f"Esti Claude Code si lucrezi pe proiectul Laborator Genetica Moleculara.\n"
            f"Calea proiectului: {LAB_DIR}\n\n"
            f"Trebuie sa implementezi urmatoarea functionalitate noua:\n\n"
            f"{description}\n\n"
            f"Fisierele principale:\n"
            f"- public/index.html — interfata HTML\n"
            f"- public/js/app.js — logica frontend JavaScript\n"
            f"- public/css/style.css — stiluri CSS\n"
            f"- server.py — server Flask\n"
            f"- asistent.py — asistent AI\n\n"
            f"Implementeaza COMPLET ce s-a cerut. Fa toate modificarile necesare.\n"
            f"La sfarsit scrie exact pe o linie: IMPLEMENTARE_COMPLETA"
        )
        cmd = [
            CLAUDE_BIN,
            "--dangerously-skip-permissions",
            "-p", prompt,
            "--allowedTools", "Bash,Write,Edit,Read,TodoWrite",
            "--output-format", "stream-json",
            "--include-partial-messages",
            "--verbose",
        ]

        out: queue.Queue = queue.Queue()
        finished = threading.Event()
        start_ts = time.time()

        def _emit_progress(line: str):
            out.put(f"event: build_progress\ndata: {json.dumps({'line': line}, ensure_ascii=False)}\n\n")

        def _runner():
            try:
                proc = subprocess.Popen(
                    cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, bufsize=1, cwd=str(LAB_DIR)
                )
                stderr_lines: list[str] = []

                def _read_err():
                    for ln in proc.stderr:
                        stderr_lines.append(ln)

                threading.Thread(target=_read_err, daemon=True).start()

                seen_tool_ids: set = set()

                for raw in proc.stdout:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        ev = json.loads(raw)
                    except json.JSONDecodeError:
                        _emit_progress(raw[:200])
                        continue

                    et = ev.get("type")
                    if et == "assistant":
                        for blk in ev.get("message", {}).get("content", []):
                            btype = blk.get("type")
                            if btype == "text":
                                for ln in blk.get("text", "").split("\n"):
                                    if ln.strip():
                                        _emit_progress(ln)
                            elif btype == "tool_use":
                                tid = blk.get("id", "")
                                if tid in seen_tool_ids:
                                    continue
                                seen_tool_ids.add(tid)
                                name = blk.get("name", "tool")
                                inp = blk.get("input", {})
                                if name == "Bash":
                                    cmd_str = inp.get("command", "")[:120]
                                    _emit_progress(f"$ {cmd_str}")
                                elif name in ("Write", "Edit"):
                                    path = inp.get("file_path", inp.get("path", "?"))
                                    _emit_progress(f"✎ {name}: {path}")
                                elif name == "Read":
                                    path = inp.get("file_path", inp.get("path", "?"))
                                    _emit_progress(f"📖 Read: {path}")
                                else:
                                    _emit_progress(f"⚙ {name}({json.dumps(inp)[:80]})")
                    elif et == "user":
                        for blk in ev.get("message", {}).get("content", []):
                            if blk.get("type") == "tool_result":
                                inner = blk.get("content", [])
                                if isinstance(inner, list):
                                    for ib in inner:
                                        if ib.get("type") == "text":
                                            txt = ib.get("text", "").strip()
                                            for ln in txt.split("\n")[:8]:
                                                if ln.strip():
                                                    _emit_progress(f"  {ln}")
                                elif isinstance(inner, str) and inner.strip():
                                    for ln in inner.strip().split("\n")[:8]:
                                        if ln.strip():
                                            _emit_progress(f"  {ln}")

                proc.wait(timeout=30)
                ok = proc.returncode == 0
                msg = "Implementare completa!" if ok else f"Eroare (cod {proc.returncode})"
                out.put(f"event: build_done\ndata: {json.dumps({'success': ok, 'message': msg})}\n\n")
            except FileNotFoundError:
                out.put(f"event: build_done\ndata: {json.dumps({'success': False, 'message': 'claude CLI indisponibil'})}\n\n")
            except Exception as e:
                out.put(f"event: build_done\ndata: {json.dumps({'success': False, 'message': str(e)})}\n\n")
            finally:
                finished.set()
                out.put(None)

        def _heartbeat():
            while not finished.wait(2.5):
                elapsed = int(time.time() - start_ts)
                out.put(f"event: build_heartbeat\ndata: {json.dumps({'elapsed': elapsed})}\n\n")

        threading.Thread(target=_runner, daemon=True).start()
        threading.Thread(target=_heartbeat, daemon=True).start()

        while True:
            item = out.get()
            if item is None:
                break
            yield item

    return Response(
        stream_with_context(gen()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/andes/vcf", methods=["POST"])
def andes_vcf_endpoint():
    """ANDES-VCF: pipeline complet pe text VCF (multi-sample SNPs)."""
    data = request.get_json(silent=True) or {}
    vcf = (data.get("vcf") or "").strip()
    if not vcf:
        # accepta si raw body (text/plain)
        vcf = (request.data or b"").decode("utf-8", errors="replace").strip()
    if not vcf:
        return jsonify({"ok": False, "reason": "VCF text gol"}), 400
    try:
        p_thresh = float(data.get("p_threshold", 1e-3))
    except Exception:
        p_thresh = 1e-3
    try:
        result = run_andes_vcf(vcf, p_threshold=p_thresh)
    except ValueError as e:
        return jsonify({"ok": False, "reason": str(e)}), 400
    except Exception as e:
        log.exception("ANDES-VCF failed")
        return jsonify({"ok": False, "reason": f"eroare interna: {e}"}), 500
    return jsonify(result)


if __name__ == "__main__":
    print(f"Laborator Genetica pornit pe http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True, debug=False)
