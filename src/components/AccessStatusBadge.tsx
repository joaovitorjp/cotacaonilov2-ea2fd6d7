import React from 'react';
import { CalendarClock } from 'lucide-react';
import { useAccessStatus } from '@/hooks/useAccessStatus';

/** Mostra ao usuário quanto tempo de uso ainda resta, conforme definido no painel admin. */
const AccessStatusBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { status, dias } = useAccessStatus();

  if (!status || status.admin) return null;

  let texto: string;
  let cor = 'bg-emerald-50 text-emerald-700 border-emerald-200';

  if (!status.aprovado) {
    texto = 'Aguardando liberação';
    cor = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (status.bloqueado) {
    texto = 'Acesso bloqueado';
    cor = 'bg-red-50 text-red-600 border-red-200';
  } else if (dias === null) {
    texto = 'Acesso sem prazo';
    cor = 'bg-slate-50 text-slate-600 border-slate-200';
  } else if (dias <= 0) {
    texto = 'Prazo encerrado';
    cor = 'bg-red-50 text-red-600 border-red-200';
  } else {
    texto = `${dias} ${dias === 1 ? 'dia restante' : 'dias restantes'}`;
    if (dias <= 3) cor = 'bg-amber-50 text-amber-700 border-amber-200';
  }

  const titulo = status.expira_em
    ? `Acesso válido até ${new Date(status.expira_em).toLocaleDateString('pt-BR')}`
    : 'Tempo de uso do sistema';

  return (
    <span
      title={titulo}
      className={`hidden sm:inline-flex items-center gap-1.5 shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${cor} ${className}`}
    >
      <CalendarClock className="w-3.5 h-3.5" />
      {texto}
    </span>
  );
};

export default AccessStatusBadge;
