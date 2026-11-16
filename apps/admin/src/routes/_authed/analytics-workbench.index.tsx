import { createFileRoute, redirect } from "@tanstack/react-router"
import { workbenchSearch } from "../../lib/analytics-navigation"
export const Route=createFileRoute("/_authed/analytics-workbench/")({validateSearch:workbenchSearch,beforeLoad:({search})=>{throw redirect({to:"/analytics-workbench/$section",params:{section:"pages"},search})}})
