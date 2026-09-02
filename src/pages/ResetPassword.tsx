import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import adrLogo from '@/assets/adr-logo.jpeg';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [valid, setValid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let done = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        done = true;
        setValid(true);
        setReady(true);
      }
    });

    // Fallback: link já processado ou sessão de recuperação existente
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (done) return;
      setValid(!!data.session);
      setReady(true);
    })();

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('A senha deve ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      toast.error('As senhas não conferem.');
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) {
      toast.error(error.message || 'Não foi possível alterar a senha.');
      return;
    }
    toast.success('Senha alterada com sucesso!');
    navigate('/', { replace: true });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <img src={adrLogo} alt="COTARME" className="h-9 w-9 rounded-lg object-contain bg-white p-0.5 border border-border/60" />
          <span className="font-display text-xl font-bold tracking-tight">COTARME</span>
        </div>

        {!ready ? (
          <p className="text-sm text-muted-foreground">Validando link...</p>
        ) : !valid ? (
          <>
            <h1 className="font-display text-2xl font-bold">Link inválido ou expirado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Solicite uma nova redefinição de senha na tela de login.
            </p>
            <Button className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
              Voltar ao login
            </Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-2xl font-bold">Definir nova senha</h1>
            <p className="mt-2 text-sm text-muted-foreground">Escolha uma senha com pelo menos 6 caracteres.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Nova senha</Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmar senha</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar nova senha'}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
};

export default ResetPassword;
