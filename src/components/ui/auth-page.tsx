"use client";

import React from "react";
import { motion } from "framer-motion";
import { Button } from "./button";
import {
  AtSignIcon,
  ChevronLeftIcon,
} from "lucide-react";
import { Input } from "./input";
import { cn } from "@/lib/utils";
import { getAppOrigin } from "@/lib/oauth";

interface AuthPageProps {
  onGoogleSignIn: () => void;
  onEmailSignIn: (e: React.FormEvent) => void;
  email: string;
  setEmail: (val: string) => void;
  password?: string;
  setPassword?: (val: string) => void;
  nome?: string;
  setNome?: (val: string) => void;
  isSignUp: boolean;
  setIsSignUp: (val: boolean) => void;
  loading: boolean;
  googleLoading: boolean;
}

export function AuthPage({
  onGoogleSignIn,
  onEmailSignIn,
  email,
  setEmail,
  password,
  setPassword,
  nome,
  setNome,
  isSignUp,
  setIsSignUp,
  loading,
  googleLoading,
}: AuthPageProps) {
  return (
    <div className="relative min-h-screen w-full flex overflow-hidden bg-background">
      {/* Background with animated paths */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>

      {/* Main Content Side (Left on Desktop) */}
      <div className="relative z-10 hidden lg:flex flex-col justify-between w-1/2 p-12 bg-slate-950 text-white">
        <div className="flex items-center gap-2 text-xl font-bold tracking-tight">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <AtSignIcon className="w-5 h-5 text-white" />
          </div>
          COTARME
        </div>

        <div className="max-w-md">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            <p className="text-3xl font-medium leading-tight mb-6">
              “Esta plataforma nos ajudou a economizar tempo e atender nossos fornecedores mais rápido do que nunca.”
            </p>
            <p className="text-lg text-slate-400">~ Equipe COTARME</p>
          </motion.div>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500">
          <span>© 2026 COTARME</span>
        </div>
      </div>

      {/* Form Side (Right on Desktop) */}
      <div className="relative z-10 flex-1 flex flex-col bg-white/40 backdrop-blur-md lg:bg-transparent">
        <div className="p-6 lg:p-12 flex justify-end">
          <Button variant="ghost" className="gap-2 text-slate-600" onClick={() => window.location.assign(getAppOrigin())}>
            <ChevronLeftIcon className="w-4 h-4" />
            Voltar
          </Button>
        </div>

        <div className="flex-1 flex items-center justify-center px-6 pb-12 lg:px-12">
          <div className="w-full max-w-sm space-y-8">
            <div className="lg:hidden flex items-center gap-2 text-xl font-bold tracking-tight mb-8">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
                <AtSignIcon className="w-5 h-5 text-white" />
              </div>
              COTARME
            </div>

            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                {isSignUp ? "Crie sua conta" : "Bem-vindo de volta"}
              </h1>
              <p className="text-slate-500">
                {isSignUp ? "Cadastre-se para começar" : "Entre com sua conta para continuar"}
              </p>
            </div>

            <div className="space-y-4">
              <Button
                variant="outline"
                className="w-full h-12 bg-white hover:bg-slate-50 border-slate-200 text-slate-700 gap-3 text-base shadow-sm"
                onClick={onGoogleSignIn}
                disabled={googleLoading || loading}
              >
                {googleLoading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                ) : (
                  <GoogleIcon className="w-5 h-5" />
                )}
                Continuar com Google
              </Button>
            </div>

            <AuthSeparator />

            <form onSubmit={onEmailSignIn} className="space-y-4">
              <div className="space-y-4">
                {isSignUp && setNome && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Nome</label>
                    <Input
                      placeholder="Seu nome"
                      value={nome}
                      onChange={(e) => setNome(e.target.value)}
                      className="h-12 border-slate-200 focus:ring-blue-500"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="seu@email.com"
                      className="h-12 ps-10 border-slate-200 focus:ring-blue-500"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                    <AtSignIcon className="absolute left-3 top-3.5 w-5 h-5 text-slate-400" />
                  </div>
                </div>
                {setPassword && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Senha</label>
                    <Input
                      type="password"
                      placeholder="••••••••"
                      className="h-12 border-slate-200 focus:ring-blue-500"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                )}
              </div>

              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-200" disabled={loading}>
                {loading ? "Processando..." : (isSignUp ? "Criar conta" : "Entrar com Email")}
              </Button>
            </form>

            <div className="text-center space-y-4">
              <p className="text-sm text-slate-500">
                {isSignUp ? "Já tem uma conta?" : "Não tem uma conta?"}{" "}
                <button
                  type="button"
                  className="text-blue-600 font-semibold hover:underline"
                  onClick={() => setIsSignUp(!isSignUp)}
                >
                  {isSignUp ? "Entre agora" : "Cadastre-se"}
                </button>
              </p>
              
              <p className="text-xs text-slate-400 leading-relaxed">
                Ao clicar em continuar, você concorda com nossos{" "}
                <a href="#" className="underline hover:text-slate-600">Termos de Serviço</a> e{" "}
                <a href="#" className="underline hover:text-slate-600">Política de Privacidade</a>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FloatingPaths({ position }: { position: number }) {
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${380 - i * 5 * position} -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${152 - i * 5 * position} ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${684 - i * 5 * position} ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    color: `rgba(59, 130, 246, ${0.05 + i * 0.01})`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="w-full h-full text-slate-950" viewBox="0 0 696 316" fill="none">
        <title>Background Paths</title>
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            stroke={path.color}
            strokeWidth={path.width}
            strokeOpacity="0.1"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{
              duration: 20 + Math.random() * 10,
              repeat: Infinity,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

const GoogleIcon = (props: React.ComponentProps<"svg">) => (
  <svg viewBox="0 0 24 24" {...props}>
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

const AuthSeparator = () => {
  return (
    <div className="relative">
      <div className="absolute inset-0 flex items-center">
        <span className="w-full border-t border-slate-200" />
      </div>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="bg-white/50 px-2 text-slate-500 font-medium">Ou continue com</span>
      </div>
    </div>
  );
};
