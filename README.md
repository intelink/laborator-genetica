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

## Integrare UCSC Genome Browser

Cardul "🌐 UCSC Genome" permite descărcarea de secvențe reale din baza de date UCSC (https://genome.ucsc.edu/), direct din browser via API-ul lor public cu CORS (`https://api.genome.ucsc.edu/`).

Cum funcționează:
1. Introduci simbolul genei (ex. `HBB`, `BRCA1`, `TP53`, `INS`)
2. Alegi organismul (human hg38, mouse mm39, rat, zebrafish, Drosophila, C. elegans, yeast)
3. Alegi lungimea maximă (implicit 500 bp, util pentru că multe gene au zeci de kb cu introni)
4. Apeși "Descarcă" → face 2 request-uri la UCSC:
   - `search` — găsește pozițiile în genom pentru simbol (preferă `knownGene` > `mane` > `ncbiRefSeqCurated`)
   - `getData/sequence` — descarcă secvența din acele coordonate
5. Secvența se încarcă automat ca ADN activ → toate instrumentele (transcriere, CRISPR, restricție, PCR, gel) funcționează pe ea

Observații importante:
- Secvența e **genomică** (include introni, UTR-uri). Pentru CDS pur (fără introni) e nevoie de integrare adițională cu NCBI sau Ensembl.
- Dacă gena e pe firul minus (ex. multe gene umane), secvența vine ca firul sens al cromozomului — folosește "Complement invers" pentru a obține sensul transcris.
- Tot traficul merge direct browser → UCSC, serverul Flask NU intermediază.
