import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Copy, Check, Link2, UserPlus, MessageCircle, RefreshCw, MapPin, Trash2,
  Search, Truck, Tag, Clock, Send, Users, Settings2, Plus, X,
} from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useEstadosUsuario } from '@/hooks/useEstadosUsuario';
import {
  UF_LIST, ufNome, TIPO_LABELS, FRETE_LABELS, serializeEstados,
  type CondicaoEstado, type TipoPreco as TipoPrecoT, type Frete as FreteT,
} from '@/lib/estados';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Fornecedor {
  id: string;
  nome: string;
  contato: string | null;
  whatsapp: string;
}

interface GeneratedLink {
  empresa: string;
  link: string;
  copied: boolean;
  whatsapp?: string;
  estados?: string;
}

interface ExistingLink {
  id: string;
  token: string;
  empresa: string;
  respondido: boolean;
  whatsapp?: string;
  estados?: string;
}

type TipoPreco = 'IPI_ST' | 'NOTA';
type Frete = 'CIF' | 'FOB';


interface GerarLinkPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listaId: string;
}

const getPublicBaseUrl = () => {
  const origin = window.location.origin;
  if (origin.includes('preview--') && origin.includes('.lovable.app')) {
    return 'https://cotarme.lovable.app';
  }
  return origin;
};


