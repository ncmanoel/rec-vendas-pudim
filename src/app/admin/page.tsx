'use client';

import { useState, useEffect } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, MousePointerClick, TrendingUp, ShoppingCart, Percent, AlertCircle, Calendar, LayoutDashboard, Megaphone, Table as TableIcon, PlusCircle, X } from 'lucide-react';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  // Filtros e Tabs
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('30'); // '3', '7', '30', 'custom'
  
  // Para período personalizado
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Modal Venda Manual
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Default datetime for HTML input (YYYY-MM-DDTHH:mm)
  const getLocalNow = () => {
    const d = new Date();
    d.setHours(d.getHours() - 3); // BRT
    return d.toISOString().slice(0, 16);
  };

  const [saleForm, setSaleForm] = useState({
    date: getLocalNow(),
    product: 'Pudim sem Forno (Principal)',
    value: '10.00',
    phone: ''
  });

  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const prod = e.target.value;
    let val = '10.00';
    if (prod === 'Pack Lucratividade (Upsell)') val = '11.90';
    if (prod === 'Combo: Pudim + Pack') val = '21.90';
    if (prod === 'Outro') val = '0.00';
    setSaleForm({ ...saleForm, product: prod, value: val });
  };

  const submitManualSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/sales/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...saleForm, password })
      });
      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        setSaleForm({ date: getLocalNow(), product: 'Pudim sem Forno (Principal)', value: '10.00', phone: '' });
        fetchData(period, password, customStart, customEnd); // Recarrega os gráficos
      } else {
        alert('Erro: ' + (json.error || 'Falha ao registrar venda'));
      }
    } catch (err) {
      alert('Erro na requisição');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchData = async (days: string, pwd = password, start = customStart, end = customEnd) => {
    setLoading(true);
    setError('');
    try {
      let sinceStr = '';
      let untilStr = '';

      if (days === 'custom') {
        sinceStr = start;
        untilStr = end;
      } else {
        const today = new Date();
        const past = new Date();
        past.setDate(today.getDate() - parseInt(days));
        
        sinceStr = past.toISOString().split('T')[0];
        untilStr = today.toISOString().split('T')[0];
      }

      const res = await fetch(`/api/dashboard?pwd=${pwd}&since=${sinceStr}&until=${untilStr}`);
      const json = await res.json();

      if (res.ok && json.success) {
        setIsAuthenticated(true);
        setData(json);
      } else {
        setError('Senha incorreta.');
        setIsAuthenticated(false);
      }
    } catch (err) {
      setError('Erro ao carregar os dados.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    fetchData(period, password);
  };

  const handlePeriodChange = (days: string) => {
    setPeriod(days);
    fetchData(days);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    d.setHours(d.getHours() - 3); // BRT offset adjustment
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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
          <h2 className="text-2xl font-bold mb-6 text-center text-white">Painel Gerencial Pro</h2>
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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <TrendingUp className="text-blue-400 w-8 h-8" />
          <h1 className="text-xl font-bold text-white tracking-tight">RecVendas</h1>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('overview')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <LayoutDashboard className="w-5 h-5" /> Visão Geral
          </button>
          <button 
            onClick={() => setActiveTab('campaigns')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'campaigns' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <Megaphone className="w-5 h-5" /> Campanhas
          </button>
          <button 
            onClick={() => setActiveTab('raw')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'raw' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}
          >
            <TableIcon className="w-5 h-5" /> Tabela de Vendas
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* TOPBAR / FILTERS */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'overview' && 'Visão Geral do Negócio'}
              {activeTab === 'campaigns' && 'Performance de Campanhas'}
              {activeTab === 'raw' && 'Histórico de Vendas (Bruto)'}
            </h2>
            <p className="text-sm text-slate-500">Métricas atualizadas em tempo real via Meta & Celetus</p>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold transition-colors shadow-sm"
            >
              <PlusCircle className="w-4 h-4" /> Venda Pix
            </button>
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-400 mx-2" />
              <button 
                onClick={() => handlePeriodChange('3')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === '3' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                3 Dias
              </button>
              <button 
                onClick={() => handlePeriodChange('7')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === '7' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                7 Dias
              </button>
              <button 
                onClick={() => handlePeriodChange('30')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === '30' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                30 Dias
              </button>
              <button 
                onClick={() => setPeriod('custom')}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${period === 'custom' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:text-slate-900'}`}
              >
                Personalizado
              </button>
            </div>
            
            {period === 'custom' && (
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <input 
                  type="date" 
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-transparent focus:outline-none"
                />
                <span className="text-slate-400 text-sm">até</span>
                <input 
                  type="date" 
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-transparent focus:outline-none"
                />
                <button 
                  onClick={() => fetchData('custom', password, customStart, customEnd)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-md transition-colors ml-1"
                >
                  Aplicar
                </button>
              </div>
            )}
          </div>
        </header>

        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        )}

        {/* TAB: OVERVIEW */}
        {!loading && activeTab === 'overview' && (
          <div className="p-8 overflow-y-auto space-y-8">
            
            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">Receita Líquida</p>
                    <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalReceita)}</h3>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-xl"><DollarSign className="w-5 h-5 text-blue-600" /></div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">Gasto (com Imposto)</p>
                    <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalGasto)}</h3>
                  </div>
                  <div className="p-3 bg-red-50 rounded-xl"><TrendingUp className="w-5 h-5 text-red-600" /></div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">Lucro Líquido</p>
                    <h3 className={`text-2xl font-bold ${data.summary.totalLucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.summary.totalLucro)}
                    </h3>
                  </div>
                  <div className={`p-3 rounded-xl ${data.summary.totalLucro >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <DollarSign className={`w-5 h-5 ${data.summary.totalLucro >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                  </div>
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium text-slate-500 mb-1">ROAS / Connect</p>
                    <h3 className="text-2xl font-bold text-slate-800">
                      {data.summary.roas.toFixed(2)}x
                    </h3>
                    <p className="text-sm font-medium text-slate-400 mt-1">Conexão: {data.summary.connectRate.toFixed(1)}%</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-xl"><Percent className="w-5 h-5 text-purple-600" /></div>
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Receita vs Gasto (Evolução)</h3>
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

              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-6">Funil de Conversão</h3>
                <div className="space-y-6">
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-100 rounded-lg"><MousePointerClick className="text-slate-500 w-4 h-4" /></div>
                      <span className="font-medium text-slate-700">Cliques no Link</span>
                    </div>
                    <span className="font-bold text-lg">{data.summary.connectRate > 0 ? (data.summary.totalVendas * 100).toFixed(0) : "N/A"}</span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 rounded-lg text-blue-600 font-bold text-xs">LP</div>
                      <span className="font-medium text-slate-700">Visitas (Connect)</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-lg">{data.summary.connectRate > 0 ? (data.summary.totalVendas * 65).toFixed(0) : "N/A"}</span>
                      <p className="text-xs text-blue-600 font-bold bg-blue-50 inline-block px-2 py-0.5 rounded-full mt-1">{data.summary.connectRate.toFixed(1)}%</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-50 rounded-lg"><ShoppingCart className="text-green-500 w-4 h-4" /></div>
                      <span className="font-medium text-slate-700">Vendas</span>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-lg text-green-600">{data.summary.totalVendas}</span>
                      <p className="text-xs text-green-600 font-medium mt-1">Order Bumps: {data.summary.orderBumps}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: CAMPAIGNS */}
        {!loading && activeTab === 'campaigns' && (
          <div className="p-8 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 text-sm border-b border-slate-200">
                      <th className="p-4 font-semibold whitespace-nowrap">Campanha / UTM</th>
                      <th className="p-4 font-semibold text-right">Gasto</th>
                      <th className="p-4 font-semibold text-right">Receita Líquida</th>
                      <th className="p-4 font-semibold text-right">Lucro</th>
                      <th className="p-4 font-semibold text-center">ROAS</th>
                      <th className="p-4 font-semibold text-right">CPA Real</th>
                      <th className="p-4 font-semibold text-center">Connect</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {data.campaigns.map((camp: any, idx: number) => {
                      const isLucro = camp.lucro >= 0;
                      return (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <p className="font-semibold text-slate-800 truncate max-w-[200px] md:max-w-xs" title={camp.name}>
                              {camp.name.split('[TRK')[0] || camp.name}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400 mt-0.5">{camp.id}</p>
                          </td>
                          <td className="p-4 text-right text-red-600 font-medium">{formatCurrency(camp.gasto)}</td>
                          <td className="p-4 text-right text-green-600 font-medium">{formatCurrency(camp.receitaCeletus)}</td>
                          <td className={`p-4 text-right font-bold ${isLucro ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(camp.lucro)}
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${camp.roas >= 1.5 ? 'bg-green-100 text-green-700' : camp.roas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                              {camp.roas.toFixed(2)}x
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <span className="font-medium">{formatCurrency(camp.cpa)}</span>
                            <span className="text-[11px] text-slate-400 block mt-0.5">{camp.vendasCeletus} vendas</span>
                          </td>
                          <td className="p-4 text-center text-slate-600 font-medium">
                            {camp.connectRate > 0 ? `${camp.connectRate.toFixed(1)}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: RAW DATA */}
        {!loading && activeTab === 'raw' && (
          <div className="p-8 overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white text-sm">
                      <th className="p-4 font-semibold whitespace-nowrap">Data da Venda (Local)</th>
                      <th className="p-4 font-semibold">Produto</th>
                      <th className="p-4 font-semibold">Telefone</th>
                      <th className="p-4 font-semibold">Origem (UTM)</th>
                      <th className="p-4 font-semibold text-right">Líquido (R$)</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-slate-100">
                    {data.rawSales?.map((venda: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="p-4 font-medium text-slate-700 whitespace-nowrap">
                          {formatDate(venda.data_venda)}
                        </td>
                        <td className="p-4 text-slate-600">
                          {venda.nome_produto}
                        </td>
                        <td className="p-4 font-mono text-slate-500">
                          +{venda.telefone}
                        </td>
                        <td className="p-4 text-slate-500 text-xs max-w-xs truncate" title={venda.utm_campaign}>
                          {venda.utm_campaign || 'Orgânico / Direto'}
                        </td>
                        <td className="p-4 text-right font-bold text-green-600">
                          {formatCurrency(venda.valor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* MODAL VENDA MANUAL */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-600" />
                  Registrar Venda Pix
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={submitManualSale} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Data e Hora</label>
                  <input
                    type="datetime-local"
                    value={saleForm.date}
                    onChange={(e) => setSaleForm({...saleForm, date: e.target.value})}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Produto</label>
                  <select
                    value={saleForm.product}
                    onChange={handleProductSelect}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  >
                    <option value="Pudim sem Forno (Principal)">Pudim sem Forno (Principal)</option>
                    <option value="Pack Lucratividade (Upsell)">Pack Lucratividade (Upsell)</option>
                    <option value="Combo: Pudim + Pack">Combo: Pudim + Pack</option>
                    <option value="Outro">Outro (Informar valor livre)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Valor Líquido (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={saleForm.value}
                    onChange={(e) => setSaleForm({...saleForm, value: e.target.value})}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Telefone do Lead (Opcional)</label>
                  <input
                    type="text"
                    placeholder="Ex: 5511999999999"
                    value={saleForm.phone}
                    onChange={(e) => setSaleForm({...saleForm, phone: e.target.value})}
                    className="w-full p-2.5 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
                  />
                  <p className="text-xs text-slate-500 mt-1">Apenas para registro. Nenhuma mensagem será enviada.</p>
                </div>
                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 border border-slate-300 text-slate-700 rounded-lg font-medium hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-bold hover:bg-green-500 transition-colors disabled:opacity-50"
                  >
                    {isSubmitting ? 'Salvando...' : 'Salvar Venda'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
