import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

import pkg from "./package.json" with { type: "json" }

export default defineConfig({
  // Served under pcaSite.mount; the router reads it from import.meta.env.BASE_URL.
  base: pkg.pcaSite.mount.replace(/\/?$/, "/"),
  server: {
    port: 3001,
    proxy: {
      "/api": { target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
})
