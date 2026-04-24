// === Laborator Genetica — UI + workflow ===
(function(){
const $=id=>document.getElementById(id);
const BIO = window.GeneticaBio;
const { CODON_TABLE, AA_INFO, RESTRICTION_ENZYMES, PRESET_GENES } = window.GeneticaData;

// ====== STATE ======
// Doua sloturi (A si B) pentru comparatie. "seq" e proxy catre slotul activ.
const state = {
  slots: {
    A: { name: '', seq: '', prevSeq: '', highlights: [], fragments: [] },
    B: { name: '', seq: '', prevSeq: '', highlights: [], fragments: [] },
  },
  active: 'A',
  get seq(){ return state.slots[state.active].seq; },
  set seq(v){ state.slots[state.active].seq = v; },
  get prevSeq(){ return state.slots[state.active].prevSeq; },
  set prevSeq(v){ state.slots[state.active].prevSeq = v; },
  get highlights(){ return state.slots[state.active].highlights; },
  set highlights(v){ state.slots[state.active].highlights = v; },
  get fragments(){ return state.slots[state.active].fragments; },
  set fragments(v){ state.slots[state.active].fragments = v; },
};

function esc(s){return (s==null?'':String(s)).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c])}

// ---------- health ----------
fetch('/health').then(r=>r.json()).then(d=>{
  $("health").textContent = "lab: "+d.lab+" · port "+d.port+(d.ai?" · AI: on":" · AI: off");
});

// ---------- preset ----------
function initPresets(){
  const sel = $("presetSel"); sel.innerHTML = '';
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
$("btnClear").addEventListener("click", ()=>{ $("seqInput").value = ''; });
$("btnRandom").addEventListener("click", ()=>{
  let r = 'ATG';
  const bases = 'ATGC';
  for (let i = 0; i < 54; i++) r += bases[Math.floor(Math.random()*4)];
  r += 'TGA';
  $("seqInput").value = r;
  setSequence(r, 'secventa aleatorie ('+r.length+' bp)', 'info');
});
$("btnReset").addEventListener("click", ()=>{
  if (!confirm('Reset complet laborator?')) return;
  for (const k of ['A','B']){
    state.slots[k] = { name:'', seq:'', prevSeq:'', highlights:[], fragments:[] };
  }
  $("seqInput").value = '';
  setActiveSlot('A');
  updateSlotChips();
  renderAll();
  logEvt('laborator resetat', 'info');
  $("gelCard").style.display = 'none';
  $("compareCard").style.display = 'none';
  $("mutSummary").innerHTML = '';
});

function setSequence(seq, label, kind){
  const slot = state.slots[state.active];
  slot.prevSeq = slot.seq;
  slot.seq = BIO.cleanSeq(seq);
  slot.name = label;
  slot.highlights = [];
  slot.fragments = [];
  if ($("seqInput")) $("seqInput").value = slot.seq;
  $("gelCard").style.display = 'none';
  $("mutSummary").innerHTML = '';
  updateSlotChips();
  renderAll();
  logEvt('incarcat in Slot '+state.active+': '+label, kind || 'ok');
}

// ---------- Slots A/B ----------
function setActiveSlot(which){
  if (which !== 'A' && which !== 'B') return;
  state.active = which;
  updateSlotChips();
  renderAll();
  $("activeSlotTag").textContent = 'SLOT ' + which;
  // schimba si destinatia de cautare
  document.querySelectorAll('.seg-btn[data-slot]').forEach(b=>{
    b.classList.toggle('active', b.dataset.slot === which);
  });
}
function updateSlotChips(){
  const A = state.slots.A, B = state.slots.B;
  $("slotAName").textContent = A.name || '—';
  $("slotALen").textContent = A.seq.length + ' bp';
  $("slotBName").textContent = B.name || '—';
  $("slotBLen").textContent = B.seq.length + ' bp';
  document.querySelectorAll('.slot-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.slot === state.active);
  });
}
document.querySelectorAll('.slot-chip').forEach(chip => {
  chip.addEventListener('click', () => setActiveSlot(chip.dataset.slot));
});
$("btnSwapAB").addEventListener("click", () => {
  const A = state.slots.A, B = state.slots.B;
  state.slots.A = B; state.slots.B = A;
  updateSlotChips(); renderAll();
  logEvt('swap A ↔ B', 'info');
});

