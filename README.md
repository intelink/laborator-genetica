# Laborator Virtual de Genetică — AI Lab

Interfață holografică cu asistent AI Claude integrat. Caută gene reale, compară două secvențe, editează cu CRISPR, întreabă AI-ul orice.


Simulator educativ pentru genetică moleculară: ADN/ARN/proteină, CRISPR, digestie cu enzime de restricție, PCR, electroforeză pe gel. Frontend interactiv, backend Flask minimal.

**Port**: `8780`

## Ce face
- `server.py` — Flask: servește static `public/` + endpoint `/api/ai/ask` pentru asistent AI
- `asistent.py` — modul Python care spawnează `claude -p` în subprocess cu stream-json și transformă evenimentele în SSE
- `public/js/data.js` — constante: cod genetic, enzime de restricție, presetări
- `public/js/bio.js` — logică moleculară (transcriere, traducere, CRISPR, PCR, digestie)
- `public/js/app.js` — UI complet (slots A/B, comparație, căutare NCBI, chat AI, animații)
- `public/css/style.css` — design holografic cu glow, scan-line, particule de fundal, canvas animat

## Install rapid

```bash
git clone https://github.com/intelink/laborator-genetica.git
cd laborator-genetica
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python server.py
```

Deschide: http://localhost:8780

## Autostart
```bash
sudo cp laborator-genetica.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now laborator-genetica.service
```

## Module incluse
- **Bară de căutare globală** — tastezi gena, organism, Slot A/B → Enter → NCBI aduce CDS-ul
- **Slots A & B** — două "memorii" de secvențe, schimbi activul printr-un click
- **Comparație A↔B** — aliniere + % identitate + highlight diferențe
- **Asistent AI Claude** (panou dreapta, streaming) — întrebări despre înrudire, CRISPR, boli, domenii
- **ADN ↔ ARN ↔ Proteină** (transcripție, traducere, codul genetic)
- **CRISPR** (editare țintită, căutare PAM)
- **Enzime de restricție** (hartă de tăiere, digestie)
- **PCR** (amplificare, calcul Tm primeri)
- **Gel de electroforeză** (vizualizare mobilitate relativă)
- **UCSC Genome Browser** (secvențe genomice, cu introni)
- **NCBI RefSeq** (CDS sau mRNA, fără introni, direct traducibile)
- **Demo automat** — 6 pași animați (HBB normală vs falciformă + întrebare AI)

## Integrări cu baze de date publice

Laboratorul are două carduri de import de secvențe reale, complementare:

### 🌐 UCSC Genome Browser → secvențe **genomice**

API: `https://api.genome.ucsc.edu/` (CORS activat → client-side).

- Introduci simbolul genei + organism (hg38, mm39, rn7, danRer11, dm6, ce11, sacCer3) + lungime max
- Flow: `search` → coordonate genomice → `getData/sequence` → ADN
- Rezultat: **ADN genomic brut** (include introni + UTR + regiuni flancante)
- Bun pentru: studiul introni/exoni, promotori, regiuni non-coding, site-uri de restricție în context genomic
- Track-uri preferate (în ordine): `knownGene`, `mane`, `ncbiRefSeqCurated`

### 🧪 NCBI RefSeq → secvențe **mRNA / CDS**

API: `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/` (CORS activat → client-side).

- Introduci simbolul + organism (human, mouse, rat, zebrafish, fly, c.elegans, yeast, e.coli, arabidopsis) + tip
- Tip `CDS`: doar secvența codantă (ATG...stop) — direct traducibilă
- Tip `mRNA`: transcript complet cu UTR-uri 5' și 3'
- Flow: `esearch` cu filtru `refseq_select[filter]` → accession canonic → `efetch` FASTA
- Rezultat: secvență **procesată** (fără introni, spliced) — perfect pentru traducere la proteină
- Bun pentru: traducere ADN → proteină direct, studiul CDS, comparație mRNA vs. CDS

### Cum le folosești complementar
- **UCSC** → vezi gena în context genomic, găsește enzime de restricție care taie în introni vs. exoni
- **NCBI (CDS)** → încarcă CDS-ul aceleiași gene, apasă "Tradu" → obții proteina fără probleme de cadru de citire

Ambele rulează exclusiv în browser (zero trafic prin serverul Flask).

## Asistent AI (Claude)

Panoul din dreapta. Spawn local de `claude -p --model sonnet --output-format stream-json` prin `asistent.py`, evenimentele `text_delta` sunt transformate în SSE și livrate browserului.

Contextul trimis la fiecare întrebare:
- Slot A (nume + ADN, capat la 3000 bp)
- Slot B (dacă e încărcat)
- Întrebarea utilizatorului

Prompt presetate (butoane rotunjite deasupra chat-ului):
- "ce face?" — explică funcția genei
- "înrudire A↔B" — % identitate, omologie, interpretare evolutivă
- "unde editez cu CRISPR" — sugerează 2-3 ținte cu ghid 20bp + PAM NGG
- "boli asociate" — patologii și mutații cunoscute
- "compară proteine" — conservați vs schimbați
- "domenii funcționale" — poziții aproximative domenii

Claude are `WebSearch` activat, deci poate aduce info actualizate (domenii, boli, publicații).

Environment variables:
- `GENETICA_AI_MODEL` — default `sonnet`, poate fi `opus` pentru analiză mai profundă

## Arhitectură

```
 browser (index.html + app.js)
       │
       ├── fetch direct ──> api.genome.ucsc.edu    (secvențe genomice, CORS)
       ├── fetch direct ──> eutils.ncbi.nlm.nih.gov (CDS/mRNA + autocomplete, CORS)
       │
       └── POST /api/ai/ask ──> Flask (server.py)
                                   │
                                   ▼
                             asistent.py (subprocess claude -p)
                                   │
                                   ▼
                              stream-json → SSE text events
```
