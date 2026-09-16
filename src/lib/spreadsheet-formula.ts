// Motor de fórmulas estilo Excel para a planilha de cotações.
// Suporta referências A1, intervalos A1:B10, operadores aritméticos/comparação
// e funções em português e inglês.

export type CellResolver = (row: number, col: number) => string;

export const ERR_REF = '#REF!';
export const ERR_DIV = '#DIV/0!';
export const ERR_CIRC = '#CIRC!';
export const ERR_NAME = '#NOME?';
export const ERR_VALUE = '#VALOR!';
export const ERR_GENERIC = '#ERRO!';

export const FORMULA_ERRORS = [ERR_REF, ERR_DIV, ERR_CIRC, ERR_NAME, ERR_VALUE, ERR_GENERIC];

export const isFormula = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().startsWith('=') && value.trim().length > 1;

export const isFormulaError = (value: string) => FORMULA_ERRORS.includes(value.trim());

export const columnLettersToIndex = (letters: string): number => {
  let result = 0;
  for (const ch of letters.toUpperCase()) result = result * 26 + (ch.charCodeAt(0) - 64);
  return result;
};

export const parseNumeric = (raw: string): number => {
  if (raw === null || raw === undefined) return NaN;
  let text = String(raw).trim();
  if (!text) return NaN;
  text = text.replace(/R\$|\s/gi, '');
  if (!text || text === '-') return NaN;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) text = text.replace(/\./g, '').replace(',', '.');
  else if (hasComma) text = text.replace(',', '.');
  if (!/^-?\d*\.?\d+$/.test(text)) return NaN;
  const num = Number(text);
  return Number.isFinite(num) ? num : NaN;
};

export const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) return ERR_VALUE;
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
};

class FormulaError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

type RangeValue = { __range: string[] };
type Value = number | string | boolean | RangeValue;

const isRange = (v: Value): v is RangeValue => typeof v === 'object' && v !== null && '__range' in v;

const flatten = (values: Value[]): string[] => {
  const out: string[] = [];
  for (const v of values) {
    if (isRange(v)) out.push(...v.__range);
    else if (typeof v === 'boolean') out.push(v ? '1' : '0');
    else out.push(String(v));
  }
  return out;
};

const numbersOf = (values: Value[]): number[] =>
  flatten(values).map(parseNumeric).filter(n => !Number.isNaN(n));

const toNumber = (v: Value): number => {
  if (isRange(v)) {
    const nums = numbersOf([v]);
    if (nums.length !== 1) throw new FormulaError(ERR_VALUE);
    return nums[0];
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number') return v;
  if (v.trim() === '') return 0;
  const n = parseNumeric(v);
  if (Number.isNaN(n)) throw new FormulaError(ERR_VALUE);
  return n;
};

const toText = (v: Value): string => {
  if (isRange(v)) {
    const flat = flatten([v]);
    return flat.length ? flat[0] : '';
  }
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  return v;
};

const toBool = (v: Value): boolean => {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  const text = toText(v).trim().toUpperCase();
  if (['VERDADEIRO', 'TRUE', 'SIM'].includes(text)) return true;
  if (['FALSO', 'FALSE', 'NAO', 'NÃO', ''].includes(text)) return false;
  const n = parseNumeric(text);
  return !Number.isNaN(n) && n !== 0;
};

// ---------- Tokenizer ----------
type Token =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; col: number; row: number }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'punct'; v: string };

const tokenize = (src: string): Token[] => {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '"') {
      let out = '';
      i++;
      while (i < src.length && src[i] !== '"') { out += src[i]; i++; }
      if (src[i] !== '"') throw new FormulaError(ERR_GENERIC);
      i++;
      tokens.push({ t: 'str', v: out });
      continue;
    }
    const refMatch = /^\$?([A-Za-z]{1,3})\$?(\d{1,6})(?![\w.])/.exec(src.slice(i));
    if (refMatch && !/[A-Za-z0-9_.]/.test(src[i - 1] ?? '')) {
      tokens.push({ t: 'ref', col: columnLettersToIndex(refMatch[1]), row: parseInt(refMatch[2], 10) });
      i += refMatch[0].length;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      let out = '';
      while (i < src.length && /[\d.,]/.test(src[i])) { out += src[i]; i++; }
      const n = parseNumeric(out);
      if (Number.isNaN(n)) throw new FormulaError(ERR_VALUE);
      tokens.push({ t: 'num', v: n });
      continue;
    }
    const identMatch = /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/.exec(src.slice(i));
    if (identMatch) {
      tokens.push({ t: 'ident', v: identMatch[0].toUpperCase() });
      i += identMatch[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '<>'].includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('+-*/^&=<>'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    if ('(),;:'.includes(ch)) { tokens.push({ t: 'punct', v: ch }); i++; continue; }
    throw new FormulaError(ERR_GENERIC);
  }
  return tokens;
};

