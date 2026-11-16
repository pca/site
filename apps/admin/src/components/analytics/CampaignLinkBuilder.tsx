import { useEffect, useId, useRef, useState } from "react"
import { campaignExample } from "../../lib/acquisition-preview"
import { campaignDraftCsv, campaignIssues, campaignPresets, parseSavedCampaigns, campaignLibraryCsv, type CampaignDraft, type SavedCampaign } from "../../lib/campaign-link"
import { Badge, Panel } from "./WorkbenchUI"

export function CampaignLinkBuilder({ draft, onChange, userId }: { draft: CampaignDraft; onChange: (draft: CampaignDraft) => void; userId:number }) {
  const url = campaignExample(draft), issues = campaignIssues(draft), id = useId(), output = useRef<HTMLTextAreaElement>(null)
  const storageKey=`pca-campaign-links-v1:${userId}`
  const [saved,setSaved]=useState<SavedCampaign[]>(()=>{try{return parseSavedCampaigns(localStorage.getItem(storageKey))}catch{return []}}),[message,setMessage]=useState(""),[undoId,setUndoId]=useState("")
  useEffect(()=>{const refresh=(event:StorageEvent)=>{if(event.key===storageKey)setSaved(parseSavedCampaigns(event.newValue))};window.addEventListener("storage",refresh);return()=>window.removeEventListener("storage",refresh)},[storageKey])
  const persist=(next:SavedCampaign[])=>{try{localStorage.setItem(storageKey,JSON.stringify(next));setSaved(next);return true}catch{setMessage("This browser could not save the link. Your draft is still here; download its CSV instead.");return false}}
  const save=()=>{
    if(!url)return
    let latest:SavedCampaign[]
    try{latest=parseSavedCampaigns(localStorage.getItem(storageKey))}catch{setMessage("Cannot read saved links. No existing history was overwritten; download the draft CSV instead.");return}
    if(latest.some(item=>campaignExample(item.draft)===url)){setSaved(latest);setMessage("This exact link is already saved. No duplicate was added.");return}
    if(latest.length>=50){setSaved(latest);setMessage("The local library is full (50 links). Nothing was replaced. Export it before saving elsewhere.");return}
    const record={id:crypto.randomUUID(),createdAt:new Date().toISOString(),draft:{...draft}}
    if(persist([record,...latest])){setUndoId(record.id);setMessage("Link saved on this browser only. It is not shared or published.")}
  }
  const undo=()=>{try{const latest=parseSavedCampaigns(localStorage.getItem(storageKey));if(persist(latest.filter(item=>item.id!==undoId))){setUndoId("");setMessage("Last save undone. Your draft is unchanged.")}}catch{setMessage("Cannot read saved links. Nothing was changed.")}}
  const update = (field: keyof CampaignDraft, value: string) => onChange({ ...draft, [field]: value })
  const download = () => {
    const csv = campaignDraftCsv(draft)
    if (!csv) return
    const objectURL = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const anchor = document.createElement("a"); anchor.href = objectURL; anchor.download = "pca-campaign-link.csv"; anchor.click(); URL.revokeObjectURL(objectURL)
  }
  return <>
    <Panel title="Campaign link builder" note="Create a tagged external link. No new page or campaign needs to be published by this tool.">
      <div className="wb-status-row"><Badge tone="blue">Works without GA4</Badge><span>Save a finished link below to reuse it later. Unsaved edits are lost after leaving this page.</span></div>
      <div className="wb-campaign-presets" role="group" aria-label="Campaign link examples"><span>Start with an example</span>{campaignPresets.map(preset => <button type="button" key={preset.name} onClick={() => onChange({ ...draft, source: preset.source, medium: preset.medium, content: preset.content })}>{preset.name}</button>)}</div>
      <div className="wb-campaign-fields">
        <section><div className="wb-campaign-step"><b>01</b><h3>Choose the destination</h3></div><label>Landing page<select aria-label="Landing page" value={draft.page} onChange={event => update("page", event.target.value)} aria-invalid={!!issues.page} aria-describedby={`${id}-page`}><option value="/regional-rankings">Regional Rankings</option><option value="/regional-statistics">Regional Statistics</option></select><small id={`${id}-page`}>The existing page visitors should arrive on.</small></label></section>
        <section><div className="wb-campaign-step"><b>02</b><h3>Describe the external link</h3></div><div className="wb-form-grid"><label>Source<input aria-label="Source" value={draft.source} onChange={event => update("source", event.target.value)} aria-invalid={!!issues.source} aria-describedby={`${id}-source`}/><small id={`${id}-source`} className={issues.source ? "is-invalid" : ""}>{issues.source ?? "Where you place it, e.g. facebook or pca_newsletter."}</small></label><label>Medium<select aria-label="Medium" value={draft.medium} onChange={event => update("medium", event.target.value)} aria-describedby={`${id}-medium`}>{[["email", "Email"], ["social", "Social"], ["cpc", "Paid search / CPC"], ["referral", "Referral"]].map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><small id={`${id}-medium`}>The channel type, not the campaign name.</small></label><label>Campaign name<input aria-label="Campaign name" value={draft.campaign} onChange={event => update("campaign", event.target.value)} aria-invalid={!!issues.campaign} aria-describedby={`${id}-campaign`}/><small id={`${id}-campaign`} className={issues.campaign ? "is-invalid" : ""}>{issues.campaign ?? "Use the same name across links for one promotion."}</small></label><label>Link variation · optional<input aria-label="Link variation · optional" value={draft.content} onChange={event => update("content", event.target.value)} aria-invalid={!!issues.content} aria-describedby={`${id}-content`}/><small id={`${id}-content`} className={issues.content ? "is-invalid" : ""}>{issues.content ?? "Distinguish placements, e.g. header-link or footer-link."}</small></label></div></section>
      </div>
      <div className="wb-campaign-output"><div className="wb-campaign-step"><b>03</b><h3>Review and use the link</h3></div>{url ? <><label>Generated URL · not opened or published<textarea ref={output} readOnly rows={3} value={url} onFocus={event => event.currentTarget.select()}/></label><div className="wb-campaign-actions"><button type="button" onClick={() => { output.current?.focus(); output.current?.select() }}>Select link to copy</button><button type="button" onClick={download}>Download link CSV</button><button type="button" onClick={save}>Save link on this browser</button><span>Use your normal Copy shortcut after selecting.</span></div></> : <p className="wb-warning" role="status">Fix the highlighted fields to generate a valid link. No incomplete link is exported.</p>}{message&&<p className="wb-footnote" role="status">{message} {undoId&&saved.some(item=>item.id===undoId)&&<button type="button" onClick={undo}>Undo last save</button>}</p>}</div>
    </Panel>
    <Panel title="Saved campaign links" note="Up to 50 links for this staff account on this browser. Export a backup; links are not shared or synced." action={<button type="button" disabled={!saved.length} onClick={()=>{const objectURL=URL.createObjectURL(new Blob([campaignLibraryCsv(saved)],{type:"text/csv;charset=utf-8"})),link=document.createElement("a");link.href=objectURL;link.download="pca-saved-campaign-links.csv";link.click();URL.revokeObjectURL(objectURL)}}>Export saved links</button>}>
      {saved.length?<div className="wb-scroll"><table><caption>These are saved link definitions, not campaign performance results.</caption><thead><tr><th>Campaign</th><th>Source / medium</th><th>Placement</th><th>Saved</th><th>Action</th></tr></thead><tbody>{saved.map(item=><tr key={item.id}><th scope="row">{item.draft.campaign}</th><td>{item.draft.source} / {item.draft.medium}</td><td>{item.draft.content||"Not set"}</td><td>{new Date(item.createdAt).toLocaleDateString()}</td><td><button type="button" onClick={()=>{onChange({...item.draft});setMessage(`Loaded ${item.draft.campaign} into the builder.`)}} aria-label={`Load ${item.draft.campaign} from ${item.draft.source}`}>Load into builder</button></td></tr>)}</tbody></table></div>:<p className="wb-body">No saved links yet. Save a validated link from the builder above.</p>}
    </Panel>
    <Panel title="Where the link appears in reporting" note="Attribution must still be verified in your connected GA4 property.">
      <ol className="wb-campaign-map"><li><span>External placement</span><strong>{draft.source || "Source"} / {draft.medium}</strong></li><li><span>Existing destination</span><strong>{draft.page}</strong></li><li><span>Acquisition report</span><strong>Source / medium + campaign</strong></li></ol>
      <p className="wb-body">This identifies traffic from links you control. It does not prove that a campaign caused a visit, task completion or revenue. Link variations are labels, not randomized A/B tests.</p>
      <details><summary>Naming and privacy rules</summary><p>Keep names consistent and lowercase. Use these tags on external links, not internal site navigation. Never put names, email addresses, account IDs or other personal information in tags. Only the supported destinations and bounded tag formats are accepted by this builder and the site's collection code.</p></details>
    </Panel>
  </>
}
