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
