'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Attack } from '@/lib/types'
import { comboStats, filteredAttacks, title, classifyAttackType } from '@/lib/analytics'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ScatterChart,
  Scatter,
  ZAxis,
  PieChart,
  Pie,
  Cell,
  Legend,
  LabelList,
} from 'recharts'
import {
  Upload,
  Trophy,
  Shield,
  Target,
  Database,
  CalendarDays,
  Search,
  Table2,
  Lock,
  Crosshair,
  ChevronDown,
  AlertTriangle,
  Sparkles,
  Crown,
  TrendingDown,
  Mountain,
  Wind,
} from 'lucide-react'
import * as XLSX from 'xlsx'

const PALETTE = ['#0EC6E0', '#E0399E', '#B8862E', '#3B8FD6', '#1A9C6B', '#8C6FD1', '#D8425C', '#6B7488']
const PAGE_SIZE_STEPS = [5, 10, 20, Infinity]
// Default minimum sample size for HR rankings/charts. Below this, hit rate is too noisy to act on,
// so these rows are excluded from ranked charts (but still visible in full data tables).
const DEFAULT_MIN_SAMPLE = 10

type Page = 'overview' | 'combos' | 'teams' | 'players' | 'matches' | 'data'

function norm(v: any) {
  return String(v || '').trim()
}

function titleSafe(v?: string | null) {
  const s = norm(v)
  return s ? title(s) : 'Unknown'
}

function pct(n: number) {
  if (!Number.isFinite(n)) return '0%'
  return `${n.toFixed(1)}%`
}

function SectionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <p className="label-eyebrow">{children}</p>
      {sub ? <p className="mt-1 text-sm text-steel">{sub}</p> : null}
    </div>
  )
}

