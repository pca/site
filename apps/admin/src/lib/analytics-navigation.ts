// Small shared navigation contract: no sample dataset in the admin shell bundle.
export type WorkbenchSection = "overview"|"pages"|"acquisition"|"features"|"journeys"|"retention"|"feedback"|"releases"|"experiments"|"measurement"
interface SectionMetadata {id:WorkbenchSection;label:string;group:"Start"|"Report"|"Investigate"|"Improve"|"Setup";stage:"Guide"|"Core"|"Design only";question:string;outcome:string}
export const workbenchSections:readonly SectionMetadata[] = [
  { id:"overview", label:"Overview", group:"Start", stage:"Guide", question:"Choose a question and check the evidence.", outcome:"A question, a metric and a next action" },
  { id:"pages", label:"Pages & audience", group:"Report", stage:"Core", question:"What is being viewed, and on which devices?", outcome:"Prioritize content and device support" },
  { id:"acquisition", label:"Acquisition", group:"Report", stage:"Core", question:"Which sources bring engaged visits?", outcome:"Evaluate traffic sources and campaign performance" },
  { id:"features", label:"Feature discovery", group:"Investigate", stage:"Core", question:"Which features have recorded exposure and interaction?", outcome:"Inspect exposure and use without inventing a conversion rate" },
  { id:"journeys", label:"Journeys", group:"Investigate", stage:"Core", question:"Where do recognized users continue or stop?", outcome:"Inspect fixed ordered funnels without assuming why" },
  { id:"retention", label:"Retention", group:"Investigate", stage:"Core", question:"Do recognized browsers return in later weeks?", outcome:"Follow starting groups with explicit recognition limits" },
  { id:"feedback", label:"Feedback & issues", group:"Improve", stage:"Core", question:"What are signed-in visitors reporting in context?", outcome:"Review account-submitted issues and suggestions" },
  { id:"releases", label:"Release impact", group:"Improve", stage:"Core", question:"What changed around a website update?", outcome:"Compare complete windows without claiming causal lift" },
  { id:"experiments", label:"Experiments", group:"Improve", stage:"Core", question:"Plan a fair test before delivering variants.", outcome:"Save a test plan and inspect aggregate results; no delivery" },
  { id:"measurement", label:"Measurement", group:"Setup", stage:"Core", question:"Can we trust the collection and reporting?", outcome:"Verify source, scope and collection" },
]
export type WorkbenchDevice = "all"|"mobile"|"desktop"|"tablet"
export interface WorkbenchSearch { mode:"sample"|"ga4"; days:7|28; device:WorkbenchDevice; view?:"audience"|"content"|"campaign"|"feedback_saved"|"plans_saved" }

export function workbenchSearch(raw:Record<string, unknown>):WorkbenchSearch {
  return { mode:raw.mode === "ga4" ? "ga4":"sample", days:Number(raw.days) === 7 ? 7:28, device:raw.device === "mobile" || raw.device === "desktop" || raw.device === "tablet" ? raw.device:"all", ...(["audience","content","campaign","feedback_saved","plans_saved"].includes(String(raw.view))?{view:raw.view as WorkbenchSearch["view"]}:{}) }
}
