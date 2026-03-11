import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.', // Garante que a raiz é a pasta atual
  server: {
    port: 5173,
    open: true
  },
  build: {
    rollupOptions: {
      input: {
        index:            resolve(__dirname, 'index.html'),
        login:            resolve(__dirname, 'login.html'),
        'login-ok':       resolve(__dirname, 'login-ok.html'),
        cadastro:         resolve(__dirname, 'cadastro.html'),
        carrinho:         resolve(__dirname, 'carrinho.html'),
        checkout:         resolve(__dirname, 'checkout.html'),
        contato:          resolve(__dirname, 'contato.html'),
        faq:              resolve(__dirname, 'faq.html'),
        'forgot-password': resolve(__dirname, 'forgot-password.html'),
        obrigado:         resolve(__dirname, 'obrigado.html'),
        pendente:         resolve(__dirname, 'pendente.html'),
        perfil:           resolve(__dirname, 'perfil.html'),
        produto:          resolve(__dirname, 'produto.html'),
        'reset-password': resolve(__dirname, 'reset-password.html'),
        'sobre-a-rig':    resolve(__dirname, 'sobre-a-rig.html'),
        'todos-os-jogos': resolve(__dirname, 'todos-os-jogos.html'),
      }
    }
  }
});
