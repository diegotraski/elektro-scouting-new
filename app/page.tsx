'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Attack } from '@/lib/types'
import { comboStats, filteredAttacks, title } from '@/lib/analytics'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ScatterChart, Scatter, ZAxis } from 'recharts'
import { Upload, Trophy, Shield, Target, Database } from 'lucide-react'
import * as XLSX from 'xlsx'

const MIN_ATTACKS = 5

function Stat({ label, value, icon: Icon }: any) {
  return <div className="card p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-slate-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p></div><Icon className="h-8 w-8 text-accent" /></div></div>
}

function mapRow(row: any): Attack {
  const dateRaw = row['Date'] || row['date']
  let date = ''
  if (dateRaw) {
    const parsed = new Date(dateRaw)
    date = isNaN(parsed.getTime()) ? String(dateRaw) : parsed.toISOString().slice(0,10)
  }
  return {
    attacker_name: row['Name (attacker)'], attacker_tag: row['Tag (attacker)'], attacker_team: row['Team (attacker)'], attacker_team_id: String(row['Team ID (attacker)'] || ''),
    stars: Number(row['Stars']), percent: Number(row['%']), attack_order: Number(row['Attack order']), army: row['Army'], base_style: row['Base Style'], spell_tower: row['Spell Tower'],
    defender_name: row['Name (defender)'], defender_tag: row['Tag (defender)'], defender_team: row['Team (defender)'], defender_team_id: String(row['Team ID (defender)'] || ''),
    competition: row['Competition'], match_id: String(row['Match ID'] || ''), link: row['Link'], stream: row['Stream'], stream_link: row['Stream Link'], date
  }
}

