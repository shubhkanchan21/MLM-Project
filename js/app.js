// dynamically import real API adapter when `window.USE_REAL_API` is true
const apiModule = await (window.USE_REAL_API ? import('./realApi.js') : import('./api.js'));
const { createSession, clearSession, fetchTree, fetchUser, getLevelStatus, startAutoUpdates } = apiModule;
import { payAndUpdate } from './payment.js';
import { initAdmin } from './admin.js';

// App-level state
const STATE = {
  users: [],
  nodeMap: new Map(),
  levels: [],
  levelStatus: [],
  session: null,
  viewerUserId: null
};

const SELECTORS = {
  entry: document.getElementById('entry'),
  dashboard: document.getElementById('dashboard'),
  adminPanel: document.getElementById('adminPanel'),
  adminRoot: document.getElementById('adminRoot'),
  enterBtn: document.getElementById('enterBtn'),
  levelsList: document.getElementById('levelsList'),
  treeSvg: document.getElementById('treeSvg'),
  nodeDetails: document.getElementById('nodeDetails'),
  modalOverlay: document.getElementById('modalOverlay'),
  modalContent: document.getElementById('modalContent'),
  closeModal: document.getElementById('closeModal'),
  userIdInput: document.getElementById('userIdInput'),
  sessionBadge: document.getElementById('sessionBadge'),
  adminSessionBadge: document.getElementById('adminSessionBadge'),
  logoutBtn: document.getElementById('logoutBtn'),
  adminLogoutBtn: document.getElementById('adminLogoutBtn')
};

// SPA transition with role selection
SELECTORS.enterBtn.addEventListener('click', async ()=>{
  const role = document.querySelector('input[name="role"]:checked').value;
  const uid = Number(SELECTORS.userIdInput.value) || 1;
  STATE.session = createSession({ role, userId: uid });
  if(role === 'admin'){
    SELECTORS.entry.classList.add('hidden');
    SELECTORS.adminPanel.classList.remove('hidden');
    SELECTORS.adminSessionBadge.textContent = `Session: Admin`;
    await initAdmin(SELECTORS.adminRoot, STATE.session);
    return;
  }
  // user flow
  SELECTORS.entry.classList.add('hidden');
  SELECTORS.dashboard.classList.remove('hidden');
  SELECTORS.sessionBadge.textContent = `Session: User ${uid}`;
  await initialize(uid);
});

SELECTORS.logoutBtn.addEventListener('click', () => location.reload());
SELECTORS.adminLogoutBtn.addEventListener('click', () => location.reload());

// Keyboard modal close
document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeModal(); });
SELECTORS.closeModal.addEventListener('click', closeModal);

// auto-login when URL query contains userId (and optional role)
(function autoLoginFromQuery(){
  const params = new URLSearchParams(location.search);
  const uid = params.get('userId');
  if (!uid) return;
  const role = params.get('role') === 'admin' ? 'admin' : 'user';
  const roleInput = document.querySelector(`input[name="role"][value="${role}"]`);
  if (roleInput) roleInput.checked = true;
  SELECTORS.userIdInput.value = uid;
  // simulate click after a tick so the DOM is ready
  setTimeout(()=> SELECTORS.enterBtn.click(), 0);
})();

function showModal(contentHtml){
  SELECTORS.modalContent.innerHTML = contentHtml;
  SELECTORS.modalOverlay.classList.remove('hidden');
  if(STATE._modalTimer) clearTimeout(STATE._modalTimer);
  STATE._modalTimer = setTimeout(()=>closeModal(), 60000);
}

function closeModal(){
  SELECTORS.modalOverlay.classList.add('hidden');
  if(STATE._modalTimer) clearTimeout(STATE._modalTimer);
}

// Initialize app data and start rendering
async function initialize(viewerUserId = null){
  STATE.viewerUserId = viewerUserId;
  STATE.levelStatus = await getLevelStatus(STATE.session);
  STATE.users = await fetchTree(STATE.session);
  buildLevels(STATE.users);
  renderLevels();
  buildNodeMap();
  renderTree(viewerUserId);
  STATE.stopAuto = startAutoUpdates(onExternalUpdate);
}

