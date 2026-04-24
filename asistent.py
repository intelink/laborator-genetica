"""Asistent Claude pentru Laboratorul Genetica.

Pattern imprumutat din contabilitate-legi: spawn `claude -p` in subprocess
cu stream-json, evenimentele sunt transformate in SSE pentru frontend.

Endpoint: POST /api/ai/ask
Body JSON: {
  "question": "...",
  "seqA": { "name": "...", "dna": "ATGC..." },
  "seqB": { "name": "...", "dna": "ATGC..." }   # optional
}
"""
from __future__ import annotations

import json
import os
import queue
import subprocess
import threading
import textwrap
from typing import Iterable, Tuple


CLAUDE_BIN = os.path.expanduser("~/.local/bin/claude")
CLAUDE_MODEL = os.environ.get("GENETICA_AI_MODEL", "sonnet")


SYSTEM_PROMPT = textwrap.dedent("""\
    Esti un asistent biolog molecular pentru un laborator virtual de genetica.
    Utilizatorul este student sau pasionat care invata despre ADN, ARN, proteine,
    CRISPR, mutatii, PCR, etc. Raspunde in limba romana, concis dar clar.

    Reguli:
    1. Explica simplu, fara jargon inutil. Daca folosesti un termen tehnic,
       explica-l pe loc in paranteza.
    2. Cand compari doua secvente, mentioneaza:
       - procent de identitate
       - daca sunt omologi / inruditi
       - pozitiile unde difera si ce efect au mutatiile respective
       - ce organe/tesuturi/boli sunt asociate (daca stii)
    3. Cand ti se cere "unde pot edita", sugereaza regiuni specifice (CDS,
       exoni, site-uri functionale) si da coordonate concrete in secventa.
    4. Formateaza cu markdown: **bold** pentru termeni-cheie, liste cu -,
       blocuri de cod cu ``` pentru secvente.
    5. Daca nu ai date suficiente (secventa prea scurta, nu recunosti gena),
       spune-o direct, nu inventa.
    6. Pentru inrudiri evolutive / boli / functii, poti folosi WebSearch
       cand e necesar sa aduci informatie curenta (fara sa inventezi).

    Formatul raspunsului: direct la subiect, fara introduceri inutile
    ("Desigur...", "Buna intrebare..." etc).
""")


def _format_seq_for_prompt(label: str, seq: dict | None) -> str:
    if not seq or not seq.get("dna"):
        return ""
    dna = seq["dna"][:3000]  # hard cap pentru prompt
    name = seq.get("name") or "necunoscut"
    more = "" if len(seq.get("dna", "")) <= 3000 else f" (afisate primele 3000 din {len(seq['dna'])} bp)"
    return f"### Secventa {label}: {name}{more}\n```\n{dna}\n```"


def build_prompt(question: str, seqA: dict | None, seqB: dict | None) -> str:
    """Construieste un prompt cu contextul celor doua secvente + intrebarea."""
    blocks = ["# Context laborator genetica"]
    sA = _format_seq_for_prompt("A", seqA)
    sB = _format_seq_for_prompt("B", seqB)
    if sA:
        blocks.append(sA)
    if sB:
        blocks.append(sB)
    if not sA and not sB:
        blocks.append("_(utilizatorul nu a incarcat o secventa activa inca)_")
    blocks.append(f"# Intrebare\n{question.strip()}")
    return "\n\n".join(blocks)


def streaming_ask(
    question: str,
    seqA: dict | None = None,
    seqB: dict | None = None,
) -> Iterable[Tuple[str, dict]]:
    """Yieldeaza evenimente (tip, payload) pentru SSE.

    Tipuri:
      - status: {"message": str}
      - text:   {"text": str}       # delta text incremental
      - error:  {"message": str}
      - done:   {}
    """
    if not question or not question.strip():
        yield ("error", {"message": "Intrebare goala"})
        yield ("done", {})
        return

    prompt = build_prompt(question, seqA, seqB)

    cmd = [
        CLAUDE_BIN,
        "-p",
        "--model", CLAUDE_MODEL,
        "--permission-mode", "bypassPermissions",
        "--allowedTools", "WebSearch",
        "--output-format", "stream-json",
        "--include-partial-messages",
        "--verbose",
        "--append-system-prompt", SYSTEM_PROMPT,
        prompt,
    ]

    env = os.environ.copy()
    q: queue.Queue = queue.Queue()

    def worker():
        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=env,
                text=True,
                bufsize=1,
            )
        except Exception as e:
            q.put(("error", {"message": f"Nu pot porni claude: {e}"}))
            q.put(("done", {}))
            return

        stderr_lines: list[str] = []

        def read_err():
            for line in proc.stderr:
                stderr_lines.append(line)

        threading.Thread(target=read_err, daemon=True).start()

        try:
            for line in proc.stdout:
                line = line.strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue

                et = ev.get("type")
                if et == "system":
                    q.put(("status", {"message": "asistent conectat"}))
                elif et == "stream_event":
                    se = ev.get("event", {})
                    if se.get("type") == "content_block_delta":
                        d = se.get("delta", {})
                        if d.get("type") == "text_delta":
                            q.put(("text", {"text": d.get("text", "")}))
                elif et == "result":
                    q.put(("meta", {
                        "cost_usd": ev.get("total_cost_usd"),
                        "duration_ms": ev.get("duration_ms"),
                    }))

            proc.wait(timeout=5)
            if proc.returncode not in (0, None):
                q.put(("error", {
                    "message": f"claude a iesit cu cod {proc.returncode}",
                    "stderr": "".join(stderr_lines)[-1000:],
                }))
        except Exception as e:
            q.put(("error", {"message": f"eroare streaming: {e}"}))
        finally:
            q.put(("done", {}))

    threading.Thread(target=worker, daemon=True).start()

    while True:
        evt, payload = q.get()
        yield (evt, payload)
        if evt == "done":
            return
