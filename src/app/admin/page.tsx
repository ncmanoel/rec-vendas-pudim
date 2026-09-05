'use client';

import { useState, useEffect, Fragment } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { DollarSign, MousePointerClick, TrendingUp, ShoppingCart, Percent, AlertCircle, Calendar, LayoutDashboard, Megaphone, Table as TableIcon, PlusCircle, X, ChevronRight, ChevronDown, Activity, Users } from 'lucide-react';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('30'); 
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0];
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0]);

  // Drilldown states
  const [expandedCamps, setExpandedCamps] = useState<Record<string, boolean>>({});
  const [expandedSets, setExpandedSets] = useState<Record<string, boolean>>({});

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const getLocalNow = () => {
    const d = new Date(); d.setHours(d.getHours() - 3); return d.toISOString().slice(0, 16);
  };

  const [saleForm, setSaleForm] = useState({ date: getLocalNow(), product: 'Pudim sem Forno (Principal)', value: '10.00', phone: '' });

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...saleForm, password })
      });
      const json = await res.json();
      if (json.success) {
        setIsModalOpen(false);
        setSaleForm({ date: getLocalNow(), product: 'Pudim sem Forno (Principal)', value: '10.00', phone: '' });
        fetchData(period, password, customStart, customEnd);
      } else alert('Erro: ' + (json.error || 'Falha ao registrar venda'));
    } catch (err) { alert('Erro na requisição'); } finally { setIsSubmitting(false); }
  };

  const fetchData = async (days: string, pwd = password, start = customStart, end = customEnd) => {
    setLoading(true); setError('');
    try {
      let sinceStr = ''; let untilStr = '';
      if (days === 'custom') { sinceStr = start; untilStr = end; } 
      else {
        const today = new Date(); const past = new Date(); past.setDate(today.getDate() - parseInt(days));
        sinceStr = past.toISOString().split('T')[0]; untilStr = today.toISOString().split('T')[0];
      }
      const res = await fetch(`/api/dashboard?pwd=${pwd}&since=${sinceStr}&until=${untilStr}`);
      const json = await res.json();
      if (res.ok && json.success) { setIsAuthenticated(true); setData(json); } 
      else { setError('Senha incorreta.'); setIsAuthenticated(false); }
    } catch (err) { setError('Erro ao carregar os dados.'); } finally { setLoading(false); }
  };

  const handleLogin = (e: React.FormEvent) => { e.preventDefault(); fetchData(period, password); };
  const handlePeriodChange = (days: string) => { setPeriod(days); fetchData(days); };
  const toggleCamp = (id: string) => setExpandedCamps(prev => ({...prev, [id]: !prev[id]}));
  const toggleSet = (id: string) => setExpandedSets(prev => ({...prev, [id]: !prev[id]}));

  const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  const formatNum = (val: number) => new Intl.NumberFormat('pt-BR').format(val || 0);
  const formatDate = (isoStr: string) => {
    const d = new Date(isoStr); d.setHours(d.getHours() - 3);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <form onSubmit={handleLogin} className="bg-slate-800 p-8 rounded-2xl shadow-2xl w-96 border border-slate-700">
          <div className="flex justify-center mb-6">
            <div className="p-4 bg-indigo-500/20 rounded-full"><TrendingUp className="w-8 h-8 text-indigo-400" /></div>
          </div>
          <h2 className="text-2xl font-bold mb-6 text-center text-white">BI Supermago</h2>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full p-4 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none mb-6" placeholder="Senha" required />
          {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
          <button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-lg flex justify-center">{loading ? 'Carregando...' : 'Acessar'}</button>
        </form>
      </div>
    );
  }
  if (!data) return null;

  // Render Table Node (Recursive for Drilldown)
  const renderRow = (node: any, level: number, parentIds: string[]) => {
    const isCamp = level === 0;
    const isSet = level === 1;
    const isAd = level === 2;
    const paddingLeft = level * 30 + 16;
    const rowId = node.id;
    
    let isExpanded = false;
    let toggleFn = () => {};
    if (isCamp) { isExpanded = expandedCamps[rowId]; toggleFn = () => toggleCamp(rowId); }
    if (isSet) { isExpanded = expandedSets[rowId]; toggleFn = () => toggleSet(rowId); }

    const hasChildren = (isCamp && node.adsets?.length > 0) || (isSet && node.ads?.length > 0);

    return (
      <Fragment key={rowId}>
        <tr className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${level > 0 ? 'bg-slate-50/50' : 'bg-white'}`}>
          <td className="p-3" style={{ paddingLeft: `${paddingLeft}px` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button onClick={toggleFn} className="p-1 hover:bg-slate-200 rounded text-slate-500">
                  {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              ) : <div className="w-6" />}
              <div>
                <p className={`font-semibold text-slate-800 truncate ${isCamp ? 'max-w-[200px]' : 'max-w-[180px]'}`} title={node.name}>{node.name.split('[TRK')[0]}</p>
                <p className="text-[10px] font-mono text-slate-400">ID: {node.id}</p>
              </div>
            </div>
          </td>
          <td className="p-3 text-right text-slate-700 font-medium">{formatCurrency(node.gasto)}</td>
          <td className="p-3 text-right text-slate-500 text-xs">
            R$ {node.cpm.toFixed(2)}<br/>
            <span className="text-slate-400">{node.ctr.toFixed(2)}%</span>
          </td>
          <td className="p-3 text-right text-slate-500 text-xs">
            {formatNum(node.uniqueClicks)}<br/>
            <span className="text-slate-400">R$ {node.cpc.toFixed(2)}</span>
          </td>
          <td className="p-3 text-right text-slate-700 font-medium">
            {formatNum(node.pv)}<br/>
            <span className="text-[10px] text-blue-500 font-bold bg-blue-50 px-1.5 py-0.5 rounded">{node.connectRate.toFixed(1)}%</span>
          </td>
          <td className="p-3 text-right text-slate-700 font-medium">
            {formatNum(node.ic)}<br/>
            <span className="text-[10px] text-orange-500 font-bold bg-orange-50 px-1.5 py-0.5 rounded">{node.icRate.toFixed(1)}%</span>
          </td>
          <td className="p-3 text-right">
            <span className="font-bold text-slate-800">{node.vendasCel}</span>
            <span className="text-[10px] text-green-500 font-bold block">{node.checkoutConv.toFixed(1)}%</span>
          </td>
          <td className="p-3 text-right text-green-600 font-bold">{formatCurrency(node.receitaCel)}</td>
          <td className="p-3 text-center">
            <span className={`px-2 py-1 rounded-full text-xs font-bold ${node.roas >= 1.5 ? 'bg-green-100 text-green-700' : node.roas >= 1 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
              {node.roas.toFixed(2)}x
            </span>
          </td>
        </tr>
        {isExpanded && isCamp && node.adsets?.map((set: any) => renderRow(set, 1, [rowId]))}
        {isExpanded && isSet && node.ads?.map((ad: any) => renderRow(ad, 2, [...parentIds, rowId]))}
      </Fragment>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className="w-full md:w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-slate-800">
          <Activity className="text-indigo-400 w-8 h-8" />
          <h1 className="text-xl font-bold text-white tracking-tight">BI Analytics</h1>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button onClick={() => setActiveTab('overview')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'overview' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
            <LayoutDashboard className="w-5 h-5" /> Visão Geral
          </button>
          <button onClick={() => setActiveTab('campaigns')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'campaigns' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
            <Megaphone className="w-5 h-5" /> Tráfego (Drill-down)
          </button>
          <button onClick={() => setActiveTab('raw')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'raw' ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>
            <TableIcon className="w-5 h-5" /> Vendas Brutas
          </button>
        </nav>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* HEADER / FILTERS */}
        <header className="bg-white border-b border-slate-200 px-8 py-4 flex flex-col xl:flex-row justify-between items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">
              {activeTab === 'overview' && 'Visão Geral Executiva'}
              {activeTab === 'campaigns' && 'Otimização de Tráfego Avançada'}
              {activeTab === 'raw' && 'Histórico de Vendas (Bruto)'}
            </h2>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg font-bold shadow-sm">
              <PlusCircle className="w-4 h-4" /> Venda Pix
            </button>
            <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <Calendar className="w-4 h-4 text-slate-400 mx-2" />
              {['3','7','30'].map(d => (
                <button key={d} onClick={() => handlePeriodChange(d)} className={`px-3 py-1.5 text-sm font-medium rounded-md ${period === d ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>{d} Dias</button>
              ))}
              <button onClick={() => setPeriod('custom')} className={`px-3 py-1.5 text-sm font-medium rounded-md ${period === 'custom' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-600 hover:text-slate-900'}`}>Personalizado</button>
            </div>
            
            {period === 'custom' && (
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-slate-200 shadow-sm">
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-transparent outline-none"/>
                <span className="text-slate-400 text-sm">até</span>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="px-2 py-1.5 text-sm font-medium text-slate-700 bg-transparent outline-none"/>
                <button onClick={() => fetchData('custom', password, customStart, customEnd)} className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-bold rounded-md ml-1">Aplicar</button>
              </div>
            )}
          </div>
        </header>

        {loading ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>
        ) : (
          <>
            {activeTab === 'overview' && (
              <div className="p-8 overflow-y-auto space-y-8">
                
                {/* WHASTAPP RECOVERY CARD (NEW) */}
                <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-4">
                    <div className="p-4 bg-green-500/20 rounded-xl"><Users className="w-8 h-8 text-green-400" /></div>
                    <div>
                      <h3 className="text-xl font-bold">Vazamento de Caixa (WhatsApp)</h3>
                      <p className="text-slate-300 text-sm">O robô está recuperando {data.recoveryStats.recoveryRate.toFixed(1)}% dos abandonos de carrinho.</p>
                    </div>
                  </div>
                  <div className="flex gap-8">
                    <div className="text-center">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Abandonos Totais</p>
                      <p className="text-2xl font-bold">{data.recoveryStats.totalLeads}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Vendas Recuperadas</p>
                      <p className="text-2xl font-bold text-green-400">{data.recoveryStats.recoveredCount}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Receita Salva</p>
                      <p className="text-2xl font-bold text-green-400">{formatCurrency(data.recoveryStats.recoveredRevenue)}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Revenue */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Receita Líquida</p>
                    <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalReceita)}</h3>
                  </div>
                  {/* Spend */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Gasto Ads (+13%)</p>
                    <h3 className="text-2xl font-bold text-slate-800">{formatCurrency(data.summary.totalGasto)}</h3>
                  </div>
                  {/* Profit */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">Lucro Líquido</p>
                    <h3 className={`text-2xl font-bold ${data.summary.totalLucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(data.summary.totalLucro)}
                    </h3>
                  </div>
                  {/* ROAS */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                    <p className="text-sm font-medium text-slate-500 mb-1">ROAS Global</p>
                    <h3 className="text-2xl font-bold text-slate-800">{data.summary.roas.toFixed(2)}x</h3>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                  <h3 className="text-lg font-bold text-slate-800 mb-6">Receita vs Gasto (Evolução)</h3>
                  <div className="h-80 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="colorGasto" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
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
              </div>
            )}

            {activeTab === 'campaigns' && (
              <div className="p-8 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-900 text-white text-xs uppercase tracking-wider">
                          <th className="p-4 font-bold">Nível / Nome</th>
                          <th className="p-4 font-bold text-right">Gasto</th>
                          <th className="p-4 font-bold text-right">CPM / CTR</th>
                          <th className="p-4 font-bold text-right">Cliques / CPC</th>
                          <th className="p-4 font-bold text-right">PV / Connect</th>
                          <th className="p-4 font-bold text-right">IC / Conv. IC</th>
                          <th className="p-4 font-bold text-right">Vendas / Tx.</th>
                          <th className="p-4 font-bold text-right">Receita Total</th>
                          <th className="p-4 font-bold text-center">ROAS</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        {data.campaigns.map((camp: any) => renderRow(camp, 0, []))}
                        {data.campaigns.length === 0 && (
                          <tr><td colSpan={9} className="text-center p-8 text-slate-500">Nenhum dado encontrado para o período.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'raw' && (
              <div className="p-8 overflow-y-auto">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-900 text-white text-sm">
                        <th className="p-4 font-semibold">Data da Venda (Local)</th>
                        <th className="p-4 font-semibold">Produto</th>
                        <th className="p-4 font-semibold">Telefone</th>
                        <th className="p-4 font-semibold">Origem (UTM)</th>
                        <th className="p-4 font-semibold text-right">Líquido (R$)</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {data.rawSales?.map((venda: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4 font-medium text-slate-700">{formatDate(venda.data_venda)}</td>
                          <td className="p-4 text-slate-600">{venda.nome_produto}</td>
                          <td className="p-4 font-mono text-slate-500">+{venda.telefone}</td>
                          <td className="p-4 text-slate-500 text-xs">{venda.utm_campaign || 'Orgânico'}</td>
                          <td className="p-4 text-right font-bold text-green-600">{formatCurrency(venda.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}

        {/* Modal Manual */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-600" />Registrar Venda Pix</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <form onSubmit={submitManualSale} className="p-6 space-y-4">
                <div><label className="block text-sm font-medium mb-1">Data e Hora</label><input type="datetime-local" value={saleForm.date} onChange={(e) => setSaleForm({...saleForm, date: e.target.value})} className="w-full p-2.5 border rounded-lg" required /></div>
                <div>
                  <label className="block text-sm font-medium mb-1">Produto</label>
                  <select value={saleForm.product} onChange={handleProductSelect} className="w-full p-2.5 border rounded-lg">
                    <option value="Pudim sem Forno (Principal)">Pudim sem Forno (Principal)</option><option value="Pack Lucratividade (Upsell)">Pack Lucratividade (Upsell)</option><option value="Combo: Pudim + Pack">Combo: Pudim + Pack</option><option value="Outro">Outro (Informar valor livre)</option>
                  </select>
                </div>
                <div><label className="block text-sm font-medium mb-1">Valor Líquido (R$)</label><input type="number" step="0.01" value={saleForm.value} onChange={(e) => setSaleForm({...saleForm, value: e.target.value})} className="w-full p-2.5 border rounded-lg" required /></div>
                <div><label className="block text-sm font-medium mb-1">Telefone (Formato Whatsapp com DDI)</label><input type="text" placeholder="5511999999999" value={saleForm.phone} onChange={(e) => setSaleForm({...saleForm, phone: e.target.value})} className="w-full p-2.5 border rounded-lg" /></div>
                <div className="pt-4 flex gap-3"><button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 border rounded-lg">Cancelar</button><button type="submit" disabled={isSubmitting} className="flex-1 bg-green-600 text-white rounded-lg py-2.5 font-bold">Salvar Venda</button></div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
