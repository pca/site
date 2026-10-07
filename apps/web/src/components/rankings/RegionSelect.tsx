import { REGIONS } from "@pca/shared"
import { useId, type ChangeEvent } from "react"

interface RegionSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  /** Adds a "Philippines" option with value "PH" for national rankings. */
  includeNational?: boolean
  className?: string
}

export function RegionSelect({ label, value, onChange, includeNational = false, className = "" }: RegionSelectProps) {
  const id = useId()
  return (
    <div className={`max-w-xs ${className}`}>
      <label htmlFor={id} className="text-sm block mb-1">
        {label}
      </label>
      <div className="relative">
        <select
          id={id}
          className="block w-full rounded-md px-3 py-2 pr-8 text-sm border border-gray-300 bg-white appearance-none cursor-pointer transition duration-150 ease-in-out"
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        >
          {includeNational && <option value="PH">Philippines</option>}
          {REGIONS.map(region => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </select>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2">
          <svg className="h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </div>
  )
}
