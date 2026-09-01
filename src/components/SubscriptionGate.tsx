import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAssinatura } from '@/hooks/useAssinatura';
import { useUserRole } from '@/hooks/useUserRole';

/**
 * Bloqueia o acesso ao sistema para usuarios sem assinatura ativa.
 * Admins e vitalicios passam direto; trial valido e 'active' tambem.
 */
const SubscriptionGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { role, loading: roleLoading } = useUserRole();
  const { hasAccess, loading } = useAssinatura();
  const navigate = useNavigate();

  const blocked = !loading && !roleLoading && role !== 'admin' && !hasAccess;

  useEffect(() => {
    if (blocked) navigate('/assinatura', { replace: true });
  }, [blocked, navigate]);

  if (loading || roleLoading) return null;
  if (blocked) return null;

  return <>{children}</>;
};

export default SubscriptionGate;
