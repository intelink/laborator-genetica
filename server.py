#!/usr/bin/env python3
"""Laborator virtual de genetica moleculara.

Frontend static (public/) + endpoint SSE pentru asistent AI Claude.
"""
from pathlib import Path
import json
import logging

from flask import Flask, Response, jsonify, request, send_from_directory, stream_with_context

from asistent import streaming_ask

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


@app.route("/api/ai/ask", methods=["POST"])
def ai_ask():
    """Primeste { question, seqA, seqB } -> SSE stream cu Claude."""
    data = request.get_json(silent=True) or {}
    question = (data.get("question") or "").strip()
    seqA = data.get("seqA")
    seqB = data.get("seqB")
    if not question:
        return jsonify({"error": "question required"}), 400

    def gen():
        for evt, payload in streaming_ask(question, seqA, seqB):
            yield f"event: {evt}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

    return Response(
        stream_with_context(gen()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    print(f"Laborator Genetica pornit pe http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True, debug=False)
