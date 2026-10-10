/** Converte preços em BRL: "3,89", "3.89", "1.234,56", "R$ 3,89", 3.89. */
export function parsePrecoNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const clean = String(v).replace(/[^\d.,-]/g, '');
  if (!clean) return null;
  let normalized = clean;
  if (clean.includes(',')) normalized = clean.replace(/\./g, '').replace(',', '.');
  else if ((clean.match(/\./g) || []).length > 1) normalized = clean.replace(/\./g, '');
  const n = parseFloat(normalized);
  return isFinite(n) ? n : null;
}

/** Aplica o acréscimo/desconto percentual do fornecedor e arredonda em centavos. */
export function aplicarMarkup(preco: number, markupPercent?: number | null): number {
  if (!markupPercent) return preco;
  return Math.round(preco * (1 + markupPercent / 100) * 100) / 100;
}
