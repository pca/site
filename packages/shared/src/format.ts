const numberFormat = new Intl.NumberFormat("en-PH")

export const formatNumber = (value: unknown) => numberFormat.format(Number(value || 0))

const dateTimeFormat = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
})

/** formatDateTime shows an ISO timestamp in Philippine time, or a dash. */
export const formatDateTime = (iso?: string | null) => (iso ? dateTimeFormat.format(new Date(iso)) : "—")

export const timeAgo = (iso?: string | null, now = Date.now()) => {
  if (!iso) return ""
  let seconds = (now - new Date(iso).getTime()) / 1000
  const future = seconds < 0
  seconds = Math.abs(seconds)
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
  const text =
    seconds < 60
      ? "moments"
      : seconds < 3600
        ? unit(Math.floor(seconds / 60), "minute")
        : seconds < 48 * 3600
          ? unit(Math.floor(seconds / 3600), "hour")
          : unit(Math.floor(seconds / 86400), "day")
  return future ? `in ${text}` : `${text} ago`
}

export const formatDuration = (ms: number) => {
  if (!ms || ms <= 0) return "< 1 s"
  if (ms < 1000) return `${ms} ms`
  const seconds = ms / 1000
  if (seconds < 60) return `${seconds.toFixed(1)} s`
  const minutes = Math.floor(seconds / 60)
  return `${minutes} min ${Math.round(seconds % 60)} s`
}
