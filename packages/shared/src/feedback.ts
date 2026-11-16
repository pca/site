export const feedbackTypes={data_issue:"Data issue",ux_feedback:"UX feedback",suggestion:"Suggestion"} as const
export const feedbackStates={new:"New",reviewing:"Reviewing",resolved:"Resolved",dismissed:"Dismissed"} as const
export type FeedbackType=keyof typeof feedbackTypes
export type FeedbackState=keyof typeof feedbackStates
export interface FeedbackContext{page:"rankings"|"statistics";event:string;region:string;format:string;view:string;snapshot:string}
export interface FeedbackDraft{key:string;type:FeedbackType;title:string;task:string;observed:string;expected:string;context:FeedbackContext;reviewed:boolean}
export interface FeedbackRecord{ id:string;userId:number;originalType:FeedbackType;type:FeedbackType;status:FeedbackState;title:string;task:string;observed:string;expected:string;context:FeedbackContext;note:string;revision:number;createdAt:string;updatedAt:string }
export interface FeedbackReview{type:FeedbackType;status:FeedbackState;note:string;revision:number;reviewerId:number;createdAt:string}
/** Canonical public-view description for a local SHA-256 fingerprint, not an archived database snapshot. */
export function feedbackSnapshotText(context:FeedbackContext,rows:readonly {wca_id:string;region:string|null;value:string;competition:{id:string};event:{id:string};solves:Record<string,string|null|undefined>|null}[]){
 return JSON.stringify({version:1,page:context.page,event:context.event,region:context.region,format:context.format,rows:rows.map(row=>({wca_id:row.wca_id,region:row.region,value:row.value,competition:row.competition.id,event:row.event.id,solves:row.solves?Object.fromEntries(Object.entries(row.solves).sort(([a],[b])=>a.localeCompare(b))):null}))})
}
export function validFeedbackRecord(value:unknown):value is FeedbackRecord{
 const r=value as FeedbackRecord
 return !!r&&/^[a-f0-9]{32}$/.test(r.id)&&Number.isSafeInteger(r.userId)&&r.userId>0&&Object.hasOwn(feedbackTypes,r.type)&&Object.hasOwn(feedbackTypes,r.originalType)&&Object.hasOwn(feedbackStates,r.status)&&Number.isSafeInteger(r.revision)&&r.revision>0&&[r.title,r.task,r.observed,r.expected,r.note].every(v=>typeof v==="string"&&v.length<=8000)&&!!r.context&&["rankings","statistics"].includes(r.context.page)&&[r.context.event,r.context.region,r.context.format,r.context.view,r.context.snapshot].every(v=>typeof v==="string"&&v.length<=120)&&[r.createdAt,r.updatedAt].every(v=>typeof v==="string"&&Number.isFinite(Date.parse(v)))
}
