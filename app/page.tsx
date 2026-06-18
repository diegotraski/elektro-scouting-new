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
  Flame,
  Table2,
  BarChart3,
  Lock,
} from 'lucide-react'
import * as XLSX from 'xlsx'

const MIN_ATTACKS = 5
const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#A855F7', '#EF4444', '#06B6D4', '#F97316', '#84CC16']

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

function StatCard({ label, value, sub, icon: Icon }: any) {
  return (
    <div className="card group p-5 transition hover:-translate-y-0.5 hover:border-accent/50">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className="rounded-2xl bg-accent/10 p-3 transition group-hover:bg-accent/20">
          <Icon className="h-7 w-7 text-accent" />
        </div>
      </div>
    </div>
  )
}

function InsightCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-soft/70 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-lg font-bold text-white">{value}</p>
      {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
    </div>
  )
}

function PageButton({ active, children, onClick }: any) {
  return (
    <button
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active ? 'bg-accent text-white shadow-lg shadow-accent/20' : 'border border-line bg-soft text-slate-300 hover:bg-white/10'
      }`}
    >
      {children}
    </button>
  )
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

function getCellClass(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'bg-slate-900/50 text-slate-500'
  if (value < 45) return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/20'
  if (value < 55) return 'bg-yellow-500/20 text-yellow-100 border-yellow-500/20'
  return 'bg-red-500/20 text-red-100 border-red-500/20'
}

function makeGroup<T>(rows: Attack[], keyFn: (r: Attack) => string, labelKey: string) {
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
      defensive_score: +((100 - (triples / Math.max(attacks, 1) * 100)) * Math.log10(attacks || 1)).toFixed(2),
    }
  }) as any[]
}

function Distribution({ rows, label }: { rows: any[]; label: string }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" outerRadius={92} innerRadius={48} paddingAngle={3}>
            {rows.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
          </Pie>
          <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D', color: '#fff' }} />
          <Legend />
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

  const combos = useMemo(() => comboStats(filtered, MIN_ATTACKS), [filtered])
  const rankingHR = useMemo(() => [...combos].sort((a, b) => b.hr - a.hr), [combos])
  const rankingDef = useMemo(() => [...combos].sort((a, b) => b.defensive_score - a.defensive_score), [combos])
  const rankingStars = useMemo(() => [...combos].sort((a, b) => a.avg_stars - b.avg_stars), [combos])

  const attackTeamStats = useMemo(() => makeGroup(filtered, (r) => r.attacker_team || '', 'team').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.hr - a.hr), [filtered])
  const defenseTeamStats = useMemo(() => makeGroup(filtered, (r) => r.defender_team || '', 'team').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.defensive_score - a.defensive_score), [filtered])
  const playerAttackStats = useMemo(() => makeGroup(filtered, (r) => r.attacker_name || '', 'player').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.hr - a.hr), [filtered])
  const playerDefenseStats = useMemo(() => makeGroup(filtered, (r) => r.defender_name || '', 'player').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.defensive_score - a.defensive_score), [filtered])
  const armyStats = useMemo(() => makeGroup(filtered, (r) => r.army || '', 'army').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.attacks - a.attacks), [filtered])
  const baseStats = useMemo(() => makeGroup(filtered, (r) => r.base_style || '', 'base').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.defensive_score - a.defensive_score), [filtered])
  const spellStats = useMemo(() => makeGroup(filtered, (r) => r.spell_tower || '', 'spell').filter(x => x.attacks >= MIN_ATTACKS).sort((a, b) => b.defensive_score - a.defensive_score), [filtered])

  const heatmap = useMemo(() => {
    const baseList = Array.from(new Set(combos.map((c) => c.base_style))).sort()
    const spellList = Array.from(new Set(combos.map((c) => c.spell_tower))).sort()
    const lookup = new Map(combos.map((c) => [`${c.base_style}|||${c.spell_tower}`, c]))
    return { baseList, spellList, lookup }
  }, [combos])

  const selectedTeamRows = teamFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_team === teamFilter || r.defender_team === teamFilter)
  const selectedPlayerRows = playerFilter === 'all' ? filtered : filtered.filter((r) => r.attacker_name === playerFilter || r.defender_name === playerFilter)
  const selectedMatchRows = matchFilter === 'all' ? filtered.slice(0, 50) : filtered.filter((r) => r.match_id === matchFilter || r.link === matchFilter)

  const starDistribution = useMemo(() => [1, 2, 3].map((s) => ({ name: `${s} star`, value: filtered.filter((r) => Number(r.stars) === s).length })).filter(x => x.value > 0), [filtered])
  const baseDistribution = useMemo(() => baseStats.slice(0, 8).map((x) => ({ name: titleSafe(x.base), value: x.attacks })), [baseStats])
  const spellDistribution = useMemo(() => spellStats.slice(0, 8).map((x) => ({ name: titleSafe(x.spell), value: x.attacks })), [spellStats])

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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#172554_0,#070A12_38%)] p-5 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-accent">Team Elektros</p>
            <h1 className="text-4xl font-black tracking-tight">Elektro Scout</h1>
            <p className="mt-2 max-w-2xl text-slate-400">Clean competitive Clash of Clans scouting dashboard for teams, players, armies, bases and spell tower combinations.</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-xl border border-line bg-soft px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" onClick={loadData}>
              <RefreshCw className="mr-2 inline h-4 w-4" /> Refresh
            </button>
            <label className="btn flex cursor-pointer items-center gap-2">
              <Upload className="h-4 w-4" />{uploading ? 'Updating...' : 'Update Excel'}
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </header>

        <nav className="flex flex-wrap gap-2">
          <PageButton active={page === 'overview'} onClick={() => setPage('overview')}>Overview</PageButton>
          <PageButton active={page === 'combos'} onClick={() => setPage('combos')}>Combo Matrix</PageButton>
          <PageButton active={page === 'teams'} onClick={() => setPage('teams')}>Teams</PageButton>
          <PageButton active={page === 'players'} onClick={() => setPage('players')}>Players</PageButton>
          <PageButton active={page === 'matches'} onClick={() => setPage('matches')}>Matches</PageButton>
          <PageButton active={page === 'data'} onClick={() => setPage('data')}>Data</PageButton>
        </nav>

        <section className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <CalendarDays className="h-4 w-4 text-accent" /> Global filters
          </div>
          <div className="grid gap-3 md:grid-cols-4 lg:grid-cols-8">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
              <input className="input pl-9" placeholder="Search player, team, army..." value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <select className="input" value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}><option value="all">All base styles</option>{bases.map((b) => <option key={b} value={b}>{titleSafe(b)}</option>)}</select>
            <select className="input" value={spellFilter} onChange={(e) => setSpellFilter(e.target.value)}><option value="all">All spell towers</option>{spells.map((s) => <option key={s} value={s}>{titleSafe(s)}</option>)}</select>
            <input className="input" type="date" value={dateFrom} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="input" type="date" value={dateTo} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDateTo(e.target.value)} />
            <select className="input" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}><option value="all">All teams</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <button className="input hover:bg-white/10" onClick={clearFilters}>Clear</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Available range: {dateBounds.min || '-'} → {dateBounds.max || '-'}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard label="Attacks" value={loading ? '...' : total} sub={`${uniqueTeams} teams · ${uniquePlayers} players`} icon={Database} />
          <StatCard label="Hit rate" value={`${hr}%`} sub={`${triples} triples / ${total} attacks`} icon={Target} />
          <StatCard label="Avg stars" value={avgStars} sub="Average stars conceded" icon={Trophy} />
          <StatCard label="Avg destruction" value={`${avgPercent}%`} sub="Average destruction" icon={Percent} />
        </section>

        {page === 'overview' && (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <InsightCard label="Best defensive combo" value={rankingDef[0]?.combo || '-'} sub={rankingDef[0] ? `${rankingDef[0].attacks} attacks · ${rankingDef[0].hr}% HR` : ''} />
              <InsightCard label="Lowest avg stars" value={rankingStars[0]?.combo || '-'} sub={rankingStars[0] ? `${rankingStars[0].avg_stars} avg stars` : ''} />
              <InsightCard label="Most used army" value={armyStats[0]?.army ? titleSafe(armyStats[0].army) : '-'} sub={armyStats[0] ? `${armyStats[0].attacks} attacks` : ''} />
              <InsightCard label="Best attacking team" value={attackTeamStats[0]?.team || '-'} sub={attackTeamStats[0] ? `${attackTeamStats[0].hr}% HR` : ''} />
            </section>

            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="Most vulnerable combos by HR" subtitle={`Higher = easier to triple. Minimum ${MIN_ATTACKS} attacks.`} data={rankingHR.slice(0, 12)} yKey="combo" xKey="hr" xName="HR %" />
              <ChartCard title="Best defensive combos" subtitle="Defensive score balances low HR and sample size." data={rankingDef.slice(0, 12)} yKey="combo" xKey="defensive_score" xName="Defensive score" />
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <div className="card p-5"><h2 className="text-xl font-bold">Stars distribution</h2><Distribution rows={starDistribution} label="Stars" /></div>
              <div className="card p-5"><h2 className="text-xl font-bold">Base style volume</h2><Distribution rows={baseDistribution} label="Base styles" /></div>
              <div className="card p-5"><h2 className="text-xl font-bold">Spell tower volume</h2><Distribution rows={spellDistribution} label="Spell towers" /></div>
            </section>
          </>
        )}

        {page === 'combos' && (
          <>
            <section className="card p-5">
              <h2 className="text-xl font-bold">HR heatmap</h2>
              <p className="mb-4 text-sm text-slate-400">Green = better defense. Red = worse defense. Each cell shows HR, sample and avg stars.</p>
              <div className="overflow-x-auto"><table className="w-full border-separate border-spacing-2 text-sm"><thead><tr><th className="text-left text-slate-400">Base style</th>{heatmap.spellList.map((s) => <th key={s} className="text-center text-slate-400">{titleSafe(s)}</th>)}</tr></thead><tbody>{heatmap.baseList.map((b) => <tr key={b}><td className="whitespace-nowrap font-semibold">{titleSafe(b)}</td>{heatmap.spellList.map((s) => { const c = heatmap.lookup.get(`${b}|||${s}`); return <td key={s} className={`rounded-xl border p-3 text-center ${getCellClass(c?.hr)}`}>{c ? <><div className="text-lg font-black">{c.hr}%</div><div className="text-xs opacity-70">{c.attacks} atk · {c.avg_stars}⭐</div></> : '-'}</td> })}</tr>)}</tbody></table></div>
            </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <ChartCard title="HR vs sample size" subtitle="Detect high HR combos with poor sample reliability." data={combos} yKey="hr" xKey="attacks" xName="Attacks" scatter />
              <ChartCard title="Lowest avg stars combos" subtitle="Lower avg stars usually means better defensive value." data={rankingStars.slice(0, 12)} yKey="combo" xKey="avg_stars" xName="Avg stars" />
            </section>
            <DataTable title="Full combo ranking" rows={rankingDef} columns={[['combo','Combo'],['attacks','Attacks'],['triples','Triples'],['hr','HR %'],['avg_stars','Avg stars'],['avg_percent','Avg %'],['defensive_score','Def score']]} />
          </>
        )}

        {page === 'teams' && (
          <>
            <section className="card p-4"><div className="grid gap-3 md:grid-cols-2"><select className="input" value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}><option value="all">Select a team</option>{teams.map((t) => <option key={t} value={t}>{t}</option>)}</select><button className="input hover:bg-white/10" onClick={() => setTeamFilter('all')}>Reset team</button></div></section>
            <section className="grid gap-6 lg:grid-cols-2"><ChartCard title="Teams by attacking HR" subtitle="Best attacking teams in current filters." data={attackTeamStats.slice(0, 15)} yKey="team" xKey="hr" xName="HR %" /><ChartCard title="Teams by defensive score" subtitle="Best defending teams in current filters." data={defenseTeamStats.slice(0, 15)} yKey="team" xKey="defensive_score" xName="Defensive score" /></section>
            <section className="grid gap-6 lg:grid-cols-2"><DataTable title="Team attack ranking" rows={attackTeamStats} columns={[['team','Team'],['attacks','Attacks'],['triples','Triples'],['hr','HR %'],['avg_stars','Avg stars'],['avg_percent','Avg %']]} /><DataTable title="Team defense ranking" rows={defenseTeamStats} columns={[['team','Team'],['attacks','Attacks defended'],['hr','HR conceded %'],['avg_stars','Avg stars conceded'],['avg_percent','Avg % conceded'],['defensive_score','Def score']]} /></section>
            {teamFilter !== 'all' && <DataTable title={`${teamFilter} - recent attacks and defenses`} rows={selectedTeamRows.slice(0, 100)} columns={[['date','Date'],['attacker_name','Attacker'],['attacker_team','Atk team'],['army','Army'],['stars','Stars'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def team'],['competition','Competition']]} />}
          </>
        )}

        {page === 'players' && (
          <>
            <section className="card p-4"><div className="grid gap-3 md:grid-cols-2"><select className="input" value={playerFilter} onChange={(e) => setPlayerFilter(e.target.value)}><option value="all">Select a player</option>{players.map((p) => <option key={p} value={p}>{p}</option>)}</select><button className="input hover:bg-white/10" onClick={() => setPlayerFilter('all')}>Reset player</button></div></section>
            <section className="grid gap-6 lg:grid-cols-2"><ChartCard title="Attackers by HR" subtitle="Best attackers in current filters." data={playerAttackStats.slice(0, 15)} yKey="player" xKey="hr" xName="HR %" /><ChartCard title="Hardest players to triple" subtitle="Defensive value by player defended." data={playerDefenseStats.slice(0, 15)} yKey="player" xKey="defensive_score" xName="Defensive score" /></section>
            <section className="grid gap-6 lg:grid-cols-2"><DataTable title="Player attack ranking" rows={playerAttackStats} columns={[['player','Player'],['attacks','Attacks'],['triples','Triples'],['hr','HR %'],['avg_stars','Avg stars'],['avg_percent','Avg %']]} /><DataTable title="Player defense ranking" rows={playerDefenseStats} columns={[['player','Player'],['attacks','Defenses'],['hr','HR conceded %'],['avg_stars','Avg stars conceded'],['avg_percent','Avg % conceded'],['defensive_score','Def score']]} /></section>
            {playerFilter !== 'all' && <DataTable title={`${playerFilter} - recent history`} rows={selectedPlayerRows.slice(0, 100)} columns={[['date','Date'],['attacker_name','Attacker'],['attacker_team','Atk team'],['army','Army'],['stars','Stars'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def team'],['competition','Competition']]} />}
          </>
        )}

        {page === 'matches' && (
          <>
            <section className="card p-4"><div className="grid gap-3 md:grid-cols-2"><select className="input" value={matchFilter} onChange={(e) => setMatchFilter(e.target.value)}><option value="all">Select a match</option>{matches.map((m) => <option key={m} value={m}>{m}</option>)}</select><button className="input hover:bg-white/10" onClick={() => setMatchFilter('all')}>Reset match</button></div></section>
            <DataTable title="Match attacks" rows={selectedMatchRows} columns={[['attack_order','Order'],['attacker_name','Attacker'],['attacker_team','Atk team'],['army','Army'],['stars','Stars'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def team'],['competition','Competition'],['date','Date']]} />
          </>
        )}

        {page === 'data' && (
          <>
            <section className="grid gap-4 md:grid-cols-3"><InsightCard label="Database status" value={`${rows.length} stored rows`} sub="Rows currently in Supabase" /><InsightCard label="Current filtered rows" value={total} sub="After global filters" /><InsightCard label="Import behavior" value="Replace mode" sub="Update Excel deletes old rows first" /></section>
            <section className="card p-5"><h2 className="mb-2 flex items-center gap-2 text-xl font-bold"><Lock className="h-5 w-5 text-accent" /> Data management</h2><p className="mb-4 text-sm text-slate-400">Use this button only when you want to replace the full database with a new Excel export. Your teammates only need the public link to view the latest saved data.</p><label className="btn inline-flex cursor-pointer items-center gap-2"><Upload className="h-4 w-4" />{uploading ? 'Updating database...' : 'Replace database with Excel'}<input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" /></label></section>
            <DataTable title="Raw data preview" rows={filtered.slice(0, 300)} columns={[['date','Date'],['attacker_name','Attacker'],['attacker_tag','Attacker tag'],['attacker_team','Atk team'],['army','Army'],['stars','Stars'],['percent','%'],['base_style','Base'],['spell_tower','Tower'],['defender_name','Defender'],['defender_team','Def team'],['competition','Competition'],['match_id','Match ID']]} />
          </>
        )}
      </div>
    </main>
  )
}

function ChartCard({ title, subtitle, data, yKey, xKey, xName, scatter = false }: any) {
  return (
    <div className="card p-5">
      <h2 className="mb-1 text-xl font-bold">{title}</h2>
      <p className="mb-4 text-sm text-slate-400">{subtitle}</p>
      <div className="h-[410px]">
        <ResponsiveContainer width="100%" height="100%">
          {scatter ? (
            <ScatterChart margin={{ left: 15, right: 30, top: 15, bottom: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
              <XAxis dataKey={xKey} name={xName} stroke="#94A3B8" />
              <YAxis dataKey={yKey} name={yKey} stroke="#94A3B8" />
              <ZAxis range={[80, 180]} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0D1324', border: '1px solid #26324D', color: '#fff' }} />
              <Scatter data={data} name="Combos" fill="#3B82F6" />
            </ScatterChart>
          ) : (
            <BarChart data={data} layout="vertical" margin={{ left: 85, right: 25 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
              <XAxis type="number" stroke="#94A3B8" />
              <YAxis dataKey={yKey} type="category" stroke="#94A3B8" width={155} tickFormatter={(v) => String(v).length > 22 ? String(v).slice(0, 22) + '…' : String(v)} />
              <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D', color: '#fff' }} />
              <Bar dataKey={xKey} name={xName} fill="#3B82F6" radius={[0, 8, 8, 0]} />
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
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{title}</h2>
          <p className="text-sm text-slate-400">{rows.length} rows</p>
        </div>
        <Table2 className="h-5 w-5 text-accent" />
      </div>
      <div className="max-h-[520px] overflow-auto rounded-2xl border border-line">
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
