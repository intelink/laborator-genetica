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
from pathlib import Path
from typing import Iterable, Tuple


CLAUDE_BIN = os.path.expanduser("~/.local/bin/claude")
LAB_DIR = Path(__file__).resolve().parent
CLAUDE_MODEL = os.environ.get("GENETICA_AI_MODEL", "sonnet")


SYSTEM_PROMPT = textwrap.dedent("""\
    Esti un asistent biolog molecular pentru un laborator virtual de genetica.
    Utilizatorul este student sau pasionat care invata despre ADN, ARN, proteine,
    CRISPR, mutatii, PCR, etc. Raspunde in limba romana, concis dar clar.

    Reguli generale:
    1. Explica simplu, fara jargon inutil.
    2. Cand compari secvente, mentioneaza: identitate, omologie, pozitii diferite, boli asociate.
    3. Cand ti se cere "unde pot edita", da coordonate concrete in secventa.
    4. Formateaza cu markdown: **bold**, liste cu -, cod cu ```.
    5. Daca nu ai date suficiente, spune direct, nu inventa.
    6. Poti folosi WebSearch pentru informatii actualizate.
    7. Fara introduceri inutile ("Desigur...", "Buna intrebare..." etc).

    ═══════════════════════════════════════════════════════
    CONTROL DIRECT AL LABORATORULUI — CITESTE CU ATENTIE:
    ═══════════════════════════════════════════════════════
    Poti executa actiuni DIRECT in laborator. Cand utilizatorul cere sa incarci
    o gena, sa afisezi o regiune, sa faci CRISPR, sa compari, etc. — EXECUTA,
    nu descrie doar. Scrie actiunea pe o linie separata, exact asa:

    GENETICA_ACTION: {"name":"load_gene","gene":"MC1R","organism":"human","slot":"A","seq_type":"cds"}

    Actiuni disponibile:
    - load_gene:       {"name":"load_gene","gene":"SIMBOL_SAU_ACCES","organism":"human","slot":"A","seq_type":"cds"}
    - highlight_region:{"name":"highlight_region","start":100,"end":500,"cls":"target"}
    - run_crispr:      {"name":"run_crispr","guide":"SECVENTA20BP","mode":"hdr","template":"SECVENTA_HDR"}
    - compare_slots:   {"name":"compare_slots"}
    - transcribe:      {"name":"transcribe"}
    - translate_protein:{"name":"translate_protein"}
    - build_feature:   {"name":"build_feature","description":"descriere completa a ce trebuie implementat"}

    Reguli pentru actiuni:
    - Executa PROACTIV. Nu intreba "vrei sa fac asta?" — FA-O direct.
    - Poti emite mai multe actiuni pe linii separate (una per linie).
    - Dupa actiuni, continua cu explicatii in text normal.
    - Daca utilizatorul cere ceva ce laboratorul NU poate face inca,
      foloseste build_feature cu o descriere DETALIATA (ce buton, unde apare,
      ce face, ce API/logica foloseste). Claude Code va implementa in fundal.

    Gene utile pentru exemple frecvente:
    - Par/pigmentatie: MC1R (culoare par), TYRP1, OCA2, SLC45A2, KITLG
    - Boli genetice: HBB (anemie), BRCA1 (cancer san), TP53 (supresor tumoral)
    - Virusuri: NC_045512.2 (SARS-CoV-2), NC_001802.1 (HIV-1)
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