export default function Home() {
  const [rows, setRows] = useState<Attack[]>([])
  const [loading, setLoading] = useState(true)
  const [baseFilter, setBaseFilter] = useState('all')
  const [spellFilter, setSpellFilter] = useState('all')
  const [uploading, setUploading] = useState(false)

  async function loadData() {
    setLoading(true)
    const { data, error } = await supabase.from('attacks').select('*').order('date', { ascending: false }).limit(10000)
    if (!error && data) setRows(data)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  const cleanRows = useMemo(() => filteredAttacks(rows), [rows])
  const bases = useMemo(() => Array.from(new Set(cleanRows.map(r => r.base_style))).sort(), [cleanRows])
  const spells = useMemo(() => Array.from(new Set(cleanRows.map(r => r.spell_tower))).sort(), [cleanRows])

  const filtered = useMemo(() => cleanRows.filter(r => (baseFilter === 'all' || r.base_style === baseFilter) && (spellFilter === 'all' || r.spell_tower === spellFilter)), [cleanRows, baseFilter, spellFilter])
  const combos = useMemo(() => comboStats(filtered, MIN_ATTACKS), [filtered])
  const rankingHR = useMemo(() => [...combos].sort((a,b) => b.hr - a.hr), [combos])
  const rankingDef = useMemo(() => [...combos].sort((a,b) => b.defensive_score - a.defensive_score), [combos])

  const total = filtered.length
  const triples = filtered.filter(r => Number(r.stars) === 3).length
  const hr = total ? (triples / total * 100).toFixed(1) : '0.0'
  const avgStars = total ? (filtered.reduce((s,r) => s + Number(r.stars || 0), 0) / total).toFixed(2) : '0.00'
  const avgPercent = total ? (filtered.reduce((s,r) => s + Number(r.percent || 0), 0) / total).toFixed(1) : '0.0'

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(sheet)
    const payload = json.map(mapRow).filter(r => r.stream && r.base_style && r.spell_tower && !Number.isNaN(r.stars))
    const chunkSize = 500
    for (let i = 0; i < payload.length; i += chunkSize) {
      await supabase.from('attacks').insert(payload.slice(i, i + chunkSize))
    }
    setUploading(false)
    await loadData()
  }

  return <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#182C5F_0,#070A12_35%)] p-6">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm font-semibold text-accent">Team Elektros</p><h1 className="text-4xl font-black tracking-tight">Elektro Scout</h1><p className="mt-2 text-slate-400">Dashboard moderno para scouting competitivo de Clash of Clans.</p></div>
        <label className="btn flex cursor-pointer items-center gap-2"><Upload className="h-4 w-4" />{uploading ? 'Subiendo...' : 'Subir Excel'}<input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" /></label>
      </header>

      <section className="card p-4"><div className="grid gap-3 md:grid-cols-3"><select className="input" value={baseFilter} onChange={e => setBaseFilter(e.target.value)}><option value="all">Todos los diseños</option>{bases.map(b => <option key={b} value={b}>{title(b)}</option>)}</select><select className="input" value={spellFilter} onChange={e => setSpellFilter(e.target.value)}><option value="all">Todas las Spell Towers</option>{spells.map(s => <option key={s} value={s}>{title(s)}</option>)}</select><button className="input" onClick={() => { setBaseFilter('all'); setSpellFilter('all') }}>Limpiar filtros</button></div></section>

      <section className="grid gap-4 md:grid-cols-4"><Stat label="Ataques" value={loading ? '...' : total} icon={Database}/><Stat label="HR global" value={`${hr}%`} icon={Target}/><Stat label="Avg stars" value={avgStars} icon={Trophy}/><Stat label="Avg %" value={`${avgPercent}%`} icon={Shield}/></section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card p-5"><h2 className="mb-1 text-xl font-bold">Mejores combos por HR</h2><p className="mb-4 text-sm text-slate-400">Más alto = más fácil de triplear. Mínimo {MIN_ATTACKS} ataques.</p><div className="h-[420px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={rankingHR.slice(0,12)} layout="vertical" margin={{left:80,right:25}}><CartesianGrid strokeDasharray="3 3" stroke="#26324D"/><XAxis type="number" stroke="#94A3B8"/><YAxis dataKey="combo" type="category" stroke="#94A3B8" width={145}/><Tooltip contentStyle={{background:'#0D1324',border:'1px solid #26324D'}}/><Bar dataKey="hr" name="HR %" radius={[0,8,8,0]} /></BarChart></ResponsiveContainer></div></div>
        <div className="card p-5"><h2 className="mb-1 text-xl font-bold">Mejores defensas</h2><p className="mb-4 text-sm text-slate-400">Score defensivo = bajo HR + suficientes muestras.</p><div className="h-[420px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={rankingDef.slice(0,12)} layout="vertical" margin={{left:80,right:25}}><CartesianGrid strokeDasharray="3 3" stroke="#26324D"/><XAxis type="number" stroke="#94A3B8"/><YAxis dataKey="combo" type="category" stroke="#94A3B8" width={145}/><Tooltip contentStyle={{background:'#0D1324',border:'1px solid #26324D'}}/><Bar dataKey="defensive_score" name="Defensive score" radius={[0,8,8,0]} /></BarChart></ResponsiveContainer></div></div>
      </section>

      <section className="card p-5"><h2 className="mb-1 text-xl font-bold">HR vs muestras</h2><p className="mb-4 text-sm text-slate-400">Sirve para evitar engaños de combos con pocos ataques.</p><div className="h-[420px]"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{left:15,right:30,top:15,bottom:15}}><CartesianGrid strokeDasharray="3 3" stroke="#26324D"/><XAxis dataKey="attacks" name="Ataques" stroke="#94A3B8"/><YAxis dataKey="hr" name="HR %" stroke="#94A3B8"/><ZAxis range={[80,180]}/><Tooltip cursor={{strokeDasharray:'3 3'}} contentStyle={{background:'#0D1324',border:'1px solid #26324D'}} formatter={(value:any, name:any) => [value, name]} labelFormatter={() => ''}/><Scatter data={combos} name="Combos" /></ScatterChart></ResponsiveContainer></div></section>

      <section className="card overflow-hidden p-5"><h2 className="mb-1 text-xl font-bold">Ranking completo</h2><p className="mb-4 text-sm text-slate-400">Ordenado por mejor defensa.</p><div className="overflow-x-auto"><table className="table w-full"><thead><tr><th>Combo</th><th>Ataques</th><th>Triples</th><th>HR</th><th>Avg stars</th><th>Avg %</th><th>Def score</th></tr></thead><tbody>{rankingDef.map(r => <tr key={r.combo}><td className="font-semibold">{r.combo}</td><td>{r.attacks}</td><td>{r.triples}</td><td>{r.hr}%</td><td>{r.avg_stars}</td><td>{r.avg_percent}%</td><td>{r.defensive_score}</td></tr>)}</tbody></table></div></section>
    </div>
  </main>
}
