// === LOGICA MOLECULARA ===
// Toate functiile lucreaza pe siruri ADN (A/T/G/C). ARN = inlocuieste T cu U.
(function(){

const { CODON_TABLE, AA_INFO, RESTRICTION_ENZYMES } = window.GeneticaData;

function cleanSeq(s) {
  return (s || '').toUpperCase().replace(/[^ATGC]/g, '');
}

function complement(s) {
  const m = { A: 'T', T: 'A', G: 'C', C: 'G' };
  return [...cleanSeq(s)].map(b => m[b] || 'N').join('');
}

function reverseComplement(s) {
  return complement(s).split('').reverse().join('');
}

function transcribe(dna) {
  return cleanSeq(dna).replace(/T/g, 'U');
}

function translate(dnaOrRna, frame = 0) {
  const s = dnaOrRna.replace(/U/g, 'T').toUpperCase().replace(/[^ATGC]/g, '');
  const prot = [];
  for (let i = frame; i + 3 <= s.length; i += 3) {
    const c = s.substr(i, 3);
    const aa = CODON_TABLE[c] || 'X';
    prot.push(aa);
    if (aa === '*') break;
  }
  return prot.join('');
}

// Gaseste primul ATG downstream si traduce de acolo
function findORFAndTranslate(dna) {
  const s = cleanSeq(dna);
  for (let f = 0; f < 3; f++) {
    for (let i = f; i + 3 <= s.length; i += 3) {
      if (s.substr(i, 3) === 'ATG') {
        return { start: i, frame: f, protein: translate(s.slice(i), 0) };
      }
    }
  }
  return { start: -1, frame: 0, protein: translate(s, 0) };
}

// Taie cu o enzima de restrictie. Intoarce lista de fragmente (secvente) + pozitii taiere.
function cutWithEnzyme(dna, enzymeName) {
  const enz = RESTRICTION_ENZYMES[enzymeName];
  if (!enz) return { fragments: [cleanSeq(dna)], sites: [] };
  const s = cleanSeq(dna);
  const sites = [];
  let idx = 0;
  while ((idx = s.indexOf(enz.site, idx)) !== -1) {
    sites.push({ start: idx, cut: idx + enz.cut, site: enz.site });
    idx += 1;
  }
  if (!sites.length) return { fragments: [s], sites: [], enzyme: enz };
  const frags = [];
  let prev = 0;
  for (const s2 of sites) {
    frags.push(s.slice(prev, s2.cut));
    prev = s2.cut;
  }
  frags.push(s.slice(prev));
  return { fragments: frags, sites, enzyme: enz };
}

// Mutatie punctuala
function pointMutation(dna, pos, newBase) {
  const s = cleanSeq(dna);
  if (pos < 0 || pos >= s.length) return { seq: s, ok: false, reason: 'pozitie invalida' };
  if (!'ATGC'.includes(newBase)) return { seq: s, ok: false, reason: 'baza invalida' };
  const old = s[pos];
  const out = s.slice(0, pos) + newBase + s.slice(pos + 1);
  return { seq: out, ok: true, old, new: newBase, pos };
}

// Insertie / deletie (produce frameshift cand lungimea nu e multiplu de 3)
function indel(dna, pos, insertSeq, deleteLen) {
  const s = cleanSeq(dna);
  const left = s.slice(0, pos);
  const right = s.slice(pos + (deleteLen || 0));
  const ins = cleanSeq(insertSeq || '');
  const out = left + ins + right;
  return { seq: out, delta: ins.length - (deleteLen || 0) };
}

// Clasifica mutatia dupa efectul asupra proteinei (fata de secventa originala)
function classifyMutation(oldDNA, newDNA) {
  const oldProt = findORFAndTranslate(oldDNA).protein;
  const newProt = findORFAndTranslate(newDNA).protein;
  const oldClean = oldProt.replace(/\*$/, '');
  const newClean = newProt.replace(/\*$/, '');
  if (oldDNA.length !== newDNA.length) {
    if (Math.abs(oldDNA.length - newDNA.length) % 3 === 0) return { type: 'in-frame indel', oldProt, newProt };
    return { type: 'frameshift', oldProt, newProt };
  }
  if (oldProt === newProt) return { type: 'silent', oldProt, newProt };
  if (newClean.length < oldClean.length) return { type: 'nonsense', oldProt, newProt };
  // compara pozitie cu pozitie
  let firstDiff = -1;
  for (let i = 0; i < Math.min(oldProt.length, newProt.length); i++) {
    if (oldProt[i] !== newProt[i]) { firstDiff = i; break; }
  }
  return { type: 'missense', oldProt, newProt, firstDiff };
}

// CRISPR / Cas9: gaseste target-ul (guide de 20 bp) + PAM NGG pe ambele fire. Taie 3 bp upstream PAM.
// editType: 'knockout' (NHEJ indel ~3-8 bp deletie) sau 'hdr' (introduce template)
function crisprCut(dna, guide20, editType = 'knockout', template = '') {
  const s = cleanSeq(dna);
  const g = cleanSeq(guide20);
  if (g.length !== 20) return { ok: false, reason: 'ghidul trebuie sa aiba exact 20 bp' };

  // Cauta match pe firul sens: target = guide, urmat de NGG (orice + GG)
  const hits = [];
  for (let i = 0; i <= s.length - 23; i++) {
    const target = s.substr(i, 20);
    const pam = s.substr(i + 20, 3);
    if (target === g && pam[1] === 'G' && pam[2] === 'G') {
      hits.push({ strand: '+', start: i, pam: i + 20, cut: i + 17 });
    }
  }
  // Cauta pe firul antisens: reverse-complement(g) urmat de NGG pe complement
  const rc = reverseComplement(g);
  for (let i = 0; i <= s.length - 23; i++) {
    // target pe firul de jos = rc pe firul de sus, DAR PAM-ul e pe firul de jos → CCN pe firul de sus
    const pam5 = s.substr(i, 3);  // ar fi CCN pe firul de sus
    const target = s.substr(i + 3, 20);
    if (target === rc && pam5[0] === 'C' && pam5[1] === 'C') {
      hits.push({ strand: '-', start: i + 3, pam: i, cut: i + 6 });
    }
  }

  if (!hits.length) return { ok: false, reason: 'ghidul nu are target in secventa (cu PAM NGG)' };

  // Aplica prima taiere (pentru simplitate — experiment deterministic)
  const hit = hits[0];
  let newSeq;
  if (editType === 'knockout') {
    // NHEJ: indel random ~3-8 bp. Ca sa fie reproductibil, folosim delete fix de 4 bp la cut site.
    newSeq = s.slice(0, hit.cut - 2) + s.slice(hit.cut + 2);
  } else if (editType === 'hdr') {
    const tmpl = cleanSeq(template);
    newSeq = s.slice(0, hit.cut) + tmpl + s.slice(hit.cut);
  } else {
    newSeq = s;
  }
  return { ok: true, hits, applied: hit, newSeq, editType };
}

// PCR: cauta primerul forward (5'→3' pe firul sens) si reverse (5'→3' pe firul antisens, deci RC pe firul sens).
// Produce amplicon = [start_fwd..end_rev] (inclusiv primerii).
function pcr(dna, fwd, rev) {
  const s = cleanSeq(dna);
  const f = cleanSeq(fwd);
  const r = cleanSeq(rev);
  const rcRev = reverseComplement(r);
  const startF = s.indexOf(f);
  const startRc = s.indexOf(rcRev);
  if (startF === -1) return { ok: false, reason: 'primer forward nu se leaga' };
  if (startRc === -1) return { ok: false, reason: 'primer reverse nu se leaga (nu exista RC pe firul sens)' };
  if (startRc + rcRev.length < startF) return { ok: false, reason: 'primerii se leaga in ordine gresita' };
  const amplicon = s.slice(startF, startRc + rcRev.length);
  return { ok: true, amplicon, startF, endR: startRc + rcRev.length };
}

// Gel electroforeza: intoarce benzile sortate descrescator dupa marime
// (migrate: invers proportional cu lungimea, simplificat liniar).
function gelBands(fragments) {
  const sizes = fragments.map(f => f.length).filter(L => L > 0);
  return sizes.sort((a, b) => b - a);
}

// SeqVerify: valideaza integritatea unei secvente ADN.
// Returneaza lista de checks cu status 'ok'|'warn'|'fail' + statistici.
function verifySeq(rawDna) {
  const upper = (rawDna || '').toUpperCase();
  const stripped = upper.replace(/\s/g, '');
  const dna = stripped.replace(/[^ATGC]/g, '');
  const ambiguous = stripped.length - dna.length;
  const checks = [];

  const add = (id, label, status, detail) => checks.push({ id, label, status, detail });

  add('valid_bases', 'Baze valide (A/T/G/C)',
    ambiguous === 0 ? 'ok' : ambiguous <= 5 ? 'warn' : 'fail',
    ambiguous === 0 ? 'Toate bazele sunt A/T/G/C'
      : ambiguous + ' caractere ambigue eliminate din secventa');

  add('length', 'Lungime minima (≥9 bp)',
    dna.length >= 9 ? 'ok' : 'fail',
    dna.length + ' bp' + (dna.length < 9 ? ' — prea scurta pentru un ORF' : ''));

  const gcCount = (dna.match(/[GC]/g) || []).length;
  const gcPct = dna.length > 0 ? Math.round(gcCount / dna.length * 100) : 0;
  add('gc_content', 'GC content (30–75%)',
    gcPct >= 30 && gcPct <= 75 ? 'ok' : 'warn',
    gcPct + '%' + (gcPct < 30 ? ' — AT-bogata (posibil organism cu GC scazut)' : gcPct > 75 ? ' — GC-bogata' : ' — in parametri normali'));

  const orf = findORFAndTranslate(dna);
  add('start_codon', 'Codon start ATG',
    orf.start >= 0 ? 'ok' : 'fail',
    orf.start >= 0
      ? 'ATG la pozitia ' + orf.start + ' (frame ' + orf.frame + ')'
      : 'Niciun ATG gasit in secventa');

  let passed = 0, warned = 0, failed = 0;

  if (orf.start >= 0) {
    const prot = orf.protein;
    const hasStop = prot.endsWith('*');
    const internalStops = (prot.replace(/\*$/, '').match(/\*/g) || []).length;
    const aaCount = prot.replace(/\*$/, '').length;
    const stopPos = hasStop ? orf.start + prot.length * 3 : -1;

    add('stop_codon', 'Codon stop (TAA/TAG/TGA)',
      hasStop ? 'ok' : 'warn',
      hasStop ? 'Stop la pozitia ' + (stopPos - 3) + '–' + stopPos : 'ORF incomplet — lipseste codonul stop');

    add('no_internal_stops', 'Fara stop codoni prematuri',
      internalStops === 0 ? 'ok' : 'fail',
      internalStops === 0 ? 'ORF fara intreruperi'
        : internalStops + ' stop codon' + (internalStops > 1 ? 'i' : '') + ' prematuri — posibil pseudogena sau secventa incompleta');

    add('protein_length', 'Proteina sintetizata',
      aaCount >= 50 ? 'ok' : aaCount > 0 ? 'warn' : 'fail',
      aaCount > 0
        ? aaCount + ' aminoacizi' + (aaCount < 50 ? ' (proteina scurta, posibil fragment)' : '')
        : 'Nicio proteina detectata');
  }

  for (const c of checks) {
    if (c.status === 'ok') passed++;
    else if (c.status === 'warn') warned++;
    else failed++;
  }

  return {
    dna, checks, orf, gcPct, ambiguous,
    passed, warned, failed, total: checks.length,
    protein: orf.protein || '',
  };
}

// GUIDE-Seq Off-target Pipeline
// ----------------------------------------------------------
// Cauta locuri din genom unde Cas9 ar putea taia "nedorit", chiar daca
// secventa nu se potriveste perfect cu ghidul. Permite:
//  - mismatch-uri (substitutii)
//  - DNA bulge (target are o baza in plus fata de ghid)
//  - RNA bulge (ghidul are o baza in plus fata de target)
// PAM acceptat: NGG (canonic) si optional NAG (relaxat).
// Scor de risc inspirat din CFD: mismatch-urile in regiunea seed (PAM-proximala)
// au penalizare mai mare decat cele PAM-distale. Bulge-urile au penalizare fixa.

function _pamType(triplet) {
  if (!triplet || triplet.length !== 3) return null;
  if (triplet[1] === 'G' && triplet[2] === 'G') return 'NGG';
  if (triplet[1] === 'A' && triplet[2] === 'G') return 'NAG';
  return null;
}

// Greutate per pozitie (0 = PAM-distal, 19 = PAM-proximal/seed)
function _posWeight(i) { return 0.25 + 0.75 * (i / 19); }

function _alignAndScore(guide, target, bulge) {
  // guide si target au lungime 20 dupa aplicarea bulge-ului (daca exista)
  let totalW = 0, missW = 0;
  const mmPos = [];
  for (let i = 0; i < 20; i++) {
    const w = _posWeight(i);
    totalW += w;
    if (guide[i] !== target[i]) {
      missW += w;
      mmPos.push(i);
    }
  }
  // Penalizare suplimentara pentru bulge (RNA bulge mai dur decat DNA)
  let bulgePenalty = 0;
  if (bulge) {
    bulgePenalty = bulge.type === 'RNA' ? 0.55 : 0.40;
    // bulge-urile in seed sunt mai daunatoare
    if (bulge.pos >= 12) bulgePenalty *= 1.5;
  }
  const cleavage = Math.max(0, 1 - (missW + bulgePenalty) / totalW);
  return { mismatches: mmPos, cleavage };
}

function _hitKey(strand, start, end) { return strand + ':' + start + ':' + end; }

function findOffTargets(dna, guide20, opts) {
  opts = opts || {};
  const maxMM = opts.maxMismatches != null ? opts.maxMismatches : 4;
  const allowBulges = opts.allowBulges !== false;
  const includeNAG = opts.includeNAG !== false;

  const s = cleanSeq(dna);
  const g = cleanSeq(guide20);
  if (g.length !== 20) return { ok: false, reason: 'ghidul trebuie sa aiba exact 20 bp' };
  if (s.length < 23) return { ok: false, reason: 'secventa prea scurta (<23 bp)' };

  const rcS = reverseComplement(s);
  const N = s.length;
  const hits = [];
  const seen = new Set();

  function pushHit(strand, start, end, target, pam, pamType, alignedTarget, alignedGuide, bulge, scoreInfo) {
    const key = _hitKey(strand, start, end);
    if (seen.has(key)) return;
    seen.add(key);
    // PAM-ul NAG produce taiere mai slaba — penalizam scorul cu factor
    const pamFactor = pamType === 'NGG' ? 1.0 : 0.30;
    const score = Math.round(scoreInfo.cleavage * pamFactor * 100);
    const totalEdits = scoreInfo.mismatches.length + (bulge ? 1 : 0);
    let risk;
    if (totalEdits === 0 && pamType === 'NGG') risk = 'on-target';
    else if (score >= 40) risk = 'high';
    else if (score >= 15) risk = 'moderate';
    else risk = 'low';
    hits.push({
      strand, start, end,
      target, pam, pamType,
      alignedTarget, alignedGuide,
      mismatches: scoreInfo.mismatches.slice(),
      bulge,
      score, risk,
      onTarget: totalEdits === 0 && pamType === 'NGG',
    });
  }

  function scanStrand(seq, strand) {
    const L = seq.length;
    for (let i = 0; i <= L - 23; i++) {
      const target = seq.substr(i, 20);
      const pam = seq.substr(i + 20, 3);
      const ptype = _pamType(pam);
      if (!ptype) {
        // try bulged windows too
      } else if (includeNAG || ptype === 'NGG') {
        const sc = _alignAndScore(g, target, null);
        if (sc.mismatches.length <= maxMM) {
          const realStart = strand === '+' ? i : N - i - 23;
          const realEnd = realStart + 23;
          pushHit(strand, realStart, realEnd, target, pam, ptype, target, g, null, sc);
        }
      }
      if (!allowBulges) continue;

      // DNA bulge: target are 21 nt, ghidul 20. Stergem o baza din target.
      if (i + 24 <= L) {
        const target21 = seq.substr(i, 21);
        const pamDB = seq.substr(i + 21, 3);
        const ptypeDB = _pamType(pamDB);
        if (ptypeDB && (includeNAG || ptypeDB === 'NGG')) {
          for (let b = 1; b < 20; b++) {
            const aligned = target21.slice(0, b) + target21.slice(b + 1);
            const sc = _alignAndScore(g, aligned, { type: 'DNA', pos: b });
            if (sc.mismatches.length <= maxMM - 1) {
              const realStart = strand === '+' ? i : N - i - 24;
              const realEnd = realStart + 24;
              const alignedT = target21.slice(0, b) + '-' + target21.slice(b);
              const alignedG = g.slice(0, b) + g[b - 1] + g.slice(b);
              pushHit(strand, realStart, realEnd, target21, pamDB, ptypeDB,
                alignedT, alignedG.slice(0, 21), { type: 'DNA', pos: b }, sc);
            }
          }
        }
      }
      // RNA bulge: ghidul are 20, target are 19. Stergem o baza din ghid pt aliniere.
      if (i + 22 <= L) {
        const target19 = seq.substr(i, 19);
        const pamRB = seq.substr(i + 19, 3);
        const ptypeRB = _pamType(pamRB);
        if (ptypeRB && (includeNAG || ptypeRB === 'NGG')) {
          for (let b = 1; b < 20; b++) {
            const alignedG19 = g.slice(0, b) + g.slice(b + 1);
            const sc = _alignAndScore(alignedG19, target19, { type: 'RNA', pos: b });
            if (sc.mismatches.length <= maxMM - 1) {
              const realStart = strand === '+' ? i : N - i - 22;
              const realEnd = realStart + 22;
              const alignedT = target19.slice(0, b) + '-' + target19.slice(b);
              const alignedG = g.slice(0, 20);
              pushHit(strand, realStart, realEnd, target19, pamRB, ptypeRB,
                alignedT, alignedG, { type: 'RNA', pos: b }, sc);
            }
          }
        }
      }
    }
  }

  scanStrand(s, '+');
  scanStrand(rcS, '-');

  // Sortare: on-target inainte, apoi dupa scor descrescator
  hits.sort((a, b) => {
    if (a.onTarget !== b.onTarget) return a.onTarget ? -1 : 1;
    return b.score - a.score;
  });

  const stats = {
    total: hits.length,
    onTarget: hits.filter(h => h.onTarget).length,
    high: hits.filter(h => !h.onTarget && h.risk === 'high').length,
    moderate: hits.filter(h => h.risk === 'moderate').length,
    low: hits.filter(h => h.risk === 'low').length,
  };

  return { ok: true, hits, stats, guide: g, params: { maxMM, allowBulges, includeNAG } };
}

// ============================================================
// ANDES — Adaptive Nonsupervised Detection by FDA
// ============================================================
// Detecteaza regiuni genomice anormale FARA o lista de editari prestabilita.
// Inspiratie: Functional Data Analysis. Calculam mai multe semnale
// (GC content, entropie Shannon, GC/AT skew, CpG O/E) prin ferestre glisante,
// le netezim, apoi luam derivata 1 ("viteza") si derivata 2 ("acceleratia").
// Z-scoram fiecare derivata si combinam => scor compozit de anomalie.
// Ferestrele consecutive cu scor compozit > prag => anomalie detectata.
// Clasificare automata dupa care semnal contribuie cel mai mult.

function _shannonEntropy(counts, win) {
  let H = 0;
  for (const k of 'ATGC') {
    const p = counts[k] / win;
    if (p > 0) H -= p * Math.log2(p);
  }
  return H;
}

function _smoothArr(arr) {
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = arr[Math.max(0, i - 1)];
    const b = arr[i];
    const c = arr[Math.min(n - 1, i + 1)];
    out[i] = (a + 2 * b + c) / 4;
  }
  return out;
}

function _deriv1(arr, h) {
  const n = arr.length;
  const v = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) v[i] = (arr[i + 1] - arr[i - 1]) / (2 * h);
  if (n > 1) { v[0] = v[1]; v[n - 1] = v[n - 2]; }
  return v;
}

