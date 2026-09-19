import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { AlertCircle, Loader2, Package, Users } from 'lucide-react';
import adrLogo from '@/assets/adr-logo.jpeg';
import { DEFAULT_BRAND } from '@/lib/branding';
import { getPrecoUF, ufsDaResposta, ordenarUFs, ufNome } from '@/lib/estados';

interface Produto {
  codigo_interno: string;
  descricao: string;
  codigo_barras?: string;
  categoria?: string;
  observacao?: string;
}

interface RespostaRow {
  empresa: string;
  resposta: any[];
  created_at: string;
}

const parseNum = (v: unknown): number | null => {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  let s = String(v).replace(/[^\d.,-]/g, '').trim();
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const fmt = (n: number | null) =>
  n === null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CotacaoPublica = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lista, setLista] = useState<{ nome: string; produtos: Produto[]; created_at: string } | null>(null);
  const [respostas, setRespostas] = useState<RespostaRow[]>([]);
  const [marca, setMarca] = useState<{ nome: string; logo: string }>({ nome: DEFAULT_BRAND.nome, logo: adrLogo });

  useEffect(() => {
    const load = async () => {
      if (!token) { setError('Link inválido.'); setLoading(false); return; }
      const { data, error: rpcErr } = await (supabase as any).rpc('get_cotacao_compartilhada', { _token: token });
      const payload = data && typeof data === 'object' && !Array.isArray(data) ? (data as any) : null;
      if (rpcErr || !payload?.lista) {
        setError('Esta cotação não está mais disponível para visualização.');
        setLoading(false);
        return;
      }
      setLista({
        nome: payload.lista.nome,
        produtos: (payload.lista.produtos ?? []) as Produto[],
        created_at: payload.lista.created_at,
      });
      setRespostas((payload.respostas ?? []) as RespostaRow[]);
      setMarca({
        nome: payload?.marca?.nome || DEFAULT_BRAND.nome,
        logo: payload?.marca?.logo_url || adrLogo,
      });
      setLoading(false);
    };
    load();
  }, [token]);

  // Colunas: uma por fornecedor + UF respondida
  const colunas = useMemo(() => {
    const cols: { empresa: string; uf: string }[] = [];
    for (const r of respostas) {
      const ufs = ordenarUFs(ufsDaResposta(r.resposta));
      for (const uf of ufs) cols.push({ empresa: r.empresa, uf });
    }
    return cols;
  }, [respostas]);

  const precoMap = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const r of respostas) {
      for (const item of r.resposta ?? []) {
        for (const uf of ordenarUFs(ufsDaResposta([item]))) {
          map.set(`${r.empresa}|${uf}|${item.codigo_interno}`, parseNum(getPrecoUF(item, uf)));
        }
      }
    }
    return map;
  }, [respostas]);

  const menorPorProduto = useMemo(() => {
    const out: Record<string, number> = {};
    for (const p of lista?.produtos ?? []) {
      const vals = colunas
        .map(c => precoMap.get(`${c.empresa}|${c.uf}|${p.codigo_interno}`) ?? null)
        .filter((v): v is number => v !== null);
      if (vals.length >= 2) out[p.codigo_interno] = Math.min(...vals);
    }
    return out;
  }, [lista, colunas, precoMap]);

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

  if (error || !lista) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="text-center space-y-3 max-w-sm mx-auto px-6">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Cotação indisponível</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="bg-primary text-primary-foreground px-4 sm:px-6 py-4 shrink-0 shadow-md">
        <div className="max-w-[1400px] mx-auto flex items-center gap-3">
          <img src={marca.logo} alt={marca.nome} className="h-11 w-11 rounded-lg bg-white object-contain p-0.5 shrink-0" />
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">{marca.nome}</h1>
            <p className="text-primary-foreground/80 text-xs sm:text-sm mt-0.5">Cotação: {lista.nome}</p>
          </div>
          <span className="ml-auto text-[10px] sm:text-xs bg-white/15 px-2 py-1 rounded-full font-bold">
            Somente visualização
          </span>
        </div>
      </header>

      <div className="bg-card border-b border-border px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Package className="w-4 h-4" />{lista.produtos.length} produtos</span>
          <span className="flex items-center gap-1.5"><Users className="w-4 h-4" />{respostas.length} fornecedor(es)</span>
          <span>Criada em {new Date(lista.created_at).toLocaleDateString('pt-BR')}</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 sm:p-6">
        <div className="max-w-[1400px] mx-auto border border-border rounded-lg overflow-auto bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-3 py-2 font-display text-xs uppercase tracking-wider text-muted-foreground border-b border-border">Código</th>
                <th className="text-left px-3 py-2 font-display text-xs uppercase tracking-wider text-muted-foreground border-b border-border min-w-[240px]">Descrição</th>
                <th className="text-left px-3 py-2 font-display text-xs uppercase tracking-wider text-muted-foreground border-b border-border">EAN</th>
                {colunas.map((c, i) => (
                  <th key={i} className="text-right px-3 py-2 font-display text-xs uppercase tracking-wider text-muted-foreground border-b border-l border-border whitespace-nowrap">
                    {c.empresa}
                    <span className="block text-[10px] normal-case text-primary">{c.uf} · {ufNome(c.uf)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.produtos.map((p, idx) => (
                <tr key={idx} className={idx % 2 ? 'bg-muted/30' : ''}>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground border-b border-border whitespace-nowrap">{p.codigo_interno}</td>
                  <td className="px-3 py-1.5 text-foreground border-b border-border">{p.descricao}</td>
                  <td className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border whitespace-nowrap">{p.codigo_barras || '—'}</td>
                  {colunas.map((c, i) => {
                    const v = precoMap.get(`${c.empresa}|${c.uf}|${p.codigo_interno}`) ?? null;
                    const melhor = v !== null && menorPorProduto[p.codigo_interno] === v;
                    return (
                      <td
                        key={i}
                        className={`px-3 py-1.5 text-right border-b border-l border-border whitespace-nowrap ${
                          melhor ? 'text-success font-bold' : 'text-foreground'
                        }`}
                      >
                        {fmt(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {respostas.length === 0 && (
          <p className="max-w-[1400px] mx-auto text-center text-sm text-muted-foreground mt-4">
            Nenhum fornecedor respondeu esta cotação.
          </p>
        )}
      </div>

      <footer className="shrink-0 border-t border-border bg-card px-4 sm:px-6 py-3 text-center text-xs text-muted-foreground">
        Visualização pública gerada por {marca.nome}.
      </footer>
    </div>
  );
};

export default CotacaoPublica;
