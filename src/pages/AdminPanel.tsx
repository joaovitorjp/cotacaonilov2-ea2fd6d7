import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import UserDataTree from '@/components/admin/UserDataTree';
import { imageToDataUrl } from '@/lib/branding';
import {
  ArrowLeft, Ban, CalendarClock, CheckCircle2, KeyRound, Loader2, LogOut,
  Network, Plus, Search, Shield, Trash2, Users as UsersIcon, FolderTree, ScrollText, ImageIcon,
} from 'lucide-react';

type Tab = 'usuarios' | 'redes' | 'dados' | 'auditoria';

interface Profile {
  user_id: string;
  nome: string;
  email: string;
  network_id: string | null;
  blocked_at: string | null;
  blocked_reason: string | null;
  access_expires_at: string | null;
  created_at: string;
}

interface Rede {
  id: string;
  name: string;
  slug: string;
  blocked_at: string | null;
  access_expires_at: string | null;
  display_name: string | null;
  logo_url: string | null;
}

const toDateInput = (v: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isAdmin, loading: roleLoading } = useUserRole();

  const [tab, setTab] = useState<Tab>('usuarios');
  const [loading, setLoading] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [redes, setRedes] = useState<Rede[]>([]);
  const [adminIds, setAdminIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroRede, setFiltroRede] = useState<string>('todas');
  const [filtroSituacao, setFiltroSituacao] = useState<'todos' | 'ativos' | 'bloqueados' | 'vencidos'>('todos');
  const [selecionado, setSelecionado] = useState<Profile | null>(null);
  const [senhaDialog, setSenhaDialog] = useState<Profile | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [novoUsuario, setNovoUsuario] = useState(false);
  const [form, setForm] = useState({ email: '', nome: '', password: '', network_id: '' });
  const [novaRede, setNovaRede] = useState('');
  const [acao, setAcao] = useState(false);

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate('/', { replace: true });
  }, [roleLoading, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const [p, n, r, l] = await Promise.all([
      supabase.from('profiles').select('user_id,nome,email,network_id,blocked_at,blocked_reason,access_expires_at,created_at').order('nome'),
      supabase.from('networks').select('id,name,slug,blocked_at,access_expires_at,display_name,logo_url').order('name'),
      supabase.from('user_roles').select('user_id,role').eq('role', 'admin'),
      supabase.from('master_audit_logs').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    setProfiles((p.data as any) ?? []);
    setRedes((n.data as any) ?? []);
    setAdminIds(((r.data as any) ?? []).map((x: any) => x.user_id));
    setLogs((l.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const registrar = async (action: string, entityId: string, details: any) => {
    await supabase.from('master_audit_logs').insert({
      performed_by: user?.id ?? null,
      action_type: action,
      entity_type: 'admin_panel',
      entity_id: entityId,
      details,
    } as any);
  };

  const redeDe = (id: string | null) => redes.find(r => r.id === id) ?? null;

  const situacao = (p: Profile) => {
    const rede = redeDe(p.network_id);
    if (p.blocked_at) return 'bloqueado';
    if (rede?.blocked_at) return 'rede bloqueada';
    const exp = p.access_expires_at ?? rede?.access_expires_at ?? null;
    if (exp && new Date(exp) < new Date()) return 'vencido';
    return 'ativo';
  };

  const listaFiltrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return profiles.filter(p => {
      if (q && !(`${p.nome} ${p.email}`.toLowerCase().includes(q))) return false;
      if (filtroRede !== 'todas' && (p.network_id ?? 'sem') !== filtroRede) return false;
      const s = situacao(p);
      if (filtroSituacao === 'ativos' && s !== 'ativo') return false;
      if (filtroSituacao === 'bloqueados' && !s.includes('bloque')) return false;
      if (filtroSituacao === 'vencidos' && s !== 'vencido') return false;
      return true;
    });
  }, [profiles, busca, filtroRede, filtroSituacao, redes]);

  const updateProfile = async (p: Profile, patch: Partial<Profile>, acaoNome: string) => {
    setAcao(true);
    const { error } = await supabase.from('profiles').update(patch as any).eq('user_id', p.user_id);
    setAcao(false);
    if (error) { toast.error(error.message); return; }
    await registrar(acaoNome, p.user_id, patch);
    setProfiles(prev => prev.map(x => (x.user_id === p.user_id ? { ...x, ...patch } as Profile : x)));
    setSelecionado(prev => (prev && prev.user_id === p.user_id ? { ...prev, ...patch } as Profile : prev));
    toast.success('Alteração salva.');
  };

  const updateRede = async (r: Rede, patch: Partial<Rede>, acaoNome: string) => {
    const { error } = await supabase.from('networks').update(patch as any).eq('id', r.id);
    if (error) { toast.error(error.message); return; }
    await registrar(acaoNome, r.id, patch);
    setRedes(prev => prev.map(x => (x.id === r.id ? { ...x, ...patch } as Rede : x)));
    toast.success('Rede atualizada.');
  };

  const chamarFuncao = async (body: any, sucesso: string) => {
    setAcao(true);
    const { data, error } = await supabase.functions.invoke('admin-actions', { body });
    setAcao(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? 'Falha na operação.');
      return false;
    }
    toast.success(sucesso);
    return true;
  };

  const toggleAdmin = async (p: Profile) => {
    const jaEh = adminIds.includes(p.user_id);
    if (jaEh) {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', p.user_id).eq('role', 'admin');
      if (error) { toast.error(error.message); return; }
      setAdminIds(prev => prev.filter(x => x !== p.user_id));
    } else {
      const { error } = await supabase.from('user_roles').insert({ user_id: p.user_id, role: 'admin' } as any);
      if (error) { toast.error(error.message); return; }
      setAdminIds(prev => [...prev, p.user_id]);
    }
    await registrar(jaEh ? 'remover_admin' : 'tornar_admin', p.user_id, {});
    toast.success('Permissão atualizada.');
  };

  if (roleLoading || !isAdmin) {
    return <div className="flex items-center justify-center h-screen text-slate-500">Carregando...</div>;
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: 'usuarios', label: 'Usuários', icon: UsersIcon },
    { key: 'redes', label: 'Redes', icon: Network },
    { key: 'dados', label: 'Dados', icon: FolderTree },
    { key: 'auditoria', label: 'Auditoria', icon: ScrollText },
  ];

  const tituloAba = tabs.find(t => t.key === tab)?.label ?? '';

  return (
    <div className="h-screen w-full flex bg-[#F8FAFC] overflow-hidden">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-200">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-display font-bold text-slate-900 tracking-tight">Painel Admin</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider truncate">Gestão total</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                tab === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-200">
          <button onClick={() => navigate('/')} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100">
            <ArrowLeft className="w-4 h-4" /> Voltar ao sistema
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="shrink-0 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="md:hidden p-1.5 rounded-lg hover:bg-slate-50 text-slate-500">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-display font-bold text-slate-900 tracking-tight">{tituloAba}</h2>
          <div className="flex md:hidden items-center gap-1 ml-auto overflow-x-auto">
            {tabs.map(t => (
              <Button
                key={t.key}
                size="sm"
                variant={tab === t.key ? 'default' : 'ghost'}
                onClick={() => setTab(t.key)}
                className={`text-xs font-bold rounded-xl h-9 ${tab === t.key ? 'bg-slate-900 hover:bg-slate-800 text-white' : 'text-slate-600'}`}
              >
                <t.icon className="w-3.5 h-3.5" />
              </Button>
            ))}
          </div>
        </header>

      <main className="flex-1 overflow-y-auto w-full p-4 sm:p-6 space-y-4">
        {loading && (
          <div className="flex items-center gap-2 text-slate-500 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Carregando dados...</div>
        )}

        {tab === 'usuarios' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" className="pl-9 rounded-xl" />
              </div>
              <Select value={filtroRede} onValueChange={setFiltroRede}>
                <SelectTrigger className="w-[180px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as redes</SelectItem>
                  <SelectItem value="sem">Sem rede</SelectItem>
                  {redes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filtroSituacao} onValueChange={v => setFiltroSituacao(v as any)}>
                <SelectTrigger className="w-[160px] rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as situações</SelectItem>
                  <SelectItem value="ativos">Ativos</SelectItem>
                  <SelectItem value="bloqueados">Bloqueados</SelectItem>
                  <SelectItem value="vencidos">Vencidos</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => setNovoUsuario(true)} className="rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold">
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo usuário
              </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {listaFiltrada.map(p => {
                const s = situacao(p);
                const rede = redeDe(p.network_id);
                return (
                  <div key={p.user_id} className="p-4 flex flex-wrap items-center gap-3">
                    <div className="min-w-[200px] flex-1">
                      <p className="text-sm font-black text-slate-900 flex items-center gap-2">
                        {p.nome || '(sem nome)'}
                        {adminIds.includes(p.user_id) && <span className="text-[9px] uppercase tracking-widest bg-slate-900 text-white px-1.5 py-0.5 rounded">admin</span>}
                      </p>
                      <p className="text-[11px] text-slate-400">{p.email}</p>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-md ${
                      s === 'ativo' ? 'bg-emerald-50 text-emerald-600' : s === 'vencido' ? 'bg-amber-50 text-amber-600' : 'bg-red-50 text-red-600'
                    }`}>{s}</span>
                    <span className="text-[11px] text-slate-500 font-bold min-w-[110px]">{rede?.name ?? 'Sem rede'}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Button size="sm" variant="ghost" className="text-xs rounded-lg" onClick={() => { setSelecionado(p); }}>Gerenciar</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`text-xs rounded-lg ${p.blocked_at ? 'text-emerald-600' : 'text-red-600'}`}
                        onClick={() => updateProfile(p, { blocked_at: p.blocked_at ? null : new Date().toISOString() } as any, p.blocked_at ? 'desbloquear_usuario' : 'bloquear_usuario')}
                      >
                        {p.blocked_at ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                );
              })}
              {!loading && listaFiltrada.length === 0 && <p className="p-6 text-sm text-slate-400">Nenhum usuário encontrado.</p>}
            </div>
          </>
        )}

        {tab === 'redes' && (
          <>
            <div className="flex gap-2">
              <Input value={novaRede} onChange={e => setNovaRede(e.target.value)} placeholder="Nome da nova rede" className="rounded-xl" />
              <Button
                className="rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold"
                onClick={async () => {
                  const nome = novaRede.trim();
                  if (nome.length < 2) { toast.error('Informe o nome da rede.'); return; }
                  const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
                  const { data, error } = await supabase.from('networks').insert({ name: nome, slug } as any).select().single();
                  if (error) { toast.error(error.message); return; }
                  setRedes(prev => [...prev, data as any]);
                  setNovaRede('');
                  await registrar('criar_rede', (data as any).id, { nome });
                  toast.success('Rede criada.');
                }}
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar rede
              </Button>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
              {redes.map(r => {
                const membros = profiles.filter(p => p.network_id === r.id);
                return (
                  <div key={r.id} className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="relative shrink-0 cursor-pointer group" title="Alterar logo da rede">
                        <div className="w-12 h-12 rounded-xl border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                          {r.logo_url
                            ? <img src={r.logo_url} alt={r.name} className="w-full h-full object-contain" />
                            : <ImageIcon className="w-4 h-4 text-slate-300" />}
                        </div>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async e => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 5 MB).'); return; }
                            try {
                              const dataUrl = await imageToDataUrl(file, 512);
                              await updateRede(r, { logo_url: dataUrl } as any, 'logo_rede');
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : 'Falha ao processar a imagem.');
                            }
                          }}
                        />
                      </label>
                      <Input
                        defaultValue={r.name}
                        onBlur={e => { const v = e.target.value.trim(); if (v && v !== r.name) void updateRede(r, { name: v }, 'renomear_rede'); }}
                        className="max-w-[240px] rounded-xl font-bold"
                      />
                      <Input
                        defaultValue={r.display_name ?? ''}
                        placeholder="Nome exibido no sistema"
                        onBlur={e => { const v = e.target.value.trim(); if (v !== (r.display_name ?? '')) void updateRede(r, { display_name: v || null } as any, 'nome_exibicao_rede'); }}
                        className="max-w-[220px] rounded-xl text-xs"
                      />
                      {r.logo_url && (
                        <Button size="sm" variant="ghost" className="text-[11px] rounded-lg text-slate-500"
                          onClick={() => updateRede(r, { logo_url: null } as any, 'remover_logo_rede')}>
                          Remover logo
                        </Button>
                      )}
                      <span className="text-[11px] text-slate-400 font-bold">{membros.length} usuário(s)</span>
                      {r.blocked_at && <span className="text-[10px] font-black uppercase bg-red-50 text-red-600 px-2 py-1 rounded-md">bloqueada</span>}
                      <div className="flex items-center gap-2 ml-auto">
                        <div className="flex items-center gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                          <Input
                            type="date"
                            defaultValue={toDateInput(r.access_expires_at)}
                            onChange={e => void updateRede(r, { access_expires_at: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : null }, 'prazo_rede')}
                            className="w-[150px] rounded-xl text-xs"
                          />
                        </div>
                        <Button size="sm" variant="ghost" className={`text-xs rounded-lg ${r.blocked_at ? 'text-emerald-600' : 'text-red-600'}`}
                          onClick={() => updateRede(r, { blocked_at: r.blocked_at ? null : new Date().toISOString() }, r.blocked_at ? 'desbloquear_rede' : 'bloquear_rede')}>
                          {r.blocked_at ? 'Desbloquear' : 'Bloquear'}
                        </Button>
                        <Button size="sm" variant="ghost" className="text-xs rounded-lg text-red-600"
                          onClick={async () => {
                            if (membros.length > 0) { toast.error('Desvincule os usuários antes de excluir.'); return; }
                            const { error } = await supabase.from('networks').delete().eq('id', r.id);
                            if (error) { toast.error(error.message); return; }
                            setRedes(prev => prev.filter(x => x.id !== r.id));
                            await registrar('excluir_rede', r.id, { nome: r.name });
                            toast.success('Rede excluída.');
                          }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {membros.map(m => (
                        <button key={m.user_id}
                          onClick={() => updateProfile(m, { network_id: null } as any, 'desvincular_rede')}
                          className="text-[11px] font-bold bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 px-2 py-1 rounded-lg">
                          {m.nome || m.email} ✕
                        </button>
                      ))}
                      {membros.length === 0 && <span className="text-xs text-slate-400">Nenhum usuário vinculado.</span>}
                    </div>
                  </div>
                );
              })}
              {!loading && redes.length === 0 && <p className="p-6 text-sm text-slate-400">Nenhuma rede cadastrada.</p>}
            </div>
          </>
        )}

        {tab === 'dados' && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar usuário" className="pl-9 rounded-xl" />
            </div>
            {listaFiltrada.map(p => (
              <UserDataTree key={p.user_id} userId={p.user_id} nome={p.nome} email={p.email} />
            ))}
          </div>
        )}

        {tab === 'auditoria' && (
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100">
            {logs.map(l => (
              <div key={l.id} className="p-3 flex items-start gap-3">
                <ScrollText className="w-4 h-4 text-slate-300 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700">{l.action_type}</p>
                  <p className="text-[11px] text-slate-400 break-all">
                    {new Date(l.created_at).toLocaleString('pt-BR')} • {profiles.find(p => p.user_id === l.performed_by)?.email ?? l.performed_by} • {JSON.stringify(l.details ?? {})}
                  </p>
                </div>
              </div>
            ))}
            {!loading && logs.length === 0 && <p className="p-6 text-sm text-slate-400">Nenhum registro ainda.</p>}
          </div>
        )}
      </main>
      </div>



      {/* Gerenciar usuário */}
      <Dialog open={!!selecionado} onOpenChange={o => !o && setSelecionado(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="font-display">{selecionado?.nome || selecionado?.email}</DialogTitle></DialogHeader>
          {selecionado && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Rede</Label>
                <Select
                  value={selecionado.network_id ?? 'sem'}
                  onValueChange={v => updateProfile(selecionado, { network_id: v === 'sem' ? null : v } as any, 'vincular_rede')}
                >
                  <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem">Sem rede</SelectItem>
                    {redes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Acesso válido até</Label>
                <Input
                  type="date"
                  defaultValue={toDateInput(selecionado.access_expires_at)}
                  onChange={e => updateProfile(selecionado, { access_expires_at: e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : null } as any, 'prazo_usuario')}
                  className="rounded-xl"
                />
                <p className="text-[11px] text-slate-400">Vazio = sem prazo. O prazo individual tem prioridade sobre o da rede.</p>
              </div>

              <div className="space-y-2">
                <Label>Motivo do bloqueio</Label>
                <Input
                  defaultValue={selecionado.blocked_reason ?? ''}
                  onBlur={e => updateProfile(selecionado, { blocked_reason: e.target.value || null } as any, 'motivo_bloqueio')}
                  placeholder="Opcional"
                  className="rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" className="rounded-xl text-xs font-bold" onClick={() => setSenhaDialog(selecionado)}>
                  <KeyRound className="w-3.5 h-3.5 mr-1.5" /> Redefinir senha
                </Button>
                <Button variant="secondary" className="rounded-xl text-xs font-bold" disabled={acao}
                  onClick={() => chamarFuncao({ action: 'sign_out', user_id: selecionado.user_id }, 'Sessões encerradas.')}>
                  <LogOut className="w-3.5 h-3.5 mr-1.5" /> Encerrar sessões
                </Button>
                <Button variant="secondary" className="rounded-xl text-xs font-bold" onClick={() => toggleAdmin(selecionado)}>
                  <Shield className="w-3.5 h-3.5 mr-1.5" /> {adminIds.includes(selecionado.user_id) ? 'Remover admin' : 'Tornar admin'}
                </Button>
                <Button variant="destructive" className="rounded-xl text-xs font-bold" disabled={acao}
                  onClick={async () => {
                    if (!confirm('Excluir definitivamente este usuário e seus dados?')) return;
                    const ok = await chamarFuncao({ action: 'delete_user', user_id: selecionado.user_id }, 'Usuário excluído.');
                    if (ok) { setSelecionado(null); void load(); }
                  }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Excluir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Redefinir senha */}
      <Dialog open={!!senhaDialog} onOpenChange={o => { if (!o) { setSenhaDialog(null); setNovaSenha(''); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Redefinir senha</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Nova senha</Label>
            <Input type="text" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} placeholder="Mínimo de 6 caracteres" className="rounded-xl" />
          </div>
          <DialogFooter>
            <Button disabled={acao} className="rounded-xl"
              onClick={async () => {
                if (novaSenha.length < 6) { toast.error('Senha muito curta.'); return; }
                const ok = await chamarFuncao({ action: 'reset_password', user_id: senhaDialog?.user_id, password: novaSenha }, 'Senha redefinida.');
                if (ok) { setSenhaDialog(null); setNovaSenha(''); }
              }}>
              Salvar senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Novo usuário */}
      <Dialog open={novoUsuario} onOpenChange={setNovoUsuario}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="font-display">Novo usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-2"><Label>E-mail</Label><Input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-2"><Label>Senha</Label><Input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="rounded-xl" /></div>
            <div className="space-y-2">
              <Label>Rede</Label>
              <Select value={form.network_id || 'sem'} onValueChange={v => setForm({ ...form, network_id: v === 'sem' ? '' : v })}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">Sem rede</SelectItem>
                  {redes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={acao} className="rounded-xl"
              onClick={async () => {
                const ok = await chamarFuncao({ action: 'create_user', ...form, network_id: form.network_id || null }, 'Usuário criado.');
                if (ok) { setNovoUsuario(false); setForm({ email: '', nome: '', password: '', network_id: '' }); void load(); }
              }}>
              Criar usuário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
