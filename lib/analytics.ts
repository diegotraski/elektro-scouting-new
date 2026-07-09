import { Attack, ComboRow } from './types'

const clean = (v?: string | null) => String(v || '').toLowerCase().trim()

export function normalizeAttack(a: Attack): Attack {
  let base_style = clean(a.base_style)
  let spell_tower = clean(a.spell_tower)
  if (spell_tower === 'poison rage') spell_tower = 'rage poison'
  if (base_style === 'anti 2 asymetrique' || base_style === 'anti 2 asymétrique') base_style = 'anti 2'
  // Normalize stream: accept 'yes', 'y', '1', 'true', 'si', 'oui' as truthy.
  // Previously only 'yes' was accepted, silently dropping rows where the column
  // was filled with a different truthy value (e.g. 'Yes' before lowercasing,
  // which normalizeAttack already handles, but also 'y' or '1').
  const rawStream = clean(a.stream)
  const stream = ['yes', 'y', '1', 'true', 'si', 'oui'].includes(rawStream) ? 'yes' : rawStream
  return { ...a, base_style, spell_tower, stream }
}

/** Returns ALL rows that have been streamed (stream === 'yes') and have the minimum fields
 * needed for analysis (base_style, spell_tower, stars). Rows missing these fields are still
 * stored in Supabase — they just don't contribute to combo/HR stats. */
export function filteredAttacks(rows: Attack[]) {
  return rows
    .map(normalizeAttack)
    .filter(r => r.stream === 'yes')
    .filter(r => r.base_style && r.spell_tower && r.stars !== null && r.stars !== undefined)
}

/** Same as filteredAttacks but skips the stream filter — useful for counting how many rows
 * the stream filter is dropping so the user can see it in the UI. */
export function allNormalizedAttacks(rows: Attack[]) {
  return rows.map(normalizeAttack)
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
    return { combo: `${title(base_style)} + ${title(spell_tower)}`, base_style, spell_tower, attacks, triples, hr, avg_stars, avg_percent }
  }).filter(r => r.attacks >= minAttacks)
}

export function title(s: string) {
  return s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ')
}

// --- Attack type classification (Ground vs Air) -------------------------------------------
const GROUND_SUBSTRINGS = ['thrower', 'yeti', 'witch']
const GROUND_EXACT_TOKENS = ['rr', 'sb']

export type AttackType = 'ground' | 'air'

export function classifyAttackType(army?: string | null): AttackType {
  const a = clean(army)
  if (!a) return 'air'
  const tokens = a.split(/[^a-z0-9]+/i).filter(Boolean)
  const isGround = tokens.some(t => GROUND_EXACT_TOKENS.includes(t) || GROUND_SUBSTRINGS.some(kw => t.includes(kw)))
  return isGround ? 'ground' : 'air'
}
