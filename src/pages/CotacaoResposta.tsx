import React, { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { CheckCircle2, AlertCircle, Loader2, Package, Send, Search, FileDown } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawHeader, drawChips, drawSectionTitle, drawFooter, tableStyles, PDF_COLORS } from '@/lib/pdf-theme';
import adrLogo from '@/assets/adr-logo.jpeg';
import { condicoesFromLink, parseEstados, ufNome, buildPrecosPayload, getPrecoUF, type CondicaoEstado } from '@/lib/estados';

interface Produto {
  codigo_interno: string;
  descricao: string;
  codigo_barras: string;
  categoria?: string;
  observacao?: string;
}

const CotacaoResposta = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [listaId, setListaId] = useState('');
  const [listaNome, setListaNome] = useState('');
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [prices, setPrices] = useState<Record<string, Record<number, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [linkRespondido, setLinkRespondido] = useState(false);
  const [filledCount, setFilledCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [ufs, setUfs] = useState<string[]>([]);
  const [condicoes, setCondicoes] = useState<Record<string, CondicaoEstado>>({});
  const [showBriefing, setShowBriefing] = useState(false);
  const [briefingProgress, setBriefingProgress] = useState(100);

  const tipoLabel = (t: string) => (t === 'NOTA' ? 'PREÇO NOTA' : 'IPI + ST');
  const condDe = (uf: string): CondicaoEstado => condicoes[uf] ?? { tipo: 'IPI_ST', frete: 'CIF' };
  const precoDe = (uf: string, idx: number) => prices[uf]?.[idx] ?? '';
  const setPreco = (uf: string, idx: number, value: string) =>
    setPrices(prev => ({ ...prev, [uf]: { ...(prev[uf] ?? {}), [idx]: value } }));



  useEffect(() => {
    loadData();
  }, [token]);

  useEffect(() => {
    let total = 0;
    for (const uf of ufs) {
      total += Object.values(prices[uf] ?? {}).filter(v => v && String(v).trim() !== '').length;
    }
    setFilledCount(total);
  }, [prices, ufs]);


  useEffect(() => {
    if (!showBriefing) return;
    const total = 5000;
    const start = Date.now();
    const id = window.setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / total) * 100);
      setBriefingProgress(pct);
      if (elapsed >= total) {
        window.clearInterval(id);
        setShowBriefing(false);
      }
    }, 50);
    return () => window.clearInterval(id);
  }, [showBriefing]);

  const loadData = async () => {
    if (!token) { setError('Link inválido.'); setLoading(false); return; }

    const { data, error: linkErr } = await supabase.rpc('get_cotacao_por_token', { _token: token });
    const payload = data && typeof data === 'object' && !Array.isArray(data) ? data as any : null;
    const linkData = payload?.link;
    const lista = payload?.lista;

    if (linkErr || !linkData || !lista) {
      setError('Link de cotação não encontrado ou inválido.');
      setLoading(false);
      return;
    }

    if (linkData.respondido) setLinkRespondido(true);
    setEmpresa(linkData.empresa);
    setListaId(linkData.lista_id);
    const conds = condicoesFromLink(linkData);
    const lista_ufs = Object.keys(conds).length ? Object.keys(conds) : parseEstados((linkData as any).estados);
    setCondicoes(conds);
    setUfs(lista_ufs);
    setShowBriefing(true);


    if (lista.status === 'finalizada') { setError('Esta cotação já foi encerrada.'); setLoading(false); return; }
    if ((lista as any).prazo && new Date((lista as any).prazo) < new Date()) {
      setError('O prazo para responder esta cotação expirou.'); setLoading(false); return;
    }

    setListaNome(lista.nome);
    const prods = lista.produtos as any as Produto[];
    setProdutos(prods);

    const myResp = payload?.resposta;
    if (myResp) {
      const prefilled: Record<string, Record<number, string>> = {};
      prods.forEach((p, idx) => {
        const item = (myResp.resposta as any[]).find((i: any) => i.codigo_interno === p.codigo_interno);
        if (!item) return;
        for (const uf of lista_ufs) {
          const v = getPrecoUF(item, uf);
          if (v !== undefined && v !== '') {
            prefilled[uf] = { ...(prefilled[uf] ?? {}), [idx]: String(v) };
          }
        }
      });
      setPrices(prefilled);
    }

    setLoading(false);
  };

  const handleDownloadPdf = () => {
    try {
      const doc = new jsPDF();
      let y0 = drawHeader(doc, {
        title: 'Cópia da Resposta de Cotação',
        subtitle: `Cotação: ${listaNome}`,
        meta: `Fornecedor: ${empresa}`,
      });

      const chips: { label: string; value: string; tone?: 'primary' | 'success' | 'muted' }[] = [
        { label: 'Produtos', value: String(produtos.length), tone: 'primary' },
      ];
      for (const uf of ufs) {
        const preenchidos = Object.values(prices[uf] ?? {}).filter(p => p && String(p).trim() !== '').length;
        chips.push({ label: `Preenchidos ${uf}`, value: `${preenchidos}/${produtos.length}`, tone: 'success' });
      }
      y0 = drawChips(doc, y0, chips);
      y0 = drawSectionTitle(doc, y0 + 2, 'Itens Cotados');

      const head: string[] = ['Código', 'Descrição', 'EAN'];
      ufs.forEach(uf => head.push(`Preço ${uf} (R$) - ${tipoLabel(condDe(uf).tipo)}`));

      const body = produtos.map((p, idx) => {
        const row: string[] = [p.codigo_interno, p.descricao, p.codigo_barras || '—'];
        ufs.forEach(uf => row.push(precoDe(uf, idx) || '—'));
        return row;
      });

      autoTable(doc, {
        ...tableStyles,
        head: [head],
        body,
        startY: y0,
        columnStyles: {
          0: { cellWidth: 22, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
          1: { cellWidth: 'auto' as any },
          2: { cellWidth: 30 },
        },
        didParseCell: (data: any) => {
          if (data.section !== 'body') return;
          const isPriceCol = data.column.index >= 3;
          if (isPriceCol) {
            data.cell.styles.halign = 'right';
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = PDF_COLORS.ink;
          }
        },
      });

      drawFooter(doc);
      const safeEmpresa = empresa.replace(/[^a-zA-Z0-9]+/g, '_');
      const safeLista = listaNome.replace(/[^a-zA-Z0-9]+/g, '_');
      doc.save(`cotacao_${safeLista}_${safeEmpresa}.pdf`);
      toast.success('PDF baixado com sucesso!');
    } catch {
      toast.error('Erro ao gerar PDF.');
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const resposta = produtos.map((p, idx) => ({
        codigo_interno: p.codigo_interno,
        ...buildPrecosPayload(Object.fromEntries(ufs.map(uf => [uf, precoDe(uf, idx)]))),
      }));

      if (!token) throw new Error('Link inválido');
      const { error: submitError } = await supabase.rpc('enviar_resposta_cotacao', {
        _token: token,
        _resposta: resposta,
      });
      if (submitError) throw submitError;
      handleDownloadPdf();
      setSubmitted(true);
      toast.success('Resposta enviada com sucesso!');
    } catch {
      toast.error('Erro ao enviar resposta.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProdutos = produtos.map((prod, idx) => ({ prod, idx })).filter(({ prod }) => {
    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      prod.codigo_interno.toLowerCase().includes(term) ||
      prod.descricao.toLowerCase().includes(term) ||
      prod.codigo_barras.toLowerCase().includes(term) ||
      (prod.categoria || '').toLowerCase().includes(term)
    );
  });

  const categories = useMemo(() => {
    const cats: Record<string, typeof filteredProdutos> = {};
    for (const item of filteredProdutos) {
      const cat = item.prod.categoria || 'Geral';
      if (!cats[cat]) cats[cat] = [];
      cats[cat].push(item);
    }
    return cats;
  }, [filteredProdutos]);

  const hasCategories = produtos.some(p => p.categoria && p.categoria.trim() !== '');

  const renderProductCard = (prod: Produto, idx: number) => {
    const hasAnyPrice = ufs.some(uf => precoDe(uf, idx).trim() !== '');
    return (
      <div
        key={idx}
        className={`border rounded-lg p-3 sm:p-4 transition-colors ${
          hasAnyPrice ? 'border-success/30 bg-success/5' : 'border-border bg-card'
        }`}
      >
        <div className="flex flex-col gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                {prod.codigo_interno}
              </span>
              <p className="text-sm text-foreground font-medium leading-tight truncate">
                {prod.descricao}
              </p>
            </div>
            {prod.codigo_barras && (
              <p className="text-xs text-muted-foreground mt-1 ml-0 sm:ml-12">
                EAN: {prod.codigo_barras}
              </p>
            )}
            {prod.observacao && (
              <p className="text-xs text-primary/80 mt-1 ml-0 sm:ml-12 italic">
                📝 {prod.observacao}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {ufs.map(uf => (
              <div key={uf} className="flex-1 min-w-[140px]">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">
                  {uf} ({ufNome(uf)}) · {tipoLabel(condDe(uf).tipo)}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="w-full h-10 rounded-md border border-input bg-background pl-9 pr-3 text-sm text-right font-medium focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-colors"
                    value={precoDe(uf, idx)}
                    onChange={e => setPreco(uf, idx, e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando cotação...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3 max-w-sm mx-auto px-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Cotação Indisponível</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-4 max-w-sm mx-auto px-6">
          <div className="w-16 h-16 rounded-full bg-success/10 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-success" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Resposta Enviada!</h1>
          <p className="text-muted-foreground text-sm">
            Obrigado, <span className="font-bold text-foreground">{empresa}</span>. Seus preços foram registrados com sucesso.
          </p>
        </div>
      </div>
    );
  }

  const stateCount = ufs.length;
  const totalFields = produtos.length * stateCount;
  const progress = totalFields > 0 ? Math.round((filledCount / totalFields) * 100) : 0;

  const estadoLabel = ufs.length ? ufs.join(' + ') : '—';

  const freteLabel = (f: string) => (f === 'FOB' ? 'FOB — frete por conta do destinatário' : 'CIF — frete incluso no preço');

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {showBriefing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl overflow-hidden">
            <div className="px-6 py-5 space-y-4">
              <div className="text-center">
                <h2 className="text-lg font-display font-bold text-foreground">Atenção às condições da cotação</h2>
                <p className="text-xs text-muted-foreground mt-1">Leia antes de preencher os preços</p>
              </div>

              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Estado(s)</p>
                <p className="text-base font-bold text-foreground">{estadoLabel}</p>
              </div>

              {ufs.map(uf => (
                <div key={uf} className="rounded-lg border border-border p-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">{uf} · {ufNome(uf)}</p>
                  <p className="text-sm text-foreground">Tipo de preço: <span className="font-bold">{tipoLabel(condDe(uf).tipo)}</span></p>
                  <p className="text-sm text-foreground">Frete: <span className="font-bold">{freteLabel(condDe(uf).frete)}</span></p>
                </div>
              ))}

              <p className="text-xs text-center text-muted-foreground">
                Este aviso fecha em {Math.ceil((briefingProgress / 100) * 5)}s
              </p>
            </div>
            <div className="h-1.5 bg-muted">
              <div className="h-full bg-primary transition-all duration-75" style={{ width: `${briefingProgress}%` }} />
            </div>
          </div>
        </div>
      )}
      <header className="bg-primary text-primary-foreground px-4 sm:px-6 py-4 shrink-0 shadow-md">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <img src={adrLogo} alt="COTARME" className="h-11 w-11 rounded-lg bg-white object-contain p-0.5 shrink-0" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">COTARME</h1>
            <p className="text-primary-foreground/80 text-xs sm:text-sm mt-0.5">
              Cotação: {listaNome}
            </p>
          </div>
        </div>
      </header>

      <div className="bg-card border-b border-border px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">
              Fornecedor: <span className="font-bold">{empresa}</span>
            </span>
            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
              {estadoLabel}
            </span>
            {linkRespondido && (
              <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">
                Já respondida
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{filledCount}/{totalFields} preços preenchidos</span>
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </div>

      {produtos.length > 10 && (
        <div className="bg-card border-b border-border px-4 sm:px-6 py-2 shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Buscar por código, descrição ou código de barras..."
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="bg-muted/50 border border-border rounded-lg p-3 mb-3">
            <p className="text-xs text-muted-foreground">
              Preencha os preços para {ufs.length > 1 ? 'cada estado' : 'o estado'}:{' '}
              {ufs.map(uf => `${uf} = ${ufNome(uf)}`).join(', ')}.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {ufs.map(uf => (
                <span key={uf} className="text-[11px] font-bold px-2 py-1 rounded bg-primary/10 text-primary">
                  {uf}: preços com {tipoLabel(condDe(uf).tipo)}
                </span>
              ))}
            </div>
          </div>

          {filteredProdutos.length === 0 && searchTerm.trim() ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              Nenhum produto encontrado para "{searchTerm}"
            </div>
          ) : hasCategories ? (
            Object.entries(categories).map(([cat, items]) => (
              <div key={cat}>
                <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-2 rounded-lg mb-2 z-[5]">
                  <p className="text-xs font-display font-bold text-primary uppercase tracking-wider">{cat}</p>
                  <p className="text-[10px] text-muted-foreground">{items.length} produto(s)</p>
                </div>
                {items.map(({ prod, idx }) => renderProductCard(prod, idx))}
              </div>
            ))
          ) : (
            filteredProdutos.map(({ prod, idx }) => renderProductCard(prod, idx))
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border bg-card px-4 sm:px-6 py-4 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
        <div className="max-w-3xl mx-auto">
          <Button
            variant="success"
            size="lg"
            onClick={handleSubmit}
            disabled={submitting || filledCount === 0}
            className="w-full gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
            ) : (
              <><Send className="w-4 h-4" /> Enviar Resposta ({filledCount}/{totalFields})</>
            )}
          </Button>
          {filledCount === 0 && (

            <p className="text-xs text-muted-foreground text-center mt-2">
              Preencha ao menos um preço para enviar
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CotacaoResposta;
