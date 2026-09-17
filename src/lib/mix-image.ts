import { imageToDataUrl } from '@/lib/branding';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Converte a imagem escolhida/colada em data URL reduzida (máx. 400px). */
export const prepareMixImage = async (file: File): Promise<string> => {
  if (!file.type.startsWith('image/')) throw new Error('O arquivo não é uma imagem.');
  if (file.size > MAX_IMAGE_BYTES) throw new Error('Imagem muito grande (máx. 5 MB).');
  return imageToDataUrl(file, 400);
};

/** Extrai o primeiro arquivo de imagem de um evento de colar ou arrastar. */
export const imageFromTransfer = (data: DataTransfer | null): File | null => {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith('image/')) return file;
  }
  return null;
};

export const parsePrecoBR = (value: string): number | null => {
  const raw = String(value ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!raw) return null;
  let normalized = raw;
  if (raw.includes(',')) normalized = raw.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export const formatPrecoBR = (value: number | null | undefined): string =>
  value === null || value === undefined || !Number.isFinite(Number(value))
    ? 'R$ -'
    : `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
