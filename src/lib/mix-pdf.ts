import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawHeader, drawChips, drawSectionTitle, drawFooter, tableStyles, PDF_COLORS, formatBRL } from '@/lib/pdf-theme';

export interface MixPdfProduto {
  descricao: string;
  gramatura: string | null;
  codigo: string;
  preco: number | null;
  imagem: string | null;
  melhorPreco: boolean;
}

export interface MixPdfMarca {
  nome: string;
  classe: string | null;
  classeLabel: string;
  imagem: string | null;
  produtos: MixPdfProduto[];
}

export interface MixPdfData {
  categoria: string;
  totalMarcas: number;
  totalProdutos: number;
  semClasse: number;
  grupos: { classe: string; marcas: number; produtos: number; media: number | null; min: number | null; max: number | null }[];
  gapAB: number | null;
  gapBC: number | null;
  inchaco: string[];
  mediaItens: number;
  defasadas: { nome: string; itens: number }[];
  gramaturas: { label: string; itens: number }[];
  semGramatura: number;
  gramDominante: { label: string; itens: number } | null;
  concentracaoGram: number | null;
  gramPorMarca: { nome: string; gramaturas: string[] }[];
  mediaGramMarca: number;
  marcasPoucaGram: string[];
  inversoes: { descricao: string; marca: string; classe: string; preco: number; ref: string; valor: number }[];
  marcas: MixPdfMarca[];
}

const MARGIN = 14;

const imgFormat = (dataUrl: string): string => {
  const m = /^data:image\/(png|jpeg|jpg|webp)/i.exec(dataUrl);
  const f = (m?.[1] ?? 'jpeg').toUpperCase();
  return f === 'JPG' ? 'JPEG' : f;
};

const drawImage = (doc: jsPDF, src: string | null, x: number, y: number, w: number, h: number) => {
  if (!src || !src.startsWith('data:image')) return false;
  try {
    doc.addImage(src, imgFormat(src), x, y, w, h, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
};

/** Quebra de página simples: garante espaço vertical, senão cria nova página. */
const ensureSpace = (doc: jsPDF, y: number, needed: number): number => {
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 18) {
    doc.addPage();
    return 20;
  }
  return y;
};

const drawParagraph = (doc: jsPDF, y: number, text: string, tone: 'body' | 'success' | 'warning' = 'body'): number => {
  const pw = doc.internal.pageSize.getWidth();
  const color = tone === 'success' ? PDF_COLORS.success : tone === 'warning' ? PDF_COLORS.warning : PDF_COLORS.body;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...color);
  const lines = doc.splitTextToSize(text, pw - MARGIN * 2);
  y = ensureSpace(doc, y, lines.length * 4.6 + 2);
  doc.text(lines, MARGIN, y);
  doc.setTextColor(...PDF_COLORS.ink);
  return y + lines.length * 4.6 + 2;
};

const pct = (v: number | null) => (v === null ? '—' : `${v.toFixed(0)}%`);

