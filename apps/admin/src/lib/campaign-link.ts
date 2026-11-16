import { campaignExample } from "./acquisition-preview.ts"

export interface CampaignDraft { page: string; source: string; medium: string; campaign: string; content: string }
export const defaultCampaignDraft: CampaignDraft = { page: "/regional-rankings", source: "pca_newsletter", medium: "email", campaign: "regional-rankings-launch", content: "header-link" }
export const campaignPresets = [
  { name: "Email newsletter", source: "pca_newsletter", medium: "email", content: "header-link" },
  { name: "Facebook post", source: "facebook", medium: "social", content: "feed-post" },
  { name: "Google search ad", source: "google", medium: "cpc", content: "text-ad" },
] as const
const slug = /^[a-z0-9][a-z0-9_-]{0,63}$/
export function campaignIssues(draft: CampaignDraft): Partial<Record<keyof CampaignDraft, string>> {
  const issues: Partial<Record<keyof CampaignDraft, string>> = {}
  if (!["/regional-rankings", "/regional-statistics"].includes(draft.page)) issues.page = "Choose one of the supported landing pages."
  if (!["email", "social", "cpc", "referral"].includes(draft.medium)) issues.medium = "Choose a supported medium."
  for (const field of ["source", "campaign", "content"] as const) {
    if (field === "content" && !draft[field]) continue
    if (!draft[field]) issues[field] = `${field === "source" ? "Source" : "Campaign name"} is required.`
    else if (!slug.test(draft[field])) issues[field] = "Use 1–64 lowercase letters, numbers, hyphens or underscores; start with a letter or number."
  }
  return issues
}
export function campaignDraftCsv(draft: CampaignDraft) {
  const url = campaignExample(draft)
  if (!url) return null
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
  return [
    ["LOCAL CAMPAIGN LINK — not a published campaign or verified attribution"],
    ["landing_page", "utm_source", "utm_medium", "utm_campaign", "utm_content", "url"],
    [draft.page, draft.source, draft.medium, draft.campaign, draft.content, url],
  ].map(row => row.map(quote).join(",")).join("\n")
}

export interface SavedCampaign {id:string;createdAt:string;draft:CampaignDraft}
export function parseSavedCampaigns(raw:string|null):SavedCampaign[] {
  try {
    if(!raw||raw.length>128_000)return []
    const values:unknown=JSON.parse(raw)
    if(!Array.isArray(values))return []
    const records:SavedCampaign[]=[],urls=new Set<string>(),ids=new Set<string>()
    for(const item of values){
      if(!item||typeof item!=="object"||typeof item.id!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)||typeof item.createdAt!=="string"||!Number.isFinite(Date.parse(item.createdAt))||!item.draft||typeof item.draft!=="object")continue
      if(!["page","source","medium","campaign","content"].every(key=>typeof item.draft[key]==="string"))continue
      const draft:CampaignDraft={page:item.draft.page,source:item.draft.source,medium:item.draft.medium,campaign:item.draft.campaign,content:item.draft.content},url=campaignExample(draft)
      if(!url||urls.has(url)||ids.has(item.id))continue
      urls.add(url);ids.add(item.id);records.push({id:item.id,createdAt:new Date(item.createdAt).toISOString(),draft})
      if(records.length===50)break
    }
    return records
  }catch{return []}
}
export function campaignLibraryCsv(records:SavedCampaign[]) {
  const valid=parseSavedCampaigns(JSON.stringify(records)),quote=(value:string)=>`"${value.replaceAll('"','""')}"`
  return [["Saved campaign links — browser-local, not published campaigns"],["saved_at","landing_page","utm_source","utm_medium","utm_campaign","utm_content","url"],...valid.map(item=>[item.createdAt,item.draft.page,item.draft.source,item.draft.medium,item.draft.campaign,item.draft.content,campaignExample(item.draft)!])].map(row=>row.map(quote).join(",")).join("\n")
}
