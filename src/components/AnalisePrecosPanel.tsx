import React, { useEffect, useMemo, useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart3, Trophy, TrendingDown, History, FileDown, Send } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawHeader, drawChips, drawSectionTitle, drawFooter, tableStyles, PDF_COLORS, formatBRL } from '@/lib/pdf-theme';
import { ordenarUFs, ufsDaResposta, getPrecoUF, ufNome } from '@/lib/estados';
import { useEstadosUsuario } from '@/hooks/useEstadosUsuario';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface Produto {
  codigo_interno: string;
  descricao: string;
  codigo_barras: string;
  categoria?: string;
  observacao?: string;
}

interface RespostaEmpresa {
  empresa: string;
  resposta: { codigo_interno: string; preco?: number | string; preco_mt?: number | string; preco_go?: number | string; precos?: Record<string, number | string>; [k: string]: any }[];
}

interface AnalisePrecosPanelProps {
  produtos: Produto[];
  respostas: RespostaEmpresa[];
  listaNome?: string;
}

const parsePreco = (raw: number | string): number => {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string' && raw !== '') return parseFloat(raw.replace(/\./g, '').replace(',', '.'));
  return NaN;
};

// Busca o item da resposta correspondente ao produto, priorizando o
// código interno e caindo para o código de barras quando necessário.
// Isso evita ausência de estatísticas quando um dos campos está vazio.
const norm = (v: any) => (v === undefined || v === null ? '' : String(v).trim());
const findRespItem = (items: any[] | undefined, prod: { codigo_interno: string; codigo_barras?: string }): any | undefined => {
  if (!items || items.length === 0) return undefined;
  const ci = norm(prod.codigo_interno);
  const cb = norm(prod.codigo_barras);
  if (ci) {
    const byCi = items.find((i: any) => norm(i.codigo_interno) === ci);
    if (byCi) return byCi;
  }
  if (cb) {
    const byCb = items.find((i: any) => norm(i.codigo_barras) === cb);
    if (byCb) return byCb;
  }
  return undefined;
};

interface HistoricoItem {
  listaNome: string;
  data: string;
  menorPreco: number;
  empresa: string;
}

