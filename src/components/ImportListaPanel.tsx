import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';

interface ImportListaPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

const ImportListaPanel: React.FC<ImportListaPanelProps> = ({ open, onOpenChange, onImported }) => {
  const { user } = useAuth();
  const [nome, setNome] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [prazo, setPrazo] = useState('');
  const [prazoHora, setPrazoHora] = useState('23:59');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<{ id: string; descricao: string; codigo_barras: string }[]>([]);
  const [selecionados, setSelecionados] = useState<{ id: string; descricao: string; codigo_barras: string }[]>([]);

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 2) { setResultados([]); return; }
    const t = setTimeout(async () => {
      const safe = termo.replace(/[%,()]/g, ' ');
      const { data } = await supabase.from('network_products' as any)
        .select('id,descricao,codigo_barras')
        .or(`descricao.ilike.%${safe}%,codigo_barras.ilike.%${safe}%`)
        .order('descricao').limit(30);
      setResultados((data as any) ?? []);
    }, 300);
    return () => clearTimeout(t);
  }, [busca]);

  const criarDoSistema = async () => {
    if (!nome.trim() || !selecionados.length) { toast.error('Informe o nome e adicione produtos.'); return; }
    setLoading(true);
    const insertData: any = {
      nome: nome.trim(), status: 'aberta', user_id: user?.id,
      produtos: selecionados.map(p => ({ codigo_interno: '', descricao: p.descricao, codigo_barras: p.codigo_barras, categoria: '', observacao: '' })),
    };
    if (prazo) insertData.prazo = new Date(`${prazo}T${prazoHora || '23:59'}:00`).toISOString();
    const { error } = await supabase.from('listas').insert(insertData);
    setLoading(false);
    if (error) { toast.error('Erro ao criar: ' + error.message); return; }
    toast.success(`Lista "${nome}" criada com ${selecionados.length} produtos.`);
    setNome(''); setSelecionados([]); setBusca(''); setPrazo('');
    onOpenChange(false);
    onImported();
  };

  const handleImport = async () => {
    if (!file || !nome.trim()) {
      toast.error('Informe o nome da lista e selecione um arquivo.');
      return;
    }

    setLoading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const produtos = rows
        .filter((row, idx) => idx > 0 || (row[0] && !isNaN(Number(row[0]))))
        .filter(row => row[0] || row[1] || row[2])
        .map(row => ({
          codigo_interno: String(row[0] ?? '').trim(),
          descricao: String(row[1] ?? '').trim(),
          codigo_barras: String(row[2] ?? '').trim(),
          categoria: String(row[3] ?? '').trim(),
          observacao: String(row[4] ?? '').trim(),
        }))
        .filter(p => p.codigo_interno || p.descricao);

      if (produtos.length === 0) {
        toast.error('Nenhum produto encontrado no arquivo.');
        setLoading(false);
        return;
      }

      const insertData: any = {
        nome: nome.trim(),
        produtos,
        status: 'aberta',
        user_id: user?.id,
      };

      // 5. DEADLINE: Add prazo if set
      if (prazo) {
        insertData.prazo = new Date(`${prazo}T${prazoHora || '23:59'}:00`).toISOString();
      }

      const { error } = await supabase.from('listas').insert(insertData);

      if (error) throw error;

      toast.success(`Lista "${nome}" importada com ${produtos.length} produtos.`);
      setNome('');
      setFile(null);
      setPrazo('');
      setPrazoHora('23:59');
      if (inputRef.current) inputRef.current.value = '';
      onOpenChange(false);
      onImported();
    } catch (err: any) {
      toast.error('Erro ao importar: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  // Get minimum date (today)
  const today = new Date().toISOString().split('T')[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[40vw] min-w-[360px] sm:max-w-none">
        <SheetHeader>
          <SheetTitle className="font-display">Importar Lista</SheetTitle>
          <SheetDescription>
            Anexe um arquivo .xls ou .xlsx com as colunas: Código Interno (A), Descrição (B), Código de Barras (C), Categoria (D - opcional), Observação (E - opcional).
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-display font-bold text-foreground">Nome da Lista</label>
            <Input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Cotação Março 2026"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-display font-bold text-foreground">Prazo para respostas (opcional)</label>
            <div className="mt-1 grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={prazo}
                onChange={e => setPrazo(e.target.value)}
                min={today}
              />
              <Input
                type="time"
                value={prazoHora}
                onChange={e => setPrazoHora(e.target.value)}
                disabled={!prazo}
              />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Após esta data e horário, fornecedores não poderão mais responder.
            </p>
          </div>
          <div>
            <label className="text-sm font-display font-bold text-foreground">Arquivo (.xls / .xlsx)</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xls,.xlsx"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-display file:font-bold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
            />
          </div>
          <Button onClick={handleImport} disabled={loading || !file || !nome.trim()} className="w-full">
            {loading ? 'Importando...' : 'Importar Lista'}
          </Button>

          <div className="border-t border-border pt-4 space-y-2">
            <label className="text-sm font-display font-bold text-foreground">Ou monte a lista com os produtos da sua rede</label>
            <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Pesquisar por descrição ou código de barras" />
            {resultados.length > 0 && (
              <div className="max-h-48 overflow-y-auto border border-border rounded divide-y divide-border">
                {resultados.map(p => {
                  const ja = selecionados.some(s => s.id === p.id);
                  return (
                    <button key={p.id} type="button" disabled={ja}
                      onClick={() => setSelecionados(prev => [...prev, p])}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-muted disabled:opacity-50">
                      <span className="font-bold">{p.descricao}</span>
                      <span className="text-muted-foreground ml-2">{p.codigo_barras}</span>
                      {ja ? <span className="ml-2 text-success">adicionado</span> : <span className="ml-2 text-primary">+ adicionar</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {busca.trim().length >= 2 && resultados.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Nenhum produto encontrado na base da sua rede.</p>
            )}
            {selecionados.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-bold">{selecionados.length} produto(s) selecionado(s)</p>
                <div className="max-h-48 overflow-y-auto border border-border rounded divide-y divide-border">
                  {selecionados.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                      <span>{p.descricao} <span className="text-muted-foreground">{p.codigo_barras}</span></span>
                      <button type="button" className="text-destructive" onClick={() => setSelecionados(prev => prev.filter(s => s.id !== p.id))}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button variant="secondary" onClick={criarDoSistema} disabled={loading || !nome.trim() || !selecionados.length} className="w-full">
              Criar cotação com produtos selecionados
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ImportListaPanel;
