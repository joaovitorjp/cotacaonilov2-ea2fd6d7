import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft, KeyRound, LogOut, User as UserIcon } from 'lucide-react';

const Perfil: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [nome, setNome] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [senhaConfirma, setSenhaConfirma] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleChangePassword = async () => {
    if (senhaNova.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (senhaNova !== senhaConfirma) {
      toast.error('A confirmação da nova senha não confere.');
      return;
    }
    if (!senhaAtual) {
      toast.error('Informe sua senha atual.');
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({
      password: senhaNova,
      // current_password é aceito pelo backend
      current_password: senhaAtual,
    });
    setChangingPassword(false);
    if (error) {
      toast.error(error.message || 'Não foi possível alterar a senha.');
      return;
    }
    setSenhaAtual('');
    setSenhaNova('');
    setSenhaConfirma('');
    toast.success('Senha alterada com sucesso!');
  };


  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('nome, email')
        .eq('user_id', user.id)
        .maybeSingle();
      setNome((data as any)?.nome ?? '');
      setEmailLocal((data as any)?.email ?? user.email ?? '');
      setLoading(false);
    })();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    const clean = nome.trim();
    if (clean.length < 2) {
      toast.error('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    if (clean.length > 80) {
      toast.error('Nome muito longo (máximo 80 caracteres).');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, email: user.email ?? emailLocal, nome: clean },
        { onConflict: 'user_id' }
      );
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar perfil.');
    } else {
      toast.success('Perfil atualizado!');
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border px-4 sm:px-6 py-3 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-foreground hover:text-primary transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span className="font-display font-bold">Voltar</span>
        </button>
        <Button variant="ghost" size="icon" onClick={signOut} title="Sair">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <div className="max-w-lg mx-auto p-6 sm:p-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            <UserIcon className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">Meu Perfil</h1>
            <p className="text-sm text-muted-foreground">Gerencie suas informações</p>
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" value={emailLocal} disabled className="opacity-70" />
            <p className="text-xs text-muted-foreground">O email é vinculado à sua conta e não pode ser alterado.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome completo"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">Este nome será exibido nas mensagens enviadas aos fornecedores.</p>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-4 mt-6">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <h2 className="font-display font-bold text-foreground">Alterar senha</h2>
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha-atual">Senha atual</Label>
            <Input
              id="senha-atual"
              type="password"
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha-nova">Nova senha</Label>
            <Input
              id="senha-nova"
              type="password"
              value={senhaNova}
              onChange={e => setSenhaNova(e.target.value)}
              placeholder="Mínimo de 6 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="senha-confirma">Confirmar nova senha</Label>
            <Input
              id="senha-confirma"
              type="password"
              value={senhaConfirma}
              onChange={e => setSenhaConfirma(e.target.value)}
              placeholder="Repita a nova senha"
              autoComplete="new-password"
            />
          </div>

          <Button onClick={handleChangePassword} disabled={changingPassword} variant="secondary" className="w-full">
            {changingPassword ? 'Alterando...' : 'Alterar senha'}
          </Button>
        </div>

      </div>
    </div>
  );
};

export default Perfil;
