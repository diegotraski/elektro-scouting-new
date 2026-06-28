import { Attack, ComboRow } from './types'

const clean = (v?: string | null) => String(v || '').toLowerCase().trim()

export function normalizeAttack(a: Attack): Attack {
  let base_style = clean(a.base_style)
  let spell_tower = clean(a.spell_tower)
  if (spell_tower === 'poison rage') spell_tower = 'rage poison'
  if (base_style === 'anti 2 asymetrique' || base_style === 'anti 2 asymétrique') base_style = 'anti 2'
  return { ...a, base_style, spell_tower, stream: clean(a.stream) }
}

export function filteredAttacks(rows: Attack[]) {
  return rows
    .map(normalizeAttack)
    .filter(r => r.stream === 'yes')
    .filter(r => r.base_style && r.spell_tower && r.stars !== null && r.stars !== undefined)
}

export function comboStats(rows: Attack[], minAttacks = 0): ComboRow[] {
  const map = new Map<string, Attack[]>()
  rows.forEach(r => {
    const key = `${r.base_style}|||${r.spell_tower}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })

  return Array.from(map.entries()).map(([key, items]) => {
    const [base_style, spell_tower] = key.split('|||')
    const attacks = items.length
    const triples = items.filter(x => Number(x.stars) === 3).length
    const hr = attacks ? +(triples / attacks * 100).toFixed(1) : 0
    const avg_stars = +(items.reduce((s, x) => s + Number(x.stars || 0), 0) / attacks).toFixed(2)
    const avg_percent = +(items.reduce((s, x) => s + Number(x.percent || 0), 0) / attacks).toFixed(1)
    return {
      combo: `${title(base_style)} + ${title(spell_tower)}`,
      base_style,
      spell_tower,
      attacks,
      triples,
      hr,
      avg_stars,
      avg_percent,
    }
  }).filter(r => r.attacks >= minAttacks)
}

export function title(s: string) {
  return s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

// --- Attack type classification (Ground vs Air) -------------------------------------------
// Ground if the army name contains any of: RR, Throwers, SB, Yeti, or Witch. Everything else
// is classified as Air. This is a naming-convention heuristic over the `army` field, not a
// separate data source, so it's only as accurate as how armies are named in the spreadsheet.
const GROUND_KEYWORDS = ['rr', 'throwers', 'sb', 'yeti', 'witch']

export type AttackType = 'ground' | 'air'

export function classifyAttackType(army?: string | null): AttackType {
  const a = clean(army)
  if (!a) return 'air'
  // Match whole words/tokens so e.g. "sb" doesn't accidentally match inside an unrelated word.
  const tokens = a.split(/[^a-z0-9]+/i).filter(Boolean)
  const isGround = tokens.some(t => GROUND_KEYWORDS.includes(t))
  return isGround ? 'ground' : 'air'
}