function StatCard({ label, value, sub, icon: Icon, tone = 'cyan' }: any) {
  const toneClass: Record<string, string> = {
    cyan: 'bg-cyan/10 text-cyan',
    magenta: 'bg-magenta/10 text-magenta',
    success: 'bg-success/10 text-success',
    steel: 'bg-steel/10 text-steel',
  }
  return (
    <div className="card card-edge group relative overflow-hidden p-5 transition hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-eyebrow">{label}</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink">{value}</p>
          {sub ? <p className="mt-1.5 text-xs text-steel">{sub}</p> : null}
        </div>
        <div className={`rounded-lg p-2.5 ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function InsightCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: 'success' | 'danger' | 'brand' }) {
  const toneBorder = tone === 'danger' ? 'border-danger/25 bg-danger/[0.05]' : tone === 'success' ? 'border-success/25 bg-success/[0.05]' : tone === 'brand' ? 'border-magenta/25 bg-magenta/[0.05]' : 'border-line bg-soft/60'
  return (
    <div className={`rounded-lg border p-4 ${toneBorder}`}>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 truncate font-display text-lg font-semibold text-ink" title={String(value)}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-steel">{sub}</p> : null}
    </div>
  )
}

function PageButton({ active, children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-lg px-4 py-2 font-mono text-xs font-semibold uppercase tracking-wider transition ${
        active
          ? 'bg-ink text-white shadow-sm'
          : 'border border-line bg-white text-steel hover:border-cyan/30 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

/** Small pill that labels an attack's type (Ground / Air) with a distinct icon + color, kept apart from the brand cyan/magenta. */
function AttackTypeChip({ type }: { type: 'ground' | 'air' }) {
  return type === 'ground' ? (
    <span className="chip-ground"><Mountain className="h-3 w-3" /> Ground</span>
  ) : (
    <span className="chip-air"><Wind className="h-3 w-3" /> Air</span>
  )
}

/** Shared tooltip style for Recharts, tuned for the light theme. */
const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #E2E6ED',
  color: '#131720',
  borderRadius: 8,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  boxShadow: '0 8px 24px -8px rgba(19,23,32,0.15)',
}
const tooltipLabelStyle = { color: '#131720', fontWeight: 600 }
const tooltipItemStyle = { color: '#131720' }

/** "Show more" control used under rankings/charts: starts small, expands in steps, with an explicit step count visible. */
function ShowMoreControl({ visibleCount, total, onExpand }: { visibleCount: number; total: number; onExpand: () => void }) {
  if (visibleCount >= total) return null
  const nextStep = PAGE_SIZE_STEPS.find((s) => s > visibleCount) ?? Infinity
  const nextLabel = nextStep === Infinity ? 'Show all' : `Show ${Math.min(nextStep, total)}`
  return (
    <button onClick={onExpand} className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 text-xs">
      <ChevronDown className="h-3.5 w-3.5" /> {nextLabel} <span className="text-steel">({visibleCount} / {total})</span>
    </button>
  )
}

function useExpandable(total: number) {
  const [count, setCount] = useState(PAGE_SIZE_STEPS[0])
  useEffect(() => { setCount(PAGE_SIZE_STEPS[0]) }, [total])
  const expand = () => {
    const next = PAGE_SIZE_STEPS.find((s) => s > count) ?? total
    setCount(next === Infinity ? total : next)
  }
  return { count: Math.min(count, total), expand }
}

function toDateString(value: any) {
  if (!value) return ''
  if (typeof value === 'number') {
    const excelDate = XLSX.SSF.parse_date_code(value)
    if (excelDate) {
      const mm = String(excelDate.m).padStart(2, '0')
      const dd = String(excelDate.d).padStart(2, '0')
      return `${excelDate.y}-${mm}-${dd}`
    }
  }
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10)
  const raw = String(value).trim()
  const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return raw
}

function mapRow(row: any): Attack {
  const dateRaw = row['Date'] || row['date']
  const streamValue = row['Stream'] || row['stream'] || (row['Stream Link'] || row['stream_link'] ? 'Yes' : 'Yes')
  return {
    attacker_name: norm(row['Name (attacker)'] || row['Attacker Name'] || row['attacker_name']),
    attacker_tag: norm(row['Tag (attacker)'] || row['Attacker Tag'] || row['attacker_tag']),
    attacker_team: norm(row['Team (attacker)'] || row['Attacker Team'] || row['attacker_team']),
    attacker_team_id: norm(row['Team ID (attacker)'] || row['attacker_team_id']),
    stars: Number(row['Stars'] ?? row['stars']),
    percent: Number(row['%'] ?? row['Percent'] ?? row['percent']),
    attack_order: Number(row['Attack order'] ?? row['Attack Order'] ?? row['attack_order']),
    army: norm(row['Army'] || row['army']),
    base_style: norm(row['Base Style'] || row['base_style']),
    spell_tower: norm(row['Spell Tower'] || row['spell_tower']),
    defender_name: norm(row['Name (defender)'] || row['Defender Name'] || row['Defender Nale'] || row['defender_name']),
    defender_tag: norm(row['Tag (defender)'] || row['Defender Tag'] || row['defender_tag']),
    defender_team: norm(row['Team (defender)'] || row['Defender Team'] || row['defender_team']),
    defender_team_id: norm(row['Team ID (defender)'] || row['defender_team_id']),
    competition: norm(row['Competition'] || row['competition']),
    match_id: norm(row['Match ID'] || row['match_id']),
    link: norm(row['Link'] || row['Match Link'] || row['link']),
    stream: norm(streamValue),
    stream_link: norm(row['Stream Link'] || row['stream_link']),
    date: toDateString(dateRaw),
  }
}

/** Color scale for the combo heatmap. Defensive read: green = hard to triple, red = easy to triple. */
function getCellClass(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'bg-soft/60 text-steel border-line'
  if (value < 35) return 'bg-success/10 text-success border-success/25'
  if (value < 60) return 'bg-ground/10 text-ground border-ground/25'
  return 'bg-danger/10 text-danger border-danger/25'
}

function makeGroup(rows: Attack[], keyFn: (r: Attack) => string, labelKey: string) {
  const map = new Map<string, Attack[]>()
  rows.forEach((r) => {
    const key = keyFn(r) || 'Unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })
  return Array.from(map.entries()).map(([name, items]) => {
    const attacks = items.length
    const triples = items.filter((x) => Number(x.stars) === 3).length
    const avgStars = attacks ? items.reduce((s, x) => s + Number(x.stars || 0), 0) / attacks : 0
    const avgPercent = attacks ? items.reduce((s, x) => s + Number(x.percent || 0), 0) / attacks : 0
    return {
      [labelKey]: name,
      attacks,
      triples,
      hr: +(triples / Math.max(attacks, 1) * 100).toFixed(1),
      avg_stars: +avgStars.toFixed(2),
      avg_percent: +avgPercent.toFixed(1),
    }
  }) as any[]
}

function makeComboGroup(rows: Attack[], keys: [string, (r: Attack) => string][], labelKey = 'combo') {
  const map = new Map<string, Attack[]>()
  rows.forEach((r) => {
    const parts = keys.map(([_, fn]) => fn(r) || 'Unknown')
    const key = parts.join('|||')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  })

  return Array.from(map.entries()).map(([key, items]) => {
    const parts = key.split('|||')
    const attacks = items.length
    const triples = items.filter((x) => Number(x.stars) === 3).length
    const avgStars = attacks ? items.reduce((s, x) => s + Number(x.stars || 0), 0) / attacks : 0
    const avgPercent = attacks ? items.reduce((s, x) => s + Number(x.percent || 0), 0) / attacks : 0
    const row: any = {
      [labelKey]: parts.map(titleSafe).join(' + '),
      attacks,
      triples,
      hr: +(triples / Math.max(attacks, 1) * 100).toFixed(1),
      avg_stars: +avgStars.toFixed(2),
      avg_percent: +avgPercent.toFixed(1),
    }
    keys.forEach(([name], i) => row[name] = parts[i])
    return row
  })
}

/** Ground vs Air split for a set of rows, by attack count and hit rate. */
function groundAirSplit(rows: Attack[]) {
  const ground = rows.filter(r => classifyAttackType(r.army) === 'ground')
  const air = rows.filter(r => classifyAttackType(r.army) === 'air')
  const summarize = (items: Attack[]) => {
    const attacks = items.length
    const triples = items.filter(x => Number(x.stars) === 3).length
    const avgStars = attacks ? items.reduce((s, x) => s + Number(x.stars || 0), 0) / attacks : 0
    const avgPercent = attacks ? items.reduce((s, x) => s + Number(x.percent || 0), 0) / attacks : 0
    return { attacks, triples, hr: +(triples / Math.max(attacks, 1) * 100).toFixed(1), avg_stars: +avgStars.toFixed(2), avg_percent: +avgPercent.toFixed(1) }
  }
  return { ground: summarize(ground), air: summarize(air) }
}

function Distribution({ rows }: { rows: any[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" outerRadius={88} innerRadius={50} paddingAngle={2} stroke="#FFFFFF" strokeWidth={2}>
            {rows.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#131720' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function Home() {
  const [rows, setRows] = useState<Attack[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState<Page>('overview')
  const [baseFilter, setBaseFilter] = useState('all')
  const [spellFilter, setSpellFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [playerFilter, setPlayerFilter] = useState('all')
  const [matchFilter, setMatchFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState('')
  const [predictorMinSample, setPredictorMinSample] = useState(DEFAULT_MIN_SAMPLE)

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase.from('attacks').select('*').order('date', { ascending: false }).limit(20000)
    if (!error && data) setRows(data)
    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  const cleanRows = useMemo(() => filteredAttacks(rows), [rows])
  const dateBounds = useMemo(() => {
    const dates = cleanRows.map((r) => r.date).filter(Boolean).sort()
    return { min: dates[0] || '', max: dates[dates.length - 1] || '' }
  }, [cleanRows])

  const bases = useMemo(() => Array.from(new Set(cleanRows.map((r) => r.base_style).filter(Boolean))).sort(), [cleanRows])
  const spells = useMemo(() => Array.from(new Set(cleanRows.map((r) => r.spell_tower).filter(Boolean))).sort(), [cleanRows])
  const teams = useMemo(() => Array.from(new Set(cleanRows.flatMap((r) => [r.attacker_team, r.defender_team]).filter(Boolean))).sort(), [cleanRows])
  const players = useMemo(() => Array.from(new Set(cleanRows.flatMap((r) => [r.attacker_name, r.defender_name]).filter(Boolean))).sort(), [cleanRows])
  const matches = useMemo(() => Array.from(new Set(cleanRows.map((r) => r.match_id || r.link).filter(Boolean))).sort(), [cleanRows])

  // Rows matching the global filters, regardless of role (attacker or defender). Right scope for
  // Matches/Data pages and the filter bar's own date bounds, but NOT for "this team's stats".
  const filtered = useMemo(() => cleanRows.filter((r) => {
    const okBase = baseFilter === 'all' || r.base_style === baseFilter
    const okSpell = spellFilter === 'all' || r.spell_tower === spellFilter
    const okTeam = teamFilter === 'all' || r.attacker_team === teamFilter || r.defender_team === teamFilter
    const okPlayer = playerFilter === 'all' || r.attacker_name === playerFilter || r.defender_name === playerFilter
    const okMatch = matchFilter === 'all' || r.match_id === matchFilter || r.link === matchFilter
    const okFrom = !dateFrom || (r.date || '') >= dateFrom
    const okTo = !dateTo || (r.date || '') <= dateTo
    const q = query.toLowerCase().trim()
    const okQuery = !q || [r.attacker_name, r.attacker_tag, r.attacker_team, r.army, r.defender_name, r.defender_team, r.competition, r.match_id].join(' ').toLowerCase().includes(q)
    return okBase && okSpell && okTeam && okPlayer && okMatch && okFrom && okTo && okQuery
  }), [cleanRows, baseFilter, spellFilter, teamFilter, playerFilter, matchFilter, dateFrom, dateTo, query])

  const total = filtered.length

  // Role isolation: when a team/player is selected, every "general" stat must come from attacks
  // THEY made, never attacks made against them (this was the reported critical bug — fixed here
  // by always deriving general stats from analysisRows, not from `filtered`).
  const analysisRows = useMemo(() => {
    if (teamFilter !== 'all') return filtered.filter((r) => r.attacker_team === teamFilter)
    if (playerFilter !== 'all') return filtered.filter((r) => r.attacker_name === playerFilter)
    return filtered
  }, [filtered, teamFilter, playerFilter])

  const analysisTotal = analysisRows.length
  const triples = analysisRows.filter((r) => Number(r.stars) === 3).length
  const hr = analysisTotal ? +(triples / analysisTotal * 100).toFixed(1) : 0
  const avgStars = analysisTotal ? +(analysisRows.reduce((s, r) => s + Number(r.stars || 0), 0) / analysisTotal).toFixed(2) : 0
  const avgPercent = analysisTotal ? +(analysisRows.reduce((s, r) => s + Number(r.percent || 0), 0) / analysisTotal).toFixed(1) : 0
  const uniqueTeams = new Set(analysisRows.flatMap((r) => [r.attacker_team, r.defender_team]).filter(Boolean)).size
  const uniquePlayers = new Set(analysisRows.flatMap((r) => [r.attacker_tag, r.defender_tag]).filter(Boolean)).size

  const combos = useMemo(() => comboStats(analysisRows, 0), [analysisRows])
  const combosReliable = useMemo(() => combos.filter(c => c.attacks >= predictorMinSample), [combos, predictorMinSample])
  const rankingHR = useMemo(() => [...combosReliable].sort((a, b) => a.hr - b.hr), [combosReliable])
  const rankingReliableDefense = useMemo(() => [...combosReliable].sort((a, b) => a.hr - b.hr), [combosReliable])
  const rankingStars = useMemo(() => [...combosReliable].sort((a, b) => a.avg_stars - b.avg_stars), [combosReliable])
  const rankingAll = useMemo(() => [...combos].sort((a, b) => a.hr - b.hr), [combos])

  const attackTeamStats = useMemo(() => makeGroup(analysisRows, (r) => r.attacker_team || '', 'team').sort((a, b) => b.hr - a.hr), [analysisRows])
  const playerAttackStats = useMemo(() => makeGroup(analysisRows, (r) => r.attacker_name || '', 'player').sort((a, b) => b.hr - a.hr), [analysisRows])
  const armyStats = useMemo(() => makeGroup(analysisRows, (r) => r.army || '', 'army').sort((a, b) => b.attacks - a.attacks), [analysisRows])
  const baseStats = useMemo(() => makeGroup(analysisRows, (r) => r.base_style || '', 'base').sort((a, b) => a.hr - b.hr), [analysisRows])
  const spellStats = useMemo(() => makeGroup(analysisRows, (r) => r.spell_tower || '', 'spell').sort((a, b) => a.hr - b.hr), [analysisRows])
  const baseStatsReliable = useMemo(() => baseStats.filter(x => x.attacks >= predictorMinSample), [baseStats, predictorMinSample])
  const spellStatsReliable = useMemo(() => spellStats.filter(x => x.attacks >= predictorMinSample), [spellStats, predictorMinSample])

  // --- Ground / Air breakdowns ----------------------------------------------------------------
  // Overview-level split: how the whole filtered offense performs on the ground vs in the air.
  const groundAirOverview = useMemo(() => groundAirSplit(analysisRows), [analysisRows])
  // Per-team split, used on the Teams page to show each team's ground/air balance and HR.
  const groundAirByTeam = useMemo(() => {
    const map = new Map<string, Attack[]>()
    analysisRows.forEach(r => {
      const t = r.attacker_team || 'Unknown'
      if (!map.has(t)) map.set(t, [])
      map.get(t)!.push(r)
    })
    return Array.from(map.entries()).map(([team, items]) => {
      const split = groundAirSplit(items)
      // "Mismatch" = how lopsided a team's HR is between ground and air. A large gap signals a
      // team that is much more comfortable on one terrain than the other — worth knowing when
      // deciding whether to push them toward a ground- or air-heavy matchup.
      const mismatch = Math.abs(split.ground.hr - split.air.hr)
      return { team, ...split, mismatch, totalAttacks: items.length }
    }).filter(t => t.totalAttacks >= 2).sort((a, b) => b.totalAttacks - a.totalAttacks)
  }, [analysisRows])
  // Per-base-style split: which base designs are vulnerable to ground vs air, useful for prep.
  const groundAirByBase = useMemo(() => {
    const map = new Map<string, Attack[]>()
    analysisRows.forEach(r => {
      const b = r.base_style || 'Unknown'
      if (!map.has(b)) map.set(b, [])
      map.get(b)!.push(r)
    })
    return Array.from(map.entries()).map(([base, items]) => ({ base, ...groundAirSplit(items), totalAttacks: items.length }))
      .filter(b => b.totalAttacks >= 2).sort((a, b) => b.totalAttacks - a.totalAttacks)
  }, [analysisRows])

  const heatmap = useMemo(() => {
    const baseList = Array.from(new Set(combos.map((c) => c.base_style))).sort()
    const spellList = Array.from(new Set(combos.map((c) => c.spell_tower))).sort()
    const lookup = new Map(combos.map((c) => [`${c.base_style}|||${c.spell_tower}`, c]))
    return { baseList, spellList, lookup }
  }, [combos])

  const selectedTeamRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_team === teamFilter || r.defender_team === teamFilter)
  const selectedPlayerRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_name === playerFilter || r.defender_name === playerFilter)
  const selectedMatchRows = matchFilter === 'all' ? filtered.slice(0, 50) : filtered.filter((r) => r.match_id === matchFilter || r.link === matchFilter)

  // Role-isolated rows for the Teams/Players scouting pages.
  const teamAttackRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_team === teamFilter)
  const teamDefenseRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.defender_team === teamFilter)
  const playerAttackRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_name === playerFilter)

  // Team scouting is intentionally OFFENSE-FIRST: what they attack with, what base styles give
  // them trouble (their own HR while attacking), and the full army/base/tower breakdown. The
  // defensive side is kept to a single compact summary further down, by design.
  const teamArmyProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamBaseProfile = useMemo(() => makeComboGroup(teamAttackRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamArmyBaseProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamFullProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  // Compact defensive summary only: total defenses, HR conceded, avg stars conceded. No deep
  // breakdown tables here by design — offense is the focus for team scouting.
  const teamDefenseSummary = useMemo(() => {
    const attacks = teamDefenseRows.length
    const triplesC = teamDefenseRows.filter(r => Number(r.stars) === 3).length
    const avgStarsC = attacks ? teamDefenseRows.reduce((s, r) => s + Number(r.stars || 0), 0) / attacks : 0
    return { attacks, hr: attacks ? +(triplesC / attacks * 100).toFixed(1) : 0, avgStars: +avgStarsC.toFixed(2) }
  }, [teamDefenseRows])

  // --- Matchup Predictor (offense-only, fixed to use the team's OWN attacks) -----------------
  const matchupPrediction = useMemo(() => {
    if (teamFilter === 'all') return null
    const reliableAttackedBases = teamBaseProfile.filter(b => b.attacks >= predictorMinSample)
    if (reliableAttackedBases.length === 0) return { worstBase: null, strategies: [], insufficientData: true }
    const worstBase = [...reliableAttackedBases].sort((a, b) => a.hr - b.hr)[0]
    const ownRowsAgainstWorstBase = teamAttackRows.filter(r => r.base_style === worstBase.base_style && r.spell_tower === worstBase.spell_tower)
    const ownArmiesAgainstWorstBase = makeComboGroup(ownRowsAgainstWorstBase, [['army', r => r.army || '']], 'profile')
      .filter(a => a.attacks >= 2)
      .sort((a, b) => b.hr - a.hr || b.attacks - a.attacks)
    return { worstBase, strategies: ownArmiesAgainstWorstBase.slice(0, 2), insufficientData: false }
  }, [teamFilter, teamBaseProfile, teamAttackRows, predictorMinSample])

  const playerArmyProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerBaseProfile = useMemo(() => makeComboGroup(playerAttackRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerArmyBaseProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerFullProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])

  const starDistribution = useMemo(() => [1, 2, 3].map((s) => ({ name: `${s} Star`, value: analysisRows.filter((r) => Number(r.stars) === s).length })).filter(x => x.value > 0), [analysisRows])
  const baseDistribution = useMemo(() => baseStats.slice().sort((a,b)=>b.attacks-a.attacks).slice(0, 8).map((x) => ({ name: titleSafe(x.base), value: x.attacks })), [baseStats])
  const spellDistribution = useMemo(() => spellStats.slice().sort((a,b)=>b.attacks-a.attacks).slice(0, 8).map((x) => ({ name: titleSafe(x.spell), value: x.attacks })), [spellStats])
  const groundAirDistribution = useMemo(() => [
    { name: 'Ground', value: groundAirOverview.ground.attacks },
    { name: 'Air', value: groundAirOverview.air.attacks },
  ].filter(x => x.value > 0), [groundAirOverview])

  const metaTrend = useMemo(() => {
    const byMonth = new Map<string, Attack[]>()
    analysisRows.forEach(r => {
      const month = (r.date || '').slice(0, 7)
      if (!month) return
      if (!byMonth.has(month)) byMonth.set(month, [])
      byMonth.get(month)!.push(r)
    })
    return Array.from(byMonth.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([month, items]) => {
      const attacks = items.length
      const tr = items.filter(x => Number(x.stars) === 3).length
      return { month, attacks, hr: +(tr / Math.max(attacks,1) * 100).toFixed(1) }
    })
  }, [analysisRows])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const ok = window.confirm('This will replace the current Supabase data with the new Excel file. Continue?')
    if (!ok) return
    setUploading(true)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet)
    const payload = json.map(mapRow).filter((r) => r.base_style && r.spell_tower && r.stars !== null && r.stars !== undefined && !Number.isNaN(r.stars))
    await supabase.from('attacks').delete().gte('id', 0)
    const chunkSize = 500
    for (let i = 0; i < payload.length; i += chunkSize) {
      const { error } = await supabase.from('attacks').insert(payload.slice(i, i + chunkSize))
      if (error) alert(error.message)
    }
    setUploading(false)
    await loadData()
  }

  function clearFilters() {
    setBaseFilter('all'); setSpellFilter('all'); setTeamFilter('all'); setPlayerFilter('all'); setMatchFilter('all'); setDateFrom(''); setDateTo(''); setQuery('')
  }

  const rankingHRExp = useExpandable(rankingHR.length)
  const rankingDefExp = useExpandable(rankingReliableDefense.length)
  const rankingStarsExp = useExpandable(rankingStars.length)
  const attackTeamExp = useExpandable(attackTeamStats.length)
  const playerAttackExp = useExpandable(playerAttackStats.length)
  const comboTableExp = useExpandable(rankingAll.length)
  const groundAirTeamExp = useExpandable(groundAirByTeam.length)

  return (
    <main className="min-h-screen bg-bg p-4 text-ink md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-xl border border-line bg-panel p-6 md:p-8">
          <div className="absolute inset-x-0 top-0 h-1 bg-brand-gradient" />
          <div className="tactical-grid pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-eyebrow flex items-center gap-2">
                <Crosshair className="h-3.5 w-3.5 text-magenta" /> Clash of Clans Competitive Intelligence
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight text-ink md:text-5xl">
                Team Elektros <span className="bg-brand-gradient bg-clip-text text-transparent">Scout</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-steel">
                Performance by team, player, army, and base style + spell tower combination — built to spot the matchup that wins you the war.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button className="btn-ghost flex items-center gap-2" onClick={loadData}>
                <Database className={`h-4 w-4 ${loading ? 'animate-pulse' : ''}`} /> Refresh
              </button>
              <label className="btn-brand flex cursor-pointer items-center gap-2">
                <Upload className="h-4 w-4" />{uploading ? 'Updating...' : 'Upload Excel'}
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              </label>
            </div>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          <PageButton active={page === 'overview'} onClick={() => setPage('overview')}>Overview</PageButton>
          <PageButton active={page === 'combos'} onClick={() => setPage('combos')}>Combo Map</PageButton>
          <PageButton active={page === 'teams'} onClick={() => setPage('teams')}>Teams</PageButton>
          <PageButton active={page === 'players'} onClick={() => setPage('players')}>Players</PageButton>
          <PageButton active={page === 'matches'} onClick={() => setPage('matches')}>Matches</PageButton>
          <PageButton active={page === 'data'} onClick={() => setPage('data')}>Data</PageButton>
        </nav>

        <section className="card p-4">
          <div className="mb-3 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-magenta" />
            <span className="label-eyebrow">Global Filters</span>
          </div>
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
            <div className="relative lg:col-span-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-steel" />
              <input className="input w-full pl-9" placeholder="Search player, team, army..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className="input" value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}>
              <option value="all">All base styles</option>
              {bases.map((b) => <option key={b} value={b}>{titleSafe(b)}</option>)}
            </select>
            <select className="input" value={spellFilter} onChange={(e) => setSpellFilter(e.target.value)}>
              <option value="all">All spell towers</option>
              {spells.map((s) => <option key={s} value={s}>{titleSafe(s)}</option>)}
            </select>
            <input type="date" className="input" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            <input type="date" className="input" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            <button className="btn-ghost" onClick={clearFilters}>Clear filters</button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="font-mono text-[11px] text-steel">Available range: {dateBounds.min || '—'} → {dateBounds.max || '—'}</p>
            {teamFilter !== 'all' && (
              <p className="flex items-center gap-1.5 rounded-full border border-magenta/25 bg-magenta/[0.06] px-3 py-1 font-mono text-[11px] text-magenta">
                <Shield className="h-3 w-3" /> Showing {teamFilter}'s own attacks only ({analysisTotal} attacks)
              </p>
            )}
            {teamFilter === 'all' && playerFilter !== 'all' && (
              <p className="flex items-center gap-1.5 rounded-full border border-magenta/25 bg-magenta/[0.06] px-3 py-1 font-mono text-[11px] text-magenta">
                <Shield className="h-3 w-3" /> Showing {playerFilter}'s own attacks only ({analysisTotal} attacks)
              </p>
            )}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Attacks" value={loading ? '...' : analysisTotal} sub={`${uniqueTeams} teams · ${uniquePlayers} players`} icon={Database} tone="cyan" />
          <StatCard label="Hit Rate (triples)" value={`${hr}%`} sub={`${triples} triples out of ${analysisTotal} attacks`} icon={Target} tone="magenta" />
          <StatCard label="Avg Stars" value={avgStars} sub="Average stars earned" icon={Trophy} tone="cyan" />
          <StatCard label="Avg Destruction" value={`${avgPercent}%`} sub="Average destruction %" icon={Sparkles} tone="success" />
        </section>

        {page === 'overview' && (
          <>
            <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <InsightCard
                tone="success"
                label="Hardest Combo to Triple"
                value={rankingReliableDefense[0]?.combo || 'Not enough data'}
                sub={rankingReliableDefense[0] ? `HR ${rankingReliableDefense[0].hr}% · n=${rankingReliableDefense[0].attacks}` : `Need ${predictorMinSample}+ attacks per combo`}
              />
              <InsightCard
                tone="danger"
                label="Most Vulnerable Combo"
                value={rankingHR[rankingHR.length - 1]?.combo || 'Not enough data'}
                sub={rankingHR.length ? `HR ${rankingHR[rankingHR.length - 1].hr}% · n=${rankingHR[rankingHR.length - 1].attacks}` : `Need ${predictorMinSample}+ attacks per combo`}
              />
              <InsightCard label="Most Used Army" value={armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0]?.army ? titleSafe(armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0].army) : '-'} sub={armyStats.length ? `${armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0].attacks} attacks` : ''} />
              <InsightCard tone="brand" label="Best Attacking Team" value={attackTeamStats[0]?.team || '-'} sub={attackTeamStats[0] ? `HR ${attackTeamStats[0].hr}% · n=${attackTeamStats[0].attacks}` : ''} />
            </section>

            <section className="card p-5">
              <SectionLabel sub="How offense splits between ground and air armies, and which one converts better. Ground = army name includes RR, Thrower, Throwers, SB, Yeti, or Witch.">Ground vs Air — Meta Overview</SectionLabel>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-ground/25 bg-ground/[0.05] p-4">
                  <p className="chip-ground mb-2"><Mountain className="h-3 w-3" /> Ground</p>
                  <p className="font-display text-3xl font-semibold text-ink">{groundAirOverview.ground.hr}%</p>
                  <p className="mt-1 text-xs text-steel">HR · {groundAirOverview.ground.attacks} attacks · {groundAirOverview.ground.avg_stars} avg ⭐</p>
                </div>
                <div className="rounded-lg border border-air/25 bg-air/[0.05] p-4">
                  <p className="chip-air mb-2"><Wind className="h-3 w-3" /> Air</p>
                  <p className="font-display text-3xl font-semibold text-ink">{groundAirOverview.air.hr}%</p>
                  <p className="mt-1 text-xs text-steel">HR · {groundAirOverview.air.attacks} attacks · {groundAirOverview.air.avg_stars} avg ⭐</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <Distribution rows={groundAirDistribution} />
                <div className="flex flex-col justify-center gap-2 text-sm text-steel">
                  <p>
                    <span className="font-semibold text-ink">{groundAirOverview.ground.attacks > groundAirOverview.air.attacks ? 'Ground' : 'Air'}</span> attacks make up the majority of recorded offense under the current filters.
                  </p>
                  <p>
                    The <span className="font-semibold text-ink">{groundAirOverview.ground.hr > groundAirOverview.air.hr ? 'ground' : 'air'}</span> approach is converting triples more often right now ({Math.max(groundAirOverview.ground.hr, groundAirOverview.air.hr)}% vs {Math.min(groundAirOverview.ground.hr, groundAirOverview.air.hr)}%).
                  </p>
                </div>
              </div>
            </section>

            <section className="card p-5">
              <SectionLabel sub={`Base styles ranked from lowest to highest hit rate conceded. Only combos with ${predictorMinSample}+ attacks are shown — small samples are too noisy to rank reliably.`}>Hit Rate by Base Style</SectionLabel>
              <div className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={baseStatsReliable.map(b => ({ ...b, label: titleSafe(b.base) }))} layout="vertical" margin={{ left: 10, right: 70, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" horizontal={false} />
                    <XAxis type="number" stroke="#6B7488" domain={[0, 100]} unit="%" />
                    <YAxis dataKey="label" type="category" stroke="#6B7488" width={130} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: any, n: any, p: any) => [`${v}% (n=${p.payload.attacks})`, 'HR']} />
                    <Bar dataKey="hr" name="HR" fill="#1A9C6B" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="hr" position="right" formatter={(v: any) => `${v}%`} fill="#131720" fontFamily="var(--font-mono)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {baseStatsReliable.length === 0 && <p className="mt-3 text-center text-sm text-steel">No base style has {predictorMinSample}+ attacks under the current filters yet.</p>}
            </section>

            <section className="card p-5">
              <SectionLabel sub={`Spell tower setups ranked from lowest to highest hit rate conceded. Only combos with ${predictorMinSample}+ attacks are shown.`}>Hit Rate by Spell Tower</SectionLabel>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={spellStatsReliable.map(s => ({ ...s, label: titleSafe(s.spell) }))} layout="vertical" margin={{ left: 10, right: 70, top: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" horizontal={false} />
                    <XAxis type="number" stroke="#6B7488" domain={[0, 100]} unit="%" />
                    <YAxis dataKey="label" type="category" stroke="#6B7488" width={130} />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} formatter={(v: any, n: any, p: any) => [`${v}% (n=${p.payload.attacks})`, 'HR']} />
                    <Bar dataKey="hr" name="HR" fill="#0EC6E0" radius={[0, 6, 6, 0]}>
                      <LabelList dataKey="hr" position="right" formatter={(v: any) => `${v}%`} fill="#131720" fontFamily="var(--font-mono)" fontSize={11} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {spellStatsReliable.length === 0 && <p className="mt-3 text-center text-sm text-steel">No spell tower setup has {predictorMinSample}+ attacks under the current filters yet.</p>}
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div>
                <ChartCard title="Most Vulnerable Combos (HR)" subtitle={`Base + tower combos with ${predictorMinSample}+ attacks, ranked low to high HR — highest HR (right side) is easiest to triple.`} data={rankingHR.slice(0, rankingHRExp.count)} yKey="combo" xKey="hr" xName="HR %" color="#D8425C" showLabel />
                <ShowMoreControl visibleCount={rankingHRExp.count} total={rankingHR.length} onExpand={rankingHRExp.expand} />
              </div>
              <div>
                <ChartCard title="Most Reliable Defenses" subtitle={`Same ranking, read from the top: lowest HR conceded first. Minimum ${predictorMinSample} attacks.`} data={rankingReliableDefense.slice(0, rankingDefExp.count)} yKey="combo" xKey="hr" xName="HR %" color="#1A9C6B" showLabel />
                <ShowMoreControl visibleCount={rankingDefExp.count} total={rankingReliableDefense.length} onExpand={rankingDefExp.expand} />
              </div>
            </section>

            <section className="card p-5">
              <SectionLabel sub="Monthly hit rate trend across all attacks in the filtered dataset.">Meta Evolution Over Time</SectionLabel>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metaTrend} margin={{ left: 5, right: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" />
                    <XAxis dataKey="month" stroke="#6B7488" />
                    <YAxis stroke="#6B7488" unit="%" />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                    <Bar dataKey="hr" name="HR %" fill="#E0399E" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="card p-5"><SectionLabel>Star Distribution</SectionLabel><Distribution rows={starDistribution} /></div>
              <div className="card p-5"><SectionLabel>Volume by Base Style</SectionLabel><Distribution rows={baseDistribution} /></div>
              <div className="card p-5"><SectionLabel>Volume by Spell Tower</SectionLabel><Distribution rows={spellDistribution} /></div>
            </section>
          </>
        )}

        {page === 'combos' && (
          <>
            <section className="card p-5">
              <div className="mb-1 flex items-center gap-2">
                <Shield className="h-4 w-4 text-magenta" />
                <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">Tactical Combo Map</h2>
              </div>
              <p className="mb-4 text-sm text-steel">Green = solid defense (hard to triple). Red = vulnerable. Each cell shows HR, sample size, and average stars. All combos in the data are shown here regardless of sample size.</p>
              <div className="overflow-x-auto">
                <table className="w-full border-separate border-spacing-2 text-sm">
                  <thead>
                    <tr>
                      <th className="text-left font-mono text-[11px] uppercase tracking-wider text-steel">Base Style</th>
                      {heatmap.spellList.map((s) => <th key={s} className="text-center font-mono text-[11px] uppercase tracking-wider text-steel">{titleSafe(s)}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {heatmap.baseList.map((b) => (
                      <tr key={b}>
                        <td className="whitespace-nowrap font-display font-semibold text-ink">{titleSafe(b)}</td>
                        {heatmap.spellList.map((s) => {
                          const c = heatmap.lookup.get(`${b}|||${s}`)
                          return (
                            <td key={s} className={`rounded-lg border p-3 text-center ${getCellClass(c?.hr)}`}>
                              {c ? (
                                <>
                                  <div className="font-mono text-lg font-bold">{c.hr}%</div>
                                  <div className="text-[10px] opacity-70">n={c.attacks} · {c.avg_stars}⭐</div>
                                </>
                              ) : '—'}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 flex items-center gap-1.5 font-mono text-[11px] text-steel">
                <AlertTriangle className="h-3 w-3" /> Low sample sizes (small n) are less statistically reliable — check n= before drawing conclusions.
              </p>
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="HR vs. Sample Size" subtitle="Spot combos with a high HR but an unreliable (low) sample. Includes all combos." data={combos} yKey="hr" xKey="attacks" xName="Attacks" scatter color="#0EC6E0" />
              <div>
                <ChartCard title="Lowest Average Stars Conceded" subtitle={`Lower average stars usually indicates better defensive value. Minimum ${predictorMinSample} attacks.`} data={rankingStars.slice(0, rankingStarsExp.count)} yKey="combo" xKey="avg_stars" xName="Avg Stars" color="#6B7488" />
                <ShowMoreControl visibleCount={rankingStarsExp.count} total={rankingStars.length} onExpand={rankingStarsExp.expand} />
              </div>
            </section>
            <section className="card p-5">
              <SectionLabel sub="Which base styles each attack type (ground/air) struggles most against, by hit rate.">Ground vs Air — by Base Style</SectionLabel>
              <DataTable title="" rows={groundAirByBase.map(b => ({ base: titleSafe(b.base), ground_hr: `${b.ground.hr}% (n=${b.ground.attacks})`, air_hr: `${b.air.hr}% (n=${b.air.attacks})` }))} columns={[['base','Base Style'],['ground_hr','Ground HR'],['air_hr','Air HR']]} />
            </section>
            <div>
              <DataTable
                title="Full Combo Ranking (all sample sizes)"
                rows={rankingAll.slice(0, comboTableExp.count)}
                columns={[['combo','Combo'],['attacks','Attacks'],['triples','Triples'],['hr','HR %'],['avg_stars','Avg ⭐'],['avg_percent','Avg %']]}
              />
              <ShowMoreControl visibleCount={comboTableExp.count} total={rankingAll.length} onExpand={comboTableExp.expand} />
            </div>
          </>
        )}

        {page === 'teams' && (
          <>
            <section className="card p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <select className="input md:col-span-2" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                  <option value="all">Select a team to scout</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <button className="btn-ghost" onClick={() => setTeamFilter('all')}>Clear team</button>
              </div>
            </section>

            {teamFilter === 'all' ? (
              <>
                <section className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <ChartCard title="Teams by Attack HR" subtitle="Best attacking teams under the current filters." data={attackTeamStats.slice(0, attackTeamExp.count)} yKey="team" xKey="hr" xName="HR %" color="#D8425C" showLabel />
                    <ShowMoreControl visibleCount={attackTeamExp.count} total={attackTeamStats.length} onExpand={attackTeamExp.expand} />
                  </div>
                  <div className="card p-5">
                    <SectionLabel sub="Each team's hit rate when attacking on the ground vs in the air.">Ground vs Air — by Team</SectionLabel>
                    <div className="max-h-[420px] overflow-auto">
                      <DataTable title="" rows={groundAirByTeam.slice(0, groundAirTeamExp.count).map(t => ({ team: t.team, ground_hr: `${t.ground.hr}% (n=${t.ground.attacks})`, air_hr: `${t.air.hr}% (n=${t.air.attacks})`, mismatch: `${t.mismatch.toFixed(1)} pts` }))} columns={[['team','Team'],['ground_hr','Ground HR'],['air_hr','Air HR'],['mismatch','Mismatch']]} />
                    </div>
                    <ShowMoreControl visibleCount={groundAirTeamExp.count} total={groundAirByTeam.length} onExpand={groundAirTeamExp.expand} />
                  </div>
                </section>
                <DataTable title="Attack Ranking by Team" rows={attackTeamStats} columns={[["team","Team"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
              </>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  <InsightCard label="Attacks Analyzed" value={teamAttackRows.length} sub="Attacks made by this team" />
                  <InsightCard tone="brand" label="Attack HR" value={pct(teamAttackRows.length ? teamAttackRows.filter(r => Number(r.stars) === 3).length / teamAttackRows.length * 100 : 0)} sub="Triple rate while attacking" />
                  <InsightCard label="Avg ⭐" value={(teamAttackRows.length ? teamAttackRows.reduce((s,r)=>s+Number(r.stars||0),0)/teamAttackRows.length : 0).toFixed(2)} sub="Average while attacking" />
                  <InsightCard label="Defense (summary)" value={`${teamDefenseSummary.hr}% HR conceded`} sub={`${teamDefenseSummary.attacks} defenses · ${teamDefenseSummary.avgStars} avg ⭐ conceded`} />
                </section>

                {/* --- Matchup Predictor --- */}
                <section className="card card-edge relative overflow-hidden p-6">
                  <div className="tactical-grid pointer-events-none absolute inset-0 opacity-30" />
                  <div className="relative">
                    <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-magenta" />
                        <h2 className="font-display text-xl font-semibold uppercase tracking-wide text-ink">Matchup Predictor</h2>
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="font-mono text-[11px] uppercase tracking-wider text-steel">Min. sample</label>
                        <select className="input !py-1.5 !text-xs" value={predictorMinSample} onChange={(e) => setPredictorMinSample(Number(e.target.value))}>
                          {[5, 10, 15, 20, 30].map(n => <option key={n} value={n}>{n}+ attacks</option>)}
                        </select>
                      </div>
                    </div>
                    <p className="mb-5 text-sm text-steel">Automatically reads {teamFilter}'s own attacking history and surfaces the base design they struggle the most to triple, plus the two armies they use most often — and most successfully — against it.</p>

                    {matchupPrediction?.insufficientData ? (
                      <div className="flex items-center gap-2 rounded-lg border border-line bg-soft/60 p-4 text-sm text-steel">
                        <AlertTriangle className="h-4 w-4 text-magenta" /> Not enough data yet — no base + tower combo has {predictorMinSample}+ recorded attacks BY {teamFilter}. Try lowering the minimum sample, or wait for more scouted attacks.
                      </div>
                    ) : matchupPrediction?.worstBase ? (
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="rounded-xl border border-danger/25 bg-danger/[0.05] p-5">
                          <p className="label-eyebrow flex items-center gap-1.5 text-danger"><TrendingDown className="h-3.5 w-3.5" /> Hardest Design for {teamFilter} to Triple</p>
                          <p className="mt-2 font-display text-2xl font-semibold text-ink">{matchupPrediction.worstBase.profile}</p>
                          <p className="mt-2 font-mono text-sm text-danger">{matchupPrediction.worstBase.hr}% HR attacking · n={matchupPrediction.worstBase.attacks}</p>
                          <p className="mt-3 text-xs text-steel">Of all designs {teamFilter} has attacked enough times to be confident about, this is the one they triple the least often.</p>
                        </div>
                        {matchupPrediction.strategies.length > 0 ? matchupPrediction.strategies.map((s: any, i: number) => (
                          <div key={i} className="rounded-xl border border-cyan/25 bg-cyan/[0.05] p-5">
                            <p className="label-eyebrow flex items-center gap-1.5 text-cyan"><Crown className="h-3.5 w-3.5" /> {teamFilter}'s Strategy {i + 1} vs This Design</p>
                            <p className="mt-2 font-display text-2xl font-semibold text-ink">{titleSafe(s.army)}</p>
                            <p className="mt-2 font-mono text-sm text-cyan">{s.hr}% HR · used {s.attacks}x by {teamFilter} against this design</p>
                            <p className="mt-3 text-xs text-steel">Among armies {teamFilter} has tried against their weakest matchup, this one combines proven usage with their strongest hit rate.</p>
                          </div>
                        )) : (
                          <div className="lg:col-span-2 flex items-center gap-2 rounded-lg border border-line bg-soft/60 p-4 text-sm text-steel">
                            <AlertTriangle className="h-4 w-4 text-magenta" /> This is {teamFilter}'s hardest design to triple, but no single army has been tried against it at least twice by them yet — not enough to recommend a specific strategy.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="card p-5">
                  <SectionLabel sub={`${teamFilter}'s hit rate when attacking on the ground vs in the air.`}>{`${teamFilter} · Ground vs Air`}</SectionLabel>
                  {(() => {
                    const split = groundAirSplit(teamAttackRows)
                    return (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-ground/25 bg-ground/[0.05] p-4">
                          <p className="chip-ground mb-2"><Mountain className="h-3 w-3" /> Ground</p>
                          <p className="font-display text-3xl font-semibold text-ink">{split.ground.hr}%</p>
                          <p className="mt-1 text-xs text-steel">HR · {split.ground.attacks} attacks · {split.ground.avg_stars} avg ⭐</p>
                        </div>
                        <div className="rounded-lg border border-air/25 bg-air/[0.05] p-4">
                          <p className="chip-air mb-2"><Wind className="h-3 w-3" /> Air</p>
                          <p className="font-display text-3xl font-semibold text-ink">{split.air.hr}%</p>
                          <p className="mt-1 text-xs text-steel">HR · {split.air.attacks} attacks · {split.air.avg_stars} avg ⭐</p>
                        </div>
                      </div>
                    )
                  })()}
                </section>

                <section className="card p-5 border-danger/20">
                  <SectionLabel sub="Ranked by their own HR while attacking — the lower the HR, the more this base style gives them trouble.">{`Base styles that give ${teamFilter} the most trouble (attacking)`}</SectionLabel>
                  <DataTable title="" rows={[...teamBaseProfile].sort((a,b) => a.hr - b.hr)} columns={[["profile","Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${teamFilter} · Armies Used`} rows={teamArmyProfile} columns={[["profile","Army"],["attacks","Uses"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${teamFilter} · Army vs Base Style`} rows={teamArmyBaseProfile} columns={[["profile","Army + Base"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <DataTable title={`${teamFilter} · Full Combinations`} rows={teamFullProfile} columns={[["profile","Army + Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                <DataTable title={`${teamFilter} · Recent Attacks and Defenses`} rows={selectedTeamRows.slice(0, 150)} columns={[["date","Date"],["attacker_name","Attacker"],["attacker_team","Atk Team"],["army","Army"],["stars","⭐"],["percent","%"],["base_style","Base"],["spell_tower","Tower"],["defender_name","Defender"],["defender_team","Def Team"],["competition","Competition"]]} />
              </>
            )}
          </>
        )}

        {page === 'players' && (
          <>
            <section className="card p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <select className="input md:col-span-2" value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}>
                  <option value="all">Select a player to scout</option>
                  {players.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <button className="btn-ghost" onClick={() => setPlayerFilter('all')}>Clear player</button>
              </div>
            </section>

            {playerFilter === 'all' ? (
              <>
                <div>
                  <ChartCard title="Attackers by HR" subtitle="Best attackers under the current filters." data={playerAttackStats.slice(0, playerAttackExp.count)} yKey="player" xKey="hr" xName="HR %" color="#D8425C" showLabel />
                  <ShowMoreControl visibleCount={playerAttackExp.count} total={playerAttackStats.length} onExpand={playerAttackExp.expand} />
                </div>
                <DataTable title="Attack Ranking by Player" rows={playerAttackStats} columns={[["player","Player"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
              </>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-3">
                  <InsightCard label="Attacks Analyzed" value={playerAttackRows.length} sub="Attacks made by this player" />
                  <InsightCard tone="brand" label="Attack HR" value={pct(playerAttackRows.length ? playerAttackRows.filter(r => Number(r.stars) === 3).length / playerAttackRows.length * 100 : 0)} sub="Triple rate while attacking" />
                  <InsightCard label="Avg ⭐" value={(playerAttackRows.length ? playerAttackRows.reduce((s,r)=>s+Number(r.stars||0),0)/playerAttackRows.length : 0).toFixed(2)} sub="Average while attacking" />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${playerFilter} · Armies Used`} rows={playerArmyProfile} columns={[["profile","Army"],["attacks","Uses"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${playerFilter} · Bases Attacked`} rows={playerBaseProfile} columns={[["profile","Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${playerFilter} · Army vs Base Style`} rows={playerArmyBaseProfile} columns={[["profile","Army + Base"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${playerFilter} · Full Combinations`} rows={playerFullProfile} columns={[["profile","Army + Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <DataTable title={`${playerFilter} · Recent History`} rows={selectedPlayerRows.slice(0, 150)} columns={[["date","Date"],["attacker_name","Attacker"],["attacker_team","Atk Team"],["army","Army"],["stars","⭐"],["percent","%"],["base_style","Base"],["spell_tower","Tower"],["defender_name","Defender"],["defender_team","Def Team"],["competition","Competition"]]} />
              </>
            )}
          </>
        )}

        {page === 'matches' && (
          <>
            <section className="card p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select className="input" value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}>
                  <option value="all">Select a match</option>
                  {matches.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn-ghost" onClick={() => setMatchFilter('all')}>Clear match</button>
              </div>
            </section>
            <DataTable title="Match Attacks" rows={selectedMatchRows} columns={[['attack_order','Order'],['attacker_name','Attacker'],['attacker_team','Atk Team'],['army','Army'],['stars','⭐'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def Team'],['competition','Competition'],['date','Date']]} />
          </>
        )}

        {page === 'data' && (
          <>
            <section className="grid gap-4 md:grid-cols-3">
              <InsightCard label="Database Status" value={`${rows.length} rows stored`} sub="Current rows in Supabase" />
              <InsightCard label="Currently Filtered Rows" value={total} sub="After applying global filters" />
              <InsightCard label="Import Behavior" value="Replace mode" sub="Updating the Excel deletes existing rows first" />
            </section>
            <section className="card p-5">
              <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide text-ink">
                <Lock className="h-4 w-4 text-magenta" /> Data Management
              </h2>
              <p className="mb-4 text-sm text-steel">
                Use this only when you want to replace the entire database with a new Excel export. Teammates only need the public link to see the latest saved data.
              </p>
              <label className="btn-danger inline-flex cursor-pointer items-center gap-2">
                <Upload className="h-4 w-4" />{uploading ? 'Updating database...' : 'Replace Database with Excel'}
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
              </label>
            </section>
            <DataTable title="Raw Data Preview" rows={filtered.slice(0, 300)} columns={[['date','Date'],['attacker_name','Attacker'],['attacker_tag','Atk Tag'],['attacker_team','Atk Team'],['army','Army'],['stars','⭐'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def Team'],['competition','Competition'],['match_id','Match ID']]} />
          </>
        )}
      </div>
    </main>
  )
}

function ChartCard({ title, subtitle, data, yKey, xKey, xName, scatter = false, color = '#0EC6E0', showLabel = false }: any) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">{title}</h2>
      <p className="mb-4 text-sm text-steel">{subtitle}</p>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          {scatter ? (
            <ScatterChart margin={{ left: 15, right: 30, top: 15, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" />
              <XAxis dataKey={xKey} name={xName} stroke="#6B7488" />
              <YAxis dataKey={yKey} name={yKey} stroke="#6B7488" />
              <ZAxis range={[80, 180]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Scatter data={data} name="Combos" fill={color} />
            </ScatterChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ left: 85, right: showLabel ? 60 : 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E6ED" />
              <XAxis type="number" stroke="#6B7488" />
              <YAxis dataKey={yKey} type="category" stroke="#6B7488" width={155} tickFormatter={(v: any) => String(v).length > 22 ? String(v).slice(0, 22) + '…' : String(v)} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(14,198,224,0.06)' }} formatter={(v: any, n: any, p: any) => [`${v}%${p?.payload?.attacks !== undefined ? ` (n=${p.payload.attacks})` : ''}`, xName]} />
              <Bar dataKey={xKey} name={xName} fill={color} radius={[0, 6, 6, 0]}>
                {showLabel && <LabelList dataKey={xKey} position="right" formatter={(v: any) => `${v}%`} fill="#131720" fontFamily="var(--font-mono)" fontSize={11} />}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function DataTable({ title, rows, columns }: { title: string; rows: any[]; columns: [string, string][] }) {
  return (
    <section className="card overflow-hidden p-5">
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-ink">{title}</h2>
            <p className="font-mono text-xs text-steel">{rows.length} rows</p>
          </div>
          <Table2 className="h-4 w-4 text-magenta" />
        </div>
      ) : null}
      <div className="max-h-[520px] overflow-auto rounded-lg border border-line">
        <table className="table w-full">
          <thead className="sticky top-0 bg-soft">
            <tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>{columns.map(([key]) => <td key={key}>{String(r[key] ?? '')}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
