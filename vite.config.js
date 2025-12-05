import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/groq": {
        target: "https://api.groq.com/openai/v1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/groq/, ""),
      },
      "/murf": {
        target: "https://global.api.murf.ai/v1",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/murf/, ""),
      },
    },
  },
});
