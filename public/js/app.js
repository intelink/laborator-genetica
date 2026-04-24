// === UI + workflow ===
(function(){
const $=id=>document.getElementById(id);
const BIO = window.GeneticaBio;
const { CODON_TABLE, AA_INFO, RESTRICTION_ENZYMES, PRESET_GENES } = window.GeneticaData;

const state = {
  seq: '',           // ADN curent (A/T/G/C)
  prevSeq: '',       // pt calcul efect mutatii
  fragments: [],     // ultimele fragmente (de la restrictie sau PCR)
  highlights: [],    // [{start, len, cls}] pt baze evidentiate
};

function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}

// ---------- health ----------
fetch('/health').then(r=>r.json()).then(d=>{
  $("health").textContent = "lab: "+d.lab+" · port "+d.port;
});

// ---------- preset ----------
function initPresets(){
  const sel = $("presetSel");
  sel.innerHTML = '';
  for (const [k, v] of Object.entries(PRESET_GENES)){
    const o = document.createElement("option");
    o.value = k; o.textContent = v.name;
    sel.appendChild(o);
  }
  sel.addEventListener("change", updatePresetDesc);
  updatePresetDesc();
}
function updatePresetDesc(){
  const k = $("presetSel").value;
  const p = PRESET_GENES[k];
  $("presetDesc").innerHTML = '<b>'+esc(p.name)+':</b> '+esc(p.desc)+'<br><span style="color:var(--dim)">lungime: '+p.seq.length+' bp</span>';
}
$("btnLoadPreset").addEventListener("click", ()=>{
  const k = $("presetSel").value;
  const p = PRESET_GENES[k];
  setSequence(p.seq, 'preset: '+p.name, 'ok');
});

// ---------- edit ----------
$("btnSet").addEventListener("click", ()=>{
  const s = BIO.cleanSeq($("seqInput").value);
  if (!s){ logEvt('secventa goala sau doar caractere non-ATGC', 'err'); return; }
  setSequence(s, 'secventa manuala ('+s.length+' bp)', 'info');
});
$("btnClear").addEventListener("click", ()=>{
  $("seqInput").value = '';
});
$("btnRandom").addEventListener("click", ()=>{
  let r = 'ATG'; // start
  const bases = 'ATGC';
  for (let i = 0; i < 54; i++) r += bases[Math.floor(Math.random()*4)];
  r += 'TGA'; // stop
  $("seqInput").value = r;
  setSequence(r, 'secventa aleatorie ('+r.length+' bp)', 'info');
});
$("btnReset").addEventListener("click", ()=>{
  if (!confirm('Reset complet laborator?')) return;
  state.seq = ''; state.prevSeq = ''; state.fragments = []; state.highlights = [];
  $("seqInput").value = '';
  renderAll();
  logEvt('laborator resetat', 'info');
  $("gelCard").style.display = 'none';
  $("mutSummary").innerHTML = '';
});

function setSequence(seq, label, kind){
  state.prevSeq = state.seq;
  state.seq = BIO.cleanSeq(seq);
  $("seqInput").value = state.seq;
  state.highlights = [];
  state.fragments = [];
  $("gelCard").style.display = 'none';
  $("mutSummary").innerHTML = '';
  renderAll();
  logEvt('incarcat: '+label, kind || 'ok');
}

// ---------- tools dispatcher ----------
document.querySelectorAll('[data-tool]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const t = btn.dataset.tool;
    if (!state.seq && t !== 'complement'){ logEvt('nu ai secventa activa', 'err'); return; }
    if (t === 'transcribe') { doTranscribe(); }
    else if (t === 'translate') { doTranslate(); }
    else if (t === 'mutate') { openMutateModal(); }
    else if (t === 'crispr') { openCrisprModal(); }
    else if (t === 'restriction') { openRestrictionModal(); }
    else if (t === 'pcr') { openPcrModal(); }
    else if (t === 'gel') { openGelModal(); }
    else if (t === 'complement') { doComplement(); }
  });
});

