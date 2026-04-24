#!/usr/bin/env python3
"""Laborator virtual de genetica moleculara. Tot client-side — server doar serveste static."""
from pathlib import Path
from flask import Flask, send_from_directory, jsonify

APP_DIR = Path(__file__).resolve().parent
PUBLIC = APP_DIR / "public"
PORT = 8780
HOST = "0.0.0.0"

app = Flask(__name__, static_folder=str(PUBLIC), static_url_path="/static")

@app.route("/")
def index(): return send_from_directory(str(PUBLIC), "index.html")

@app.route("/js/<path:p>")
def js(p): return send_from_directory(str(PUBLIC / "js"), p)

@app.route("/css/<path:p>")
def css(p): return send_from_directory(str(PUBLIC / "css"), p)

@app.route("/health")
def health(): return jsonify({"ok": True, "port": PORT, "lab": "genetica"})

if __name__ == "__main__":
    print(f"Laborator Genetica pornit pe http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, threaded=True, debug=False)
