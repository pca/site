import { createFileRoute } from "@tanstack/react-router"
import { ExamplesHome } from "../../components/ux/UxExamples"

export const Route = createFileRoute("/_authed/ux-examples/")({ component: ExamplesHome })
