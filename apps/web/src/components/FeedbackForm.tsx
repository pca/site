import {fetchJson,feedbackTypes,feedbackSnapshotText,type RankingRow,type FeedbackContext,type FeedbackDraft} from "@pca/shared"
import {useEffect,useRef,useState} from "react"
import {createPortal} from "react-dom"
import {apiUrl,SITE_URL,WCA_CLIENT_ID,WCA_URL} from "../lib/config"
import {FEEDBACK_ANCHOR,FEEDBACK_GROUP,FEEDBACK_OPEN_EVENT,FEEDBACK_SLOT,rememberFeedbackLogin,wcaAuthorizeUrl} from "../lib/feedback-login"
import "../feedback.css"

/** Intentional account-submitted reports, never sent as analytics events. */
export function FeedbackForm({context,rankingRows}:{context:FeedbackContext;rankingRows?:readonly RankingRow[]}){
 const [draft,setDraft]=useState<FeedbackDraft|null>(null),[step,setStep]=useState<"write"|"review"|"sent">("write"),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[receipt,setReceipt]=useState("")
 const [origin,setOrigin]=useState(SITE_URL)
 const [footerTarget,setFooterTarget]=useState<HTMLElement|null>(null)
 const resumed=useRef(false)
 const closeButton=useRef<HTMLButtonElement>(null)
 const isOpen=!!draft
 const scrollToFeedback=()=>document.getElementById(FEEDBACK_GROUP)?.scrollIntoView({block:"nearest"})
 const close=()=>{setDraft(null);document.querySelector<HTMLAnchorElement>(`footer a[href="#${FEEDBACK_ANCHOR}"]`)?.focus({preventScroll:true})}
 const open=async()=>{let stored="";try{stored=localStorage.getItem("localPcaApiKey")??""}catch{};const attached={...context};if(rankingRows){try{const bytes=new TextEncoder().encode(feedbackSnapshotText(attached,rankingRows));const digest=await crypto.subtle.digest("SHA-256",bytes);attached.snapshot="sha256:"+Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("")}catch{attached.snapshot=""}};setToken(stored);setStep("write");setError("");setDraft({key:crypto.randomUUID(),type:"data_issue",title:"",task:"",observed:"",expected:"",context:attached,reviewed:false})}
 useEffect(()=>setOrigin(window.location.origin),[])
 useEffect(()=>setFooterTarget(document.getElementById(FEEDBACK_SLOT)),[])
 useEffect(()=>{const reveal=(event?:Event)=>{if(event?.type!==FEEDBACK_OPEN_EVENT&&window.location.hash!==`#${FEEDBACK_ANCHOR}`)return;if(draft){scrollToFeedback();if(window.location.hash===`#${FEEDBACK_ANCHOR}`)window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search)}else if(!resumed.current){resumed.current=true;void open().finally(()=>{resumed.current=false})}};reveal();window.addEventListener("hashchange",reveal);window.addEventListener(FEEDBACK_OPEN_EVENT,reveal);return()=>{window.removeEventListener("hashchange",reveal);window.removeEventListener(FEEDBACK_OPEN_EVENT,reveal)}},[context,rankingRows,draft])
 useEffect(()=>{if(draft&&footerTarget&&window.location.hash===`#${FEEDBACK_ANCHOR}`){scrollToFeedback();window.history.replaceState(window.history.state,"",window.location.pathname+window.location.search)}},[draft,footerTarget])
 useEffect(()=>{if(isOpen&&footerTarget){closeButton.current?.focus({preventScroll:true});scrollToFeedback()}},[isOpen,footerTarget])
 const send=async()=>{if(!draft||!draft.reviewed||busy)return;setBusy(true);setError("");try{const result=await fetchJson<{id:string;status:string}>(apiUrl("user/feedback/"),{method:"POST",headers:{Authorization:`Token ${token}`},json:draft});if(!/^[a-f0-9]{32}$/.test(result.id))throw Error("The server did not return a valid receipt. Keep your text and retry.");setReceipt(result.id);setStep("sent")}catch(e){setError(e instanceof Error?e.message:"The report could not be sent. Your draft is still here.")}finally{setBusy(false)}}
 if(!footerTarget)return null
 return createPortal(<section id={FEEDBACK_ANCHOR} className="pca-feedback" aria-label="Report a website issue" hidden={!draft}>
 {draft&&<div className="pca-feedback-card"><header><h2>{step==="sent"?"Report received":step==="review"?"Review your report":"Report a website issue"}</h2><button ref={closeButton} type="button" onClick={close} disabled={busy}>{step==="sent"?"Done":"Cancel"}</button></header>
 {!token?<div className="pca-feedback-login"><p>Sign in with WCA to report a problem or suggest an improvement.</p><a className="pca-feedback-login-button" href={wcaAuthorizeUrl(origin,WCA_URL,WCA_CLIENT_ID)} rel="nofollow" onClick={event=>{try{rememberFeedbackLogin(window.sessionStorage,window.location.href,window.location.origin)}catch{event.preventDefault();setError("Allow session storage in this browser to sign in and return to this form.")}}}><img alt="" src="/images/wca-logo.svg" width="20" height="20"/>Login with WCA</a>{error&&<p role="alert">{error}</p>}</div>:step==="sent"?<div role="status"><p>Your report is saved for staff review. Submitting does not confirm an error or guarantee a requested change.</p><p>Receipt: <code>{receipt}</code></p></div>:<>
 <p className="pca-feedback-context">Attached context: <code>{draft.context.page}</code>{draft.context.event&&<> · <code>{draft.context.event}</code></>}{draft.context.region&&<> · <code>{draft.context.region}</code></>}{draft.context.format&&<> · <code>{draft.context.format}</code></>}{draft.context.view&&<> · <code>{draft.context.view}</code></>}{draft.context.snapshot&&<> · snapshot <code>{draft.context.snapshot}</code></>}</p>
 <p>Describe one specific problem or underlying need. Your account and the context above are attached for staff review. Do not include passwords, tokens, private contact details or other sensitive information. Up to 3 reports per 24 hours.</p>{draft.context.snapshot.startsWith("sha256:")&&<small>The snapshot fingerprint identifies the displayed ranking results at form opening. It does not upload the rows or archive the database.</small>}
 {step==="write"?<form onSubmit={e=>{e.preventDefault();setStep("review");setError("")}}>
 <label>Report type<select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value as FeedbackDraft["type"]})}>{Object.entries(feedbackTypes).map(([v,label])=><option key={v} value={v}>{label}</option>)}</select></label>
 <label>Short title<input required minLength={5} maxLength={120} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label>
 <label>What were you trying to do?<textarea required minLength={10} maxLength={600} value={draft.task} onChange={e=>setDraft({...draft,task:e.target.value})}/></label>
 <label>What happened, or what is difficult?<textarea required minLength={10} maxLength={2000} value={draft.observed} onChange={e=>setDraft({...draft,observed:e.target.value})}/></label>
 <label>What did you expect, or what need should be met?<textarea required minLength={10} maxLength={1200} value={draft.expected} onChange={e=>setDraft({...draft,expected:e.target.value})}/></label><button type="submit">Review before sending →</button></form>:<>
 <dl><dt>Type</dt><dd>{feedbackTypes[draft.type]} · your selection, not an automatic diagnosis</dd><dt>Title</dt><dd>{draft.title}</dd><dt>Task</dt><dd>{draft.task}</dd><dt>Observed</dt><dd>{draft.observed}</dd><dt>Expected / need</dt><dd>{draft.expected}</dd></dl>
 <label className="pca-feedback-check"><input type="checkbox" checked={draft.reviewed} onChange={e=>setDraft({...draft,reviewed:e.target.checked})}/>I reviewed the details and attached context, and removed sensitive information.</label>
 <div className="pca-feedback-actions"><button type="button" disabled={busy} onClick={()=>{setStep("write");setDraft({...draft,reviewed:false})}}>Edit report</button><button type="button" disabled={!draft.reviewed||busy} onClick={()=>{void send()}}>{busy?"Sending…":"Send report to PCA staff"}</button></div></>}
 {error&&<p role="alert">{error} Your draft has not been cleared.</p>}
 <small>Draft text stays in this open page until sent. Nothing is uploaded before you choose Send. This form does not send your message to Google Analytics.</small></>}
 </div>}
 </section>,footerTarget)
}