function buildLevels(users){
  const maxLevel = Math.max(...users.map(u=>u.level));
  STATE.levels = [];
  for(let l=0;l<=maxLevel;l++){
    const levelUsers = users.filter(u=>u.level===l).sort((a,b)=>a.userId-b.userId);
    STATE.levels.push(levelUsers);
  }
}

function renderLevels(){
  const list = SELECTORS.levelsList; list.innerHTML = '';
  STATE.levels.forEach((levelNodes, idx)=>{
    const li = document.createElement('li');
    const name = idx===0? 'Root' : `Level ${idx}`;
    li.className = computeLevelClass(idx);
    li.innerHTML = `<span>${name}</span><span class="badge">${levelNodes.length}</span>`;
    list.appendChild(li);
  });
}

function computeLevelClass(levelIndex){
  const rec = STATE.levelStatus.find(l=>l.level===levelIndex);
  if(!rec) return 'locked';
  if(rec.unlocked && levelIndex===0) return 'active';
  return rec.unlocked ? 'active' : 'locked';
}

function buildNodeMap(){
  STATE.nodeMap.clear();
  STATE.users.forEach(u=> STATE.nodeMap.set(u.userId, u));
}

function isParentPaid(node){
  if(!node.parentId) return true;
  const parent = STATE.nodeMap.get(node.parentId);
  return parent && parent.paymentStatus === 'COMPLETED';
}

function isLevelUnlocked(level){
  const rec = STATE.levelStatus.find(l=>l.level===level);
  return rec ? rec.unlocked : false;
}

function isEligibleForPayment(node){
  return node.active && isLevelUnlocked(node.level) && isParentPaid(node);
}

function isDescendant(nodeId, viewerId){
  if(!viewerId) return true;
  let current = nodeId;
  while(current){
    if(current === viewerId) return true;
    const node = STATE.nodeMap.get(current);
    current = node ? node.parentId : null;
  }
  return false;
}

function isAncestor(nodeId, viewerId){
  let current = viewerId;
  while(current){
    if(current === nodeId) return true;
    const node = STATE.nodeMap.get(current);
    current = node ? node.parentId : null;
  }
  return false;
}

// Tree rendering
function renderTree(viewerUserId = null){
  const svg = SELECTORS.treeSvg;
  while(svg.firstChild) svg.removeChild(svg.firstChild);

  const width = svg.clientWidth || 1200;
  const height = svg.clientHeight || 800;
  const marginY = 80;
  const nodeW = 150, nodeH = 60;

  const positions = new Map();
  let globalIndex = 1;
  for(let lvl=0; lvl<STATE.levels.length; lvl++){
    const nodes = STATE.levels[lvl];
    const y = marginY + lvl * ((height - 2*marginY)/(STATE.levels.length-1 || 1));
    const step = width / (nodes.length + 1);
    for(let i=0;i<nodes.length;i++){
      const x = step * (i+1);
      positions.set(nodes[i].userId, {x,y});
      globalIndex++;
    }
  }

  // draw links
  for(const node of STATE.users){
    const pos = positions.get(node.userId);
    if(!pos || !node.parentId) continue;
    const ppos = positions.get(node.parentId);
    if(!ppos) continue;
    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', ppos.x);
    line.setAttribute('y1', ppos.y + 24);
    line.setAttribute('x2', pos.x);
    line.setAttribute('y2', pos.y - 24);
    line.setAttribute('stroke', 'rgba(255,255,255,0.08)');
    line.setAttribute('stroke-width','1');
    svg.appendChild(line);
  }

  // draw nodes
  for(const node of STATE.users){
    const pos = positions.get(node.userId);
    if(!pos) continue;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.classList.add('node');
    const rect = document.createElementNS('http://www.w3.org/2000/svg','rect');
    rect.setAttribute('x', pos.x - nodeW/2);
    rect.setAttribute('y', pos.y - nodeH/2);
    rect.setAttribute('width', nodeW);
    rect.setAttribute('height', nodeH);
    rect.setAttribute('fill','none');
    g.appendChild(rect);

    const name = document.createElementNS('http://www.w3.org/2000/svg','text');
    name.setAttribute('x', pos.x);
    name.setAttribute('y', pos.y - 6);
    name.setAttribute('text-anchor','middle');
    name.setAttribute('class','name');
    name.textContent = node.name;
    g.appendChild(name);

    const status = document.createElementNS('http://www.w3.org/2000/svg','text');
    status.setAttribute('x', pos.x);
    status.setAttribute('y', pos.y + 14);
    status.setAttribute('text-anchor','middle');
    status.setAttribute('class','status');
    status.textContent = node.paymentStatus === 'COMPLETED' ? 'COMPLETED' : 'PENDING';
    g.appendChild(status);

    const isActive = isEligibleForPayment(node);
    if(!isActive) g.classList.add('locked');
    if(node.paymentStatus === 'COMPLETED') g.classList.add('completed');

    g.addEventListener('click', async (e)=>{
      e.stopPropagation();
      const allowed = isDescendant(node.userId, viewerUserId) || isAncestor(node.userId, viewerUserId);
      if(!allowed) return;
      const fresh = await fetchUser(node.userId, STATE.session);
      showNodeModal(fresh || node);
    });

    if(viewerUserId){
      const allowed = isDescendant(node.userId, viewerUserId) || isAncestor(node.userId, viewerUserId);
      if(!allowed) g.style.opacity = 0.18;
    }

    svg.appendChild(g);
  }
}

