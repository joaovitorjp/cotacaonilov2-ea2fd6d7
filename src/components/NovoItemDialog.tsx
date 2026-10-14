import React, { useEffect, useState } from 'react';
import { Search, Plus, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export type ItemRede = { id: string; descricao: string; codigo_barras: string; codigo_interno: string; fornecedor?: string };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existentes: { codigo_barras?: string; codigo_interno?: string }[];
  onAdd: (itens: ItemRede[]) => void;
  onManual: () => void;
}

const NovoItemDialog: React.FC<Props> = ({ open, onOpenChange, existentes, onAdd, onManual }) => {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<ItemRede[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecionados, setSelecionados] = useState<ItemRede[]>([]);

  useEffect(() => { if (!open) { setBusca(''); setResultados([]); setSelecionados([]); } }, [open]);

  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setResultados([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const safe = termo.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('network_products' as any)
        .select('id,descricao,codigo_barras,codigo_interno,fornecedor')
        .or(`descricao.ilike.%${safe}%,codigo_barras.ilike.%${safe}%,codigo_interno.ilike.%${safe}%`)
        .order('descricao').limit(40);
      setResultados((data as any) ?? []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const jaNaLista = (p: ItemRede) => existentes.some(e =>
    (p.codigo_barras && e.codigo_barras === p.codigo_barras) || (p.codigo_interno && e.codigo_interno === p.codigo_interno));
  const toggle = (p: ItemRede) => setSelecionados(prev =>
    prev.some(s => s.id === p.id) ? prev.filter(s => s.id !== p.id) : [...prev, p]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Adicionar item à cotação</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input autoFocus value={busca} onChange={e => setBusca(e.target.value)} className="pl-9"
            placeholder="Pesquisar por descrição, código interno ou código de barras" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto border border-border rounded-md divide-y divide-border">
          {loading && <div className="p-4 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Buscando…</div>}
          {!loading && busca.trim().length >= 2 && !resultados.length && <div className="p-4 text-sm text-muted-foreground">Nenhum produto encontrado na base da rede.</div>}
          {!loading && busca.trim().length < 2 && <div className="p-4 text-sm text-muted-foreground">Digite ao menos 2 letras para pesquisar.</div>}
          {!loading && resultados.map(p => {
            const sel = selecionados.some(s => s.id === p.id);
            const dup = jaNaLista(p);
            return (
              <button key={p.id} type="button" onClick={() => toggle(p)}
                className={`w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-accent ${sel ? 'bg-primary/10' : ''}`}>
                <span className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-primary border-primary text-primary-foreground' : 'border-border'}`}>
                  {sel && <Check className="w-3.5 h-3.5" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{p.descricao}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.codigo_interno && <>Cód: {p.codigo_interno} · </>}EAN: {p.codigo_barras || '—'}{p.fornecedor && <> · {p.fornecedor}</>}
                  </span>
                </span>
                {dup && <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/10 text-warning shrink-0">Já na cotação</span>}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => { onManual(); onOpenChange(false); }}>
            <Plus className="w-4 h-4" />Linha em branco
          </Button>
          <Button disabled={!selecionados.length} onClick={() => { onAdd(selecionados); onOpenChange(false); }}>
            Adicionar {selecionados.length || ''} item(ns)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default NovoItemDialog;
