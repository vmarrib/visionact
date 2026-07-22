import { defineConfig } from "vitest/config";

/**
 * Config de teste separada de vite.config.ts de propósito: o config do app
 * carrega plugins específicos de SSR/TanStack Start que não têm relação
 * com rodar testes unitários — mantê-los separados evita que uma mudança
 * de build do app quebre `vitest run`, e vice-versa.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "showcases/**/*.test.ts"],
  },
});