// ---------- tools dispatcher ----------
document.querySelectorAll('[data-tool]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const t = btn.dataset.tool;
    if (!state.seq && t !== 'complement'){
      logEvt('nu ai secventa in Slot '+state.active+' — cauta una sau incarca un preset', 'err');
      return;
    }
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

// ---------- source tabs ----------
document.querySelectorAll('.src-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.src-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const src = tab.dataset.src;
    const map = { preset:'srcPresetPanel', ucsc:'srcUcscPanel', manual:'srcManualPanel' };
    Object.values(map).forEach(id => { const el = $(id); if (el) el.style.display='none'; });
    const tgt = $(map[src]); if (tgt) tgt.style.display='block';
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
  logEvt('traducere (ORF start='+start+', frame='+frame+') → '+protein.length+' codoni', 'ok');
  if (state.prevSeq && state.prevSeq !== state.seq) renderMutSummary();
}
function doComplement(){
  if (!state.seq){ logEvt('nimic de complementat', 'err'); return; }
  const rc = BIO.reverseComplement(state.seq);
  setSequence(rc, 'complement invers', 'info');
}

// ---------- mutate ----------
function openMutateModal(){
  openModal(`
    <h3>✦ mutatie punctuala</h3>
    <label>pozitie (0-based, max ${state.seq.length-1})</label>
    <input type="text" id="mutPos" value="0">
    <label style="margin-top:10px">baza noua (A/T/G/C)</label>
    <input type="text" id="mutBase" value="A" maxlength="1">
    <div class="hint" style="margin-top:8px">Ex: pentru mutatia falciforma pe HBB, poz 17 (A→T): codonul 6 GAG → GTG.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyMutate()">✦ aplica</button>
    </div>`);
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

// ---------- CRISPR ----------
function openCrisprModal(){
  openModal(`
    <h3>✂ CRISPR / Cas9</h3>
    <label>ghid ARN (20 bp, fara PAM)</label>
    <input type="text" id="crisprGuide" value="TAGCCTGAGATTGCCTCAAC" style="letter-spacing:.05em">
    <label style="margin-top:10px">mod editare</label>
    <select id="crisprMode">
      <option value="knockout">Knockout (deletie 4 bp)</option>
      <option value="hdr">HDR (insereaza template)</option>
    </select>
    <div id="hdrTmplWrap" style="display:none;margin-top:10px">
      <label>template HDR</label>
      <input type="text" id="crisprTmpl" value="GGTACCGGT">
    </div>
    <div class="hint" style="margin-top:8px">PAM = NGG. Cas9 taie 3 bp upstream PAM.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyCrispr()">✂ taie</button>
    </div>`);
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
    { start: hit.start, len: 20, cls: 'target' },
    { start: hit.pam,   len: 3,  cls: 'pam' },
    { start: hit.cut,   len: 1,  cls: 'cut' },
  ];
  setTimeout(()=>{
    state.prevSeq = state.seq;
    state.seq = r.newSeq;
    const editPos = Math.max(0, hit.cut - 3);
    state.highlights = [{ start: editPos, len: Math.max(1, Math.abs(r.newSeq.length - state.prevSeq.length) + 4), cls: 'mut' }];
    renderAll(); renderMutSummary();
    logEvt('CRISPR '+mode+' aplicat la poz '+hit.cut+' (fir '+hit.strand+')', 'crispr');
  }, 1200);
  closeModal(); renderAll();
  logEvt('CRISPR: ghid la poz '+hit.start+' (fir '+hit.strand+'), PAM la '+hit.pam, 'crispr');
}

// ---------- Restriction ----------
function openRestrictionModal(){
  const opts = Object.entries(RESTRICTION_ENZYMES).map(([n, e])=>
    `<option value="${n}">${n} (${e.site}, ${e.type})</option>`).join('');
  openModal(`
    <h3>⎯⎯| enzima restrictie</h3>
    <label>enzima</label>
    <select id="resEnz">${opts}</select>
    <div class="hint" style="margin-top:8px">Enzima cauta site-ul si taie la pozitia indicata.</div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyRestriction()">taie</button>
    </div>`);
}
function applyRestriction(){
  const name = $("resEnz").value;
  const r = BIO.cutWithEnzyme(state.seq, name);
  if (!r.sites.length){ logEvt(name+': site-ul '+r.enzyme.site+' nu apare', 'err'); closeModal(); return; }
  state.highlights = r.sites.map(s => ({ start: s.start, len: r.enzyme.site.length, cls: 'target' }))
    .concat(r.sites.map(s => ({ start: s.cut, len: 1, cls: 'cut' })));
  state.fragments = r.fragments;
  closeModal(); renderAll(); renderGel(r.fragments);
  logEvt(name+' ('+r.enzyme.site+'): '+r.sites.length+' site-uri, '+r.fragments.length+' fragmente', 'ok');
}

// ---------- PCR ----------
function openPcrModal(){
  openModal(`
    <h3>⚡ PCR</h3>
    <label>primer forward (5'→3')</label>
    <input type="text" id="pcrFwd" value="ATG">
    <label style="margin-top:10px">primer reverse (5'→3', firul antisens)</label>
    <input type="text" id="pcrRev" value="TGA">
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="applyPcr()">amplifica</button>
    </div>`);
}
function applyPcr(){
  const f = $("pcrFwd").value, r = $("pcrRev").value;
  const res = BIO.pcr(state.seq, f, r);
  if (!res.ok){ logEvt('PCR esuat: '+res.reason, 'err'); closeModal(); return; }
  state.highlights = [{ start: res.startF, len: res.endR - res.startF, cls: 'hl' }];
  state.fragments = [res.amplicon];
  closeModal(); renderAll(); renderGel([res.amplicon]);
  logEvt('PCR → amplicon '+res.amplicon.length+' bp', 'ok');
}

function openGelModal(){
  if (!state.fragments.length){ logEvt('nu ai fragmente — ruleaza enzima sau PCR', 'err'); return; }
  renderGel(state.fragments);
  logEvt('gel afisat cu '+state.fragments.length+' fragmente', 'ok');
}

// ---------- RENDER ----------
function renderAll(){
  renderDNA();
  $("statLen").textContent = state.seq.length + ' bp';
  $("statGC").textContent = gcContent(state.seq);
  const orf = BIO.findORFAndTranslate(state.seq);
  $("statORF").textContent = orf.start >= 0 ? ('poz '+orf.start) : '—';
  $("statAA").textContent = (orf.protein.replace(/\*$/,'').length || 0) + ' AA';
  if (!state.seq){
    $("rnaView").innerHTML = '<span class="hint">apasa <b>Transcrie</b></span>';
    $("protView").innerHTML = '<span class="hint">apasa <b>Tradu</b></span>';
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
    el.innerHTML = `<div class="scan-line"></div><div class="empty-state">
      <div class="empty-ic">🧬</div>
      <div>Nu ai o secventa in Slot ${state.active}.</div>
      <div class="hint" style="margin-top:6px">Cauta o gena sus sau alege un preset din stanga.</div>
    </div>`;
    return;
  }
  const s = state.seq;
  const hlMap = new Map();
  for (const h of state.highlights){
    for (let i = 0; i < h.len; i++){
      const idx = h.start + i;
      if (idx < s.length) hlMap.set(idx, (hlMap.get(idx) || '') + ' ' + h.cls);
    }
  }
  const { start: orfStart } = BIO.findORFAndTranslate(s);
  const PER_LINE = 60;
  let out = '<div class="scan-line"></div>';
  for (let i = 0; i < s.length; i += PER_LINE){
    const line = s.substr(i, PER_LINE);
    out += '<div><span class="dna-pos">'+i+'</span>';
    for (let j = 0; j < line.length; j++){
      const abs = i + j, b = line[j];
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
  el.innerHTML = '<b>Efect mutatie:</b> '+c.type.toUpperCase()+extra;
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
  lane.querySelectorAll('.gel-band').forEach(b=>b.remove());
  const sizes = fragments.map(f=>f.length).filter(L=>L>0);
  if (!sizes.length) return;
  const maxSize = Math.max(...sizes, 1000);
  const minSize = 10;
  const topY = 24, botY = 190;
  const logMax = Math.log10(maxSize), logMin = Math.log10(minSize);
  sizes.forEach(sz=>{
    const lg = Math.log10(Math.max(sz, minSize));
    const t = (logMax - lg) / (logMax - logMin);
    const y = topY + t * (botY - topY);
    const band = document.createElement('div');
    band.className = 'gel-band'; band.style.top = y+'px';
    band.style.opacity = Math.min(1, 0.4 + sz / maxSize * 0.6).toFixed(2);
    band.innerHTML = '<span class="label">'+sz+' bp</span>';
    lane.appendChild(band);
  });
  const lad = $("gelLadder"); lad.innerHTML = '';
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
function closeModal(){
  $("modal").classList.remove("open");
  $("modalBody").classList.remove('modal-lg');
}
$("modal").addEventListener("click", e=>{ if (e.target.id === 'modal') closeModal(); });
window.closeModal = closeModal;
window.applyMutate = applyMutate;
window.applyCrispr = applyCrispr;
window.applyRestriction = applyRestriction;
window.applyPcr = applyPcr;

// ====== GLOBAL SEARCH BAR ======
const NCBI_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
let suggestTimer = null;
let suggestions = [];
let selectedSuggest = -1;

// destinatie slot din segmented control de langa search
document.querySelectorAll('.seg-btn[data-slot]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-slot]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    setActiveSlot(btn.dataset.slot);
  });
});

function closeSuggest(){ $("searchSuggest").classList.remove('open'); selectedSuggest = -1; }
function renderSuggest(){
  const el = $("searchSuggest");
  if (!suggestions.length){ closeSuggest(); return; }
  el.innerHTML = suggestions.map((s, i) =>
    `<div class="sg-item ${i===selectedSuggest?'sel':''}" data-i="${i}">
      <span class="sg-sym">${esc(s.symbol)}</span>
      <span class="sg-desc">${esc(s.desc||'')}</span>
    </div>`).join('');
  el.classList.add('open');
  el.querySelectorAll('.sg-item').forEach(item=>{
    item.addEventListener('click', ()=>{
      const i = parseInt(item.dataset.i);
      $("globalSearch").value = suggestions[i].symbol;
      closeSuggest();
      runGlobalSearch();
    });
  });
}
async function fetchSuggestions(q){
  q = q.trim();
  if (q.length < 2){ suggestions = []; closeSuggest(); return; }
  const org = $("searchOrg").value;
  const term = `${q}[Gene Name] AND ${org}[orgn] AND refseq_select[filter]`;
  try {
    const r = await fetch(`${NCBI_API}/esearch.fcgi?db=gene&term=${encodeURIComponent(term)}&retmode=json&retmax=8`);
    const j = await r.json();
    const ids = (j.esearchresult && j.esearchresult.idlist) || [];
    if (!ids.length){ suggestions = []; closeSuggest(); return; }
    const sumR = await fetch(`${NCBI_API}/esummary.fcgi?db=gene&id=${ids.join(',')}&retmode=json`);
    const sumJ = await sumR.json();
    const result = sumJ.result || {};
    suggestions = ids.map(id => {
      const it = result[id] || {};
      return { symbol: it.name || q, desc: it.description || '' };
    });
    renderSuggest();
  } catch(e){
    console.warn('suggest error', e);
    suggestions = []; closeSuggest();
  }
}
$("globalSearch").addEventListener("input", e=>{
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(() => fetchSuggestions(e.target.value), 300);
});
$("globalSearch").addEventListener("keydown", e=>{
  if (e.key === 'Enter'){ e.preventDefault(); closeSuggest(); runGlobalSearch(); }
  else if (e.key === 'Escape'){ closeSuggest(); }
  else if (e.key === 'ArrowDown'){ e.preventDefault(); selectedSuggest = Math.min(suggestions.length-1, selectedSuggest+1); renderSuggest(); }
  else if (e.key === 'ArrowUp'){ e.preventDefault(); selectedSuggest = Math.max(0, selectedSuggest-1); renderSuggest(); }
});
document.addEventListener("click", e=>{
  if (!$("searchSuggest").contains(e.target) && e.target.id !== 'globalSearch') closeSuggest();
});
$("btnSearchGo").addEventListener("click", runGlobalSearch);

function parseFasta(text){
  if (!text) return { header: '', seq: '' };
  const lines = text.split(/\r?\n/);
  const records = [];
  let cur = null;
  for (const line of lines){
    if (line.startsWith('>')){
      if (cur) records.push(cur);
      cur = { header: line.slice(1), seq: '' };
    } else if (cur){ cur.seq += line.trim(); }
  }
  if (cur) records.push(cur);
  return records[0] || { header: '', seq: '' };
}

async function runGlobalSearch(){
  const q = $("globalSearch").value.trim();
  const org = $("searchOrg").value;
  if (!q){ return; }
  closeSuggest();
  logEvt(`cautare: ${q} in ${org}...`, 'info');
  try {
    const term = `${q}[Gene Name] AND ${org}[orgn] AND refseq_select[filter]`;
    const sR = await fetch(`${NCBI_API}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(term)}&retmode=json&retmax=1`);
    const sJ = await sR.json();
    let ids = (sJ.esearchresult && sJ.esearchresult.idlist) || [];
    if (!ids.length){
      // fallback
      const term2 = `${q}[Gene Name] AND ${org}[orgn] AND refseq[filter] AND biomol_mrna[PROP]`;
      const sR2 = await fetch(`${NCBI_API}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(term2)}&retmode=json&retmax=1`);
      const sJ2 = await sR2.json();
      ids = (sJ2.esearchresult && sJ2.esearchresult.idlist) || [];
    }
    if (!ids.length){
      logEvt(`${q}: nu exista RefSeq in ${org}`, 'err'); return;
    }
    const fR = await fetch(`${NCBI_API}/efetch.fcgi?db=nuccore&id=${ids[0]}&rettype=fasta_cds_na&retmode=text`);
    const fasta = await fR.text();
    const rec = parseFasta(fasta);
    const dna = rec.seq.toUpperCase().replace(/[^ATGC]/g, '');
    if (!dna){ logEvt('secventa vida de la NCBI', 'err'); return; }
    const acc = (rec.header.match(/^(\S+)/)||[])[1] || ids[0];
    setSequence(dna, `${q} (${org}) CDS · ${acc}`);
  } catch(e){
    logEvt('cautare eroare: '+e.message, 'err');
  }
}

// ====== UCSC (secvente genomice) ======
const UCSC_API = 'https://api.genome.ucsc.edu';
async function fetchFromUCSC(){
  const symbol = $("ucscGene").value.trim();
  const genome = $("ucscGenome").value;
  const maxLen = Math.max(30, Math.min(10000, parseInt($("ucscMaxLen").value, 10) || 500));
  if (!symbol){ logEvt('UCSC: simbol gol', 'err'); return; }
  $("ucscStatus").textContent = `caut ${symbol} in ${genome}...`;
  try {
    const sUrl = `${UCSC_API}/search?search=${encodeURIComponent(symbol)};genome=${genome}`;
    const sRes = await fetch(sUrl).then(r => r.json());
    const categories = sRes.positionMatches || [];
    const priority = ['knownGene', 'mane', 'ncbiRefSeqCurated', 'ncbiRefSeq', 'refGene', 'hgnc'];
    let hit = null;
    for (const p of priority){
      const cat = categories.find(c => (c.name||c.trackName) === p);
      if (cat && cat.matches && cat.matches.length){
        const exact = cat.matches.find(m => (m.posName||'').split(/[\s(]/)[0].toUpperCase() === symbol.toUpperCase());
        hit = exact || cat.matches[0];
        if (hit){ hit._track = p; break; }
      }
    }
    if (!hit){ for (const c of categories){ if (c.matches && c.matches.length){ hit = c.matches[0]; hit._track = c.name||c.trackName; break; } } }
    if (!hit){ $("ucscStatus").textContent = `negasit: ${symbol}`; logEvt(`UCSC: ${symbol} in ${genome} nu exista`, 'err'); return; }
    const pm = (hit.position||'').match(/^([^:]+):(\d+)-(\d+)$/);
    if (!pm){ $("ucscStatus").textContent = 'pozitie invalida'; return; }
    const chrom = pm[1], startG = +pm[2], endG = +pm[3];
    const fetchEnd = Math.min(endG, startG + maxLen);
    const qUrl = `${UCSC_API}/getData/sequence?genome=${genome};chrom=${chrom};start=${startG};end=${fetchEnd}`;
    const qRes = await fetch(qUrl).then(r => r.json());
    const dna = (qRes.dna||'').toUpperCase();
    if (!dna){ $("ucscStatus").textContent = 'secventa goala'; return; }
    $("ucscStatus").innerHTML = `<b>${esc(symbol)}</b> · ${chrom}:${startG.toLocaleString()}-${fetchEnd.toLocaleString()} (${dna.length} bp)`;
    setSequence(dna, `UCSC ${symbol} (${genome}) ${chrom}:${startG}-${fetchEnd}`, 'ok');
  } catch(e){ $("ucscStatus").textContent = 'eroare: '+e.message; logEvt('UCSC: '+e.message, 'err'); }
}
$("btnFetchUCSC").addEventListener("click", fetchFromUCSC);
$("ucscGene").addEventListener("keydown", e => { if (e.key === 'Enter') fetchFromUCSC(); });

// ====== COMPARATIE A vs B ======
function simpleAlign(a, b){
  // Aliniere simpla fara gaps (global, end-to-end, pe min length).
  // Pentru secvente relativ asemanatoare e OK. Returneaza % identitate + diff array.
  const L = Math.min(a.length, b.length);
  if (!L) return { identity: 0, matches: 0, total: 0, diff: [] };
  let matches = 0;
  const diff = [];
  for (let i = 0; i < L; i++){
    if (a[i] === b[i]){ matches++; diff.push('='); }
    else diff.push('X');
  }
  return { identity: matches/L, matches, total: L, diff, extraA: a.length-L, extraB: b.length-L };
}
function renderCompare(){
  const A = state.slots.A.seq, B = state.slots.B.seq;
  if (!A || !B){ logEvt('comparatie necesita secvente in A si B', 'err'); return null; }
  const res = simpleAlign(A, B);
  const pctI = (res.identity * 100).toFixed(1) + '%';
  $("compareCard").style.display = 'block';
  $("compareIdentity").textContent = pctI + ' identity';
  $("compareStats").innerHTML = `
    <span class="cmp-pill">A: <b>${esc(state.slots.A.name || '—')}</b> (${A.length} bp)</span>
    <span class="cmp-pill">B: <b>${esc(state.slots.B.name || '—')}</b> (${B.length} bp)</span>
    <span class="cmp-pill">compare: <b>${res.total} bp</b></span>
    <span class="cmp-pill">identitate: <b>${pctI}</b></span>
    <span class="cmp-pill">mismatch: <b>${res.total - res.matches}</b></span>
    ${res.extraA ? `<span class="cmp-pill">A are +${res.extraA} bp extra</span>`:''}
    ${res.extraB ? `<span class="cmp-pill">B are +${res.extraB} bp extra</span>`:''}
  `;
  // render aligned blocks de 60
  const PER = 60;
  let html = '';
  for (let i = 0; i < res.total; i += PER){
    const aLine = A.substr(i, PER), bLine = B.substr(i, PER), dLine = res.diff.slice(i, i+PER).join('');
    const aHtml = [...aLine].map((c,j) => dLine[j]==='='?`<span class="cmp-match">${c}</span>`:`<span class="cmp-mismatch">${c}</span>`).join('');
    const bHtml = [...bLine].map((c,j) => dLine[j]==='='?`<span class="cmp-match">${c}</span>`:`<span class="cmp-mismatch">${c}</span>`).join('');
    const barHtml = [...dLine].map(d => d==='='?'│':' ').join('');
    html += `
      <div class="cmp-row"><span class="cmp-lbl">${i}</span></div>
      <div class="cmp-row"><span class="cmp-lbl">A</span><span class="cmp-seq">${aHtml}</span></div>
      <div class="cmp-row"><span class="cmp-lbl"></span><span class="cmp-bar">${barHtml}</span></div>
      <div class="cmp-row"><span class="cmp-lbl">B</span><span class="cmp-seq">${bHtml}</span></div>
    `;
  }
  $("compareView").innerHTML = html;
  logEvt(`comparatie A↔B: ${pctI} pe ${res.total} bp (${res.total-res.matches} mismatch)`, 'ok');
  // scroll
  $("compareCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  return res;
}
$("btnCompare").addEventListener("click", renderCompare);

// ====== AI ASSISTANT ======
let aiMessages = []; // istoric local pentru context simplu (nu trimis intreg la backend)

function aiAppendMsg(role, text, opts){
  const chat = $("aiChat");
  const wrap = document.createElement('div');
  wrap.className = 'ai-msg ' + (role === 'user' ? 'ai-user' : 'ai-bot');
  const avatar = role === 'user' ? '🧑‍🔬' : '🤖';
  wrap.innerHTML = `<div class="ai-avatar">${avatar}</div><div class="ai-bubble${opts && opts.typing ? ' typing':''}"></div>`;
  chat.appendChild(wrap);
  const bubble = wrap.querySelector('.ai-bubble');
  bubble.textContent = text;
  chat.scrollTop = chat.scrollHeight;
  return bubble;
}
function aiRenderMarkdown(raw){
  // conversie minima md -> html
  let s = esc(raw);
  s = s.replace(/```([\s\S]*?)```/g, (_, c) => '<pre>'+c+'</pre>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|\n)- (.+)/g, '$1• $2');
  return s;
}

async function askAI(question){
  if (!question) return;
  aiAppendMsg('user', question);
  const bubble = aiAppendMsg('assistant', '', { typing: true });
  bubble.setAttribute('data-raw', '');

  const ctx = {
    question,
    seqA: state.slots.A.seq ? { name: state.slots.A.name || 'A', dna: state.slots.A.seq } : null,
    seqB: state.slots.B.seq ? { name: state.slots.B.name || 'B', dna: state.slots.B.seq } : null,
  };

  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(ctx),
    });
    if (!res.ok){
      bubble.classList.remove('typing');
      bubble.textContent = 'eroare: '+res.status;
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let accum = '';
    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      // parse SSE (event: X\ndata: Y\n\n)
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0){
        const block = buf.slice(0, idx); buf = buf.slice(idx+2);
        const lines = block.split('\n');
        let evt = 'message', data = '';
        for (const ln of lines){
          if (ln.startsWith('event: ')) evt = ln.slice(7);
          else if (ln.startsWith('data: ')) data += ln.slice(6);
        }
        if (!data) continue;
        let payload; try { payload = JSON.parse(data); } catch { continue; }
        if (evt === 'text' && payload.text){
          accum += payload.text;
          bubble.innerHTML = aiRenderMarkdown(accum);
          $("aiChat").scrollTop = $("aiChat").scrollHeight;
        } else if (evt === 'error'){
          accum += '\n\n[eroare: ' + (payload.message || '?') + ']';
          bubble.innerHTML = aiRenderMarkdown(accum);
        } else if (evt === 'done'){
          bubble.classList.remove('typing');
        }
      }
    }
    bubble.classList.remove('typing');
  } catch(e){
    bubble.classList.remove('typing');
    bubble.textContent = 'eroare retea: '+e.message;
  }
}

