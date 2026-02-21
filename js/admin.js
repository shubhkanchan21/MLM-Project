import {
  fetchAllUsers,
  searchUsers,
  updatePaymentStatus,
  getLevelStatus,
  setLevelUnlock,
  fetchAnalytics,
  startAutoUpdates,
  fetchPayments,
  updateUserActive,
  fetchDownlineCount,
  fetchEarningsSummary,
  fetchTree
} from './api.js';

// Admin UI controller
const ADMIN = {
  root: null,
  session: null,
  stopAuto: null
};

export async function initAdmin(rootEl, session){
  ADMIN.root = rootEl;
  ADMIN.session = session;
  ADMIN.root.innerHTML = buildAdminLayout();
  wireAdminActions();
  await renderDashboard();
  ADMIN.stopAuto = startAutoUpdates(onExternalUpdate);
}

function buildAdminLayout(){
  return `
  <div class="admin-layout">
    <aside class="sidebar">
      <h4>Navigation</h4>
      <div class="nav-item active" data-view="dashboard">Dashboard</div>
      <div class="nav-item" data-view="users">Users</div>
      <div class="nav-item" data-view="tree">Binary Tree Viewer</div>
      <div class="nav-item" data-view="payments">Payments</div>
      <div class="nav-item" data-view="levels">Levels</div>
      <div class="nav-item" data-view="reports">Reports</div>
      <div class="nav-item" data-view="settings">Settings</div>
    </aside>
    <section class="admin-main">
      <div class="toolbar">
        <input class="search" id="adminSearch" placeholder="Search by ID, email or phone" />
        <button class="btn" id="btnSearch">Search</button>
      </div>
      <div id="adminContent"></div>
    </section>
  </div>
  `;
}

function wireAdminActions(){
  ADMIN.root.querySelectorAll('.nav-item').forEach(el=> el.addEventListener('click', ()=>{
    ADMIN.root.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));
    el.classList.add('active');
    const view = el.dataset.view;
    routeAdminView(view);
  }));

  ADMIN.root.querySelector('#btnSearch').addEventListener('click', async ()=>{
    const q = ADMIN.root.querySelector('#adminSearch').value.trim();
    if(!q) return;
    const res = await searchUsers(q, ADMIN.session);
    renderUserSearchResults(res);
  });
}

async function renderDashboard(){
  const content = ADMIN.root.querySelector('#adminContent');
  const analytics = await fetchAnalytics(ADMIN.session);
  content.innerHTML = `
    <h3>Enterprise Overview</h3>
    <div class="cards">
      <div class="card"><h5>Total Users</h5><div class="metric">${analytics.total}</div></div>
      <div class="card"><h5>Active Users</h5><div class="metric">${analytics.active}</div></div>
      <div class="card"><h5>Completed Payments</h5><div class="metric">${analytics.completed}</div></div>
    </div>
    <div class="kpi-grid" style="margin-top:14px">
      <div class="card">
        <h5>Revenue (Mock)</h5>
        <div class="metric">$${analytics.revenue.toFixed(2)}</div>
        <div class="muted">Derived from completed payments</div>
      </div>
      <div class="card">
        <h5>Tree Depth</h5>
        <div class="metric">${analytics.depth}</div>
      </div>
    </div>
    <div style="margin-top:14px" class="cards">
      <div class="card">
        <h5>Level Distribution</h5>
        <div class="chart"><canvas id="levelChart"></canvas></div>
      </div>
      <div class="card">
        <h5>Payment Health</h5>
        <div class="chart"><canvas id="paymentChart"></canvas></div>
      </div>
      <div class="card">
        <h5>Locked Users</h5>
        <div class="metric">${analytics.locked}</div>
        <div class="muted">Inactive or restricted users</div>
      </div>
    </div>
  `;
  renderBarChart('levelChart', analytics.levelCounts.map(l=>`L${l.level}`), analytics.levelCounts.map(l=>l.count));
  renderBarChart('paymentChart', ['Completed','Locked'], [analytics.completed, analytics.locked], ['#23c58a','#ef6a6a']);
}

function routeAdminView(view){
  if(view==='dashboard') return renderDashboard();
  if(view==='users') return renderUsersView();
  if(view==='tree') return renderTreeView();
  if(view==='payments') return renderPaymentsView();
  if(view==='levels') return renderLevelsView();
  if(view==='reports') return renderReportsView();
  if(view==='settings') return renderSettingsView();
  ADMIN.root.querySelector('#adminContent').innerHTML = `<h3>${view}</h3><div>Not implemented</div>`;
}

