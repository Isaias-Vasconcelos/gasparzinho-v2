// Detecta se está rodando dentro do Cordova e ajusta a URL base da API
function getApiBaseUrl() {
  const isCordova =
    typeof window !== 'undefined' &&
    (window.cordova !== undefined || document.URL.startsWith('file://'));

  if (isCordova) {
    // Em produção mobile, aponte para o servidor real
    return import.meta.env.VITE_API_URL_MOBILE || 'http://SEU_SERVIDOR:3001/api';
  }

  return import.meta.env.VITE_API_URL || '/api';
}

export const API_BASE_URL = getApiBaseUrl();
