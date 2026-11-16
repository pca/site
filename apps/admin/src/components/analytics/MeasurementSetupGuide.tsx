import { AnalyticsSectionIcon } from "./AnalyticsSectionIcon"

/** Guidance only: these steps do not create credentials or change tracking. */
export function MeasurementSetupGuide() {
  return <div className="wb-setup-guide">
    <div className="wb-connection-map" aria-label="Two separate analytics connections">
      <div><AnalyticsSectionIcon section="features"/><div><strong>Website → Google Analytics</strong><p>Collection sends measured visitor actions to GA4. Check this in section 3.</p></div></div>
      <div><AnalyticsSectionIcon section="pages"/><div><strong>Google Analytics → this dashboard</strong><p>Reporting reads the data already in GA4. Connect this below, then test access.</p></div></div>
    </div>
    <h3>What is needed to connect reporting</h3>
    <ol className="wb-setup-steps">
      <li><span className="wb-setup-step" aria-hidden="true">A</span><div><h4>Choose the main website’s property</h4><p>In <strong>Google Analytics</strong>, open <strong>Admin → Property details</strong> and copy the numeric <strong>Property ID</strong>.</p><p className="wb-setup-caution">Not the numeric Stream ID, and not the public <code>G-…</code> measurement code. Check that this is the main website’s property, not Arena.</p></div></li>
      <li><span className="wb-setup-step" aria-hidden="true">B</span><div><h4>Give the reporting account read access</h4><p>In <strong>Google Cloud</strong>, enable the Google Analytics Data API and create a service account. In <strong>Google Analytics → Admin → Property access management</strong>, add its email as a <strong>Viewer</strong>.</p><p className="wb-setup-caution">Managing property users requires Administrator access. If that option is missing, use an authorized administrator login or ask the property’s administrator to add the account. Cloud IAM permissions are separate.</p></div></li>
      <li><span className="wb-setup-step" aria-hidden="true">C</span><div><h4>Configure our API server</h4><p>Set <code>GA4_PROPERTY_ID</code> and <code>GA4_SERVICE_ACCOUNT_FILE</code> on the server, then restart the API. The second value points to a protected credentials file outside the repository.</p><p className="wb-setup-caution">Keep private keys out of chat, browser variables and Git. Then use <strong>Test report access</strong> below; saved configuration alone is not a successful Google connection.</p></div></li>
    </ol>
    <p className="wb-footnote">Instructions only. This page does not create credentials, grant permissions or turn collection on.</p>
  </div>
}
