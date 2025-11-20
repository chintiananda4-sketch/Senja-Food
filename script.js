/* script.js — Senja Food accounting mini */

// ---------- Chart & UI helpers ----------
const fmt = n => new Intl.NumberFormat('id-ID', { style:'currency', currency:'IDR', minimumFractionDigits:0 }).format(n||0);
const byId = id => document.getElementById(id);
const qa = s => Array.from(document.querySelectorAll(s));
const STORAGE_KEY = 'senja_transactions_v1';

// ---------- Chart.js setup (will initialize later) ----------
let chartRE = null;

// ---------- Chart of Accounts ----------
const ACCOUNTS = [
  // ASSET
  { id:'A101', code:'101', name:'Kas', type:'asset' },
  { id:'A102', code:'102', name:'Piutang Usaha', type:'asset' },
  { id:'A103', code:'103', name:'Persediaan Bahan', type:'asset' },
  { id:'A104', code:'104', name:'Perlengkapan', type:'asset' },
  { id:'A105', code:'105', name:'Peralatan', type:'asset' },

  // LIABILITY
  { id:'L201', code:'201', name:'Utang Usaha', type:'liability' },
  { id:'L202', code:'202', name:'Utang Bank', type:'liability' },

  // EQUITY
  { id:'E301', code:'301', name:'Modal Pemilik', type:'equity' },
  { id:'E302', code:'302', name:'Prive', type:'equity' },

  // REVENUE
  { id:'R401', code:'401', name:'Pendapatan Penjualan Makanan', type:'revenue' },
  { id:'R402', code:'402', name:'Pendapatan Penjualan Minuman', type:'revenue' },

  // EXPENSE
  { id:'X501', code:'501', name:'Beban Bahan Baku', type:'expense' },
  { id:'X502', code:'502', name:'Beban Gaji', type:'expense' },
  { id:'X503', code:'503', name:'Beban Listrik', type:'expense' },
  { id:'X504', code:'504', name:'Beban Gas', type:'expense' },
  { id:'X505', code:'505', name:'Beban Sewa', type:'expense' },
  { id:'X506', code:'506', name:'Beban Internet', type:'expense' },
  { id:'X507', code:'507', name:'Beban Lain-lain', type:'expense' },
];

// ---------- Transactions model ----------
let transactions = []; // each entry: { id, date, desc, lines: [ { accountId, debit, credit, memo } ] }

// load / save
function load(){ try{ const raw = localStorage.getItem(STORAGE_KEY); transactions = raw?JSON.parse(raw):[] }catch(e){ transactions=[] } }
function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions)); }

// ---------- UI init ----------
document.addEventListener('DOMContentLoaded', () => {
  // tabs
  qa('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    qa('.tab-btn').forEach(b=>b.classList.remove('active'));
    qa('.tab').forEach(t=>t.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    byId(tab).classList.add('active');
    if(tab === 'bukubesar') populateLedgerSelect();
    updateAll();
  }));

  // lines area init
  initLines();
  byId('tx-type').addEventListener('change', onTypeChange);
  byId('add-line').addEventListener('click', ()=> addLine());
  byId('save-tx').addEventListener('click', onSaveTx);
  byId('clear-all').addEventListener('click', onClearAll);

  // ledger selection
  byId('ledger-account').addEventListener('change', renderLedger);

  // chart init
  initChart();

  // load saved tx
  load();
  renderAll();
});

// ---------- helper: find account ----------
function accById(id){ return ACCOUNTS.find(a => a.id === id); }
function accByName(name){ return ACCOUNTS.find(a => a.name.toLowerCase() === name.toLowerCase()); }

// ---------- Lines UI (for jurnal input) ----------
const linesContainer = byId('lines-container');

function initLines(){
  linesContainer.innerHTML = '';
  addLine(); addLine();
  computeTotals();
}

