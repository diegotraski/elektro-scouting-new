'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Attack } from '@/lib/types'
import { comboStats, filteredAttacks, title } from '@/lib/analytics'
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
} from 'recharts'
import {
  Upload,
  Trophy,
  Shield,
  Target,
  Database,
  CalendarDays,
  Users,
  Swords,
  Percent,
  RefreshCw,
  Search,
  Table2,
  Lock,
  Crosshair,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import * as XLSX from 'xlsx'

const PALETTE = ['#E8A33D', '#3FA66E', '#E2493C', '#7C8AA0', '#C9844A', '#5FB8D6', '#A86CD9', '#D6C24A']
const PAGE_SIZE_STEPS = [5, 10, 20, Infinity]

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

/** Renders a hit-rate value together with its sample size, so reliability context is always visible at a glance. */
function HRWithSample({ hr, n }: { hr: number; n: number }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="font-mono font-semibold">{hr}%</span>
      <span className="font-mono text-[11px] text-steel">n={n}</span>
    </span>
  )
}

function StarRating({ value, max = 3 }: { value: number; max?: number }) {
  const rounded = Math.round(value)
  return (
    <span className="font-mono text-gold" aria-label={`${value} stars`}>
      {Array.from({ length: max }).map((_, i) => (
        <span key={i} className="star-pip">{i < rounded ? '★' : '☆'}</span>
      ))}
    </span>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="label-eyebrow mb-3">{children}</p>
}

function StatCard({ label, value, sub, icon: Icon, tone = 'gold' }: any) {
  const toneClass: Record<string, string> = {
    gold: 'bg-gold/10 text-gold',
    crimson: 'bg-crimson/10 text-crimson',
    forest: 'bg-forest/10 text-forest',
    steel: 'bg-steel/10 text-steel',
  }
  return (
    <div className="card card-edge group relative overflow-hidden p-5 transition hover:border-gold/30">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="label-eyebrow">{label}</p>
          <p className="mt-2 font-display text-4xl font-semibold tracking-tight text-white">{value}</p>
          {sub ? <p className="mt-1.5 text-xs text-steel">{sub}</p> : null}
        </div>
        <div className={`rounded-lg p-2.5 ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  )
}

function InsightCard({ label, value, sub, accent = false }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-4 ${accent ? 'border-gold/30 bg-gold/[0.06]' : 'border-line bg-soft/60'}`}>
      <p className="label-eyebrow">{label}</p>
      <p className="mt-2 truncate font-display text-lg font-semibold text-white" title={String(value)}>{value}</p>
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
          ? 'bg-gold text-[#11151D] shadow-[0_0_0_1px_rgba(232,163,61,0.4)]'
          : 'border border-line bg-soft text-steel hover:border-steel/40 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

/** Shared tooltip style for Recharts so text stays legible (light text) on the dark panel background. */
const tooltipStyle = {
  background: '#11151D',
  border: '1px solid #262C38',
  color: '#EDEEF2',
  borderRadius: 8,
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
}
const tooltipLabelStyle = { color: '#EDEEF2' }
const tooltipItemStyle = { color: '#EDEEF2' }

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
  if (value === null || value === undefined || Number.isNaN(value)) return 'bg-soft/40 text-steel border-line'
  if (value < 35) return 'bg-forest/20 text-forest border-forest/30'
  if (value < 60) return 'bg-gold/20 text-gold border-gold/30'
  return 'bg-crimson/20 text-crimson border-crimson/30'
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

function Distribution({ rows }: { rows: any[] }) {
  return (
    <div className="h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" outerRadius={88} innerRadius={50} paddingAngle={2} stroke="#080A0F" strokeWidth={2}>
            {rows.map((_, idx) => <Cell key={idx} fill={PALETTE[idx % PALETTE.length]} />)}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#EDEEF2' }} />
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
  const triples = filtered.filter((r) => Number(r.stars) === 3).length
  const hr = total ? +(triples / total * 100).toFixed(1) : 0
  const avgStars = total ? +(filtered.reduce((s, r) => s + Number(r.stars || 0), 0) / total).toFixed(2) : 0
  const avgPercent = total ? +(filtered.reduce((s, r) => s + Number(r.percent || 0), 0) / total).toFixed(1) : 0
  const uniqueTeams = new Set(filtered.flatMap((r) => [r.attacker_team, r.defender_team]).filter(Boolean)).size
  const uniquePlayers = new Set(filtered.flatMap((r) => [r.attacker_tag, r.defender_tag]).filter(Boolean)).size

  // No hard minimum-sample cutoff: every combo/team/player that appears in the
  // filtered data shows up. Sample size (n=) is always shown next to HR so low-sample
  // rows are visible but clearly flagged, instead of being silently hidden.
  const combos = useMemo(() => comboStats(filtered, 0), [filtered])
  const rankingHR = useMemo(() => [...combos].sort((a, b) => b.hr - a.hr), [combos])
  const rankingReliableDefense = useMemo(() => [...combos].sort((a, b) => a.hr - b.hr), [combos])
  const rankingStars = useMemo(() => [...combos].sort((a, b) => a.avg_stars - b.avg_stars), [combos])

  const attackTeamStats = useMemo(() => makeGroup(filtered, (r) => r.attacker_team || '', 'team').sort((a, b) => b.hr - a.hr), [filtered])
  const defenseTeamStats = useMemo(() => makeGroup(filtered, (r) => r.defender_team || '', 'team').sort((a, b) => a.hr - b.hr), [filtered])
  const playerAttackStats = useMemo(() => makeGroup(filtered, (r) => r.attacker_name || '', 'player').sort((a, b) => b.hr - a.hr), [filtered])
  const playerDefenseStats = useMemo(() => makeGroup(filtered, (r) => r.defender_name || '', 'player').sort((a, b) => a.hr - b.hr), [filtered])
  const armyStats = useMemo(() => makeGroup(filtered, (r) => r.army || '', 'army').sort((a, b) => b.attacks - a.attacks), [filtered])
  const baseStats = useMemo(() => makeGroup(filtered, (r) => r.base_style || '', 'base').sort((a, b) => a.hr - b.hr), [filtered])
  const spellStats = useMemo(() => makeGroup(filtered, (r) => r.spell_tower || '', 'spell').sort((a, b) => a.hr - b.hr), [filtered])

  const heatmap = useMemo(() => {
    const baseList = Array.from(new Set(combos.map((c) => c.base_style))).sort()
    const spellList = Array.from(new Set(combos.map((c) => c.spell_tower))).sort()
    const lookup = new Map(combos.map((c) => [`${c.base_style}|||${c.spell_tower}`, c]))
    return { baseList, spellList, lookup }
  }, [combos])

  const selectedTeamRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_team === teamFilter || r.defender_team === teamFilter)
  const selectedPlayerRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_name === playerFilter || r.defender_name === playerFilter)
  const selectedMatchRows = matchFilter === 'all' ? filtered.slice(0, 50) : filtered.filter((r) => r.match_id === matchFilter || r.link === matchFilter)

  const teamAttackRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_team === teamFilter)
  const teamDefenseRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.defender_team === teamFilter)
  const playerAttackRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_name === playerFilter)
  const playerDefenseRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.defender_name === playerFilter)

  // Team scouting: what they attack with, what base styles give them trouble, and what they attack those bases with.
  const teamArmyProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamBaseProfile = useMemo(() => makeComboGroup(teamAttackRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamArmyBaseProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  const teamFullProfile = useMemo(() => makeComboGroup(teamAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamAttackRows])
  // Defensive base styles that most often beat this team (highest HR conceded = base styles that give them trouble).
  const teamDefenseProfile = useMemo(() => makeComboGroup(teamDefenseRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.hr - a.hr), [teamDefenseRows])
  const teamReceivedArmies = useMemo(() => makeComboGroup(teamDefenseRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [teamDefenseRows])
  // For each base style this team struggles with, which armies are typically used against them.
  const teamWeakBaseToArmy = useMemo(() => {
    const struggleBases = new Set(teamDefenseProfile.filter(b => b.attacks >= 2).slice(0, 5).map(b => b.base_style))
    const rowsAgainstWeakBases = teamDefenseRows.filter(r => struggleBases.has(r.base_style || ''))
    return makeComboGroup(rowsAgainstWeakBases, [['base_style', r => r.base_style || ''], ['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks)
  }, [teamDefenseRows, teamDefenseProfile])

  const playerArmyProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerBaseProfile = useMemo(() => makeComboGroup(playerAttackRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerArmyBaseProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerFullProfile = useMemo(() => makeComboGroup(playerAttackRows, [['army', r => r.army || ''], ['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerAttackRows])
  const playerDefenseProfile = useMemo(() => makeComboGroup(playerDefenseRows, [['base_style', r => r.base_style || ''], ['spell_tower', r => r.spell_tower || '']], 'profile').sort((a,b) => b.hr - a.hr), [playerDefenseRows])
  const playerReceivedArmies = useMemo(() => makeComboGroup(playerDefenseRows, [['army', r => r.army || '']], 'profile').sort((a,b) => b.attacks - a.attacks), [playerDefenseRows])

  const starDistribution = useMemo(() => [1, 2, 3].map((s) => ({ name: `${s} Star`, value: filtered.filter((r) => Number(r.stars) === s).length })).filter(x => x.value > 0), [filtered])
  const baseDistribution = useMemo(() => baseStats.slice().sort((a,b)=>b.attacks-a.attacks).slice(0, 8).map((x) => ({ name: titleSafe(x.base), value: x.attacks })), [baseStats])
  const spellDistribution = useMemo(() => spellStats.slice().sort((a,b)=>b.attacks-a.attacks).slice(0, 8).map((x) => ({ name: titleSafe(x.spell), value: x.attacks })), [spellStats])

  // Meta evolution over time: monthly hit rate trend across the whole filtered dataset.
  const metaTrend = useMemo(() => {
    const byMonth = new Map<string, Attack[]>()
    filtered.forEach(r => {
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
  }, [filtered])

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
  const defenseTeamExp = useExpandable(defenseTeamStats.length)
  const playerAttackExp = useExpandable(playerAttackStats.length)
  const playerDefenseExp = useExpandable(playerDefenseStats.length)
  const comboTableExp = useExpandable(rankingReliableDefense.length)

  return (
    <main className="min-h-screen bg-bg p-4 text-slate-100 md:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="relative overflow-hidden rounded-xl border border-line bg-panel/80 p-6 md:p-8">
          <div className="tactical-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="label-eyebrow flex items-center gap-2 text-gold">
                <Crosshair className="h-3.5 w-3.5" /> Team Elektros · Scouting Report
              </p>
              <h1 className="mt-2 font-display text-4xl font-semibold uppercase tracking-tight text-white md:text-5xl">
                Elektro <span className="text-gold">Scout</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-steel">
                Clash of Clans competitive intelligence: performance by team, player, army, and base style + spell tower combination.
              </p>
            </div>
            <div className="flex gap-2.5">
              <button className="btn-ghost flex items-center gap-2" onClick={loadData}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
              </button>
              <label className="btn flex cursor-pointer items-center gap-2">
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
            <CalendarDays className="h-4 w-4 text-gold" />
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
          <p className="mt-3 font-mono text-[11px] text-steel">Available range: {dateBounds.min || '—'} → {dateBounds.max || '—'}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Attacks" value={loading ? '...' : total} sub={`${uniqueTeams} teams · ${uniquePlayers} players`} icon={Database} tone="gold" />
          <StatCard label="Hit Rate (triples)" value={`${hr}%`} sub={`${triples} triples out of ${total} attacks`} icon={Target} tone="crimson" />
          <StatCard label="Avg Stars" value={avgStars} sub="Average stars earned" icon={Trophy} tone="gold" />
          <StatCard label="Avg Destruction" value={`${avgPercent}%`} sub="Average destruction %" icon={Percent} tone="forest" />
        </section>

        {page === 'overview' && (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <InsightCard
                accent
                label="Hardest Combo to Triple"
                value={rankingReliableDefense[0]?.combo || '-'}
                sub={rankingReliableDefense[0] ? `HR ${rankingReliableDefense[0].hr}% · n=${rankingReliableDefense[0].attacks}` : ''}
              />
              <InsightCard label="Lowest Avg Stars Conceded" value={rankingStars[0]?.combo || '-'} sub={rankingStars[0] ? `${rankingStars[0].avg_stars} ⭐ avg · n=${rankingStars[0].attacks}` : ''} />
              <InsightCard label="Most Used Army" value={armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0]?.army ? titleSafe(armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0].army) : '-'} sub={armyStats.length ? `${armyStats.slice().sort((a,b)=>b.attacks-a.attacks)[0].attacks} attacks` : ''} />
              <InsightCard label="Best Attacking Team" value={attackTeamStats[0]?.team || '-'} sub={attackTeamStats[0] ? `HR ${attackTeamStats[0].hr}% · n=${attackTeamStats[0].attacks}` : ''} />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <div>
                <ChartCard title="Most Vulnerable Combos (HR)" subtitle="Higher HR = easier to triple. Every combo in the filtered data is included." data={rankingHR.slice(0, rankingHRExp.count)} yKey="combo" xKey="hr" xName="HR %" color="#E2493C" />
                <ShowMoreControl visibleCount={rankingHRExp.count} total={rankingHR.length} onExpand={rankingHRExp.expand} />
              </div>
              <div>
                <ChartCard title="Most Reliable Defenses" subtitle="Sorted by lowest HR conceded across all sample sizes." data={rankingReliableDefense.slice(0, rankingDefExp.count)} yKey="combo" xKey="hr" xName="HR %" color="#3FA66E" />
                <ShowMoreControl visibleCount={rankingDefExp.count} total={rankingReliableDefense.length} onExpand={rankingDefExp.expand} />
              </div>
            </section>

            <section className="card p-5">
              <SectionLabel>Meta Evolution Over Time</SectionLabel>
              <p className="mb-4 -mt-2 text-sm text-steel">Monthly hit rate trend across all attacks in the filtered dataset.</p>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metaTrend} margin={{ left: 5, right: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E2530" />
                    <XAxis dataKey="month" stroke="#7C8AA0" />
                    <YAxis stroke="#7C8AA0" />
                    <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                    <Bar dataKey="hr" name="HR %" fill="#E8A33D" radius={[6, 6, 0, 0]} />
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
                <Shield className="h-4 w-4 text-gold" />
                <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">Tactical Combo Map</h2>
              </div>
              <p className="mb-4 text-sm text-steel">Green = solid defense (hard to triple). Red = vulnerable. Each cell shows HR, sample size, and average stars.</p>
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
                        <td className="whitespace-nowrap font-display font-semibold text-white">{titleSafe(b)}</td>
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
                <AlertTriangle className="h-3 w-3" /> All combos in the filtered data are shown. Low sample sizes (small n) are less statistically reliable — check n= before drawing conclusions.
              </p>
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="HR vs. Sample Size" subtitle="Spot combos with a high HR but an unreliable (low) sample." data={combos} yKey="hr" xKey="attacks" xName="Attacks" scatter color="#E8A33D" />
              <div>
                <ChartCard title="Lowest Average Stars Conceded" subtitle="Lower average stars usually indicates better defensive value." data={rankingStars.slice(0, rankingStarsExp.count)} yKey="combo" xKey="avg_stars" xName="Avg Stars" color="#7C8AA0" />
                <ShowMoreControl visibleCount={rankingStarsExp.count} total={rankingStars.length} onExpand={rankingStarsExp.expand} />
              </div>
            </section>
            <div>
              <DataTable
                title="Full Combo Ranking"
                rows={rankingReliableDefense.slice(0, comboTableExp.count)}
                columns={[['combo','Combo'],['attacks','Attacks'],['triples','Triples'],['hr','HR %'],['avg_stars','Avg ⭐'],['avg_percent','Avg %']]}
              />
              <ShowMoreControl visibleCount={comboTableExp.count} total={rankingReliableDefense.length} onExpand={comboTableExp.expand} />
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
                    <ChartCard title="Teams by Attack HR" subtitle="Best attacking teams under the current filters." data={attackTeamStats.slice(0, attackTeamExp.count)} yKey="team" xKey="hr" xName="HR %" color="#E2493C" />
                    <ShowMoreControl visibleCount={attackTeamExp.count} total={attackTeamStats.length} onExpand={attackTeamExp.expand} />
                  </div>
                  <div>
                    <ChartCard title="Teams by Defensive Reliability" subtitle="Sorted by lowest HR conceded." data={defenseTeamStats.slice(0, defenseTeamExp.count)} yKey="team" xKey="hr" xName="HR %" color="#3FA66E" />
                    <ShowMoreControl visibleCount={defenseTeamExp.count} total={defenseTeamStats.length} onExpand={defenseTeamExp.expand} />
                  </div>
                </section>
                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title="Attack Ranking by Team" rows={attackTeamStats} columns={[["team","Team"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title="Defense Ranking by Team" rows={defenseTeamStats} columns={[["team","Team"],["attacks","Defenses"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"],["avg_percent","Avg % Conceded"]]} />
                </section>
              </>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  <InsightCard label="Attacks Analyzed" value={teamAttackRows.length} sub="Attacks made by this team" />
                  <InsightCard label="Attack HR" value={pct(teamAttackRows.length ? teamAttackRows.filter(r => Number(r.stars) === 3).length / teamAttackRows.length * 100 : 0)} sub="Triple rate while attacking" />
                  <InsightCard label="Avg ⭐" value={(teamAttackRows.length ? teamAttackRows.reduce((s,r)=>s+Number(r.stars||0),0)/teamAttackRows.length : 0).toFixed(2)} sub="Average while attacking" />
                  <InsightCard label="Defenses Analyzed" value={teamDefenseRows.length} sub="Attacks received by this team" />
                </section>

                <section className="card p-5 border-crimson/20">
                  <SectionLabel>Base styles that give {teamFilter} the most trouble</SectionLabel>
                  <p className="mb-4 -mt-2 text-sm text-steel">Ranked by HR conceded — the higher the HR, the more often this team gets tripled against that base + spell tower combo.</p>
                  <DataTable title="" rows={teamDefenseProfile} columns={[["profile","Base + Tower"],["attacks","Defenses"],["triples","Triples Conceded"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"]]} />
                </section>

                <section className="card p-5 border-gold/20">
                  <SectionLabel>Armies typically used against {teamFilter}'s weakest bases</SectionLabel>
                  <p className="mb-4 -mt-2 text-sm text-steel">For the top base styles this team struggles with, these are the armies opponents use against them.</p>
                  <DataTable title="" rows={teamWeakBaseToArmy} columns={[["profile","Base + Army Used"],["attacks","Times Used"],["triples","Triples"],["hr","HR %"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${teamFilter} · Armies Used`} rows={teamArmyProfile} columns={[["profile","Army"],["attacks","Uses"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${teamFilter} · Bases Attacked`} rows={teamBaseProfile} columns={[["profile","Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${teamFilter} · Army vs Base Style`} rows={teamArmyBaseProfile} columns={[["profile","Army + Base"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${teamFilter} · Full Combinations`} rows={teamFullProfile} columns={[["profile","Army + Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <DataTable title={`${teamFilter} · Armies Received on Defense`} rows={teamReceivedArmies} columns={[["profile","Opponent Army"],["attacks","Times Received"],["triples","Triples Conceded"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"]]} />
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
                <section className="grid gap-6 lg:grid-cols-2">
                  <div>
                    <ChartCard title="Attackers by HR" subtitle="Best attackers under the current filters." data={playerAttackStats.slice(0, playerAttackExp.count)} yKey="player" xKey="hr" xName="HR %" color="#E2493C" />
                    <ShowMoreControl visibleCount={playerAttackExp.count} total={playerAttackStats.length} onExpand={playerAttackExp.expand} />
                  </div>
                  <div>
                    <ChartCard title="Hardest Players to Triple" subtitle="Sorted by lowest HR conceded on defense." data={playerDefenseStats.slice(0, playerDefenseExp.count)} yKey="player" xKey="hr" xName="HR %" color="#3FA66E" />
                    <ShowMoreControl visibleCount={playerDefenseExp.count} total={playerDefenseStats.length} onExpand={playerDefenseExp.expand} />
                  </div>
                </section>
                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title="Attack Ranking by Player" rows={playerAttackStats} columns={[["player","Player"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title="Defense Ranking by Player" rows={playerDefenseStats} columns={[["player","Player"],["attacks","Defenses"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"],["avg_percent","Avg % Conceded"]]} />
                </section>
              </>
            ) : (
              <>
                <section className="grid gap-4 md:grid-cols-4">
                  <InsightCard label="Attacks Analyzed" value={playerAttackRows.length} sub="Attacks made by this player" />
                  <InsightCard label="Attack HR" value={pct(playerAttackRows.length ? playerAttackRows.filter(r => Number(r.stars) === 3).length / playerAttackRows.length * 100 : 0)} sub="Triple rate while attacking" />
                  <InsightCard label="Avg ⭐" value={(playerAttackRows.length ? playerAttackRows.reduce((s,r)=>s+Number(r.stars||0),0)/playerAttackRows.length : 0).toFixed(2)} sub="Average while attacking" />
                  <InsightCard label="Defenses Analyzed" value={playerDefenseRows.length} sub="Attacks received by this player" />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${playerFilter} · Armies Used`} rows={playerArmyProfile} columns={[["profile","Army"],["attacks","Uses"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${playerFilter} · Bases Attacked`} rows={playerBaseProfile} columns={[["profile","Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${playerFilter} · Army vs Base Style`} rows={playerArmyBaseProfile} columns={[["profile","Army + Base"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                  <DataTable title={`${playerFilter} · Full Combinations`} rows={playerFullProfile} columns={[["profile","Army + Base + Tower"],["attacks","Attacks"],["triples","Triples"],["hr","HR %"],["avg_stars","Avg ⭐"],["avg_percent","Avg %"]]} />
                </section>

                <section className="grid gap-6 lg:grid-cols-2">
                  <DataTable title={`${playerFilter} · Defensive Base Profile`} rows={playerDefenseProfile} columns={[["profile","Base + Tower"],["attacks","Defenses"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"]]} />
                  <DataTable title={`${playerFilter} · Armies Received`} rows={playerReceivedArmies} columns={[["profile","Opponent Army"],["attacks","Times Received"],["triples","Triples Conceded"],["hr","HR Conceded %"],["avg_stars","Avg ⭐ Conceded"]]} />
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
              <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-wide text-white">
                <Lock className="h-4 w-4 text-gold" /> Data Management
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

function ChartCard({ title, subtitle, data, yKey, xKey, xName, scatter = false, color = '#E8A33D' }: any) {
  return (
    <div className="card p-5">
      <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">{title}</h2>
      <p className="mb-4 text-sm text-steel">{subtitle}</p>
      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          {scatter ? (
            <ScatterChart margin={{ left: 15, right: 30, top: 15, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2530" />
              <XAxis dataKey={xKey} name={xName} stroke="#7C8AA0" />
              <YAxis dataKey={yKey} name={yKey} stroke="#7C8AA0" />
              <ZAxis range={[80, 180]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
              <Scatter data={data} name="Combos" fill={color} />
            </ScatterChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ left: 85, right: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E2530" />
              <XAxis type="number" stroke="#7C8AA0" />
              <YAxis dataKey={yKey} type="category" stroke="#7C8AA0" width={155} tickFormatter={(v: any) => String(v).length > 22 ? String(v).slice(0, 22) + '…' : String(v)} />
              <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} cursor={{ fill: 'rgba(232,163,61,0.08)' }} />
              <Bar dataKey={xKey} name={xName} fill={color} radius={[0, 6, 6, 0]} />
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
            <h2 className="font-display text-lg font-semibold uppercase tracking-wide text-white">{title}</h2>
            <p className="font-mono text-xs text-steel">{rows.length} rows</p>
          </div>
          <Table2 className="h-4 w-4 text-gold" />
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
