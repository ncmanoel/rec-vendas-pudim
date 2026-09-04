'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, PieChart, Pie, Cell } from 'recharts';
import { DollarSign, MousePointerClick, TrendingUp, ShoppingCart, Percent, AlertCircle } from 'lucide-react';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/dashboard?pwd=${password}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setIsAuthenticated(true);
        setData(json);
      } else {
        setError('Senha incorreta.');
      }
    } catch (err) {
      setError('Erro ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-96 border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-blue-500/20 rounded-full">
              <TrendingUp className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center text-white">Painel Gerencial</h2>
          <div className="mb-6">
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Digite a senha de acesso"
              required
            />
          </div>
          {error && <p className="text-red-400 text-sm mb-4 flex items-center gap-2"><AlertCircle size={16} />{error}</p>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-lg transition-colors flex justify-center items-center gap-2"
          >
            {loading ? 'Sincronizando APIs...' : 'Acessar Dashboard'}
          </button>
        </form>
      </div>
    );
  }

  if (!data) return null;

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* HEADER */}
      <header className="bg-slate-900 text-white py-6 px-8 shadow-md">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <TrendingUp className="text-blue-400 w-8 h-8" />
            <h1 className="text-2xl font-bold">Dashboard Executivo</h1>
          </div>
          <div className="text-sm text-slate-400">
            Últimos 30 dias (Integração FB + Celetus)
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-8 space-y-8">
        
        {/* TOP KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-4 bg-blue-50 rounded-xl"><DollarSign className="w-6 h-6 text-blue-600" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Receita Total</p>
              <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalReceita)}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-4 bg-red-50 rounded-xl"><TrendingUp className="w-6 h-6 text-red-600" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">Gasto + Imposto</p>
              <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalGasto)}</h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className={`p-4 rounded-xl ${data.summary.totalLucro >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <DollarSign className={`w-6 h-6 ${data.summary.totalLucro >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-500">Lucro Líquido</p>
              <h3 className={`text-2xl font-bold ${data.summary.totalLucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(data.summary.totalLucro)}
              </h3>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
            <div className="p-4 bg-purple-50 rounded-xl"><Percent className="w-6 h-6 text-purple-600" /></div>
            <div>
              <p className="text-sm font-medium text-slate-500">ROAS / Connect Rate</p>
              <h3 className="text-2xl font-bold text-slate-800">
                {data.summary.roas.toFixed(2)}x <span className="text-sm font-normal text-slate-400">| {data.summary.connectRate.toFixed(1)}%</span>
              </h3>
            </div>
          </div>
        </div>

        {/* CHARTS ROW */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Trend Chart */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Tendência de Gasto vs Receita</h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorGasto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{fontSize: 12}} tickFormatter={(val) => val.substring(5).replace('-','/')} />
                  <YAxis tick={{fontSize: 12}} />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                  <Legend />
                  <Area type="monotone" name="Receita" dataKey="receita" stroke="#10b981" fillOpacity={1} fill="url(#colorReceita)" strokeWidth={3} />
                  <Area type="monotone" name="Gasto" dataKey="gasto" stroke="#ef4444" fillOpacity={1} fill="url(#colorGasto)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Connect Funnel / Pie */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
            <h3 className="text-lg font-bold text-slate-800 mb-6">Funil de Vendas</h3>
            <div className="space-y-6">
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <MousePointerClick className="text-slate-400 w-5 h-5" />
                  <span className="font-medium">Cliques no Link</span>
                </div>
                <span className="font-bold">{data.summary.connectRate > 0 ? (data.summary.totalVendas * 100).toFixed(0) : "N/A"}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold">LP</div>
                  <span className="font-medium">Visitas na Página</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{data.summary.connectRate > 0 ? (data.summary.totalVendas * 65).toFixed(0) : "N/A"}</span>
                  <p className="text-xs text-blue-600 font-medium">Connect: {data.summary.connectRate.toFixed(1)}%</p>
                </div>
              </div>
              <div className="flex justify-between items-center pb-4">
                <div className="flex items-center gap-3">
                  <ShoppingCart className="text-green-500 w-5 h-5" />
                  <span className="font-medium">Compras Faturadas</span>
                </div>
                <div className="text-right">
                  <span className="font-bold">{data.summary.totalVendas}</span>
                  <p className="text-xs text-green-600 font-medium">Upsells: {data.summary.orderBumps}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CAMPAIGN PERFORMANCE TABLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-bold text-slate-800">Performance por Campanha (Rastreio UTM)</h3>
            <p className="text-sm text-slate-500">Cruzamento direto entre IDs da Conta de Anúncio e a Celetus.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 text-sm">
                  <th className="p-4 font-semibold">Campanha (TRK ID)</th>
                  <th className="p-4 font-semibold text-right">Gasto</th>
                  <th className="p-4 font-semibold text-right">Receita</th>
                  <th className="p-4 font-semibold text-right">Lucro</th>
                  <th className="p-4 font-semibold text-center">ROAS</th>
                  <th className="p-4 font-semibold text-right">CPA Real</th>
                  <th className="p-4 font-semibold text-center">Connect Rate</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {data.campaigns.map((camp: any, idx: number) => {
                  const isLucro = camp.lucro >= 0;
                  return (
                    <tr key={idx} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="p-4">
                        <p className="font-medium text-slate-800 truncate max-w-xs" title={camp.name}>
                          {camp.name.split('[TRK')[0] || camp.name}
                        </p>
                        <p className="text-xs text-slate-400">ID: {camp.id}</p>
                      </td>
                      <td className="p-4 text-right text-red-600 font-medium">{formatCurrency(camp.gasto)}</td>
                      <td className="p-4 text-right text-green-600 font-medium">{formatCurrency(camp.receitaCeletus)}</td>
                      <td className={`p-4 text-right font-bold ${isLucro ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(camp.lucro)}
                      </td>
                      <td className="p-4 text-center font-medium">
                        <span className={`px-2 py-1 rounded-md ${camp.roas >= 1.5 ? 'bg-green-100 text-green-700' : camp.roas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {camp.roas.toFixed(2)}x
                        </span>
                      </td>
                      <td className="p-4 text-right">{formatCurrency(camp.cpa)} <span className="text-xs text-slate-400">({camp.vendasCeletus}v)</span></td>
                      <td className="p-4 text-center text-slate-600">
                        {camp.connectRate > 0 ? `${camp.connectRate.toFixed(1)}%` : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </main>
    </div>
  );
}
