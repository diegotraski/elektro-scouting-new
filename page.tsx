@tailwind base;
@tailwind components;
@tailwind utilities;

* { box-sizing: border-box; }
html { color-scheme: light; }
body {
  background-color: #F4F6FA;
  background-image:
    radial-gradient(ellipse 900px 500px at 10% -10%, rgba(14,198,224,0.06), transparent),
    radial-gradient(ellipse 800px 500px at 100% 0%, rgba(224,57,158,0.05), transparent);
  color: #131720;
  font-family: var(--font-body), sans-serif;
  -webkit-font-smoothing: antialiased;
}

.font-display { font-family: var(--font-display), sans-serif; }
.font-mono { font-family: var(--font-mono), monospace; }

.tactical-grid {
  background-image:
    linear-gradient(rgba(19,23,32,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(19,23,32,0.035) 1px, transparent 1px);
  background-size: 28px 28px;
}

.card {
  @apply rounded-xl border border-line bg-panel shadow-[0_1px_2px_rgba(19,23,32,0.04),0_8px_24px_-8px_rgba(19,23,32,0.08)];
}

.card-edge { position: relative; }
.card-edge::before {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2.5px;
  background: linear-gradient(90deg, #0EC6E0, #E0399E);
  border-radius: 3px 3px 0 0;
}

.input {
  @apply rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none transition focus:border-cyan/50 focus:ring-2 focus:ring-cyan/15;
}
.input option { background: #fff; color: #131720; }

.btn {
  @apply rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#262C38] active:scale-[0.98];
}
.btn-brand {
  @apply rounded-lg bg-brand-gradient px-4 py-2 text-sm font-semibold text-white shadow-[0_4px_14px_-4px_rgba(224,57,158,0.4)] transition hover:opacity-95 active:scale-[0.98];
}
.btn-ghost {
  @apply rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink/80 transition hover:border-cyan/40 hover:bg-cyan/[0.04] active:scale-[0.98];
}
.btn-danger {
  @apply rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-2 text-sm font-semibold text-danger transition hover:bg-danger/[0.12];
}

.label-eyebrow {
  @apply font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-steel;
}

.table th {
  @apply text-left font-mono text-[11px] font-semibold uppercase tracking-wider text-steel;
}
.table td {
  @apply border-t border-line px-3 py-2.5 text-sm text-ink;
}
.table tbody tr { transition: background-color 0.15s ease; }
.table tbody tr:hover { background: rgba(14,198,224,0.04); }

.star-pip {
  display: inline-block;
  width: 0.85em;
  text-align: center;
}

/* Ground / Air attack-type chips */
.chip-ground { @apply inline-flex items-center gap-1 rounded-md bg-ground/10 px-2 py-0.5 text-[11px] font-semibold text-ground; }
.chip-air { @apply inline-flex items-center gap-1 rounded-md bg-air/10 px-2 py-0.5 text-[11px] font-semibold text-air; }

.recharts-text, .recharts-cartesian-axis-tick-value { fill: #6B7488 !important; font-family: var(--font-mono), monospace !important; font-size: 11px !important; }
.recharts-tooltip-wrapper { color: #131720 !important; }
.recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #E2E6ED !important; }

::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D7DCE5; border-radius: 8px; }
::-webkit-scrollbar-thumb:hover { background: #B9C0CC; }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
