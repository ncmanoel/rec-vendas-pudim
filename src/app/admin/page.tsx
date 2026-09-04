'use client';

import { useState, useEffect } from 'react';

export default function AdminDashboard() {
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/dashboard?pwd=${password}`);
      const json = await res.json();

      if (res.ok) {
        setIsAuthenticated(true);
        setData(json.data);
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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-96">
          <h2 className="text-2xl font-bold mb-6 text-center text-gray-800">Painel Financeiro</h2>
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">Senha de Acesso</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border rounded text-black"
              placeholder="Digite a senha"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded"
          >
            {loading ? 'Entrando...' : 'Acessar Dashboard'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Apuração Diária (Meta Ads + Celetus)</h1>
        
        <div className="bg-white shadow-md rounded overflow-x-auto">
          <table className="min-w-full leading-normal">
            <thead>
              <tr>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Data
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Gasto (c/ Imposto)
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Receita
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Lucro Bruto
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Vendas
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  CPA
                </th>
                <th className="px-5 py-3 border-b-2 border-gray-200 bg-gray-100 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  ROAS
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const isLucro = row.lucro >= 0;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-gray-900 font-medium">
                      {row.date.split('-').reverse().join('/')}
                    </td>
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-red-600 font-medium">
                      {formatCurrency(row.gasto)}
                    </td>
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-green-600 font-medium">
                      {formatCurrency(row.receita)}
                    </td>
                    <td className={`px-5 py-4 border-b border-gray-200 bg-white text-sm font-bold ${isLucro ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(row.lucro)}
                    </td>
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-gray-900">
                      {row.vendas} (OB: {row.orderBumps})
                    </td>
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-gray-900">
                      {formatCurrency(row.cpa)}
                    </td>
                    <td className="px-5 py-4 border-b border-gray-200 bg-white text-sm text-gray-900">
                      {row.roi.toFixed(2)}x
                    </td>
                  </tr>
                );
              })}
              {data.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-gray-500">
                    Nenhum dado encontrado para os últimos 30 dias.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