function makeAccountOptions(selected=''){
  return ACCOUNTS.map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${a.code} - ${a.name}</option>`).join('');
}

function addLine(accountId='', debit='', credit='', memo=''){
  const idx = Date.now() + Math.floor(Math.random()*1000);
  const div = document.createElement('div');
  div.className = 'line';
  div.dataset.idx = idx;
  div.innerHTML = `
    <div class="col">
      <select class="acct">${makeAccountOptions(accountId)}</select>
    </div>
    <div class="col small">
      <input type="number" class="debit" placeholder="Debit" value="${debit||''}">
    </div>
    <div class="col small">
      <input type="number" class="credit" placeholder="Kredit" value="${credit||''}">
    </div>
    <div class="col">
      <input class="memo" placeholder="Memo (opsional)" value="${memo||''}">
    </div>
    <div class="col xsmall">
      <button class="remove-line">Hapus</button>
    </div>
  `;
  linesContainer.appendChild(div);

  // events
  div.querySelector('.remove-line').addEventListener('click', ()=> { div.remove(); computeTotals(); });
  div.querySelector('.debit').addEventListener('input', computeTotals);
  div.querySelector('.credit').addEventListener('input', computeTotals);
}

function clearLines(){ linesContainer.innerHTML = ''; }
function computeTotals(){
  const lineEls = Array.from(linesContainer.querySelectorAll('.line'));
  let totalD=0, totalC=0;
  lineEls.forEach(l=>{
    const d = parseFloat(l.querySelector('.debit').value) || 0;
    const c = parseFloat(l.querySelector('.credit').value) || 0;
    totalD += d; totalC += c;
  });
  byId('total-debit').textContent = fmt(totalD);
  byId('total-credit').textContent = fmt(totalC);
  return { totalD, totalC };
}

// ---------- Transaction templates for automatic types ----------
function onTypeChange(){
  const t = byId('tx-type').value;
  clearLines();
  switch(t){
    case 'penjualan_tunai':
      // Kas debit, Pendapatan makanan credit
      addLine('A101', '', '', ''); // Kas
      addLine('R401', '', '', ''); // Pendapatan Penjualan Makanan
      break;
    case 'penjualan_kredit':
      addLine('A102','', '', ''); // Piutang
      addLine('R401','', '', '');
      break;
    case 'pembelian_tunai':
      addLine('A103','', '', ''); // Persediaan
      addLine('A101','', '', ''); // Kas (credit)
      break;
    case 'pembelian_kredit':
      addLine('A103','', '', '');
      addLine('L201','', '', '');
      break;
    case 'setor_modal':
      addLine('A101','', '', ''); // Kas
      addLine('E301','', '', ''); // Modal
      break;
    case 'bayar_hutang':
      addLine('L201','', '', ''); // Utang Usaha
      addLine('A101','', '', '');
      break;
    case 'beban_gaji':
      addLine('X502','', '', '');
      addLine('A101','', '', '');
      break;
    case 'beban_listrik':
      addLine('X503','', '', '');
      addLine('A101','', '', '');
      break;
    case 'beban_internet':
      addLine('X506','', '', '');
      addLine('A101','', '', '');
      break;
    case 'prive':
      addLine('E302','', '', '');
      addLine('A101','', '', '');
      break;
    case 'custom':
      addLine(); addLine();
      break;
    default:
      addLine(); addLine();
  }
  computeTotals();
}

// ---------- Save transaction ----------
function onSaveTx(){
  // gather lines
  const linesEls = Array.from(linesContainer.querySelectorAll('.line'));
  if (linesEls.length === 0) return showMsg('Tambahkan minimal 1 baris jurnal','error');
  const date = byId('tx-date').value || new Date().toISOString().slice(0,10);
  const desc = byId('tx-desc').value.trim();
  const entryLines = [];
  let totalD=0, totalC=0;
  for (const l of linesEls){
    const accId = l.querySelector('.acct').value;
    const debit = parseFloat(l.querySelector('.debit').value) || 0;
    const credit = parseFloat(l.querySelector('.credit').value) || 0;
    const memo = l.querySelector('.memo').value || '';
    if (debit < 0 || credit < 0) return showMsg('Nilai tidak boleh negatif','error');
    if (debit > 0 && credit > 0) return showMsg('Setiap baris hanya boleh isi debit atau kredit','error');
    entryLines.push({ accountId: accId, debit, credit, memo });
    totalD += debit; totalC += credit;
  }
  if (Math.round(totalD*100) !== Math.round(totalC*100)) return showMsg('Transaksi tidak seimbang — total debit harus sama dengan total kredit','error');

  const entry = { id: Date.now().toString(), date, desc, lines: entryLines };
  transactions.unshift(entry);
  save();
  renderAll();
  showMsg('Transaksi tersimpan','ok');

  // reset
  byId('tx-type').value = '';
  byId('tx-date').value = '';
  byId('tx-desc').value = '';
  clearLines(); addLine(); addLine(); computeTotals();
}

// ---------- Render Jurnal ----------
function renderJurnal(){
  const tbody = byId('jurnal-list');
  tbody.innerHTML = '';
  for (const tx of transactions){
    // find first debit and first credit for compact display
    const debitLine = tx.lines.find(l => l.debit>0) || tx.lines[0];
    const creditLine = tx.lines.find(l => l.credit>0) || tx.lines[1] || tx.lines[0];
    const debitAcc = accById(debitLine.accountId);
    const creditAcc = accById(creditLine.accountId);

    const tr1 = document.createElement('tr');
    tr1.innerHTML = `
      <td>${tx.date}</td>
      <td>${tx.desc || '-'}</td>
      <td>${debitAcc?debitAcc.name:debitLine.accountId}</td>
      <td style="text-align:right">${fmt(debitLine.debit||0)}</td>
      <td>${creditAcc?creditAcc.name:creditLine.accountId}</td>
      <td style="text-align:right">${fmt(creditLine.credit||0)}</td>
      <td rowspan="2" style="text-align:center;vertical-align:middle;">
        <button class="btn-del" data-id="${tx.id}">Hapus</button>
      </td>
    `;
    const tr2 = document.createElement('tr');
    tr2.innerHTML = `<td></td><td class="kredit">${tx.lines.length>2 ? '...' : ''}</td><td></td><td></td><td></td><td></td>`;
    tbody.appendChild(tr1);
    tbody.appendChild(tr2);
  }

  // delete handlers
  qa('.btn-del').forEach(btn => btn.addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    if (!confirm('Hapus transaksi ini?')) return;
    transactions = transactions.filter(t => t.id !== id);
    save();
    renderAll();
  }));
}

// ---------- Compute balances ----------
function computeBalances(){
  // return map accountId => balance (debit positive = debit - credit)
  const balances = {};
  ACCOUNTS.forEach(a => balances[a.id] = 0);
  for (const tx of transactions){
    for (const l of tx.lines){
      balances[l.accountId] = (balances[l.accountId] || 0) + (l.debit || 0) - (l.credit || 0);
    }
  }
  return balances;
}

// ---------- Render Trial Balance ----------
function renderTrial(){
  const tbody = byId('trial-body');
  tbody.innerHTML = '';
  const balances = computeBalances();
  let totD = 0, totC = 0;
  for (const a of ACCOUNTS){
    const b = balances[a.id] || 0;
    let d=0,c=0;
    if (b >= 0) d = b; else c = -b;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${a.code}</td><td>${a.name}</td><td>${a.type}</td><td style="text-align:right">${fmt(d)}</td><td style="text-align:right">${fmt(c)}</td>`;
    tbody.appendChild(tr);
    totD += d; totC += c;
  }
  byId('trial-debit').textContent = fmt(totD);
  byId('trial-credit').textContent = fmt(totC);
}

