import { createFileRoute } from "@tanstack/react-router"
import { Experiments } from "../../components/ux/Experiments"

export const Route = createFileRoute("/_authed/experiments")({ component: Experiments })
