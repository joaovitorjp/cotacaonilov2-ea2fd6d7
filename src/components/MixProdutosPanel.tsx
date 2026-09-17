import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Trash2, Package, Tag, Search, ImagePlus, Pencil, Check, X, Table as TableIcon, LayoutGrid, Upload } from 'lucide-react';
import { prepareMixImage, imageFromTransfer, parsePrecoBR, formatPrecoBR } from '@/lib/mix-image';
import * as XLSX from 'xlsx';

type Classe = 'A' | 'B' | 'C';

interface Categoria { id: string; nome: string; }
interface Marca { id: string; categoria_id: string; nome: string; classe: Classe | null; }
interface MixProduto {
  id: string;
  categoria_id: string;
  marca_id: string;
  descricao: string;
  codigo_barras: string;
  codigo_interno: string | null;
  preco: number | null;
  imagem_url: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CLASSES: Classe[] = ['A', 'B', 'C'];
const CLASSE_LABEL: Record<Classe, string> = { A: 'Classe A', B: 'Classe B', C: 'Classe C (low price)' };
const CLASSE_STYLE: Record<Classe, string> = {
  A: 'bg-primary/10 text-primary border-primary/30',
  B: 'bg-warning/10 text-warning border-warning/30',
  C: 'bg-muted text-muted-foreground border-border',
};

const emptyProduto = { descricao: '', codigo_barras: '', codigo_interno: '', preco: '', imagem: '' as string };


const MixProdutosPanel: React.FC<Props> = ({ open, onOpenChange }) => {
  const { user } = useAuth();
  const [aba, setAba] = useState<'cadastro' | 'comparativo'>('cadastro');
  const [loading, setLoading] = useState(false);

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [produtos, setProdutos] = useState<MixProduto[]>([]);
  const [catSel, setCatSel] = useState<string | null>(null);

  const [novaCategoria, setNovaCategoria] = useState('');
  const [novaMarca, setNovaMarca] = useState('');
  const [editCat, setEditCat] = useState<{ id: string; nome: string } | null>(null);
  const [busca, setBusca] = useState('');

  const [formMarca, setFormMarca] = useState<string | null>(null);
  const [form, setForm] = useState(emptyProduto);
  const fileRef = useRef<HTMLInputElement>(null);

  const [precoEdit, setPrecoEdit] = useState<{ id: string; valor: string } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const importMarcaRef = useRef<string | null>(null);
  const [importando, setImportando] = useState(false);


  useEffect(() => {
    if (open) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const carregar = async () => {
    if (!user?.id) return;
    setLoading(true);
    const [cats, mks, prods] = await Promise.all([
      supabase.from('mix_categorias').select('id,nome').eq('user_id', user.id).order('nome'),
      supabase.from('mix_marcas').select('id,categoria_id,nome,classe').eq('user_id', user.id).order('nome'),
      supabase.from('mix_produtos').select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,preco,imagem_url').eq('user_id', user.id).order('descricao'),

    ]);
    const listaCats = (cats.data ?? []) as Categoria[];
    setCategorias(listaCats);
    setMarcas((mks.data ?? []) as Marca[]);
    setProdutos((prods.data ?? []) as MixProduto[]);
    setCatSel(prev => prev && listaCats.some(c => c.id === prev) ? prev : (listaCats[0]?.id ?? null));
    setLoading(false);
  };

  /* ---------- categorias ---------- */
  const addCategoria = async () => {
    const nome = novaCategoria.trim();
    if (!nome || !user?.id) return;
    const { data, error } = await supabase.from('mix_categorias').insert({ user_id: user.id, nome }).select('id,nome').single();
    if (error) { toast.error('Não foi possível criar a categoria.'); return; }
    setCategorias(prev => [...prev, data as Categoria].sort((a, b) => a.nome.localeCompare(b.nome)));
    setCatSel((data as Categoria).id);
    setNovaCategoria('');
  };

  const salvarNomeCategoria = async () => {
    if (!editCat) return;
    const nome = editCat.nome.trim();
    if (!nome) { setEditCat(null); return; }
    const { error } = await supabase.from('mix_categorias').update({ nome }).eq('id', editCat.id);
    if (error) { toast.error('Não foi possível renomear.'); return; }
    setCategorias(prev => prev.map(c => c.id === editCat.id ? { ...c, nome } : c).sort((a, b) => a.nome.localeCompare(b.nome)));
    setEditCat(null);
  };

  const removerCategoria = async (id: string) => {
    if (!window.confirm('Excluir esta categoria com todas as marcas e produtos?')) return;
    const { error } = await supabase.from('mix_categorias').delete().eq('id', id);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    setCategorias(prev => prev.filter(c => c.id !== id));
    setMarcas(prev => prev.filter(m => m.categoria_id !== id));
    setProdutos(prev => prev.filter(p => p.categoria_id !== id));
    setCatSel(prev => (prev === id ? null : prev));
  };

  /* ---------- marcas ---------- */
  const addMarca = async () => {
    const nome = novaMarca.trim();
    if (!nome || !catSel || !user?.id) return;
    const { data, error } = await supabase
      .from('mix_marcas')
      .insert({ user_id: user.id, categoria_id: catSel, nome })
      .select('id,categoria_id,nome,classe')
      .single();
    if (error) { toast.error('Não foi possível criar a marca.'); return; }
    setMarcas(prev => [...prev, data as Marca].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNovaMarca('');
  };

  const definirClasse = async (id: string, classe: Classe | null) => {
    const { error } = await supabase.from('mix_marcas').update({ classe }).eq('id', id);
    if (error) { toast.error('Não foi possível definir a classe.'); return; }
    setMarcas(prev => prev.map(m => (m.id === id ? { ...m, classe } : m)));
  };

  const removerMarca = async (id: string) => {
    if (!window.confirm('Excluir esta marca e seus produtos?')) return;
    const { error } = await supabase.from('mix_marcas').delete().eq('id', id);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    setMarcas(prev => prev.filter(m => m.id !== id));
    setProdutos(prev => prev.filter(p => p.marca_id !== id));
  };

  /* ---------- importação em lote (Excel) ---------- */
  const abrirImportacao = (marcaId: string) => {
    importMarcaRef.current = marcaId;
    importRef.current?.click();
  };

  const importarExcel = async (file: File | null) => {
    const marcaId = importMarcaRef.current;
    if (!file || !marcaId || !catSel || !user?.id) return;
    setImportando(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      const texto = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
      const cabecalho = rows[0]?.some((c: any) => /descri|produto|c[oó]digo|pre[cç]o/i.test(texto(c)));
      const dados = cabecalho ? rows.slice(1) : rows;

      const novos = dados
        .map(r => ({
          user_id: user.id,
          categoria_id: catSel,
          marca_id: marcaId,
          descricao: texto(r?.[0]),
          codigo_barras: texto(r?.[1]),
          codigo_interno: texto(r?.[2]) || null,
          preco: parsePrecoBR(texto(r?.[3])),
          imagem_url: null as string | null,
        }))
        .filter(p => p.descricao);

      if (novos.length === 0) { toast.error('Nenhum produto encontrado na planilha.'); return; }

      const { data, error } = await supabase
        .from('mix_produtos')
        .insert(novos)
        .select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,preco,imagem_url');
      if (error) { toast.error('Não foi possível importar os produtos.'); return; }
      setProdutos(prev => [...prev, ...((data ?? []) as MixProduto[])]);
      toast.success(`${novos.length} produtos importados.`);
    } catch (e: any) {
      toast.error('Não foi possível ler o arquivo. Use .xls ou .xlsx.');
    } finally {
      setImportando(false);
      importMarcaRef.current = null;
    }
  };


  /* ---------- produtos ---------- */
  const abrirForm = (marcaId: string) => {
    setFormMarca(marcaId);
    setForm(emptyProduto);
  };

  const anexarImagem = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await prepareMixImage(file);
      setForm(f => ({ ...f, imagem: dataUrl }));
    } catch (e: any) {
      toast.error(e?.message ?? 'Não foi possível usar esta imagem.');
    }
  };

  const salvarProduto = async () => {
    if (!formMarca || !catSel || !user?.id) return;
    if (!form.descricao.trim()) { toast.error('Informe a descrição do produto.'); return; }
    const { data, error } = await supabase
      .from('mix_produtos')
      .insert({
        user_id: user.id,
        categoria_id: catSel,
        marca_id: formMarca,
        descricao: form.descricao.trim(),
        codigo_barras: form.codigo_barras.trim(),
        codigo_interno: form.codigo_interno.trim() || null,
        preco: parsePrecoBR(form.preco),
        imagem_url: form.imagem || null,
      })
      .select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,preco,imagem_url')

      .single();
    if (error) { toast.error('Não foi possível salvar o produto.'); return; }
    setProdutos(prev => [...prev, data as MixProduto]);
    setForm(emptyProduto);
    toast.success('Produto adicionado.');
  };

  const removerProduto = async (id: string) => {
    const { error } = await supabase.from('mix_produtos').delete().eq('id', id);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    setProdutos(prev => prev.filter(p => p.id !== id));
  };

  const salvarPreco = async () => {
    if (!precoEdit) return;
    const valor = parsePrecoBR(precoEdit.valor);
    const { error } = await supabase.from('mix_produtos').update({ preco: valor }).eq('id', precoEdit.id);
    if (error) { toast.error('Não foi possível salvar o preço.'); return; }
    setProdutos(prev => prev.map(p => (p.id === precoEdit.id ? { ...p, preco: valor } : p)));
    setPrecoEdit(null);
  };

  /* ---------- derivados ---------- */
  const marcasCat = useMemo(() => marcas.filter(m => m.categoria_id === catSel), [marcas, catSel]);
  const produtosCat = useMemo(() => produtos.filter(p => p.categoria_id === catSel), [produtos, catSel]);

  const termo = busca.trim().toLowerCase();
  const filtrados = useMemo(
    () => (!termo ? produtosCat : produtosCat.filter(p =>
      p.descricao.toLowerCase().includes(termo) || (p.codigo_barras ?? '').toLowerCase().includes(termo))),
    [produtosCat, termo],
  );

  // Linhas do comparativo: mesmo produto (código de barras ou descrição) lado a lado por marca.
  const linhas = useMemo(() => {
    const map = new Map<string, { chave: string; descricao: string; codigo: string; imagem: string | null; porMarca: Record<string, MixProduto> }>();
    for (const p of filtrados) {
      const chave = (p.codigo_barras || p.descricao).trim().toLowerCase();
      const atual = map.get(chave) ?? { chave, descricao: p.descricao, codigo: p.codigo_barras, imagem: p.imagem_url, porMarca: {} };
      atual.imagem = atual.imagem ?? p.imagem_url;
      atual.porMarca[p.marca_id] = p;
      map.set(chave, atual);
    }
    return Array.from(map.values()).sort((a, b) => a.descricao.localeCompare(b.descricao));
  }, [filtrados]);

  const menorPreco = (linha: (typeof linhas)[number]) => {
    const valores = Object.values(linha.porMarca).map(p => p.preco).filter((v): v is number => typeof v === 'number');
    return valores.length >= 2 ? Math.min(...valores) : null;
  };

  const catNome = categorias.find(c => c.id === catSel)?.nome ?? '';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-none sm:w-[95vw] p-0 flex flex-col">
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
          <SheetTitle className="flex items-center gap-2 font-display">
            <Package className="w-5 h-5 text-primary" /> Mix de Produtos
          </SheetTitle>
          <SheetDescription>
            Cadastre suas categorias, marcas e produtos e compare preços lado a lado.
          </SheetDescription>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button variant={aba === 'cadastro' ? 'default' : 'outline'} size="sm" onClick={() => setAba('cadastro')}>
              <LayoutGrid className="w-4 h-4 mr-1.5" /> Cadastro
            </Button>
            <Button variant={aba === 'comparativo' ? 'default' : 'outline'} size="sm" onClick={() => setAba('comparativo')}>
              <TableIcon className="w-4 h-4 mr-1.5" /> Comparativo
            </Button>
            <div className="relative ml-auto w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por descrição ou código" className="pl-9 h-9" />
            </div>
          </div>
        </SheetHeader>

        <div className="flex-1 min-h-0 flex">
          {/* Categorias */}
          <aside className="w-60 shrink-0 border-r border-border p-4 overflow-y-auto">
            <p className="text-xs font-bold uppercase text-muted-foreground mb-2">Categorias</p>
            <div className="flex gap-1.5 mb-3">
              <Input
                value={novaCategoria}
                onChange={e => setNovaCategoria(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addCategoria()}
                placeholder="Ex.: AMACIANTES"
                className="h-9"
              />
              <Button size="icon" className="h-9 w-9 shrink-0" onClick={addCategoria}><Plus className="w-4 h-4" /></Button>
            </div>
            <div className="space-y-1">
              {categorias.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground">Nenhuma categoria cadastrada.</p>
              )}
              {categorias.map(c => (
                <div
                  key={c.id}
                  className={`group flex items-center gap-1 rounded-lg px-2 py-1.5 cursor-pointer ${catSel === c.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'}`}
                  onClick={() => setCatSel(c.id)}
                >
                  {editCat?.id === c.id ? (
                    <>
                      <Input
                        autoFocus
                        value={editCat.nome}
                        onChange={e => setEditCat({ id: c.id, nome: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') salvarNomeCategoria(); if (e.key === 'Escape') setEditCat(null); }}
                        className="h-7 text-sm"
                        onClick={e => e.stopPropagation()}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); salvarNomeCategoria(); }}><Check className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); setEditCat(null); }}><X className="w-3.5 h-3.5" /></Button>
                    </>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-bold truncate">{c.nome}</span>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={e => { e.stopPropagation(); setEditCat({ id: c.id, nome: c.nome }); }}>
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 opacity-0 group-hover:opacity-100 text-destructive" onClick={e => { e.stopPropagation(); removerCategoria(c.id); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </aside>

          {/* Conteúdo */}
          <div className="flex-1 min-w-0 overflow-auto p-5">
            {!catSel ? (
              <p className="text-sm text-muted-foreground">Crie uma categoria para começar.</p>
            ) : aba === 'cadastro' ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-lg font-bold">{catNome}</h3>
                  <span className="text-xs text-muted-foreground">{marcasCat.length} marcas • {produtosCat.length} produtos</span>
                  <div className="flex gap-1.5 ml-auto w-full sm:w-auto">
                    <Input
                      value={novaMarca}
                      onChange={e => setNovaMarca(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addMarca()}
                      placeholder="Nova marca"
                      className="h-9 sm:w-56"
                    />
                    <Button size="sm" className="h-9" onClick={addMarca}><Plus className="w-4 h-4 mr-1" /> Marca</Button>
                  </div>
                </div>

                {marcasCat.length === 0 && <p className="text-sm text-muted-foreground">Cadastre a primeira marca desta categoria.</p>}

                {marcasCat.map(m => {
                  const itens = filtrados.filter(p => p.marca_id === m.id);
                  return (
                    <div key={m.id} className="rounded-xl border border-border bg-card">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                        <Tag className="w-4 h-4 text-primary" />
                        <span className="font-bold text-sm">{m.nome}</span>
                        <span className="text-xs text-muted-foreground">({itens.length})</span>
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => abrirForm(m.id)}>
                          <Plus className="w-4 h-4 mr-1" /> Produto
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removerMarca(m.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      {formMarca === m.id && (
                        <div
                          className="p-4 border-b border-border bg-muted/40 grid gap-2 sm:grid-cols-[96px_1fr_180px_140px_auto] items-start"
                          onPaste={e => anexarImagem(imageFromTransfer(e.clipboardData))}
                          onDrop={e => { e.preventDefault(); anexarImagem(imageFromTransfer(e.dataTransfer)); }}
                          onDragOver={e => e.preventDefault()}
                        >
                          <button
                            type="button"
                            onClick={() => fileRef.current?.click()}
                            className="h-24 w-24 rounded-lg border border-dashed border-border bg-background flex items-center justify-center overflow-hidden"
                            title="Clique, cole (Ctrl+V) ou arraste a imagem"
                          >
                            {form.imagem
                              ? <img src={form.imagem} alt="Produto" className="h-full w-full object-contain" />
                              : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                          </button>
                          <input
                            ref={fileRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => { anexarImagem(e.target.files?.[0] ?? null); e.target.value = ''; }}
                          />
                          <Input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Descrição do produto" className="h-9" />
                          <Input value={form.codigo_barras} onChange={e => setForm(f => ({ ...f, codigo_barras: e.target.value }))} placeholder="Código de barras" className="h-9" />
                          <Input value={form.preco} onChange={e => setForm(f => ({ ...f, preco: e.target.value }))} placeholder="Preço (R$)" className="h-9" />
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-9" onClick={salvarProduto}>Salvar</Button>
                            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFormMarca(null); setForm(emptyProduto); }}>Fechar</Button>
                          </div>
                          <p className="sm:col-span-5 text-[11px] text-muted-foreground">Cole a imagem com Ctrl+V nesta área, arraste o arquivo ou clique no quadrado.</p>
                        </div>
                      )}

                      <div className="divide-y divide-border">
                        {itens.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum produto nesta marca.</p>}
                        {itens.map(p => (
                          <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                            <div className="h-10 w-10 rounded border border-border bg-background overflow-hidden flex items-center justify-center shrink-0">
                              {p.imagem_url ? <img src={p.imagem_url} alt={p.descricao} className="h-full w-full object-contain" /> : <ImagePlus className="w-4 h-4 text-muted-foreground" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold truncate">{p.descricao}</p>
                              <p className="text-[11px] text-muted-foreground">{p.codigo_barras || 'sem código'}</p>
                            </div>
                            <span className="text-sm font-bold tabular-nums">{formatPrecoBR(p.preco)}</span>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removerProduto(p.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="font-display text-lg font-bold">{catNome} — comparativo por marca</h3>
                {marcasCat.length === 0 || linhas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Cadastre marcas e produtos para ver o comparativo.</p>
                ) : (
                  <div className="overflow-auto border border-border rounded-xl bg-card">
                    <table className="text-sm border-collapse">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-muted">
                          <th className="border border-border px-3 py-2 text-left font-bold w-[90px]">Imagem</th>
                          <th className="border border-border px-3 py-2 text-left font-bold min-w-[260px]">Produto</th>
                          <th className="border border-border px-3 py-2 text-left font-bold min-w-[150px]">Código de barras</th>
                          {marcasCat.map(m => (
                            <th key={m.id} className="border border-border px-3 py-2 text-center font-bold min-w-[130px]">{m.nome}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {linhas.map((linha, i) => {
                          const min = menorPreco(linha);
                          return (
                            <tr key={linha.chave} className={i % 2 ? 'bg-muted/30' : ''}>
                              <td className="border border-border px-2 py-1.5">
                                <div className="h-10 w-10 mx-auto overflow-hidden flex items-center justify-center">
                                  {linha.imagem
                                    ? <img src={linha.imagem} alt={linha.descricao} className="h-full w-full object-contain" />
                                    : <ImagePlus className="w-4 h-4 text-muted-foreground" />}
                                </div>
                              </td>
                              <td className="border border-border px-3 py-1.5 font-medium">{linha.descricao}</td>
                              <td className="border border-border px-3 py-1.5 text-muted-foreground tabular-nums">{linha.codigo || '-'}</td>
                              {marcasCat.map(m => {
                                const prod = linha.porMarca[m.id];
                                const destaque = prod && min !== null && prod.preco === min;
                                return (
                                  <td
                                    key={m.id}
                                    className={`border border-border px-3 py-1.5 text-right tabular-nums cursor-text ${destaque ? 'text-success font-bold' : ''}`}
                                    onDoubleClick={() => prod && setPrecoEdit({ id: prod.id, valor: prod.preco === null ? '' : String(prod.preco).replace('.', ',') })}
                                  >
                                    {!prod ? (
                                      <span className="text-muted-foreground">—</span>
                                    ) : precoEdit?.id === prod.id ? (
                                      <input
                                        autoFocus
                                        value={precoEdit.valor}
                                        onChange={e => setPrecoEdit({ id: prod.id, valor: e.target.value })}
                                        onBlur={salvarPreco}
                                        onKeyDown={e => { if (e.key === 'Enter') salvarPreco(); if (e.key === 'Escape') setPrecoEdit(null); }}
                                        className="w-full bg-transparent text-right outline-none"
                                      />
                                    ) : (
                                      formatPrecoBR(prod.preco)
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Dois cliques em um preço para editar. O menor preço da linha aparece em verde.</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MixProdutosPanel;