// ---------- Ledger (Buku Besar) ----------
function populateLedgerSelect(){
  const sel = byId('ledger-account');
  sel.innerHTML = '<option value="">-- Pilih Akun --</option>' + ACCOUNTS.map(a=>`<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');
}
function renderLedger(){
  const accId = byId('ledger-account').value;
  const wrap = byId('ledger-wrap');
  wrap.innerHTML = '';
  if (!accId) return;
  const acc = accById(accId);
  const table = document.createElement('table'); table.className='table';
  table.innerHTML = `<thead><tr><th>Tanggal</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  let run = 0;
  const txs = [...transactions].reverse(); // oldest first
  for (const tx of txs){
    for (const l of tx.lines){
      if (l.accountId !== accId) continue;
      const d = l.debit||0, c = l.credit||0;
      run += d - c;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tx.date}</td><td>${tx.desc||''}</td><td style="text-align:right">${fmt(d)}</td><td style="text-align:right">${fmt(c)}</td><td style="text-align:right">${fmt(run)}</td>`;
      tbody.appendChild(tr);
    }
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

// ---------- Balance Sheet & Income Statement ----------
function renderBalanceSheet(){
  const balances = computeBalances();
  // assets
  const assetList = byId('asset-list'); assetList.innerHTML = '';
  let totalAsset = 0;
  ACCOUNTS.filter(a=>a.type==='asset').forEach(a=>{
    const b = balances[a.id]||0;
    totalAsset += b;
    const li = document.createElement('li');
    li.innerHTML = `<span>${a.name}</span><strong>${fmt(b)}</strong>`;
    assetList.appendChild(li);
  });
  byId('total-asset').textContent = fmt(totalAsset);

  // liabilities
  const liabList = byId('liab-list'); liabList.innerHTML = '';
  let totalLiab = 0;
  ACCOUNTS.filter(a=>a.type==='liability').forEach(a=>{
    const b = balances[a.id]||0;
    // liabilities typically credit (negative stored), show absolute
    totalLiab += -b;
    const li = document.createElement('li');
    li.innerHTML = `<span>${a.name}</span><strong>${fmt(-b)}</strong>`;
    liabList.appendChild(li);
  });

  // equity
  const equityList = byId('equity-list'); equityList.innerHTML = '';
  let totalEquity = 0;
  ACCOUNTS.filter(a=>a.type==='equity').forEach(a=>{
    const b = balances[a.id]||0;
    totalEquity += -b;
    const li = document.createElement('li');
    li.innerHTML = `<span>${a.name}</span><strong>${fmt(-b)}</strong>`;
    equityList.appendChild(li);
  });

  // net income (revenue - expense) goes to equity
  let totalRevenue = 0, totalExpense = 0;
  ACCOUNTS.filter(a=>a.type==='revenue').forEach(a => totalRevenue += -(balances[a.id]||0));
  ACCOUNTS.filter(a=>a.type==='expense').forEach(a => totalExpense += (balances[a.id]||0));
  const netIncome = totalRevenue - totalExpense;
  const niItem = document.createElement('li');
  niItem.innerHTML = `<span>Laba (Rugi) Bersih</span><strong>${fmt(netIncome)}</strong>`;
  equityList.appendChild(niItem);
  totalEquity += netIncome;

  byId('total-liab-equity').textContent = fmt(totalLiab + totalEquity);
}

function renderIncomeStatement(){
  const balances = computeBalances();
  let totalRevenue = 0, totalExpense = 0;
  ACCOUNTS.filter(a=>a.type==='revenue').forEach(a => totalRevenue += -(balances[a.id]||0));
  ACCOUNTS.filter(a=>a.type==='expense').forEach(a => totalExpense += (balances[a.id]||0));
  byId('is-revenue').textContent = fmt(totalRevenue);
  byId('is-expense').textContent = fmt(totalExpense);
  byId('is-net').textContent = fmt(totalRevenue - totalExpense);

  // update dashboard cards
  byId('card-rev').textContent = fmt(totalRevenue);
  byId('card-exp').textContent = fmt(totalExpense);
}

// ---------- Dashboard summary & chart ----------
function renderSummary(){
  const balances = computeBalances();
  const entries = ACCOUNTS.slice(0,8).map(a => ({ name: a.name, bal: balances[a.id]||0 }));
  const wrap = byId('summary-list'); wrap.innerHTML = '';
  entries.forEach(e => {
    const li = document.createElement('div');
    li.className = 'mini';
    li.innerHTML = `<div>${e.name}</div><div><strong>${fmt(e.bal)}</strong></div>`;
    wrap.appendChild(li);
  });

  // Kas card
  const kasBal = balances['A101']||0;
  byId('card-kas').textContent = fmt(kasBal);

  // update chart
  const totalRev = parseFloat(byId('card-rev').textContent.replace(/[^\d]/g,'')) || 0;
  const totalExp = parseFloat(byId('card-exp').textContent.replace(/[^\d]/g,'')) || 0;
  updateChart(totalRev, totalExp);
}

function initChart(){
  const ctx = document.getElementById('chartRevExp').getContext('2d');
  chartRE = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Pendapatan','Beban'], datasets:[{ data:[0,0], backgroundColor:['#0d6efd','#dc3545'] }] },
    options: { plugins:{legend:{position:'bottom'}} }
  });
}
function updateChart(rev, exp){
  if (!chartRE) return;
  chartRE.data.datasets[0].data = [rev, exp];
  chartRE.update();
}

// ---------- Update All ----------
function renderAll(){
  renderJurnal();
  renderTrial();
  renderBalanceSheet();
  renderIncomeStatement();
  renderSummary();
  populateLedgerSelect();
}

function updateAll(){ renderAll(); }

// ---------- onClearAll ----------
function onClearAll(){
  if (!confirm('Hapus semua transaksi?')) return;
  transactions = [];
  save();
  renderAll();
  showMsg('Semua transaksi dihapus','ok');
}

// ---------- messages ----------
function showMsg(text, kind='ok'){
  const el = byId('msg');
  el.textContent = text;
  el.className = 'msg ' + (kind==='error'?'error':'ok');
  setTimeout(()=>{ el.textContent=''; el.className='msg'; }, 3000);
}

// ---------- ledger functions ----------
function populateLedgerSelect(){
  const sel = byId('ledger-account');
  sel.innerHTML = '<option value="">-- pilih akun --</option>' + ACCOUNTS.map(a=>`<option value="${a.id}">${a.code} - ${a.name}</option>`).join('');
}
function renderLedger(){
  const accId = byId('ledger-account').value;
  const wrap = byId('ledger-wrap');
  wrap.innerHTML = '';
  if (!accId) return;
  const acc = accById(accId);
  const tbl = document.createElement('table'); tbl.className='table';
  tbl.innerHTML = `<thead><tr><th>Tanggal</th><th>Keterangan</th><th>Debit</th><th>Kredit</th><th>Saldo</th></tr></thead>`;
  const tbody = document.createElement('tbody');
  let running = 0;
  const txs = [...transactions].reverse(); // oldest first
  for (const tx of txs){
    for (const l of tx.lines){
      if (l.accountId !== accId) continue;
      const d = l.debit||0, c = l.credit||0;
      running += d - c;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tx.date}</td><td>${tx.desc||''}</td><td style="text-align:right">${fmt(d)}</td><td style="text-align:right">${fmt(c)}</td><td style="text-align:right">${fmt(running)}</td>`;
      tbody.appendChild(tr);
    }
  }
  tbl.appendChild(tbody); wrap.appendChild(tbl);
}

// ---------- utilities ----------
function accById(id){ return ACCOUNTS.find(a => a.id === id); }

// ---------- initial load ----------
load();
renderAll();
