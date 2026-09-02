import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  Ban, Copy, KeyRound, Loader2, LogOut, MessageCircle, Plus, RefreshCw, ShieldCheck, Trash2,
} from 'lucide-react';
import { PRECOS, chaveResumida, gerarChave, whatsappLink } from '@/lib/chaves';

interface Chave {
  id: string;
  chave: string;
  tipo: 'mensal' | 'vitalicio';
  status: 'disponivel' | 'ativa' | 'cancelada';
  user_id: string | null;
  cliente_nome: string | null;
  cliente_contato: string | null;
  observacao: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<Chave['status'], string> = {
  disponivel: 'bg-sky-50 text-sky-700 border-sky-200',
  ativa: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelada: 'bg-red-50 text-red-600 border-red-200',
};

const fmt = (v: string | null) => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

const AdminChaves = () => {
  const { isAdmin, loading: roleLoading } = useUserRole();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [chaves, setChaves] = useState<Chave[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todas' | Chave['status']>('todas');

  const [tipo, setTipo] = useState<'mensal' | 'vitalicio'>('mensal');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteContato, setClienteContato] = useState('');
  const [observacao, setObservacao] = useState('');
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('access_keys')
      .select('*')
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setChaves((data ?? []) as Chave[]);
  }, []);

  useEffect(() => {
    if (roleLoading) return;
    if (!isAdmin) {
      navigate('/', { replace: true });
      return;
    }
    void carregar();
  }, [roleLoading, isAdmin, navigate, carregar]);

  const criar = async (e: React.FormEvent) => {
    e.preventDefault();
    setCriando(true);
    const nova = await gerarChave();
    const { error } = await supabase.from('access_keys').insert({
      chave: nova,
      tipo,
      cliente_nome: clienteNome.trim() || null,
      cliente_contato: clienteContato.trim() || null,
      observacao: observacao.trim() || null,
      created_by: user?.id ?? null,
    });
    setCriando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await navigator.clipboard.writeText(nova).catch(() => undefined);
    toast.success('Chave criada e copiada para a área de transferência.');
    setClienteNome('');
    setClienteContato('');
    setObservacao('');
    void carregar();
  };

  const copiar = async (valor: string) => {
    await navigator.clipboard.writeText(valor).catch(() => undefined);
    toast.success('Chave copiada.');
  };

  const cancelar = async (c: Chave) => {
    if (!confirm('Cancelar esta chave? O acesso do cliente será bloqueado.')) return;
    const { error } = await supabase.rpc('admin_cancelar_chave', { _id: c.id });
    if (error) return toast.error(error.message);
    toast.success('Chave cancelada.');
    void carregar();
  };

  const excluir = async (c: Chave) => {
    if (!confirm('Excluir permanentemente esta chave?')) return;
    const { error } = await supabase.from('access_keys').delete().eq('id', c.id);
    if (error) return toast.error(error.message);
    toast.success('Chave excluída.');
    void carregar();
  };

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return chaves.filter((c) => {
      if (filtro !== 'todas' && c.status !== filtro) return false;
      if (!q) return true;
      return [c.chave, c.cliente_nome, c.cliente_contato, c.observacao]
        .some((v) => (v ?? '').toLowerCase().includes(q));
    });
  }, [chaves, busca, filtro]);

  const totais = useMemo(() => ({
    disponivel: chaves.filter((c) => c.status === 'disponivel').length,
    ativa: chaves.filter((c) => c.status === 'ativa').length,
    cancelada: chaves.filter((c) => c.status === 'cancelada').length,
  }), [chaves]);

  if (roleLoading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></span>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">Painel administrativo</h1>
              <p className="text-xs text-muted-foreground">Gestão de chaves de acesso COTARME</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void carregar()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>Ir ao sistema</Button>
            <Button variant="ghost" size="sm" onClick={() => void signOut()}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-3">
          {([['disponivel', 'Disponíveis'], ['ativa', 'Ativas'], ['cancelada', 'Canceladas']] as const).map(([k, label]) => (
            <div key={k} className="rounded-2xl border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
              <p className="mt-1 text-3xl font-bold">{totais[k]}</p>
            </div>
          ))}
        </div>

        <form onSubmit={criar} className="rounded-2xl border border-border bg-card p-5 space-y-4">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            <Plus className="h-4 w-4" /> Gerar nova chave
          </h2>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(['mensal', 'vitalicio'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTipo(t)}
                    className={`flex-1 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                      tipo === t ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'
                    }`}
                  >
                    {t === 'mensal' ? `Mensal ${PRECOS.mensal}` : `Vitalícia ${PRECOS.vitalicio}`}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cliente">Cliente</Label>
              <Input id="cliente" value={clienteNome} onChange={(e) => setClienteNome(e.target.value)} placeholder="Nome do cliente" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contato">WhatsApp / e-mail</Label>
              <Input id="contato" value={clienteContato} onChange={(e) => setClienteContato(e.target.value)} placeholder="66 9 8464-0346" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="obs">Observação</Label>
              <Input id="obs" value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Pagamento via Pix" />
            </div>
          </div>
          <Button type="submit" disabled={criando}>
            {criando ? 'Gerando...' : 'Gerar chave'}
          </Button>
        </form>

        <div className="rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por chave, cliente ou contato"
              className="max-w-xs"
            />
            <div className="flex gap-1">
              {(['todas', 'disponivel', 'ativa', 'cancelada'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltro(f)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                    filtro === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <p className="p-6 text-sm text-muted-foreground">Carregando chaves...</p>
          ) : lista.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma chave encontrada.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="p-3">Chave</th>
                    <th className="p-3">Tipo</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Cliente</th>
                    <th className="p-3">Ativada</th>
                    <th className="p-3">Expira</th>
                    <th className="p-3 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.id} className="border-b border-border/60 last:border-0">
                      <td className="p-3 font-mono text-xs" title={c.chave}>{chaveResumida(c.chave)}</td>
                      <td className="p-3 capitalize">{c.tipo === 'vitalicio' ? 'Vitalícia' : 'Mensal'}</td>
                      <td className="p-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold capitalize ${STATUS_STYLE[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="block">{c.cliente_nome || '—'}</span>
                        <span className="block text-xs text-muted-foreground">{c.cliente_contato || ''}</span>
                      </td>
                      <td className="p-3">{fmt(c.redeemed_at)}</td>
                      <td className="p-3">{c.tipo === 'vitalicio' ? 'Nunca' : fmt(c.expires_at)}</td>
                      <td className="p-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Copiar chave" onClick={() => void copiar(c.chave)}>
                            <Copy className="h-4 w-4" />
                          </Button>
                          <a
                            href={whatsappLink(`Sua chave de acesso COTARME (${c.tipo === 'vitalicio' ? 'vitalícia' : 'mensal'}):\n\n${c.chave}\n\nAtive em ${window.location.origin}/assinatura`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Enviar por WhatsApp"
                          >
                            <Button variant="ghost" size="icon"><MessageCircle className="h-4 w-4" /></Button>
                          </a>
                          {c.status !== 'cancelada' && (
                            <Button variant="ghost" size="icon" title="Cancelar" onClick={() => void cancelar(c)}>
                              <Ban className="h-4 w-4 text-orange-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" title="Excluir" onClick={() => void excluir(c)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" /> As chaves têm 64 caracteres (SHA-256) e só podem ser usadas por um cliente.
        </p>
      </div>
    </div>
  );
};

export default AdminChaves;
