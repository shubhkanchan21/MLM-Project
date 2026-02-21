// Enterprise Mock API Module
// This module simulates backend behavior with validation, role checks, and localStorage persistence.
//
// DATABASE SCHEMA (DESIGN COMMENTS)
// USERS TABLE
// - userId (primary key)
// - parentId (nullable)
// - level (integer, root = 0)
// - position (left/right)
// - name
// - email
// - phone
// - role (admin/user)
// - active (boolean)
// - createdAt (timestamp)
//
// PAYMENTS TABLE
// - paymentId (primary key)
// - userId (foreign key -> USERS.userId)
// - amount
// - status (COMPLETED / NOT_COMPLETED)
// - transactionId
// - updatedAt (timestamp)
//
// LEVEL_STATUS TABLE
// - level (integer)
// - unlocked (boolean)
// - unlockedAt (timestamp)

const STORAGE_KEY = 'mlm_enterprise_state_v1';
const SESSION_KEY = 'mlm_enterprise_session_v1';

const LEVEL_COUNT = 6; // 0..6

function now(){ return new Date().toISOString(); }

function randomFrom(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function buildInitialUsers(maxLevel = LEVEL_COUNT){
  const counts = [1];
  for(let i=1;i<=maxLevel;i++) counts.push(2**i);
  const users = [];
  let id = 1;
  for(let lvl=0; lvl<counts.length; lvl++){
    for(let i=0;i<counts[lvl];i++){
      const parentIndex = lvl===0 ? null : Math.floor((id)/2) || null;
      const position = (lvl===0) ? null : (((id % 2) === 0) ? 'left' : 'right');
      const role = lvl===0 ? 'admin' : 'user';
      const active = true;
      users.push({
        userId: id,
        parentId: parentIndex,
        level: lvl,
        position,
        name: lvl===0 ? 'Aditya (Root)' : `User ${id}`,
        email: `user${id}@example.com`,
        phone: `+1-555-${String(1000+id).slice(-4)}`,
        role,
        active,
        createdAt: now()
      });
      id++;
    }
  }
  return users;
}

function buildInitialPayments(users){
  const payments = [];
  users.forEach(u=>{
    const isCompleted = u.level === 0 || (u.level <= 1 && Math.random() > 0.35);
    payments.push({
      paymentId: `pay_${u.userId}_${Date.now()}`,
      userId: u.userId,
      amount: 9.99,
      status: isCompleted ? 'COMPLETED' : 'NOT_COMPLETED',
      transactionId: isCompleted ? `tx_${u.userId}_${Date.now()}` : null,
      updatedAt: now()
    });
  });
  return payments;
}

function buildInitialLevels(maxLevel = LEVEL_COUNT){
  const levels = [];
  for(let l=0;l<=maxLevel;l++) levels.push({ level: l, unlocked: l===0, unlockedAt: l===0 ? now() : null });
  return levels;
}

function buildInitialState(){
  const users = buildInitialUsers(LEVEL_COUNT);
  const payments = buildInitialPayments(users);
  const levels = buildInitialLevels(LEVEL_COUNT);
  return { users, payments, levels };
}

function loadState(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(raw) return JSON.parse(raw);
  const state = buildInitialState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return state;
}

function saveState(state){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// Session helpers
export function createSession({ role, userId }){
  const session = { sessionId: `sess_${Date.now()}`, role, userId: Number(userId), issuedAt: now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession(){
  const raw = localStorage.getItem(SESSION_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function clearSession(){ localStorage.removeItem(SESSION_KEY); }

function requireSession(session){
  if(!session || !session.role) throw new Error('AUTH_REQUIRED');
  return session;
}

function requireAdmin(session){
  requireSession(session);
  if(session.role !== 'admin') throw new Error('FORBIDDEN');
}

// Internal helpers
function getUserById(state, userId){ return state.users.find(u=>u.userId===Number(userId)); }

function getLatestPayment(state, userId){
  const list = state.payments.filter(p=>p.userId===Number(userId));
  return list.sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt))[0] || null;
}

function setPayment(state, userId, status, transactionId){
  const rec = {
    paymentId: `pay_${userId}_${Date.now()}`,
    userId: Number(userId),
    amount: 9.99,
    status,
    transactionId,
    updatedAt: now()
  };
  state.payments.push(rec);
  return rec;
}

function computeDownlineCount(state, userId){
  const id = Number(userId);
  const queue = [id];
  let count = 0;
  while(queue.length){
    const current = queue.shift();
    const children = state.users.filter(u=>u.parentId===current);
    children.forEach(c=>{ count++; queue.push(c.userId); });
  }
  return count;
}

function isLevelUnlocked(state, level){
  const rec = state.levels.find(l=>l.level===Number(level));
  return rec ? rec.unlocked : false;
}

function isEligibleForPayment(state, user){
  if(!user || !user.active) return false;
  if(!isLevelUnlocked(state, user.level)) return false;
  const parent = user.parentId ? getUserById(state, user.parentId) : null;
  if(!parent) return true;
  const parentPayment = getLatestPayment(state, parent.userId);
  return parentPayment && parentPayment.status === 'COMPLETED';
}

function mapUserWithPayment(state, user){
  const payment = getLatestPayment(state, user.userId);
  return { ...user, paymentStatus: payment ? payment.status : 'NOT_COMPLETED', lastPayment: payment };
}

function getSubtree(state, rootUserId){
  const rootId = Number(rootUserId);
  const results = [];
  const queue = [rootId];
  const ids = new Set();
  while(queue.length){
    const cur = queue.shift();
    if(ids.has(cur)) continue;
    ids.add(cur);
    const user = getUserById(state, cur);
    if(user) results.push(user);
    state.users.filter(u=>u.parentId===cur).forEach(child=> queue.push(child.userId));
  }
  return results;
}

function getAncestorPath(state, userId){
  const path = [];
  let current = getUserById(state, userId);
  while(current){
    path.push(current);
    current = current.parentId ? getUserById(state, current.parentId) : null;
  }
  return path;
}

// Public API
export function fetchAllUsers(session){
  requireAdmin(session);
  const state = loadState();
  return Promise.resolve(state.users.map(u=>mapUserWithPayment(state, u)));
}

export function fetchUser(userId, session){
  requireSession(session);
  const state = loadState();
  const user = getUserById(state, userId);
  if(!user) return Promise.resolve(null);
  if(session.role !== 'admin' && Number(userId) !== Number(session.userId)){
    return Promise.resolve(null);
  }
  return Promise.resolve(mapUserWithPayment(state, user));
}

export function searchUsers(query, session){
  requireAdmin(session);
  const q = String(query).toLowerCase();
  const state = loadState();
  const results = state.users.filter(u=> String(u.userId)===q || u.email.toLowerCase().includes(q) || u.phone.toLowerCase().includes(q));
  return Promise.resolve(results.map(u=>mapUserWithPayment(state,u)));
}

export function fetchTree(session){
  requireSession(session);
  const state = loadState();
  if(session.role === 'admin'){
    return Promise.resolve(state.users.map(u=>mapUserWithPayment(state,u)));
  }
  const subtree = getSubtree(state, session.userId);
  const ancestors = getAncestorPath(state, session.userId);
  const merged = [...subtree, ...ancestors.filter(a=> !subtree.find(s=>s.userId===a.userId))];
  return Promise.resolve(merged.map(u=>mapUserWithPayment(state,u)));
}

export function getLevelStatus(session){
  requireSession(session);
  const state = loadState();
  return Promise.resolve(state.levels);
}

export function setLevelUnlock(level, unlocked, session){
  requireAdmin(session);
  const state = loadState();
  const rec = state.levels.find(l=>l.level===Number(level));
  if(rec){ rec.unlocked = Boolean(unlocked); rec.unlockedAt = rec.unlocked ? now() : null; }
  saveState(state);
  return Promise.resolve(rec || null);
}

export function updateUserActive(userId, active, session){
  requireAdmin(session);
  const state = loadState();
  const user = getUserById(state, userId);
  if(user){ user.active = Boolean(active); saveState(state); }
  return Promise.resolve(user ? mapUserWithPayment(state, user) : null);
}

export function updatePaymentStatus({ userId, status, transactionId, session, source = 'admin' }){
  if(source !== 'gateway') requireAdmin(session);
  const state = loadState();
  const user = getUserById(state, userId);
  if(!user) return Promise.resolve(null);
  const rec = setPayment(state, userId, status, transactionId);
  saveState(state);
  return Promise.resolve({ user: mapUserWithPayment(state, user), payment: rec });
}

export function createPaymentIntent({ userId, amount = 9.99, gateway = 'mock', session }){
  requireSession(session);
  if(session.role !== 'admin' && Number(userId) !== Number(session.userId)) throw new Error('FORBIDDEN');
  const state = loadState();
  const user = getUserById(state, userId);
  if(!user) throw new Error('USER_NOT_FOUND');
  if(!isEligibleForPayment(state, user)) throw new Error('NOT_ELIGIBLE');
  const intent = { intentId: `pi_${Date.now()}`, userId: user.userId, amount, gateway, status: 'CREATED', createdAt: now() };
  return Promise.resolve(intent);
}

export function confirmPaymentIntent({ intent, session }){
  requireSession(session);
  if(session.role !== 'admin' && Number(intent.userId) !== Number(session.userId)) throw new Error('FORBIDDEN');
  const state = loadState();
  const user = getUserById(state, intent.userId);
  if(!user) throw new Error('USER_NOT_FOUND');
  const txId = `tx_${intent.userId}_${Date.now()}`;
  const rec = setPayment(state, intent.userId, 'COMPLETED', txId);
  saveState(state);
  return Promise.resolve({ payment: rec, transactionId: txId });
}

export function fetchPayments({ status = null, session }){
  requireAdmin(session);
  const state = loadState();
  const list = status ? state.payments.filter(p=>p.status===status) : state.payments;
  return Promise.resolve(list.slice().sort((a,b)=> new Date(b.updatedAt) - new Date(a.updatedAt)));
}

export function fetchAnalytics(session){
  requireAdmin(session);
  const state = loadState();
  const total = state.users.length;
  const active = state.users.filter(u=>u.active).length;
  const completed = state.payments.filter(p=>p.status==='COMPLETED').length;
  const locked = total - active;
  const levelCounts = state.levels.map(l=>({
    level: l.level,
    unlocked: l.unlocked,
    count: state.users.filter(u=>u.level===l.level).length
  }));
  const depth = Math.max(...state.users.map(u=>u.level));
  const revenue = completed * 9.99;
  return Promise.resolve({ total, active, completed, locked, levelCounts, depth, revenue });
}

export function fetchDownlineCount(userId, session){
  requireAdmin(session);
  const state = loadState();
  return Promise.resolve({ userId: Number(userId), downline: computeDownlineCount(state, userId) });
}

export function fetchEarningsSummary(userId, session){
  requireAdmin(session);
  const state = loadState();
  const downline = computeDownlineCount(state, userId);
  const paid = Math.round(downline * 3.2 * 100) / 100;
  const pending = Math.round(downline * 1.4 * 100) / 100;
  return Promise.resolve({ userId: Number(userId), paid, pending, currency: 'USD' });
}

export function startAutoUpdates(onChange){
  const tick = ()=>{
    const state = loadState();
    const pending = state.users.filter(u=>{
      const p = getLatestPayment(state, u.userId);
      return p && p.status === 'NOT_COMPLETED';
    });
    if(pending.length===0) return;
    const pick = randomFrom(pending);
    const rec = setPayment(state, pick.userId, 'COMPLETED', `tx_${Date.now()}`);
    saveState(state);
    if(typeof onChange === 'function') onChange({ userId: pick.userId, payment: rec });
  };
  const id = setInterval(tick, 10000 + Math.floor(Math.random()*6000));
  return ()=>clearInterval(id);
}

// Debug handle
window.__mlm_api = {
  createSession, getSession, clearSession, fetchAllUsers, fetchUser, fetchTree, searchUsers,
  updatePaymentStatus, createPaymentIntent, confirmPaymentIntent, fetchPayments,
  getLevelStatus, setLevelUnlock, updateUserActive, fetchAnalytics, fetchDownlineCount,
  fetchEarningsSummary, startAutoUpdates
};
