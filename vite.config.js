import { defineConfig } from 'vite';

export default defineConfig({
  root: '.', // Garante que a raiz é a pasta atual
  server: {
    port: 5173,
    open: true
  }
});
