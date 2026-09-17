// Detecção e normalização de gramaturas/volumes (ex.: 2 litros, 500ml, 1,5kg, 900g)

export interface GramaturaInfo {
  label: string;      // rótulo normalizado, ex.: "2 L", "500 ml"
  base: number;       // valor em ml (líquidos) ou g (sólidos)
  tipo: 'volume' | 'peso' | 'unidade';
}

const NUM = '(\\d+(?:[.,]\\d+)?)';

const PADROES: { re: RegExp; tipo: GramaturaInfo['tipo']; fator: number; unidade: string }[] = [
  { re: new RegExp(`${NUM}\\s*(?:l|lt|lts|litro|litros)\\b`, 'i'), tipo: 'volume', fator: 1000, unidade: 'L' },
  { re: new RegExp(`${NUM}\\s*(?:ml|mls|mililitro|mililitros)\\b`, 'i'), tipo: 'volume', fator: 1, unidade: 'ml' },
  { re: new RegExp(`${NUM}\\s*(?:kg|kgs|quilo|quilos|kilo|kilos)\\b`, 'i'), tipo: 'peso', fator: 1000, unidade: 'kg' },
  { re: new RegExp(`${NUM}\\s*(?:g|gr|gramas|grama)\\b`, 'i'), tipo: 'peso', fator: 1, unidade: 'g' },
  { re: new RegExp(`${NUM}\\s*(?:un|und|unid|unidades|pçs|pcs)\\b`, 'i'), tipo: 'unidade', fator: 1, unidade: 'un' },
];

const numero = (txt: string) => parseFloat(txt.replace(/\./g, '').replace(',', '.'));

const formatarNumero = (v: number) =>
  Number.isInteger(v) ? String(v) : String(v).replace('.', ',');

/** Extrai a gramatura de um texto livre (descrição do produto). */
export function detectGramatura(texto: string | null | undefined): GramaturaInfo | null {
  if (!texto) return null;
  for (const p of PADROES) {
    const m = texto.match(p.re);
    if (!m) continue;
    const valor = numero(m[1]);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    return { label: `${formatarNumero(valor)} ${p.unidade}`, base: valor * p.fator, tipo: p.tipo };
  }
  return null;
}

/** Gramatura informada manualmente ou, se vazia, deduzida da descrição. */
export function gramaturaDoProduto(
  gramatura: string | null | undefined,
  descricao: string | null | undefined,
): GramaturaInfo | null {
  const manual = gramatura?.trim();
  if (manual) return detectGramatura(manual) ?? { label: manual, base: NaN, tipo: 'unidade' };
  return detectGramatura(descricao);
}

export const gramaturaLabel = (
  gramatura: string | null | undefined,
  descricao: string | null | undefined,
) => gramaturaDoProduto(gramatura, descricao)?.label ?? null;

/** Ordena rótulos de gramatura pela medida real (menor para maior). */
export function ordenarGramaturas(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const ga = detectGramatura(a);
    const gb = detectGramatura(b);
    const va = ga && Number.isFinite(ga.base) ? ga.base : Number.MAX_SAFE_INTEGER;
    const vb = gb && Number.isFinite(gb.base) ? gb.base : Number.MAX_SAFE_INTEGER;
    if (va !== vb) return va - vb;
    return a.localeCompare(b);
  });
}
