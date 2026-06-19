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

/**
 * Wilson score interval (95%) for a hit rate proportion.
 * Used instead of a single point estimate so small samples don't
 * masquerade as reliable rankings. Returns [low, high] as percentages.
 */
export function wilsonInterval(successes: number, n: number): [number, number] {
  if (n === 0) return [0, 0]
  const z = 1.96
  const p = successes / n
  const denom = 1 + (z * z) / n
  const center = p + (z * z) / (2 * n)
  const margin = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  const low = (center - margin) / denom
  const high = (center + margin) / denom
  return [+(Math.max(0, low) * 100).toFixed(1), +(Math.min(1, high) * 100).toFixed(1)]
}

export function comboStats(rows: Attack[], minAttacks = 1): ComboRow[] {
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
    const hr = attacks ? +(triples / attacks * 100).toFixed(2) : 0
    const avg_stars = +(items.reduce((s, x) => s + Number(x.stars || 0), 0) / attacks).toFixed(2)
    const avg_percent = +(items.reduce((s, x) => s + Number(x.percent || 0), 0) / attacks).toFixed(2)
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
