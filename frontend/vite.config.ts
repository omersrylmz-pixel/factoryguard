import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Geliştirmede /api istekleri backend'e proxy'lenir; böylece tarayıcı açısından aynı origin
// olur ve refresh cookie'si (SameSite=Strict) çalışır, CORS gerekmez.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": { target: process.env.FG_API_URL ?? "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
});
