import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Trash2, Copy, Pencil, Download, FileSpreadsheet, Package, Users, Calendar, Search } from 'lucide-react';
import { ufsDaResposta, getPrecoUF, buildPrecosPayload } from '@/lib/estados';

interface Lista {
  id: string;
  nome: string;
  status: string;
  produtos: any[];
  created_at: string;
}

interface LinkInfo {
  empresa: string;
  respondido: boolean;
}

interface CarregarListaPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onListaSelected: (lista: Lista) => void;
  statusFilter: 'aberta' | 'finalizada';
  title: string;
  onExport?: (lista: Lista) => void;
  onDownloadResultados?: (lista: Lista, formato?: 'ciss' | 'consinco', empresa?: string) => void;
}

const CarregarListaPanel: React.FC<CarregarListaPanelProps> = ({
  open, onOpenChange, onListaSelected, statusFilter, title, onExport, onDownloadResultados,
}) => {
  const { user } = useAuth();
  const [listas, setListas] = useState<Lista[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lista | null>(null);
  const [renameTarget, setRenameTarget] = useState<Lista | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [linksMap, setLinksMap] = useState<Record<string, LinkInfo[]>>({});
  const [respostasCount, setRespostasCount] = useState<Record<string, number>>({});
  const [duplicateTarget, setDuplicateTarget] = useState<Lista | null>(null);
  const [duplicateRespostas, setDuplicateRespostas] = useState<any[]>([]);
  const [duplicateSelected, setDuplicateSelected] = useState<Record<string, Record<string, boolean>>>({});
  const [duplicateName, setDuplicateName] = useState('');
  const [duplicatePrazo, setDuplicatePrazo] = useState('');
  const [duplicatePrazoHora, setDuplicatePrazoHora] = useState('23:59');
  const [duplicating, setDuplicating] = useState(false);
  const [csvTarget, setCsvTarget] = useState<{ lista: Lista; formato: 'ciss' | 'consinco' } | null>(null);
  const [csvEmpresas, setCsvEmpresas] = useState<string[]>([]);
  const [csvEmpresaSel, setCsvEmpresaSel] = useState<string>('__todos__');
  const [searchTerm, setSearchTerm] = useState('');

  const openCsvDialog = async (lista: Lista, formato: 'ciss' | 'consinco') => {
    setCsvTarget({ lista, formato });
    setCsvEmpresaSel('__todos__');
    setCsvEmpresas([]);
    const { data } = await supabase
      .from('respostas')
      .select('empresa')
      .eq('user_id', user?.id ?? '')
      .eq('lista_id', lista.id);
    setCsvEmpresas(Array.from(new Set((data ?? []).map((r: any) => r.empresa))));
  };

  useEffect(() => {
    if (open) fetchListas();
  }, [open]);

  const fetchListas = async () => {
    setLoading(true);
    if (!user?.id) {
      setListas([]);
      setLoading(false);
      return;
    }

    const query = () => supabase
      .from('listas')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', statusFilter)
      .order('created_at', { ascending: false });

    let { data, error } = await query();

    // Falha transitória (429/401 por limite de requisições na rede): tenta de novo.
    if (error) {
      await new Promise((r) => setTimeout(r, 1500));
      ({ data, error } = await query());
    }

    if (error) {
      toast.error('Erro ao carregar listas. Verifique a conexão e tente novamente.');
      setLoading(false);
      return;
    }


    const lists = (data ?? []).map((d: any) => ({ ...d, produtos: d.produtos as any[] }));
    setListas(lists);

    // Fetch links and respostas counts for all lists
    const ids = lists.map(l => l.id);
    if (ids.length > 0) {
      const [linksRes, respostasRes] = await Promise.all([
        supabase.from('links_cotacao').select('lista_id, empresa, respondido').eq('user_id', user.id).in('lista_id', ids),
        supabase.from('respostas').select('lista_id').eq('user_id', user.id).in('lista_id', ids),
      ]);

      const lMap: Record<string, LinkInfo[]> = {};
      (linksRes.data ?? []).forEach((l: any) => {
        if (!lMap[l.lista_id]) lMap[l.lista_id] = [];
        lMap[l.lista_id].push({ empresa: l.empresa, respondido: l.respondido });
      });
      setLinksMap(lMap);

      const rCount: Record<string, number> = {};
      (respostasRes.data ?? []).forEach((r: any) => {
        rCount[r.lista_id] = (rCount[r.lista_id] || 0) + 1;
      });
      setRespostasCount(rCount);
    }

    setLoading(false);
  };

  const handleSelect = (lista: Lista) => {
    onListaSelected(lista);
    onOpenChange(false);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    if (!user?.id) return;
    await supabase.from('links_cotacao').delete().eq('lista_id', deleteTarget.id).eq('user_id', user.id);
    await supabase.from('respostas').delete().eq('lista_id', deleteTarget.id).eq('user_id', user.id);
    const { error } = await supabase.from('listas').delete().eq('id', deleteTarget.id).eq('user_id', user.id);
    if (error) {
      toast.error('Erro ao excluir lista.');
    } else {
      toast.success(`Lista "${deleteTarget.nome}" excluída.`);
      setListas(prev => prev.filter(l => l.id !== deleteTarget.id));
    }
    setDeleteTarget(null);
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    if (!user?.id) return;
    const { error } = await supabase.from('listas').update({ nome: renameValue.trim() }).eq('id', renameTarget.id).eq('user_id', user.id);
    if (error) {
      toast.error('Erro ao renomear.');
    } else {
      toast.success('Nome atualizado.');
      setListas(prev => prev.map(l => l.id === renameTarget.id ? { ...l, nome: renameValue.trim() } : l));
    }
    setRenameTarget(null);
    setRenameValue('');
  };

  const handleReplicate = async (lista: Lista) => {
    setDuplicateTarget(lista);
    setDuplicateName(`${lista.nome} (cópia)`);
    setDuplicatePrazo('');
    setDuplicatePrazoHora('23:59');
    setDuplicateSelected({});
    setDuplicateRespostas([]);
    if (lista.status === 'finalizada') {
      const { data } = await supabase
        .from('respostas')
        .select('empresa, resposta')
        .eq('user_id', user?.id ?? '')
        .eq('lista_id', lista.id);
      setDuplicateRespostas(data ?? []);
    }
  };

  const confirmReplicate = async () => {
    if (!duplicateTarget || !duplicateName.trim()) return;
    setDuplicating(true);
    try {
      const { data: novaLista, error } = await supabase
        .from('listas')
        .insert({
          nome: duplicateName.trim(),
          produtos: duplicateTarget.produtos as any,
          status: 'aberta',
          user_id: user?.id,
          ...(duplicatePrazo
            ? { prazo: new Date(`${duplicatePrazo}T${duplicatePrazoHora || '23:59'}:00`).toISOString() }
            : {}),
        })
        .select().single();
      if (error || !novaLista) throw error;

      // Copiar respostas de fornecedores selecionados, respeitando UFs escolhidas
      const chosen = duplicateRespostas
        .map(r => ({ r, sel: duplicateSelected[r.empresa] }))
        .filter(x => x.sel && Object.values(x.sel).some(Boolean));

      if (chosen.length > 0) {
        const inserts = chosen.map(({ r, sel }) => {
          const ufsSelecionadas = Object.keys(sel).filter(uf => sel[uf]);
          return {
            lista_id: novaLista.id,
            empresa: r.empresa,
            user_id: user?.id,
            resposta: (r.resposta as any[]).map((item: any) => {
              const precos: Record<string, string> = {};
              ufsSelecionadas.forEach(uf => {
                const v = getPrecoUF(item, uf);
                if (v !== undefined && v !== '') precos[uf] = String(v);
              });
              return {
                codigo_interno: item.codigo_interno,
                ...buildPrecosPayload(precos),
              };
            }),
          };
        });
        await supabase.from('respostas').insert(inserts);
      }

      toast.success(`Lista replicada como "${novaLista.nome}".`);
      setDuplicateTarget(null);
      fetchListas();
    } catch {
      toast.error('Erro ao replicar lista.');
    } finally {
      setDuplicating(false);
    }
  };

  const getProgressInfo = (listaId: string) => {
    const links = linksMap[listaId] || [];
    const total = links.length;
    const responded = links.filter(l => l.respondido).length;
    return { total, responded, links };
  };

  const filteredListas = useMemo(() => {
    if (!searchTerm.trim()) return listas;
    const term = searchTerm.trim().toLowerCase();
    return listas.filter(l => l.nome.toLowerCase().includes(term));
  }, [listas, searchTerm]);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-[95vw] sm:w-[50vw] sm:min-w-[420px] sm:max-w-[600px] p-0 flex flex-col">
          <div className="p-6 pb-0">
            <SheetHeader>
              <SheetTitle className="font-display text-xl">{title}</SheetTitle>
              <SheetDescription>
                {statusFilter === 'aberta'
                  ? 'Selecione uma lista para carregar na planilha.'
                  : 'Visualize e exporte cotações finalizadas.'}
              </SheetDescription>
            </SheetHeader>

            {statusFilter === 'finalizada' && (
              <div className="relative mt-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Pesquisar cotação finalizada..."
                  className="pl-9"
                />
              </div>
            )}
          </div>

          <div className="flex-1 overflow-auto p-6 pt-4 space-y-3">
            {loading ? (
              <p className="text-muted-foreground text-sm text-center py-8">Carregando...</p>
            ) : filteredListas.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-border rounded-lg">
                <p className="text-muted-foreground text-sm">
                  {statusFilter === 'aberta'
                    ? 'Nenhuma lista aberta encontrada.'
                    : searchTerm.trim()
                      ? 'Nenhuma cotação finalizada encontrada para essa pesquisa.'
                      : 'Nenhuma cotação finalizada.'}
                </p>
              </div>
            ) : (
              filteredListas.map(lista => {
                const progress = getProgressInfo(lista.id);
                const respostas = respostasCount[lista.id] || 0;

                return (
                  <div
                    key={lista.id}
                    className="border border-border rounded-lg overflow-hidden hover:border-primary/30 transition-all hover:shadow-sm"
                  >
                    {/* Card header - clickable */}
                    <button
                      onClick={() => handleSelect(lista)}
                      className="w-full text-left p-4 hover:bg-muted/30 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-display font-bold text-foreground text-base leading-tight">{lista.nome}</h3>
                        {statusFilter === 'finalizada' && (
                          <span className="text-[10px] font-display font-bold px-2 py-0.5 rounded-full bg-success/10 text-success shrink-0">
                            FINALIZADA
                          </span>
                        )}
                      </div>

                      {/* Meta info */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Package className="w-3 h-3" />
                          {lista.produtos.length} produtos
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {respostas} resposta{respostas !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(lista.created_at).toLocaleDateString('pt-BR')}
                        </span>
                      </div>

                      {/* Progress bar */}
                      {progress.total > 0 && (
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                            <span>{progress.responded}/{progress.total} fornecedores responderam</span>
                            <span>{Math.round((progress.responded / progress.total) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(progress.responded / progress.total) * 100}%`,
                                backgroundColor: progress.responded === progress.total
                                  ? 'hsl(var(--success))'
                                  : 'hsl(var(--primary))',
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Supplier status chips */}
                      {progress.links.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {progress.links.map((link, idx) => (
                            <span
                              key={idx}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-display ${
                                link.respondido
                                  ? 'bg-success/10 text-success'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {link.empresa}
                              {link.respondido ? ' ✓' : ' ⏳'}
                            </span>
                          ))}
                        </div>
                      )}
                    </button>

                    {/* Card actions */}
                    <div className="flex items-center gap-1 px-3 py-2 bg-muted/30 border-t border-border">
                      {statusFilter === 'aberta' && (
                        <button
                          onClick={() => { setRenameTarget(lista); setRenameValue(lista.nome); }}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Renomear"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleReplicate(lista)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Duplicar"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {statusFilter === 'finalizada' && onExport && (
                        <button
                          onClick={() => onExport(lista)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title="Exportar Excel"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {statusFilter === 'finalizada' && onDownloadResultados && (
                        <>
                          <button
                            onClick={() => openCsvDialog(lista, 'ciss')}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs"
                            title="Baixar CSV ganhadores (CISS)"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-display">CSV CISS</span>
                          </button>
                          <button
                            onClick={() => openCsvDialog(lista, 'consinco')}
                            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs"
                            title="Baixar CSV ganhadores (CONSINCO)"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-display">CSV CONSINCO</span>
                          </button>
                        </>
                      )}

                      <div className="flex-1" />
                      <button
                        onClick={() => setDeleteTarget(lista)}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Excluir"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lista?</AlertDialogTitle>
            <AlertDialogDescription>
              A lista "{deleteTarget?.nome}" e todas as suas respostas e links serão excluídos permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rename dialog */}
      <AlertDialog open={!!renameTarget} onOpenChange={(o) => { if (!o) { setRenameTarget(null); setRenameValue(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renomear lista</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} placeholder="Novo nome" className="my-2" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename} disabled={!renameValue.trim()}>Salvar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Duplicate dialog */}
      <Dialog open={!!duplicateTarget} onOpenChange={(o) => { if (!o) setDuplicateTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Duplicar cotação</DialogTitle>
            <DialogDescription>
              {duplicateTarget?.status === 'finalizada' && duplicateRespostas.length > 0
                ? 'Escolha se deseja incluir as colunas de preços de algum fornecedor na nova cotação.'
                : 'A nova cotação será criada como aberta.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground uppercase">Nome</label>
              <Input value={duplicateName} onChange={e => setDuplicateName(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground uppercase">Prazo para respostas (opcional)</label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <Input
                  type="date"
                  value={duplicatePrazo}
                  onChange={e => setDuplicatePrazo(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                />
                <Input
                  type="time"
                  value={duplicatePrazoHora}
                  onChange={e => setDuplicatePrazoHora(e.target.value)}
                  disabled={!duplicatePrazo}
                />
              </div>
            </div>
            {duplicateTarget?.status === 'finalizada' && duplicateRespostas.length > 0 && (
              <div>
                <label className="text-xs font-display font-bold text-muted-foreground uppercase">Incluir preços de fornecedores</label>
                <div className="mt-2 space-y-2 max-h-64 overflow-auto border border-border rounded-md p-2">
                  {duplicateRespostas.map((r: any) => {
                    const sel = duplicateSelected[r.empresa] || {};
                    const ufsFornecedor = ufsDaResposta(r.resposta as any[]);
                    return (
                      <div key={r.empresa} className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-medium truncate">{r.empresa}</span>
                        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
                          {ufsFornecedor.map(uf => (
                            <label key={uf} className="flex items-center gap-1 text-xs cursor-pointer">
                              <Checkbox
                                checked={!!sel[uf]}
                                onCheckedChange={(v) => setDuplicateSelected(prev => ({ ...prev, [r.empresa]: { ...(prev[r.empresa] || {}), [uf]: !!v } }))}
                              />
                              {uf}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Os preços selecionados serão pré-preenchidos como resposta do fornecedor na nova cotação.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateTarget(null)} disabled={duplicating}>Cancelar</Button>
            <Button onClick={confirmReplicate} disabled={duplicating || !duplicateName.trim()}>
              {duplicating ? 'Duplicando...' : 'Duplicar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV supplier selection */}
      <Dialog open={!!csvTarget} onOpenChange={(o) => { if (!o) setCsvTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Baixar CSV {csvTarget?.formato === 'consinco' ? 'CONSINCO' : 'CISS'}</DialogTitle>
            <DialogDescription>Escolha se deseja baixar de todos os fornecedores ganhadores ou apenas de um.</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 max-h-72 overflow-auto">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="radio" checked={csvEmpresaSel === '__todos__'} onChange={() => setCsvEmpresaSel('__todos__')} />
              Todos os fornecedores
            </label>
            {csvEmpresas.map(e => (
              <label key={e} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" checked={csvEmpresaSel === e} onChange={() => setCsvEmpresaSel(e)} />
                {e}
              </label>
            ))}
            {csvEmpresas.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhuma resposta de fornecedor encontrada.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCsvTarget(null)}>Cancelar</Button>
            <Button
              onClick={() => {
                if (csvTarget && onDownloadResultados) {
                  onDownloadResultados(csvTarget.lista, csvTarget.formato, csvEmpresaSel === '__todos__' ? undefined : csvEmpresaSel);
                }
                setCsvTarget(null);
              }}
            >
              Baixar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CarregarListaPanel;