async function renderUsersView(){
  const users = await fetchAllUsers(ADMIN.session);
  const c = ADMIN.root.querySelector('#adminContent');
  c.innerHTML = `<h3>Users (${users.length})</h3>
    <table class="table">
      <thead>
        <tr><th>ID</th><th>Name</th><th>Email</th><th>Level</th><th>Status</th><th>Actions</th></tr>
      </thead>
      <tbody id="usersList"></tbody>
    </table>`;
  const wrap = ADMIN.root.querySelector('#usersList');
  users.slice(0,250).forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${u.userId}</td>
      <td>${u.name}</td>
      <td>${u.email}</td>
      <td>${u.level}</td>
      <td><span class="badge ${u.paymentStatus==='COMPLETED' ? 'success' : 'warn'}">${u.paymentStatus}</span></td>
      <td><button class="btn" data-id="${u.userId}">Open</button></td>`;
    wrap.appendChild(tr);
  });
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click', (e)=>{
    const id = e.target.dataset.id; showAdminUser(id);
  }));
}

async function showAdminUser(userId){
  const users = await fetchAllUsers(ADMIN.session);
  const u = users.find(x=>x.userId==userId);
  if(!u) return;
  const downline = await fetchDownlineCount(u.userId, ADMIN.session);
  const earnings = await fetchEarningsSummary(u.userId, ADMIN.session);
  const c = ADMIN.root.querySelector('#adminContent');
  c.innerHTML = `
    <h3>User ${u.userId}</h3>
    <div class="form-row"><div style="flex:1">${u.name}</div><div>${u.email}</div></div>
    <div class="form-row"><div>Phone</div><div>${u.phone}</div></div>
    <div class="form-row"><div>Level</div><div>${u.level}</div><div>Position</div><div>${u.position || 'root'}</div></div>
    <div class="form-row"><div>Parent</div><div>${u.parentId || '-'}</div><div>Downline</div><div>${downline.downline}</div></div>
    <div class="form-row"><div>Earnings</div><div>$${earnings.paid} paid, $${earnings.pending} pending</div></div>
    <div class="form-row">
      <button class="btn primary" id="btnComplete">Mark Completed</button>
      <button class="btn" id="btnRevoke">Mark Not Completed</button>
      <button class="btn ${u.active ? 'danger' : 'primary'}" id="btnToggle">${u.active ? 'Deactivate' : 'Activate'} User</button>
    </div>
  `;
  ADMIN.root.querySelector('#btnComplete').addEventListener('click', async ()=>{
    await updatePaymentStatus({ userId: u.userId, status: 'COMPLETED', transactionId: `admin_override_${Date.now()}`, session: ADMIN.session });
    showAdminUser(u.userId);
  });
  ADMIN.root.querySelector('#btnRevoke').addEventListener('click', async ()=>{
    await updatePaymentStatus({ userId: u.userId, status: 'NOT_COMPLETED', transactionId: null, session: ADMIN.session });
    showAdminUser(u.userId);
  });
  ADMIN.root.querySelector('#btnToggle').addEventListener('click', async ()=>{
    await updateUserActive(u.userId, !u.active, ADMIN.session);
    showAdminUser(u.userId);
  });
}

async function renderTreeView(){
  const c = ADMIN.root.querySelector('#adminContent');
  const users = await fetchTree(ADMIN.session);
  c.innerHTML = `<h3>Binary Tree Viewer</h3>
    <div class="card" style="margin-top:10px">
      <h5>Tree Nodes</h5>
      <table class="table">
        <thead><tr><th>ID</th><th>Level</th><th>Parent</th><th>Position</th><th>Status</th></tr></thead>
        <tbody id="treeRows"></tbody>
      </table>
    </div>`;
  const wrap = ADMIN.root.querySelector('#treeRows');
  users.forEach(u=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${u.userId}</td><td>${u.level}</td><td>${u.parentId || '-'}</td><td>${u.position || 'root'}</td><td>${u.paymentStatus}</td>`;
    wrap.appendChild(tr);
  });
}

