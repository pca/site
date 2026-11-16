// Small public-results fixture for a design prototype; never changes the database.
import { execFileSync } from "node:child_process"
import { readFile, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../", import.meta.url))
const preview = JSON.parse(await readFile(`${root}apps/web/src/data/insights-preview.json`, "utf8"))
const ids = preview.competitions.map(comp => `'${comp.id.replaceAll("'", "''")}'`).join(",")
const query = sql => JSON.parse(execFileSync("sqlite3", ["-readonly", "-json", `${root}apps/api/data/pca.sqlite3`, sql]).toString() || "[]")
const counts = query(`SELECT competition_id id,COUNT(DISTINCT person_id) people FROM wca_result WHERE competition_id IN (${ids}) GROUP BY competition_id`)
const rows = query(`SELECT r.competition_id competition,r.event_id event,e.name eventName,
  r.person_id person,r.person_name name,r.pos place,r.average,
  r.value1,r.value2,r.value3,r.value4,r.value5
  FROM wca_result r JOIN wca_event e ON e.id=r.event_id
  JOIN wca_roundtype rt ON rt.id=r.round_type_id
  WHERE r.competition_id IN (${ids}) AND rt.final=1 AND r.average>0
  AND r.event_id IN ('333','222','444','555','666','777','333oh','clock','minx','pyram','skewb','sq1')
  ORDER BY e.rank,r.pos,r.person_id`)
const competitions = preview.competitions.map(comp => ({ ...comp,
  people: counts.find(row => row.id === comp.id)?.people ?? 0,
  events: [...new Set(rows.filter(row => row.competition === comp.id).map(row => row.event))].map(id => {
    const finals = rows.filter(row => row.competition === comp.id && row.event === id)
    return { id, name: finals[0].eventName, finalists: finals.length,
      results: finals.slice(0, 8).map(row => ({ person: row.person, name: row.name, place: row.place,
        average: row.average, solves: [row.value1,row.value2,row.value3,row.value4,row.value5].filter(value => value !== 0) })) }
  }),
}))
await writeFile(`${root}apps/web/src/data/competition-preview.json`, JSON.stringify(competitions) + "\n")
console.log(`Prepared ${competitions.length} competitions with public final-round results.`)
