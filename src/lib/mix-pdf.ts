import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { drawHeader, drawFooter, PDF_COLORS, formatBRL } from '@/lib/pdf-theme';

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
  filtroGramatura?: string | null;
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

type RGB = [number, number, number];

const MARGIN = 10;
const BOTTOM = 15;
const WARNING_SOFT: RGB = [255, 247, 220];
const CLASS_TONES: Record<string, { bg: RGB; fg: RGB }> = {
  A: { bg: PDF_COLORS.primarySoft, fg: PDF_COLORS.primary },
  B: { bg: WARNING_SOFT, fg: PDF_COLORS.warning },
  C: { bg: PDF_COLORS.surface, fg: PDF_COLORS.body },
  SEM: { bg: PDF_COLORS.surface, fg: PDF_COLORS.muted },
};

const imgFormat = (dataUrl: string): string => {
  const match = /^data:image\/(png|jpeg|jpg|webp)/i.exec(dataUrl);
  const format = (match?.[1] ?? 'jpeg').toUpperCase();
  return format === 'JPG' ? 'JPEG' : format;
};

const drawImageContain = (doc: jsPDF, src: string | null, x: number, y: number, w: number, h: number): boolean => {
  if (!src?.startsWith('data:image')) return false;
  try {
    const props = doc.getImageProperties(src);
    const ratio = Math.min(w / props.width, h / props.height);
    const iw = props.width * ratio;
    const ih = props.height * ratio;
    doc.addImage(src, imgFormat(src), x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, undefined, 'FAST');
    return true;
  } catch {
    return false;
  }
};

const sectionTitle = (doc: jsPDF, y: number, title: string): number => {
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(MARGIN, y - 3.5, 2.2, 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...PDF_COLORS.ink);
  doc.text(title.toUpperCase(), MARGIN + 5, y);
  return y + 4;
};

const pageHeight = (doc: jsPDF) => doc.internal.pageSize.getHeight();
const pageWidth = (doc: jsPDF) => doc.internal.pageSize.getWidth();

const addContinuationPage = (doc: jsPDF, data: MixPdfData, title: string): number => {
  doc.addPage('a4', 'landscape');
  return drawHeader(doc, {
    title,
    subtitle: `Categoria: ${data.categoria || 'Todas'}`,
    meta: data.filtroGramatura ? `Gramatura: ${data.filtroGramatura}` : 'Gramatura: todas',
  });
};

const ensureSpace = (doc: jsPDF, data: MixPdfData, y: number, needed: number, title: string): number => {
  if (y + needed <= pageHeight(doc) - BOTTOM) return y;
  return addContinuationPage(doc, data, title);
};

const card = (
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  lines: string[],
  tone: { bg: RGB; fg: RGB } = { bg: PDF_COLORS.white, fg: PDF_COLORS.ink },
) => {
  doc.setFillColor(...tone.bg);
  doc.setDrawColor(...PDF_COLORS.border);
  doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...tone.fg);
  doc.text(title.toUpperCase(), x + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(...PDF_COLORS.body);
  const wrapped = lines.flatMap(line => doc.splitTextToSize(line, w - 6));
  doc.text(wrapped.slice(0, Math.max(1, Math.floor((h - 9) / 3.4))), x + 3, y + 10);
};

const pct = (value: number | null) => (value === null ? '—' : `${value.toFixed(0)}%`);

