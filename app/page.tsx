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
  TrendingDown,
  Percent,
  RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'

const MIN_ATTACKS = 5

function Stat({ label, value, sub, icon: Icon }: any) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight">{value}</p>
          {sub ? <p className="mt-1 text-xs text-slate-500">{sub}</p> : null}
        </div>
        <div className="rounded-2xl bg-accent/10 p-3">
          <Icon className="h-7 w-7 text-accent" />
        </div>
      </div>
    </div>
  )
}

function SmallStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-line bg-soft/70 p-4">
      <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-bold">{value}</p>
    </div>
  )
}

function norm(v: any) {
  return String(v || '').trim()
}

function toDateString(value: any) {
  if (!value) return ''

  // Excel serial date
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
    attack_order: Number(row['Attack order'] ?? row['attack_order']),
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

export default function Home() {
  const [rows, setRows] = useState<Attack[]>([])
  const [loading, setLoading] = useState(true)
  const [baseFilter, setBaseFilter] = useState('all')
  const [spellFilter, setSpellFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [uploading, setUploading] = useState(false)

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

  const bases = useMemo(() => Array.from(new Set(cleanRows.map((r) => r.base_style))).sort(), [cleanRows])
  const spells = useMemo(() => Array.from(new Set(cleanRows.map((r) => r.spell_tower))).sort(), [cleanRows])

  const filtered = useMemo(
    () =>
      cleanRows.filter((r) => {
        const okBase = baseFilter === 'all' || r.base_style === baseFilter
        const okSpell = spellFilter === 'all' || r.spell_tower === spellFilter
        const okFrom = !dateFrom || (r.date || '') >= dateFrom
        const okTo = !dateTo || (r.date || '') <= dateTo
        return okBase && okSpell && okFrom && okTo
      }),
    [cleanRows, baseFilter, spellFilter, dateFrom, dateTo]
  )

  const combos = useMemo(() => comboStats(filtered, MIN_ATTACKS), [filtered])
  const rankingHR = useMemo(() => [...combos].sort((a, b) => b.hr - a.hr), [combos])
  const rankingDef = useMemo(() => [...combos].sort((a, b) => b.defensive_score - a.defensive_score), [combos])
  const rankingStars = useMemo(() => [...combos].sort((a, b) => a.avg_stars - b.avg_stars), [combos])

  const total = filtered.length
  const triples = filtered.filter((r) => Number(r.stars) === 3).length
  const hr = total ? +(triples / total * 100).toFixed(1) : 0
  const avgStars = total ? +(filtered.reduce((s, r) => s + Number(r.stars || 0), 0) / total).toFixed(2) : 0
  const avgPercent = total ? +(filtered.reduce((s, r) => s + Number(r.percent || 0), 0) / total).toFixed(1) : 0
  const defenses = total - triples

  const uniqueTeams = useMemo(
    () => new Set(filtered.flatMap((r) => [r.attacker_team, r.defender_team]).filter(Boolean)).size,
    [filtered]
  )
  const uniquePlayers = useMemo(
    () => new Set(filtered.flatMap((r) => [r.attacker_tag, r.defender_tag]).filter(Boolean)).size,
    [filtered]
  )

  const armyStats = useMemo(() => {
    const map = new Map<string, Attack[]>()
    filtered.forEach((r) => {
      const key = r.army || 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return Array.from(map.entries())
      .map(([army, items]) => ({
        army: title(army),
        attacks: items.length,
        hr: +(items.filter((x) => Number(x.stars) === 3).length / items.length * 100).toFixed(1),
      }))
      .filter((x) => x.attacks >= MIN_ATTACKS)
      .sort((a, b) => b.attacks - a.attacks)
      .slice(0, 10)
  }, [filtered])

  const teamStats = useMemo(() => {
    const map = new Map<string, Attack[]>()
    filtered.forEach((r) => {
      const key = r.attacker_team || 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    })
    return Array.from(map.entries())
      .map(([team, items]) => ({
        team,
        attacks: items.length,
        hr: +(items.filter((x) => Number(x.stars) === 3).length / items.length * 100).toFixed(1),
        avg: +(items.reduce((s, x) => s + Number(x.percent || 0), 0) / items.length).toFixed(1),
      }))
      .filter((x) => x.attacks >= MIN_ATTACKS)
      .sort((a, b) => b.hr - a.hr)
      .slice(0, 10)
  }, [filtered])

  const heatmap = useMemo(() => {
    const baseList = Array.from(new Set(combos.map((c) => c.base_style))).sort()
    const spellList = Array.from(new Set(combos.map((c) => c.spell_tower))).sort()
    const lookup = new Map(combos.map((c) => [`${c.base_style}|||${c.spell_tower}`, c]))
    return { baseList, spellList, lookup }
  }, [combos])

  const bestDefense = rankingDef[0]
  const bestStars = rankingStars[0]
  const mostUsedArmy = armyStats[0]

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const ok = window.confirm('Esto borrará los datos actuales de Supabase y subirá el Excel nuevo. ¿Continuar?')
    if (!ok) return

    setUploading(true)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet)
    const payload = json
      .map(mapRow)
      .filter((r) => r.base_style && r.spell_tower && r.stars !== null && r.stars !== undefined && !Number.isNaN(r.stars))

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
    setBaseFilter('all')
    setSpellFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#172554_0,#070A12_38%)] p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-accent">Team Elektros</p>
            <h1 className="text-4xl font-black tracking-tight">Elektro Scout</h1>
            <p className="mt-2 text-slate-400">Dashboard clean para scouting competitivo: HR, Avg Stars, combos y tendencias filtradas por fecha.</p>
          </div>
          <div className="flex gap-3">
            <button className="rounded-xl border border-line bg-soft px-4 py-2 text-sm font-semibold text-white hover:bg-white/10" onClick={loadData}>
              <RefreshCw className="mr-2 inline h-4 w-4" /> Recargar
            </button>
            <label className="btn flex cursor-pointer items-center gap-2">
              <Upload className="h-4 w-4" />{uploading ? 'Actualizando...' : 'Actualizar Excel'}
              <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            </label>
          </div>
        </header>

        <section className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <CalendarDays className="h-4 w-4 text-accent" /> Filtros
          </div>
          <div className="grid gap-3 md:grid-cols-5">
            <select className="input" value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}>
              <option value="all">Todos los diseños</option>
              {bases.map((b) => <option key={b} value={b}>{title(b)}</option>)}
            </select>
            <select className="input" value={spellFilter} onChange={(e) => setSpellFilter(e.target.value)}>
              <option value="all">Todas las Spell Towers</option>
              {spells.map((s) => <option key={s} value={s}>{title(s)}</option>)}
            </select>
            <input className="input" type="date" value={dateFrom} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDateFrom(e.target.value)} />
            <input className="input" type="date" value={dateTo} min={dateBounds.min} max={dateBounds.max} onChange={(e) => setDateTo(e.target.value)} />
            <button className="input hover:bg-white/10" onClick={clearFilters}>Limpiar filtros</button>
          </div>
          <p className="mt-3 text-xs text-slate-500">Rango disponible: {dateBounds.min || '-'} → {dateBounds.max || '-'}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <Stat label="Ataques" value={loading ? '...' : total} sub={`${uniqueTeams} equipos · ${uniquePlayers} jugadores`} icon={Database} />
          <Stat label="HR global" value={`${hr}%`} sub={`${triples} triples / ${total} ataques`} icon={Target} />
          <Stat label="Avg stars" value={avgStars} sub="Media de estrellas recibidas" icon={Trophy} />
          <Stat label="Avg %" value={`${avgPercent}%`} sub="Destrucción media" icon={Percent} />
        </section>

        <section className="grid gap-4 md:grid-cols-4">
          <SmallStat label="Defensas" value={defenses} />
          <SmallStat label="Mejor defensa combo" value={bestDefense ? bestDefense.combo : '-'} />
          <SmallStat label="Menor avg stars" value={bestStars ? `${bestStars.combo} · ${bestStars.avg_stars}` : '-'} />
          <SmallStat label="Army más usada" value={mostUsedArmy ? `${mostUsedArmy.army} · ${mostUsedArmy.attacks}` : '-'} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-1 text-xl font-bold">Combos más atacables por HR</h2>
            <p className="mb-4 text-sm text-slate-400">Más alto = más fácil de triplear. Mínimo {MIN_ATTACKS} ataques.</p>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingHR.slice(0, 12)} layout="vertical" margin={{ left: 80, right: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
                  <XAxis type="number" stroke="#94A3B8" />
                  <YAxis dataKey="combo" type="category" stroke="#94A3B8" width={145} />
                  <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D' }} />
                  <Bar dataKey="hr" name="HR %" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-xl font-bold">Mejores defensas</h2>
            <p className="mb-4 text-sm text-slate-400">Score defensivo = bajo HR + suficientes muestras.</p>
            <div className="h-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingDef.slice(0, 12)} layout="vertical" margin={{ left: 80, right: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
                  <XAxis type="number" stroke="#94A3B8" />
                  <YAxis dataKey="combo" type="category" stroke="#94A3B8" width={145} />
                  <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D' }} />
                  <Bar dataKey="defensive_score" name="Defensive score" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-xl font-bold">Heatmap de HR</h2>
          <p className="mb-4 text-sm text-slate-400">Verde = mejor defensa. Rojo = peor defensa. Cada celda muestra HR y muestras.</p>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-2 text-sm">
              <thead>
                <tr>
                  <th className="text-left text-slate-400">Diseño</th>
                  {heatmap.spellList.map((s) => <th key={s} className="text-center text-slate-400">{title(s)}</th>)}
                </tr>
              </thead>
              <tbody>
                {heatmap.baseList.map((b) => (
                  <tr key={b}>
                    <td className="whitespace-nowrap font-semibold">{title(b)}</td>
                    {heatmap.spellList.map((s) => {
                      const c = heatmap.lookup.get(`${b}|||${s}`)
                      return (
                        <td key={s} className={`rounded-xl border p-3 text-center ${getCellClass(c?.hr)}`}>
                          {c ? <><div className="text-lg font-black">{c.hr}%</div><div className="text-xs opacity-70">{c.attacks} atk · {c.avg_stars}⭐</div></> : '-'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="mb-1 text-xl font-bold">Top armies usadas</h2>
            <p className="mb-4 text-sm text-slate-400">Volumen y HR de los ataques más repetidos.</p>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={armyStats} layout="vertical" margin={{ left: 80, right: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
                  <XAxis type="number" stroke="#94A3B8" />
                  <YAxis dataKey="army" type="category" stroke="#94A3B8" width={145} />
                  <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D' }} />
                  <Bar dataKey="attacks" name="Ataques" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="mb-1 text-xl font-bold">Top equipos por HR</h2>
            <p className="mb-4 text-sm text-slate-400">Solo equipos con suficientes ataques en el filtro actual.</p>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={teamStats} layout="vertical" margin={{ left: 80, right: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
                  <XAxis type="number" stroke="#94A3B8" />
                  <YAxis dataKey="team" type="category" stroke="#94A3B8" width={145} />
                  <Tooltip contentStyle={{ background: '#0D1324', border: '1px solid #26324D' }} />
                  <Bar dataKey="hr" name="HR %" radius={[0, 8, 8, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        <section className="card p-5">
          <h2 className="mb-1 text-xl font-bold">HR vs muestras</h2>
          <p className="mb-4 text-sm text-slate-400">Sirve para detectar combos con HR alto pero poca muestra.</p>
          <div className="h-[420px]">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: 15, right: 30, top: 15, bottom: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#26324D" />
                <XAxis dataKey="attacks" name="Ataques" stroke="#94A3B8" />
                <YAxis dataKey="hr" name="HR %" stroke="#94A3B8" />
                <ZAxis range={[80, 180]} />
                <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ background: '#0D1324', border: '1px solid #26324D' }} />
                <Scatter data={combos} name="Combos" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card overflow-hidden p-5">
          <h2 className="mb-1 text-xl font-bold">Ranking completo</h2>
          <p className="mb-4 text-sm text-slate-400">Ordenado por mejor defensa.</p>
          <div className="overflow-x-auto">
            <table className="table w-full">
              <thead>
                <tr>
                  <th>Combo</th>
                  <th>Ataques</th>
                  <th>Triples</th>
                  <th>HR</th>
                  <th>Avg stars</th>
                  <th>Avg %</th>
                  <th>Def score</th>
                </tr>
              </thead>
              <tbody>
                {rankingDef.map((r) => (
                  <tr key={r.combo}>
                    <td className="font-semibold">{r.combo}</td>
                    <td>{r.attacks}</td>
                    <td>{r.triples}</td>
                    <td>{r.hr}%</td>
                    <td>{r.avg_stars}</td>
                    <td>{r.avg_percent}%</td>
                    <td>{r.defensive_score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
