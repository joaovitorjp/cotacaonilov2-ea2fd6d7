import { useEffect, useMemo, useState } from 'react';
import { useAssinatura } from '@/hooks/useAssinatura';
import { useNavigate } from 'react-router-dom';
import { Clock, Crown, Infinity as InfinityIcon } from 'lucide-react';

const pad = (n: number) => String(n).padStart(2, '0');

const SubscriptionTimerBadge = () => {
  const { assinatura, loading } = useAssinatura();
  const navigate = useNavigate();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const target = useMemo(() => {
    if (!assinatura) return null;
    if (assinatura.status === 'trial') return assinatura.trial_ends_at;
    if (assinatura.status === 'active') return assinatura.current_period_end;
    return null;
  }, [assinatura]);

  if (loading || !assinatura) return null;

  if (assinatura.status === 'lifetime') {
    return (
      <div className="flex items-center gap-1.5 px-3 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold shrink-0" title="Plano vitalício ativo">
        <InfinityIcon className="w-3.5 h-3.5" />
        <span className="hidden lg:inline">Vitalício</span>
      </div>
    );
  }

  if (!target) return null;

  const diff = new Date(target).getTime() - now;
  const isTrial = assinatura.status === 'trial';
  const expired = diff <= 0;

  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;

  const urgent = !expired && diff < 24 * 3600 * 1000;

  const cls = expired
    ? 'bg-red-50 border-red-200 text-red-600'
    : urgent
      ? 'bg-orange-50 border-orange-200 text-orange-700'
      : isTrial
        ? 'bg-sky-50 border-sky-200 text-sky-700'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700';

  return (
    <button
      onClick={() => navigate('/assinatura')}
      className={`flex items-center gap-1.5 px-3 h-9 rounded-xl border text-xs font-bold shrink-0 tabular-nums transition-colors hover:brightness-95 ${cls}`}
      title={isTrial ? 'Período de teste — clique para assinar' : 'Assinatura vigente — clique para gerenciar'}
    >
      {isTrial ? <Clock className="w-3.5 h-3.5" /> : <Crown className="w-3.5 h-3.5" />}
      <span className="hidden lg:inline mr-0.5">{isTrial ? 'Teste:' : 'Plano:'}</span>
      {expired ? 'Expirado' : `${d}d ${pad(h)}h ${pad(m)}m ${pad(s)}s`}
    </button>
  );
};

export default SubscriptionTimerBadge;
