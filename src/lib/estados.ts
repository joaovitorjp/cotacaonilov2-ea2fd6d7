/**
 * Estados (UFs) configuráveis pelo usuário.
 * Antes o sistema era fixo em MT/GO — agora qualquer UF pode ser cadastrada.
 * Mantemos compatibilidade com os campos legados `preco_mt` / `preco_go`.
 */

export const UF_NOMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

export const UF_LIST = Object.keys(UF_NOMES).sort();

export const DEFAULT_ESTADOS = ['MT', 'GO'];

export type TipoPreco = 'IPI_ST' | 'NOTA';
export type Frete = 'CIF' | 'FOB';

export const TIPO_LABELS: Record<TipoPreco, string> = { IPI_ST: 'IPI + ST', NOTA: 'PREÇO NOTA' };
export const FRETE_LABELS: Record<Frete, string> = { CIF: 'CIF', FOB: 'FOB' };

export interface CondicaoEstado {
  tipo: TipoPreco;
  frete: Frete;
}

export const ufNome = (uf: string) => UF_NOMES[uf] ?? uf;

/** Converte o campo `estados` do link em lista de UFs. Aceita legado 'AMBOS'. */
export function parseEstados(estados?: string | null): string[] {
  if (!estados) return [];
  const raw = String(estados).trim().toUpperCase();
  if (raw === 'AMBOS') return ['MT', 'GO'];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Serializa a lista de UFs para o campo `estados`. */
export function serializeEstados(ufs: string[]): string {
  return ufs.join(',');
}

/** Extrai as condições (tipo de preço + frete) por UF de um link, com fallback legado. */
export function condicoesFromLink(link: any): Record<string, CondicaoEstado> {
  const out: Record<string, CondicaoEstado> = {};
  const cond = link?.condicoes;
  if (cond && typeof cond === 'object' && Object.keys(cond).length > 0) {
    for (const [uf, c] of Object.entries<any>(cond)) {
      out[uf.toUpperCase()] = {
        tipo: (c?.tipo as TipoPreco) || 'IPI_ST',
        frete: (c?.frete as Frete) || 'CIF',
      };
    }
    return out;
  }
  for (const uf of parseEstados(link?.estados)) {
    if (uf === 'MT') out.MT = { tipo: (link?.tipo_preco_mt as TipoPreco) || 'IPI_ST', frete: (link?.frete_mt as Frete) || 'CIF' };
    else if (uf === 'GO') out.GO = { tipo: (link?.tipo_preco_go as TipoPreco) || 'NOTA', frete: (link?.frete_go as Frete) || 'CIF' };
    else out[uf] = { tipo: 'IPI_ST', frete: 'CIF' };
  }
  return out;
}

type RespostaItem = {
  codigo_interno?: string;
  preco?: number | string;
  preco_mt?: number | string;
  preco_go?: number | string;
  precos?: Record<string, number | string>;
  [k: string]: any;
};

/** Lê o preço de um item de resposta para uma UF, considerando os campos legados. */
export function getPrecoUF(item: RespostaItem | undefined | null, uf: string): number | string | undefined {
  if (!item) return undefined;
  const p = item.precos?.[uf];
  if (p !== undefined && p !== '') return p;
  if (uf === 'MT') {
    if (item.preco_mt !== undefined && item.preco_mt !== '') return item.preco_mt;
    // Respostas antigas de MT usavam apenas `preco`
    if (item.preco !== undefined && item.preco !== '' && (item.preco_go === undefined || item.preco_go === '')) return item.preco;
    return undefined;
  }
  if (uf === 'GO') {
    return item.preco_go !== undefined && item.preco_go !== '' ? item.preco_go : undefined;
  }
  return undefined;
}

export function hasPrecoUF(item: RespostaItem | undefined | null, uf: string): boolean {
  const v = getPrecoUF(item, uf);
  return v !== undefined && v !== '' && v !== 0 && v !== '0';
}

/** Monta o objeto salvo na resposta, escrevendo também os campos legados de MT/GO. */
export function buildPrecosPayload(precos: Record<string, string>): RespostaItem {
  const clean: Record<string, string> = {};
  for (const [uf, v] of Object.entries(precos)) {
    if (v !== undefined && String(v).trim() !== '') clean[uf] = String(v).trim();
  }
  const payload: RespostaItem = { precos: clean };
  if (clean.MT !== undefined) payload.preco_mt = clean.MT;
  if (clean.GO !== undefined) payload.preco_go = clean.GO;
  return payload;
}

/** UFs que aparecem em uma resposta de fornecedor. */
export function ufsDaResposta(resposta: RespostaItem[] | undefined | null): string[] {
  const set = new Set<string>();
  for (const item of resposta ?? []) {
    if (item?.precos) {
      for (const [uf, v] of Object.entries(item.precos)) {
        if (v !== undefined && String(v).trim() !== '') set.add(uf.toUpperCase());
      }
    }
    if (item?.preco_mt !== undefined && item.preco_mt !== '') set.add('MT');
    if (item?.preco_go !== undefined && item.preco_go !== '') set.add('GO');
    if (
      item?.preco !== undefined && item.preco !== '' &&
      (item?.preco_go === undefined || item.preco_go === '') &&
      (item?.preco_mt === undefined || item.preco_mt === '')
    ) set.add('MT');
  }
  return Array.from(set);
}

/** Ordena UFs seguindo a preferência do usuário e depois alfabeticamente. */
export function ordenarUFs(ufs: string[], preferidas: string[] = DEFAULT_ESTADOS): string[] {
  const order = new Map(preferidas.map((u, i) => [u, i]));
  return [...new Set(ufs)].sort((a, b) => {
    const ia = order.has(a) ? order.get(a)! : 999;
    const ib = order.has(b) ? order.get(b)! : 999;
    return ia !== ib ? ia - ib : a.localeCompare(b);
  });
}

export const estadosLabel = (ufs: string[]) => (ufs.length ? ufs.join(' + ') : '—');