async function renderPaymentsView(){
  const users = await fetchPayments({ status: null, session: ADMIN.session });
  const c = ADMIN.root.querySelector('#adminContent');
  c.innerHTML = `<h3>Payments</h3>
    <table class="table">
      <thead><tr><th>Payment ID</th><th>User</th><th>Amount</th><th>Status</th><th>Updated</th></tr></thead>
      <tbody id="paymentsList"></tbody>
    </table>`;
  const wrap = ADMIN.root.querySelector('#paymentsList');
  users.slice(0,250).forEach(p=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${p.paymentId}</td><td>${p.userId}</td><td>$${p.amount.toFixed(2)}</td><td>${p.status}</td><td>${new Date(p.updatedAt).toLocaleString()}</td>`;
    wrap.appendChild(tr);
  });
}

async function renderLevelsView(){
  const c = ADMIN.root.querySelector('#adminContent');
  const levels = await getLevelStatus(ADMIN.session);
  c.innerHTML = `<h3>Levels</h3><div id="levelsWrap"></div>`;
  const wrap = ADMIN.root.querySelector('#levelsWrap');
  levels.forEach(l=>{
    const r = document.createElement('div');
    r.className='form-row';
    r.innerHTML = `<div style="flex:1">Level ${l.level}</div><div>${l.unlocked ? 'Unlocked' : 'Locked'}</div><div><button class="btn" data-level="${l.level}">${l.unlocked ? 'Lock' : 'Unlock'}</button></div>`;
    wrap.appendChild(r);
  });
  wrap.querySelectorAll('button[data-level]').forEach(b=> b.addEventListener('click', async (e)=>{
    const lvl = e.target.dataset.level;
    const cur = levels.find(x=>x.level==lvl);
    await setLevelUnlock(lvl, !cur.unlocked, ADMIN.session);
    renderLevelsView();
  }));
}

async function renderReportsView(){
  const c = ADMIN.root.querySelector('#adminContent');
  const analytics = await fetchAnalytics(ADMIN.session);
  c.innerHTML = `<h3>Reports</h3>
    <div class="card"><h5>Level Report</h5><div class="chart"><canvas id="reportLevel"></canvas></div></div>
    <div class="card" style="margin-top:10px"><h5>Tree Depth</h5><div class="metric">${analytics.depth}</div></div>`;
  renderBarChart('reportLevel', analytics.levelCounts.map(l=>`L${l.level}`), analytics.levelCounts.map(l=>l.count));
}

function renderSettingsView(){
  const c = ADMIN.root.querySelector('#adminContent');
  c.innerHTML = `<h3>Settings</h3>
    <div class="card"><h5>Environment</h5><div>Mode: Mock</div><div>Gateway: Mock</div></div>`;
}

function renderUserSearchResults(results){
  const c = ADMIN.root.querySelector('#adminContent');
  c.innerHTML = `<h3>Search Results (${results.length})</h3>
    <table class="table"><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Status</th><th>Action</th></tr></thead><tbody id="searchList"></tbody></table>`;
  const wrap = ADMIN.root.querySelector('#searchList');
  results.forEach(u=>{
    const r = document.createElement('tr');
    r.innerHTML = `<td>${u.userId}</td><td>${u.name}</td><td>${u.email}</td><td>${u.paymentStatus}</td><td><button class="btn" data-id="${u.userId}">Open</button></td>`;
    wrap.appendChild(r);
  });
  wrap.querySelectorAll('button[data-id]').forEach(b=> b.addEventListener('click',(e)=> showAdminUser(e.target.dataset.id)));
}

function renderBarChart(canvasId, labels, values, colors = ['#23c58a']){
  const canvas = document.getElementById(canvasId);
  if(!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.parentElement.clientWidth - 10;
  const h = canvas.height = canvas.parentElement.clientHeight - 10;
  ctx.clearRect(0,0,w,h);
  const max = Math.max(...values, 1);
  const barWidth = w / values.length * 0.6;
  values.forEach((val, i)=>{
    const x = (w / values.length) * i + barWidth * 0.35;
    const barHeight = (val / max) * (h - 24);
    ctx.fillStyle = colors[i] || colors[0];
    ctx.fillRect(x, h - barHeight - 12, barWidth, barHeight);
    ctx.fillStyle = '#9db0c5';
    ctx.font = '11px IBM Plex Sans';
    ctx.fillText(labels[i], x, h - 2);
  });
}

function onExternalUpdate(){
  const active = ADMIN.root.querySelector('.nav-item.active');
  if(active) routeAdminView(active.dataset.view);
}
