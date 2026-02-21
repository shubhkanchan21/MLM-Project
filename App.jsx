import { useState, useEffect } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";
import Layout from "./components/Layout.jsx";

const API_BASE = "http://localhost:3000";
const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!localStorage.getItem("token"));
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState(0);
  const [amount, setAmount] = useState("");
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [orderResult, setOrderResult] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Initialize User and Data on Login
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const decoded = jwtDecode(token);
        setUser(decoded);
        loadWallet();
      } catch (e) {
        handleLogout();
      }
    }
  }, [loggedIn]);

  async function loadWallet() {
    setLoadingWallet(true);
    try {
      const res = await api.get("/wallet");
      // Standardizing balance extraction
      const val = res.data?.balance ?? res.data ?? 0;
      setBalance(Number(val));
    } catch (err) {
      console.error("Wallet error", err);
    } finally {
      setLoadingWallet(false);
    }
  }

  async function handleLogin(e) {
    e.preventDefault();
    try {
      const res = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", res.data.token);
      setLoggedIn(true);
    } catch (err) {
      alert("Login failed: " + (err.response?.data?.error || "Invalid credentials"));
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setLoggedIn(false);
    setUser(null);
    setBalance(0);
  }

  async function createOrder(e) {
    e.preventDefault();
    if (!amount || amount <= 0) return alert("Please enter a valid amount");
    
    try {
      const res = await api.post("/orders", {
        user_id: user?.sub,
        total_amount: Number(amount),
      });
      setOrderResult(res.data.order_id);
      setAmount("");
      loadWallet(); // Refresh balance after order
    } catch (err) {
      alert("Order failed: " + (err.response?.data?.error || "Check server connection"));
    }
  }

  /* ---------- Login View ---------- */
  if (!loggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <form onSubmit={handleLogin} className="bg-white p-10 rounded-2xl shadow-xl w-full max-w-md border border-slate-200">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-extrabold text-slate-900">Welcome Back</h2>
            <p className="text-slate-500 mt-2">Sign in to manage your MLM network</p>
          </div>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <input 
                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" 
                placeholder="name@company.com" 
                type="email"
                onChange={e => setEmail(e.target.value)} 
                required
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Password</label>
              <input 
                className="w-full p-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition" 
                type="password" 
                placeholder="••••••••" 
                onChange={e => setPassword(e.target.value)} 
                required
              />
            </div>
            <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-200 transition-all active:scale-95">
              Sign In
            </button>
          </div>
        </form>
      </div>
    );
  }

  /* ---------- Authenticated Dashboard View ---------- */
  return (
    <Layout 
      user={user} 
      balance={balance} 
      loadingWallet={loadingWallet} 
      onRefreshWallet={loadWallet} 
      onLogout={handleLogout}
    >
      <div className="space-y-6">
        {/* Main Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-800">Overview</h2>
          <div className="text-sm text-slate-500 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-100">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Balance Hero Card */}
          <div className="lg:col-span-2 bg-gradient-to-r from-blue-700 to-indigo-800 p-8 rounded-3xl text-white shadow-xl flex flex-col justify-between min-h-[200px]">
            <div>
              <p className="text-blue-100 text-sm font-medium uppercase tracking-wider">Available Payout</p>
              <h3 className="text-5xl font-bold mt-2">${Number(balance).toFixed(2)}</h3>
            </div>
            <div className="flex items-center gap-2 text-blue-100 text-sm mt-4">
              <span className="h-2 w-2 bg-green-400 rounded-full animate-pulse"></span>
              Live Account Status: Active
            </div>
          </div>

          {/* New Order Component */}
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100 flex flex-col justify-center">
            <h3 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-green-100 text-green-600 p-1.5 rounded-lg text-sm">✚</span>
              Create New Order
            </h3>
            <div className="space-y-4">
              <div className="relative">
                <span className="absolute left-4 top-3 text-slate-400 font-medium">$</span>
                <input 
                  type="number" 
                  className="w-full pl-8 p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-green-500 outline-none transition" 
                  placeholder="0.00"
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                />
              </div>
              <button 
                onClick={createOrder} 
                className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-xl font-bold transition shadow-lg shadow-slate-200"
              >
                Submit Order
              </button>
            </div>
            {orderResult && (
              <div className="mt-4 p-3 bg-green-50 border border-green-100 rounded-lg text-xs text-green-700 text-center animate-bounce">
                Order Processed! ID: {orderResult}
              </div>
            )}
          </div>
        </div>

        {/* Informative Grid for Senior Demo */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard title="Direct Referrals" value="12" icon="👥" color="blue" />
          <StatsCard title="Total Commissions" value={`$${(balance * 1.5).toFixed(2)}`} icon="📈" color="green" />
          <StatsCard title="Active Level" value={user?.role === 'admin' ? 'Master' : 'Lvl 3'} icon="🛡️" color="purple" />
          <StatsCard title="Network Size" value="142" icon="🕸️" color="orange" />
        </div>
      </div>
    </Layout>
  );
}

// Simple internal component for UI polish
function StatsCard({ title, value, icon, color }) {
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition cursor-default">
      <div className="flex items-center gap-4">
        <div className={`h-12 w-12 rounded-xl flex items-center justify-center text-xl bg-${color}-50 text-${color}-600`}>
          {icon}
        </div>
        <div>
          <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">{title}</p>
          <p className="text-xl font-bold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  );
}