/** Compact segmented control used across the configuration step. */
function Segmented<T extends string>({ value, options, onChange, size = 'md' }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md font-display font-bold transition-all ${
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
          } ${
            value === opt.value
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

const GerarLinkPanel: React.FC<GerarLinkPanelProps> = ({ open, onOpenChange, listaId }) => {
  const { user } = useAuth();
  const [empresa, setEmpresa] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedLinks, setGeneratedLinks] = useState<GeneratedLink[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [existingLinks, setExistingLinks] = useState<ExistingLink[]>([]);
  const [selectedUFs, setSelectedUFs] = useState<string[]>([]);
  const [listaNome, setListaNome] = useState<string>('');
  const [userNome, setUserNome] = useState<string>('');
  const [linkToDelete, setLinkToDelete] = useState<ExistingLink | null>(null);
  const [condicoes, setCondicoes] = useState<Record<string, CondicaoEstado>>({});
  const [gerenciarOpen, setGerenciarOpen] = useState(false);
  const [novaUF, setNovaUF] = useState('');

  const [tab, setTab] = useState<'novo' | 'enviados'>('novo');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { estados: estadosUsuario, save: saveEstados } = useEstadosUsuario();

  // Seleciona todos os estados do usuário por padrão
  useEffect(() => {
    setSelectedUFs(prev => {
      const valid = prev.filter(uf => estadosUsuario.includes(uf));
      return valid.length ? valid : estadosUsuario;
    });
    setCondicoes(prev => {
      const next = { ...prev };
      estadosUsuario.forEach(uf => {
        if (!next[uf]) next[uf] = { tipo: uf === 'GO' ? 'NOTA' : 'IPI_ST', frete: 'CIF' };
      });
      return next;
    });
  }, [estadosUsuario]);

  const toggleUF = (uf: string) =>
    setSelectedUFs(prev => (prev.includes(uf) ? prev.filter(x => x !== uf) : [...prev, uf]));

  const setCondicao = (uf: string, patch: Partial<CondicaoEstado>) =>
    setCondicoes(prev => ({ ...prev, [uf]: { tipo: 'IPI_ST', frete: 'CIF', ...prev[uf], ...patch } }));

  const addEstado = async () => {
    if (!novaUF || estadosUsuario.includes(novaUF)) return;
    const { error } = await saveEstados([...estadosUsuario, novaUF]);
    if (error) toast.error('Erro ao salvar estado.');
    else {
      toast.success(`${novaUF} adicionado.`);
      setNovaUF('');
    }
  };

  const removeEstado = async (uf: string) => {
    const { error } = await saveEstados(estadosUsuario.filter(u => u !== uf));
    if (error) toast.error('Erro ao remover estado.');
    else setSelectedUFs(prev => prev.filter(u => u !== uf));
  };


  useEffect(() => {
    if (open && user?.id) {
      supabase.from('fornecedores').select('*').eq('user_id', user.id).order('nome').then(({ data }) => {
        setFornecedores((data ?? []) as Fornecedor[]);
      });
      supabase.from('listas').select('nome').eq('id', listaId).maybeSingle().then(({ data }) => {
        setListaNome((data as any)?.nome ?? '');
      });
      supabase.from('profiles').select('nome').eq('user_id', user.id).maybeSingle().then(({ data }) => {
        setUserNome(((data as any)?.nome ?? '').trim());
      });
      loadExistingLinks();
    }
  }, [open, user?.id]);

  const loadExistingLinks = async () => {
    if (!user?.id) return;
    const { data: links } = await supabase
      .from('links_cotacao')
      .select('id, token, empresa, respondido, estados')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', listaId)
      .order('created_at', { ascending: false });

    if (links) {
      const { data: forns } = await supabase.from('fornecedores').select('nome, whatsapp').eq('user_id', user?.id ?? '');
      const fornMap: Record<string, string> = {};
      (forns ?? []).forEach((f: any) => { fornMap[f.nome] = f.whatsapp; });

      setExistingLinks(links.map((l: any) => ({
        ...l,
        whatsapp: fornMap[l.empresa],
      })));
    }
  };

  const generateLink = async (empresaNome: string) => {
    if (selectedUFs.length === 0) throw new Error('Selecione ao menos um estado');
    const condPayload: Record<string, CondicaoEstado> = {};
    selectedUFs.forEach(uf => {
      condPayload[uf] = condicoes[uf] ?? { tipo: 'IPI_ST', frete: 'CIF' };
    });
    const { data, error } = await supabase
      .from('links_cotacao')
      .insert({
        lista_id: listaId,
        empresa: empresaNome,
        estados: serializeEstados(selectedUFs),
        condicoes: condPayload as any,
        user_id: user?.id,
        // compatibilidade com colunas legadas
        tipo_preco_mt: condPayload.MT?.tipo ?? 'IPI_ST',
        tipo_preco_go: condPayload.GO?.tipo ?? 'NOTA',
        frete_mt: condPayload.MT?.frete ?? 'CIF',
        frete_go: condPayload.GO?.frete ?? 'CIF',
      })
      .select()
      .single();

    if (error) throw error;
    return `${getPublicBaseUrl()}/cotacao/${data.token}`;
  };


  const handleGerar = async () => {
    if (!empresa.trim()) return;
    setLoading(true);
    try {
      const link = await generateLink(empresa.trim());
      setGeneratedLinks(prev => [...prev, { empresa: empresa.trim(), link, copied: false, estados: selectedUFs.join(',') }]);
      setEmpresa('');
      toast.success('Link gerado!');
      setTab('enviados');
      loadExistingLinks();
    } catch {
      toast.error('Erro ao gerar link.');
    }
    setLoading(false);
  };

  const handleGerarSelecionados = async () => {
    const alvos = fornecedores.filter(f => selectedIds.includes(f.id));
    if (alvos.length === 0) return;
    setLoading(true);
    let count = 0;
    for (const f of alvos) {
      try {
        const link = await generateLink(f.nome);
        setGeneratedLinks(prev => [...prev, { empresa: f.nome, link, copied: false, whatsapp: f.whatsapp, estados: selectedUFs.join(',') }]);
        count++;
      } catch { /* skip */ }
    }
    toast.success(`${count} link(s) gerado(s)!`);
    setSelectedIds([]);
    setTab('enviados');
    loadExistingLinks();
    setLoading(false);
  };

  const handleCopy = async (idx: number) => {
    await navigator.clipboard.writeText(generatedLinks[idx].link);
    setGeneratedLinks(prev => prev.map((l, i) => i === idx ? { ...l, copied: true } : l));
    setTimeout(() => {
      setGeneratedLinks(prev => prev.map((l, i) => i === idx ? { ...l, copied: false } : l));
    }, 2000);
  };

  const handleCopyAll = async () => {
    const text = generatedLinks.map(l => `${l.empresa}: ${l.link}`).join('\n');
    await navigator.clipboard.writeText(text);
    toast.success('Todos os links copiados!');
  };

  const buildWhatsAppMessage = (link: string) => {
    const cotacaoLabel = listaNome ? `"${listaNome}"` : '';
    const remetente = userNome ? `\n\nEnviado por: ${userNome}` : '';
    const msg = `Olá! Segue o link para responder a cotação ${cotacaoLabel}:\n${link}${remetente}`.replace(/ {2,}/g, ' ');
    return encodeURIComponent(msg);
  };

  const handleShareWhatsApp = (empresa: string, token: string, whatsapp?: string) => {
    const phone = whatsapp ? whatsapp.replace(/\D/g, '') : '';
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    const link = `${getPublicBaseUrl()}/cotacao/${token}`;
    window.open(`https://wa.me/${fullPhone}?text=${buildWhatsAppMessage(link)}`, '_blank');
  };

  const handleShareWhatsAppGenerated = (item: GeneratedLink) => {
    const phone = item.whatsapp ? item.whatsapp.replace(/\D/g, '') : '';
    const fullPhone = phone.startsWith('55') ? phone : `55${phone}`;
    window.open(`https://wa.me/${fullPhone}?text=${buildWhatsAppMessage(item.link)}`, '_blank');
  };

  const handleDeleteLink = async () => {
    if (!linkToDelete) return;
    const { error } = await supabase.from('links_cotacao').delete().eq('id', linkToDelete.id).eq('user_id', user?.id ?? '');
    if (error) {
      toast.error('Erro ao excluir link.');
    } else {
      toast.success('Link excluído.');
      setExistingLinks(prev => prev.filter(l => l.id !== linkToDelete.id));
    }
    setLinkToDelete(null);
  };

  const handleClose = (o: boolean) => {
    if (!o) {
      setGeneratedLinks([]);
      setEmpresa('');
      setSearch('');
      setSelectedIds([]);
      setTab('novo');
    }
    onOpenChange(o);
  };

  const pendingExisting = existingLinks.filter(l => !l.respondido);
  const respondedExisting = existingLinks.filter(l => l.respondido);

  const linkedNames = useMemo(
    () => new Set([...generatedLinks.map(l => l.empresa), ...existingLinks.map(l => l.empresa)]),
    [generatedLinks, existingLinks],
  );

  const filteredFornecedores = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fornecedores.filter(f => !q || f.nome.toLowerCase().includes(q));
  }, [fornecedores, search]);

  const disponiveis = filteredFornecedores.filter(f => !linkedNames.has(f.nome));
  const allSelected = disponiveis.length > 0 && disponiveis.every(f => selectedIds.includes(f.id));

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : disponiveis.map(f => f.id));
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const resumo = [
    selectedUFs.length ? `Estados: ${selectedUFs.join(' + ')}` : 'Nenhum estado selecionado',
    ...selectedUFs.map(uf => {
      const c = condicoes[uf] ?? { tipo: 'IPI_ST' as TipoPreco, frete: 'CIF' as Frete };
      return `${uf}: ${TIPO_LABELS[c.tipo]} · ${FRETE_LABELS[c.frete]}`;
    }),
  ];


  return (
    <>
      <Sheet open={open} onOpenChange={handleClose}>
        <SheetContent side="right" className="w-[95vw] sm:w-[52vw] sm:min-w-[440px] sm:max-w-[640px] p-0 flex flex-col gap-0">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 border-b border-border">
            <SheetHeader className="space-y-1">
              <SheetTitle className="font-display text-xl flex items-center gap-2">
                <Link2 className="w-5 h-5 text-primary" /> Links de Cotação
              </SheetTitle>
              <SheetDescription className="truncate">
                {listaNome ? listaNome : 'Gere links únicos e envie via WhatsApp.'}
              </SheetDescription>
            </SheetHeader>

            <Tabs value={tab} onValueChange={(v) => setTab(v as 'novo' | 'enviados')} className="mt-4">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="novo" className="font-display font-bold text-xs">
                  <Send className="w-3.5 h-3.5 mr-1.5" /> Gerar novos
                </TabsTrigger>
                <TabsTrigger value="enviados" className="font-display font-bold text-xs">
                  <Users className="w-3.5 h-3.5 mr-1.5" /> Enviados ({existingLinks.length})
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* ===== Tab: Gerar novos ===== */}
          {tab === 'novo' && (
            <>
              <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
                {/* Step 1 — condições */}
                <section className="rounded-xl border border-border bg-card/50 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">1</span>
                    <p className="text-xs font-display font-bold uppercase tracking-wider">Condições da cotação</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground">
                        <MapPin className="w-3 h-3" /> Estados
                      </p>
                      <button
                        type="button"
                        onClick={() => setGerenciarOpen(true)}
                        className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                      >
                        <Settings2 className="w-3 h-3" /> Gerenciar estados
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {estadosUsuario.length === 0 && (
                        <p className="text-[11px] text-muted-foreground">Nenhum estado cadastrado. Clique em "Gerenciar estados".</p>
                      )}
                      {estadosUsuario.map(uf => {
                        const active = selectedUFs.includes(uf);
                        return (
                          <button
                            key={uf}
                            type="button"
                            onClick={() => toggleUF(uf)}
                            title={ufNome(uf)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-display font-bold border transition-all ${
                              active
                                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                                : 'bg-muted text-muted-foreground border-transparent hover:text-foreground'
                            }`}
                          >
                            {uf}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedUFs.map(uf => {
                      const cond = condicoes[uf] ?? { tipo: 'IPI_ST' as TipoPreco, frete: 'CIF' as Frete };
                      return (
                        <div key={uf} className="rounded-lg border border-border p-3 space-y-2.5">
                          <p className="text-[11px] font-display font-bold text-primary">{uf} · {ufNome(uf)}</p>
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground mb-1"><Tag className="w-3 h-3" /> Tipo de preço</p>
                            <Segmented size="sm" value={cond.tipo} onChange={(v) => setCondicao(uf, { tipo: v as TipoPreco })}
                              options={(['IPI_ST', 'NOTA'] as TipoPreco[]).map(v => ({ value: v, label: TIPO_LABELS[v] }))} />
                          </div>
                          <div>
                            <p className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground mb-1"><Truck className="w-3 h-3" /> Frete</p>
                            <Segmented size="sm" value={cond.frete} onChange={(v) => setCondicao(uf, { frete: v as Frete })}
                              options={(['CIF', 'FOB'] as Frete[]).map(v => ({ value: v, label: FRETE_LABELS[v] }))} />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[10px] text-muted-foreground">
                    Essas condições aparecem para o fornecedor ao abrir o link.
                  </p>
                </section>

                {/* Step 2 — destinatários */}
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">2</span>
                    <p className="text-xs font-display font-bold uppercase tracking-wider">Escolher fornecedores</p>
                  </div>

                  {fornecedores.length > 0 && (
                    <>
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar fornecedor..."
                            className="pl-9 h-9 text-sm"
                          />
                        </div>
                        <Button variant="outline" size="sm" onClick={toggleAll} disabled={disponiveis.length === 0} className="h-9 text-xs shrink-0">
                          {allSelected ? 'Limpar' : 'Todos'}
                        </Button>
                      </div>

                      <div className="rounded-xl border border-border divide-y divide-border max-h-64 overflow-auto">
                        {filteredFornecedores.length === 0 && (
                          <p className="text-xs text-muted-foreground p-4 text-center">Nenhum fornecedor encontrado.</p>
                        )}
                        {filteredFornecedores.map(f => {
                          const already = linkedNames.has(f.nome);
                          const checked = selectedIds.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                                already ? 'opacity-60' : 'cursor-pointer hover:bg-muted/50'
                              } ${checked ? 'bg-primary/5' : ''}`}
                            >
                              {already ? (
                                <Check className="w-4 h-4 text-success shrink-0" />
                              ) : (
                                <Checkbox checked={checked} onCheckedChange={() => toggleOne(f.id)} />
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-display font-bold truncate">{f.nome}</p>
                                {f.whatsapp && <p className="text-[10px] text-muted-foreground">{f.whatsapp}</p>}
                              </div>
                              {already && <span className="text-[10px] font-bold text-success shrink-0">Link gerado</span>}
                            </label>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* Manual */}
                  <div>
                    <p className="text-[11px] font-bold text-muted-foreground mb-1.5">
                      {fornecedores.length > 0 ? 'Ou adicionar empresa avulsa' : 'Nome da empresa'}
                    </p>
                    <div className="flex gap-2">
                      <Input
                        value={empresa}
                        onChange={e => setEmpresa(e.target.value)}
                        placeholder="Ex: Distribuidora ABC"
                        className="h-9 text-sm"
                        onKeyDown={e => e.key === 'Enter' && handleGerar()}
                      />
                      <Button onClick={handleGerar} disabled={loading || !empresa.trim()} size="sm" className="shrink-0 h-9">
                        <UserPlus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </section>
              </div>

              {/* Sticky footer action */}
              <div className="border-t border-border bg-background/95 backdrop-blur px-6 py-3 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {resumo.map(r => (
                    <span key={r} className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{r}</span>
                  ))}
                </div>
                <Button
                  className="w-full font-display font-bold"
                  disabled={loading || selectedIds.length === 0}
                  onClick={handleGerarSelecionados}
                >
                  <Link2 className="w-4 h-4 mr-2" />
                  {selectedIds.length > 0 ? `Gerar ${selectedIds.length} link(s)` : 'Selecione os fornecedores'}
                </Button>
              </div>
            </>
          )}

          {/* ===== Tab: Enviados ===== */}
          {tab === 'enviados' && (
            <div className="flex-1 overflow-auto px-6 py-4 space-y-5">
              {generatedLinks.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-display font-bold text-muted-foreground uppercase tracking-wider">
                      Gerados agora ({generatedLinks.length})
                    </p>
                    {generatedLinks.length > 1 && (
                      <Button variant="outline" size="sm" onClick={handleCopyAll} className="text-xs h-7">
                        <Copy className="w-3 h-3 mr-1" /> Copiar todos
                      </Button>
                    )}
                  </div>
                  <div className="space-y-2">
                    {generatedLinks.map((item, idx) => (
                      <div
                        key={idx}
                        className={`border rounded-xl p-3 transition-colors ${item.copied ? 'border-success bg-success/5' : 'border-border'}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="font-display font-bold text-foreground text-sm truncate">{item.empresa}</p>
                            {item.estados && item.estados !== 'AMBOS' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold shrink-0">
                                {item.estados}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {item.whatsapp && (
                              <button
                                onClick={() => handleShareWhatsAppGenerated(item)}
                                className="p-1.5 rounded transition-colors text-green-600 hover:bg-green-500/10"
                                title="Enviar via WhatsApp"
                              >
                                <MessageCircle className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => handleCopy(idx)}
                              className={`p-1.5 rounded transition-colors ${
                                item.copied ? 'text-success' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                              }`}
                            >
                              {item.copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground break-all font-mono">{item.link}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {pendingExisting.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    <Clock className="w-3.5 h-3.5" /> Aguardando resposta ({pendingExisting.length})
                  </p>
                  <div className="space-y-2">
                    {pendingExisting.map(link => (
                      <div key={link.id} className="border border-border rounded-xl p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-display font-bold text-foreground text-sm truncate">{link.empresa}</p>
                            {link.estados && link.estados !== 'AMBOS' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-bold shrink-0">
                                {link.estados}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">Ainda não respondeu</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {link.whatsapp && (
                            <button
                              onClick={() => handleShareWhatsApp(link.empresa, link.token, link.whatsapp)}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-display font-bold text-green-600 bg-green-500/10 hover:bg-green-500/20 transition-colors"
                              title="Reenviar via WhatsApp"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const url = `${getPublicBaseUrl()}/cotacao/${link.token}`;
                              await navigator.clipboard.writeText(url);
                              toast.success('Link copiado!');
                            }}
                            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Copiar link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setLinkToDelete(link)}
                            className="p-1.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                            title="Excluir link"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {respondedExisting.length > 0 && (
                <section>
                  <p className="flex items-center gap-1.5 text-xs font-display font-bold text-muted-foreground uppercase tracking-wider mb-2">
                    <Check className="w-3.5 h-3.5 text-success" /> Respondidos ({respondedExisting.length})
                  </p>
                  <div className="space-y-1">
                    {respondedExisting.map(link => (
                      <div key={link.id} className="border border-success/20 bg-success/5 rounded-xl px-3 py-2 flex items-center gap-2">
                        <Check className="w-4 h-4 text-success shrink-0" />
                        <p className="font-display font-bold text-foreground text-sm truncate flex-1">{link.empresa}</p>
                        {link.estados && link.estados !== 'AMBOS' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-success/10 text-success font-bold shrink-0">
                            {link.estados}
                          </span>
                        )}
                        <button
                          onClick={() => setLinkToDelete(link)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                          title="Excluir link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {existingLinks.length === 0 && generatedLinks.length === 0 && (
                <div className="text-center py-16">
                  <Link2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum link gerado ainda.</p>
                  <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => setTab('novo')}>
                    Gerar primeiro link
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Gerenciar estados do usuário */}
      <Dialog open={gerenciarOpen} onOpenChange={setGerenciarOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Meus estados
            </DialogTitle>
            <DialogDescription>
              Cadastre as UFs em que você cota. Elas ficam disponíveis na geração de links, na planilha e nos relatórios.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {estadosUsuario.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum estado cadastrado.</p>
              )}
              {estadosUsuario.map(uf => (
                <span key={uf} className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-lg bg-muted text-xs font-display font-bold">
                  {uf} <span className="font-normal text-muted-foreground">{ufNome(uf)}</span>
                  <button type="button" onClick={() => removeEstado(uf)} className="p-0.5 rounded hover:bg-destructive/10 hover:text-destructive" title="Remover">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>

            <div className="flex gap-2">
              <Select value={novaUF} onValueChange={setNovaUF}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Escolher estado..." />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {UF_LIST.filter(uf => !estadosUsuario.includes(uf)).map(uf => (
                    <SelectItem key={uf} value={uf}>{uf} · {ufNome(uf)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={addEstado} disabled={!novaUF} size="sm" className="h-9 shrink-0">
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGerenciarOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <AlertDialog open={!!linkToDelete} onOpenChange={(o) => !o && setLinkToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir link de {linkToDelete?.empresa}?</AlertDialogTitle>
            <AlertDialogDescription>
              {linkToDelete?.respondido
                ? 'Este fornecedor já respondeu. Excluir o link também removerá a resposta vinculada. Esta ação não pode ser desfeita.'
                : 'O link ficará inválido e o fornecedor não conseguirá mais acessá-lo. Esta ação não pode ser desfeita.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteLink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default GerarLinkPanel;
