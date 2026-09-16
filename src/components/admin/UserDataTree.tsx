import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText, Loader2 } from 'lucide-react';

interface Props {
  userId: string;
  nome: string;
  email: string;
}

type NodeKey = 'cotacoes' | 'fornecedores' | 'links' | 'respostas' | 'chaves' | 'chat';

const LABELS: Record<NodeKey, string> = {
  cotacoes: 'Cotações',
  fornecedores: 'Fornecedores',
  links: 'Links gerados',
  respostas: 'Respostas recebidas',
  chaves: 'Chaves de acesso',
  chat: 'Conversas do assistente',
};

const TABLES: Record<NodeKey, { table: string; select: string; label: (r: any) => string; detail: (r: any) => string }> = {
  cotacoes: {
    table: 'listas',
    select: 'id,nome,status,created_at,prazo,produtos',
    label: r => r.nome,
    detail: r => `${r.status} • ${Array.isArray(r.produtos) ? r.produtos.length : 0} itens • ${new Date(r.created_at).toLocaleDateString('pt-BR')}`,
  },
  fornecedores: {
    table: 'fornecedores',
    select: 'id,nome,whatsapp,codigo_estado,created_at',
    label: r => r.nome,
    detail: r => [r.codigo_estado, r.whatsapp].filter(Boolean).join(' • '),
  },
  links: {
    table: 'links_cotacao',
    select: 'id,empresa,estados,respondido,created_at',
    label: r => r.empresa,
    detail: r => `${r.estados} • ${r.respondido ? 'respondido' : 'pendente'} • ${new Date(r.created_at).toLocaleDateString('pt-BR')}`,
  },
  respostas: {
    table: 'respostas',
    select: 'id,empresa,created_at,resposta',
    label: r => r.empresa,
    detail: r => `${Array.isArray(r.resposta) ? r.resposta.length : 0} itens • ${new Date(r.created_at).toLocaleString('pt-BR')}`,
  },
  chaves: {
    table: 'access_keys',
    select: 'id,chave,tipo,status,expires_at',
    label: r => r.chave,
    detail: r => `${r.tipo} • ${r.status}${r.expires_at ? ' • até ' + new Date(r.expires_at).toLocaleDateString('pt-BR') : ''}`,
  },
  chat: {
    table: 'chat_messages',
    select: 'id,role,content,created_at',
    label: r => (r.role === 'user' ? 'Você' : 'Assistente'),
    detail: r => String(r.content ?? '').slice(0, 120),
  },
};

const Branch: React.FC<{ userId: string; nodeKey: NodeKey }> = ({ userId, nodeKey }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && rows === null) {
      setLoading(true);
      const cfg = TABLES[nodeKey];
      const { data } = await supabase
        .from(cfg.table as any)
        .select(cfg.select)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(200);
      setRows((data as any[]) ?? []);
      setLoading(false);
    }
  };

  const cfg = TABLES[nodeKey];

  return (
    <div className="pl-2">
      <button
        onClick={toggle}
        className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-slate-50 text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
        {open ? <FolderOpen className="w-4 h-4 text-primary" /> : <Folder className="w-4 h-4 text-slate-400" />}
        <span className="text-sm font-bold text-slate-700">{LABELS[nodeKey]}</span>
        {rows && <span className="text-[11px] text-slate-400 font-bold">({rows.length})</span>}
        {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
      </button>
      {open && rows && (
        <div className="ml-6 border-l border-slate-200 pl-3 py-1 space-y-0.5">
          {rows.length === 0 && <p className="text-xs text-slate-400 py-1">Nenhum registro.</p>}
          {rows.map(r => (
            <div key={r.id} className="flex items-start gap-2 py-1">
              <FileText className="w-3.5 h-3.5 text-slate-300 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-700 truncate">{cfg.label(r)}</p>
                <p className="text-[11px] text-slate-400 truncate">{cfg.detail(r)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const UserDataTree: React.FC<Props> = ({ userId, nome, email }) => {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const entries = await Promise.all(
        (Object.keys(TABLES) as NodeKey[]).map(async k => {
          const { count } = await supabase
            .from(TABLES[k].table as any)
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);
          return [k, count ?? 0] as const;
        })
      );
      setCounts(Object.fromEntries(entries));
    })();
  }, [userId]);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <FolderOpen className="w-4 h-4 text-primary" />
        <div>
          <p className="text-sm font-black text-slate-900">{nome || email}</p>
          <p className="text-[11px] text-slate-400">{email}</p>
        </div>
        <span className="ml-auto text-[11px] text-slate-400 font-bold">
          {Object.values(counts).reduce((a, b) => a + b, 0)} registros
        </span>
      </div>
      <div className="space-y-0.5">
        {(Object.keys(TABLES) as NodeKey[]).map(k => (
          <Branch key={k} userId={userId} nodeKey={k} />
        ))}
      </div>
    </div>
  );
};

export default UserDataTree;
