import adrLogo from '@/assets/adr-logo.jpeg';

export const DEFAULT_BRAND = { nome: 'COTARME', logo: adrLogo as string };

export interface Brand {
  nome: string;
  logo: string;
}

let current: Brand = { ...DEFAULT_BRAND };
const listeners = new Set<(b: Brand) => void>();

export const getBrand = (): Brand => current;

export const setBrand = (b: Partial<Brand> | null) => {
  current = {
    nome: b?.nome?.trim() || DEFAULT_BRAND.nome,
    logo: b?.logo || DEFAULT_BRAND.logo,
  };
  listeners.forEach(l => l(current));
};

export const subscribeBrand = (l: (b: Brand) => void) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

/** Reduz e converte a imagem para data URL (uso em telas e PDFs). */
export const imageToDataUrl = (file: File, max = 512): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Navegador sem suporte.')); return; }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
