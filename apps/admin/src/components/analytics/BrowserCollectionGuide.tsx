import { AnalyticsSectionIcon } from "./AnalyticsSectionIcon"
import { MeasurementStatus } from "./MeasurementStatus"
import type { WorkbenchSection } from "../../lib/analytics-workbench"

const signals: {id:string; title:string; icon:WorkbenchSection; meaning:string; identifiers:string[]; check:string; limit:string}[] = [
  {id:"pages",title:"Page visits",icon:"pages",meaning:"Which destination someone opened—not every filter they changed.",identifiers:["page_view"],check:"Open a measured page. Confirm one page-view event, then change a filter and confirm it does not add another page view.",limit:"Page visits do not tell us which event or region the visitor viewed inside the page."},
  {id:"content",title:"Event & region views",icon:"pages",meaning:"Which event, selected region and results view actually appeared.",identifiers:["content_view"],check:"Open a direct link, then change the event or region. Confirm each newly rendered selection has the correct content values.",limit:"Includes the initial selection. Region means the selected rankings region, not the visitor's location. A view is not proof of task success."},
  {id:"campaigns",title:"Campaign attribution",icon:"acquisition",meaning:"Which tagged external link brought the visit to the website.",identifiers:["utm_source","utm_medium","utm_campaign","utm_content"],check:"Enter from a valid tagged campaign link. Check the collected values, then verify the processed source / medium and campaign in GA4.",limit:"Only supported campaign values are accepted. Processed attribution may take time; a generated link alone does not prove attribution works."},
  {id:"features",title:"Feature visibility & use",icon:"features",meaning:"Keep a feature being seen separate from someone using it.",identifiers:["feature_exposed","feature_used"],check:"Bring a measured feature into view, then use it. Confirm exposure and action are separate and are not duplicated by re-renders.",limit:"Reports currently show aggregate signals—not a fully joined visitor conversion rate, or evidence that someone understood the feature."},
  {id:"outcomes",title:"Login & region requests",icon:"journeys",meaning:"Whether the defined login and region-request steps reached their recorded outcomes.",identifiers:["wca_login_started","wca_login_completed","region_request_submitted"],check:"Follow the login and region-request flow using a test account. Confirm events match the actual steps and outcomes without sending credentials.",limit:"Only defined outcome signals and fixed funnels are supported. Intervening actions may occur; the funnel does not explain why someone stopped."},
]

export function BrowserCollectionGuide() {
  return <div className="wb-collection-digest">
    <div className="wb-collection-summary">
      <MeasurementStatus tone="success">Local implementation in place</MeasurementStatus>
      <MeasurementStatus tone="warning">Live verification still needed</MeasurementStatus>
      <p>These are implementation notes—not a live health check. A working report connection does not prove that browser events arrive correctly.</p>
    </div>
    <ul className="wb-collection-list" aria-label="Browser collection checks">
      {signals.map(signal=><li key={signal.id}>
        <span className="wb-collection-icon"><AnalyticsSectionIcon section={signal.icon}/></span>
        <div className="wb-collection-body">
          <h3>{signal.title}</h3>
          <p>{signal.meaning}</p>
          <div className="wb-collection-identifiers" aria-label="Technical identifiers">{signal.identifiers.map(id=><code key={id}>{id}</code>)}</div>
          <dl className="wb-collection-facts">
            <div><dt>Verify</dt><dd>{signal.check}</dd></div>
            <div><dt>Scope & limits</dt><dd>{signal.limit}</dd></div>
          </dl>
        </div>
      </li>)}
    </ul>
  </div>
}
