// === Laborator Genetica — UI + workflow ===
(function(){
const $=id=>document.getElementById(id);
const BIO = window.GeneticaBio;
const { CODON_TABLE, AA_INFO, RESTRICTION_ENZYMES, PRESET_GENES } = window.GeneticaData;

// ====== STATE ======
// Doua sloturi (A si B) pentru comparatie. "seq" e proxy catre slotul activ.
const state = {
  slots: {
    A: { name: '', seq: '', prevSeq: '', highlights: [], fragments: [], acc: '' },
    B: { name: '', seq: '', prevSeq: '', highlights: [], fragments: [], acc: '' },
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
  state.active = getPanelTarget('srcPresetPanel');
  setSequence(p.seq, 'preset: '+p.name, 'ok');
});

// ---------- edit ----------
$("btnSet").addEventListener("click", ()=>{
  const s = BIO.cleanSeq($("seqInput").value);
  if (!s){ logEvt('secventa goala sau doar caractere non-ATGC', 'err'); return; }
  state.active = getPanelTarget('srcManualPanel');
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
    state.slots[k] = { name:'', seq:'', prevSeq:'', highlights:[], fragments:[], acc:'' };
  }
  $("seqInput").value = '';
  setActiveSlot('A');
  updateSlotChips();
  renderAll();
  logEvt('laborator resetat', 'info');
  $("gelCard").style.display = 'none';
  $("featCard").style.display = 'none';
  $("compareCard").style.display = 'none';
  $("seqVerifyCard").style.display = 'none';
  $("offtargetCard").style.display = 'none';
  $("andesCard").style.display = 'none';
  $("synsorCard").style.display = 'none';
  $("andesVcfCard").style.display = 'none';
  $("stegoCard").style.display = 'none';
  $("mutSummary").innerHTML = '';
});

function setSequence(seq, label, kind, acc){
  const slot = state.slots[state.active];
  slot.prevSeq = slot.seq;
  slot.seq = BIO.cleanSeq(seq);
  slot.name = label;
  slot.highlights = [];
  slot.fragments = [];
  slot.acc = acc || '';
  if ($("seqInput")) $("seqInput").value = slot.seq;
  $("gelCard").style.display = 'none';
  $("featCard").style.display = 'none';
  $("seqVerifyCard").style.display = 'none';
  $("offtargetCard").style.display = 'none';
  $("andesCard").style.display = 'none';
  $("synsorCard").style.display = 'none';
  $("andesVcfCard").style.display = 'none';
  $("stegoCard").style.display = 'none';
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
  document.querySelectorAll('.seg-btn[data-slot]:not(.src-slot-btn)').forEach(b=>{
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
    // andesvcf lucreaza pe VCF, stego poate fi folosit pt encode chiar fara secventa
    if (!state.seq && t !== 'complement' && t !== 'andesvcf' && t !== 'stego'){
      logEvt('nu ai secventa in Slot '+state.active+' — cauta una sau incarca un preset', 'err');
      return;
    }
    if (t === 'transcribe') { doTranscribe(); }
    else if (t === 'translate') { doTranslate(); }
    else if (t === 'mutate') { openMutateModal(); }
    else if (t === 'crispr') { openCrisprModal(); }
    else if (t === 'offtarget') { openOffTargetModal(); }
    else if (t === 'andes') { openAndesModal(); }
    else if (t === 'synsor') { runSynsor(); }
    else if (t === 'andesvcf') { openAndesVcfModal(); }
    else if (t === 'stego') { openStegoModal(); }
    else if (t === 'restriction') { openRestrictionModal(); }
    else if (t === 'pcr') { openPcrModal(); }
    else if (t === 'gel') { openGelModal(); }
    else if (t === 'complement') { doComplement(); }
    else if (t === 'verify') { doVerify(); }
  });
});

// ---------- source tabs ----------
document.querySelectorAll('.src-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.src-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const src = tab.dataset.src;
    const map = { preset:'srcPresetPanel', ncbi:'srcNcbiPanel', ucsc:'srcUcscPanel', manual:'srcManualPanel' };
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

// ---------- SeqVerify ----------
function doVerify(){
  const r = BIO.verifySeq(state.seq);
  $("seqVerifyCard").style.display = 'block';
  $("seqVerifySlotTag").textContent = 'SLOT ' + state.active;

  const headerCls = r.failed > 0 ? 'sv-fail' : r.warned > 0 ? 'sv-warn' : 'sv-pass';
  const statusTxt = r.failed === 0 && r.warned === 0
    ? 'Secventa valida'
    : (r.failed > 0 ? r.failed + (r.failed === 1 ? ' eroare' : ' erori') : '')
      + (r.failed > 0 && r.warned > 0 ? ', ' : '')
      + (r.warned > 0 ? r.warned + (r.warned === 1 ? ' avertisment' : ' avertismente') : '');

  const ICON = { ok: '✓', warn: '⚠', fail: '✗' };
  const CLS  = { ok: 'sv-ok', warn: 'sv-warn', fail: 'sv-err' };

  let html = `
    <div class="sv-header ${headerCls}">
      <span class="sv-score">${r.passed}/${r.total}</span>
      <span class="sv-status">${esc(statusTxt)}</span>
      <span class="sv-meta">${r.dna.length} bp · ${r.gcPct}% GC</span>
    </div>
    <div class="sv-checks">`;

  for (const c of r.checks) {
    html += `<div class="sv-check ${CLS[c.status]}">
      <span class="sv-icon">${ICON[c.status]}</span>
      <span class="sv-label">${esc(c.label)}</span>
      <span class="sv-detail">${esc(c.detail)}</span>
    </div>`;
  }
  html += '</div>';

  $("seqVerifyContent").innerHTML = html;
  $("seqVerifyCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const evtKind = r.failed > 0 ? 'err' : r.warned > 0 ? 'info' : 'ok';
  logEvt('SeqVerify Slot ' + state.active + ': ' + r.passed + '/' + r.total + ' OK'
    + (r.failed > 0 ? ', ' + r.failed + ' erori' : '')
    + (r.warned > 0 ? ', ' + r.warned + ' avertismente' : ''), evtKind);
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

// ---------- CRISPR Off-target (GUIDE-seq pipeline) ----------
const offState = { result: null, filter: 'all' };

function openOffTargetModal(){
  const lastGuide = ($("crisprGuide") && $("crisprGuide").value) || 'TAGCCTGAGATTGCCTCAAC';
  openModal(`
    <h3>⚠ GUIDE-seq Off-target Pipeline</h3>
    <div class="hint" style="margin-bottom:10px">
      Simuleaza analiza GUIDE-Seq: cauta in secventa <b>activa</b> toate locurile unde Cas9
      ar putea taia cu acest ghid, permitand <b>mismatch-uri</b> si <b>bulge-uri</b>.
      Rezultatul = lista prioritizata dupa risc de taiere off-target.
    </div>
    <label>ghid ARN (20 bp, fara PAM)</label>
    <input type="text" id="otGuide" value="${esc(lastGuide)}" style="letter-spacing:.05em">
    <label style="margin-top:10px">mismatch-uri permise (toleranta)</label>
    <select id="otMaxMM">
      <option value="2">2 — strict</option>
      <option value="3">3</option>
      <option value="4" selected>4 — recomandat</option>
      <option value="5">5</option>
      <option value="6">6 — relaxat (multe semnale)</option>
    </select>
    <div class="ot-opts">
      <label class="ot-check"><input type="checkbox" id="otBulges" checked> permite bulge-uri (DNA + RNA, max 1)</label>
      <label class="ot-check"><input type="checkbox" id="otNAG" checked> include PAM NAG (cleavage slab)</label>
    </div>
    <div class="hint" style="margin-top:8px">
      Scor 0–100: greutate mai mare in regiunea <b>seed</b> (poz 12–20, langa PAM). Bulge-urile costa
      ~50% mismatch suplimentar. NAG = factor 0.30 pe scor.
    </div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="runOffTarget()">⚡ ruleaza pipeline</button>
    </div>`);
}

function runOffTarget(){
  const guide = ($("otGuide").value || '').trim();
  const maxMM = parseInt($("otMaxMM").value, 10);
  const allowBulges = $("otBulges").checked;
  const includeNAG = $("otNAG").checked;
  const r = BIO.findOffTargets(state.seq, guide, { maxMismatches: maxMM, allowBulges, includeNAG });
  closeModal();
  if (!r.ok){ logEvt('Off-target: '+r.reason, 'err'); return; }
  offState.result = r;
  offState.filter = 'all';
  renderOffTarget();
  const ot = r.stats.onTarget;
  const off = r.stats.total - ot;
  logEvt('GUIDE-seq pipeline: '+r.stats.total+' site-uri ('+ot+' on-target, '+off+' off-target — '+r.stats.high+' HIGH, '+r.stats.moderate+' MED, '+r.stats.low+' LOW)', off > 0 ? 'crispr' : 'ok');
  $("offtargetCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderOffTarget(){
  const r = offState.result;
  if (!r){ $("offtargetCard").style.display = 'none'; return; }
  $("offtargetCard").style.display = 'block';
  $("offtargetSlotTag").textContent = 'SLOT ' + state.active;

  const st = r.stats;
  const offCount = st.total - st.onTarget;
  $("offtargetSummary").innerHTML = `
    <div class="ot-stat-row">
      <div class="ot-stat"><div class="lab">total site-uri</div><div class="val">${st.total}</div></div>
      <div class="ot-stat ot-on"><div class="lab">on-target</div><div class="val">${st.onTarget}</div></div>
      <div class="ot-stat ot-off"><div class="lab">off-target</div><div class="val">${offCount}</div></div>
      <div class="ot-stat ot-hi"><div class="lab">HIGH</div><div class="val">${st.high}</div></div>
      <div class="ot-stat ot-md"><div class="lab">MED</div><div class="val">${st.moderate}</div></div>
      <div class="ot-stat ot-lo"><div class="lab">LOW</div><div class="val">${st.low}</div></div>
    </div>
    <div class="ot-guide-row">
      ghid: <span class="ot-guide-seq">${esc(r.guide)}</span>
      <span class="ot-params">· max ${r.params.maxMM} mm · bulges ${r.params.allowBulges?'on':'off'} · NAG ${r.params.includeNAG?'on':'off'}</span>
    </div>`;

  document.querySelectorAll('.ot-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === offState.filter);
  });

  const listEl = $("offtargetList");
  let filtered = r.hits;
  if (offState.filter === 'ontarget') filtered = filtered.filter(h => h.onTarget);
  else if (offState.filter === 'high') filtered = filtered.filter(h => !h.onTarget && h.risk === 'high');
  else if (offState.filter === 'moderate') filtered = filtered.filter(h => h.risk === 'moderate');
  else if (offState.filter === 'low') filtered = filtered.filter(h => h.risk === 'low');

  if (!filtered.length){
    listEl.innerHTML = '<div class="ot-empty">Niciun site pentru filtrul curent.</div>';
    return;
  }

  let html = '';
  filtered.forEach((h, idx) => {
    const rank = r.hits.indexOf(h) + 1;
    const riskCls = h.onTarget ? 'ot-r-on' : ('ot-r-' + h.risk);
    const riskLbl = h.onTarget ? 'ON-TARGET' : h.risk.toUpperCase();
    const mmSet = new Set(h.mismatches);
    // randam aliniat target cu mismatch evidentiat + PAM
    let targetHtml = '';
    for (let k = 0; k < h.alignedTarget.length; k++){
      const ch = h.alignedTarget[k];
      let cls = 'ot-b';
      if (ch === '-') cls += ' ot-bulge';
      else if (mmSet.has(k)) cls += ' ot-mm';
      targetHtml += `<span class="${cls}">${ch}</span>`;
    }
    let guideHtml = '';
    for (let k = 0; k < h.alignedGuide.length; k++){
      const ch = h.alignedGuide[k];
      let cls = 'ot-b';
      if (mmSet.has(k)) cls += ' ot-mm';
      guideHtml += `<span class="${cls}">${ch}</span>`;
    }
    let pamHtml = '';
    for (const c of h.pam) pamHtml += `<span class="ot-b ot-pam">${c}</span>`;

    const bulgeTxt = h.bulge ? `<span class="ot-tag ot-tag-bulge">${h.bulge.type}-bulge @${h.bulge.pos}</span>` : '';
    const mmTxt = `<span class="ot-tag">${h.mismatches.length} mm</span>`;
    const pamTxt = `<span class="ot-tag ot-tag-pam">PAM ${h.pamType}</span>`;
    const strandTxt = `<span class="ot-tag ot-tag-strand">fir ${h.strand}</span>`;

    html += `
      <div class="ot-item ${riskCls}" data-idx="${rank-1}">
        <div class="ot-rank">#${rank}</div>
        <div class="ot-body">
          <div class="ot-row1">
            <span class="ot-risk-badge ${riskCls}">${riskLbl}</span>
            <span class="ot-pos">poz ${h.start}–${h.end}</span>
            ${strandTxt}${pamTxt}${mmTxt}${bulgeTxt}
            <span class="ot-score">score <b>${h.score}</b>/100</span>
          </div>
          <div class="ot-align">
            <div class="ot-align-row"><span class="ot-tag-l">target</span><span class="ot-seq">${targetHtml}</span><span class="ot-seq ot-pam-seq">${pamHtml}</span></div>
            <div class="ot-align-row"><span class="ot-tag-l">guide</span><span class="ot-seq">${guideHtml}</span><span class="ot-seq ot-pam-seq ot-pam-ph">NGG</span></div>
          </div>
        </div>
      </div>`;
  });
  listEl.innerHTML = html;

  listEl.querySelectorAll('.ot-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      const hit = r.hits[idx];
      jumpToOffTarget(hit);
    });
  });
}

