import type { ReactNode } from "react"

export function Help({ title, children }: { title: string; children: ReactNode }) {
  return <details className="wb-help"><summary aria-label={`Explain ${title}`}>?</summary><div><strong>{title}</strong><p>{children}</p></div></details>
}
export function Panel({ title, note, help, children, action }: { title: string; note?: string; help?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return <section className="wb-panel"><div className="wb-panel-head"><div><h2>{title}{help && <Help title={title}>{help}</Help>}</h2>{note && <p>{note}</p>}</div>{action}</div>{children}</section>
}
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "blue" | "gold" | "green" }) {
  return <span className={`wb-badge wb-${tone}`}>{children}</span>
}
export function Stat({ label, value, detail, help }: { label: string; value: string; detail: string; help: string }) {
  return <article className="wb-stat"><div>{label}<Help title={label}>{help}</Help></div><strong>{value}</strong><small>{detail}</small></article>
}