// ---------- ops ----------
function doTranscribe(){
  const rna = BIO.transcribe(state.seq);
  renderRNA(rna);
  logEvt('transcriere ADN → ARN (+' + rna.length + ' nt)', 'ok');
}
function doTranslate(){
  const { protein, start, frame } = BIO.findORFAndTranslate(state.seq);
  renderProtein(protein);
  $("statORF").textContent = start >= 0 ? ('poz '+start) : 'nu exista ATG';
  $("statAA").textContent = protein.replace(/\*$/,'').length + ' AA';
  logEvt('translatie (ORF start='+start+', frame='+frame+') → '+protein.length+' codoni', 'ok');
  // diff daca exista prevSeq
  if (state.prevSeq && state.prevSeq !== state.seq) renderMutSummary();
}
function doComplement(){
  if (!state.seq){ logEvt('nimic de complementat', 'err'); return; }
  const rc = BIO.reverseComplement(state.seq);
  setSequence(rc, 'complement invers', 'info');
}

// ---------- mutate modal ----------
function openMutateModal(){
  openModal(`
    <h3>✦ mutatie punctuala</h3>
    <label>pozitie (0-based, max ${state.seq.length-1})</label>
    <input type="text" id="mutPos" value="0">
    <label style="margin-top:10px">baza noua (A/T/G/C)</label>
    <input type="text" id="mutBase" value="A" maxlength="1">
    <div class="hint" style="margin-top:8px">Ex: pentru a recrea mutatia falciforma pe HBB normal, schimba poz 17 (A→T): codonul 6 GAG → GTG.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyMutate()">✦ aplica</button>
    </div>
  `);
}
function applyMutate(){
  const pos = parseInt($("mutPos").value, 10);
  const base = ($("mutBase").value||'').toUpperCase().trim();
  const r = BIO.pointMutation(state.seq, pos, base);
  if (!r.ok){ logEvt('mutatie esuata: '+r.reason, 'err'); return; }
  state.prevSeq = state.seq;
  state.seq = r.seq;
  state.highlights = [{start: pos, len: 1, cls: 'mut'}];
  closeModal();
  renderAll();
  renderMutSummary();
  logEvt('mutatie: poz '+pos+' '+r.old+'→'+r.new, 'mut');
}

// ---------- CRISPR modal ----------
function openCrisprModal(){
  const prefill = 'TAGCCTGAGATTGCCTCAAC';
  openModal(`
    <h3>✂ CRISPR / Cas9</h3>
    <label>ghid ARN (20 bp, fara PAM)</label>
    <input type="text" id="crisprGuide" value="${prefill}" style="letter-spacing:.05em">
    <label style="margin-top:10px">mod editare</label>
    <select id="crisprMode">
      <option value="knockout">Knockout (NHEJ: 4 bp deletie la site)</option>
      <option value="hdr">HDR (insereaza template)</option>
    </select>
    <div id="hdrTmplWrap" style="display:none;margin-top:10px">
      <label>template HDR (se insereaza la cut)</label>
      <input type="text" id="crisprTmpl" value="GGTACCGGT">
    </div>
    <div class="hint" style="margin-top:8px">PAM = NGG (dupa target). Cas9 taie 3 bp upstream PAM. Incearca cu preset-ul "Tinta CRISPR".</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyCrispr()">✂ taie</button>
    </div>
  `);
  $("crisprMode").addEventListener("change", ()=>{
    $("hdrTmplWrap").style.display = $("crisprMode").value === 'hdr' ? 'block' : 'none';
  });
}
function applyCrispr(){
  const guide = $("crisprGuide").value;
  const mode = $("crisprMode").value;
  const tmpl = $("crisprTmpl") ? $("crisprTmpl").value : '';
  const r = BIO.crisprCut(state.seq, guide, mode, tmpl);
  if (!r.ok){ logEvt('CRISPR esuat: '+r.reason, 'err'); return; }
  const hit = r.applied;
  state.highlights = [
    { start: hit.strand === '+' ? hit.start : hit.start, len: 20, cls: 'target' },
    { start: hit.strand === '+' ? hit.pam : hit.pam, len: 3, cls: 'pam' },
    { start: hit.cut, len: 1, cls: 'cut' },
  ];
  setTimeout(()=>{
    state.prevSeq = state.seq;
    state.seq = r.newSeq;
    // dupa edit, highlight regiunea editata
    const editPos = Math.max(0, hit.cut - 3);
    state.highlights = [{ start: editPos, len: Math.max(1, Math.abs(r.newSeq.length - state.prevSeq.length) + 4), cls: 'mut' }];
    renderAll();
    renderMutSummary();
    logEvt('CRISPR '+mode+' aplicat la poz '+hit.cut+' (fir '+hit.strand+'), '+(r.newSeq.length-state.prevSeq.length)+' bp delta', 'crispr');
  }, 1200); // delay pentru animatie: prima randare cu target+pam+cut, apoi aplica edit
  closeModal();
  renderAll(); // arata target+PAM+cut inainte de edit
  logEvt('CRISPR: ghid se leaga la poz '+hit.start+' (fir '+hit.strand+'), PAM la '+hit.pam, 'crispr');
}

