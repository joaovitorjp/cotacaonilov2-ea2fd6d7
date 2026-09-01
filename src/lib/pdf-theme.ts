import type jsPDF from 'jspdf';
import { LOGO_BASE64 } from './pdf-logo';

// =========================================================================
// PDF Design System — paleta única, tipografia consistente e componentes
// reutilizáveis (header, chips, section title, footer, tabela).
// =========================================================================

export const PDF_COLORS = {
  // Primária: azul profundo (marca)
  primary: [15, 76, 129] as [number, number, number],
  primaryDark: [10, 54, 93] as [number, number, number],
  primarySoft: [230, 240, 250] as [number, number, number],
  // Acento
  accent: [14, 165, 164] as [number, number, number],
  // Estados
  success: [22, 163, 74] as [number, number, number],
  successSoft: [220, 245, 224] as [number, number, number],
  danger: [220, 38, 38] as [number, number, number],
  dangerSoft: [253, 226, 226] as [number, number, number],
  warning: [217, 119, 6] as [number, number, number],
  // Neutros
  ink: [17, 24, 39] as [number, number, number],
  body: [55, 65, 81] as [number, number, number],
  muted: [107, 114, 128] as [number, number, number],
  border: [226, 232, 240] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
} as const;

export const BRAND_NAME = 'COTARME • Sistema de Cotações';

export const formatBRL = (n: number): string => {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return `R$ ${n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
};

export interface HeaderOptions {
  title: string;
  subtitle?: string;
  meta?: string; // linha extra (fornecedor, período etc.)
  dateRight?: boolean; // exibir data no canto direito
}

/**
 * Desenha um cabeçalho elegante e retorna o `y` onde o conteúdo pode iniciar.
 */
export function drawHeader(doc: jsPDF, opts: HeaderOptions): number {
  const pw = doc.internal.pageSize.getWidth();
  const H = 32;

  // Faixa principal
  doc.setFillColor(...PDF_COLORS.primary);
  doc.rect(0, 0, pw, H, 'F');
  // Faixa de acento fina
  doc.setFillColor(...PDF_COLORS.accent);
  doc.rect(0, H, pw, 1.2, 'F');

  // Logo à esquerda
  try {
    doc.addImage(LOGO_BASE64, 'JPEG', 11, 5, 22, 22);
  } catch { /* logo opcional */ }
  const tx = 38; // textos deslocados para a direita da logo

  // Marca à esquerda
  doc.setTextColor(...PDF_COLORS.white);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(BRAND_NAME.toUpperCase(), tx, 9);

  // Título
  doc.setFontSize(17);
  doc.text(opts.title, tx, 19);

  // Subtítulo / metadados
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  if (opts.subtitle) doc.text(opts.subtitle, tx, 25.5);
  if (opts.meta) doc.text(opts.meta, tx, 30);

  // Data à direita
  if (opts.dateRight !== false) {
    const now = new Date();
    const dateStr = `${now.toLocaleDateString('pt-BR')} · ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    doc.setFontSize(8);
    const w = doc.getTextWidth(dateStr);
    doc.text(dateStr, pw - 14 - w, 9);
  }

  // Reset de estilo
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFont('helvetica', 'normal');

  return H + 8; // offset para começar conteúdo
}

/**
 * Desenha uma linha de "chips" (pílulas) com informações resumidas.
 * Retorna o `y` após os chips.
 */
export function drawChips(
  doc: jsPDF,
  y: number,
  chips: { label: string; value: string; tone?: 'primary' | 'success' | 'danger' | 'muted' }[],
  x = 14,
): number {
  const pad = 3;
  const gap = 3;
  const h = 8;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  let cx = x;
  const pw = doc.internal.pageSize.getWidth();
  chips.forEach(c => {
    const text = `${c.label}: ${c.value}`;
    const w = doc.getTextWidth(text) + pad * 2;
    if (cx + w > pw - 14) { cx = x; y += h + 2; }
    const tone = c.tone ?? 'muted';
    const bg =
      tone === 'primary' ? PDF_COLORS.primarySoft :
      tone === 'success' ? PDF_COLORS.successSoft :
      tone === 'danger' ? PDF_COLORS.dangerSoft :
      PDF_COLORS.surface;
    const fg =
      tone === 'primary' ? PDF_COLORS.primary :
      tone === 'success' ? PDF_COLORS.success :
      tone === 'danger' ? PDF_COLORS.danger :
      PDF_COLORS.body;
    doc.setFillColor(...bg);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.roundedRect(cx, y, w, h, 2, 2, 'F');
    doc.setTextColor(...fg);
    doc.text(text, cx + pad, y + h - 2.6);
    cx += w + gap;
  });
  doc.setTextColor(...PDF_COLORS.ink);
  return y + h + 4;
}

/**
 * Título de seção com barra colorida de acento.
 */
export function drawSectionTitle(doc: jsPDF, y: number, title: string, tone: 'primary' | 'accent' = 'primary'): number {
  const color = tone === 'accent' ? PDF_COLORS.accent : PDF_COLORS.primary;
  doc.setFillColor(...color);
  doc.rect(14, y - 3.5, 2.5, 5, 'F');
  doc.setTextColor(...PDF_COLORS.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), 19, y);
  doc.setFont('helvetica', 'normal');
  return y + 3;
}

/**
 * Adiciona rodapé em todas as páginas: marca à esquerda e paginação à direita.
 */
export function drawFooter(doc: jsPDF, extraLeft?: string): void {
  const pages = doc.getNumberOfPages();
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...PDF_COLORS.border);
    doc.setLineWidth(0.3);
    doc.line(14, ph - 10, pw - 14, ph - 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(extraLeft || BRAND_NAME, 14, ph - 5.5);
    const rightText = `Página ${i} de ${pages}`;
    const w = doc.getTextWidth(rightText);
    doc.text(rightText, pw - 14 - w, ph - 5.5);
  }
  doc.setTextColor(...PDF_COLORS.ink);
}

/**
 * Estilos padrão para autoTable — passe como spread nas opções da tabela.
 */
export const tableStyles = {
  theme: 'grid' as const,
  headStyles: {
    fillColor: PDF_COLORS.primary as any,
    textColor: PDF_COLORS.white as any,
    fontStyle: 'bold' as const,
    fontSize: 8.5,
    halign: 'left' as const,
    cellPadding: { top: 2.8, right: 3, bottom: 2.8, left: 3 },
    lineWidth: 0,
  },
  bodyStyles: {
    fontSize: 8.5,
    textColor: PDF_COLORS.body as any,
    cellPadding: { top: 2.4, right: 3, bottom: 2.4, left: 3 },
    lineColor: PDF_COLORS.border as any,
    lineWidth: 0.15,
  },
  alternateRowStyles: {
    fillColor: PDF_COLORS.surface as any,
  },
  styles: {
    font: 'helvetica' as const,
    overflow: 'linebreak' as const,
    valign: 'middle' as const,
  },
};