$("btnAiSend").addEventListener("click", () => {
  const q = $("aiInput").value.trim();
  if (!q) return;
  $("aiInput").value = '';
  askAI(q);
});
$("aiInput").addEventListener("keydown", e=>{
  if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); $("btnAiSend").click(); }
});
document.querySelectorAll('.ai-preset').forEach(btn=>{
  btn.addEventListener('click', ()=> askAI(btn.dataset.q));
});

// ====== Welcome ======
if (localStorage.getItem('geneticaWelcomeHidden') === '1'){
  const w = $("welcome"); if (w) w.classList.add('hidden');
}
$("btnDismissWelcome")?.addEventListener("click", () => {
  $("welcome").classList.add('hidden');
  localStorage.setItem('geneticaWelcomeHidden', '1');
});

// ====== Help modal ======
function openHelp(){
  const html = `
    <h3>❓ Ghid Laborator Genetica</h3>
    <div class="help-body">
      <h4>Ce e aici?</h4>
      <p>Laborator virtual in care "joci" cu ADN: incarci gene reale (NCBI/UCSC), le transformi in
      ARN si proteine, compari doua gene, faci mutatii, CRISPR, digestie cu enzime, PCR, gel.
      In panoul din dreapta ai un <b>asistent AI Claude</b> care raspunde la intrebari despre
      secventele tale.</p>

      <h4>Cum incarc o gena?</h4>
      <p>1. Scrie simbolul in bara de sus (ex: <code>HBB</code>, <code>BRCA1</code>, <code>TP53</code>,
      <code>INS</code>). 2. Alege organism. 3. Alege Slot A sau B ca destinatie. 4. Apasa <b>Incarca</b>.
      Secventa vine de la NCBI (CDS, fara introni, gata de tradus).</p>

      <h4>Slot A vs Slot B</h4>
      <p>Ai doua "memorii" de secvente. Slotul <b>activ</b> (evidentiat) primeste toate operatiile.
      Poti incarca gena X in A, gena Y in B, apoi apesi <b>Compara A↔B</b> ca sa vezi procent de
      identitate si unde difera. Poti schimba rapid slotul activ cu click pe chip-urile din dreapta sus.</p>

      <h4>Bazele (pentru complet nou-veniti)</h4>
      <p><b>ADN</b> = siruri de 4 litere A/T/G/C, grupate in cuvinte de 3 (<b>codoni</b>).
      <b>ARN</b> = copie cu U in loc de T. <b>Proteina</b> = sir de aminoacizi: fiecare codon → 1 AA.
      Start: ATG (Metionina). Stop: TAA/TAG/TGA.</p>

      <h4>Instrumentele</h4>
      <p><b>📜 Transcrie</b>: ADN → ARN. <b>🧬 Tradu</b>: citeste codonii de la ATG la stop →
      proteina. <b>✦ Mutatie</b>: schimbi o baza la o pozitie. <b>✂ CRISPR</b>: dai un ghid de 20bp +
      cere PAM NGG, taie. <b>⎯⎯| Restrictie</b>: enzima taie la site-ul ei (EcoRI: GAATTC etc).
      <b>⚡ PCR</b>: primer forward + reverse → amplicon. <b>▤ Gel</b>: fragmente separate dupa marime.
      <b>⟳ Complement invers</b>: firul antisens.</p>

      <h4>Asistentul AI (Claude)</h4>
      <p>Panoul din dreapta. Apesi un preset ("ce face?", "inrudire A↔B", "unde editez cu CRISPR",
      "boli asociate"...) sau scrii intrebarea ta. Claude primeste secventele din slotii tai si
      raspunde streaming. Poate face WebSearch pentru informatii actualizate (domenii functionale,
      boli asociate etc).</p>

      <h4>Surse de secvente</h4>
      <p><b>Bara globala (NCBI)</b> → CDS curat, gata de tradus. <b>Preset</b> → 6 exemple locale.
      <b>UCSC</b> → secventa genomica (cu introni), utila pentru studii structurale.
      <b>Manual</b> → lipesti propria secventa.</p>
    </div>
    <div class="actions">
      <button class="btn" onclick="closeModal()">am inteles</button>
    </div>
  `;
  $("modalBody").innerHTML = html;
  $("modalBody").classList.add('modal-lg');
  $("modal").classList.add("open");
}
$("btnHelp").addEventListener("click", openHelp);