const AnalisePrecosPanel: React.FC<AnalisePrecosPanelProps> = ({ produtos, respostas, listaNome }) => {
  const [historico, setHistorico] = useState<Record<string, HistoricoItem[]>>({});
  const [showHistorico, setShowHistorico] = useState(false);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [showComparativoDialog, setShowComparativoDialog] = useState(false);
  const [estadoComparativo, setEstadoComparativo] = useState<string>('');
  const [showFornecedorDialog, setShowFornecedorDialog] = useState(false);
  const [estadoFornecedor, setEstadoFornecedor] = useState<string>('TODOS');
  const [showGanhadoresDialog, setShowGanhadoresDialog] = useState(false);
  const [estadoGanhadores, setEstadoGanhadores] = useState<string>('');

  const { estados: estadosUsuario } = useEstadosUsuario();

  // UFs disponíveis: as que aparecem nas respostas, ordenadas conforme preferência do usuário.
  const ufsDisponiveis = useMemo(() => {
    const detectadas = ordenarUFs(respostas.flatMap(r => ufsDaResposta(r.resposta as any)), estadosUsuario);
    return detectadas.length > 0 ? detectadas : ordenarUFs(estadosUsuario, estadosUsuario);
  }, [respostas, estadosUsuario]);

  const ufPrimaria = ufsDisponiveis[0] || estadosUsuario[0] || 'MT';

  useEffect(() => {
    if (!estadoComparativo && ufsDisponiveis.length > 0) setEstadoComparativo(ufsDisponiveis[0]);
  }, [ufsDisponiveis, estadoComparativo]);

  useEffect(() => {
    if (!estadoGanhadores && ufsDisponiveis.length > 0) setEstadoGanhadores(ufsDisponiveis[0]);
  }, [ufsDisponiveis, estadoGanhadores]);

  // PDF com apenas os produtos em que o fornecedor tem o menor preço (ganhou)
  const exportGanhadoresPDF = (empresaSelecionada: string) => {
    const estado = estadoGanhadores || ufPrimaria;
    const getNum = (resp: RespostaEmpresa, prod: Produto) => {
      const item = findRespItem(resp.resposta as any[], prod);
      if (!item) return NaN;
      const preco = getPrecoUF(item, estado);
      return preco === undefined ? NaN : parsePreco(preco);
    };

    const sel = respostas.find(r => r.empresa === empresaSelecionada);
    if (!sel) return;

    let total = 0;
    const body: string[][] = [];
    produtos.forEach(prod => {
      const selPrice = getNum(sel, prod);
      if (isNaN(selPrice) || selPrice <= 0) return;
      const outros = respostas
        .filter(r => r.empresa !== empresaSelecionada)
        .map(r => getNum(r, prod))
        .filter(v => !isNaN(v) && v > 0);
      const minOutros = outros.length > 0 ? Math.min(...outros) : Infinity;
      if (selPrice > minOutros) return; // não ganhou
      total += selPrice;
      const segundo = outros.length > 0 ? minOutros : NaN;
      const diff = !isNaN(segundo) && segundo > 0 ? `-${(((segundo - selPrice) / segundo) * 100).toFixed(1)}%` : '—';
      body.push([
        String(body.length + 1),
        prod.codigo_interno,
        prod.descricao.substring(0, 55),
        prod.codigo_barras || '—',
        formatBRL(selPrice),
        !isNaN(segundo) ? formatBRL(segundo) : '—',
        diff,
      ]);
    });

    const doc = new jsPDF('portrait', 'mm', 'a4');
    let y0 = drawHeader(doc, {
      title: 'Produtos Ganhadores',
      subtitle: `Cotação: ${listaNome || 'Sem nome'}`,
      meta: `Fornecedor: ${empresaSelecionada}  ·  Região: ${estado} (${ufNome(estado)})`,
    });
    y0 = drawChips(doc, y0, [
      { label: 'Itens ganhos', value: String(body.length), tone: 'success' },
      { label: 'Total', value: formatBRL(total), tone: 'primary' },
      { label: 'Produtos na cotação', value: String(produtos.length), tone: 'muted' },
    ]);
    y0 = drawSectionTitle(doc, y0 + 2, 'Itens com Menor Preço');

    autoTable(doc, {
      ...tableStyles,
      startY: y0,
      head: [['#', 'Código', 'Descrição', 'Cód. Barras', 'Preço', '2º Menor', 'Vantagem']],
      body,
      headStyles: { ...tableStyles.headStyles, fontSize: 7.5 },
      bodyStyles: { ...tableStyles.bodyStyles, fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center', textColor: PDF_COLORS.muted as any },
        1: { cellWidth: 20, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        3: { cellWidth: 24, textColor: PDF_COLORS.muted as any },
        4: { cellWidth: 22, halign: 'right' },
        5: { cellWidth: 22, halign: 'right' },
        6: { cellWidth: 20, halign: 'center' },
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        if (data.column.index === 4) {
          data.cell.styles.fillColor = PDF_COLORS.successSoft;
          data.cell.styles.textColor = PDF_COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        }
        if (data.column.index === 6) {
          data.cell.styles.fontStyle = 'bold';
          if (String(data.cell.raw || '').startsWith('-')) data.cell.styles.textColor = PDF_COLORS.success;
        }
      },
    });

    drawFooter(doc);
    doc.save(`ganhadores_${empresaSelecionada.replace(/\s+/g, '_')}_${estado}.pdf`);
    setShowGanhadoresDialog(false);
  };

  const exportFornecedorPDF = (empresaSelecionada: string) => {
    const resp = respostas.find(r => r.empresa === empresaSelecionada);
    if (!resp) return;

    const ufsExibidas = estadoFornecedor === 'TODOS' ? ufsDisponiveis : [estadoFornecedor];

    const doc = new jsPDF('portrait', 'mm', 'a4');
    let y0 = drawHeader(doc, {
      title: 'Preços do Fornecedor',
      subtitle: `Cotação: ${listaNome || 'Sem nome'}`,
      meta: `Fornecedor: ${empresaSelecionada}  ·  Região: ${estadoFornecedor === 'TODOS' ? ufsDisponiveis.join(' + ') : `${estadoFornecedor} (${ufNome(estadoFornecedor)})`}`,
    });

    // Cálculo de totais por UF
    const totais: Record<string, { total: number; count: number }> = {};
    ufsExibidas.forEach(uf => { totais[uf] = { total: 0, count: 0 }; });
    const body = produtos.map((prod, idx) => {
      const item: any = findRespItem(resp.resposta as any[], prod);
      const row: string[] = [String(idx + 1), prod.codigo_interno, prod.descricao.substring(0, 60), prod.codigo_barras || '—'];
      ufsExibidas.forEach(uf => {
        const preco = item ? getPrecoUF(item, uf) : undefined;
        const num = preco === undefined ? NaN : parsePreco(preco);
        if (!isNaN(num) && num > 0) { totais[uf].total += num; totais[uf].count++; }
        row.push(formatBRL(num));
      });
      return row;
    });

    const chips: any[] = [{ label: 'Produtos', value: String(produtos.length), tone: 'primary' }];
    ufsExibidas.forEach(uf => {
      chips.push({ label: `Itens ${uf}`, value: `${totais[uf].count}`, tone: 'success' }, { label: `Total ${uf}`, value: formatBRL(totais[uf].total), tone: 'muted' });
    });
    y0 = drawChips(doc, y0, chips);
    y0 = drawSectionTitle(doc, y0 + 2, 'Itens Precificados');

    const head: string[] = ['#', 'Código', 'Descrição', 'Cód. Barras', ...ufsExibidas];

    autoTable(doc, {
      ...tableStyles,
      startY: y0,
      head: [head],
      body,
      columnStyles: {
        0: { cellWidth: 9, halign: 'center', textColor: PDF_COLORS.muted as any },
        1: { cellWidth: 24, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        3: { cellWidth: 28, textColor: PDF_COLORS.muted as any },
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        if (data.column.index >= 4) {
          data.cell.styles.halign = 'right';
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.textColor = PDF_COLORS.ink;
          if (data.cell.raw === '—') data.cell.styles.textColor = PDF_COLORS.muted;
        }
      },
    });

    drawFooter(doc);
    doc.save(`precos_${empresaSelecionada.replace(/\s+/g, '_')}${listaNome ? `_${listaNome.replace(/\s+/g, '_')}` : ''}.pdf`);
    setShowFornecedorDialog(false);
  };



  const exportComparativoPDF = (empresaSelecionada: string) => {
    const estado = estadoComparativo || ufPrimaria;
    const estadoLabel = `${estado} (${ufNome(estado)})`;
    const getPriceField = (item: any) => getPrecoUF(item, estado);
    const doc = new jsPDF('landscape', 'mm', 'a4');
    const outrasEmpresas = respostas.filter(r => r.empresa !== empresaSelecionada);

    // Anonymized names
    const nomesConcorrentes: Record<string, string> = {};
    outrasEmpresas.forEach((r, idx) => {
      nomesConcorrentes[r.empresa] = `Concorrente ${idx + 1}`;
    });

    // --- Cabeçalho unificado ---
    let y0 = drawHeader(doc, {
      title: 'Comparativo de Preços',
      subtitle: `Cotação: ${listaNome || 'Sem nome'}`,
      meta: `Fornecedor: ${empresaSelecionada}  ·  Região: ${estadoLabel}`,
    });

    // --- Cálculo do resumo ---
    const totalProdutos = produtos.length;
    const totalConcorrentes = outrasEmpresas.length;
    let winsCount = 0;
    let lossesCount = 0;
    produtos.forEach(prod => {
      const getNum = (resp: RespostaEmpresa) => {
        const item = findRespItem(resp.resposta as any[], prod);
        if (!item) return NaN;
        const preco = getPriceField(item);
        return preco === undefined ? NaN : parsePreco(preco);
      };
      const selPrice = getNum(respostas.find(r => r.empresa === empresaSelecionada)!);
      if (isNaN(selPrice) || selPrice <= 0) return;
      const concPrices = outrasEmpresas.map(r => getNum(r)).filter(v => !isNaN(v) && v > 0);
      if (concPrices.length === 0) return;
      const minConc = Math.min(...concPrices);
      if (selPrice <= minConc) winsCount++;
      else lossesCount++;
    });

    y0 = drawChips(doc, y0, [
      { label: 'Produtos', value: String(totalProdutos), tone: 'primary' },
      { label: 'Concorrentes', value: String(totalConcorrentes), tone: 'muted' },
      { label: 'Menor preço', value: `${winsCount} itens`, tone: 'success' },
      { label: 'Oportunidades', value: `${lossesCount} itens`, tone: 'danger' },
    ]);
    y0 = drawSectionTitle(doc, y0 + 2, 'Itens com Preço a Cobrir', 'accent');


    // --- Table ---
    const colHeaders = ['#', 'Código', 'Descrição', empresaSelecionada, ...outrasEmpresas.map(r => nomesConcorrentes[r.empresa]), 'Diferença'];

    // Pre-compute numeric prices and filter out wins / no-price items
    const allRowData = produtos.map((prod, idx) => {
      const getNum = (resp: RespostaEmpresa) => {
        const item = findRespItem(resp.resposta as any[], prod);
        if (!item) return NaN;
        const preco = getPriceField(item);
        return preco === undefined ? NaN : parsePreco(preco);
      };
      const fmt = (v: number) => formatBRL(v);

      const selResp = respostas.find(r => r.empresa === empresaSelecionada);
      const selPrice = selResp ? getNum(selResp) : NaN;
      const concPrices = outrasEmpresas.map(r => getNum(r));

      const validConc = concPrices.filter(v => !isNaN(v) && v > 0);
      const minConc = validConc.length > 0 ? Math.min(...validConc) : NaN;

      // Skip if supplier has no price, already has the best/equal price, or no competitors have a price
      const hasPrice = !isNaN(selPrice) && selPrice > 0;
      const noConcurrents = validConc.length === 0;
      const alreadyWon = hasPrice && !isNaN(minConc) && selPrice <= minConc;
      if (!hasPrice || noConcurrents || alreadyWon) return null;

      let diffStr = '-';
      if (!isNaN(minConc)) {
        const diffPct = ((selPrice - minConc) / selPrice) * 100;
        diffStr = diffPct > 0 ? `+${diffPct.toFixed(1)}%` : '0%';
      }

      return {
        row: [
          '', // placeholder for sequential #
          prod.codigo_interno,
          prod.descricao.substring(0, 42),
          fmt(selPrice),
          ...concPrices.map(v => fmt(v)),
          diffStr,
        ],
        selPrice,
        concPrices,
      };
    }).filter(Boolean) as { row: string[]; selPrice: number; concPrices: number[] }[];

    // Re-number rows sequentially
    allRowData.forEach((rd, i) => { rd.row[0] = String(i + 1); });

    // Update summary with filtered count
    lossesCount = allRowData.length;

    autoTable(doc, {
      ...tableStyles,
      startY: y0,
      head: [colHeaders],
      body: allRowData.map(r => r.row),
      headStyles: { ...tableStyles.headStyles, fontSize: 7.5, halign: 'center' },
      bodyStyles: { ...tableStyles.bodyStyles, fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center', textColor: PDF_COLORS.muted as any },
        1: { cellWidth: 22, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        2: { cellWidth: 46 },
        [colHeaders.length - 1]: { cellWidth: 20, halign: 'center', fontStyle: 'bold' },
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        const rowIdx = data.row.index;
        const rd = allRowData[rowIdx];
        if (!rd) return;

        const selColIdx = 3;
        const firstConcIdx = 4;
        const lastConcIdx = firstConcIdx + outrasEmpresas.length - 1;
        const diffColIdx = colHeaders.length - 1;

        if (data.column.index >= selColIdx && data.column.index <= lastConcIdx) {
          data.cell.styles.halign = 'right';
        }

        // Coluna do fornecedor selecionado
        if (data.column.index === selColIdx) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = PDF_COLORS.primarySoft;
          data.cell.styles.textColor = PDF_COLORS.primary;
        }

        // Concorrentes com preço menor (oportunidade de cobrir)
        if (data.column.index >= firstConcIdx && data.column.index <= lastConcIdx) {
          const concIdx = data.column.index - firstConcIdx;
          const concPrice = rd.concPrices[concIdx];
          if (!isNaN(concPrice) && concPrice > 0 && !isNaN(rd.selPrice) && rd.selPrice > 0 && concPrice < rd.selPrice) {
            data.cell.styles.fillColor = PDF_COLORS.successSoft;
            data.cell.styles.textColor = PDF_COLORS.success;
            data.cell.styles.fontStyle = 'bold';
          }
        }

        // Coluna Diferença
        if (data.column.index === diffColIdx) {
          const txt = data.cell.raw || '';
          if (typeof txt === 'string' && txt.startsWith('+')) {
            data.cell.styles.textColor = PDF_COLORS.danger;
            data.cell.styles.fillColor = PDF_COLORS.dangerSoft;
          } else if (typeof txt === 'string' && txt.startsWith('-')) {
            data.cell.styles.textColor = PDF_COLORS.success;
            data.cell.styles.fillColor = PDF_COLORS.successSoft;
          }
        }
      },
    });

    // Legenda
    const finalY = (doc as any).lastAutoTable?.finalY || 200;
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text('Os nomes dos concorrentes foram omitidos por questões de confidencialidade.', 14, finalY + 6);
    doc.setFillColor(...PDF_COLORS.successSoft);
    doc.roundedRect(14, finalY + 10, 4, 3, 0.5, 0.5, 'F');
    doc.setTextColor(...PDF_COLORS.body);
    doc.text('= Concorrente com preço menor (oportunidade de cobrir)', 20, finalY + 12.5);

    drawFooter(doc);
    doc.save(`comparativo_${empresaSelecionada.replace(/\s+/g, '_')}_${estado}.pdf`);
    setShowComparativoDialog(false);
  };


  const loadHistorico = async () => {
    if (Object.keys(historico).length > 0) {
      setShowHistorico(!showHistorico);
      return;
    }
    setLoadingHistorico(true);
    
    const { data: listas } = await supabase
      .from('listas')
      .select('id, nome, created_at, produtos')
      .eq('status', 'finalizada')
      .order('created_at', { ascending: false })
      .limit(10);

    if (!listas || listas.length === 0) {
      setLoadingHistorico(false);
      setShowHistorico(true);
      return;
    }

    const ids = listas.map(l => l.id);
    const { data: allRespostas } = await supabase
      .from('respostas')
      .select('lista_id, empresa, resposta')
      .in('lista_id', ids);

    const hist: Record<string, HistoricoItem[]> = {};

    for (const lista of listas) {
      const listaResps = (allRespostas ?? []).filter(r => r.lista_id === lista.id);
      const prods = lista.produtos as any as Produto[];

      for (const prod of prods) {
        let lowestPrice = Infinity;
        let lowestEmpresa = '';

        for (const resp of listaResps) {
          const items = resp.resposta as any[];
          const item = findRespItem(items, prod);
          if (item) {
            const preco = getPrecoUF(item, ufPrimaria);
            const num = preco === undefined ? NaN : parsePreco(preco);
            if (!isNaN(num) && num > 0 && num < lowestPrice) {
              lowestPrice = num;
              lowestEmpresa = resp.empresa;
            }
          }
        }

        if (lowestPrice !== Infinity) {
          if (!hist[prod.codigo_interno]) hist[prod.codigo_interno] = [];
          hist[prod.codigo_interno].push({
            listaNome: lista.nome,
            data: new Date(lista.created_at).toLocaleDateString('pt-BR'),
            menorPreco: lowestPrice,
            empresa: lowestEmpresa,
          });
        }
      }
    }

    setHistorico(hist);
    setShowHistorico(true);
    setLoadingHistorico(false);
  };

  const analysis = useMemo(() => {
    if (respostas.length === 0) return null;

    const empresas = respostas.map(r => r.empresa);
    let totalByEmpresa: Record<string, { total: number; count: number; wins: number }> = {};
    empresas.forEach(e => { totalByEmpresa[e] = { total: 0, count: 0, wins: 0 }; });

    const prodAnalysis = produtos.map(prod => {
      const prices: { empresa: string; preco: number }[] = [];
      for (const resp of respostas) {
        const item = findRespItem(resp.resposta as any[], prod);
        if (item) {
          const preco = getPrecoUF(item, ufPrimaria);
          const num = preco === undefined ? NaN : parsePreco(preco);
          if (!isNaN(num) && num > 0) {
            prices.push({ empresa: resp.empresa, preco: num });
            totalByEmpresa[resp.empresa].total += num;
            totalByEmpresa[resp.empresa].count++;
          }
        }
      }

      prices.sort((a, b) => a.preco - b.preco);
      const winner = prices[0] || null;
      if (winner) totalByEmpresa[winner.empresa].wins++;

      const avg = prices.length > 0 ? prices.reduce((s, p) => s + p.preco, 0) / prices.length : 0;
      const max = prices.length > 0 ? prices[prices.length - 1].preco : 0;
      const savings = max > 0 && winner ? ((max - winner.preco) / max * 100) : 0;

      return { prod, prices, winner, avg, savings };
    });

    const ranking = Object.entries(totalByEmpresa)
      .map(([empresa, data]) => ({
        empresa,
        wins: data.wins,
        avgPrice: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.wins - a.wins);

    const totalSavings = prodAnalysis.reduce((s, p) => {
      if (p.prices.length > 1 && p.winner) {
        const highest = p.prices[p.prices.length - 1].preco;
        return s + (highest - p.winner.preco);
      }
      return s;
    }, 0);

    return { prodAnalysis, ranking, totalSavings };
  }, [produtos, respostas, ufPrimaria]);

  // PDF Export
  const exportPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF('landscape', 'mm', 'a4');
    const empresas = respostas.map(r => r.empresa);

    let y0 = drawHeader(doc, {
      title: 'Análise de Preços',
      subtitle: listaNome ? `Cotação: ${listaNome}` : undefined,
      meta: `${respostas.length} fornecedor(es)  ·  ${produtos.length} produto(s)`,
    });

    y0 = drawChips(doc, y0, [
      { label: 'Melhor fornecedor', value: analysis.ranking[0]?.empresa || '—', tone: 'primary' },
      { label: 'Vitórias', value: String(analysis.ranking[0]?.wins || 0), tone: 'success' },
      { label: 'Economia potencial', value: formatBRL(analysis.totalSavings), tone: 'success' },
    ]);

    y0 = drawSectionTitle(doc, y0 + 2, 'Ranking de Fornecedores');

    autoTable(doc, {
      ...tableStyles,
      startY: y0,
      head: [['#', 'Fornecedor', 'Vitórias', 'Preço Médio']],
      body: analysis.ranking.map((r, idx) => [
        `${idx + 1}º`,
        r.empresa,
        String(r.wins),
        formatBRL(r.avgPrice),
      ]),
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold', textColor: PDF_COLORS.primary as any },
        1: { fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        2: { halign: 'center' },
        3: { halign: 'right' },
      },
    });

    let y1 = ((doc as any).lastAutoTable?.finalY || 80) + 8;
    y1 = drawSectionTitle(doc, y1, 'Comparativo por Produto', 'accent');

    const tableHead = ['Código', 'Descrição', ...empresas, 'Economia'];
    const savingsColIdx = 2 + empresas.length;
    const tableBody = analysis.prodAnalysis.map(item => [
      item.prod.codigo_interno,
      item.prod.descricao.substring(0, 40),
      ...empresas.map(emp => {
        const p = item.prices.find(pr => pr.empresa === emp);
        return p ? formatBRL(p.preco) : '—';
      }),
      item.savings > 0 ? `-${item.savings.toFixed(0)}%` : '—',
    ]);

    autoTable(doc, {
      ...tableStyles,
      startY: y1,
      head: [tableHead],
      body: tableBody,
      headStyles: { ...tableStyles.headStyles, fontSize: 7.5 },
      bodyStyles: { ...tableStyles.bodyStyles, fontSize: 7.5 },
      columnStyles: {
        0: { cellWidth: 22, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        1: { cellWidth: 46 },
      },
      didParseCell: (data: any) => {
        if (data.section !== 'body') return;
        if (data.column.index >= 2) data.cell.styles.halign = 'right';

        // Pinta de verde o menor preço (fornecedor vencedor) na própria coluna dele
        if (data.column.index >= 2 && data.column.index < savingsColIdx) {
          const item = analysis.prodAnalysis[data.row.index];
          const emp = empresas[data.column.index - 2];
          if (item?.winner && item.winner.empresa === emp && item.prices.length > 0) {
            data.cell.styles.fillColor = PDF_COLORS.successSoft;
            data.cell.styles.textColor = PDF_COLORS.success;
            data.cell.styles.fontStyle = 'bold';
          }
        }

        if (data.column.index === savingsColIdx) {
          data.cell.styles.halign = 'center';
          data.cell.styles.fontStyle = 'bold';
          const v = String(data.cell.raw || '');
          if (v.startsWith('-')) data.cell.styles.textColor = PDF_COLORS.success;
        }
      },
    });


    drawFooter(doc);
    doc.save(`analise_precos${listaNome ? `_${listaNome}` : ''}.pdf`);
  };


  if (!analysis || respostas.length < 2) {
    return (
      <div className="p-6 text-center text-muted-foreground text-sm">
        É necessário pelo menos 2 respostas de fornecedores para gerar análise comparativa.
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 overflow-auto">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-display">Melhor fornecedor</span>
          </div>
          <p className="text-lg font-display font-bold text-foreground">{analysis.ranking[0]?.empresa}</p>
          <p className="text-xs text-muted-foreground">{analysis.ranking[0]?.wins} itens com menor preço</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-4 h-4 text-success" />
            <span className="text-xs text-muted-foreground font-display">Economia potencial</span>
          </div>
          <p className="text-lg font-display font-bold text-success">
            R$ {analysis.totalSavings.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-xs text-muted-foreground">vs. maior preço de cada item</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground font-display">Fornecedores</span>
          </div>
          <p className="text-lg font-display font-bold text-foreground">{respostas.length}</p>
          <p className="text-xs text-muted-foreground">responderam esta cotação</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={loadHistorico}
          disabled={loadingHistorico}
          className="flex items-center gap-2 px-3 py-2 text-xs font-display font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
        >
          <History className="w-4 h-4" />
          {loadingHistorico ? 'Carregando...' : showHistorico ? 'Ocultar Histórico' : 'Histórico de Preços'}
        </button>
        <button
          onClick={exportPDF}
          className="flex items-center gap-2 px-3 py-2 text-xs font-display font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
        >
          <FileDown className="w-4 h-4" />
          Exportar PDF
        </button>
        <button
          onClick={() => setShowComparativoDialog(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-display font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
          Comparativo p/ Fornecedor
        </button>
        <button
          onClick={() => setShowFornecedorDialog(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-display font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
        >
          <FileDown className="w-4 h-4" />
          PDF por Fornecedor
        </button>
        <button
          onClick={() => setShowGanhadoresDialog(true)}
          className="flex items-center gap-2 px-3 py-2 text-xs font-display font-bold text-success bg-success/10 hover:bg-success/20 rounded-lg transition-colors"
        >
          <Trophy className="w-4 h-4" />
          PDF de Ganhadores
        </button>

      </div>

      {/* Winners-only PDF dialog */}
      <Dialog open={showGanhadoresDialog} onOpenChange={setShowGanhadoresDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">PDF de Produtos Ganhadores</DialogTitle>
            <DialogDescription>
              Gera um PDF apenas com os produtos em que o fornecedor tem o menor preço.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">Estado considerado</label>
              <div className="flex gap-2 flex-wrap">
                {ufsDisponiveis.map(uf => (
                  <Button key={uf} type="button" variant={estadoGanhadores === uf ? 'default' : 'outline'} size="sm" className="flex-1 font-display" onClick={() => setEstadoGanhadores(uf)}>
                    {uf} ({ufNome(uf)})
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">Fornecedor</label>
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {respostas.map(r => (
                  <Button key={r.empresa} variant="outline" className="w-full justify-start font-display"
                    onClick={() => exportGanhadoresPDF(r.empresa)}>
                    {r.empresa}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Supplier selection dialog for comparative PDF */}
      <Dialog open={showComparativoDialog} onOpenChange={setShowComparativoDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Gerar Comparativo de Preços</DialogTitle>
            <DialogDescription>
              Escolha o estado considerado e o fornecedor. Os nomes dos concorrentes serão anonimizados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">
                Estado considerado
              </label>
              <div className="flex gap-2 flex-wrap">
                {ufsDisponiveis.map(uf => (
                  <Button
                    key={uf}
                    type="button"
                    variant={estadoComparativo === uf ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 font-display"
                    onClick={() => setEstadoComparativo(uf)}
                  >
                    {uf} ({ufNome(uf)})
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">
                Fornecedor
              </label>
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {respostas.map(r => (
                  <Button
                    key={r.empresa}
                    variant="outline"
                    className="w-full justify-start font-display"
                    onClick={() => exportComparativoPDF(r.empresa)}
                  >
                    {r.empresa}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Single-supplier PDF dialog */}
      <Dialog open={showFornecedorDialog} onOpenChange={setShowFornecedorDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">PDF de Preços por Fornecedor</DialogTitle>
            <DialogDescription>
              Escolha o(s) estado(s) e o fornecedor. O PDF conterá apenas os produtos e preços deste fornecedor.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">
                Estado(s)
              </label>
              <div className="flex gap-2 flex-wrap">
                {ufsDisponiveis.map(uf => (
                  <Button key={uf} type="button" variant={estadoFornecedor === uf ? 'default' : 'outline'} size="sm" className="flex-1 font-display" onClick={() => setEstadoFornecedor(uf)}>
                    {uf} ({ufNome(uf)})
                  </Button>
                ))}
                <Button type="button" variant={estadoFornecedor === 'TODOS' ? 'default' : 'outline'} size="sm" className="flex-1 font-display" onClick={() => setEstadoFornecedor('TODOS')}>Todos os estados</Button>
              </div>
            </div>
            <div>
              <label className="text-xs font-display font-bold text-muted-foreground mb-1.5 block">
                Fornecedor
              </label>
              <div className="space-y-2 max-h-[300px] overflow-auto">
                {respostas.map(r => (
                  <Button
                    key={r.empresa}
                    variant="outline"
                    className="w-full justify-start font-display"
                    onClick={() => exportFornecedorPDF(r.empresa)}
                  >
                    {r.empresa}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Price history section */}
      {showHistorico && (
        <div>
          <h3 className="font-display font-bold text-foreground mb-3 text-sm">Histórico de Menores Preços (Cotações Anteriores)</h3>
          {Object.keys(historico).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum histórico encontrado em cotações finalizadas.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-auto">
              {produtos.filter(p => historico[p.codigo_interno]?.length > 0).slice(0, 20).map(prod => {
                const items = historico[prod.codigo_interno] || [];
                const currentWinner = analysis.prodAnalysis.find(a => a.prod.codigo_interno === prod.codigo_interno)?.winner;
                return (
                  <div key={prod.codigo_interno} className="bg-card border border-border rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0">
                        <p className="font-display font-bold text-foreground text-sm truncate">{prod.descricao}</p>
                        <p className="text-[11px] text-muted-foreground">{prod.codigo_interno}</p>
                      </div>
                      {currentWinner && (
                        <span className="text-[11px] font-display font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                          Atual: R$ {currentWinner.preco.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {items.slice(0, 5).map((h, idx) => {
                        const trend = currentWinner
                          ? h.menorPreco > currentWinner.preco ? '↑' : h.menorPreco < currentWinner.preco ? '↓' : '='
                          : '';
                        const trendColor = trend === '↑' ? 'text-destructive' : trend === '↓' ? 'text-success' : 'text-muted-foreground';
                        return (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            <span className="text-muted-foreground w-20 shrink-0">{h.data}</span>
                            <span className="text-muted-foreground w-24 truncate shrink-0">{h.empresa}</span>
                            <span className="font-display font-bold text-foreground">
                              R$ {h.menorPreco.toFixed(2).replace('.', ',')}
                            </span>
                            {trend && <span className={`font-bold ${trendColor}`}>{trend}</span>}
                            <span className="text-[10px] text-muted-foreground truncate">{h.listaNome}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Ranking */}
      <div>
        <h3 className="font-display font-bold text-foreground mb-3 text-sm">Ranking de Fornecedores</h3>
        <div className="space-y-2">
          {analysis.ranking.map((r, idx) => {
            const maxWins = analysis.ranking[0]?.wins || 1;
            return (
              <div key={r.empresa} className="flex items-center gap-3 px-3 py-2.5 bg-card border border-border rounded-lg">
                <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-display font-bold shrink-0 ${
                  idx === 0 ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {idx + 1}º
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-bold text-foreground text-sm truncate">{r.empresa}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${(r.wins / maxWins) * 100}%`,
                          backgroundColor: idx === 0 ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground) / 0.3)',
                        }}
                      />
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">{r.wins} vitórias</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-muted-foreground">Preço médio</p>
                  <p className="text-sm font-display font-bold text-foreground">
                    R$ {r.avgPrice.toFixed(2).replace('.', ',')}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-product comparison */}
      <div>
        <h3 className="font-display font-bold text-foreground mb-3 text-sm">Maiores Diferenças de Preço</h3>
        <div className="space-y-2">
          {analysis.prodAnalysis
            .filter(p => p.prices.length > 1 && p.savings > 0)
            .sort((a, b) => b.savings - a.savings)
            .slice(0, 10)
            .map(item => (
              <div key={item.prod.codigo_interno} className="bg-card border border-border rounded-lg p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-foreground text-sm truncate">{item.prod.descricao}</p>
                    <p className="text-[11px] text-muted-foreground">{item.prod.codigo_interno}</p>
                  </div>
                  <span className="text-[11px] font-display font-bold text-success bg-success/10 px-2 py-0.5 rounded-full shrink-0">
                    -{item.savings.toFixed(0)}%
                  </span>
                </div>
                <div className="space-y-1">
                  {item.prices.map((p, idx) => {
                    const maxPrice = item.prices[item.prices.length - 1].preco;
                    return (
                      <div key={p.empresa} className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-24 truncate shrink-0">{p.empresa}</span>
                        <div className="flex-1 h-4 bg-muted rounded overflow-hidden relative">
                          <div
                            className="h-full rounded transition-all"
                            style={{
                              width: `${(p.preco / maxPrice) * 100}%`,
                              backgroundColor: idx === 0 ? 'hsl(var(--success))' : 'hsl(var(--primary) / 0.3)',
                            }}
                          />
                        </div>
                        <span className="text-[11px] font-display font-bold text-foreground w-16 text-right shrink-0">
                          {p.preco.toFixed(2).replace('.', ',')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default AnalisePrecosPanel;
