# Laborator Virtual de Genetică

Simulator educativ pentru genetică moleculară: ADN/ARN/proteină, CRISPR, digestie cu enzime de restricție, PCR, electroforeză pe gel. Frontend interactiv, backend Flask minimal.

**Port**: `8780`

## Ce face
- `server.py` — Flask minimal care servește static `public/` și răspunde cu simulări simple (calcule simple de genetică: transcripție, traducere etc.)
- `public/` — pagini HTML + JS pentru fiecare instrument (CRISPR, restricție, PCR, gel).

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
- **ADN ↔ ARN ↔ Proteină** (transcripție, traducere, codul genetic)
- **CRISPR** (editare țintită, căutare PAM)
- **Enzime de restricție** (hartă de tăiere, digestie)
- **PCR** (amplificare, calcul Tm primeri)
- **Gel de electroforeză** (vizualizare mobilitate relativă)
- **UCSC Genome Browser** (încarcă gene reale direct din baza de date publică)

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
