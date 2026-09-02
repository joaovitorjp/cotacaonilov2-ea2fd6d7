/** Utilitários das chaves de acesso COTARME (estilo SHA-256). */

export const SUPORTE_WHATSAPP = '5566984640346';
export const SUPORTE_WHATSAPP_LABEL = '(66) 98464-0346';

export const PRECOS = {
  mensal: 'R$ 49,99',
  vitalicio: 'R$ 159,99',
} as const;

export type TipoChave = keyof typeof PRECOS;

/** Link do WhatsApp do suporte com mensagem pronta. */
export const whatsappLink = (mensagem: string) =>
  `https://wa.me/${SUPORTE_WHATSAPP}?text=${encodeURIComponent(mensagem)}`;

/** Gera uma chave aleatória de 64 caracteres (SHA-256 de bytes aleatórios). */
export const gerarChave = async (): Promise<string> => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/** Versão curta para exibição em listas. */
export const chaveResumida = (chave: string) =>
  `${chave.slice(0, 10)}…${chave.slice(-6)}`;
