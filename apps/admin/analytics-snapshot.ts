import { readFile, stat } from "node:fs/promises"
import { extname, relative, resolve } from "node:path"
import type { Plugin } from "vite"

/** Development-only saved UI. Ignored archive assets never enter a deployment. */
export function analyticsSnapshot():Plugin {
  const prefix="/admin/analytics-before/"
  const root=resolve(import.meta.dirname,"../../archive/analytics-before-2026-10-24/viewer")
  return {name:"local-analytics-comparison",apply:"serve",configureServer(server){
    server.middlewares.use(async(req,res,next)=>{
      const url=new URL(req.url??"/","http://localhost")
      if(!url.pathname.startsWith(prefix)) return next()
      if(req.method!=="GET"&&req.method!=="HEAD"){res.statusCode=405;res.end();return}
      try {
        let file=resolve(root,decodeURIComponent(url.pathname.slice(prefix.length)))
        if(file!==root&&relative(root,file).startsWith("..")){res.statusCode=404;res.end();return}
        try {if(!(await stat(file)).isFile())file=resolve(root,"index.html")}catch{file=resolve(root,"index.html")}
        let body=await readFile(file)
        if(extname(file)===".html")body=Buffer.from(body.toString().replace(/(<body[^>]*>)/,'$1<div style="padding:9px 16px;background:#fff2bd;color:#46390c;font:12px system-ui;text-align:center" role="note">Saved before version · Workspace 03 · use sample mode for design comparison</div>'))
        const types:Record<string,string>={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2"}
        res.setHeader("Content-Type",types[extname(file)]??"application/octet-stream")
        res.setHeader("Cache-Control","no-store")
        res.setHeader("X-Content-Type-Options","nosniff")
        res.end(req.method==="HEAD"?undefined:body)
      }catch{res.statusCode=404;res.end("Saved comparison unavailable. Restore the local snapshot build; it is not deployed.")}
    })
  }}
}