function showNodeModal(node){
  const eligible = isEligibleForPayment(node);
  const isOwner = Number(node.userId) === Number(STATE.viewerUserId);
  const readOnly = !isOwner && isAncestor(node.userId, STATE.viewerUserId);
  SELECTORS.nodeDetails.innerHTML = `
    <div><strong>${node.name}</strong></div>
    <div>User ID: ${node.userId}</div>
    <div>Level: ${node.level}</div>
    <div>Status: ${node.paymentStatus}</div>
  `;
  let html = `
    <div class="row"><strong>${node.name}</strong></div>
    <div class="row">User ID: ${node.userId}</div>
    <div class="row">Email: ${node.email}</div>
    <div class="row">Phone: ${node.phone}</div>
  `;
  const statusClass = node.paymentStatus==='COMPLETED' ? 'status-completed' : 'status-pending';
  html += `<div class="row"><span class="status-pill ${statusClass}">${node.paymentStatus}</span></div>`;
  if(readOnly){
    html += `<div class="row">Read-only access to higher level</div>`;
  }

  if(node.paymentStatus !== 'COMPLETED' && eligible && !readOnly){
    html += `<div class="form-row"><button id="payBtn" class="btn primary">Pay Now</button></div>`;
    showModal(html);
    const btn = document.getElementById('payBtn');
    if(btn){
      btn.addEventListener('click', async ()=>{
        await payAndUpdate({ userId: node.userId, amount: 9.99, session: STATE.session, gateway: 'mock' });
        await refreshUserView();
        closeModal();
      });
    }
    return;
  }

  showModal(html);
}

async function refreshUserView(){
  STATE.levelStatus = await getLevelStatus(STATE.session);
  STATE.users = await fetchTree(STATE.session);
  buildLevels(STATE.users);
  buildNodeMap();
  renderLevels();
  renderTree(STATE.viewerUserId);
}

// API external update handler
async function onExternalUpdate(){
  await refreshUserView();
}

// Basic zoom & pan for SVG
function setupPanZoom(){
  const svg = SELECTORS.treeSvg;
  let viewX = 0, viewY = 0, scale = 1;
  let isPanning=false, start = null;
  const updateView = ()=>{
    svg.style.transform = `translate(${viewX}px,${viewY}px) scale(${scale})`;
  };
  svg.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    scale = Math.min(2.5, Math.max(0.6, scale + delta));
    updateView();
  }, {passive:false});

  svg.addEventListener('pointerdown', (e)=>{ isPanning=true; start = {x:e.clientX - viewX, y:e.clientY - viewY}; svg.setPointerCapture(e.pointerId); });
  window.addEventListener('pointermove', (e)=>{ if(!isPanning) return; viewX = e.clientX - start.x; viewY = e.clientY - start.y; updateView(); });
  window.addEventListener('pointerup', ()=>{ isPanning=false; start=null });
}

SELECTORS.modalOverlay.addEventListener('click', (e)=>{ if(e.target===SELECTORS.modalOverlay) closeModal(); });
setupPanZoom();

// Debug utilities
window.__mlm_app = { initialize, refreshUserView };
