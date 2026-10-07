import { Layout } from "./Layout"

export function NotFound() {
  return (
    <Layout>
      <div className="max-w-1340 mx-auto px-4 py-10">
        <h1 className="text-4xl font-bold mb-6">404: Not Found</h1>
        <p>You just hit a route that doesn&#39;t exist... the sadness.</p>
      </div>
    </Layout>
  )
}
