export type Attack = {
  id?: number
  attacker_name?: string
  attacker_tag?: string
  attacker_team?: string
  attacker_team_id?: string
  stars?: number
  percent?: number
  attack_order?: number
  army?: string
  base_style?: string
  spell_tower?: string
  defender_name?: string
  defender_tag?: string
  defender_team?: string
  defender_team_id?: string
  competition?: string
  match_id?: string
  link?: string
  stream?: string
  stream_link?: string
  date?: string
}

export type ComboRow = {
  combo: string
  base_style: string
  spell_tower: string
  attacks: number
  triples: number
  hr: number
  hr_low: number
  hr_high: number
  avg_stars: number
  avg_percent: number
}
