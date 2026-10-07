import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig, type Plugin } from "vite"

const siteUrl = process.env.VITE_SITE_URL?.replace(/\/$/, "")
const apiTarget = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000"

// In production the Go server shows maintenance.html on every page while
// staff have maintenance mode on. The dev server redirects pages there instead.
function devMaintenance(): Plugin {
  let checked = 0
  let enabled = false
  return {
    name: "pca-dev-maintenance",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0] ?? "/"
        const isPage = req.method === "GET" && req.headers.accept?.includes("text/html") && !/\.\w+$/.test(path) && !path.startsWith("/api/")
        if (!isPage || path === "/maintenance") return next()
        if (Date.now() - checked > 1000) {
          checked = Date.now()
          enabled = await fetch(`${apiTarget}/api/maintenance`)
            .then(r => (r.ok ? r.json() : { enabled: false }))
            .then(s => !!s.enabled, () => false)
        }
        if (!enabled) return next()
        res.statusCode = 307
        res.setHeader("Location", "/maintenance")
        res.end()
      })
    },
  }
}

export default defineConfig({
  // The prerenderer crawls a preview server; bind it to IPv4 loopback so
  // "localhost" resolution differences cannot break the build.
  preview: { host: "127.0.0.1" },
  server: {
    port: 3000,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
    },
  },
  plugins: [
    devMaintenance(),
    tailwindcss(),
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        autoSubfolderIndex: true,
        failOnError: true,
      },
      pages: [
        { path: "/404", prerender: { enabled: true, outputPath: "/404.html" }, sitemap: { exclude: true } },
        { path: "/maintenance", prerender: { enabled: true, outputPath: "/maintenance.html" }, sitemap: { exclude: true } },
      ],
      sitemap: siteUrl ? { enabled: true, host: siteUrl } : { enabled: false },
    }),
    viteReact(),
  ],
})
