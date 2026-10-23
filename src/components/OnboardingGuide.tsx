import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Circle, Rocket, Upload, FolderOpen, Users, Link2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAccessStatus } from '@/hooks/useAccessStatus';
import { Button } from '@/components/ui/button';

interface Props {
  hasListaAberta: boolean;
  onImportar: () => void;
  onAbrir: () => void;
  onFornecedores: () => void;
  onGerarLink: () => void;
}

/** Guia obrigatório da primeira cotação: importar → abrir → fornecedor → link. */
const OnboardingGuide: React.FC<Props> = ({ hasListaAberta, onImportar, onAbrir, onFornecedores, onGerarLink }) => {
  const { user } = useAuth();
  const { status } = useAccessStatus();
  const [pendente, setPendente] = useState(false);
  const [prog, setProg] = useState({ lista: false, fornecedor: false, link: false });
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!user || !status || status.admin || !status.ativo) return;
    supabase.from('profiles').select('onboarding_concluido_at').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setPendente(!!data && !(data as any).onboarding_concluido_at));
  }, [user, status]);

  const verificar = useCallback(async () => {
    if (!user) return;
    const c = (t: 'listas' | 'fornecedores' | 'links_cotacao') =>
      supabase.from(t).select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    const [l, f, k] = await Promise.all([c('listas'), c('fornecedores'), c('links_cotacao')]);
    const p = { lista: (l.count ?? 0) > 0, fornecedor: (f.count ?? 0) > 0, link: (k.count ?? 0) > 0 };
    setProg(p);
    if (p.link) {
      await supabase.from('profiles').update({ onboarding_concluido_at: new Date().toISOString() } as any).eq('user_id', user.id);
      setConcluido(true);
    }
  }, [user]);

  useEffect(() => {
    if (!pendente || concluido) return;
    void verificar();
    const id = window.setInterval(verificar, 4000);
    return () => window.clearInterval(id);
  }, [pendente, concluido, verificar]);

  if (!pendente) return null;

  const passos = [
    { feito: prog.lista, titulo: 'Importe sua lista de produtos', texto: 'Envie o Excel ou pesquise produtos da rede para criar a cotação.', icon: Upload, acao: onImportar, botao: 'Importar' },
    { feito: prog.lista && (hasListaAberta || prog.link), titulo: 'Abra a cotação', texto: 'Em "Abertas", clique na cotação para carregar a planilha.', icon: FolderOpen, acao: onAbrir, botao: 'Abrir' },
    { feito: prog.fornecedor, titulo: 'Cadastre um fornecedor', texto: 'Informe nome e WhatsApp de quem vai responder os preços.', icon: Users, acao: onFornecedores, botao: 'Fornecedores' },
    { feito: prog.link, titulo: 'Gere o link de resposta', texto: 'Com a cotação aberta, gere o link e envie ao fornecedor.', icon: Link2, acao: onGerarLink, botao: 'Gerar link', precisa: hasListaAberta },
  ];
  const atual = passos.findIndex(p => !p.feito);

  return (
    <div className="fixed bottom-4 left-4 z-[100] w-[min(92vw,360px)] rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <div className="mb-3 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-primary" />
        <div>
          <p className="font-display text-sm font-bold text-foreground">
            {concluido ? 'Primeira cotação pronta!' : 'Guia da primeira cotação'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {concluido ? 'Você concluiu todos os passos.' : `Passo ${atual + 1} de ${passos.length} · obrigatório`}
          </p>
        </div>
      </div>
      <ol className="space-y-2">
        {passos.map((p, i) => {
          const ativo = i === atual && !concluido;
          return (
            <li key={i} className={`rounded-xl border p-2.5 ${ativo ? 'border-primary bg-primary/5' : 'border-transparent'}`}>
              <div className="flex items-start gap-2">
                {p.feito ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                <div className="flex-1">
                  <p className={`text-xs font-bold ${p.feito ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{i + 1}. {p.titulo}</p>
                  {ativo && (
                    <>
                      <p className="mt-1 text-[11px] text-muted-foreground">{p.texto}</p>
                      {p.precisa === false && <p className="mt-1 text-[11px] text-warning">Abra uma cotação primeiro.</p>}
                      <Button size="sm" className="mt-2 h-7 text-xs" onClick={p.acao} disabled={p.precisa === false}>
                        <p.icon className="mr-1 h-3.5 w-3.5" />{p.botao}
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {concluido && (
        <Button size="sm" className="mt-3 w-full" onClick={() => setPendente(false)}>Começar a usar</Button>
      )}
    </div>
  );
};

export default OnboardingGuide;