export function gerarRelatorioMixPDF(data: MixPdfData): void {
  const doc = new jsPDF();
  const pw = doc.internal.pageSize.getWidth();

  let y = drawHeader(doc, {
    title: 'Relatório de Mix de Produtos',
    subtitle: `Categoria: ${data.categoria || 'Todas'}`,
    meta: `${data.totalMarcas} marcas · ${data.totalProdutos} produtos`,
  });

  y = drawChips(doc, y, [
    { label: 'Marcas', value: String(data.totalMarcas), tone: 'primary' },
    { label: 'Produtos', value: String(data.totalProdutos), tone: 'muted' },
    ...data.grupos.map(g => ({ label: `Classe ${g.classe}`, value: `${g.marcas} marcas`, tone: 'muted' as const })),
    { label: 'Sem classe', value: String(data.semClasse), tone: data.semClasse ? 'danger' as const : 'success' as const },
  ]);

  // ---------- Resumo por classe ----------
  y = drawSectionTitle(doc, y + 2, 'Resumo por classe');
  autoTable(doc, {
    ...tableStyles,
    startY: y + 2,
    head: [['Classe', 'Marcas', 'Produtos', 'Preço médio', 'Menor', 'Maior']],
    body: data.grupos.map(g => [
      `Classe ${g.classe}`,
      String(g.marcas),
      String(g.produtos),
      g.media === null ? '—' : formatBRL(g.media),
      g.min === null ? '—' : formatBRL(g.min),
      g.max === null ? '—' : formatBRL(g.max),
    ]),
    columnStyles: {
      0: { fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
      1: { halign: 'center' }, 2: { halign: 'center' },
      3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ---------- Diagnóstico ----------
  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, y, 'Diagnóstico do mix');
  y += 3;

  y = data.inchaco.length
    ? drawParagraph(doc, y, `Equilíbrio: a Classe ${data.inchaco.join(' e ')} concentra mais da metade das marcas desta categoria — mix inchado nessa faixa.`, 'warning')
    : drawParagraph(doc, y, 'Equilíbrio: a distribuição de marcas entre as classes está equilibrada.', 'success');

  const escadaOk = (data.gapAB ?? -1) >= 8 && (data.gapBC ?? -1) >= 8;
  y = drawParagraph(
    doc, y,
    `Escada de preço: a Classe B está ${pct(data.gapAB)} abaixo da A e a Classe C está ${pct(data.gapBC)} abaixo da B. ${escadaOk ? 'A escada de preço está saudável.' : 'As faixas estão próximas demais — revise o posicionamento de preço.'}`,
    escadaOk ? 'success' : 'warning',
  );

  y = drawParagraph(
    doc, y,
    `Variedade: média de ${data.mediaItens.toFixed(1)} itens (sabores/fragrâncias) por marca.${data.defasadas.length ? ` Pouca variedade em: ${data.defasadas.slice(0, 6).map(d => `${d.nome} (${d.itens})`).join(', ')}.` : ' Nenhuma marca defasada.'}`,
    data.defasadas.length ? 'warning' : 'success',
  );

  y = drawParagraph(
    doc, y,
    `Gramaturas: ${data.gramaturas.length} tamanhos diferentes na categoria${data.gramDominante ? `, com destaque para ${data.gramDominante.label} (${Math.round(data.concentracaoGram ?? 0)}% dos itens)` : ''}.${data.semGramatura ? ` ${data.semGramatura} produtos sem gramatura informada.` : ''}`,
    (data.concentracaoGram ?? 0) > 60 ? 'warning' : 'success',
  );

  y = drawParagraph(
    doc, y,
    `Tamanhos por marca: média de ${data.mediaGramMarca.toFixed(1)} gramaturas por marca.${data.marcasPoucaGram.length ? ` Pouca variedade de tamanhos em: ${data.marcasPoucaGram.slice(0, 6).join(', ')}.` : ''}`,
    data.marcasPoucaGram.length ? 'warning' : 'success',
  );
  y += 4;

  // ---------- Gramaturas ----------
  if (data.gramaturas.length) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, y, 'Gramaturas da categoria');
    autoTable(doc, {
      ...tableStyles,
      startY: y + 2,
      head: [['Gramatura', 'Produtos', 'Participação']],
      body: data.gramaturas.map(g => {
        const total = data.gramaturas.reduce((s, x) => s + x.itens, 0) || 1;
        return [g.label, String(g.itens), `${Math.round((g.itens / total) * 100)}%`];
      }),
      columnStyles: { 1: { halign: 'center' }, 2: { halign: 'center' } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ---------- Inversões ----------
  if (data.inversoes.length) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, y, 'Produtos fora da faixa da própria classe');
    autoTable(doc, {
      ...tableStyles,
      startY: y + 2,
      head: [['Produto', 'Marca', 'Classe', 'Preço', 'Referência']],
      body: data.inversoes.slice(0, 25).map(i => [
        i.descricao, i.marca, `Classe ${i.classe}`, formatBRL(i.preco), `${i.ref}: ${formatBRL(i.valor)}`,
      ]),
      columnStyles: {
        0: { cellWidth: 62, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        3: { halign: 'right', textColor: PDF_COLORS.danger as any, fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ---------- Produtos por marca (com imagens) ----------
  doc.addPage();
  y = 20;
  y = drawSectionTitle(doc, y, 'Produtos por marca');
  y += 4;

  const ordemClasse = (c: string | null) => (c === 'A' ? 0 : c === 'B' ? 1 : c === 'C' ? 2 : 3);
  const marcas = [...data.marcas].sort((a, b) => ordemClasse(a.classe) - ordemClasse(b.classe) || a.nome.localeCompare(b.nome));

  for (const marca of marcas) {
    const cardH = 22;
    y = ensureSpace(doc, y, cardH + 26);

    // Cabeçalho da marca com imagem representativa
    doc.setFillColor(...PDF_COLORS.surface);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.roundedRect(MARGIN, y, pw - MARGIN * 2, cardH, 2, 2, 'FD');

    const imgSize = 18;
    const ok = drawImage(doc, marca.imagem, MARGIN + 2, y + 2, imgSize, imgSize);
    if (!ok) {
      doc.setFillColor(...PDF_COLORS.primarySoft);
      doc.roundedRect(MARGIN + 2, y + 2, imgSize, imgSize, 2, 2, 'F');
    }

    doc.setTextColor(...PDF_COLORS.ink);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(marca.nome, MARGIN + imgSize + 6, y + 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(`${marca.classeLabel} · ${marca.produtos.length} produtos`, MARGIN + imgSize + 6, y + 16);
    doc.setTextColor(...PDF_COLORS.ink);

    y += cardH + 3;

    if (!marca.produtos.length) {
      y = drawParagraph(doc, y, 'Nenhum produto cadastrado nesta marca.');
      y += 2;
      continue;
    }

    const rowH = 16;
    autoTable(doc, {
      ...tableStyles,
      startY: y,
      head: [['Imagem', 'Produto', 'Gramatura', 'Código', 'Preço']],
      body: marca.produtos.map(p => [
        '', p.descricao, p.gramatura ?? '—', p.codigo || '—', p.preco === null ? 'R$ -' : formatBRL(p.preco),
      ]),
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 74, fontStyle: 'bold', textColor: PDF_COLORS.ink as any },
        2: { cellWidth: 24, halign: 'center' },
        3: { cellWidth: 36 },
        4: { halign: 'right' },
      },
      bodyStyles: { ...tableStyles.bodyStyles, minCellHeight: rowH, valign: 'middle' as const },
      didParseCell: (d: any) => {
        if (d.section !== 'body') return;
        const prod = marca.produtos[d.row.index];
        if (d.column.index === 4 && prod?.melhorPreco) {
          d.cell.styles.textColor = PDF_COLORS.success;
          d.cell.styles.fontStyle = 'bold';
        }
      },
      didDrawCell: (d: any) => {
        if (d.section !== 'body' || d.column.index !== 0) return;
        const prod = marca.produtos[d.row.index];
        const size = Math.min(d.cell.height - 3, 13);
        drawImage(doc, prod?.imagem ?? null, d.cell.x + (d.cell.width - size) / 2, d.cell.y + (d.cell.height - size) / 2, size, size);
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  drawFooter(doc);
  const slug = (data.categoria || 'mix').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`relatorio-mix-${slug}.pdf`);
}
