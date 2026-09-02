import react from "@vitejs/plugin-react";
import stylex from "@stylexjs/unplugin";
import { defineConfig } from "vite";

export default defineConfig({
  // StyleX is compiled at build time so Astryx `xstyle` props and hooks like useEntryAnimation work.
  plugins: [stylex.vite(), react()],
  server: { port: 5173 },
  build: {
    outDir: "dist",
    sourcemap: true,
    // Firebase and Recharts get their own chunks (Recharts is lazy-loaded); Astryx splits per route
    // so rarely-visited pages do not load their components up front. Budget: < 250 kB gz initial
    // JS excluding Firebase — see docs §9.
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/firebase") || id.includes("node_modules/@firebase")) return "firebase";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-") || id.includes("node_modules/victory-vendor")) return "charts";
          return undefined;
        },
      },
    },
  },
});
