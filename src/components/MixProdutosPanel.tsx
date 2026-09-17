import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { Plus, Trash2, Package, Tag, Search, ImagePlus, Pencil, Check, X, Table as TableIcon, LayoutGrid, Upload, Copy } from 'lucide-react';
import { prepareMixImage, imageFromTransfer, parsePrecoBR, formatPrecoBR } from '@/lib/mix-image';
import { gramaturaLabel, ordenarGramaturas } from '@/lib/gramatura';
import * as XLSX from 'xlsx';
import { gerarRelatorioMixPDF } from '@/lib/mix-pdf';

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
  gramatura: string | null;
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

const emptyProduto = { descricao: '', codigo_barras: '', codigo_interno: '', gramatura: '', preco: '', imagem: '' as string };


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
  const [editProd, setEditProd] = useState<{ id: string; descricao: string; codigo_barras: string; codigo_interno: string; gramatura: string; preco: string; imagem: string } | null>(null);
  const editFileRef = useRef<HTMLInputElement>(null);
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
      supabase.from('mix_produtos').select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,gramatura,preco,imagem_url').eq('user_id', user.id).order('descricao'),

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
          gramatura: texto(r?.[4]) || gramaturaLabel(null, texto(r?.[0])),
          preco: parsePrecoBR(texto(r?.[3])),
          imagem_url: null as string | null,
        }))
        .filter(p => p.descricao);

      if (novos.length === 0) { toast.error('Nenhum produto encontrado na planilha.'); return; }

      const { data, error } = await supabase
        .from('mix_produtos')
        .insert(novos)
        .select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,gramatura,preco,imagem_url');
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
        gramatura: form.gramatura.trim() || gramaturaLabel(null, form.descricao),
        preco: parsePrecoBR(form.preco),
        imagem_url: form.imagem || null,
      })
      .select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,gramatura,preco,imagem_url')

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

  const duplicarProduto = async (p: MixProduto) => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('mix_produtos')
      .insert({
        user_id: user.id,
        categoria_id: p.categoria_id,
        marca_id: p.marca_id,
        descricao: `${p.descricao} (cópia)`,
        codigo_barras: p.codigo_barras,
        codigo_interno: p.codigo_interno,
        gramatura: p.gramatura,
        preco: p.preco,
        imagem_url: p.imagem_url,
      })
      .select('id,categoria_id,marca_id,descricao,codigo_barras,codigo_interno,gramatura,preco,imagem_url')
      .single();
    if (error) { toast.error('Não foi possível duplicar o produto.'); return; }
    setProdutos(prev => [...prev, data as MixProduto]);
    toast.success('Produto duplicado.');
  };

  const abrirEdicao = (p: MixProduto) => {
    setEditProd({
      id: p.id,
      descricao: p.descricao,
      codigo_barras: p.codigo_barras ?? '',
      codigo_interno: p.codigo_interno ?? '',
      gramatura: p.gramatura ?? '',
      preco: p.preco === null ? '' : String(p.preco).replace('.', ','),
      imagem: p.imagem_url ?? '',
    });
  };

  const editarImagem = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await prepareMixImage(file);
      setEditProd(e => (e ? { ...e, imagem: dataUrl } : e));
    } catch (err: any) {
      toast.error(err?.message ?? 'Não foi possível usar esta imagem.');
    }
  };

  const salvarEdicao = async () => {
    if (!editProd) return;
    if (!editProd.descricao.trim()) { toast.error('Informe a descrição do produto.'); return; }
    const patch = {
      descricao: editProd.descricao.trim(),
      codigo_barras: editProd.codigo_barras.trim(),
      codigo_interno: editProd.codigo_interno.trim() || null,
      gramatura: editProd.gramatura.trim() || gramaturaLabel(null, editProd.descricao),
      preco: parsePrecoBR(editProd.preco),
      imagem_url: editProd.imagem || null,
    };
    const { error } = await supabase.from('mix_produtos').update(patch).eq('id', editProd.id);
    if (error) { toast.error('Não foi possível salvar as alterações.'); return; }
    setProdutos(prev => prev.map(p => (p.id === editProd.id ? { ...p, ...patch } : p)));
    setEditProd(null);
    toast.success('Produto atualizado.');
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
      p.descricao.toLowerCase().includes(termo)
      || (p.codigo_barras ?? '').toLowerCase().includes(termo)
      || (p.codigo_interno ?? '').toLowerCase().includes(termo)
      || (gramaturaLabel(p.gramatura, p.descricao) ?? '').toLowerCase().includes(termo))),

    [produtosCat, termo],
  );

  // Estrutura visual do comparativo: classes agrupam as marcas e cada marca ocupa uma coluna.
  const gruposComparativo = useMemo(() => {
    const grupos: { chave: Classe | 'SEM'; label: string; marcas: Marca[] }[] = CLASSES.map(classe => ({
      chave: classe,
      label: CLASSE_LABEL[classe],
      marcas: marcasCat.filter(m => m.classe === classe).sort((a, b) => a.nome.localeCompare(b.nome)),
    }));
    const semClasse = marcasCat.filter(m => !m.classe).sort((a, b) => a.nome.localeCompare(b.nome));
    if (semClasse.length) grupos.push({ chave: 'SEM', label: 'Sem classe', marcas: semClasse });
    return grupos.filter(grupo => grupo.marcas.length > 0);
  }, [marcasCat]);

  const marcasComparativo = useMemo(
    () => gruposComparativo.flatMap(grupo => grupo.marcas),
    [gruposComparativo],
  );

  const produtosComparativo = useMemo(() => {
    const porMarca: Record<string, MixProduto[]> = {};
    for (const marca of marcasComparativo) {
      porMarca[marca.id] = filtrados
        .filter(p => p.marca_id === marca.id)
        .sort((a, b) => {
          const gramA = gramaturaLabel(a.gramatura, a.descricao) ?? '';
          const gramB = gramaturaLabel(b.gramatura, b.descricao) ?? '';
          return gramA.localeCompare(gramB, 'pt-BR', { numeric: true }) || a.descricao.localeCompare(b.descricao);
        });
    }
    return porMarca;
  }, [filtrados, marcasComparativo]);

  const menorPrecoPorChave = useMemo(() => {
    const precos = new Map<string, number[]>();
    for (const p of filtrados) {
      if (typeof p.preco !== 'number') continue;
      const gram = gramaturaLabel(p.gramatura, p.descricao) ?? '';
      const chave = `${(p.codigo_barras || p.codigo_interno || p.descricao).trim().toLowerCase()}|${gram.toLowerCase()}`;
      precos.set(chave, [...(precos.get(chave) ?? []), p.preco]);
    }
    const menores = new Map<string, number>();
    for (const [chave, valores] of precos) {
      if (valores.length >= 2) menores.set(chave, Math.min(...valores));
    }
    return menores;
  }, [filtrados]);

  const chaveProduto = (p: MixProduto) => {
    const gram = gramaturaLabel(p.gramatura, p.descricao) ?? '';
    return `${(p.codigo_barras || p.codigo_interno || p.descricao).trim().toLowerCase()}|${gram.toLowerCase()}`;
  };

  /* ---------- análise de classes (comparativo) ---------- */
  const analise = useMemo(() => {
    const precoDe = (p: MixProduto) => (typeof p.preco === 'number' ? p.preco : null);
    const media = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);

    const grupos = CLASSES.map(cl => {
      const ms = marcasCat.filter(m => m.classe === cl);
      const ps = produtosCat.filter(p => ms.some(m => m.id === p.marca_id));
      const precos = ps.map(precoDe).filter((v): v is number => v !== null);
      return {
        classe: cl,
        marcas: ms.length,
        produtos: ps.length,
        media: media(precos),
        min: precos.length ? Math.min(...precos) : null,
        max: precos.length ? Math.max(...precos) : null,
      };
    });

    const semClasse = marcasCat.filter(m => !m.classe).length;
    const totalMarcas = marcasCat.length;

    // Inchaço: alguma classe concentra mais de 55% das marcas classificadas
    const classificadas = totalMarcas - semClasse;
    const inchaco = classificadas >= 3
      ? grupos.filter(g => g.marcas / classificadas > 0.55).map(g => g.classe)
      : [];

    // Harmonia: média A > B > C com folga mínima de 8%
    const gap = (maior: number | null, menor: number | null) =>
      maior !== null && menor !== null && maior > 0 ? ((maior - menor) / maior) * 100 : null;
    const ga = grupos.find(g => g.classe === 'A')!;
    const gb = grupos.find(g => g.classe === 'B')!;
    const gc = grupos.find(g => g.classe === 'C')!;
    const gapAB = gap(ga.media, gb.media);
    const gapBC = gap(gb.media, gc.media);

    // Inversões: produto de classe inferior mais caro que a média da classe superior
    const marcaDe = (id: string) => marcasCat.find(m => m.id === id);
    const inversoes = produtosCat
      .map(p => {
        const m = marcaDe(p.marca_id);
        const preco = precoDe(p);
        if (!m?.classe || preco === null) return null;
        if (m.classe === 'C' && ga.media !== null && preco > ga.media) return { p, m, ref: 'média da Classe A', valor: ga.media };
        if (m.classe === 'C' && gb.media !== null && preco > gb.media) return { p, m, ref: 'média da Classe B', valor: gb.media };
        if (m.classe === 'B' && ga.media !== null && preco > ga.media) return { p, m, ref: 'média da Classe A', valor: ga.media };
        return null;
      })
      .filter((v): v is { p: MixProduto; m: Marca; ref: string; valor: number } => v !== null)
      .sort((a, b) => (b.p.preco ?? 0) - (a.p.preco ?? 0));

    // Variedade por marca (fragrâncias/sabores = itens distintos da marca)
    const variedade = marcasCat
      .map(m => ({ marca: m, itens: produtosCat.filter(p => p.marca_id === m.id).length }))
      .sort((a, b) => b.itens - a.itens);
    const topItens = variedade[0]?.itens ?? 0;
    const mediaItens = variedade.length
      ? variedade.reduce((s, v) => s + v.itens, 0) / variedade.length
      : 0;
    const defasadas = variedade.filter(v => topItens >= 3 && v.itens < Math.max(2, mediaItens * 0.6));

    // Gramaturas: quantas medidas diferentes existem na categoria e por marca
    const contagemGram = new Map<string, number>();
    let semGramatura = 0;
    for (const p of produtosCat) {
      const g = gramaturaLabel(p.gramatura, p.descricao);
      if (!g) { semGramatura++; continue; }
      contagemGram.set(g, (contagemGram.get(g) ?? 0) + 1);
    }
    const gramaturas = ordenarGramaturas(Array.from(contagemGram.keys()))
      .map(label => ({ label, itens: contagemGram.get(label) ?? 0 }));
    const totalGramItens = gramaturas.reduce((s, g) => s + g.itens, 0);
    const gramDominante = gramaturas.reduce<{ label: string; itens: number } | null>(
      (max, g) => (!max || g.itens > max.itens ? g : max), null);
    const concentracaoGram = totalGramItens && gramDominante
      ? (gramDominante.itens / totalGramItens) * 100 : null;

    const gramPorMarca = marcasCat.map(m => {
      const set = new Set<string>();
      for (const p of produtosCat.filter(x => x.marca_id === m.id)) {
        const g = gramaturaLabel(p.gramatura, p.descricao);
        if (g) set.add(g);
      }
      return { marca: m, gramaturas: ordenarGramaturas(Array.from(set)) };
    }).sort((a, b) => b.gramaturas.length - a.gramaturas.length);
    const mediaGramMarca = gramPorMarca.length
      ? gramPorMarca.reduce((s, v) => s + v.gramaturas.length, 0) / gramPorMarca.length : 0;
    const marcasPoucaGram = gramPorMarca.filter(v => gramPorMarca[0]?.gramaturas.length >= 3 && v.gramaturas.length <= 1);

    return { grupos, semClasse, totalMarcas, inchaco, gapAB, gapBC, inversoes, variedade, mediaItens, defasadas,
      gramaturas, semGramatura, gramDominante, concentracaoGram, gramPorMarca, mediaGramMarca, marcasPoucaGram };
  }, [marcasCat, produtosCat]);

  const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`);

  const catNome = categorias.find(c => c.id === catSel)?.nome ?? '';

  /* ---------- relatório PDF do comparativo ---------- */
  const exportarPDF = () => {
    if (!marcasComparativo.length || !filtrados.length) {
      toast.error('Não há dados suficientes para gerar o relatório.');
      return;
    }
    try {
      gerarRelatorioMixPDF({
        categoria: catNome,
        totalMarcas: marcasCat.length,
        totalProdutos: produtosCat.length,
        semClasse: analise.semClasse,
        grupos: analise.grupos,
        gapAB: analise.gapAB,
        gapBC: analise.gapBC,
        inchaco: analise.inchaco,
        mediaItens: analise.mediaItens,
        defasadas: analise.defasadas.map(d => ({ nome: d.marca.nome, itens: d.itens })),
        gramaturas: analise.gramaturas,
        semGramatura: analise.semGramatura,
        gramDominante: analise.gramDominante,
        concentracaoGram: analise.concentracaoGram,
        gramPorMarca: analise.gramPorMarca.map(g => ({ nome: g.marca.nome, gramaturas: g.gramaturas })),
        mediaGramMarca: analise.mediaGramMarca,
        marcasPoucaGram: analise.marcasPoucaGram.map(v => v.marca.nome),
        inversoes: analise.inversoes.map(i => ({
          descricao: i.p.descricao,
          marca: i.m.nome,
          classe: i.m.classe ?? '—',
          preco: i.p.preco ?? 0,
          ref: i.ref,
          valor: i.valor,
        })),
        marcas: marcasComparativo.map(m => {
          const itens = produtosComparativo[m.id] ?? [];
          return {
            nome: m.nome,
            classe: m.classe ?? null,
            classeLabel: m.classe ? CLASSE_LABEL[m.classe] : 'Sem classe',
            imagem: itens.find(p => p.imagem_url)?.imagem_url ?? null,
            produtos: itens.map(p => ({
              descricao: p.descricao,
              gramatura: gramaturaLabel(p.gramatura, p.descricao),
              codigo: p.codigo_barras || p.codigo_interno || '',
              preco: typeof p.preco === 'number' ? p.preco : null,
              imagem: p.imagem_url ?? null,
              melhorPreco: typeof p.preco === 'number' && menorPrecoPorChave.get(chaveProduto(p)) === p.preco,
            })),
          };
        }),
      });
      toast.success('Relatório gerado.');
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível gerar o relatório.');
    }
  };

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

                <input
                  ref={importRef}
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  className="hidden"
                  onChange={e => { importarExcel(e.target.files?.[0] ?? null); e.target.value = ''; }}
                />
                <p className="text-[11px] text-muted-foreground">
                  Importar Excel: coluna A = Descrição, B = Código de barras, C = Código interno, D = Preço, E = Gramatura (se vazia, é lida da descrição). Classe A, B ou C (low price) definida no cabeçalho de cada marca.
                </p>


                {marcasCat.map(m => {
                  const itens = filtrados.filter(p => p.marca_id === m.id);
                  return (
                    <div key={m.id} className="rounded-xl border border-border bg-card">
                      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-border">
                        <Tag className="w-4 h-4 text-primary" />
                        <span className="font-bold text-sm">{m.nome}</span>
                        <span className="text-xs text-muted-foreground">({itens.length})</span>
                        <div className="flex items-center gap-1 ml-1">
                          {CLASSES.map(cl => (
                            <button
                              key={cl}
                              type="button"
                              title={CLASSE_LABEL[cl]}
                              onClick={() => definirClasse(m.id, m.classe === cl ? null : cl)}
                              className={`h-6 min-w-[26px] px-1.5 rounded-md border text-[11px] font-bold transition-colors ${m.classe === cl ? CLASSE_STYLE[cl] : 'border-border text-muted-foreground hover:bg-muted'}`}
                            >
                              {cl}
                            </button>
                          ))}
                          {m.classe && <span className="text-[11px] text-muted-foreground">{CLASSE_LABEL[m.classe]}</span>}
                        </div>
                        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => abrirForm(m.id)}>
                          <Plus className="w-4 h-4 mr-1" /> Produto
                        </Button>
                        <Button size="sm" variant="outline" disabled={importando} onClick={() => abrirImportacao(m.id)}>
                          <Upload className="w-4 h-4 mr-1" /> {importando ? 'Importando...' : 'Importar Excel'}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removerMarca(m.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>


                      {formMarca === m.id && (
                        <div
                          className="p-4 border-b border-border bg-muted/40 grid gap-2 sm:grid-cols-[96px_1fr_150px_140px_120px_120px_auto] items-start"
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
                          <Input value={form.codigo_interno} onChange={e => setForm(f => ({ ...f, codigo_interno: e.target.value }))} placeholder="Código interno" className="h-9" />
                          <Input value={form.gramatura} onChange={e => setForm(f => ({ ...f, gramatura: e.target.value }))} placeholder="Gramatura (2 L, 500 ml)" className="h-9" />
                          <Input value={form.preco} onChange={e => setForm(f => ({ ...f, preco: e.target.value }))} placeholder="Preço (R$)" className="h-9" />
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-9" onClick={salvarProduto}>Salvar</Button>
                            <Button size="sm" variant="ghost" className="h-9" onClick={() => { setFormMarca(null); setForm(emptyProduto); }}>Fechar</Button>
                          </div>
                          <p className="sm:col-span-7 text-[11px] text-muted-foreground">Cole a imagem com Ctrl+V nesta área, arraste o arquivo ou clique no quadrado.</p>

                        </div>
                      )}

                      <div className="divide-y divide-border">
                        {itens.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum produto nesta marca.</p>}
                        {itens.map(p => (
                          editProd?.id === p.id ? (
                            <div
                              key={p.id}
                              className="p-4 bg-muted/40 grid gap-2 sm:grid-cols-[96px_1fr_150px_140px_120px_120px_auto] items-start"
                              onPaste={e => editarImagem(imageFromTransfer(e.clipboardData))}
                              onDrop={e => { e.preventDefault(); editarImagem(imageFromTransfer(e.dataTransfer)); }}
                              onDragOver={e => e.preventDefault()}
                            >
                              <button
                                type="button"
                                onClick={() => editFileRef.current?.click()}
                                className="h-24 w-24 rounded-lg border border-dashed border-border bg-background flex items-center justify-center overflow-hidden"
                                title="Clique, cole (Ctrl+V) ou arraste a imagem"
                              >
                                {editProd.imagem
                                  ? <img src={editProd.imagem} alt={editProd.descricao} className="h-full w-full object-contain" />
                                  : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                              </button>
                              <input
                                ref={editFileRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={e => { editarImagem(e.target.files?.[0] ?? null); e.target.value = ''; }}
                              />
                              <Input value={editProd.descricao} onChange={e => setEditProd(v => v && { ...v, descricao: e.target.value })} placeholder="Descrição do produto" className="h-9" />
                              <Input value={editProd.codigo_barras} onChange={e => setEditProd(v => v && { ...v, codigo_barras: e.target.value })} placeholder="Código de barras" className="h-9" />
                              <Input value={editProd.codigo_interno} onChange={e => setEditProd(v => v && { ...v, codigo_interno: e.target.value })} placeholder="Código interno" className="h-9" />
                              <Input value={editProd.gramatura} onChange={e => setEditProd(v => v && { ...v, gramatura: e.target.value })} placeholder="Gramatura (2 L, 500 ml)" className="h-9" />
                              <Input value={editProd.preco} onChange={e => setEditProd(v => v && { ...v, preco: e.target.value })} placeholder="Preço (R$)" className="h-9" />
                              <div className="flex gap-1.5">
                                <Button size="sm" className="h-9" onClick={salvarEdicao}>Salvar</Button>
                                <Button size="sm" variant="ghost" className="h-9" onClick={() => setEditProd(null)}>Cancelar</Button>
                              </div>
                            </div>
                          ) : (
                            <div key={p.id} className="flex items-center gap-3 px-4 py-2">
                              <div className="h-10 w-10 rounded border border-border bg-background overflow-hidden flex items-center justify-center shrink-0">
                                {p.imagem_url ? <img src={p.imagem_url} alt={p.descricao} className="h-full w-full object-contain" /> : <ImagePlus className="w-4 h-4 text-muted-foreground" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-bold truncate">{p.descricao}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {p.codigo_barras || 'sem código de barras'}{p.codigo_interno ? ` • interno ${p.codigo_interno}` : ''}{gramaturaLabel(p.gramatura, p.descricao) ? ` • ${gramaturaLabel(p.gramatura, p.descricao)}` : ''}
                                </p>
                              </div>
                              <span className="text-sm font-bold tabular-nums">{formatPrecoBR(p.preco)}</span>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar" onClick={() => abrirEdicao(p)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Duplicar" onClick={() => duplicarProduto(p)}>
                                <Copy className="w-4 h-4" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="Excluir" onClick={() => removerProduto(p.id)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg font-bold">{catNome} — comparativo por marca</h3>
                  <Button size="sm" variant="outline" onClick={exportarPDF}>
                    <FileText className="w-4 h-4 mr-1.5" /> Gerar PDF
                  </Button>
                </div>

                {/* Diagnóstico das classes */}
                {marcasCat.length > 0 && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {analise.grupos.map(g => {
                        const part = analise.totalMarcas ? Math.round((g.marcas / analise.totalMarcas) * 100) : 0;
                        return (
                          <div key={g.classe} className={`rounded-xl border p-3 ${CLASSE_STYLE[g.classe]}`}>
                            <p className="text-xs font-bold uppercase">{CLASSE_LABEL[g.classe]}</p>
                            <p className="text-2xl font-bold leading-tight">{g.marcas}</p>
                            <p className="text-[11px] opacity-80">
                              marcas ({part}% do mix) • {g.produtos} produtos
                            </p>
                            <p className="text-[11px] opacity-80">
                              Média {formatPrecoBR(g.media)} • {formatPrecoBR(g.min)} a {formatPrecoBR(g.max)}
                            </p>
                          </div>
                        );
                      })}
                      <div className="rounded-xl border border-border p-3 bg-card">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Sem classe</p>
                        <p className="text-2xl font-bold leading-tight">{analise.semClasse}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {analise.semClasse ? 'Defina a classe dessas marcas na aba Cadastro.' : 'Todas as marcas estão classificadas.'}
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      {/* Equilíbrio */}
                      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Equilíbrio do mix</p>
                        {analise.inchaco.length > 0 ? (
                          <p className="text-sm">
                            A <strong>Classe {analise.inchaco.join(' e ')}</strong> concentra mais da metade das marcas desta categoria — mix inchado nessa faixa.
                          </p>
                        ) : (
                          <p className="text-sm">Distribuição equilibrada entre as classes desta categoria.</p>
                        )}
                        {analise.grupos.filter(g => g.marcas === 0).length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            Sem nenhuma marca em: {analise.grupos.filter(g => g.marcas === 0).map(g => `Classe ${g.classe}`).join(', ')}.
                          </p>
                        )}
                      </div>

                      {/* Escada de preço */}
                      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Escada de preço</p>
                        <p className="text-sm">
                          Classe B está <strong>{pct(analise.gapAB)}</strong> abaixo da A;
                          Classe C está <strong>{pct(analise.gapBC)}</strong> abaixo da B.
                        </p>
                        <p className={`text-sm ${(analise.gapAB ?? 0) >= 8 && (analise.gapBC ?? 0) >= 8 ? 'text-success' : 'text-warning'}`}>
                          {(analise.gapAB ?? -1) >= 8 && (analise.gapBC ?? -1) >= 8
                            ? 'Escada saudável: cada classe é claramente mais barata que a de cima.'
                            : 'Escada apertada: as classes têm preços muito próximos e competem entre si.'}
                        </p>
                      </div>

                      {/* Variedade */}
                      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Variedade por marca</p>
                        <p className="text-sm">
                          Média de <strong>{analise.mediaItens.toFixed(1)}</strong> itens (sabores/fragrâncias) por marca.
                        </p>
                        {analise.defasadas.length > 0 ? (
                          <p className="text-sm text-warning">
                            Pouca variedade em: {analise.defasadas.slice(0, 4).map(v => `${v.marca.nome} (${v.itens})`).join(', ')}.
                          </p>
                        ) : (
                          <p className="text-sm text-success">Nenhuma marca defasada em variedade.</p>
                        )}
                      </div>
                    </div>

                    {/* Gramaturas */}
                    <div className="grid gap-3 lg:grid-cols-2">
                      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Gramaturas da categoria</p>
                        {analise.gramaturas.length === 0 ? (
                          <p className="text-sm text-muted-foreground">Nenhuma gramatura identificada. Informe no cadastro (ex.: 2 L, 500 ml).</p>
                        ) : (
                          <>
                            <p className="text-sm">
                              <strong>{analise.gramaturas.length}</strong> gramaturas diferentes em {catNome}.
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {analise.gramaturas.map(g => (
                                <span key={g.label} className="px-2 py-0.5 rounded-md border border-border bg-muted text-[11px] font-bold">
                                  {g.label} <span className="font-normal text-muted-foreground">({g.itens})</span>
                                </span>
                              ))}
                            </div>
                            <p className={`text-sm ${(analise.concentracaoGram ?? 0) > 60 ? 'text-warning' : 'text-success'}`}>
                              {(analise.concentracaoGram ?? 0) > 60
                                ? `Concentração alta: ${Math.round(analise.concentracaoGram ?? 0)}% dos produtos são ${analise.gramDominante?.label}. Falta variedade de tamanhos.`
                                : 'Boa distribuição entre os tamanhos oferecidos.'}
                            </p>
                            {analise.semGramatura > 0 && (
                              <p className="text-[11px] text-muted-foreground">{analise.semGramatura} produtos sem gramatura informada.</p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                        <p className="text-xs font-bold uppercase text-muted-foreground">Gramaturas por marca</p>
                        <p className="text-sm">
                          Média de <strong>{analise.mediaGramMarca.toFixed(1)}</strong> tamanhos por marca.
                        </p>
                        <ul className="space-y-0.5 text-sm max-h-40 overflow-auto">
                          {analise.gramPorMarca.map(v => (
                            <li key={v.marca.id} className="flex items-start gap-2">
                              <strong className="shrink-0">{v.marca.nome}</strong>
                              <span className="text-muted-foreground">
                                {v.gramaturas.length ? `${v.gramaturas.length} — ${v.gramaturas.join(', ')}` : 'sem gramaturas informadas'}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {analise.marcasPoucaGram.length > 0 && (
                          <p className="text-sm text-warning">
                            Pouca variedade de tamanhos em: {analise.marcasPoucaGram.slice(0, 4).map(v => v.marca.nome).join(', ')}.
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Inversões */}
                    {analise.inversoes.length > 0 && (
                      <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
                        <p className="text-xs font-bold uppercase text-warning mb-1.5">
                          {analise.inversoes.length} produtos fora da faixa da sua classe
                        </p>
                        <ul className="space-y-0.5 text-sm">
                          {analise.inversoes.slice(0, 6).map(inv => (
                            <li key={inv.p.id}>
                              <strong>{inv.m.nome}</strong> (Classe {inv.m.classe}) — {inv.p.descricao}: {formatPrecoBR(inv.p.preco)} acima da {inv.ref} ({formatPrecoBR(inv.valor)}).
                            </li>
                          ))}
                        </ul>
                        {analise.inversoes.length > 6 && (
                          <p className="text-[11px] text-muted-foreground mt-1">e mais {analise.inversoes.length - 6} itens.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                {marcasCat.length === 0 || filtrados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Cadastre marcas e produtos para ver o comparativo.</p>
                ) : (
                  <div className="overflow-auto border border-border rounded-xl bg-card">
                    <table className="w-full min-w-max text-sm border-collapse table-fixed">
                      <thead className="sticky top-0 z-10">
                        <tr>
                          {gruposComparativo.map(grupo => (
                            <th
                              key={grupo.chave}
                              colSpan={grupo.marcas.length}
                              className={`border border-border px-3 py-2 text-center text-xs font-bold uppercase ${grupo.chave === 'SEM' ? 'bg-muted text-muted-foreground' : CLASSE_STYLE[grupo.chave]}`}
                            >
                              {grupo.label}
                            </th>
                          ))}
                        </tr>
                        <tr className="bg-muted">
                          {marcasComparativo.map(marca => (
                            <th key={marca.id} className="border border-border px-3 py-2 text-center font-bold w-[230px] min-w-[230px]">
                              {marca.nome}
                            </th>
                          ))}
                        </tr>
                        <tr className="bg-card">
                          {marcasComparativo.map(marca => {
                            const imagem = produtosComparativo[marca.id]?.find(p => p.imagem_url)?.imagem_url;
                            return (
                              <th key={marca.id} className="border border-border p-2 h-28 align-middle">
                                <div className="h-24 w-full flex items-center justify-center overflow-hidden">
                                  {imagem
                                    ? <img src={imagem} alt={`Imagem representativa da marca ${marca.nome}`} className="h-full max-w-full object-contain" />
                                    : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: Math.max(...marcasComparativo.map(m => produtosComparativo[m.id]?.length ?? 0)) }).map((_, indice) => (
                          <React.Fragment key={indice}>
                            <tr className={indice % 2 ? 'bg-muted/30' : 'bg-card'}>
                              {marcasComparativo.map(marca => {
                                const prod = produtosComparativo[marca.id]?.[indice];
                                return (
                                  <td key={marca.id} className="border border-border px-3 py-2 align-top text-center">
                                    {prod ? (
                                      <>
                                        <p className="font-medium leading-snug">{prod.descricao}</p>
                                        <p className="mt-1 text-[11px] text-muted-foreground">
                                          {[gramaturaLabel(prod.gramatura, prod.descricao), prod.codigo_barras || prod.codigo_interno].filter(Boolean).join(' • ')}
                                        </p>
                                      </>
                                    ) : <span className="text-muted-foreground">—</span>}
                                  </td>
                                );
                              })}
                            </tr>
                            <tr className={indice % 2 ? 'bg-muted/30' : 'bg-card'}>
                              {marcasComparativo.map(marca => {
                                const prod = produtosComparativo[marca.id]?.[indice];
                                const menor = prod ? menorPrecoPorChave.get(chaveProduto(prod)) : undefined;
                                const destaque = prod && menor !== undefined && prod.preco === menor;
                                return (
                                  <td
                                    key={marca.id}
                                    className={`border border-border px-3 py-2 text-center tabular-nums cursor-text ${destaque ? 'text-success font-bold' : 'font-semibold'}`}
                                    onDoubleClick={() => prod && setPrecoEdit({ id: prod.id, valor: prod.preco === null ? '' : String(prod.preco).replace('.', ',') })}
                                  >
                                    {!prod ? <span className="text-muted-foreground">—</span> : precoEdit?.id === prod.id ? (
                                      <input
                                        autoFocus
                                        value={precoEdit.valor}
                                        onChange={e => setPrecoEdit({ id: prod.id, valor: e.target.value })}
                                        onBlur={salvarPreco}
                                        onKeyDown={e => { if (e.key === 'Enter') salvarPreco(); if (e.key === 'Escape') setPrecoEdit(null); }}
                                        className="w-full bg-transparent text-center outline-none"
                                      />
                                    ) : formatPrecoBR(prod.preco)}
                                  </td>
                                );
                              })}
                            </tr>
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Cada coluna representa uma marca, agrupada por classe, com uma imagem representativa. Dois cliques no preço para editar.</p>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MixProdutosPanel;