// ---------- Parser / Evaluator ----------
const evaluateTokens = (tokens: Token[], resolve: CellResolver): Value => {
  let pos = 0;
  const peek = () => tokens[pos];
  const cellText = (col: number, row: number): string => {
    if (col < 1 || row < 1) throw new FormulaError(ERR_REF);
    return resolve(row - 1, col);
  };

  const rangeValues = (a: { col: number; row: number }, b: { col: number; row: number }): RangeValue => {
    const minCol = Math.min(a.col, b.col); const maxCol = Math.max(a.col, b.col);
    const minRow = Math.min(a.row, b.row); const maxRow = Math.max(a.row, b.row);
    if ((maxCol - minCol + 1) * (maxRow - minRow + 1) > 20000) throw new FormulaError(ERR_REF);
    const out: string[] = [];
    for (let r = minRow; r <= maxRow; r++) for (let c = minCol; c <= maxCol; c++) out.push(cellText(c, r));
    return { __range: out };
  };

  const matchesCriteria = (value: string, criteria: Value): boolean => {
    const crit = toText(criteria).trim();
    const opMatch = /^(<=|>=|<>|=|<|>)(.*)$/.exec(crit);
    if (opMatch) {
      const op = opMatch[1];
      const rest = opMatch[2].trim();
      const num = parseNumeric(rest);
      const cellNum = parseNumeric(value);
      if (!Number.isNaN(num) && !Number.isNaN(cellNum)) {
        switch (op) {
          case '<=': return cellNum <= num;
          case '>=': return cellNum >= num;
          case '<>': return cellNum !== num;
          case '=': return cellNum === num;
          case '<': return cellNum < num;
          case '>': return cellNum > num;
        }
      }
      const cmp = value.trim().toLocaleLowerCase('pt-BR');
      const target = rest.toLocaleLowerCase('pt-BR');
      if (op === '<>') return cmp !== target;
      if (op === '=') return cmp === target;
      return false;
    }
    const num = parseNumeric(crit);
    const cellNum = parseNumeric(value);
    if (!Number.isNaN(num) && !Number.isNaN(cellNum)) return num === cellNum;
    return value.trim().toLocaleLowerCase('pt-BR') === crit.toLocaleLowerCase('pt-BR');
  };

  const callFunction = (name: string, args: Value[]): Value => {
    switch (name) {
      case 'SOMA': case 'SUM':
        return numbersOf(args).reduce((a, b) => a + b, 0);
      case 'MEDIA': case 'MÉDIA': case 'AVERAGE': {
        const nums = numbersOf(args);
        if (!nums.length) throw new FormulaError(ERR_DIV);
        return nums.reduce((a, b) => a + b, 0) / nums.length;
      }
      case 'MINIMO': case 'MÍNIMO': case 'MIN': {
        const nums = numbersOf(args);
        return nums.length ? Math.min(...nums) : 0;
      }
      case 'MAXIMO': case 'MÁXIMO': case 'MAX': {
        const nums = numbersOf(args);
        return nums.length ? Math.max(...nums) : 0;
      }
      case 'ARRED': case 'ROUND': {
        const digits = args[1] !== undefined ? toNumber(args[1]) : 0;
        const f = Math.pow(10, digits);
        return Math.round(toNumber(args[0]) * f) / f;
      }
      case 'ABS': return Math.abs(toNumber(args[0]));
      case 'SE': case 'IF': {
        if (args.length < 2) throw new FormulaError(ERR_VALUE);
        return toBool(args[0]) ? args[1] : (args[2] ?? false);
      }
      case 'CONT.SE': case 'CONT.SE()': case 'COUNTIF': {
        if (args.length < 2) throw new FormulaError(ERR_VALUE);
        return flatten([args[0]]).filter(v => matchesCriteria(v, args[1])).length;
      }
      case 'CONT.NUM': case 'CONT.NÚM': case 'COUNT':
        return numbersOf(args).length;
      case 'CONT.VALORES': case 'COUNTA':
        return flatten(args).filter(v => v.trim() !== '').length;
      case 'SOMASE': case 'SUMIF': {
        if (args.length < 2) throw new FormulaError(ERR_VALUE);
        const testRange = flatten([args[0]]);
        const sumRange = args[2] !== undefined ? flatten([args[2]]) : testRange;
        let total = 0;
        testRange.forEach((v, idx) => {
          if (matchesCriteria(v, args[1])) {
            const n = parseNumeric(sumRange[idx] ?? '');
            if (!Number.isNaN(n)) total += n;
          }
        });
        return total;
      }
      case 'CONCAT': case 'CONCATENAR':
        return flatten(args).join('');
      case 'E': case 'AND': return flatten(args).length > 0 && args.every(a => (isRange(a) ? flatten([a]).every(v => toBool(v)) : toBool(a)));
      case 'OU': case 'OR': return args.some(a => (isRange(a) ? flatten([a]).some(v => toBool(v)) : toBool(a)));
      default:
        throw new FormulaError(ERR_NAME);
    }
  };

  const parsePrimary = (): Value => {
    const tok = peek();
    if (!tok) throw new FormulaError(ERR_GENERIC);
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+')) {
      pos++;
      const v = parsePrimary();
      return tok.v === '-' ? -toNumber(v) : toNumber(v);
    }
    if (tok.t === 'num') { pos++; return tok.v; }
    if (tok.t === 'str') { pos++; return tok.v; }
    if (tok.t === 'ref') {
      pos++;
      const next = peek();
      if (next && next.t === 'punct' && next.v === ':') {
        const after = tokens[pos + 1];
        if (!after || after.t !== 'ref') throw new FormulaError(ERR_REF);
        pos += 2;
        return rangeValues(tok, after);
      }
      return cellText(tok.col, tok.row);
    }
    if (tok.t === 'ident') {
      pos++;
      const upper = tok.v;
      if (upper === 'VERDADEIRO' || upper === 'TRUE') return true;
      if (upper === 'FALSO' || upper === 'FALSE') return false;
      const open = peek();
      if (!open || open.t !== 'punct' || open.v !== '(') throw new FormulaError(ERR_NAME);
      pos++;
      const args: Value[] = [];
      if (peek() && peek().t === 'punct' && (peek() as any).v === ')') pos++;
      else {
        for (;;) {
          args.push(parseExpression());
          const sep = peek();
          if (sep && sep.t === 'punct' && (sep.v === ',' || sep.v === ';')) { pos++; continue; }
          if (sep && sep.t === 'punct' && sep.v === ')') { pos++; break; }
          throw new FormulaError(ERR_GENERIC);
        }
      }
      return callFunction(upper, args);
    }
    if (tok.t === 'punct' && tok.v === '(') {
      pos++;
      const v = parseExpression();
      const close = peek();
      if (!close || close.t !== 'punct' || close.v !== ')') throw new FormulaError(ERR_GENERIC);
      pos++;
      return v;
    }
    throw new FormulaError(ERR_GENERIC);
  };

  const parsePower = (): Value => {
    let left = parsePrimary();
    const tok = peek();
    if (tok && tok.t === 'op' && tok.v === '^') {
      pos++;
      const right = parsePower();
      left = Math.pow(toNumber(left), toNumber(right));
    }
    return left;
  };

  const parseMul = (): Value => {
    let left = parsePower();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || (tok.v !== '*' && tok.v !== '/')) return left;
      pos++;
      const right = parsePower();
      const a = toNumber(left); const b = toNumber(right);
      if (tok.v === '/') {
        if (b === 0) throw new FormulaError(ERR_DIV);
        left = a / b;
      } else left = a * b;
    }
  };

  const parseAdd = (): Value => {
    let left = parseMul();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || !['+', '-', '&'].includes(tok.v)) return left;
      pos++;
      const right = parseMul();
      if (tok.v === '&') left = toText(left) + toText(right);
      else left = tok.v === '+' ? toNumber(left) + toNumber(right) : toNumber(left) - toNumber(right);
    }
  };

  const parseExpression = (): Value => {
    let left = parseAdd();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== 'op' || !['=', '<>', '<', '>', '<=', '>='].includes(tok.v)) return left;
      pos++;
      const right = parseAdd();
      const ln = parseNumeric(toText(left)); const rn = parseNumeric(toText(right));
      const bothNum = !Number.isNaN(ln) && !Number.isNaN(rn);
      const lt = toText(left).trim().toLocaleLowerCase('pt-BR');
      const rt = toText(right).trim().toLocaleLowerCase('pt-BR');
      switch (tok.v) {
        case '=': left = bothNum ? ln === rn : lt === rt; break;
        case '<>': left = bothNum ? ln !== rn : lt !== rt; break;
        case '<': left = bothNum ? ln < rn : lt < rt; break;
        case '>': left = bothNum ? ln > rn : lt > rt; break;
        case '<=': left = bothNum ? ln <= rn : lt <= rt; break;
        case '>=': left = bothNum ? ln >= rn : lt >= rt; break;
      }
    }
  };

  const result = parseExpression();
  if (pos !== tokens.length) throw new FormulaError(ERR_GENERIC);
  return result;
};

/** Avalia uma fórmula ("=SOMA(A1:A5)") e devolve o texto a exibir na célula. */
export const evaluateFormula = (formula: string, resolve: CellResolver): string => {
  try {
    const body = formula.trim().slice(1);
    if (!body.trim()) return '';
    const value = evaluateTokens(tokenize(body), resolve);
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'boolean') return value ? 'VERDADEIRO' : 'FALSO';
    return toText(value);
  } catch (err) {
    if (err instanceof FormulaError) return err.code;
    return ERR_GENERIC;
  }
};
