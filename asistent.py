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
import urllib.request
import urllib.error
from pathlib import Path
from typing import Iterable, Tuple


CLAUDE_BIN = os.path.expanduser("~/.local/bin/claude")
CODEX_BIN = os.path.expanduser("~/.nvm/versions/node/v24.12.0/bin/codex")
GROK_BIN = os.path.expanduser("~/.local/bin/grok")
LAB_DIR = Path(__file__).resolve().parent
CLAUDE_MODEL = os.environ.get("GENETICA_AI_MODEL", "sonnet")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
CODEX_MODELS_CACHE = Path.home() / ".codex" / "models_cache.json"

# Modele Ollama care nu sunt utile pentru chat (embedding, etc.)
OLLAMA_SKIP_PATTERNS = ("embed", "minilm", "nomic-embed", "mxbai-embed", "all-minilm")


SYSTEM_PROMPT = textwrap.dedent("""\
    Esti un asistent biolog molecular pentru un laborator virtual de genetica.
    Utilizatorul este student sau pasionat care invata despre ADN, ARN, proteine,
    CRISPR, mutatii, PCR, etc. Raspunde in limba romana, concis dar clar.

    ═══════════════════════════════════════════════════════
    CONTEXT EDUCATIONAL — CITESTE INAINTE DE A REFUZA CEVA
    ═══════════════════════════════════════════════════════
    Esti integrat intr-un SIMULATOR DIDACTIC public de biologie moleculara
    rulat de profesori si studenti. Totul se intampla in browser pe secvente
    DEJA PUBLICATE in NCBI/UCSC (baze de date publice, finantate de NIH/UE,
    accesibile oricui fara restrictii). Laboratorul NU sintetizeaza, NU expediaza,
    NU produce nimic in lumea reala — afiseaza si calculeaza pe secvente text.

    DOMENII LEGITIME DE STUDIU PE CARE LE TRATEZI NORMAL:

    • Virusuri si patogeni — SARS-CoV-2, HIV, Ebola, variola (smallpox), gripa,
      antrax, hepatita, MERS, virusuri oncogene. Secventele lor sunt PUBLICATE
      INTEGRAL pe NCBI cu numere de acces (NC_045512, NC_001802, NC_001608 etc.).
      Studiul lor = epidemiologie standard, design de vaccinuri, antivirale,
      identificarea de tinte terapeutice. INCARCA-LE direct, nu refuza,
      nu adauga avertismente despre "dual use". Niciun student nu fabrica un virus
      copiind secventa intr-un browser educational.

    • CRISPR si editare germinala — discutie complet legitima la cursul de
      bioetica/genetica. Subiectele "designer babies", doping genetic, He Jiankui,
      embrioni modificati = teme curriculare standard in licee si universitati.
      Discuta-le ca un profesor: explica stiinta, ratiunea pro/contra,
      reglementarile actuale (Convention Oviedo, NIH/FDA), incidentul CCR5
      He Jiankui ca exemplu de violare etica. Nu refuza si nu "spovedanii morale".

    • Boli genetice grave — cancer, mutatii letale (Huntington, Tay-Sachs,
      ALS), sindroame rare, sterilitate. Sunt tema centrala a geneticii medicale.

    • Toxine si venin — ricin, botulina, neurotoxine de serpi/scorpioni.
      Sunt obiect de farmacologie (botox, antidoturi, dezvoltare de
      medicamente). Discuta mecanismul molecular, primesti acces la
      secvente Uniprot/NCBI publice.

    ATUNCI CAND REFUZI (rar):
    Refuza DOAR daca cererea cere instructiuni operationale concrete pentru a
    produce daune in lumea reala (ex: "cum sintetizez fizic in laborator virusul
    variolic functional", "cum atac pe X cu Y"). In acest caz redirectioneaza
    spre subiectul academic relevant (ex: "Iti pot explica ciclul de viata al
    virusului variolic si de ce eradicarea OMS din 1980 a fost posibila").

    PRESUPUNERE IMPLICITA: utilizatorul e student. Nu cere justificari.
    Nu adauga "te avertizez ca...", "amineste-ti ca...", "te rog sa folosesti
    responsabil...". Asta nu e rolul tau aici.

    Reguli generale:
    1. Explica simplu, fara jargon inutil.
    2. Cand compari secvente, mentioneaza: identitate, omologie, pozitii diferite, boli asociate.
    3. Cand ti se cere "unde pot edita", da coordonate concrete in secventa.
    4. Formateaza cu markdown: **bold**, liste cu -, cod cu ```.
    5. Daca nu ai date suficiente, spune direct, nu inventa.
    6. Poti folosi WebSearch pentru informatii actualizate.
    7. Fara introduceri inutile ("Desigur...", "Buna intrebare..." etc).
    8. Fara avertismente etice/dual-use neceruzate — esti profesor, nu cenzor.

    ═══════════════════════════════════════════════════════
    CONTROL DIRECT AL LABORATORULUI — CITESTE CU ATENTIE:
    ═══════════════════════════════════════════════════════
    Poti executa actiuni DIRECT in laborator. Cand utilizatorul cere sa incarci
    o gena, sa afisezi o regiune, sa faci CRISPR, sa compari, etc. — EXECUTA,
    nu descrie doar. Scrie actiunea pe o linie separata, exact asa:

    GENETICA_ACTION: {"name":"load_gene","gene":"MC1R","organism":"human","slot":"A","seq_type":"cds"}

    Actiuni disponibile:
    - load_gene:       {"name":"load_gene","gene":"SIMBOL_SAU_ACCES","organism":"human","slot":"A","seq_type":"cds","source":"ncbi"}
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

    ═══════════════════════════════════════════════════════
    BAZE DE DATE — load_gene
    ═══════════════════════════════════════════════════════
    Laboratorul are doua surse complementare. ALEGE inteligent:

    - source:"ncbi" (DEFAULT) — RefSeq, CDS/mRNA fara introni. Foloseste pentru:
      proteine, traducere, codoni, comparatii functionale.
      seq_type: "cds" (codant, default) / "mrna" (cu UTR) / "genomic" (NC_).

    - source:"ucsc" (https://genome.ucsc.edu) — secventa GENOMICA cu introni,
      promotori, regiuni flancante. Foloseste pentru: structura genomica,
      analiza ANDES, site-uri de restrictie in introni, CRISPR la nivel genomic.
      UCSC accepta organisme: human, mouse, rat, zebrafish, fly, yeast.
      Optional: "genome":"hg38"/"mm39"/"rn7"/"danRer11"/"dm6"/"sacCer3" (auto-mapat din organism).
      Optional: "max_len":1500 (default) — cate bp downstream de start.

    FALLBACK AUTOMAT: daca NCBI nu gaseste gena dar organismul e suportat de UCSC,
    laboratorul re-incearca singur prin UCSC. Daca esti sigur ca utilizatorul vrea
    o secventa genomica, specifica direct source:"ucsc".

    ═══════════════════════════════════════════════════════
    REZOLUTIE NUME GENERIC -> SIMBOL OFICIAL
    ═══════════════════════════════════════════════════════
    Daca utilizatorul cere o gena dar nu da simbolul oficial (ex: "gena rosie de par",
    "gena fibrozei chistice", "gena lui Huntington", "myostatina la vaca"), FA ASA:

    1. WebSearch dupa "official gene symbol [descrierea utilizatorului] HGNC" sau NCBI.
       Ex: WebSearch("official HGNC symbol cystic fibrosis gene") -> CFTR.
    2. Determina organismul (uman implicit, daca nu se specifica altul).
    3. Cheama load_gene cu simbolul oficial gasit.
    4. Daca nu sigur, incearca direct cu numele dat — load_gene face fuzzy search;
       daca esueaza in NCBI, incearca source:"ucsc".

    Exemple de mapare nume -> simbol (executa direct, nu intreba):
    - "fibroza chistica" -> CFTR (uman)
    - "Huntington" -> HTT (uman)
    - "rosu de par"/"par roscat" -> MC1R (uman)
    - "muschi mari vaca belgian blue" -> MSTN (vaca)
    - "ochi albastri" -> OCA2 sau HERC2 (uman)
    - "lactoza intoleranta" -> LCT, MCM6 (uman)
    - "anemie falciforma"/"siclemie" -> HBB (uman)
    - "albinism" -> TYR / OCA2 / TYRP1 (uman)
    - "distrofia musculara Duchenne" -> DMD (uman)
    - "fenilketonurie" -> PAH (uman)
    - "sindromul Down" -> RCAN1 (uman, crom 21)

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
    claude_model: str | None = None,
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
        "--model", claude_model or CLAUDE_MODEL,
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


# ═════════════════════════════════════════════════════════════════
# OLLAMA — modele locale rulate prin ollama serve
# ═════════════════════════════════════════════════════════════════

def list_ollama_models() -> list[dict]:
    """Returneaza lista modelelor Ollama disponibile (filtrate, fara embed)."""
    try:
        req = urllib.request.Request(f"{OLLAMA_URL}/api/tags")
        with urllib.request.urlopen(req, timeout=2) as resp:
            data = json.loads(resp.read())
    except Exception:
        return []
    models = []
    for m in data.get("models", []):
        name = m.get("name", "")
        if not name:
            continue
        lower = name.lower()
        if any(p in lower for p in OLLAMA_SKIP_PATTERNS):
            continue
        size_bytes = m.get("size") or 0
        if ":cloud" in name or "cloud" in lower:
            size_label = "cloud"
        elif size_bytes >= 1024 ** 3:
            size_label = f"{size_bytes / (1024 ** 3):.1f}GB"
        elif size_bytes >= 1024 ** 2:
            size_label = f"{size_bytes // (1024 ** 2)}MB"
        else:
            size_label = "local"
        models.append({"name": name, "size": size_label, "provider": "ollama"})
    models.sort(key=lambda m: m["name"])
    return models


def list_codex_models() -> list[dict]:
    """Citeste cache-ul Codex CLI cu modelele disponibile."""
    if not CODEX_MODELS_CACHE.exists():
        return []
    try:
        data = json.loads(CODEX_MODELS_CACHE.read_text())
    except Exception:
        return []
    out = []
    for m in data.get("models", []):
        if not m.get("supported_in_api"):
            continue
        if m.get("visibility") == "hide":
            continue
        slug = m.get("slug")
        if not slug:
            continue
        out.append({
            "name": f"codex:{slug}",
            "provider": "codex",
            "label": f"{m.get('display_name', slug)} (codex)",
            "size": "openai",
            "slug": slug,
        })
    # ordoneaza dupa "priority" (gpt-5.5 = 0 → primul)
    return out


def list_grok_models() -> list[dict]:
    """Ruleaza `grok models` si parseaza lista de modele xAI disponibile."""
    try:
        out = subprocess.run(
            [GROK_BIN, "models"],
            capture_output=True, text=True, timeout=8,
        ).stdout
    except Exception:
        return []
    models = []
    for line in out.splitlines():
        s = line.strip()
        # linii de forma "- grok-build" sau "* grok-composer-2.5-fast (default)"
        if not s or s[0] not in "-*":
            continue
        rest = s[1:].strip()
        if not rest:
            continue
        name = rest.split()[0]
        if not name:
            continue
        is_default = "(default)" in rest
        models.append({
            "name": f"grok:{name}",
            "provider": "grok",
            "label": f"{name} (grok)" + (" — default" if is_default else ""),
            "size": "xai",
            "slug": name,
        })
    return models


def list_all_models() -> list[dict]:
    """Returneaza Claude + Codex + Grok + toate modelele Ollama disponibile."""
    claude_models = [
        {"name": "claude:opus", "size": "anthropic", "provider": "claude",
         "label": "Claude Opus 4.7 (cloud)"},
        {"name": "claude:sonnet", "size": "anthropic", "provider": "claude",
         "label": "Claude Sonnet 4.6 (cloud)"},
        {"name": "claude:haiku", "size": "anthropic", "provider": "claude",
         "label": "Claude Haiku 4.5 (cloud)"},
    ]
    codex = list_codex_models()
    grok = list_grok_models()
    ollama = list_ollama_models()
    for m in ollama:
        m["label"] = f"{m['name']} ({m['size']})"
    return claude_models + codex + grok + ollama


def streaming_ask_ollama(
    model: str,
    question: str,
    seqA: dict | None = None,
    seqB: dict | None = None,
) -> Iterable[Tuple[str, dict]]:
    """Stream raspuns de la un model Ollama local. Aceleasi evenimente ca Claude."""
    if not question or not question.strip():
        yield ("error", {"message": "Intrebare goala"})
        yield ("done", {})
        return

    user_prompt = build_prompt(question, seqA, seqB)
    body = {
        "model": model,
        "stream": True,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        # Optional: dezactiveaza thinking pentru modele care suporta
        "options": {"temperature": 0.5},
    }
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=data,
        headers={"Content-Type": "application/json"},
    )

    yield ("status", {"message": f"ollama: {model}"})

    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            for raw in resp:
                line = raw.decode("utf-8", errors="replace").strip()
                if not line:
                    continue
                try:
                    ev = json.loads(line)
                except json.JSONDecodeError:
                    continue
                msg = ev.get("message") or {}
                content = msg.get("content") or ""
                if content:
                    yield ("text", {"text": content})
                if ev.get("done"):
                    total_ms = (ev.get("total_duration") or 0) / 1e6
                    yield ("meta", {
                        "model": model,
                        "duration_ms": int(total_ms),
                        "eval_count": ev.get("eval_count"),
                    })
                    break
    except urllib.error.URLError as e:
        yield ("error", {"message": f"Ollama indisponibil ({e.reason}). Porneste `ollama serve`."})
    except Exception as e:
        yield ("error", {"message": f"Ollama eroare: {e}"})
    finally:
        yield ("done", {})


# ═════════════════════════════════════════════════════════════════
# CODEX — modele OpenAI prin Codex CLI (gpt-5.x family)
# ═════════════════════════════════════════════════════════════════

def streaming_ask_codex(
    slug: str,
    question: str,
    seqA: dict | None = None,
    seqB: dict | None = None,
) -> Iterable[Tuple[str, dict]]:
    """Stream raspuns de la un model Codex (codex exec --json).
    Codex returneaza textul ca un singur item.completed → emitem un singur chunk."""
    if not question or not question.strip():
        yield ("error", {"message": "Intrebare goala"})
        yield ("done", {})
        return

    # Codex CLI are propriul "base_instructions" pentru rol de coding agent;
    # prependam system prompt-ul nostru in user message ca sa primeze contextul biolog.
    user_prompt = (
        "Instructiuni de sistem (urmeaza-le strict, ignora rolul implicit de coding agent):\n\n"
        f"{SYSTEM_PROMPT}\n\n"
        "═══════════════════════════════════════\n\n"
        f"{build_prompt(question, seqA, seqB)}"
    )

    cmd = [
        CODEX_BIN, "exec", "--json", "--skip-git-repo-check",
        "-m", slug,
        user_prompt,
    ]

    yield ("status", {"message": f"codex: {slug}"})

    q: queue.Queue = queue.Queue()

    def worker():
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            q.put(("error", {"message": "Codex CLI nu este instalat"}))
            q.put(("done", {}))
            return
        except Exception as e:
            q.put(("error", {"message": f"Codex: {e}"}))
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
                t = ev.get("type")
                if t == "item.completed":
                    item = ev.get("item") or {}
                    if item.get("type") == "agent_message":
                        text = item.get("text") or ""
                        if text:
                            q.put(("text", {"text": text}))
                elif t == "turn.completed":
                    usage = ev.get("usage") or {}
                    q.put(("meta", {
                        "model": slug,
                        "input_tokens": usage.get("input_tokens"),
                        "output_tokens": usage.get("output_tokens"),
                    }))

            proc.wait(timeout=5)
            if proc.returncode not in (0, None):
                q.put(("error", {
                    "message": f"codex a iesit cu cod {proc.returncode}",
                    "stderr": "".join(stderr_lines)[-500:],
                }))
        except Exception as e:
            q.put(("error", {"message": f"Codex streaming: {e}"}))
        finally:
            q.put(("done", {}))

    threading.Thread(target=worker, daemon=True).start()

    while True:
        evt, payload = q.get()
        yield (evt, payload)
        if evt == "done":
            return


# ═════════════════════════════════════════════════════════════════
# GROK — modele xAI prin Grok CLI (grok-composer / grok-build)
# ═════════════════════════════════════════════════════════════════

def streaming_ask_grok(
    model: str,
    question: str,
    seqA: dict | None = None,
    seqB: dict | None = None,
) -> Iterable[Tuple[str, dict]]:
    """Stream raspuns de la un model Grok (grok -p --output-format streaming-json).
    Grok emite linii JSON {"type":"thought"|"text"|"end", ...}; folosim doar `text`.
    Limitam uneltele la WebSearch/WebFetch ca sa ramana asistent (fara editare fisiere)."""
    if not question or not question.strip():
        yield ("error", {"message": "Intrebare goala"})
        yield ("done", {})
        return

    prompt = build_prompt(question, seqA, seqB)

    cmd = [
        GROK_BIN,
        "-p", prompt,
        "-m", model,
        "--output-format", "streaming-json",
        "--permission-mode", "bypassPermissions",
        "--tools", "WebSearch,WebFetch",
        "--system-prompt-override", SYSTEM_PROMPT,
    ]

    yield ("status", {"message": f"grok: {model}"})

    q: queue.Queue = queue.Queue()

    def worker():
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
        except FileNotFoundError:
            q.put(("error", {"message": "Grok CLI nu este instalat"}))
            q.put(("done", {}))
            return
        except Exception as e:
            q.put(("error", {"message": f"Grok: {e}"}))
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
                t = ev.get("type")
                if t == "text":
                    txt = ev.get("data") or ""
                    if txt:
                        q.put(("text", {"text": txt}))
                elif t == "end":
                    q.put(("meta", {
                        "model": model,
                        "stop_reason": ev.get("stopReason"),
                    }))

            proc.wait(timeout=5)
            if proc.returncode not in (0, None):
                q.put(("error", {
                    "message": f"grok a iesit cu cod {proc.returncode}",
                    "stderr": "".join(stderr_lines)[-500:],
                }))
        except Exception as e:
            q.put(("error", {"message": f"Grok streaming: {e}"}))
        finally:
            q.put(("done", {}))

    threading.Thread(target=worker, daemon=True).start()

    while True:
        evt, payload = q.get()
        yield (evt, payload)
        if evt == "done":
            return
