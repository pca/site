# Growth Statistics

- In local development (`import.meta.env.DEV`), always show the Growth Statistics link in the main navigation on every page.
- In deployed production builds, show that link only while the visitor is on `/growth-statistics` (including its metric/query variants and trailing-slash URL). Hide it again when they navigate to another page. Preserve the local-development exception when changing this behavior.
- Keep every year label below the charts within the selected year range. Do not thin the labels to every second year or hide intermediate labels on narrow screens.
- The exception is 2021: omit it from all four Growth Statistics charts and their history tables, with no empty horizontal slot. Keep it in the underlying history for calendar-year calculations.
- When year labels become crowded, adjust their orientation or size instead of removing them. Preserve the full-width chart layout.
- Apply this consistently to new attendees, competition attendances, active competitors, and popular events. Check mobile widths (390px and 520px), desktop, and all four year-range options after changes to the year axis.
