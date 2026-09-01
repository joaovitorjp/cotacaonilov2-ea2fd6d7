import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

/**
 * Gate that:
 *  - Forces normal users without a `nome` to fill it before using the app
 */
const ProfileGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [checked, setChecked] = useState(false);
  const [needsName, setNeedsName] = useState(false);
  const [nome, setNome] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('nome')
        .eq('user_id', user.id)
        .maybeSingle();
      const current = ((data as any)?.nome ?? '').trim();
      setNeedsName(!current);
      setChecked(true);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    const clean = nome.trim();
    if (clean.length < 2) {
      toast.error('Informe um nome com pelo menos 2 caracteres.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, email: user.email ?? '', nome: clean },
        { onConflict: 'user_id' }
      );
    setSaving(false);
    if (error) {
      toast.error('Erro ao salvar nome.');
    } else {
      toast.success('Bem-vindo(a)!');
      setNeedsName(false);
    }
  };

  if (!checked) return null;

  return (
    <>
      {children}
      <AlertDialog open={needsName}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Complete seu cadastro</AlertDialogTitle>
            <AlertDialogDescription>
              Antes de continuar, informe seu nome. Ele será vinculado às suas cotações e às mensagens enviadas aos fornecedores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 my-2">
            <Label htmlFor="nome-gate">Nome</Label>
            <Input
              id="nome-gate"
              autoFocus
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome completo"
              maxLength={80}
              onKeyDown={e => { if (e.key === 'Enter') void save(); }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogAction onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar e continuar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default ProfileGate;