const drawAnalysis = (doc: jsPDF, data: MixPdfData, startY: number): number => {
  const usable = pageWidth(doc) - MARGIN * 2;
  const gap = 3;
  let y = sectionTitle(doc, startY, 'Resumo por classe');
  const classWidth = (usable - gap * 3) / 4;

  data.grupos.forEach((group, index) => {
    const participation = data.totalMarcas ? Math.round((group.marcas / data.totalMarcas) * 100) : 0;
    card(doc, MARGIN + index * (classWidth + gap), y, classWidth, 24,
      `Classe ${group.classe}`,
      [
        `${group.marcas} marcas (${participation}% do mix) · ${group.produtos} produtos`,
        `Média ${group.media === null ? 'R$ -' : formatBRL(group.media)} · ${group.min === null ? 'R$ -' : formatBRL(group.min)} a ${group.max === null ? 'R$ -' : formatBRL(group.max)}`,
      ],
      CLASS_TONES[group.classe] ?? CLASS_TONES.SEM,
    );
  });
  card(doc, MARGIN + 3 * (classWidth + gap), y, classWidth, 24, 'Sem classe', [
    String(data.semClasse),
    data.semClasse ? 'Defina a classe dessas marcas na aba Cadastro.' : 'Todas as marcas estão classificadas.',
  ], CLASS_TONES.SEM);
  y += 29;

  const third = (usable - gap * 2) / 3;
  const escadaOk = (data.gapAB ?? -1) >= 8 && (data.gapBC ?? -1) >= 8;
  card(doc, MARGIN, y, third, 29, 'Equilíbrio do mix', [
    data.inchaco.length
      ? `A Classe ${data.inchaco.join(' e ')} concentra mais da metade das marcas desta categoria — mix inchado nessa faixa.`
      : 'Distribuição equilibrada entre as classes desta categoria.',
    ...(data.grupos.some(group => group.marcas === 0)
      ? [`Sem nenhuma marca em: ${data.grupos.filter(group => group.marcas === 0).map(group => `Classe ${group.classe}`).join(', ')}.`]
      : []),
  ]);
  card(doc, MARGIN + third + gap, y, third, 29, 'Escada de preço', [
    `Classe B está ${pct(data.gapAB)} abaixo da A; Classe C está ${pct(data.gapBC)} abaixo da B.`,
    escadaOk
      ? 'Escada saudável: cada classe é claramente mais barata que a de cima.'
      : 'Escada apertada: as classes têm preços muito próximos e competem entre si.',
  ]);
  card(doc, MARGIN + (third + gap) * 2, y, third, 29, 'Variedade por marca', [
    `Média de ${data.mediaItens.toFixed(1)} itens (sabores/fragrâncias) por marca.`,
    data.defasadas.length
      ? `Pouca variedade em: ${data.defasadas.slice(0, 4).map(item => `${item.nome} (${item.itens})`).join(', ')}.`
      : 'Nenhuma marca defasada em variedade.',
  ]);
  y += 34;

  const half = (usable - gap) / 2;
  const gramaturas = data.gramaturas.length
    ? `${data.gramaturas.length} gramaturas diferentes. ${data.gramaturas.map(item => `${item.label} (${item.itens})`).join(' · ')}`
    : 'Nenhuma gramatura identificada. Informe no cadastro (ex.: 2 L, 500 ml).';
  const distribuicao = (data.concentracaoGram ?? 0) > 60
    ? `Concentração alta: ${Math.round(data.concentracaoGram ?? 0)}% dos produtos são ${data.gramDominante?.label}. Falta variedade de tamanhos.`
    : 'Boa distribuição entre os tamanhos oferecidos.';
  card(doc, MARGIN, y, half, 31, 'Gramaturas da categoria', [
    gramaturas,
    distribuicao,
    ...(data.semGramatura ? [`${data.semGramatura} produtos sem gramatura informada.`] : []),
  ]);
  card(doc, MARGIN + half + gap, y, half, 31, 'Gramaturas por marca', [
    `Média de ${data.mediaGramMarca.toFixed(1)} tamanhos por marca.`,
    ...data.gramPorMarca.slice(0, 5).map(item => `${item.nome}: ${item.gramaturas.length ? `${item.gramaturas.length} — ${item.gramaturas.join(', ')}` : 'sem gramaturas informadas'}`),
    ...(data.marcasPoucaGram.length ? [`Pouca variedade em: ${data.marcasPoucaGram.slice(0, 4).join(', ')}.`] : []),
  ]);
  y += 36;

  if (data.inversoes.length) {
    y = ensureSpace(doc, data, y, 30, 'Análise do Mix de Produtos');
    const visible = data.inversoes.slice(0, 6);
    const height = 10 + visible.length * 4 + (data.inversoes.length > 6 ? 4 : 0);
    const lines = visible.map(item => `${item.marca} (Classe ${item.classe}) — ${item.descricao}: ${formatBRL(item.preco)} acima da ${item.ref} (${formatBRL(item.valor)}).`);
    if (data.inversoes.length > 6) lines.push(`e mais ${data.inversoes.length - 6} itens.`);
    card(doc, MARGIN, y, usable, height, `${data.inversoes.length} produtos fora da faixa da sua classe`, lines, { bg: WARNING_SOFT, fg: PDF_COLORS.warning });
    y += height + 5;
  }
  return y;
};

const classKey = (marca: MixPdfMarca) => marca.classe ?? 'SEM';

const tableHead = (marcas: MixPdfMarca[]) => {
  const classes: any[] = [];
  let current: { key: string; label: string; count: number } | null = null;
  for (const marca of marcas) {
    const key = classKey(marca);
    if (current?.key === key) current.count += 1;
    else {
      if (current) classes.push({ content: current.label.toUpperCase(), colSpan: current.count, styles: { fillColor: CLASS_TONES[current.key].bg, textColor: CLASS_TONES[current.key].fg } });
      current = { key, label: marca.classeLabel, count: 1 };
    }
  }
  if (current) classes.push({ content: current.label.toUpperCase(), colSpan: current.count, styles: { fillColor: CLASS_TONES[current.key].bg, textColor: CLASS_TONES[current.key].fg } });
  return [
    classes,
    marcas.map(marca => ({ content: marca.nome, styles: { fillColor: PDF_COLORS.surface, textColor: PDF_COLORS.ink, fontStyle: 'bold' } })),
    marcas.map(() => ({ content: '', styles: { minCellHeight: 27, fillColor: PDF_COLORS.white } })),
  ];
};

