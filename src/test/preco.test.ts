import { describe, it, expect } from 'vitest';
import { parsePrecoNum, aplicarMarkup } from '@/lib/preco';

describe('preços exportados', () => {
  it('lê ponto como decimal (3.89 não vira 389)', () => expect(parsePrecoNum('3.89')).toBe(3.89));
  it('lê vírgula e milhar', () => expect(parsePrecoNum('R$ 1.234,56')).toBe(1234.56));
  it('aplica acréscimo de 10%', () => expect(aplicarMarkup(10, 10)).toBe(11));
  it('sem acréscimo mantém preço', () => expect(aplicarMarkup(3.89, 0)).toBe(3.89));
});
