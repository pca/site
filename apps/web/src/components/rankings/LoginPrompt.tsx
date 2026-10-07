import { fetchJson, type PublicUser, type RegionUpdateRequest } from "@pca/shared"
import { useMutation, useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { apiUrl, PCA_EMAIL, SITE_URL, WCA_CLIENT_ID, WCA_URL } from "../../lib/config"
import { LoadingSpinner } from "../LoadingSpinner"
import { RegionSelect } from "./RegionSelect"

const TOKEN_KEY = "localPcaApiKey"

const authHeaders = (token: string) => ({ Authorization: `Token ${token}` })

interface LoginPromptProps {
  hidden: boolean
  setHidden: (hidden: boolean) => void
  /** WCA OAuth code from the callback URL. */
  code?: string
}

/** useStoredToken holds the API key kept in localStorage. */
function useStoredToken() {
  const [token, setTokenState] = useState<string | null>(null)
  useEffect(() => setTokenState(localStorage.getItem(TOKEN_KEY)), [])
  const setToken = (value: string | null) => {
    if (value) localStorage.setItem(TOKEN_KEY, value)
    else localStorage.removeItem(TOKEN_KEY)
    setTokenState(value)
  }
  return [token, setToken] as const
}

export function LoginPrompt({ hidden, setHidden, code }: LoginPromptProps) {
  const [token, setToken] = useStoredToken()
  const [origin, setOrigin] = useState(SITE_URL)
  const navigate = useNavigate()
  const exchanged = useRef(false)

  useEffect(() => setOrigin(window.location.origin), [])

  // Exchange the WCA code for a PCA API key once, then drop it from the URL.
  useEffect(() => {
    if (!code || exchanged.current) return
    exchanged.current = true
    const clearCode = () =>
      navigate({ to: "/regional-rankings", search: prev => ({ ...prev, code: undefined }), replace: true, resetScroll: false })
    if (localStorage.getItem(TOKEN_KEY)) {
      clearCode()
      return
    }
    fetchJson<{ key: string }>(apiUrl("auth/login/wca/"), { method: "POST", json: { code } })
      .then(res => setToken(res.key))
      .catch(error => console.error("WCA login failed:", error))
      .finally(clearCode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code])

  const user = useQuery({
    queryKey: ["user", token],
    queryFn: () => fetchJson<PublicUser>(apiUrl("user/"), { headers: authHeaders(token!) }),
    enabled: !!token,
    staleTime: 0,
  })
  const requests = useQuery({
    queryKey: ["user-requests", token],
    queryFn: () => fetchJson<RegionUpdateRequest[]>(apiUrl("user/region-update-requests/"), { headers: authHeaders(token!) }),
    enabled: !!token,
    staleTime: 0,
  })

  const [userRegion, setUserRegion] = useState("NCR")
  const submit = useMutation({
    mutationFn: () =>
      fetchJson(apiUrl("user/region-update-requests/"), {
        method: "POST",
        headers: authHeaders(token!),
        json: { region: userRegion },
      }),
  })

  // Users who already have a region start with the prompt collapsed.
  const userData = user.data
  useEffect(() => {
    if (userData) setHidden(userData.region != null)
  }, [userData, setHidden])

  const logOut = () => {
    setToken(null)
    submit.reset()
  }

  const container = (children: ReactNode) => (
    <LoginPromptContainer hidden={hidden} setHidden={setHidden}>
      {children}
    </LoginPromptContainer>
  )

  if (submit.isSuccess) {
    return container(
      <>
        <h3 className="text-lg leading-6 font-medium">You've submitted your region</h3>
        <p className="mt-1 text-sm leading-5">
          Thanks for submitting your region! Please wait up to a week or so for your region setting to be approved. Feel
          free to visit this page again to check your submission's status.
        </p>
      </>,
    )
  }

  if (token) {
    const requestStatus: string | undefined = requests.isSuccess ? requests.data[0]?.status : "Loading..."
    return container(
      <>
        {userData ? (
          <>
            <h3 className="text-2xl leading-6 font-medium font-effra">
              Hello, {userData.first_name ? `${userData.first_name} ` : null}
              {userData.last_name || null}({userData.wca_id || null})!
              <LogOutButton onClick={logOut} />
            </h3>
            <p className="mt-2 mb-1 font-bold text-sm leading-5">
              Your current region: {userData.region ? userData.region : "No region yet"}
            </p>
            <p className="mt-1 mb-3 font-bold text-sm leading-5">
              Your region request's status: {requestStatus ? requestStatus : "No request yet"}
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-row mx-5">
              <LoadingSpinner /> Loading your data...
            </div>
            <LogOutButton onClick={logOut} />
          </>
        )}

        <GuideText status={requestStatus} />

        {userData && requests.isSuccess && canChangeRegion(userData, requestStatus) && (
          <div className="mt-3 mb-1 flex justify-start items-end flex-wrap sm:flex-nowrap">
            <RegionSelect label="What region are you from in the Philippines?" value={userRegion} onChange={setUserRegion} />
            <button
              type="button"
              className="h-10 px-3 ml-2 text-white transition-colors duration-300 bg-blue rounded-md hover:bg-blue-800 focus:bg-blue-800 disabled:opacity-60"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
            >
              Submit your region
            </button>
          </div>
        )}

        {submit.isError && (
          <div className="mt-3">
            <h3 className="text-lg leading-6 font-medium">Error: Can't submit region</h3>
            <p className="mt-1 text-sm leading-5">
              Your request has been denied as you may have already set your region for this year. You can only set your
              region once every year. A network/system error may have happened, please let us know on our e-mail at{" "}
              <strong>{PCA_EMAIL}</strong>.
            </p>
          </div>
        )}

        {userData && !userData.wca_id && (
          <p className="mt-1 text-sm leading-5">
            <strong>
              {" "}
              Oops! <br />
              You don't have a WCA ID connected to your WCA account yet.{" "}
            </strong>{" "}
            <br /> To get a WCA ID, you must have finished competing in at least one WCA competition.
          </p>
        )}
      </>,
    )
  }

  const authorizeUrl =
    `${WCA_URL}/oauth/authorize/?client_id=${WCA_CLIENT_ID}` +
    `&redirect_uri=${origin}/regional-rankings&response_type=code&scope=`

  return container(
    <>
      <div>
        <h3 className="font-effra text-2xl leading-6 font-medium">Want to see your regional rank here?</h3>
        <p className="mt-3 text-sm leading-5">
          If you've competed in an official WCA competition before, you can easily set your region in just a few steps.
        </p>
      </div>
      <div className="mt-4 flex-shrink-0">
        <span className="inline-flex rounded-md shadow-sm">
          <a
            className="relative inline-flex items-center px-4 py-2 border border-transparent text-sm leading-5 font-medium rounded-md bg-yellow hover:bg-yellow-400 focus:outline-none"
            href={authorizeUrl}
            rel="nofollow"
          >
            <img alt="WCA Logo" className="h-5 mr-2" src="/images/wca-logo.svg" fetchPriority="low" />
            Login with WCA
          </a>
        </span>
      </div>
    </>,
  )
}

/**
 * canChangeRegion: users may pick a region when they
 * have none (and a WCA ID, and no request yet), or once per calendar year,
 * but never while a request is pending or after one was denied.
 */
function canChangeRegion(user: PublicUser, status: string | undefined) {
  if (status === "Pending" || status === "Denied") return false
  const updatedYear = user.region_updated_at ? new Date(user.region_updated_at).getFullYear() : NaN
  return (
    (updatedYear !== new Date().getFullYear() && user.region != null) ||
    (user.region == null && status === undefined && user.wca_id != null)
  )
}

function GuideText({ status }: { status: string | undefined }) {
  if (status === "Denied") {
    return (
      <p className="mt-1 text-sm leading-5">
        Sorry, your request has been denied because we cannot verify your region. <br />
        You must e-mail us at <strong>{PCA_EMAIL}</strong>, and make the subject of the e-mail{" "}
        <strong>"Region update request appeal: (Your full name)".</strong> <br /> In the e-mail, you must give us as much
        as you can your proof of residence / origin in your selected region.
      </p>
    )
  }
  if (status === "Pending") {
    return (
      <p className="mt-1 text-sm leading-5">
        You've already submitted a request. For now, you can only wait for your request to be processed.
        <br />
        You may e-mail us at <strong>{PCA_EMAIL}</strong>, for any concerns.{" "}
      </p>
    )
  }
  return (
    <>
      <p className="mt-1 text-sm leading-5">
        Please keep in mind: Pick only your REAL region. Our team will verify this, and may deny your submission if found
        false.
      </p>
      <p className="mt-1 text-sm leading-5">
        You can only set your region once every year, so please double check if it's correct before submitting.
      </p>
    </>
  )
}

function LogOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="underline text-sm ml-2" onClick={onClick}>
      Log out
    </button>
  )
}

function LoginPromptContainer({
  hidden,
  setHidden,
  children,
}: {
  hidden: boolean
  setHidden: (hidden: boolean) => void
  children: ReactNode
}) {
  if (hidden) {
    return (
      <button
        type="button"
        className="relative inline-flex items-center px-4 py-2 mx-4 mt-5 border-2 border-yellow text-sm leading-5 font-medium rounded-md bg-transparent hover:bg-yellow-100 focus:outline-none"
        onClick={() => setHidden(false)}
      >
        <span role="img" aria-label="waving hand">
          👋
        </span>
        &nbsp; Show your regional settings
      </button>
    )
  }
  return (
    <div className="login-prompt bg-yellow-100 font-rubik text-gray-600 mx-4 my-5 px-6 py-5 border-4 border-yellow">
      <div className="-ml-4 -mt-4 relative flex justify-between items-center flex-wrap sm:flex-nowrap">
        <div className="ml-4 mt-4">
          <button type="button" className="absolute top-0 -right-3 text-2xl" aria-label="Hide regional settings" onClick={() => setHidden(true)}>
            &times;
          </button>
          {children}
        </div>
      </div>
    </div>
  )
}