function jumpToOffTarget(hit){
  // start/end sunt deja in coordonate +strand (am tradus -strand in scanStrand)
  const targetLen = hit.end - hit.start - 3; // exclude PAM (3 bp)
  state.highlights = [
    { start: hit.start, len: targetLen, cls: hit.onTarget ? 'target' : 'mut' },
    { start: hit.end - 3, len: 3, cls: 'pam' },
  ];
  renderDNA();
  $("dnaView").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  // scroll in interiorul viewer-ului pana la pozitia hit-ului
  const dv = $("dnaView");
  const PER_LINE = 60;
  const lineIdx = Math.floor(hit.start / PER_LINE);
  const approxLineHeight = 30;
  dv.scrollTop = Math.max(0, lineIdx * approxLineHeight - 40);
  const riskLbl = hit.onTarget ? 'on-target' : hit.risk;
  logEvt('Off-target #'+(offState.result.hits.indexOf(hit)+1)+' ('+riskLbl+') la poz '+hit.start+' fir '+hit.strand, 'crispr');
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('.ot-filter');
  if (f){
    offState.filter = f.dataset.filter;
    renderOffTarget();
  }
});

// ---------- ANDES (FDA anomaly scan) ----------
const andesState = { result: null, filter: 'all' };

function openAndesModal(){
  const seqLen = state.seq.length;
  const defWin = Math.max(25, Math.min(80, Math.floor(seqLen / 25)));
  openModal(`
    <h3>∿ ANDES — Anomaly Scan</h3>
    <div class="hint" style="margin-bottom:10px">
      Detectie <b>nesupervizata</b> a regiunilor anormale prin <b>Functional Data Analysis</b>.
      Nu trebuie sa stii dinainte ce sa cauti — algoritmul invata fundalul si scoate ce iese
      din tipar (insertii, artefacte, regiuni sub selectie).
    </div>
    <label>fereastra (bp)</label>
    <input type="number" id="andesWin" value="${defWin}" min="15" max="200" step="5">
    <label style="margin-top:10px">pas (bp)</label>
    <input type="number" id="andesStep" value="${Math.max(1, Math.floor(defWin/6))}" min="1" max="50">
    <label style="margin-top:10px">prag z-score anomalie</label>
    <select id="andesThresh">
      <option value="2">2.0 — sensibil (multe anomalii)</option>
      <option value="2.5" selected>2.5 — recomandat</option>
      <option value="3">3.0 — conservator</option>
      <option value="4">4.0 — doar varfuri majore</option>
    </select>
    <div class="hint" style="margin-top:8px">
      Semnale analizate: GC content, entropie Shannon, GC/AT skew, CpG O/E.
      Pentru fiecare: viteza + acceleratie + z-score robust (MAD).
    </div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="runAndes()">∿ scaneaza</button>
    </div>`);
}

function runAndes(){
  const win = parseInt($("andesWin").value, 10);
  const step = parseInt($("andesStep").value, 10);
  const threshold = parseFloat($("andesThresh").value);
  const r = BIO.andesAnalyze(state.seq, { window: win, step, threshold });
  closeModal();
  if (!r.ok){ logEvt('ANDES: '+r.reason, 'err'); return; }
  andesState.result = r;
  andesState.filter = 'all';
  renderAndes();
  logEvt('ANDES: '+r.anomalies.length+' anomalii (win='+r.params.window+'bp, step='+r.params.step+'bp, prag='+r.params.threshold+')', r.anomalies.length ? 'crispr' : 'ok');
  $("andesCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderAndes(){
  const r = andesState.result;
  if (!r){ $("andesCard").style.display = 'none'; return; }
  $("andesCard").style.display = 'block';
  $("andesSlotTag").textContent = 'SLOT ' + state.active;

  const hi = r.anomalies.filter(a => a.severity === 'high').length;
  const md = r.anomalies.filter(a => a.severity === 'moderate').length;
  const lo = r.anomalies.filter(a => a.severity === 'low').length;
  const covered = r.anomalies.reduce((sum, a) => sum + (a.endBp - a.startBp), 0);
  const pct = r.params.length > 0 ? Math.round(covered / r.params.length * 100) : 0;

  $("andesSummary").innerHTML = `
    <div class="andes-stat-row">
      <div class="andes-stat"><div class="lab">secventa</div><div class="val">${r.params.length} bp</div></div>
      <div class="andes-stat"><div class="lab">ferestre</div><div class="val">${r.params.nWin}</div></div>
      <div class="andes-stat"><div class="lab">total anomalii</div><div class="val">${r.anomalies.length}</div></div>
      <div class="andes-stat andes-hi"><div class="lab">HIGH</div><div class="val">${hi}</div></div>
      <div class="andes-stat andes-md"><div class="lab">MED</div><div class="val">${md}</div></div>
      <div class="andes-stat andes-lo"><div class="lab">LOW</div><div class="val">${lo}</div></div>
      <div class="andes-stat andes-cov"><div class="lab">acoperire</div><div class="val">${pct}%</div></div>
    </div>`;

  document.querySelectorAll('.andes-filter').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === andesState.filter);
  });

  // SVG chart
  $("andesChartWrap").innerHTML = renderAndesChart(r);
  $("andesLegend").innerHTML = renderAndesLegend(r);

  // Ranked list
  let filtered = r.anomalies;
  if (andesState.filter === 'high') filtered = filtered.filter(a => a.severity === 'high');
  else if (andesState.filter === 'moderate') filtered = filtered.filter(a => a.severity === 'moderate');
  else if (andesState.filter === 'low') filtered = filtered.filter(a => a.severity === 'low');

  const listEl = $("andesList");
  if (!filtered.length){
    listEl.innerHTML = '<div class="andes-empty">Niciun varf pentru filtrul curent.</div>';
    return;
  }
  let html = '';
  filtered.forEach(a => {
    const rank = r.anomalies.indexOf(a) + 1;
    const sevCls = 'andes-sv-' + a.severity;
    const sigsHtml = a.topSignals.map(t => {
      const tr = r.tracks[t[0]];
      return `<span class="andes-sig-chip" style="color:${tr.color};border-color:${tr.color}66">${tr.name} <b>z=${t[1].toFixed(1)}</b></span>`;
    }).join('');
    html += `
      <div class="andes-item ${sevCls}" data-idx="${rank-1}">
        <div class="andes-rank">#${rank}</div>
        <div class="andes-body">
          <div class="andes-row1">
            <span class="andes-sev-badge ${sevCls}">${a.severity.toUpperCase()}</span>
            <span class="andes-type">${esc(a.type)}</span>
            <span class="andes-pos">poz ${a.startBp}–${a.endBp} <span class="dim">(peak @${a.peakBp})</span></span>
            <span class="andes-score">score <b>${a.score.toFixed(2)}</b></span>
          </div>
          <div class="andes-sigs">${sigsHtml}</div>
        </div>
      </div>`;
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('.andes-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      jumpToAndes(r.anomalies[idx]);
    });
  });
}