// ====== Demo automat ======
async function runDemo(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  logEvt('═══ Demo automat: HBB normala vs mutanta falciforma ═══', 'info');
  $("btnDemoAuto").disabled = true;
  try {
    // PAS 1: HBB normala in Slot A
    setActiveSlot('A'); await sleep(300);
    logEvt('PAS 1/6: incarc HBB normala in Slot A', 'info'); await sleep(500);
    setSequence(PRESET_GENES.hbb_normal.seq, 'HBB normala', 'ok'); await sleep(1600);
    // PAS 2: Transcrie + Traducere
    logEvt('PAS 2/6: transcriu + traduc', 'info'); await sleep(500);
    doTranscribe(); await sleep(800); doTranslate(); await sleep(1600);
    // PAS 3: HBB falciforma in Slot B
    setActiveSlot('B'); await sleep(300);
    logEvt('PAS 3/6: incarc HBB falciforma in Slot B', 'info'); await sleep(500);
    setSequence(PRESET_GENES.hbb_sickle.seq, 'HBB falciforma (sickle)', 'ok'); await sleep(1600);
    doTranslate(); await sleep(1200);
    // PAS 4: Comparatie A↔B
    logEvt('PAS 4/6: compar A ↔ B', 'info'); await sleep(500);
    renderCompare(); await sleep(2200);
    // PAS 5: Intrebare AI
    logEvt('PAS 5/6: intreb AI sa explice diferentele', 'info'); await sleep(400);
    askAI('Explica-mi diferenta dintre secventa A (normala) si B (falciforma) si ce efect are asupra proteinei.');
    await sleep(800);
    // PAS 6: revin la slotul A
    setActiveSlot('A');
    logEvt('═══ Demo terminat. Vezi raspunsul AI din dreapta. ═══', 'info');
  } finally {
    $("btnDemoAuto").disabled = false;
  }
}
$("btnDemoAuto").addEventListener("click", runDemo);

