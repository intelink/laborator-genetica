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

window.GeneticaBio = {
  cleanSeq, complement, reverseComplement,
  transcribe, translate, findORFAndTranslate,
  cutWithEnzyme, pointMutation, indel,
  classifyMutation, crisprCut, pcr, gelBands,
};

})();
