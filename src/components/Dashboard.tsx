import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Package, Clock, CheckCircle2, Users } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

interface DashboardStats {
  abertas: number;
  finalizadas: number;
  totalProdutos: number;
  totalRespostas: number;
}

interface DashboardProps {
  onNavigate: (view: 'importar' | 'carregar' | 'finalizadas') => void;
}

const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({ abertas: 0, finalizadas: 0, totalProdutos: 0, totalRespostas: 0 });
  const [recentes, setRecentes] = useState<{ id: string; nome: string; status: string; created_at: string; produtos: any[] }[]>([]);
  const [respostasPorLista, setRespostasPorLista] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    const [listasRes, respostasRes] = await Promise.all([
      supabase.from('listas').select('id, nome, status, created_at, produtos').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('respostas').select('id, lista_id').eq('user_id', user.id),
    ]);

    const listas = (listasRes.data ?? []) as any[];

    const porLista: Record<string, number> = {};
    ((respostasRes.data ?? []) as any[]).forEach(r => {
      if (r.lista_id) porLista[r.lista_id] = (porLista[r.lista_id] || 0) + 1;
    });
    setRespostasPorLista(porLista);

    const abertas = listas.filter(l => l.status === 'aberta').length;
    const finalizadas = listas.filter(l => l.status === 'finalizada').length;

    setStats({
      abertas,
      finalizadas,
      totalProdutos: listas.reduce((sum, l) => sum + (Array.isArray(l.produtos) ? l.produtos.length : 0), 0),
      totalRespostas: (respostasRes.data ?? []).length,
    });
    setRecentes(listas);
    setLoading(false);
  };

  // Cotações criadas por mês (últimos 6 meses)
  const dadosMensais = useMemo(() => {
    const meses: { key: string; label: string; abertas: number; finalizadas: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      meses.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        abertas: 0,
        finalizadas: 0,
      });
    }
    const mapa = new Map(meses.map(m => [m.key, m]));
    recentes.forEach(l => {
      const d = new Date(l.created_at);
      const m = mapa.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (m) {
        if (l.status === 'finalizada') m.finalizadas += 1;
        else m.abertas += 1;
      }
    });
    return meses;
  }, [recentes]);

  const dadosStatus = useMemo(() => ([
    { name: 'Em Aberto', value: stats.abertas, color: '#2563eb' },
    { name: 'Finalizadas', value: stats.finalizadas, color: '#059669' },
  ]), [stats]);

  const dadosRespostas = useMemo(() =>
    recentes.slice(0, 8).reverse().map(l => ({
      nome: l.nome.length > 18 ? l.nome.slice(0, 18) + '…' : l.nome,
      respostas: respostasPorLista[l.id] || 0,
    })), [recentes, respostasPorLista]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground text-sm">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-8 bg-[#F8FAFC]">
      {/* Stats Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight mb-1">Painel de Cotações</h1>
        <p className="text-sm text-slate-500">Bem-vindo de volta ao seu centro de operações.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <button onClick={() => onNavigate('carregar')} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all text-left group">
          <div className="bg-blue-50 w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Clock className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.abertas}</p>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Em Aberto</p>
        </button>

        <button onClick={() => onNavigate('finalizadas')} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all text-left group">
          <div className="bg-emerald-50 w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.finalizadas}</p>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Finalizadas</p>
        </button>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
          <div className="bg-slate-100 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
            <Package className="w-5 h-5 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.totalProdutos}</p>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Produtos</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm text-left">
          <div className="bg-slate-100 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
            <Users className="w-5 h-5 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{stats.totalRespostas}</p>
          <p className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Respostas</p>
        </div>
      </div>

      {/* Recentes */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-4 flex items-center justify-between">
          <span>Últimas Cotações</span>
          <button onClick={() => onNavigate('importar')} className="text-[10px] text-blue-600 hover:text-blue-700 uppercase font-black tracking-widest underline">
            + Nova Cotação
          </button>
        </h2>
        {recentes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 border-dashed p-12 text-center">
            <p className="text-slate-400 text-sm">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentes.slice(0, 5).map(lista => (
              <div key={lista.id} className="bg-white p-4 rounded-xl border border-slate-200 flex items-center justify-between group hover:border-blue-200 transition-all">
                <div>
                  <h3 className="font-bold text-slate-900 text-sm group-hover:text-blue-600">{lista.nome}</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 uppercase font-bold tracking-wider">
                    {new Date(lista.created_at).toLocaleDateString('pt-BR')} • {lista.produtos.length} PRODUTOS
                  </p>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${
                  lista.status === 'finalizada' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {lista.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
