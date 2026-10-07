import { findRegion, type RankingRow } from "@pca/shared"

import { LoadingSpinner } from "../LoadingSpinner"

const ZONE_TAG_CLASS = { luzon: "bg-yellow", visayas: "bg-blue", mindanao: "bg-red" } as const

function RegionTag({ region }: { region: string | null }) {
  const found = findRegion(region)
  const label = found?.tag ?? "?"
  return (
    <span
      className={`inline-flex min-w-[2rem] items-center justify-center rounded px-1.5 py-0.5 text-xs font-bold text-white ${found ? ZONE_TAG_CLASS[found.zone] : "bg-gray-dark"}`}
      title={region ? `Region ${label}` : "Unknown region"}
    >
      {label}
    </span>
  )
}

const SOLVE_KEYS = ["value1", "value2", "value3", "value4", "value5"] as const

const solvesOf = (solves: RankingRow["solves"]) =>
  SOLVE_KEYS.map(key => solves?.[key]).filter((value): value is string => value !== null && value !== undefined && value !== "")

interface RankingListProps {
  isLoading: boolean
  rankings?: RankingRow[]
  hasAttemptedLoad: boolean
  showSolves: boolean
}

export function RankingList({ isLoading, rankings, hasAttemptedLoad, showSolves }: RankingListProps) {
  return (
    <div className="rankings-container px-3 md:px-0">
      <div className="w-full">
        <table className="rankings-list font-rubik text-sm w-full" aria-label="Rankings List">
          <caption className="sr-only">Cubing Rankings</caption>
          <thead className="font-bold text-left">
            <tr>
              <th scope="col" className="pos px-3 py-1">
                #
              </th>
              <th scope="col" className="region px-1 py-1 text-center">
                Region
              </th>
              <th scope="col" className="name px-3 py-1">
                Name
              </th>
              <th scope="col" className="result px-3 py-1">
                Result
              </th>
              {showSolves && (
                <th scope="col" className="solves px-3 py-1">
                  Solves
                </th>
              )}
              <th scope="col" className="competition px-3 py-1">
                Competition
              </th>
              <th scope="col" aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={showSolves ? 7 : 6} className="text-center py-8">
                  <div className="flex items-center justify-center">
                    <LoadingSpinner />
                    <span className="ml-2">Loading results...</span>
                  </div>
                </td>
              </tr>
            ) : (
              <>
                {rankings?.map((cuber, i) => (
                  <tr key={cuber.wca_id}>
                    <td className="pos px-3 py-1 text-gray-600">{i + 1}</td>
                    <td className="region px-1 py-1 text-center">
                      <RegionTag region={cuber.region} />
                    </td>
                    <td className="name px-3 py-1 text-gray-600">{cuber.person_name}</td>
                    <td className="result px-3 py-1 font-black text-gray-600">{cuber.value}</td>
                    {showSolves && (
                      <td className="solves px-3 py-1 text-gray-600">
                        <span className="inline-flex gap-4">
                          {solvesOf(cuber.solves).map((solve, index) => (
                            <span key={index}>{solve}</span>
                          ))}
                        </span>
                      </td>
                    )}
                    <td className="competition px-3 py-1 text-gray-600">{cuber.competition.name}</td>
                    <td />
                  </tr>
                ))}
                {hasAttemptedLoad && !rankings?.length && (
                  <tr>
                    <td />
                    <td />
                    <td className="pos px-3 py-1">No results yet for this category.</td>
                    <td />
                    {showSolves && <td />}
                    <td />
                    <td />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