const drawComparisonTables = (doc: jsPDF, data: MixPdfData) => {
  const perPage = 4;
  const chunks: MixPdfMarca[][] = [];
  for (let i = 0; i < data.marcas.length; i += perPage) chunks.push(data.marcas.slice(i, i + perPage));

  chunks.forEach((marcas, chunkIndex) => {
    const y = addContinuationPage(doc, data, chunks.length > 1
      ? `Comparativo lado a lado · ${chunkIndex + 1}/${chunks.length}`
      : 'Comparativo lado a lado');
    const rows = Math.max(...marcas.map(marca => marca.produtos.length));
    const body: any[][] = [];
    for (let row = 0; row < rows; row += 1) {
      body.push(marcas.map(marca => {
        const product = marca.produtos[row];
        if (!product) return { content: '—', styles: { textColor: PDF_COLORS.muted, halign: 'center' } };
        const details = [product.gramatura, product.codigo].filter(Boolean).join(' · ');
        return { content: details ? `${product.descricao}\n${details}` : product.descricao };
      }));
      body.push(marcas.map(marca => {
        const product = marca.produtos[row];
        return {
          content: product?.preco === null || !product ? 'R$ -' : formatBRL(product.preco),
          styles: product?.melhorPreco
            ? { textColor: PDF_COLORS.success, fontStyle: 'bold', halign: 'center' }
            : { textColor: PDF_COLORS.ink, fontStyle: 'bold', halign: 'center' },
        };
      }));
    }

    const columnWidth = (pageWidth(doc) - MARGIN * 2) / marcas.length;
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN, bottom: BOTTOM },
      theme: 'grid',
      head: tableHead(marcas),
      body,
      showHead: 'everyPage',
      tableWidth: 'auto',
      styles: {
        font: 'helvetica',
        fontSize: 7.2,
        textColor: PDF_COLORS.body,
        lineColor: PDF_COLORS.border,
        lineWidth: 0.2,
        cellPadding: 2.2,
        overflow: 'linebreak',
        valign: 'middle',
        halign: 'center',
        cellWidth: columnWidth,
      },
      headStyles: { fontSize: 8, fontStyle: 'bold', halign: 'center', valign: 'middle', lineColor: PDF_COLORS.border, lineWidth: 0.2 },
      didParseCell: (hook: any) => {
        if (hook.section !== 'body') return;
        const productIndex = Math.floor(hook.row.index / 2);
        if (hook.row.index % 2 === 0) {
          hook.cell.styles.fillColor = productIndex % 2 ? PDF_COLORS.surface : PDF_COLORS.white;
          hook.cell.styles.minCellHeight = 14;
          hook.cell.styles.fontStyle = 'normal';
        } else {
          hook.cell.styles.fillColor = productIndex % 2 ? PDF_COLORS.surface : PDF_COLORS.white;
          hook.cell.styles.minCellHeight = 8;
        }
      },
      didDrawCell: (hook: any) => {
        if (hook.section !== 'head' || hook.row.index !== 2) return;
        const marca = marcas[hook.column.index];
        if (!marca) return;
        const ok = drawImageContain(doc, marca.imagem, hook.cell.x + 3, hook.cell.y + 2, hook.cell.width - 6, hook.cell.height - 4);
        if (!ok) {
          doc.setFillColor(...PDF_COLORS.surface);
          doc.roundedRect(hook.cell.x + hook.cell.width / 2 - 7, hook.cell.y + hook.cell.height / 2 - 7, 14, 14, 1.5, 1.5, 'F');
          doc.setFontSize(6.5);
          doc.setTextColor(...PDF_COLORS.muted);
          doc.text('SEM IMAGEM', hook.cell.x + hook.cell.width / 2, hook.cell.y + hook.cell.height / 2 + 1, { align: 'center' });
        }
      },
    });
  });
};

export function gerarRelatorioMixPDF(data: MixPdfData): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const filtro = data.filtroGramatura
    ? `Gramatura: ${data.filtroGramatura}`
    : 'Gramatura: todas';
  let y = drawHeader(doc, {
    title: 'Comparativo de Mix de Produtos',
    subtitle: `Categoria: ${data.categoria || 'Todas'}`,
    meta: `${data.totalMarcas} marcas · ${data.totalProdutos} produtos · ${filtro}`,
  });
  y = drawAnalysis(doc, data, y + 2);
  void y;
  drawComparisonTables(doc, data);
  drawFooter(doc, `${data.categoria || 'Mix de Produtos'} · ${filtro}`);
  const slug = (data.categoria || 'mix').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
  doc.save(`comparativo-mix-${slug}.pdf`);
}