// ---------- Restriction modal ----------
function openRestrictionModal(){
  const opts = Object.entries(RESTRICTION_ENZYMES).map(([n, e])=>
    `<option value="${n}">${n} (${e.site}, ${e.type})</option>`).join('');
  openModal(`
    <h3>⎯⎯| enzima de restrictie</h3>
    <label>enzima</label>
    <select id="resEnz">${opts}</select>
    <div class="hint" style="margin-top:8px">Enzima cauta site-ul de recunoastere si taie la pozitia indicata. Fragmentele apar pe gel.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyRestriction()">⎯⎯| taie</button>
    </div>
  `);
}
function applyRestriction(){
  const name = $("resEnz").value;
  const r = BIO.cutWithEnzyme(state.seq, name);
  if (!r.sites.length){ logEvt(name+': site-ul '+r.enzyme.site+' nu apare', 'err'); closeModal(); return; }
  state.highlights = r.sites.map(s => ({ start: s.start, len: r.enzyme.site.length, cls: 'target' }))
    .concat(r.sites.map(s => ({ start: s.cut, len: 1, cls: 'cut' })));
  state.fragments = r.fragments;
  closeModal();
  renderAll();
  renderGel(r.fragments);
  logEvt(name+' ('+r.enzyme.site+'): '+r.sites.length+' site-uri, '+r.fragments.length+' fragmente', 'ok');
}

// ---------- PCR modal ----------
function openPcrModal(){
  openModal(`
    <h3>⚡ PCR</h3>
    <label>primer forward (5'→3')</label>
    <input type="text" id="pcrFwd" value="ATG">
    <label style="margin-top:10px">primer reverse (5'→3', pe firul antisens)</label>
    <input type="text" id="pcrRev" value="TGA">
    <div class="hint" style="margin-top:8px">Primer-ul reverse se leaga pe complementul firului sens. Intoarce amplicon-ul intre ei.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyPcr()">⚡ amplifica</button>
    </div>
  `);
}
function applyPcr(){
  const f = $("pcrFwd").value, r = $("pcrRev").value;
  const res = BIO.pcr(state.seq, f, r);
  if (!res.ok){ logEvt('PCR esuat: '+res.reason, 'err'); closeModal(); return; }
  state.highlights = [{ start: res.startF, len: res.endR - res.startF, cls: 'hl' }];
  state.fragments = [res.amplicon];
  closeModal();
  renderAll();
  renderGel([res.amplicon]);
  logEvt('PCR → amplicon '+res.amplicon.length+' bp (poz '+res.startF+'-'+res.endR+')', 'ok');
}

// ---------- Gel modal ----------
function openGelModal(){
  if (!state.fragments.length){
    logEvt('nu ai fragmente — ruleaza o enzima sau PCR intai', 'err'); return;
  }
  renderGel(state.fragments);
  logEvt('gel afisat cu '+state.fragments.length+' fragmente', 'ok');
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
}

