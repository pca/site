import { faFacebook, faInstagram, faYoutube } from "@fortawesome/free-brands-svg-icons"

type IconDefinition = typeof faFacebook

function BrandIcon({ icon }: { icon: IconDefinition }) {
  const [width, height, , , path] = icon.icon
  return (
    <svg viewBox={`0 0 ${width} ${height}`} height="1.25em" fill="currentColor" aria-hidden="true" focusable="false">
      <path d={Array.isArray(path) ? path.join(" ") : path} />
    </svg>
  )
}

export const FacebookIcon = () => <BrandIcon icon={faFacebook} />
export const YouTubeIcon = () => <BrandIcon icon={faYoutube} />
export const InstagramIcon = () => <BrandIcon icon={faInstagram} />
