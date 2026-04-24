// === DATE STATICE: cod genetic, enzime, secvente preset ===
(function(){

// Codon table (DNA sense strand, T not U). Stop = *
const CODON_TABLE = {
  TTT:'F',TTC:'F',TTA:'L',TTG:'L',CTT:'L',CTC:'L',CTA:'L',CTG:'L',
  ATT:'I',ATC:'I',ATA:'I',ATG:'M',GTT:'V',GTC:'V',GTA:'V',GTG:'V',
  TCT:'S',TCC:'S',TCA:'S',TCG:'S',CCT:'P',CCC:'P',CCA:'P',CCG:'P',
  ACT:'T',ACC:'T',ACA:'T',ACG:'T',GCT:'A',GCC:'A',GCA:'A',GCG:'A',
  TAT:'Y',TAC:'Y',TAA:'*',TAG:'*',CAT:'H',CAC:'H',CAA:'Q',CAG:'Q',
  AAT:'N',AAC:'N',AAA:'K',AAG:'K',GAT:'D',GAC:'D',GAA:'E',GAG:'E',
  TGT:'C',TGC:'C',TGA:'*',TGG:'W',CGT:'R',CGC:'R',CGA:'R',CGG:'R',
  AGT:'S',AGC:'S',AGA:'R',AGG:'R',GGT:'G',GGC:'G',GGA:'G',GGG:'G'
};

// Aminoacizi: nume complet + grupa (pt culoare)
// grupe: nonpolar, polar, acid, basic, aromatic, special
const AA_INFO = {
  A:{name:'Ala (Alanina)',      group:'nonpolar'},
  R:{name:'Arg (Arginina)',     group:'basic'},
  N:{name:'Asn (Asparagina)',   group:'polar'},
  D:{name:'Asp (Acid aspartic)',group:'acid'},
  C:{name:'Cys (Cisteina)',     group:'polar'},
  E:{name:'Glu (Acid glutamic)',group:'acid'},
  Q:{name:'Gln (Glutamina)',    group:'polar'},
  G:{name:'Gly (Glicina)',      group:'special'},
  H:{name:'His (Histidina)',    group:'basic'},
  I:{name:'Ile (Izoleucina)',   group:'nonpolar'},
  L:{name:'Leu (Leucina)',      group:'nonpolar'},
  K:{name:'Lys (Lizina)',       group:'basic'},
  M:{name:'Met (Metionina / START)', group:'nonpolar'},
  F:{name:'Phe (Fenilalanina)', group:'aromatic'},
  P:{name:'Pro (Prolina)',      group:'special'},
  S:{name:'Ser (Serina)',       group:'polar'},
  T:{name:'Thr (Treonina)',     group:'polar'},
  W:{name:'Trp (Triptofan)',    group:'aromatic'},
  Y:{name:'Tyr (Tirozina)',     group:'aromatic'},
  V:{name:'Val (Valina)',       group:'nonpolar'},
  '*':{name:'STOP', group:'stop'}
};

// Enzime de restrictie: recognition (5'→3') si pozitia de taiere pe firul de sus (1-indexed dupa ultima baza inainte de taiere)
const RESTRICTION_ENZYMES = {
  EcoRI:   { site: 'GAATTC', cut: 1, type: 'sticky-5',  overhang: 'AATT' },
  BamHI:   { site: 'GGATCC', cut: 1, type: 'sticky-5',  overhang: 'GATC' },
  HindIII: { site: 'AAGCTT', cut: 1, type: 'sticky-5',  overhang: 'AGCT' },
  NotI:    { site: 'GCGGCCGC', cut: 2, type: 'sticky-5', overhang: 'GGCC' },
  XhoI:    { site: 'CTCGAG', cut: 1, type: 'sticky-5',  overhang: 'TCGA' },
  SalI:    { site: 'GTCGAC', cut: 1, type: 'sticky-5',  overhang: 'TCGA' },
  PstI:    { site: 'CTGCAG', cut: 5, type: 'sticky-3',  overhang: 'TGCA' },
  SmaI:    { site: 'CCCGGG', cut: 3, type: 'blunt',     overhang: ''     },
  EcoRV:   { site: 'GATATC', cut: 3, type: 'blunt',     overhang: ''     },
  HaeIII:  { site: 'GGCC',   cut: 2, type: 'blunt',     overhang: ''     },
};

// Secvente preset: exemple scurte, intuitive. Toate au ATG start + stop.
const PRESET_GENES = {
  insulin_short: {
    name: 'Insulina (fragment)',
    desc: 'Fragment din preproinsulina umana (semnal peptid + chain B partial). Diabetul de tip 1 apare cand pancreasul nu mai produce insulina.',
    seq:
      'ATGGCCCTGTGGATGCGCCTCCTGCCCCTGCTGGCGCTGCTGGCCCTCTGGGGACCT' +
      'GACCCAGCCGCAGCCTTTGTGAACCAACACCTGTGCGGCTCACACCTGGTGGAAGCT' +
      'CTCTACCTAGTGTGCGGGGAACGAGGCTTCTTCTACACACCCAAGACCTGA'
  },
  hbb_normal: {
    name: 'Beta-globina (HBB) — normala',
    desc: 'Primele 20 codoni. Proteina transporta O2 in sange. Mutatia GAG→GTG in codonul 6 produce anemia falciforma.',
    seq:
      'ATGGTGCACCTGACTCCTGAGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGTGA'
  },
  hbb_sickle: {
    name: 'Beta-globina — mutatia falciforma',
    desc: 'Codonul 6: GAG (Glu) → GTG (Val). O singura baza A→T, rezultatul: hemoglobina S, globule rosii in forma de secera.',
    seq:
      'ATGGTGCACCTGACTCCTGTGGAGAAGTCTGCCGTTACTGCCCTGTGGGGCAAGGTGTGA'
  },
  gfp_mini: {
    name: 'GFP (mini-fragment)',
    desc: 'Green Fluorescent Protein — fragment din regiunea cromofora. Fluoreste verde cand e iradiata cu UV. Ganeaza premiul Nobel 2008.',
    seq:
      'ATGGTGAGCAAGGGCGAGGAGCTGTTCACCGGGGTGGTGCCCATCCTGGTCGAGCTGGAC' +
      'GGCGACGTAAACGGCCACAAGTTCAGCGTGTCCGGCGAGGGCGAGGGCGATGCCACCTAC' +
      'GGCAAGCTGACCCTGAAGTTCATCTGCACCACCGGCAAGCTGCCCGTGCCCTGGCCCACC' +
      'CTCGTGACCACCCTGACCTACGGCGTGCAGTGCTTCAGCCGCTACCCCGACCACATGAAG' +
      'CAGCACGACTTCTTCAAGTCCGCCATGCCCGAAGGCTACGTCCAGGAGCGCACCATCTTC' +
      'TTCAAGGACGACGGCAACTACAAGACCCGCGCCGAGGTGAAGTTCGAGGGCGACACCCTG' +
      'GTGTGA'
  },
  test_lab: {
    name: 'Secventa test (lab)',
    desc: 'Secventa scurta de test cu site-uri EcoRI si BamHI pentru experimente de clonare.',
    seq:
      'ATGGAATTCGCGCATGCATGCATGCGGATCCTAA'
  },
  crispr_target: {
    name: 'Tinta CRISPR (demo)',
    desc: 'Contine un PAM NGG si un target de 20bp pentru ghidul "TAGCCTGAGATTGCCTCAAC". Incearca: CRISPR cu acest ghid.',
    seq:
      'ATGAAATAGCCTGAGATTGCCTCAACAGGAACGACGCTGCTGGAGCAGCTGAACTGA'
  }
};

// Export global
window.GeneticaData = { CODON_TABLE, AA_INFO, RESTRICTION_ENZYMES, PRESET_GENES };

})();