// ---------- RENDER ----------
function renderAll(){
  renderDNA();
  $("statLen").textContent = state.seq.length + ' bp';
  $("statGC").textContent = gcContent(state.seq);
  const orf = BIO.findORFAndTranslate(state.seq);
  $("statORF").textContent = orf.start >= 0 ? ('poz '+orf.start) : '—';
  $("statAA").textContent = (orf.protein.replace(/\*$/,'').length || 0) + ' AA';
  // clear RNA / Protein - user va apasa butoanele
  if (!state.seq){
    $("rnaView").innerHTML = '<span class="hint">apasa "Transcrie"</span>';
    $("protView").innerHTML = '<span class="hint">apasa "Tradu"</span>';
  }
}

function gcContent(s){
  if (!s) return '—';
  const gc = (s.match(/[GC]/g) || []).length;
  return Math.round(gc / s.length * 100) + '%';
}

function renderDNA(){
  const el = $("dnaView");
  if (!state.seq){
    el.innerHTML = '<div class="hint">Incarca o secventa preset sau lipeste una proprie.</div>';
    return;
  }
  const s = state.seq;
  // highlight map
  const hlMap = new Map(); // idx → class
  for (const h of state.highlights){
    for (let i = 0; i < h.len; i++){
      const idx = h.start + i;
      if (idx < s.length) hlMap.set(idx, (hlMap.get(idx) || '') + ' ' + h.cls);
    }
  }
  // codon detection (pe ORF daca exista)
  const { start: orfStart } = BIO.findORFAndTranslate(s);
  const PER_LINE = 60;
  let out = '';
  for (let i = 0; i < s.length; i += PER_LINE){
    const line = s.substr(i, PER_LINE);
    out += '<div><span class="dna-pos">'+i+'</span>';
    for (let j = 0; j < line.length; j++){
      const abs = i + j;
      const b = line[j];
      const hlCls = hlMap.get(abs) ? (' '+hlMap.get(abs).trim()) : '';
      let codonCls = '';
      if (orfStart >= 0 && abs >= orfStart){
        const codIdx = Math.floor((abs - orfStart) / 3);
        const inCodon = ((abs - orfStart) % 3 === 0);
        if (inCodon){
          const codon = s.substr(abs, 3);
          if (codon === 'ATG' && codIdx === 0) codonCls = ' codon start';
          else if (codon === 'TAA' || codon === 'TAG' || codon === 'TGA') codonCls = ' codon stop';
          else codonCls = ' codon';
        }
      }
      out += '<span class="base '+b+hlCls+'"'+(codonCls?' data-start="1" style="'+(codonCls.includes('start')?'border-bottom:2px solid var(--lime);':codonCls.includes('stop')?'border-bottom:2px solid var(--rd);':'')+'"':'')+'>'+b+'</span>';
    }
    out += '</div>';
  }
  el.innerHTML = out;
}

function renderRNA(rna){
  const el = $("rnaView");
  if (!rna){ el.innerHTML = '<span class="hint">—</span>'; return; }
  let out = '';
  for (const b of rna) out += '<span class="base '+b+'">'+b+'</span>';
  el.innerHTML = out;
}

function renderProtein(prot){
  const el = $("protView");
  if (!prot){ el.innerHTML = '<span class="hint">—</span>'; return; }
  let out = '';
  for (let i = 0; i < prot.length; i++){
    const aa = prot[i];
    const info = AA_INFO[aa] || { name: '?', group: 'special' };
    out += '<span class="aa g-'+info.group+'" title="'+i+': '+esc(info.name)+'">'+aa+'</span>';
  }
  el.innerHTML = out;
}