function renderAndesChart(r){
  const W = 740, H = 200;
  const m = { t: 14, r: 14, b: 24, l: 38 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const N = r.params.length;
  const xScale = bp => m.l + (bp / N) * iw;
  // Composite y range
  const maxC = Math.max(r.params.threshold * 1.6, ...r.composite, 0.5);
  const yScale = v => m.t + (1 - v / maxC) * ih;

  // Anomaly bands
  let bands = '';
  for (const a of r.anomalies){
    const x1 = xScale(a.startBp), x2 = xScale(a.endBp);
    const sevColor = a.severity === 'high' ? 'rgba(255,43,90,0.18)' :
                     a.severity === 'moderate' ? 'rgba(255,204,58,0.16)' :
                     'rgba(0,229,255,0.12)';
    bands += `<rect x="${x1}" y="${m.t}" width="${Math.max(2, x2-x1)}" height="${ih}" fill="${sevColor}"/>`;
  }
  // Composite path
  let pathC = '';
  for (let i = 0; i < r.centers.length; i++){
    const x = xScale(r.centers[i]);
    const y = yScale(r.composite[i]);
    pathC += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  // Threshold line
  const yT = yScale(r.params.threshold);
  // Axis ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const bp = Math.round(N * f);
    return `<text x="${xScale(bp)}" y="${H - 6}" class="andes-ax-lbl" text-anchor="middle">${bp}</text>`;
  }).join('');
  const yTicks = [];
  for (let v = 0; v <= maxC; v += Math.max(1, Math.round(maxC / 4))){
    yTicks.push(`<line x1="${m.l}" x2="${W-m.r}" y1="${yScale(v)}" y2="${yScale(v)}" class="andes-grid"/>`);
    yTicks.push(`<text x="${m.l-6}" y="${yScale(v)+3}" class="andes-ax-lbl" text-anchor="end">${v.toFixed(0)}</text>`);
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="andes-svg">
      ${yTicks.join('')}
      ${bands}
      <line x1="${m.l}" x2="${W-m.r}" y1="${yT}" y2="${yT}" class="andes-thresh"/>
      <text x="${W-m.r}" y="${yT-4}" class="andes-ax-lbl" text-anchor="end" fill="#ff9333">prag z=${r.params.threshold}</text>
      <path d="${pathC}" class="andes-composite"/>
      <text x="${m.l}" y="${m.t-2}" class="andes-ax-lbl" fill="#8cab9d">scor compozit (|viteza|+|acceleratie|, z-MAD)</text>
      ${xTicks}
    </svg>`;
}

function renderAndesLegend(r){
  // Mini track strips: 5 small charts, one per signal
  const tracks = r.tracks;
  const keys = Object.keys(tracks);
  const W = 740, stripH = 38;
  const m = { l: 38, r: 14, t: 4, b: 8 };
  const iw = W - m.l - m.r;
  const N = r.params.length;
  const xScale = bp => m.l + (bp / N) * iw;
  let strips = '';
  for (const k of keys){
    const tr = tracks[k];
    const vals = tr.values;
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    const yScale = v => m.t + (1 - (v - min) / span) * (stripH - m.t - m.b);
    let path = '';
    for (let i = 0; i < r.centers.length; i++){
      const x = xScale(r.centers[i]);
      const y = yScale(vals[i]);
      path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
    }
    strips += `
      <svg viewBox="0 0 ${W} ${stripH}" preserveAspectRatio="xMidYMid meet" class="andes-strip">
        <text x="0" y="${stripH/2 + 4}" class="andes-strip-lbl" fill="${tr.color}">${tr.name}</text>
        <path d="${path}" style="stroke:${tr.color};fill:none;stroke-width:1.2"/>
      </svg>`;
  }
  return strips;
}

function jumpToAndes(anom){
  state.highlights = [
    { start: anom.startBp, len: anom.endBp - anom.startBp, cls: anom.severity === 'high' ? 'mut' : 'target' },
    { start: anom.peakBp, len: 1, cls: 'cut' },
  ];
  renderDNA();
  $("dnaView").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const PER_LINE = 60;
  const lineIdx = Math.floor(anom.startBp / PER_LINE);
  $("dnaView").scrollTop = Math.max(0, lineIdx * 30 - 40);
  logEvt('ANDES #'+(andesState.result.anomalies.indexOf(anom)+1)+' ('+anom.severity+', '+anom.type+') la '+anom.startBp+'-'+anom.endBp, 'crispr');
}

document.addEventListener('click', (e) => {
  const f = e.target.closest('.andes-filter');
  if (f){
    andesState.filter = f.dataset.filter;
    renderAndes();
  }
});

// ---------- DNA Steganography (encode + scan) ----------
const stegoState = { mode: 'encode', scheme: 'base-4', lastEncoded: '', lastScan: null };

function openStegoModal(){
  openModal(`
    <h3>🔐 Cod secret in ADN</h3>
    <div class="seg" style="margin-bottom:10px">
      <button class="seg-btn ${stegoState.mode==='encode'?'active':''}" onclick="setStegoMode('encode')">✎ Encodeaza</button>
      <button class="seg-btn ${stegoState.mode==='scan'?'active':''}" onclick="setStegoMode('scan')">🔍 Scaneaza</button>
    </div>
    <div id="stegoModalBody"></div>
  `);
  renderStegoModal();
}
window.setStegoMode = function(m){ stegoState.mode = m; renderStegoModal(); openStegoModal(); };
window.setStegoScheme = function(s){ stegoState.scheme = s; renderStegoModal(); };

function renderStegoModal(){
  const body = $("stegoModalBody");
  if (!body) return;
  if (stegoState.mode === 'encode'){
    body.innerHTML = `
      <label>schema codare</label>
      <div class="seg" style="margin-bottom:8px">
        <button class="seg-btn ${stegoState.scheme==='base-4'?'active':''}" onclick="setStegoScheme('base-4')">Base-4 (universal)</button>
        <button class="seg-btn ${stegoState.scheme==='codon'?'active':''}" onclick="setStegoScheme('codon')">Codon (64 caractere)</button>
      </div>
      <label style="margin-top:6px">mesajul de codat</label>
      <textarea id="stegoMsg" rows="2" class="holo-input" placeholder="Scrie mesajul aici..." spellcheck="false">HELLO LAB 2026</textarea>
      <div class="row" style="margin-top:8px;gap:6px;display:flex">
        <button class="btn holo-btn" onclick="doStegoEncode()" style="flex:1">↳ codifica</button>
        <button class="btn-ghost" onclick="doStegoInsert()" id="btnStegoInsert" disabled>insereaza in Slot ${state.active}</button>
      </div>
      <div class="hint" id="stegoEncodeOut" style="margin-top:10px"></div>
      <div class="actions">
        <button class="btn-ghost" onclick="closeModal()">inchide</button>
      </div>`;
  } else {
    const hasSeq = !!state.seq;
    body.innerHTML = `
      <div class="hint" style="margin-bottom:8px">
        Scaneaza secvența activa <b>Slot ${state.active}</b> ${hasSeq ? '('+state.seq.length+' bp)' : '(gol)'} pentru mesaje ascunse.
        Incearca Base-4 cu 4 offset-uri si Codon cu 3 offset-uri.
      </div>
      <label>lungime minima text decodat</label>
      <select id="stegoMinLen">
        <option value="4">4 caractere — agresiv (multe false-pozitive)</option>
        <option value="6" selected>6 caractere — recomandat</option>
        <option value="10">10 caractere — strict</option>
      </select>
      <label style="margin-top:8px">prag scor</label>
      <select id="stegoMinScore">
        <option value="1">1.0 — sensibil</option>
        <option value="2" selected>2.0 — recomandat</option>
        <option value="3">3.0 — doar mesaje clare</option>
      </select>
      <div class="actions">
        <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
        <button class="btn" onclick="doStegoScan()" ${!hasSeq?'disabled':''}>🔍 scaneaza</button>
      </div>`;
  }
}

window.doStegoEncode = function(){
  const msg = $("stegoMsg").value;
  if (!msg){ logEvt('stego: mesaj gol', 'err'); return; }
  let dna;
  if (stegoState.scheme === 'base-4') dna = BIO.encodeBase4(msg);
  else dna = BIO.encodeCodon(msg);
  stegoState.lastEncoded = dna;
  $("stegoEncodeOut").innerHTML = `
    <div class="stego-out-meta">${msg.length} caractere → ${dna.length} bp (${stegoState.scheme})</div>
    <textarea class="holo-input stego-out-seq" rows="3" readonly>${esc(dna)}</textarea>
    <button class="btn-ghost" onclick="navigator.clipboard.writeText('${dna}')" style="margin-top:4px">📋 copiaza</button>`;
  $("btnStegoInsert").disabled = false;
};

window.doStegoInsert = function(){
  if (!stegoState.lastEncoded){ logEvt('stego: nimic de inserat', 'err'); return; }
  if (!state.seq) {
    // Folosim direct ca slot continut
    setSequence(stegoState.lastEncoded, 'stego: '+stegoState.scheme, 'crispr');
    closeModal();
    return;
  }
  // Insereaza la o pozitie — cere user-ului
  const posStr = prompt(`Insereaza la pozitia (0..${state.seq.length}):`, state.seq.length);
  if (posStr === null) return;
  const pos = Math.max(0, Math.min(state.seq.length, parseInt(posStr, 10) || 0));
  state.prevSeq = state.seq;
  state.seq = state.seq.slice(0, pos) + stegoState.lastEncoded + state.seq.slice(pos);
  state.highlights = [{ start: pos, len: stegoState.lastEncoded.length, cls: 'mut' }];
  renderAll();
  closeModal();
  logEvt(`stego: mesaj ${stegoState.scheme} inserat la poz ${pos} (+${stegoState.lastEncoded.length} bp)`, 'crispr');
};

window.doStegoScan = function(){
  if (!state.seq){ logEvt('stego: nicio secventa de scanat', 'err'); return; }
  const minLen = parseInt($("stegoMinLen").value, 10);
  const minScore = parseFloat($("stegoMinScore").value);
  const candidates = BIO.steganoScan(state.seq, { minLen, minScore });
  stegoState.lastScan = candidates;
  closeModal();
  renderStegoResults();
  logEvt('stego scan: '+candidates.length+' candidati', candidates.length ? 'crispr' : 'info');
  $("stegoCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

function renderStegoResults(){
  const cands = stegoState.lastScan || [];
  $("stegoCard").style.display = 'block';
  $("stegoSlotTag").textContent = 'SLOT ' + state.active;
  if (!cands.length){
    $("stegoBody").innerHTML = '<div class="stego-empty">Nicio secventa citibila gasita peste pragul ales. Incearca prag mai mic sau o secventa cu mesaj ascuns.</div>';
    return;
  }
  let html = `<div class="stego-results-head">Candidati găsiți: <b>${cands.length}</b> · ranking dupa scor de citibilitate</div>`;
  html += '<div class="stego-list">';
  cands.forEach((c, i) => {
    const cls = c.score >= 4 ? 'stego-hi' : c.score >= 2.5 ? 'stego-md' : 'stego-lo';
    const dnaPreview = state.seq.slice(c.dna_start, c.dna_end);
    const dnaShort = dnaPreview.length > 60 ? dnaPreview.slice(0, 60) + '…' : dnaPreview;
    html += `
      <div class="stego-item ${cls}" data-idx="${i}">
        <div class="stego-rank">#${i+1}</div>
        <div class="stego-body-row">
          <div class="stego-row1">
            <span class="stego-scheme">${esc(c.scheme)} <span class="stego-off">off=${c.offset}</span></span>
            <span class="stego-pos">DNA ${c.dna_start}–${c.dna_end} <span class="dim">(${c.dna_end - c.dna_start}bp)</span></span>
            <span class="stego-score">scor <b>${c.score.toFixed(2)}</b></span>
          </div>
          <div class="stego-text">${esc(c.text)}</div>
          <div class="stego-dna">${esc(dnaShort)}</div>
        </div>
      </div>`;
  });
  html += '</div>';
  $("stegoBody").innerHTML = html;
  $("stegoBody").querySelectorAll('.stego-item').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      const c = cands[idx];
      state.highlights = [{ start: c.dna_start, len: c.dna_end - c.dna_start, cls: 'target' }];
      renderDNA();
      $("dnaView").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const PER_LINE = 60;
      $("dnaView").scrollTop = Math.max(0, Math.floor(c.dna_start / PER_LINE) * 30 - 40);
      logEvt(`stego: "${c.text.slice(0,30)}" @ ${c.dna_start}-${c.dna_end} (${c.scheme})`, 'crispr');
    });
  });
}

// ---------- ANDES-VCF (real, server-side pipeline) ----------
const andesVcfState = { result: null, filter: 'M' };

function openAndesVcfModal(){
  openModal(`
    <h3>∿+ ANDES-VCF · port faithful</h3>
    <div class="hint" style="margin-bottom:10px">
      Pipeline-ul real din <b>riakanjilal/ANDES (2024)</b>. Accepta VCF cu
      <b>multi-sample SNPs</b> pe un singur cromosom. Minim 200 SNPuri si 4 sample-uri.
    </div>
    <label>VCF (upload fisier)</label>
    <input type="file" id="andesVcfFile" accept=".vcf,.txt" class="holo-input">
    <label style="margin-top:10px">sau lipeste continut VCF aici</label>
    <textarea id="andesVcfText" rows="5" class="holo-input"
      placeholder="##fileformat=VCFv4.1&#10;#CHROM POS ID REF ALT QUAL FILTER INFO FORMAT sample1 sample2 ...&#10;22 16050075 . A G . PASS . GT 0|0 1|0 ..." spellcheck="false"></textarea>
    <label style="margin-top:10px">prag p-value (anomalii)</label>
    <select id="andesVcfThresh">
      <option value="0.01">10⁻² — sensibil</option>
      <option value="0.001" selected>10⁻³ — recomandat</option>
      <option value="0.0001">10⁻⁴ — conservator</option>
      <option value="0.00001">10⁻⁵ — doar peak-uri majore</option>
    </select>
    <div class="hint" style="margin-top:8px;font-size:11px">
      <b>Demo:</b> <a href="https://raw.githubusercontent.com/riakanjilal/ANDES/main/CEU22.vcf" target="_blank" style="color:var(--cy)">CEU22.vcf</a>
      (chr22, 1000 Genomes CEU, 99 indivizi, 994 SNPs). Pipeline ~1s pe acest VCF.
    </div>
    <div class="actions">
      <button class="btn-ghost" onclick="closeModal()">anuleaza</button>
      <button class="btn" onclick="runAndesVcf()">∿+ scaneaza</button>
    </div>`);
}

async function runAndesVcf(){
  const fileInput = $("andesVcfFile");
  const textInput = $("andesVcfText");
  const thresh = parseFloat($("andesVcfThresh").value);
  let vcfText = (textInput.value || '').trim();
  if (!vcfText && fileInput.files && fileInput.files[0]){
    vcfText = await fileInput.files[0].text();
  }
  closeModal();
  if (!vcfText){ logEvt('ANDES-VCF: VCF gol', 'err'); return; }

  logEvt('ANDES-VCF: pipeline pornit (poate dura 1-30s)...', 'info');
  $("andesVcfCard").style.display = 'block';
  $("andesVcfSummary").innerHTML = '<div class="hint">procesare in curs...</div>';
  try {
    const r = await fetch('/api/andes/vcf', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ vcf: vcfText, p_threshold: thresh })
    });
    const j = await r.json();
    if (!j.ok){ logEvt('ANDES-VCF: '+(j.reason||'esuat'), 'err'); $("andesVcfSummary").innerHTML = '<div class="hint">'+esc(j.reason||'?')+'</div>'; return; }
    andesVcfState.result = j;
    andesVcfState.filter = 'M';
    renderAndesVcf();
    logEvt('ANDES-VCF: '+j.n_snps+' SNPs, '+j.n_samples+' samples, '+j.anomalies_M.length+' anomalii MD-M, '+j.anomalies_F.length+' MD-F', 'crispr');
    $("andesVcfCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch(e){
    logEvt('ANDES-VCF retea: '+e.message, 'err');
  }
}

function renderAndesVcf(){
  const r = andesVcfState.result;
  if (!r){ $("andesVcfCard").style.display = 'none'; return; }
  $("andesVcfCard").style.display = 'block';

  const hi_M = r.anomalies_M.length;
  const hi_F = r.anomalies_F.length;
  $("andesVcfSummary").innerHTML = `
    <div class="andes-stat-row">
      <div class="andes-stat"><div class="lab">chrom</div><div class="val">${esc(r.chrom)}</div></div>
      <div class="andes-stat"><div class="lab">SNPs</div><div class="val">${r.n_snps}</div></div>
      <div class="andes-stat"><div class="lab">samples</div><div class="val">${r.n_samples}</div></div>
      <div class="andes-stat"><div class="lab">ferestre</div><div class="val">${r.n_windows}</div></div>
      <div class="andes-stat"><div class="lab">stretches FDA</div><div class="val">${r.n_stretches}</div></div>
      <div class="andes-stat andes-hi"><div class="lab">anom MD-M</div><div class="val">${hi_M}</div></div>
      <div class="andes-stat andes-md"><div class="lab">anom MD-F</div><div class="val">${hi_F}</div></div>
    </div>`;

  // filter buttons
  document.querySelectorAll('.andes-filter[data-vcf-filter]').forEach(b => {
    b.classList.toggle('active', b.dataset.vcfFilter === andesVcfState.filter);
    b.onclick = () => { andesVcfState.filter = b.dataset.vcfFilter; renderAndesVcf(); };
  });

  $("andesVcfChartWrap").innerHTML = renderAndesVcfChart(r, andesVcfState.filter);

  // ranked anomaly list
  const anomalies = (andesVcfState.filter === 'M') ? r.anomalies_M : r.anomalies_F;
  const listEl = $("andesVcfList");
  if (!anomalies.length){
    listEl.innerHTML = '<div class="andes-empty">Nicio anomalie sub pragul ales pentru ' + andesVcfState.filter + '.</div>';
    return;
  }
  // sortat dupa min_p
  const sorted = anomalies.slice().sort((a,b) => a.min_p - b.min_p);
  let html = '';
  sorted.forEach((a, i) => {
    const log10 = -Math.log10(Math.max(a.min_p, 1e-300));
    const sev = log10 >= 10 ? 'high' : log10 >= 5 ? 'moderate' : 'low';
    html += `
      <div class="andes-item andes-sv-${sev}" data-peak="${a.peak}">
        <div class="andes-rank">#${i+1}</div>
        <div class="andes-body">
          <div class="andes-row1">
            <span class="andes-sev-badge andes-sv-${sev}">${sev.toUpperCase()}</span>
            <span class="andes-type">${r.chrom}:${a.start.toLocaleString()}–${a.end.toLocaleString()}</span>
            <span class="andes-pos"><span class="dim">peak</span> ${a.peak.toLocaleString()} · <span class="dim">${a.n_windows} ferestre</span></span>
            <span class="andes-score">p = <b>${a.min_p.toExponential(2)}</b> · -log₁₀ = <b>${log10.toFixed(1)}</b></span>
          </div>
        </div>
      </div>`;
  });
  listEl.innerHTML = html;
  listEl.querySelectorAll('.andes-item').forEach(el => {
    el.addEventListener('click', () => {
      const peak = parseInt(el.dataset.peak, 10);
      logEvt(`ANDES-VCF: jump la ${r.chrom}:${peak.toLocaleString()}`, 'info');
    });
  });
}

function renderAndesVcfChart(r, which){
  const W = 740, H = 220;
  const m = { t: 14, r: 14, b: 30, l: 50 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  // colecteaza pozitii + log10 p pentru tracker-ul ales
  const key = which === 'M' ? 'log10_p_M' : 'log10_p_F';
  const data = r.windows.filter(w => w[key] != null && isFinite(w[key]));
  if (!data.length) return '<div class="hint">Fara date</div>';
  const xs = data.map(d => d.pos);
  const ys = data.map(d => d[key]);
  const xmin = Math.min(...xs), xmax = Math.max(...xs);
  const ymax = Math.max(...ys, 4);
  const xScale = x => m.l + (x - xmin) / (xmax - xmin) * iw;
  const yScale = v => m.t + (1 - v / ymax) * ih;
  const threshLog = -Math.log10(r.p_threshold);
  const yT = yScale(threshLog);

  // anomaly bands
  const anomalies = which === 'M' ? r.anomalies_M : r.anomalies_F;
  let bands = '';
  for (const a of anomalies){
    const x1 = xScale(a.start), x2 = xScale(a.end);
    bands += `<rect x="${x1}" y="${m.t}" width="${Math.max(2, x2-x1)}" height="${ih}" fill="rgba(255,43,90,0.15)"/>`;
  }

  // composite path
  let path = '';
  for (let i = 0; i < data.length; i++){
    const x = xScale(data[i].pos), y = yScale(ys[i]);
    path += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  // ticks
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const pos = xmin + (xmax - xmin) * f;
    return `<text x="${xScale(pos)}" y="${H - 10}" class="andes-ax-lbl" text-anchor="middle">${Math.round(pos).toLocaleString()}</text>`;
  }).join('');
  const yTicks = [];
  for (let v = 0; v <= ymax; v += Math.max(1, Math.round(ymax / 5))){
    yTicks.push(`<line x1="${m.l}" x2="${W-m.r}" y1="${yScale(v)}" y2="${yScale(v)}" class="andes-grid"/>`);
    yTicks.push(`<text x="${m.l-6}" y="${yScale(v)+3}" class="andes-ax-lbl" text-anchor="end">${v}</text>`);
  }

  return `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="andes-svg">
      ${yTicks.join('')}
      ${bands}
      <line x1="${m.l}" x2="${W-m.r}" y1="${yT}" y2="${yT}" class="andes-thresh"/>
      <text x="${W-m.r}" y="${yT-4}" class="andes-ax-lbl" text-anchor="end" fill="#ff9333">prag -log₁₀(p)=${threshLog.toFixed(1)}</text>
      <path d="${path}" class="andes-composite" style="stroke:${which==='M'?'#00ff88':'#ff3df5'}"/>
      <text x="${m.l}" y="${m.t-2}" class="andes-ax-lbl" fill="#8cab9d">${which==='M'?'MD-M (Moments, 8 features)':'MD-F (FDA, 216 features)'} — -log₁₀(p)</text>
      <text x="${W/2}" y="${H - 1}" class="andes-ax-lbl" fill="#8cab9d" text-anchor="middle">${r.chrom} position (bp)</text>
      ${xTicks}
    </svg>`;
}

// ---------- Synsor (engineered vs natural) ----------
const synsorState = { result: null };

function runSynsor(){
  const r = BIO.synsorScan(state.seq, {});
  if (!r.ok){ logEvt('Synsor: '+r.reason, 'err'); return; }
  synsorState.result = r;
  renderSynsor();
  logEvt(`Synsor: P(engineered)=${r.probability}% → ${r.verdict}` + (r.smokingGun ? ' · '+r.smokingGun : ''), r.probability >= 50 ? 'crispr' : 'ok');
  $("synsorCard").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSynsor(){
  const r = synsorState.result;
  if (!r){ $("synsorCard").style.display = 'none'; return; }
  $("synsorCard").style.display = 'block';
  $("synsorSlotTag").textContent = 'SLOT ' + state.active;

  // gauge
  const fill = $("synGaugeFill");
  fill.style.width = r.probability + '%';
  let gaugeColor;
  if (r.probability >= 70) gaugeColor = 'linear-gradient(90deg,var(--rd),var(--or))';
  else if (r.probability >= 40) gaugeColor = 'linear-gradient(90deg,var(--ye),var(--or))';
  else if (r.probability >= 20) gaugeColor = 'linear-gradient(90deg,var(--cy),var(--ye))';
  else gaugeColor = 'linear-gradient(90deg,var(--lime),var(--cy))';
  fill.style.background = gaugeColor;

  $("synProb").textContent = r.probability;
  const v = $("synVerdict");
  v.textContent = r.verdict.toUpperCase();
  v.className = 'syn-verdict';
  if (r.probability >= 70) v.classList.add('syn-v-hi');
  else if (r.probability >= 40) v.classList.add('syn-v-mid');
  else v.classList.add('syn-v-lo');

  $("synSmokeGun").innerHTML = r.smokingGun
    ? `<span class="syn-smoke-chip">⚠ smoking-gun: ${esc(r.smokingGun)}</span>`
    : '';

  // per-signal bars
  const SIGNAL_LABELS = {
    motif: { lbl: 'motive engineered', color: 'var(--rd)' },
    codon: { lbl: 'codon-bias', color: 'var(--mg)' },
    kmer:  { lbl: 'k-mer signature', color: 'var(--cy)' },
    gc:    { lbl: 'GC uniformity', color: 'var(--ye)' },
    pal:   { lbl: 'palindromuri (MCS)', color: 'var(--or)' },
  };
  let barsHtml = '';
  for (const key of ['motif','codon','kmer','gc','pal']){
    const v = r.breakdown[key];
    const lbl = SIGNAL_LABELS[key];
    const pct = v == null ? 0 : Math.round(v * 100);
    const stateTxt = v == null ? '<span class="syn-bar-na">n/a</span>' : pct + '%';
    let extra = '';
    const s = r.signals[key];
    if (key === 'motif') extra = `${s.count} hit-uri, ${Object.keys(s.byCat).length} categorii`;
    else if (key === 'codon' && s.entropy != null) extra = `entropie codon=${s.entropy.toFixed(2)}`;
    else if (key === 'kmer' && s.chi2_per_kb != null) extra = `χ²/kb=${s.chi2_per_kb.toFixed(1)} (k=${s.k})`;
    else if (key === 'gc' && s.mean != null) extra = `μ=${(s.mean*100).toFixed(0)}% σ=${(s.std*100).toFixed(2)}%`;
    else if (key === 'pal' && s.density_per_kb != null) extra = `${s.density_per_kb.toFixed(1)}/kb`;
    barsHtml += `
      <div class="syn-bar-row">
        <div class="syn-bar-lbl">${esc(lbl.lbl)}</div>
        <div class="syn-bar-track"><div class="syn-bar-fill" style="width:${pct}%;background:${lbl.color}"></div></div>
        <div class="syn-bar-val">${stateTxt} <span class="syn-bar-extra">${esc(extra)}</span></div>
      </div>`;
  }
  $("synBars").innerHTML = barsHtml;

  // motifs list
  $("synMotifCount").textContent = r.motifs.length ? `(${r.motifs.length})` : '';
  if (!r.motifs.length){
    $("synMotifs").innerHTML = '<div class="syn-empty">Niciun motiv engineered cunoscut detectat.</div>';
    return;
  }
  const CAT_COLOR = {
    promoter:'var(--cy)', operator:'#6ae4ff', polyA:'#0080ff',
    rbs:'var(--ye)', kozak:'var(--ye)', terminator:'var(--or)',
    tag:'var(--mg)', '2A':'#ff7df8', fluor:'var(--lime)',
    ori:'#10a37f', resistance:'var(--rd)', recomb:'var(--or)', crispr:'#ff3df5',
  };
  let mHtml = '';
  r.motifs.forEach((m, idx) => {
    const color = CAT_COLOR[m.cat] || 'var(--dim)';
    mHtml += `
      <div class="syn-motif" data-idx="${idx}" style="border-color:${color}55">
        <div class="syn-motif-cat" style="color:${color};border-color:${color}66">${esc(m.cat)}</div>
        <div class="syn-motif-name">${esc(m.name)}</div>
        <div class="syn-motif-pos">${m.start}–${m.end} <span class="dim">fir ${m.strand}</span></div>
      </div>`;
  });
  $("synMotifs").innerHTML = mHtml;
  $("synMotifs").querySelectorAll('.syn-motif').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.dataset.idx, 10);
      const m = r.motifs[idx];
      state.highlights = [{ start: m.start, len: m.end - m.start, cls: 'target' }];
      renderDNA();
      $("dnaView").scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const PER_LINE = 60;
      const lineIdx = Math.floor(m.start / PER_LINE);
      $("dnaView").scrollTop = Math.max(0, lineIdx * 30 - 40);
      logEvt('Synsor: '+m.name+' @ '+m.start, 'crispr');
    });
  });
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
// Tool modals (apelate din onclick="" in modal HTML — au nevoie sa fie pe window)
window.runOffTarget = runOffTarget;
window.runAndes = runAndes;
window.runAndesVcf = runAndesVcf;

// ====== GLOBAL SEARCH BAR ======
const NCBI_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
let suggestTimer = null;
let suggestions = [];
let selectedSuggest = -1;

// slot global (bara search + workspace chips) — NU include panourile surse
document.addEventListener('click', e => {
  const btn = e.target.closest('.seg-btn[data-slot]');
  if (btn && !btn.classList.contains('src-slot-btn')) setActiveSlot(btn.dataset.slot);
});

// slot local per panou sursa — nu schimba slotul global activ
document.addEventListener('click', e => {
  const btn = e.target.closest('.src-slot-btn[data-slot]');
  if (!btn) return;
  const panel = btn.closest('.src-panel');
  if (!panel) return;
  panel.querySelectorAll('.src-slot-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  panel.dataset.targetSlot = btn.dataset.slot;
});

function getPanelTarget(panelId){
  const p = $(panelId);
  return (p && p.dataset.targetSlot) || 'A';
}

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

// Maparea organisme NCBI -> UCSC genome assemblies
const ORG_TO_UCSC_GENOME = {
  human: 'hg38', mouse: 'mm39', rat: 'rn7',
  zebrafish: 'danRer11', fly: 'dm6', yeast: 'sacCer3',
  // (e.coli si arabidopsis nu sunt servite consistent de UCSC — fallback la NCBI)
};

function getSearchSource(){
  const btn = $("searchSrc");
  return (btn && btn.dataset.src) || 'ncbi';
}

function toggleSearchSource(){
  const btn = $("searchSrc");
  const cur = btn.dataset.src || 'ncbi';
  const next = cur === 'ncbi' ? 'ucsc' : 'ncbi';
  btn.dataset.src = next;
  btn.textContent = next.toUpperCase();
  closeSuggest();
  logEvt('cautare globala: sursa = ' + next.toUpperCase(), 'info');
}
if ($("searchSrc")) $("searchSrc").addEventListener('click', toggleSearchSource);

async function runGlobalSearchUCSC(){
  const q = $("globalSearch").value.trim();
  const org = $("searchOrg").value;
  if (!q) return;
  const genome = ORG_TO_UCSC_GENOME[org];
  if (!genome){
    logEvt(`UCSC: organismul "${org}" nu e disponibil — comuta pe NCBI sau alege uman/soarece/sobolan/zebrafish/musca/drojdie`, 'err');
    return;
  }
  closeSuggest();
  logEvt(`cautare UCSC: ${q} in ${genome}...`, 'info');
  try {
    const sUrl = `${UCSC_API}/search?search=${encodeURIComponent(q)};genome=${genome}`;
    const sRes = await fetch(sUrl).then(r => r.json());
    const categories = sRes.positionMatches || [];
    const priority = ['knownGene', 'mane', 'ncbiRefSeqCurated', 'ncbiRefSeq', 'refGene', 'hgnc'];
    let hit = null;
    for (const p of priority){
      const cat = categories.find(c => (c.name || c.trackName) === p);
      if (cat && cat.matches && cat.matches.length){
        const exact = cat.matches.find(m => (m.posName || '').split(/[\s(]/)[0].toUpperCase() === q.toUpperCase());
        hit = exact || cat.matches[0];
        if (hit){ hit._track = p; break; }
      }
    }
    if (!hit){ for (const c of categories){ if (c.matches && c.matches.length){ hit = c.matches[0]; hit._track = c.name||c.trackName; break; } } }
    if (!hit){ logEvt(`UCSC: ${q} in ${genome} negasit`, 'err'); return; }
    const pm = (hit.position || '').match(/^([^:]+):(\d+)-(\d+)$/);
    if (!pm){ logEvt('UCSC: pozitie invalida', 'err'); return; }
    const chrom = pm[1], startG = +pm[2], endG = +pm[3];
    const maxLen = 1500;
    const fetchEnd = Math.min(endG, startG + maxLen);
    const qUrl = `${UCSC_API}/getData/sequence?genome=${genome};chrom=${chrom};start=${startG};end=${fetchEnd}`;
    const qRes = await fetch(qUrl).then(r => r.json());
    const dna = (qRes.dna || '').toUpperCase();
    if (!dna){ logEvt('UCSC: secventa goala', 'err'); return; }
    setSequence(dna, `UCSC ${q} (${genome}) ${chrom}:${startG}-${fetchEnd}`, 'ok');
  } catch(e){ logEvt('UCSC: '+e.message, 'err'); }
}

async function runGlobalSearch(){
  if (getSearchSource() === 'ucsc') return runGlobalSearchUCSC();
  const q = $("globalSearch").value.trim();
  const org = $("searchOrg").value;
  if (!q){ return; }
  closeSuggest();
  logEvt(`cautare NCBI: ${q} in ${org}...`, 'info');
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
    // bara globala nu are panou → merge in slotul activ curent
    setSequence(dna, `${q} (${org}) CDS · ${acc}`, 'ok', acc);
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
    state.active = getPanelTarget('srcUcscPanel');
    setSequence(dna, `UCSC ${symbol} (${genome}) ${chrom}:${startG}-${fetchEnd}`, 'ok');
  } catch(e){ $("ucscStatus").textContent = 'eroare: '+e.message; logEvt('UCSC: '+e.message, 'err'); }
}
$("btnFetchUCSC").addEventListener("click", fetchFromUCSC);
$("ucscGene").addEventListener("keydown", e => { if (e.key === 'Enter') fetchFromUCSC(); });

// ====== NCBI panel (acces direct / simbol + organism) ======
async function fetchFromNCBI(){
  const query = $("ncbiQuery").value.trim();
  const org = $("ncbiOrg").value;
  const seqType = $("ncbiSeqType").value;
  if (!query){ logEvt('NCBI: query gol', 'err'); return; }
  $("ncbiStatus").textContent = `caut ${query}...`;
  try {
    let accId = null;
    // detecteaza numar de acces RefSeq (NM_, NC_ etc.) sau GenBank (MK548699, AY123456 etc.)
    if (/^[A-Z]{1,2}[\d_]/.test(query.toUpperCase())){
      accId = query;
    } else {
      // cauta dupa simbol gena
      const filter = seqType === 'cds'
        ? 'refseq_select[filter]'
        : 'refseq[filter] AND biomol_mrna[PROP]';
      const term = `${query}[Gene Name] AND ${org}[orgn] AND ${filter}`;
      const sr = await fetch(`${NCBI_API}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(term)}&retmode=json&retmax=1`);
      const sj = await sr.json();
      const ids = (sj.esearchresult && sj.esearchresult.idlist) || [];
      if (!ids.length){
        $("ncbiStatus").textContent = `negasit: ${query} in ${org}`;
        logEvt(`NCBI: ${query} nu gasit in ${org}`, 'err');
        return;
      }
      accId = ids[0];
    }
    const rettype = seqType === 'cds' ? 'fasta_cds_na' : 'fasta';
    const fr = await fetch(`${NCBI_API}/efetch.fcgi?db=nuccore&id=${encodeURIComponent(accId)}&rettype=${rettype}&retmode=text`);
    const fasta = await fr.text();
    const rec = parseFasta(fasta);
    const dna = rec.seq.toUpperCase().replace(/[^ATGC]/g, '');
    if (!dna){
      $("ncbiStatus").textContent = 'secventa vida sau format invalid';
      logEvt('NCBI: secventa vida', 'err');
      return;
    }
    const shortHdr = (rec.header || query).substring(0, 55);
    $("ncbiStatus").innerHTML = `<b>${esc(query)}</b> · ${dna.length} bp · <span style="color:var(--dim)">${esc(shortHdr)}</span>`;
    state.active = getPanelTarget('srcNcbiPanel');
    setSequence(dna, `NCBI ${query} (${seqType}) · ${dna.length} bp`, 'ok', accId);
  } catch(e){
    $("ncbiStatus").textContent = 'eroare: '+e.message;
    logEvt('NCBI panel: '+e.message, 'err');
  }
}
$("btnFetchNCBI").addEventListener("click", fetchFromNCBI);
$("ncbiQuery").addEventListener("keydown", e => { if (e.key === 'Enter') fetchFromNCBI(); });

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
$("btnCompare").addEventListener("click", () => {
  renderCompare();
  $("similarRegionsView").style.display = 'none';
});

// ====== REGIUNI SIMILARE ======
function findSimilarRegions(a, b, minLen){
  minLen = minLen || 10;
  const L = Math.min(a.length, b.length);
  const regions = [];
  let start = null, runLen = 0;
  for (let i = 0; i <= L; i++){
    if (i < L && a[i] === b[i]){
      if (start === null){ start = i; runLen = 1; }
      else runLen++;
    } else {
      if (start !== null && runLen >= minLen)
        regions.push({ start, len: runLen, seq: a.substr(start, runLen) });
      start = null; runLen = 0;
    }
  }
  return regions.sort((x, y) => y.len - x.len);
}
function renderSimilarRegions(){
  const A = state.slots.A.seq, B = state.slots.B.seq;
  const el = $("similarRegionsView");
  if (!A || !B){
    logEvt('necesar Slot A si B pentru regiuni similare', 'err'); return;
  }
  const regions = findSimilarRegions(A, B);
  if (!regions.length){
    el.style.display = 'block';
    el.innerHTML = '<div class="hint">Nu exista regiuni identice ≥10 bp intre A si B.</div>';
    return;
  }
  const top = regions.slice(0, 12);
  const totalBp = regions.reduce((s, r) => s + r.len, 0);
  let html = `<div class="hint" style="margin-bottom:8px">
    <b>${regions.length}</b> regiuni identice ≥10 bp · <b>${totalBp} bp</b> total conservat
    ${top.length < regions.length ? ` · afisez top ${top.length}` : ''}
  </div><div class="similar-list">`;
  top.forEach((r, i) => {
    const preview = r.seq.length > 32 ? r.seq.substr(0, 32) + '…' : r.seq;
    html += `<div class="sim-row">
      <span class="sim-rank">#${i+1}</span>
      <span class="sim-len">${r.len} bp</span>
      <span class="sim-pos">poz ${r.start}–${r.start+r.len-1}</span>
      <span class="sim-seq">${esc(preview)}</span>
    </div>`;
  });
  html += '</div>';
  el.style.display = 'block';
  el.innerHTML = html;
  logEvt(`regiuni similare: ${regions.length} blocuri identice ≥10bp (${totalBp} bp conservat)`, 'ok');
}
$("btnSimilarRegions").addEventListener("click", renderSimilarRegions);

// ====== AI ASSISTANT ======
const ACTION_PREFIX = 'GENETICA_ACTION:';

// ---------- model picker ----------
let aiSelectedModel = localStorage.getItem('aiModel') || '';
function updateModelTag(){
  const tag = $("aiModelTag");
  if (!tag) return;
  const m = aiSelectedModel || '';
  let label = 'ollama·local', cls = 'ai-tag-local';
  if (m.startsWith('claude:')){ label = 'claude·cloud'; cls = 'ai-tag-claude'; }
  else if (m.startsWith('codex:')){ label = 'codex·cloud'; cls = 'ai-tag-codex'; }
  else if (m.startsWith('grok:')){ label = 'grok·cloud'; cls = 'ai-tag-grok'; }
  else if (m.endsWith(':cloud')){ label = 'ollama·cloud'; cls = 'ai-tag-cloud'; }
  tag.textContent = label;
  tag.className = 'ai-model-tag ' + cls;
}

// ---------- hybrid (Claude -> Ollama fallback) ----------
let aiHybrid = localStorage.getItem('aiHybrid') === '1';
let aiHybridModel = localStorage.getItem('aiHybridModel') || '';
async function loadHybridModels(allModels){
  const sel = $("aiHybridSel");
  const chk = $("aiHybrid");
  if (!sel || !chk) return;
  // doar Ollama (local + cloud)
  const ollama = (allModels || []).filter(m => m.provider === 'ollama');
  // ordoneaza abliterated primele (refuza mai putin)
  ollama.sort((a, b) => {
    const aA = a.name.toLowerCase().includes('abliterated') ? 0 : 1;
    const bA = b.name.toLowerCase().includes('abliterated') ? 0 : 1;
    if (aA !== bA) return aA - bA;
    return a.name.localeCompare(b.name);
  });
  sel.innerHTML = '';
  for (const m of ollama){
    const o = document.createElement('option');
    o.value = m.name;
    o.textContent = m.label || m.name;
    sel.appendChild(o);
  }
  // default: primul abliterated, sau primul disponibil
  if (!aiHybridModel || ![...sel.options].some(o => o.value === aiHybridModel)){
    aiHybridModel = (sel.options[0] && sel.options[0].value) || '';
  }
  sel.value = aiHybridModel;
  chk.checked = aiHybrid;
  sel.disabled = !aiHybrid;

  chk.addEventListener('change', () => {
    aiHybrid = chk.checked;
    sel.disabled = !aiHybrid;
    localStorage.setItem('aiHybrid', aiHybrid ? '1' : '0');
    logEvt('hybrid AI: ' + (aiHybrid ? 'on ('+aiHybridModel+')' : 'off'), 'info');
  });
  sel.addEventListener('change', () => {
    aiHybridModel = sel.value;
    localStorage.setItem('aiHybridModel', aiHybridModel);
    logEvt('hybrid fallback: ' + aiHybridModel, 'info');
  });
}

// Pattern-uri pentru refuz fals-pozitiv (EN + RO).
const REFUSAL_PATTERNS = [
  /\bi (can'?t|cannot|won'?t|will not) (help|assist|provide|do that|comply|engage)/i,
  /\bi'?m (unable|not able|not comfortable|sorry, but)/i,
  /against (my|the|our) (policy|policies|guidelines|values|principles)/i,
  /\bviolat(es?|ing) (the |my |our )?(policy|policies|guidelines|terms)/i,
  /\b(potentially )?(harmful|dangerous|unethical)\b[^.]*\b(cannot|won'?t|unable|refuse|decline)/i,
  /\bi (must|need to) (decline|refuse)/i,
  // Romanian
  /\bnu (pot|reusesc|imi pot permite) sa (te |va )?(ajut|ofer|furnizez|raspund)/i,
  /\bnu (va |iti )?pot (oferi|furniza|raspunde|ajuta|da)/i,
  /(impotriva|contra) (politicilor|regulilor|principiilor|valorilor)/i,
  /\bnu este (etic|sigur|adecvat|recomandat) sa/i,
  /\bimi pare rau,? dar nu/i,
  /\b(refuz|trebuie sa refuz) (sa |aceasta)/i,
];

function detectRefusal(text){
  if (!text) return false;
  const t = text.trim();
  if (t.length < 20) return false;
  // Daca a emis o actiune, e clar ca nu a refuzat
  if (t.includes('GENETICA_ACTION:')) return false;
  // Tipic refuzul e in primele ~600 caractere
  const head = t.slice(0, 800);
  return REFUSAL_PATTERNS.some(p => p.test(head));
}

async function loadAiModelsAndHybrid(){
  // unified: incarca ambele
  try {
    const r = await fetch('/api/ai/models');
    const j = await r.json();
    await loadAiModelsFromJson(j);
    await loadHybridModels(j.models || []);
  } catch(e){
    console.warn('nu pot incarca modelele:', e);
  }
}
async function loadAiModelsFromJson(j){
  const sel = $("aiModelSel");
  if (!sel) return;
  sel.innerHTML = '';
  const claudeGroup = document.createElement('optgroup');
  claudeGroup.label = 'Claude (cloud, Anthropic)';
  const codexGroup = document.createElement('optgroup');
  codexGroup.label = 'Codex (cloud, OpenAI)';
  const grokGroup = document.createElement('optgroup');
  grokGroup.label = 'Grok (cloud, xAI)';
  const ollamaLocal = document.createElement('optgroup');
  ollamaLocal.label = 'Ollama local (offline)';
  const ollamaCloud = document.createElement('optgroup');
  ollamaCloud.label = 'Ollama cloud';
  for (const m of (j.models || [])){
    const o = document.createElement('option');
    o.value = m.name;
    o.textContent = m.label || m.name;
    o.dataset.provider = m.provider;
    if (m.provider === 'claude') claudeGroup.appendChild(o);
    else if (m.provider === 'codex') codexGroup.appendChild(o);
    else if (m.provider === 'grok') grokGroup.appendChild(o);
    else if (m.size === 'cloud') ollamaCloud.appendChild(o);
    else ollamaLocal.appendChild(o);
  }
  if (claudeGroup.children.length) sel.appendChild(claudeGroup);
  if (codexGroup.children.length) sel.appendChild(codexGroup);
  if (grokGroup.children.length) sel.appendChild(grokGroup);
  if (ollamaLocal.children.length) sel.appendChild(ollamaLocal);
  if (ollamaCloud.children.length) sel.appendChild(ollamaCloud);
  const wanted = aiSelectedModel || j.default || 'claude:opus';
  const opt = [...sel.options].find(o => o.value === wanted);
  sel.value = opt ? wanted : (j.default || sel.options[0].value);
  aiSelectedModel = sel.value;
  updateModelTag();
  sel.onchange = () => {
    aiSelectedModel = sel.value;
    localStorage.setItem('aiModel', aiSelectedModel);
    updateModelTag();
    logEvt('asistent AI: model = ' + aiSelectedModel, 'info');
  };
}
loadAiModelsAndHybrid();

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
  let s = esc(raw);
  s = s.replace(/```([\s\S]*?)```/g, (_, c) => '<pre>'+c+'</pre>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/(^|\n)- (.+)/g, '$1• $2');
  return s;
}

// Extrage actiunile GENETICA_ACTION din text, returneaza textul fara ele
function extractActions(rawText, executed){
  const lines = rawText.split('\n');
  const displayLines = [];
  const newActions = [];
  for (const line of lines){
    const trimmed = line.trim();
    if (trimmed.startsWith(ACTION_PREFIX)){
      if (!executed.has(trimmed)){
        executed.add(trimmed);
        try {
          const action = JSON.parse(trimmed.slice(ACTION_PREFIX.length).trim());
          newActions.push(action);
        } catch(_){ displayLines.push(line); }
      }
    } else {
      displayLines.push(line);
    }
  }
  return { display: displayLines.join('\n'), newActions };
}

// Ruleaza un singur stream AI intr-un bubble existent. Returneaza textul acumulat.
async function streamAiInto(bubble, question, model, executed){
  const chat = $("aiChat");
  const ctx = {
    question,
    seqA: state.slots.A.seq ? { name: state.slots.A.name || 'A', dna: state.slots.A.seq } : null,
    seqB: state.slots.B.seq ? { name: state.slots.B.name || 'B', dna: state.slots.B.seq } : null,
    model: model || undefined,
  };
  let accum = '';
  try {
    const res = await fetch('/api/ai/ask', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(ctx),
    });
    if (!res.ok){ bubble.classList.remove('typing'); bubble.textContent = 'eroare: '+res.status; return accum; }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true){
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
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
          const { display, newActions } = extractActions(accum, executed);
          bubble.innerHTML = aiRenderMarkdown(display);
          chat.scrollTop = chat.scrollHeight;
          for (const action of newActions){
            showActionChip(action, bubble.closest('.ai-msg'));
            executeLabAction(action.name, action).catch(console.error);
          }
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
  return accum;
}

function appendHandoffChip(reason, target){
  const chat = $("aiChat");
  const chip = document.createElement('div');
  chip.className = 'ai-action-chip ai-handoff-chip';
  chip.innerHTML = `⇆ <b>hybrid:</b> ${esc(reason)} → fallback <b>${esc(target)}</b>`;
  chat.appendChild(chip);
  chat.scrollTop = chat.scrollHeight;
}

async function askAI(question){
  if (!question) return;
  aiAppendMsg('user', question);
  const executed = new Set();

  const primaryModel = aiSelectedModel;
  const primaryBubble = aiAppendMsg('assistant', '', { typing: true });
  const primaryText = await streamAiInto(primaryBubble, question, primaryModel, executed);

  // Hybrid fallback: declanseaza pentru Claude / Codex / Grok (modele care pot refuza)
  const isPrimaryCensored = primaryModel && (primaryModel.startsWith('claude:') || primaryModel.startsWith('codex:') || primaryModel.startsWith('grok:'));
  if (aiHybrid && isPrimaryCensored && aiHybridModel && detectRefusal(primaryText)){
    const provider = primaryModel.startsWith('claude:') ? 'Claude' : (primaryModel.startsWith('grok:') ? 'Grok' : 'Codex');
    logEvt(`hybrid: ${provider} pare ca refuza — retry pe `+aiHybridModel, 'info');
    appendHandoffChip(`${provider} a refuzat`, aiHybridModel);
    const fbBubble = aiAppendMsg('assistant', '', { typing: true });
    fbBubble.dataset.hybridFallback = '1';
    await streamAiInto(fbBubble, question, aiHybridModel, executed);
  }
}

// ====== LAB ACTIONS ======
const ACTION_ICONS = {
  load_gene:'📥', highlight_region:'🔦', run_crispr:'✂',
  compare_slots:'⇄', transcribe:'📜', translate_protein:'🧬',
  verify_seq:'✔', build_feature:'⚙'
};

function showActionChip(action, msgWrap){
  const chat = $("aiChat");
  const chip = document.createElement('div');
  chip.className = 'ai-action-chip';
  const ico = ACTION_ICONS[action.name] || '⚡';
  const detail = action.gene || action.guide || action.description || '';
  const src = action.name === 'load_gene' && action.source ? ` [${action.source.toUpperCase()}]` : '';
  chip.innerHTML = `${ico} <b>${esc(action.name)}</b>${detail ? ': '+esc(detail.substring(0,50)) : ''}${src}`;
  // insert after the bot message
  const next = msgWrap ? msgWrap.nextSibling : null;
  chat.insertBefore(chip, next);
  chat.scrollTop = chat.scrollHeight;
}

async function executeLabAction(name, input){
  switch(name){
    case 'load_gene':         await executeLoadGene(input); break;
    case 'highlight_region':  executeHighlightRegion(input); break;
    case 'run_crispr':        executeRunCrispr(input); break;
    case 'compare_slots':     renderCompare(); logEvt('AI: compara A↔B', 'ok'); break;
    case 'transcribe':        doTranscribe(); break;
    case 'translate_protein': doTranslate(); break;
    case 'verify_seq':        doVerify(); break;
    case 'build_feature':     await executeBuildFeature(input); break;
  }
}

async function executeLoadGene(input){
  const gene = input.gene || '';
  const org  = input.organism || 'human';
  const slot = (input.slot === 'B') ? 'B' : 'A';
  const seqType = input.seq_type || 'cds';
  const source = (input.source || 'ncbi').toLowerCase();
  if (!gene){ logEvt('AI load_gene: gena lipsa', 'err'); return; }
  state.active = slot;
  logEvt(`AI: incarc ${gene} (${org}, ${source}) → Slot ${slot}...`, 'info');

  // UCSC: cauta dupa simbol in genomul corespunzator si incarca secventa genomica
  if (source === 'ucsc'){
    const genome = input.genome || ORG_TO_UCSC_GENOME[org];
    if (!genome){ logEvt(`AI UCSC: organism "${org}" nesuportat`, 'err'); return; }
    try {
      const maxLen = parseInt(input.max_len, 10) || 1500;
      const sRes = await fetch(`${UCSC_API}/search?search=${encodeURIComponent(gene)};genome=${genome}`).then(r => r.json());
      const categories = sRes.positionMatches || [];
      const priority = ['knownGene', 'mane', 'ncbiRefSeqCurated', 'ncbiRefSeq', 'refGene', 'hgnc'];
      let hit = null;
      for (const p of priority){
        const cat = categories.find(c => (c.name || c.trackName) === p);
        if (cat && cat.matches && cat.matches.length){
          const exact = cat.matches.find(m => (m.posName || '').split(/[\s(]/)[0].toUpperCase() === gene.toUpperCase());
          hit = exact || cat.matches[0];
          if (hit){ hit._track = p; break; }
        }
      }
      if (!hit){ for (const c of categories){ if (c.matches && c.matches.length){ hit = c.matches[0]; break; } } }
      if (!hit){ logEvt(`AI UCSC: ${gene} in ${genome} negasit`, 'err'); return; }
      const pm = (hit.position || '').match(/^([^:]+):(\d+)-(\d+)$/);
      if (!pm){ logEvt('AI UCSC: pozitie invalida', 'err'); return; }
      const chrom = pm[1], startG = +pm[2], endG = +pm[3];
      const fetchEnd = Math.min(endG, startG + maxLen);
      const qRes = await fetch(`${UCSC_API}/getData/sequence?genome=${genome};chrom=${chrom};start=${startG};end=${fetchEnd}`).then(r => r.json());
      const dna = (qRes.dna || '').toUpperCase();
      if (!dna){ logEvt('AI UCSC: secventa goala', 'err'); return; }
      setSequence(dna, `AI UCSC: ${gene} (${genome}) ${chrom}:${startG}-${fetchEnd}`, 'ok');
    } catch(e){ logEvt('AI UCSC: '+e.message, 'err'); }
    return;
  }

  // NCBI (default)
  try {
    let accId;
    if (/^[A-Z]{1,2}[\d_]/.test(gene.toUpperCase())){
      accId = gene;
    } else {
      const filter = seqType === 'cds' ? 'refseq_select[filter]' : 'refseq[filter] AND biomol_mrna[PROP]';
      const term = `${gene}[Gene Name] AND ${org}[orgn] AND ${filter}`;
      const sr = await fetch(`${NCBI_API}/esearch.fcgi?db=nuccore&term=${encodeURIComponent(term)}&retmode=json&retmax=1`);
      const sj = await sr.json();
      const ids = (sj.esearchresult && sj.esearchresult.idlist) || [];
      if (!ids.length){
        // Fallback automat: incearca UCSC pentru organismele suportate
        if (ORG_TO_UCSC_GENOME[org]){
          logEvt(`AI: ${gene} negasit in NCBI/${org} — incerc UCSC...`, 'info');
          await executeLoadGene({ ...input, source: 'ucsc' });
          return;
        }
        logEvt(`AI: ${gene} nu gasit in ${org}`, 'err'); return;
      }
      accId = ids[0];
    }
    const rettype = seqType === 'cds' ? 'fasta_cds_na' : 'fasta';
    const fr = await fetch(`${NCBI_API}/efetch.fcgi?db=nuccore&id=${encodeURIComponent(accId)}&rettype=${rettype}&retmode=text`);
    const fasta = await fr.text();
    const rec = parseFasta(fasta);
    const dna = rec.seq.toUpperCase().replace(/[^ATGC]/g, '');
    if (!dna){ logEvt('AI: secventa vida', 'err'); return; }
    setSequence(dna, `AI: ${gene} (${org}) · ${dna.length} bp`, 'ok', accId);
  } catch(e){ logEvt('AI load_gene: '+e.message, 'err'); }
}

function executeHighlightRegion(input){
  const s = parseInt(input.start, 10) || 0;
  const e = parseInt(input.end, 10) || s + 1;
  const cls = input.cls || 'target';
  state.highlights = [{start: s, len: e - s, cls}];
  renderDNA();
  $("dnaView").scrollIntoView({behavior:'smooth', block:'nearest'});
  logEvt(`AI: highlight poz ${s}–${e}`, 'info');
}

function executeRunCrispr(input){
  const guide = input.guide || '';
  const mode  = input.mode || 'knockout';
  const tmpl  = input.template || '';
  if (!guide){ logEvt('AI CRISPR: ghid lipsa', 'err'); return; }
  const r = BIO.crisprCut(state.seq, guide, mode, tmpl);
  if (!r.ok){ logEvt('AI CRISPR: '+r.reason, 'err'); return; }
  const hit = r.applied;
  state.highlights = [
    {start: hit.start, len: 20, cls: 'target'},
    {start: hit.pam,   len: 3,  cls: 'pam'},
    {start: hit.cut,   len: 1,  cls: 'cut'},
  ];
  renderAll();
  setTimeout(()=>{
    state.prevSeq = state.seq;
    state.seq = r.newSeq;
    state.highlights = [{start: Math.max(0, hit.cut-3), len: Math.max(1, Math.abs(r.newSeq.length - state.prevSeq.length)+4), cls:'mut'}];
    renderAll(); renderMutSummary();
    logEvt(`AI CRISPR ${mode} la poz ${hit.cut} (fir ${hit.strand})`, 'crispr');
  }, 1200);
  logEvt(`AI CRISPR: ghid gasit la poz ${hit.start}`, 'crispr');
}

async function executeBuildFeature(input){
  const description = input.description || '';
  if (!description){ logEvt('AI build_feature: descriere lipsa', 'err'); return; }
  const chat = $("aiChat");
  const termId = 'aiBuildBody_' + Date.now();
  const headId = 'aiBuildHead_' + Date.now();
  const term = document.createElement('div');
  term.className = 'ai-build-terminal running';
  term.innerHTML = `
    <div class="ai-term-header" id="${headId}">
      <span class="ai-term-pulse"></span>
      <span class="ai-term-title">⚙ Claude Code — lucreaza...</span>
      <span class="ai-term-elapsed">0s</span>
    </div>
    <div class="ai-term-body" id="${termId}"></div>`;
  chat.appendChild(term);
  chat.scrollTop = chat.scrollHeight;
  const body = document.getElementById(termId);
  const head = document.getElementById(headId);
  const addLine = (txt, cls) => {
    if (!txt) return;
    const d = document.createElement('div');
    d.className = 'ai-term-line' + (cls ? ' '+cls : '');
    d.textContent = txt;
    body.appendChild(d);
    if (body.children.length > 200) body.removeChild(body.firstChild);
    body.scrollTop = body.scrollHeight;
    chat.scrollTop = chat.scrollHeight;
  };
  addLine('$ claude --dangerously-skip-permissions -p "..."', 'cmd');
  try {
    const resp = await fetch('/api/lab/build', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({description})
    });
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true){
      const {done, value} = await reader.read();
      if (done) break;
      buf += decoder.decode(value, {stream: true});
      let idx;
      while ((idx = buf.indexOf('\n\n')) >= 0){
        const block = buf.slice(0, idx); buf = buf.slice(idx+2);
        const bLines = block.split('\n');
        let evt = 'message', data = '';
        for (const ln of bLines){
          if (ln.startsWith('event: ')) evt = ln.slice(7);
          else if (ln.startsWith('data: ')) data += ln.slice(6);
        }
        if (!data) continue;
        let pl; try { pl = JSON.parse(data); } catch { continue; }
        if (evt === 'build_progress'){
          const line = pl.line || '';
          const cls = line.startsWith('$') ? 'cmd' : line.startsWith('  ') ? 'out' : '';
          addLine(line, cls);
        } else if (evt === 'build_heartbeat'){
          const elEl = head.querySelector('.ai-term-elapsed');
          if (elEl) elEl.textContent = (pl.elapsed || 0) + 's';
        } else if (evt === 'build_done'){
          term.classList.remove('running');
          const elEl = head.querySelector('.ai-term-elapsed');
          if (elEl) elEl.remove();
          const pulse = head.querySelector('.ai-term-pulse');
          if (pulse) pulse.remove();
          const title = head.querySelector('.ai-term-title');
          if (title) title.textContent = pl.success ? '✓ Implementare completa' : '✗ Eroare implementare';
          addLine(pl.message || '', pl.success ? 'ok' : 'err');
          if (pl.success){
            setTimeout(()=>{ addLine('Reincarcand laboratorul...', 'ok'); setTimeout(()=>location.reload(), 1400); }, 700);
          }
        }
      }
    }
  } catch(e){ addLine('Eroare: '+e.message, 'err'); term.classList.remove('running'); }
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

// ====== Demo automat — tur complet aleator ======
function _pickRandom(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

function _findFirstCrisprGuide(seq){
  for (let i = 0; i + 23 <= seq.length; i++){
    const pam = seq.substr(i + 20, 3);
    if (pam[1] === 'G' && pam[2] === 'G') return seq.substr(i, 20);
  }
  return null;
}

async function runDemo(){
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const presetKeys = Object.keys(PRESET_GENES);
  // alege un preset cu seq >= 100 bp pentru A (ca toate uneltele sa functioneze)
  const longA = presetKeys.filter(k => PRESET_GENES[k].seq.length >= 100);
  const pickA = _pickRandom(longA.length ? longA : presetKeys);
  // pentru B alegem un preset diferit (pereche logica daca exista, altfel random)
  let pickB;
  if (pickA === 'hbb_normal') pickB = 'hbb_sickle';
  else if (pickA === 'hbb_sickle') pickB = 'hbb_normal';
  else pickB = _pickRandom(presetKeys.filter(k => k !== pickA));

  const nameA = PRESET_GENES[pickA].name;
  const nameB = PRESET_GENES[pickB].name;
  const seqLenA = PRESET_GENES[pickA].seq.length;

  logEvt(`═══ DEMO COMPLET pe ${nameA} (${seqLenA} bp) ═══`, 'info');
  $("btnDemoAuto").disabled = true;
  const totalSteps = 15;
  const step = (n, msg) => logEvt(`PAS ${n}/${totalSteps}: ${msg}`, 'info');

  try {
    // 1. Incarca preset A
    setActiveSlot('A'); await sleep(200);
    step(1, `incarc ${nameA} in Slot A`);
    setSequence(PRESET_GENES[pickA].seq, nameA, 'ok');
    await sleep(1200);

    // 2. AI intro despre gena
    step(2, 'AI: explica gena');
    askAI(`Prezinta-mi pe scurt gena/secventa "${nameA}" — ce face, unde se gaseste, ce e interesant. Maxim 3 propozitii, fara introduceri.`);
    await sleep(500);

    // 3. Transcrie + Traduce
    step(3, 'transcrie ADN → ARN');
    doTranscribe(); await sleep(1000);
    step(4, 'traduce → proteina');
    doTranslate(); await sleep(1400);

    // 4. SeqVerify
    step(5, 'verifica integritate (SeqVerify)');
    doVerify(); await sleep(1800);

    // 5. ANDES anomaly scan (daca seq >= 60 bp)
    if (state.seq.length >= 60){
      step(6, 'ANDES — scan anomalii nesupervizat (FDA)');
      const win = Math.max(25, Math.min(60, Math.floor(state.seq.length/25)));
      const r = BIO.andesAnalyze(state.seq, {
        window: win,
        step: Math.max(1, Math.floor(win/6)),
        threshold: 2.0,
      });
      if (r.ok){
        andesState.result = r;
        andesState.filter = 'all';
        renderAndes();
      } else {
        logEvt('ANDES: '+r.reason, 'info');
      }
      await sleep(2400);
    } else {
      step(6, 'ANDES skip — secventa <60 bp');
      await sleep(400);
    }

    // 6. Synsor (daca seq >= 100 bp)
    if (state.seq.length >= 100){
      step(7, 'Synsor — engineered vs natural');
      runSynsor();
      await sleep(2400);
    } else {
      step(7, 'Synsor skip — secventa <100 bp');
      await sleep(400);
    }

    // 7. Stegano: ENCODE un mesaj fun + SCAN
    step(8, 'Cod secret — encodez "LAB 2026" in Base-4');
    const stegoMsg = 'LAB 2026';
    stegoState.lastEncoded = BIO.encodeBase4(stegoMsg);
    stegoState.scheme = 'base-4';
    stegoState.lastScan = BIO.steganoScan(state.seq, { minLen: 6, minScore: 1.5 });
    renderStegoResults();
    logEvt(`stego: "${stegoMsg}" → ${stegoState.lastEncoded} (${stegoState.lastEncoded.length} bp)`, 'crispr');
    await sleep(2200);

    // 8. AI: rezuma analizele
    step(9, 'AI: rezuma analizele nesupervizate');
    askAI(`Pe baza analizei ${nameA}: scor SeqVerify, anomalii ANDES, P(engineered) Synsor — ce ar trebui sa retina un student? In 2-3 propozitii.`);
    await sleep(500);

    // 9. Incarca B + traduce + compara
    step(10, `incarc ${nameB} in Slot B + comparatie A↔B`);
    setActiveSlot('B'); await sleep(200);
    setSequence(PRESET_GENES[pickB].seq, nameB, 'ok'); await sleep(900);
    doTranslate(); await sleep(800);
    setActiveSlot('A'); await sleep(200);
    renderCompare();
    await sleep(2400);

    // 10. CRISPR — gaseste ghid valid si aplica
    step(11, 'CRISPR — gasesc ghid 20bp + PAM NGG');
    const guide = _findFirstCrisprGuide(state.seq);
    if (guide){
      const r = BIO.crisprCut(state.seq, guide, 'knockout', '');
      if (r.ok){
        const hit = r.applied;
        state.highlights = [
          { start: hit.start, len: 20, cls: 'target' },
          { start: hit.pam,   len: 3,  cls: 'pam' },
          { start: hit.cut,   len: 1,  cls: 'cut' },
        ];
        renderAll();
        logEvt(`CRISPR: ghid ${guide} la poz ${hit.start} fir ${hit.strand}`, 'crispr');
        await sleep(1800);

        // 11. Off-target cu acelasi ghid
        step(12, 'Off-target (GUIDE-seq pipeline)');
        const ot = BIO.findOffTargets(state.seq, guide, {
          maxMismatches: 4, allowBulges: true, includeNAG: true,
        });
        if (ot.ok){
          offState.result = ot;
          offState.filter = 'all';
          renderOffTarget();
          logEvt(`Off-target: ${ot.stats.total} site-uri (${ot.stats.onTarget} on, ${ot.stats.high} HIGH)`, 'crispr');
        }
        await sleep(2400);
      } else {
        logEvt('CRISPR: '+r.reason, 'info');
        await sleep(400);
      }
    } else {
      logEvt('Niciun PAM NGG gasit pentru CRISPR demo', 'info');
      await sleep(400);
    }

    // 12. PCR — primer fwd = primii 18bp, rev = RC al ultimilor 18bp
    if (state.seq.length >= 40){
      step(13, 'PCR — amplificare cap-coada');
      const fwd = state.seq.substr(0, 18);
      const revRC = BIO.reverseComplement(state.seq.substr(-18));
      const res = BIO.pcr(state.seq, fwd, revRC);
      if (res.ok){
        state.highlights = [{ start: res.startF, len: res.endR - res.startF, cls: 'hl' }];
        state.fragments = [res.amplicon];
        renderAll(); renderGel([res.amplicon]);
        logEvt(`PCR amplicon: ${res.amplicon.length} bp`, 'ok');
      }
      await sleep(1600);
    } else {
      step(13, 'PCR skip — secventa <40 bp');
      await sleep(300);
    }

    // 13. Restriction — incearca enzime pana gaseste una care taie
    step(14, 'Digestie cu enzime de restrictie');
    const enzNames = Object.keys(RESTRICTION_ENZYMES);
    for (const enzName of enzNames){
      const r = BIO.cutWithEnzyme(state.seq, enzName);
      if (r.sites.length){
        state.highlights = r.sites.map(s => ({ start: s.start, len: r.enzyme.site.length, cls: 'target' }))
          .concat(r.sites.map(s => ({ start: s.cut, len: 1, cls: 'cut' })));
        state.fragments = r.fragments;
        renderAll(); renderGel(r.fragments);
        logEvt(`${enzName} (${r.enzyme.site}): ${r.sites.length} site-uri, ${r.fragments.length} fragmente`, 'ok');
        break;
      }
    }
    await sleep(2200);

    // 14. ANDES-VCF bonus (fetch CEU22.vcf, ruleaza pipeline real)
    step(15, 'ANDES-VCF — pipeline real pe CEU22.vcf (1000 Genomes)');
    try {
      logEvt('descarcat CEU22.vcf...', 'info');
      const vcfRes = await fetch('https://raw.githubusercontent.com/riakanjilal/ANDES/main/CEU22.vcf');
      if (vcfRes.ok){
        const vcfText = await vcfRes.text();
        const r = await fetch('/api/andes/vcf', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ vcf: vcfText, p_threshold: 1e-3 })
        });
        const j = await r.json();
        if (j.ok){
          andesVcfState.result = j;
          andesVcfState.filter = 'M';
          renderAndesVcf();
          logEvt(`ANDES-VCF: ${j.n_snps} SNPs, ${j.n_samples} samples, ${j.anomalies_M.length} anom MD-M`, 'crispr');
        }
      }
    } catch(e){
      logEvt('ANDES-VCF demo skip: '+e.message, 'info');
    }
    await sleep(2200);

    // Final AI summary
    askAI(`Tocmai am facut un tur complet al laboratorului pe ${nameA}. Am rulat: transcriere, traducere, SeqVerify, ANDES, Synsor, scan stegano, comparatie cu ${nameB}, CRISPR + off-target, PCR, digestie restrictie, plus ANDES-VCF pe 99 indivizi din 1000 Genomes. Rezuma in 4 propozitii cea mai surprinzatoare/educativa observatie din acest tur. Fara introduceri.`);

    logEvt('═══ DEMO TERMINAT — vezi panoul AI din dreapta pentru sinteza ═══', 'ok');
  } catch(e){
    logEvt('Demo eroare: '+e.message, 'err');
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

// ====== CARACTERISTICI GENOMICE (NCBI Feature Table) ======
const FEAT_COLORS = {
  gene:           'var(--lime)',
  CDS:            'var(--cy)',
  mat_peptide:    'var(--ye)',
  sig_peptide:    '#ffaa33',
  transit_peptide:'#ffcc88',
  regulatory:     'var(--mg)',
  misc_feature:   'var(--or)',
  repeat_region:  '#9966ff',
  ncRNA:          '#ff88bb',
  exon:           '#44ccff',
  intron:         '#446688',
  "5'UTR":        '#88aaff',
  "3'UTR":        '#aabbff',
};

function parseFT(text){
  const features = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)){
    if (!line.trim() || line.startsWith('>')) continue;
    if (/^[\d<>]/.test(line)){
      const parts = line.trim().split('\t');
      if (parts.length >= 3){
        if (cur) features.push(cur);
        const s = parseInt(parts[0].replace(/\D/g,''), 10);
        const e = parseInt(parts[1].replace(/\D/g,''), 10);
        cur = (!isNaN(s) && !isNaN(e))
          ? { type: parts[2].trim(), start: Math.min(s,e)-1, end: Math.max(s,e), quals:{} }
          : null;
      }
    } else if (line.startsWith('\t\t\t') && cur){
      const q = line.trim().split('\t');
      if (q.length >= 2 && !cur.quals[q[0]]) cur.quals[q[0]] = q[1];
    }
  }
  if (cur) features.push(cur);
  return features.filter(f => f && f.type !== 'source');
}

function renderFeatureMap(features, seqLen){
  const tracks = {};
  const ORDER = ['gene','CDS','mat_peptide','sig_peptide','transit_peptide','regulatory','misc_feature','repeat_region','ncRNA','exon',"5'UTR","3'UTR"];
  for (const f of features){
    if (!tracks[f.type]) tracks[f.type] = [];
    tracks[f.type].push(f);
  }
  const keys = [...ORDER.filter(t=>tracks[t]), ...Object.keys(tracks).filter(t=>!ORDER.includes(t))];

  // ruler
  let html = '<div class="feat-ruler">';
  for (let i = 0; i <= 5; i++){
    const pct = i * 20;
    html += `<span class="feat-ruler-mark" style="left:${pct}%">${Math.round(seqLen*pct/100).toLocaleString()}</span>`;
  }
  html += '</div>';

  for (const type of keys){
    const color = FEAT_COLORS[type] || 'var(--dim)';
    html += `<div class="feat-track-row"><span class="feat-type-lbl" style="color:${color}">${esc(type)}</span><div class="feat-lane">`;
    for (const f of tracks[type]){
      const left = (f.start / seqLen * 100).toFixed(3);
      const w = Math.max(0.5, (f.end - f.start) / seqLen * 100).toFixed(3);
      const name = f.quals.product || f.quals.gene || f.quals.note || '';
      html += `<div class="feat-block" style="left:${left}%;width:${w}%;background:${color}"
        title="${esc(type)}: ${esc(name)} (${f.start+1}–${f.end})"
        data-start="${f.start}" data-end="${f.end}">
        <span class="feat-block-lbl">${esc(name.substring(0,20))}</span></div>`;
    }
    html += '</div></div>';
  }
  $("featMap").innerHTML = html;

  // list
  const sorted = [...features].sort((a,b)=>a.start-b.start);
  let lHtml = '';
  for (const f of sorted){
    const name = f.quals.product || f.quals.gene || f.quals.note || '—';
    const color = FEAT_COLORS[f.type] || 'var(--dim)';
    lHtml += `<div class="feat-row" data-start="${f.start}" data-end="${f.end}">
      <span class="feat-row-type" style="color:${color}">${esc(f.type)}</span>
      <span class="feat-row-pos">${(f.start+1).toLocaleString()}–${f.end.toLocaleString()}</span>
      <span class="feat-row-len">${(f.end-f.start).toLocaleString()} bp</span>
      <span class="feat-row-name">${esc(name)}</span>
    </div>`;
  }
  $("featList").innerHTML = lHtml || '<div class="hint">Nicio caracteristica.</div>';

  const hl = el => {
    const s=parseInt(el.dataset.start,10), e=parseInt(el.dataset.end,10);
    state.highlights=[{start:s, len:e-s, cls:'hl'}];
    renderDNA();
    $("dnaView").scrollIntoView({behavior:'smooth', block:'nearest'});
  };
  $("featList").querySelectorAll('.feat-row').forEach(r=>r.addEventListener('click',()=>hl(r)));
  $("featMap").querySelectorAll('.feat-block').forEach(b=>b.addEventListener('click',()=>hl(b)));
}

async function fetchAndShowFeatures(){
  const slot = state.slots[state.active];
  $("featCard").style.display = 'block';
  $("featSlotTag").textContent = 'SLOT ' + state.active;
  $("featMap").innerHTML = '';
  $("featList").innerHTML = '';
  if (!slot.acc){
    $("featStatus").innerHTML = '<span style="color:var(--rd)">Secventa nu a fost incarcata din NCBI. Cauta o gena din bara de sus sau din tab-ul NCBI.</span>';
    return;
  }
  $("featStatus").textContent = 'Se incarca adnotarile de la NCBI...';
  try {
    const resp = await fetch(`${NCBI_API}/efetch.fcgi?db=nuccore&id=${encodeURIComponent(slot.acc)}&rettype=ft&retmode=text`);
    const text = await resp.text();
    if (!text.trim() || text.trim().toLowerCase().startsWith('error')){
      $("featStatus").textContent = 'Nu exista feature table pentru ' + slot.acc;
      logEvt('Caracteristici: negasit pentru '+slot.acc, 'err');
      return;
    }
    const features = parseFT(text);
    if (!features.length){
      $("featStatus").textContent = 'Nicio caracteristica in feature table.';
      return;
    }
    $("featStatus").innerHTML = `<b>${features.length}</b> caracteristici pentru <b>${esc(slot.acc)}</b> · click pe o intrare pentru highlight`;
    renderFeatureMap(features, slot.seq.length || 1);
    logEvt(`caracteristici: ${features.length} features (${slot.acc})`, 'ok');
  } catch(e){
    $("featStatus").textContent = 'eroare: '+e.message;
    logEvt('Caracteristici: '+e.message, 'err');
  }
}
$("btnFeatures").addEventListener("click", fetchAndShowFeatures);

// ====== JUMP TO POSITION ======
let _jumpTimer = null;

function showJumpMsg(msg, isErr){
  const el = $('jumpMsg');
  if (!el) return;
  el.textContent = msg;
  el.style.color = isErr ? 'var(--rd)' : 'var(--lime)';
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.textContent = ''; }, 3500);
}

function jumpToPosition(rawPos){
  const seq = state.seq;
  if (!seq){
    showJumpMsg('Nu ai secventa incarcata.', true);
    return;
  }
  const pos = parseInt(rawPos, 10);
  if (isNaN(pos) || pos < 0 || pos >= seq.length){
    showJumpMsg('Pozitie invalida (0–' + (seq.length - 1) + ')', true);
    return;
  }
  const hlLen = Math.min(3, seq.length - pos);
  // pastreaza highlights existente (non-jump) si adauga jump highlight
  const existing = state.highlights.filter(h => !h._jump);
  state.highlights = [...existing, { start: pos, len: hlLen, cls: 'hl', _jump: true }];
  renderDNA();
  const target = $('dnaView').querySelector('.base.hl');
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  showJumpMsg('poz ' + pos, false);
  clearTimeout(_jumpTimer);
  _jumpTimer = setTimeout(() => {
    state.highlights = state.highlights.filter(h => !h._jump);
    renderDNA();
  }, 3000);
}

$('btnJump').addEventListener('click', () => jumpToPosition($('jumpPos').value));
$('jumpPos').addEventListener('keydown', e => { if (e.key === 'Enter') jumpToPosition($('jumpPos').value); });

// ---------- init ----------
initPresets();
updateSlotChips();
renderAll();
logEvt('laborator pornit. cauta o gena sus, apasa "Demo automat", sau intreaba asistentul AI.', 'info');

})();