// ====== Background particles ======
(function initParticles(){
  const canvas = $("bgParticles");
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = canvas.width = window.innerWidth;
  let h = canvas.height = window.innerHeight;
  window.addEventListener('resize', ()=>{ w = canvas.width = window.innerWidth; h = canvas.height = window.innerHeight; });
  const N = Math.min(80, Math.floor(w*h/18000));
  const parts = Array.from({length: N}, () => ({
    x: Math.random()*w, y: Math.random()*h,
    vx: (Math.random()-0.5)*0.3, vy: (Math.random()-0.5)*0.3,
    r: 0.6 + Math.random()*1.4,
  }));
  function loop(){
    ctx.clearRect(0,0,w,h);
    // particule
    for (const p of parts){
      p.x += p.vx; p.y += p.vy;
      if (p.x<0) p.x=w; if (p.x>w) p.x=0;
      if (p.y<0) p.y=h; if (p.y>h) p.y=0;
      ctx.fillStyle = 'rgba(0,255,136,0.45)';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    }
    // linii intre particule apropiate
    for (let i=0;i<parts.length;i++){
      for (let j=i+1;j<parts.length;j++){
        const dx = parts[i].x-parts[j].x, dy = parts[i].y-parts[j].y;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < 130){
          ctx.strokeStyle = 'rgba(0,255,136,'+(0.18*(1-d/130))+')';
          ctx.lineWidth = 0.5;
          ctx.beginPath(); ctx.moveTo(parts[i].x, parts[i].y); ctx.lineTo(parts[j].x, parts[j].y); ctx.stroke();
        }
      }
    }
    requestAnimationFrame(loop);
  }
  loop();
})();

// ---------- init ----------
initPresets();
updateSlotChips();
renderAll();
logEvt('laborator pornit. cauta o gena sus, apasa "Demo automat", sau intreaba asistentul AI.', 'info');

})();