function _deriv2(arr, h) {
  const n = arr.length;
  const a = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) a[i] = (arr[i + 1] - 2 * arr[i] + arr[i - 1]) / (h * h);
  if (n > 1) { a[0] = a[1]; a[n - 1] = a[n - 2]; }
  return a;
}

// Robust z-score folosind median si MAD (Median Absolute Deviation).
// Mai putin afectat de outlier-uri decat mean/std => detecteaza anomalii extinse,
// nu le auto-mascheaza prin inflatarea deviatiei standard.
// MAD primeste un floor in functie de range pentru a evita explozii numerice
// cand seria are multe valori identice (ex: CpG O/E = 0 in ferestre fara C/G).
function _zscoreAbs(arr) {
  const abs = arr.map(Math.abs);
  const sorted = abs.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const dev = abs.map(x => Math.abs(x - median)).sort((a, b) => a - b);
  const madRaw = dev[Math.floor(dev.length / 2)];
  // floor: cel putin 1% din range, dar nu sub 1e-3 — previne mad ≈ 0
  const range = (sorted[sorted.length - 1] - sorted[0]) || 0;
  const mad = Math.max(madRaw, range * 0.01, 1e-3);
  // 1.4826 — conversie MAD -> stdev pentru distributie normala
  // Clip la +/- 12 ca sa nu domine scorul compozit cu un singur outlier
  return abs.map(x => Math.max(-12, Math.min(12, (x - median) / (1.4826 * mad))));
}

