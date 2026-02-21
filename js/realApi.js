// Real API adapter (calls backend server mock endpoints)
const STORAGE_KEY = 'mlm_enterprise_state_v1';
const SESSION_KEY = 'mlm_enterprise_session_v1';
const BASE = 'http://localhost:3000';

function now(){ return new Date().toISOString(); }

export function createSession({ role, userId, client_id = null }){
  const session = { sessionId: `sess_${Date.now()}`, role, userId: Number(userId), client_id, issuedAt: now() };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function getSession(){ const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; }
export function clearSession(){ localStorage.removeItem(SESSION_KEY); }

async function fetchWith(path, opts = {}){
  const url = `${BASE}${path}`;
  const opt = Object.assign({ headers: {} }, opts);
  const session = getSession();
  if(session){
    if(session.token) opt.headers['Authorization'] = `Bearer ${session.token}`;
    if(session.client_id) opt.headers['x-client-id'] = session.client_id;
  }
  const res = await fetch(url, opt);
  if(!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchTree(session){
  return fetchWith('/mock/users');
}

export async function fetchUser(userId, session){
  return fetchWith(`/mock/users/${userId}`);
}

export async function getLevelStatus(session){
  return fetchWith('/mock/levels');
}

export function startAutoUpdates(onChange){
  const id = setInterval(async ()=>{
    try{
      const tree = await fetchTree(getSession());
      if(typeof onChange === 'function') onChange(tree);
    }catch(e){ /* ignore */ }
  }, 10000);
  return ()=>clearInterval(id);
}

// Minimal stubs to match mock API surface
export function createPaymentIntent(){ throw new Error('not implemented in realApi'); }
export function confirmPaymentIntent(){ throw new Error('not implemented in realApi'); }
export function updatePaymentStatus(){ throw new Error('not implemented in realApi'); }
export function fetchPayments(){ throw new Error('not implemented in realApi'); }
export function fetchAllUsers(){ return fetchTree(getSession()); }
export function searchUsers(){ throw new Error('not implemented in realApi'); }
export function getLevelStatusAdmin(){ return getLevelStatus(getSession()); }

// Expose for debugging
window.__mlm_realApi = { createSession, getSession, clearSession };