function renderMutSummary(){
  const el = $("mutSummary");
  if (!state.prevSeq || state.prevSeq === state.seq){ el.innerHTML = ''; return; }
  const c = BIO.classifyMutation(state.prevSeq, state.seq);
  const cls = c.type === 'silent' ? 'silent' : (c.type === 'nonsense' || c.type === 'frameshift' ? 'nonsense' : '');
  let extra = '';
  if (c.firstDiff != null && c.firstDiff >= 0){
    const oldAA = c.oldProt[c.firstDiff] || '?';
    const newAA = c.newProt[c.firstDiff] || '?';
    extra = ` — AA #${c.firstDiff}: <b>${oldAA}</b> → <b>${newAA}</b>`;
  }
  el.className = 'mut-summary '+cls;
  el.innerHTML = '<b>Efect mutatie:</b> '+c.type.toUpperCase()+extra+
    '<br><span style="color:var(--dim);font-family:var(--mono);font-size:11px">proteina inainte: '+c.oldProt+' ('+(c.oldProt.replace(/\*$/,'').length)+' AA)<br>'+
    'proteina dupa: '+c.newProt+' ('+(c.newProt.replace(/\*$/,'').length)+' AA)</span>';
  // marcheaza AA diferit in prot view
  renderProteinWithDiff(c.oldProt, c.newProt);
}

function renderProteinWithDiff(oldP, newP){
  const el = $("protView"); let out = '';
  for (let i = 0; i < newP.length; i++){
    const aa = newP[i];
    const info = AA_INFO[aa] || { name: '?', group: 'special' };
    const diff = (oldP[i] !== aa) ? ' diff' : '';
    out += '<span class="aa g-'+info.group+diff+'" title="'+i+': '+esc(info.name)+(diff?' (schimbat din '+oldP[i]+')':'')+'">'+aa+'</span>';
  }
  el.innerHTML = out;
}

function renderGel(fragments){
  $("gelCard").style.display = 'block';
  const lane = $("gelLane");
  // clear bands (past top strip)
  lane.querySelectorAll('.gel-band').forEach(b=>b.remove());
  const sizes = fragments.map(f=>f.length).filter(L=>L>0);
  if (!sizes.length) return;
  const maxSize = Math.max(...sizes, 1000);
  const minSize = 10;
  // logaritmic: y pos ∈ [24, 190], 0 = maxSize sus, maxHeight = minSize jos
  const topY = 24;
  const botY = 190;
  const logMax = Math.log10(maxSize);
  const logMin = Math.log10(minSize);
  sizes.forEach(sz=>{
    const lg = Math.log10(Math.max(sz, minSize));
    const t = (logMax - lg) / (logMax - logMin);
    const y = topY + t * (botY - topY);
    const band = document.createElement('div');
    band.className = 'gel-band';
    band.style.top = y+'px';
    const intensity = Math.min(1, 0.4 + sz / maxSize * 0.6);
    band.style.opacity = intensity.toFixed(2);
    band.innerHTML = '<span class="label">'+sz+' bp</span>';
    lane.appendChild(band);
  });
  // ladder
  const lad = $("gelLadder");
  lad.innerHTML = '';
  [maxSize, Math.round(maxSize/3), Math.round(maxSize/10), minSize].forEach(s=>{
    const d = document.createElement('div'); d.textContent = s+'bp'; lad.appendChild(d);
  });
}

// ---------- log ----------
function logEvt(msg, kind){
  const el = $("log");
  const d = document.createElement("div");
  d.className = 'evt '+(kind||'');
  const ico = kind==='err'?'✗':kind==='mut'?'✦':kind==='crispr'?'✂':kind==='info'?'»':'✓';
  const t = new Date().toTimeString().slice(0,8);
  d.innerHTML = '<span class="t">'+t+'</span><span class="ico">'+ico+'</span> '+esc(msg);
  el.insertBefore(d, el.firstChild);
}

// ---------- modal ----------
function openModal(html){
  $("modalBody").innerHTML = html;
  $("modal").classList.add("open");
}
function closeModal(){ $("modal").classList.remove("open"); }
$("modal").addEventListener("click", e=>{ if (e.target.id === 'modal') closeModal(); });
window.closeModal = closeModal;
window.applyMutate = applyMutate;
window.applyCrispr = applyCrispr;
window.applyRestriction = applyRestriction;
window.applyPcr = applyPcr;

// ---------- init ----------
initPresets();
renderAll();
logEvt('laborator pornit. incarca un preset sau lipeste o secventa.', 'info');

})();
