import React, { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLang, setLang, subscribeLang, LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "default" | "subtle";
}

const LanguageSwitcher: React.FC<Props> = ({ className, variant = "default" }) => {
  const [lang, setLangState] = useState<Lang>(getLang());

  useEffect(() => {
    const unsub = subscribeLang(setLangState);
    return () => {
      unsub();
    };
  }, []);

  const atual = LANGS.find(l => l.code === lang) ?? LANGS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Idioma"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-xl px-2.5 h-9 text-xs font-bold transition-colors",
            variant === "subtle"
              ? "text-muted-foreground hover:bg-muted"
              : "border border-border bg-card text-foreground hover:bg-muted",
            className,
          )}
        >
          <Globe className="w-4 h-4" />
          {atual.short}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[150px]">
        {LANGS.map(l => (
          <DropdownMenuItem
            key={l.code}
            onClick={() => setLang(l.code)}
            className={cn("text-sm font-medium cursor-pointer", l.code === lang && "font-bold")}
          >
            <span className="w-7 text-[11px] font-black text-muted-foreground">{l.short}</span>
            {l.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default LanguageSwitcher;