function andesAnalyze(dna, opts) {
  opts = opts || {};
  const s = cleanSeq(dna);
  const N = s.length;
  if (N < 60) return { ok: false, reason: 'secventa prea scurta pentru FDA (<60 bp)' };

  const win = opts.window || Math.max(25, Math.min(80, Math.floor(N / 25)));
  const step = opts.step || Math.max(1, Math.floor(win / 6));
  const thresh = opts.threshold != null ? opts.threshold : 2.5;

  // ---- 1. Extract multi-signal windowed series ----
  const centers = [], rawGC = [], rawEnt = [], rawGCSkew = [], rawATSkew = [], rawCpG = [];
  for (let i = 0; i + win <= N; i += step) {
    const w = s.substr(i, win);
    centers.push(i + win / 2);
    const cnt = { A: 0, T: 0, G: 0, C: 0 };
    for (const b of w) cnt[b]++;
    rawGC.push((cnt.G + cnt.C) / win);
    rawEnt.push(_shannonEntropy(cnt, win));
    const gcSum = cnt.G + cnt.C, atSum = cnt.A + cnt.T;
    rawGCSkew.push(gcSum > 0 ? (cnt.G - cnt.C) / gcSum : 0);
    rawATSkew.push(atSum > 0 ? (cnt.A - cnt.T) / atSum : 0);
    let cpg = 0;
    for (let j = 0; j < w.length - 1; j++) if (w[j] === 'C' && w[j + 1] === 'G') cpg++;
    const cgProd = cnt.C * cnt.G;
    rawCpG.push(cgProd > 0 ? (cpg * (win - 1)) / cgProd : 0);
  }
  if (centers.length < 5) return { ok: false, reason: 'prea putine ferestre pentru FDA (mareste secventa)' };

  // ---- 2. Smooth (B-spline-like): apply 3-pt MA twice ----
  const sigs = {
    gc:     { name: 'GC content',  color: '#00e5ff', values: _smoothArr(_smoothArr(rawGC)) },
    ent:    { name: 'Entropy',     color: '#ff3df5', values: _smoothArr(_smoothArr(rawEnt)) },
    gcSkew: { name: 'GC skew',     color: '#ffcc3a', values: _smoothArr(_smoothArr(rawGCSkew)) },
    atSkew: { name: 'AT skew',     color: '#ff9333', values: _smoothArr(_smoothArr(rawATSkew)) },
    cpg:    { name: 'CpG O/E',     color: '#00ff88', values: _smoothArr(_smoothArr(rawCpG)) },
  };

  // ---- 3. FDA: velocity + acceleration + z-score ----
  const tracks = {};
  for (const [key, sig] of Object.entries(sigs)) {
    const vel = _deriv1(sig.values, step);
    const acc = _deriv2(sig.values, step);
    tracks[key] = {
      name: sig.name,
      color: sig.color,
      values: sig.values,
      velocity: vel,
      acceleration: acc,
      velZ: _zscoreAbs(vel),
      accZ: _zscoreAbs(acc),
    };
  }

  // ---- 4. Composite anomaly score per window ----
  const nWin = centers.length;
  const composite = new Array(nWin).fill(0);
  const keys = Object.keys(tracks);
  for (let i = 0; i < nWin; i++) {
    let sum = 0;
    for (const k of keys) {
      sum += Math.max(0, tracks[k].velZ[i]) + Math.max(0, tracks[k].accZ[i]);
    }
    composite[i] = sum / (keys.length * 2);
  }

  // ---- 5. Detect anomaly regions (contiguous windows above threshold) ----
  const anomalies = [];
  let i = 0;
  while (i < nWin) {
    if (composite[i] >= thresh) {
      let j = i, peak = i, peakVal = composite[i];
      while (j < nWin && composite[j] >= thresh) {
        if (composite[j] > peakVal) { peak = j; peakVal = composite[j]; }
        j++;
      }
      const contrib = {};
      for (const k of keys) {
        contrib[k] = Math.max(0, tracks[k].velZ[peak]) + Math.max(0, tracks[k].accZ[peak]);
      }
      const top = Object.entries(contrib).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const startBp = Math.max(0, Math.round(centers[i] - win / 2));
      const endBp = Math.min(N, Math.round(centers[j - 1] + win / 2));
      const peakBp = Math.round(centers[peak]);
      // Classify type
      const topKeys = top.map(t => t[0]);
      let type;
      if (topKeys.includes('cpg')) type = 'CpG anomaly';
      else if (topKeys.includes('gc') && (topKeys.includes('gcSkew') || topKeys.includes('atSkew'))) type = 'compositional shift';
      else if (topKeys.includes('ent')) type = 'complexity change';
      else if (topKeys.includes('gcSkew') || topKeys.includes('atSkew')) type = 'strand asymmetry';
      else type = 'mixed';
      const severity = peakVal >= 4 ? 'high' : peakVal >= 3 ? 'moderate' : 'low';
      anomalies.push({
        startWin: i, endWin: j - 1, peakWin: peak,
        startBp, endBp, peakBp,
        score: peakVal, type, severity, topSignals: top,
      });
      i = j;
    } else {
      i++;
    }
  }
  anomalies.sort((a, b) => b.score - a.score);

  return {
    ok: true,
    params: { window: win, step, threshold: thresh, length: N, nWin },
    centers, composite, tracks, anomalies,
  };
}

window.GeneticaBio = {
  cleanSeq, complement, reverseComplement,
  transcribe, translate, findORFAndTranslate,
  cutWithEnzyme, pointMutation, indel,
  classifyMutation, crisprCut, pcr, gelBands,
  verifySeq, findOffTargets, andesAnalyze,
};

})();
