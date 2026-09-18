import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAvatar, notifyAvatarUpdated } from '@/hooks/useAvatar';
import UserAvatar from '@/components/UserAvatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { LogOut, User as UserIcon, Camera, Trash2, Loader2, KeyRound } from 'lucide-react';

interface PerfilPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 2 * 1024 * 1024; // 2MB

const PerfilPanel: React.FC<PerfilPanelProps> = ({ open, onOpenChange }) => {
  const { user, signOut } = useAuth();
  const { avatarUrl, avatarPath, refresh } = useAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    setLoading(true);
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
  }, [open, user]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;

    if (!ACCEPTED.includes(file.type)) {
      toast.error('Formato inválido. Use JPG, PNG ou WEBP.');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Imagem muito grande. Máximo 2 MB.');
      return;
    }

    setUploading(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/avatar-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('profiles')
      .upload(path, file, { upsert: true, contentType: file.type });

    if (upErr) {
      setUploading(false);
      toast.error('Erro ao enviar a imagem.');
      return;
    }

    const { error: dbErr } = await supabase
      .from('profiles')
      .upsert(
        { user_id: user.id, email: user.email ?? emailLocal, nome: nome.trim() || 'Usuário', avatar_url: path },
        { onConflict: 'user_id' }
      );

    if (dbErr) {
      setUploading(false);
      toast.error('Erro ao salvar a foto no perfil.');
      return;
    }

    if (avatarPath && avatarPath !== path) {
      await supabase.storage.from('profiles').remove([avatarPath]);
    }

    await refresh();
    notifyAvatarUpdated();
    setUploading(false);
    toast.success('Foto de perfil atualizada!');
  };

  const removeAvatar = async () => {
    if (!user || !avatarPath) return;
    setUploading(true);
    await supabase.storage.from('profiles').remove([avatarPath]);
    await supabase.from('profiles').update({ avatar_url: null }).eq('user_id', user.id);
    await refresh();
    notifyAvatarUpdated();
    setUploading(false);
    toast.success('Foto removida.');
  };

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
      onOpenChange(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="pb-6 border-b">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative group">
              <UserAvatar
                src={avatarUrl}
                name={nome}
                email={emailLocal}
                className="w-24 h-24 ring-4 ring-primary/10 transition-all duration-300 group-hover:ring-primary/20"
                iconClassName="w-10 h-10"
                textClassName="text-2xl font-bold"
              />
              <button 
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute bottom-0 right-0 p-2 bg-primary text-white rounded-full shadow-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                title="Alterar foto"
              >
                <Camera className="w-4 h-4" />
              </button>
              {uploading && (
                <div className="absolute inset-0 rounded-full bg-white/60 backdrop-blur-[1px] flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              )}
            </div>
            
            <div className="space-y-1">
              <SheetTitle className="font-display text-2xl tracking-tight">Meu Perfil</SheetTitle>
              <SheetDescription className="text-sm">Personalize sua identidade no sistema</SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary/50" />
            <p className="text-muted-foreground animate-pulse">Carregando perfil...</p>
          </div>
        ) : (
          <div className="py-6 space-y-8">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleFile}
            />

            {/* Ações de Foto */}
            {avatarUrl && (
              <div className="flex justify-center -mt-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  disabled={uploading} 
                  onClick={removeAvatar} 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs gap-2 h-8"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Remover foto atual
                </Button>
              </div>
            )}

            {/* Campos do Formulário */}
            <div className="space-y-6">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="nome" className="text-sm font-semibold text-foreground/80">Nome Completo</Label>
                  <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded uppercase font-medium">Obrigatório</span>
                </div>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <Input
                    id="nome"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Como você quer ser chamado?"
                    maxLength={80}
                    className="pl-10 h-11 transition-all focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
                  Este nome será utilizado para identificar você nas mensagens automáticas de WhatsApp enviadas aos fornecedores.
                </p>
              </div>

              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-sm font-semibold text-foreground/80">Endereço de E-mail</Label>
                <div className="relative group">
                  <Input 
                    id="email" 
                    value={emailLocal} 
                    disabled 
                    className="h-11 bg-muted/30 border-dashed cursor-not-allowed opacity-80" 
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] bg-foreground/10 px-1.5 py-0.5 rounded text-foreground/60 font-medium">BLOQUEADO</span>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground/80 leading-relaxed px-1">
                  O e-mail é a chave da sua conta e não pode ser alterado por motivos de segurança.
                </p>
              </div>
            </div>

            {/* Ações de Rodapé */}
            <div className="space-y-3 pt-4">
              <Button 
                onClick={handleSave} 
                disabled={saving || uploading} 
                className="w-full h-11 text-base font-medium shadow-md transition-all active:scale-[0.98]"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                  </>
                ) : (
                  'Salvar alterações'
                )}
              </Button>

              <div className="flex items-center gap-2 py-2">
                <div className="h-px flex-1 bg-border/60"></div>
                <span className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase">Conta</span>
                <div className="h-px flex-1 bg-border/60"></div>
              </div>

              <Button
                variant="outline"
                onClick={() => { onOpenChange(false); signOut(); }}
                className="w-full h-11 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/20 hover:border-destructive/30 transition-colors"
              >
                <LogOut className="w-4 h-4 mr-2" /> Sair da conta
              </Button>
            </div>
          </div>
        ) as any}
      </SheetContent>
    </Sheet>
  );
};

export default PerfilPanel;
