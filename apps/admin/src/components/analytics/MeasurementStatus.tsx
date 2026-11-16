import type { ReactNode } from "react"

export function MeasurementStatus({tone,children}:{tone:"success"|"warning"|"error"|"neutral";children:ReactNode}) {
  return <span className={`wb-measurement-status is-${tone}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {tone==="success"?<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>:tone==="warning"?<><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3v.1"/></>:tone==="error"?<><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></>:<><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/></>}
    </svg>
    {children}
  </span>
}
