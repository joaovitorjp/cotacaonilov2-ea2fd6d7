/** Origem pública usada nos links compartilhados (fornecedores e visualização). */
export const getAppOrigin = () =>
  typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : '';

export const getPublicBaseUrl = () => {
  const origin = getAppOrigin();
  if (origin.includes('preview--') && origin.includes('.lovable.app')) {
    return 'https://cotarme.com';
  }
  return origin;
};
