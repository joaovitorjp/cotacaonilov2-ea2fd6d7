import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { markUserSignOut, saveSessionBackup, tryRecoverSession } from '@/lib/sessionResilience';
import type { User, Session } from '@supabase/supabase-js';


interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let gotSession = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        gotSession = true;
        saveSessionBackup(session);
      }

      // Queda de sessão que o usuário não pediu (ex.: 429 no refresh em rede
      // corporativa): tenta recuperar antes de derrubar o login.
      if (event === 'SIGNED_OUT') {
        tryRecoverSession().then((recovered) => {
          if (recovered) return;
          setSession(null);
          setUser(null);
          setLoading(false);
        });
        return;
      }

      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      // Nunca sobrescrever uma sessão já entregue pelo listener com null
      // (o storage do preview é assíncrono e pode responder tarde/vazio).
      if (!session && gotSession) {
        setLoading(false);
        return;
      }
      if (session) {
        gotSession = true;
        saveSessionBackup(session);
      }
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);


  const signOut = async () => {
    markUserSignOut();
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };


  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
