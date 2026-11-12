// Entrada do Cloudflare Worker: junta a página do perfil web (web/profile/index.html) ao código do servidor.
// Fora da Cloudflare, o server.mjs lê o mesmo arquivo do disco.
import app from './index.js';
import page from '../../../web/profile/index.html';

export default {
  fetch: (request, env) => app.fetch(request, { ...env, PROFILE_PAGE: page })
};
