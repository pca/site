import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"

import { PCA_EMAIL, PCA_FACEBOOK_URL, SITE_TITLE } from "../lib/config"
import { FacebookIcon, InstagramIcon, YouTubeIcon } from "./BrandIcons"

export function Layout({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={`min-h-screen flex flex-col justify-between ${className ?? ""}`}>
      <Header />
      <div className="flex-grow flex flex-col justify-between">
        <main className="mb-auto">{children}</main>
        <Footer />
      </div>
    </div>
  )
}

function Header() {
  return (
    <header>
      <div className="mx-auto bg-light">
        <div className="site-header-bar flex items-center justify-between p-4 mx-auto bg-light font-effraMd">
          <div className="flex items-center">
            <div className="mr-3 w-14 h-14 flex items-center justify-center">
              <Link to="/regional-rankings" aria-label="Rankings home">
                <img src="/pca-logo-112.png" alt="PCA Logo" width={56} height={62} />
              </Link>
            </div>
            <p>
              <Link to="/regional-rankings" className="text-subtitle text-dark">
                {SITE_TITLE}
              </Link>
            </p>
          </div>

          <nav className="site-nav" aria-label="Main navigation">
            <Link to="/regional-rankings" activeProps={{ className: "active" }}>
              Rankings
            </Link>
            <Link to="/regional-statistics" activeProps={{ className: "active" }}>
              Regional Statistics
            </Link>
            <Link to="/growth-statistics" activeProps={{ className: "active" }}>
              Growth Statistics
            </Link>
          </nav>
        </div>
      </div>
    </header>
  )
}

function Footer() {
  return (
    <footer className="my-6">
      <div className="flex flex-col gap-3">
        <p className="text-sm leading-5 mx-5">
          See anything wrong? Any incorrect rankings? let us know at <strong>{PCA_EMAIL}</strong>.
        </p>
        <div className="flex justify-between mx-auto px-5 w-full">
          <p className="font-effraMd">
            Made with{" "}
            <span role="img" aria-label="heart">
              ❤️
            </span>{" "}
            by PCA
          </p>
          <div className="flex items-center gap-3 text-text">
            <a href={PCA_FACEBOOK_URL} aria-label="PCA on Facebook" rel="noopener">
              <FacebookIcon />
            </a>
            <span aria-hidden="true">
              <YouTubeIcon />
            </span>
            <span aria-hidden="true">
              <InstagramIcon />
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
