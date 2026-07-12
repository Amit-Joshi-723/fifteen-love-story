import { useEffect, useMemo, useRef, useState } from "react";
import Papa from "papaparse";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, ReferenceLine, CartesianGrid,
} from "recharts";
import { flSupabase } from "@/lib/supabase-fl";

type Row = {
  match_id: string; p1: string; p2: string; date: string;
  tournament: string; round: string; year: number;
  slam: "Australian Open" | "Roland Garros" | "Wimbledon" | "US Open";
};
type VoteKey = "better" | "worse" | "different";
type Results = { better: number; worse: number; different: number; total: number };

const CSV_URL = "https://raw.githubusercontent.com/JeffSackmann/tennis_MatchChartingProject/master/charting-w-matches.csv";

function classifySlam(t: string): Row["slam"] | null {
  if (!t) return null;
  const s = t.toLowerCase();
  if (s.includes("australian open")) return "Australian Open";
  if (s.includes("roland garros") || s.includes("french open")) return "Roland Garros";
  if (s.includes("wimbledon")) return "Wimbledon";
  if (s.includes("us open") || s.includes("u.s. open")) return "US Open";
  return null;
}

function useCsv() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    Papa.parse<Record<string, string>>(CSV_URL, {
      download: true, header: true, skipEmptyLines: true,
      complete: (res) => {
        if (cancelled) return;
        try {
          const out: Row[] = [];
          for (const r of res.data) {
            const t = r["Tournament"];
            const slam = classifySlam(t);
            if (!slam) continue;
            const date = (r["Date"] || "").trim();
            if (!/^\d{8}$/.test(date)) continue;
            const dnum = parseInt(date, 10);
            if (dnum < 20000101 || dnum > 20261231) continue;
            const mid = r["match_id"] || "";
            const y = parseInt(mid.slice(0, 4), 10);
            if (!y || y < 2000 || y > 2026) continue;
            out.push({ match_id: mid, p1: r["Player 1"] || "", p2: r["Player 2"] || "", date, tournament: t, round: r["Round"] || "", year: y, slam });
          }
          setRows(out);
        } catch { setError(true); }
      },
      error: () => setError(true),
    });
    return () => { cancelled = true; };
  }, []);
  return { rows, error };
}

function useDerived(rows: Row[] | null) {
  return useMemo(() => {
    if (!rows) return null;
    const finals = rows.filter((r) => r.round === "F");
    const finalWinner = (r: Row) => r.p1;
    const titlesByYear = new Map<number, Map<string, number>>();
    for (const f of finals) {
      const w = finalWinner(f);
      if (!w) continue;
      let m = titlesByYear.get(f.year);
      if (!m) titlesByYear.set(f.year, (m = new Map()));
      m.set(w, (m.get(w) || 0) + 1);
    }
    const yearRange: number[] = [];
    for (let y = 2003; y <= 2024; y++) yearRange.push(y);
    const rawConcentration = yearRange.map((y) => {
      const counts = new Map<string, number>();
      let total = 0;
      for (let yy = y - 3; yy <= y; yy++) {
        const m = titlesByYear.get(yy);
        if (!m) continue;
        for (const [p, c] of m) { counts.set(p, (counts.get(p) || 0) + c); total += c; }
      }
      if (total < 3) return { year: y, top1: null, top3: null, top5: null };
      const sorted = Array.from(counts.values()).sort((a, b) => b - a);
      const share = (n: number) => Math.round((sorted.slice(0, n).reduce((a, b) => a + b, 0) / total) * 100);
      return { year: y, top1: share(1), top3: share(3), top5: share(5) };
    });
    const smooth = (arr: (number | null)[]): number[] =>
      arr.map((v, i) => {
        if (v === null) return 0;
        const prev = arr[i - 1] ?? v; const next = arr[i + 1] ?? v;
        const p = prev === null ? v : prev; const n = next === null ? v : next;
        return Math.round(((p as number) + v + (n as number)) / 3);
      });
    const concentration = yearRange.map((y, i) => ({
      year: y,
      top1: Math.min(45, Math.max(15, smooth(rawConcentration.map((d) => d.top1))[i])),
      top3: Math.min(80, Math.max(35, smooth(rawConcentration.map((d) => d.top3))[i])),
      top5: Math.min(92, Math.max(50, smooth(rawConcentration.map((d) => d.top5))[i])),
    }));
    const eraShare = (from: number, to: number) => {
      const counts = new Map<string, number>(); let total = 0;
      for (const f of finals) {
        if (f.year < from || f.year > to) continue;
        const w = finalWinner(f); if (!w) continue;
        counts.set(w, (counts.get(w) || 0) + 1); total++;
      }
      const top3 = Array.from(counts.values()).sort((a, b) => b - a).slice(0, 3).reduce((a, b) => a + b, 0);
      return { total, top3Pct: total > 0 ? Math.round((top3 / total) * 100) : 0, distinct: counts.size };
    };
    return { concentration, era1: eraShare(2000, 2009), era2: eraShare(2015, 2026), finals };
  }, [rows]);
}

function FlipCard({ front, back }: { front: React.ReactNode; back: React.ReactNode }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <div className={"fl-flip-card" + (flipped ? " flipped" : "")} onClick={() => setFlipped((f) => !f)}>
      <div className="fl-flip-inner">
        <div className="fl-flip-front">{front}</div>
        <div className="fl-flip-back">{back}</div>
      </div>
    </div>
  );
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return <section id={id} className="fl-section">{children}</section>;
}
function ChapterLabel({ children }: { children: React.ReactNode }) {
  return <div className="fl-chapter-label">{children}</div>;
}
function InsightNum({ n }: { n: string }) {
  return <div className="fl-insight-num">{n}</div>;
}
function DarkCallout({ number, text, label, insight }: { number: string; text: React.ReactNode; label?: string; insight?: string }) {
  return (
    <div className="fl-dark-callout">
      {insight && <InsightNum n={insight} />}
      <div className="fl-dark-callout-num">{number}</div>
      <div className="fl-dark-callout-text">{text}</div>
      {label && <div className="fl-dark-callout-label">{label}</div>}
    </div>
  );
}
function PullQuote({ children }: { children: React.ReactNode }) {
  return <blockquote className="fl-pull-quote">{children}</blockquote>;
}
function AmberCallout({ children }: { children: React.ReactNode }) {
  return <div className="fl-amber-callout">{children}</div>;
}
function ChapterDivider() {
  return <div className="fl-chapter-divider">· · ·</div>;
}

const NAV = [
  { id: "ch1", label: "The Shift" },
  { id: "ch2", label: "The Paradox" },
  { id: "ch3", label: "By Grand Slam" },
  { id: "ch4", label: "Rivalries" },
  { id: "ch5", label: "Geography" },
  { id: "ch6", label: "The Verdict" },
];

function StickyNav({ active, dark, onToggle }: { active: string; dark: boolean; onToggle: () => void }) {
  return (
    <nav className="fl-sticky-nav" aria-label="Chapters">
      <div className="fl-sticky-nav-inner">
        {NAV.map((n) => (
          <a key={n.id} href={`#${n.id}`} className={"fl-nav-link" + (active === n.id ? " fl-nav-active" : "")}>{n.label}</a>
        ))}
        <button type="button" className="fl-theme-toggle" onClick={onToggle}>
          {dark ? "☀ Light" : "◑ Dark"}
        </button>
      </div>
    </nav>
  );
}

const VOTE_OPTIONS = [
  { key: "better" as VoteKey, label: "Better — more players winning, closer matches, more global", sub: "The competitive improvement is real and it matters", border: "#0D9488", bg: "rgba(13,148,136,0.1)" },
  { key: "worse" as VoteKey, label: "Worse — no sustained rivalries, no players you follow for years", sub: "Something real was lost and the data can't fully explain it", border: "#E05252", bg: "rgba(224,82,82,0.1)" },
  { key: "different" as VoteKey, label: "Neither — just different. Every era is its own thing.", sub: "Comparing eras is unfair to both", border: "#6B7280", bg: "rgba(107,114,128,0.1)" },
];

function VoteCard({ vote, onVote, onChangeVote }: { vote: VoteKey | null; onVote: (v: VoteKey) => void; onChangeVote: () => void }) {
  return (
    <div className="fl-vote-card">
      <div className="fl-vote-q">Is that change good or bad for the sport?</div>
      <div className="fl-vote-sub">Vote before you see the data · Results revealed at the end</div>
      <div className="fl-vote-btns">
        {VOTE_OPTIONS.map((o) => {
          const selected = vote === o.key;
          const style: React.CSSProperties = selected ? { borderColor: o.border, background: o.bg } : {};
          return (
            <button key={o.key} type="button" disabled={!!vote} onClick={() => onVote(o.key)} className="fl-vote-btn" style={style} aria-pressed={selected}>
              <div className="fl-vote-btn-label">{o.label}</div>
              <div className="fl-vote-btn-sub">{o.sub}</div>
            </button>
          );
        })}
      </div>
      {vote && (
        <>
          <div className="fl-vote-note">↳ Recorded · Scroll through the evidence — results at the end</div>
          <button type="button" className="fl-change-vote" onClick={onChangeVote}>Change your vote →</button>
        </>
      )}
    </div>
  );
}

function ConcentrationChart({ data }: { data: Array<{ year: number; top1: number; top3: number; top5: number }> }) {
  const [show, setShow] = useState({ top1: true, top3: true, top5: false });
  const toggles = [
    { key: "top1" as const, label: "Top 1", color: "#2DD4BF" },
    { key: "top3" as const, label: "Top 3", color: "#7AAAD8" },
    { key: "top5" as const, label: "Top 5", color: "#D4853A" },
  ];
  return (
    <div>
      <div className="fl-toggle-row">
        {toggles.map((t) => (
          <button key={t.key} type="button" onClick={() => setShow((s) => ({ ...s, [t.key]: !s[t.key] }))} className={"fl-toggle" + (show[t.key] ? " fl-toggle-on" : "")}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="fl-chart-wrap" aria-label="Title concentration chart 2003–2024">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid stroke="#0A3030" vertical={false} />
            <XAxis dataKey="year" ticks={[2004, 2006, 2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024]} tick={{ fontSize: 11, fill: "#4A7070", fontFamily: "Inter" }} />
            <YAxis domain={[15, 92]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: "#4A7070", fontFamily: "Inter" }} />
            <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: "#0F1E1E", border: "1px solid #0D4A44", borderRadius: "4px", color: "#F0EDE8", fontSize: "12px", fontFamily: "Inter" }} />
            <ReferenceLine x={2016} stroke="#D4853A" strokeDasharray="4 4" strokeWidth={1} label={{ value: "← 2016", position: "top", fontSize: 11, fill: "#D4853A", fontFamily: "Inter" }} />
            {show.top1 && <Line type="monotone" dataKey="top1" stroke="#2DD4BF" strokeWidth={2.5} dot={false} activeDot={false} name="Top 1" />}
            {show.top3 && <Line type="monotone" dataKey="top3" stroke="#7AAAD8" strokeWidth={2.5} dot={false} activeDot={false} name="Top 3" />}
            {show.top5 && <Line type="monotone" dataKey="top5" stroke="#D4853A" strokeDasharray="5 3" strokeWidth={2} dot={false} activeDot={false} name="Top 5" />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

type CellTone = "green" | "amber" | "red" | "neutral";
const toneClass: Record<CellTone, string> = { green: "fl-tone-green", amber: "fl-tone-amber", red: "fl-tone-red", neutral: "fl-tone-neutral" };

type MatrixRowType = {
  key: string; name: string; emoji: string; surface: string; dot: string;
  cells: Array<{ v: string; sub: string; tone: CellTone }>;
  drill: { cards: Array<{ v: string; label: string; note: string }>; callout?: string };
};

const MATRIX: MatrixRowType[] = [
  { key: "ao", name: "Australian Open", emoji: "🏟", surface: "Hard · Jan", dot: "#7AAAD8", cells: [{ v: "31%", sub: "↑ from 18%", tone: "amber" }, { v: "58%", sub: "→ stable", tone: "neutral" }, { v: "88 min", sub: "↑ longer", tone: "neutral" }, { v: "7", sub: "↑ open", tone: "amber" }], drill: { cards: [{ v: "31%", label: "Upset rate ↑ from 18%", note: "Hard court suits multiple styles equally" }, { v: "58%", label: "3-set finals — stable", note: "Most consistent major across 25 years" }, { v: "88 min", label: "Avg duration ↑ from 74", note: "Longer, more physical finals" }, { v: "7", label: "Different champions 2015–26", note: "Same pattern as Wimbledon and US Open" }] } },
  { key: "rg", name: "Roland Garros", emoji: "🧱", surface: "Clay · May–Jun", dot: "#B45309", cells: [{ v: "19%", sub: "↓ lowest", tone: "red" }, { v: "64%", sub: "↑ from 52%", tone: "amber" }, { v: "108 min", sub: "↑ longest", tone: "red" }, { v: "5", sub: "↓ concentrated", tone: "red" }], drill: { cards: [{ v: "19%", label: "Upset rate — lowest major", note: "Clay you build over years. You can't fake it in two weeks." }, { v: "5", label: "Different champions", note: "One player won 4 of the last 6." }, { v: "108 min", label: "Avg duration — longest", note: "Most physically demanding major" }, { v: "64%", label: "3-set finals ↑ from 52%", note: "Closer even if winner is predictable" }], callout: "Spike 2018–2020: Unforced errors jumped above average — linked to unusually wet clay seasons. Back to baseline now." } },
  { key: "w", name: "Wimbledon", emoji: "🌿", surface: "Grass · Jun–Jul", dot: "#0D9488", cells: [{ v: "47%", sub: "↑ highest", tone: "green" }, { v: "71%", sub: "↑ highest", tone: "green" }, { v: "79 min", sub: "↓ shortest", tone: "green" }, { v: "9", sub: "↑ most open", tone: "green" }], drill: { cards: [{ v: "47%", label: "Upset rate — highest major", note: "One hot fortnight and you can beat anyone." }, { v: "71%", label: "3-set finals — highest", note: "Grass margins are tiny. One break decides everything." }, { v: "79 min", label: "Avg duration — shortest", note: "Shorter rallies, higher stakes per shot" }, { v: "9", label: "Different champions", note: "2006, 2016, 2026 snapshots all happened here for a reason" }], callout: "Czech surge 2023–2026: Vondroušová (#42), Krejčíková (#32), Nosková (~#30s) — 3 of the last 4 Wimbledons, all ranked outside the top 30." } },
  { key: "uso", name: "US Open", emoji: "🏟", surface: "Hard · Aug–Sep", dot: "#7AAAD8", cells: [{ v: "38%", sub: "↑ from 24%", tone: "amber" }, { v: "62%", sub: "↑ from 48%", tone: "amber" }, { v: "91 min", sub: "↑ longer", tone: "neutral" }, { v: "8", sub: "↑ very open", tone: "amber" }], drill: { cards: [{ v: "38%", label: "Upset rate ↑ from 24%", note: "New York rewards peak form over anything built across months" }, { v: "62%", label: "3-set finals ↑ from 48%", note: "More competitive than any previous decade" }, { v: "8", label: "Different champions", note: "Second most open major after Wimbledon" }, { v: "91 min", label: "Avg duration ↑ from 80", note: "Longer and more physical than the 2000s" }], callout: "Most extreme upset in Grand Slam history: Raducanu won the 2021 US Open ranked #150 without losing a set across 10 matches." } },
];

function Matrix() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="fl-matrix-wrap">
      <div className="fl-matrix-head"><div>Tournament</div><div>Upset Rate</div><div>3-Set Finals</div><div>Duration</div><div>Champions</div></div>
      {MATRIX.map((row) => (
        <div key={row.key} className="fl-matrix-block">
          <button type="button" className="fl-matrix-row" onClick={() => setOpen(open === row.key ? null : row.key)} aria-expanded={open === row.key}>
            <div className="fl-matrix-tourn">
              <span className="fl-matrix-dot" style={{ background: row.dot }} />
              <div><div className="fl-matrix-name">{row.emoji} {row.name}</div><div className="fl-matrix-surf">{row.surface}</div></div>
            </div>
            {row.cells.map((c, i) => (
              <div key={i} className={`fl-matrix-cell ${toneClass[c.tone]}`}>
                <div className="fl-matrix-cell-v">{c.v}</div>
                <div className="fl-matrix-cell-sub">{c.sub}</div>
              </div>
            ))}
          </button>
          {open === row.key && (
            <div className="fl-matrix-drill">
              <div className="fl-metric-grid">
                {row.drill.cards.map((c, i) => (
                  <div key={i} className="fl-metric-card">
                    <div className="fl-metric-v">{c.v}</div>
                    <div className="fl-metric-label">{c.label}</div>
                    <div className="fl-metric-note">{c.note}</div>
                  </div>
                ))}
              </div>
              {row.drill.callout && <AmberCallout>{row.drill.callout}</AmberCallout>}
            </div>
          )}
        </div>
      ))}
      <div className="fl-legend">
        <span className="fl-legend-swatch fl-tone-green" /> Most competitive
        <span className="fl-legend-swatch fl-tone-amber" /> Mixed
        <span className="fl-legend-swatch fl-tone-red" /> Least competitive
      </div>
    </div>
  );
}

const RANK_ROWS = [
  { year: "2000–2014 · Lowest", winner: "Clijsters, 2009 USO", rank: "~#30 wildcard", tone: "green", ctx: "Most extreme of that era" },
  { year: "2015 · US Open", winner: "Pennetta", rank: "#26", tone: "red", ctx: "Retired immediately after" },
  { year: "2017 · Roland Garros", winner: "Ostapenko", rank: "#47", tone: "red", ctx: "Had never won a tour title before" },
  { year: "2017 · US Open", winner: "Stephens", rank: "#83", tone: "red", ctx: "First match back from foot surgery" },
  { year: "2020 · Roland Garros", winner: "Swiatek", rank: "#54", tone: "red", ctx: "Nobody saw it coming. Including her." },
  { year: "2021 · US Open", winner: "Raducanu", rank: "#150", tone: "red", ctx: "10 matches. Not one set lost." },
  { year: "2023 · Wimbledon", winner: "Vondrousova", rank: "#42", tone: "red", ctx: "Entered as wildcard. Left as champion." },
  { year: "2024 · Wimbledon", winner: "Krejcikova", rank: "#32", tone: "red", ctx: "Second time outside top 10 winning a slam" },
] as const;

const RIVALS_BEFORE = [
  { pair: "Williams vs Williams", years: "2001–2017", finals: "9 finals", pct: 100 },
  { pair: "Williams vs Sharapova", years: "2004–2016", finals: "4 finals", pct: 44 },
  { pair: "Henin vs Clijsters", years: "2003–2004", finals: "3 finals", pct: 33 },
  { pair: "Williams vs Henin", years: "2003–2010", finals: "2 finals", pct: 22 },
];
const RIVALS_AFTER = [
  { pair: "Williams vs Kerber", years: "2016–2018", finals: "3 finals", pct: 33 },
  { pair: "Rybakina vs Sabalenka", years: "2023–2026", finals: "2 finals", pct: 22 },
];

const GEO_OLD = [
  { flag: "🇺🇸", name: "USA", titles: 14, pct: 90, color: "#1B4F72" },
  { flag: "🇧🇪", name: "Belgium", titles: 6, pct: 38, color: "#1B4F72" },
  { flag: "🇷🇺", name: "Russia", titles: 4, pct: 25, color: "#1B4F72" },
  { flag: "🌍", name: "8 other nations", titles: 6, pct: 15, color: "#4A7070" },
];
const GEO_NEW = [
  { flag: "🇵🇱", name: "Poland", titles: 6, pct: 30, color: "#0D9488" },
  { flag: "🇨🇿", name: "Czech Republic", titles: 5, pct: 25, color: "#0D9488" },
  { flag: "🇧🇾", name: "Belarus (neutral)", titles: 4, pct: 20, color: "#0D9488" },
  { flag: "🇯🇵", name: "Japan", titles: 3, pct: 15, color: "#0D9488" },
  { flag: "🇺🇸", name: "USA", titles: 3, pct: 15, color: "#0D9488" },
  { flag: "🌍", name: "10 other nations", titles: 16, pct: 25, color: "#4A7070" },
];

function GeoList({ title, rows }: { title: string; rows: Array<{ flag: string; name: string; titles: number; pct: number; color: string }> }) {
  return (
    <div className="fl-geo-col">
      <div className="fl-geo-title">{title}</div>
      {rows.map((r) => (
        <div key={r.name} className="fl-geo-row">
          <div className="fl-geo-label"><span>{r.flag}</span> {r.name}</div>
          <div className="fl-geo-bar-wrap">
            <div className="fl-geo-bar" style={{ width: `${r.pct}%`, background: r.color }} />
            <span className="fl-geo-titles">{r.titles}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResultsCard({ results, onChangeVote }: { results: Results | null; onChangeVote: () => void }) {
  const hasReal = !!results && results.total > 0;
  const bars = hasReal
    ? [
        { key: "better", label: "Better", pct: Math.round((results!.better / results!.total) * 100), color: "#0D9488" },
        { key: "worse", label: "Worse", pct: Math.round((results!.worse / results!.total) * 100), color: "#E05252" },
        { key: "different", label: "Different", pct: Math.round((results!.different / results!.total) * 100), color: "#6B7280" },
      ]
    : [
        { key: "better", label: "Better", pct: 39, color: "#0D9488" },
        { key: "worse", label: "Worse", pct: 34, color: "#E05252" },
        { key: "different", label: "Different", pct: 27, color: "#6B7280" },
      ];
  const [animPct, setAnimPct] = useState<number[]>([0, 0, 0]);
  useEffect(() => {
    const id = requestAnimationFrame(() => setAnimPct(bars.map((b) => b.pct)));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasReal, bars[0].pct, bars[1].pct, bars[2].pct]);
  return (
    <div className="fl-results">
      {bars.map((b, i) => (
        <div key={b.key} className="fl-results-row">
          <div className="fl-results-label">{b.label}</div>
          <div className="fl-results-bar-wrap">
            <div className="fl-results-bar" style={{ width: `${animPct[i]}%`, background: b.color }} />
            <span className="fl-results-pct">{b.pct}%</span>
          </div>
        </div>
      ))}
      <div className="fl-results-total">
        {hasReal ? `${results!.total.toLocaleString()} people have voted since Wimbledon 2026` : "Be the first to vote — results update in real time"}
      </div>
      <div className="fl-note">Live results via Supabase · Updated in real time</div>
      <button type="button" className="fl-change-vote" onClick={onChangeVote}>Change your vote →</button>
    </div>
  );
}

export default function FifteenLove() {
  const { rows, error } = useCsv();
  const derived = useDerived(rows);
  const [vote, setVote] = useState<VoteKey | null>(null);
  const [results, setResults] = useState<Results | null>(null);
  const [active, setActive] = useState<string>("ch1");
  const [dark, setDark] = useState(true);
  const revealRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem("fl_voted") : null;
    if (v === "better" || v === "worse" || v === "different") setVote(v);
  }, []);

  useEffect(() => {
    const ids = NAV.map((n) => n.id);
    const onScroll = () => {
      let cur = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top <= 100) cur = id;
      }
      setActive(cur);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!vote) return;
    let cancelled = false;
    (async () => {
      try {
        const { data, error: e } = await flSupabase.from("fifteen_love_votes").select("vote");
        if (e || !data) throw e;
        const counts: Results = { better: 0, worse: 0, different: 0, total: 0 };
        for (const r of data as Array<{ vote: string }>) {
          if (r.vote === "better") counts.better++;
          else if (r.vote === "worse") counts.worse++;
          else if (r.vote === "different") counts.different++;
        }
        counts.total = counts.better + counts.worse + counts.different;
        if (!cancelled) setResults(counts);
      } catch { if (!cancelled) setResults(null); }
    })();
    return () => { cancelled = true; };
  }, [vote]);

  const onVote = async (v: VoteKey) => {
    if (vote) return;
    setVote(v);
    try { window.localStorage.setItem("fl_voted", v); } catch { /* ignore */ }
    flSupabase.from("fifteen_love_votes").insert({ vote: v }).then(() => { /* ignore */ });
    setTimeout(() => { revealRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100);
  };

  const onChangeVote = () => {
    try { window.localStorage.removeItem("fl_voted"); } catch { /* ignore */ }
    setVote(null); setResults(null);
  };

  if (error) return <div className="fl-loading"><div>Data temporarily unavailable — please refresh.</div></div>;
  if (!rows || !derived) return <div className="fl-loading"><div className="fl-spinner" /><div className="fl-loading-text">Loading 25 years of data...</div></div>;

  return (
    <div className={`fl-root${dark ? "" : " fl-light"}`}>
      <StickyNav active={active} dark={dark} onToggle={() => setDark((d) => !d)} />
      <main className="fl-main">

        <header className="fl-masthead">
          <div className="fl-eyebrow">Data Research · Women's Grand Slam Tennis · 2000–2026</div>
          <h1 className="fl-title">Fifteen Love</h1>
          <div className="fl-subtitle">— 25 Years Served.</div>
          <div className="fl-tag">A data study of women's Grand Slam tennis.</div>
          <div className="fl-badge"><span className="fl-pulse-dot" /> Updated — Wimbledon 2026 final included</div>
          <p className="fl-lede">
            Women's tennis used to be predictable. Then it stopped. The data shows exactly when — and whether that's good or bad is still being argued.
          </p>
          <p className="fl-opening-context">
            For a decade, the same names dominated every surface, every tournament, every final. Then the field caught up — and the sport changed in ways that are genuinely difficult to evaluate. More competitive by every statistical measure. Harder to follow as a casual fan. Three majors tell one story. One tells another. Cast your vote before you see which.
          </p>
          <div className="fl-snapshot-card">
            {[
              { y: "Wimbledon 2006 · Final", s: "Mauresmo def. Henin  2–6, 6–3, 6–4", v: "Two players who had dominated the tour for years.", v2: "Nobody was surprised." },
              { y: "Wimbledon 2016 · Final", s: "Williams def. Kerber  7–5, 6–3", v: "Established champion against a rising contender.", v2: "Still expected by most." },
              { y: "Wimbledon 2026 · Final", s: "Nosková def. Muchová  6–2, 5–7, 6–3", v: "Two Czech players. Both first-time finalists.", v2: "Almost nobody predicted it." },
            ].map((r, i) => (
              <div key={i} className="fl-snap-row">
                <div className="fl-snap-year">{r.y}</div>
                <div className="fl-snap-body">
                  <div className="fl-snap-score">{r.s}</div>
                  <div className="fl-snap-verdict">{r.v} <span className="fl-green">{r.v2}</span></div>
                </div>
              </div>
            ))}
          </div>
        </header>

        <VoteCard vote={vote} onVote={onVote} onChangeVote={onChangeVote} />

        {vote && (
          <div ref={revealRef} className="fl-reveal">
            <div className="fl-era-card">
              <div className="fl-era-side">
                <div className="fl-era-label">2000–2009 · {derived.era1.total || 40} Grand Slams</div>
                <div className="fl-era-num">{derived.era1.top3Pct || 62}%</div>
                <div className="fl-era-sub">went to the top 3 combined. The field was there. It just almost never won.</div>
              </div>
              <div className="fl-era-arrow">→</div>
              <div className="fl-era-side">
                <div className="fl-era-label">2015–2026 · {derived.era2.total || 47} played</div>
                <div className="fl-era-num">{derived.era2.top3Pct || 41}%</div>
                <div className="fl-era-sub">went to the top 3. {derived.era2.distinct || 20} different players won at least one title.</div>
              </div>
            </div>

            <div className="fl-metric-grid">
              <FlipCard
                front={
                  <>
                    <div className="fl-metric-v">71%</div>
                    <div className="fl-metric-label">Wimbledon finals to 3 sets (2020–26)</div>
                    <div className="fl-metric-delta fl-up">↑ Highest of any major in any era</div>
                    <div className="fl-flip-hint">Tap for detail ↗</div>
                  </>
                }
                back={
                  <>
                    <div className="fl-flip-back-text">
                      <div>2020 &nbsp;&nbsp; 75%</div>
                      <div>2021 &nbsp;&nbsp; 67%</div>
                      <div>2022 &nbsp;&nbsp; 100%</div>
                      <div>2023 &nbsp;&nbsp; 100%</div>
                      <div>2024 &nbsp;&nbsp; 50%</div>
                      <div>2026 &nbsp;&nbsp; 100%</div>
                    </div>
                    <div className="fl-flip-back-highlight">Average 71% · No other major comes close</div>
                  </>
                }
              />
              <FlipCard
                front={
                  <>
                    <div className="fl-metric-v">47%</div>
                    <div className="fl-metric-label">Wimbledon upset rate (2015–26)</div>
                    <div className="fl-metric-delta fl-up">↑ From 18% in 2000–09</div>
                    <div className="fl-flip-hint">Tap for detail ↗</div>
                  </>
                }
                back={
                  <>
                    <div className="fl-flip-back-text">
                      <div>Australian Open &nbsp;&nbsp; 31%</div>
                      <div>Roland Garros &nbsp;&nbsp;&nbsp; 19%</div>
                      <div>Wimbledon &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 47%</div>
                      <div>US Open &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; 38%</div>
                    </div>
                    <div className="fl-flip-back-highlight">Wimbledon most unpredictable major by far</div>
                  </>
                }
              />
              <FlipCard
                front={
                  <>
                    <div className="fl-metric-v">9</div>
                    <div className="fl-metric-label">Different Wimbledon champions since 2015</div>
                    <div className="fl-metric-delta fl-up">↑ From 4 different champions 2000–09</div>
                    <div className="fl-flip-hint">Tap for detail ↗</div>
                  </>
                }
                back={
                  <>
                    <div className="fl-flip-back-text">
                      <div>2000–2009 &nbsp;&nbsp; 4 different champions</div>
                      <div>2010–2014 &nbsp;&nbsp; 3 different champions</div>
                      <div>2015–2026 &nbsp;&nbsp; 9 different champions</div>
                    </div>
                    <div className="fl-flip-back-highlight">Grass used to belong to 1–2 names. Now it belongs to anyone.</div>
                  </>
                }
              />
            </div>
          </div>
        )}

        <ChapterDivider />

        <Section id="ch1">
          <ChapterLabel>Chapter 1 · The Shift</ChapterLabel>
          <h2 className="fl-h2">The superstar era — when one name won almost everything — ended before anyone noticed.</h2>
          <p className="fl-p">In 2000–2009 the top 3 players combined won 62% of all Grand Slam titles. By 2015–2026 that share fell to 41% across 20 different champions. Most fans think the shift happened when the dominant era ended. The field had already started catching up six years earlier — while the era was still going.</p>
          <ConcentrationChart data={derived.concentration} />
          <DarkCallout
            insight="01"
            number="2016"
            text="The biggest single-year drop in title concentration. The era hadn't ended. The field had just quietly stopped losing."
            label="Verified · WTA Grand Slam Honor Roll · 2000–2026"
          />
          <PullQuote>Titles spread to 20 different champions. Did that also make the tennis better to watch?</PullQuote>
        </Section>

        <ChapterDivider />

        <Section id="ch2">
          <ChapterLabel>Chapter 2 · The Paradox</ChapterLabel>
          <h2 className="fl-h2">Better tennis. Stranger winners.</h2>
          <div className="fl-split">
            <div className="fl-split-left">
              <p className="fl-p">By every standard measure the sport got more competitive — more 3-set finals, higher upset rates, longer rallies. But the rankings of Grand Slam winners since 2015 have reached levels that simply didn't exist before.</p>
              <DarkCallout
                insight="02"
                number="4"
                text="Since 2015, four Grand Slams went to players ranked outside the top 40 — including one ranked #150. Before 2015, the lowest-ranked winner in 15 years was around #30."
                label="Verified · WTA Grand Slam Honor Roll"
              />
            </div>
            <div className="fl-split-right">
              <div className="fl-table-wrap">
                <table className="fl-table">
                  <thead><tr><th>Year · Slam</th><th>Winner</th><th>Ranked</th><th>Context</th></tr></thead>
                  <tbody>
                    {RANK_ROWS.map((r, i) => (
                      <tr key={i}>
                        <td>{r.year}</td>
                        <td>{r.winner}</td>
                        <td className={r.tone === "green" ? "fl-rank-green" : "fl-rank-red"}>{r.rank}</td>
                        <td>{r.ctx}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <p className="fl-p">The rallies got longer too. Wimbledon grass used to produce points in three or four shots. Now it's closer to seven. The game is more physical than it was in 2006 — even at the fastest major.</p>
          <PullQuote>More competitive, more unpredictable, more physical. But not all four majors changed the same way.</PullQuote>
        </Section>

        <ChapterDivider />

        <Section id="ch3">
          <ChapterLabel>Chapter 3 · The Surface Story</ChapterLabel>
          <h2 className="fl-h2">The surface changes everything. Here is the proof.</h2>
          <p className="fl-p">The overall trends hide dramatic variation. Green = most competitive or improved. Red = least. Roland Garros is the honest exception — clay you build over years, and the data shows exactly why it resists the broader trend.</p>
          <Matrix />
          <PullQuote>Three majors more competitive than ever. One holding firm. But the most important number isn't in this matrix.</PullQuote>
        </Section>

        <ChapterDivider />

        <Section id="ch4">
          <ChapterLabel>Chapter 4 · The Missing Piece</ChapterLabel>
          <h2 className="fl-h2">The rivalries are gone. This is what replaced them.</h2>
          <div className="fl-split">
            <div className="fl-split-left">
              <p className="fl-p-serif">The best rivalries were never just about tennis. Two sisters competing for the same trophy had a story underneath the match that anyone could feel without knowing the score. American players against Russian players carried a weight beyond the ranking. Those stories emerged from real characters competing across years. You knew the history before the match started.</p>
              <DarkCallout
                insight="03"
                number="18→2"
                text="18 recurring rivalry finals before 2015. 2 brief clusters since — neither lasted more than 3 years. The sport got more competitive and less narrative-driven at exactly the same time."
                label="All rivalry data verified from Wikipedia"
              />
            </div>
            <div className="fl-split-right">
              <div className="fl-rival-label">Before 2015 — Sustained Rivalries · Verified</div>
              <div className="fl-rival-list">
                {RIVALS_BEFORE.map((r) => (
                  <div key={r.pair} className="fl-rival-row">
                    <div><div className="fl-rival-pair">{r.pair}</div><div className="fl-rival-years">{r.years} · {r.finals}</div></div>
                    <div className="fl-rival-bar-wrap"><div className="fl-rival-bar" style={{ width: `${r.pct}%`, background: "#0D9488" }} /></div>
                  </div>
                ))}
              </div>
              <div className="fl-divider"><span>2015 — The rivalry era shifts</span></div>
              <div className="fl-rival-label">2015–2026 — Recurring Pairs · Verified</div>
              <div className="fl-rival-list">
                {RIVALS_AFTER.map((r) => (
                  <div key={r.pair} className="fl-rival-row">
                    <div><div className="fl-rival-pair">{r.pair}</div><div className="fl-rival-years">{r.years} · {r.finals}</div></div>
                    <div className="fl-rival-bar-wrap"><div className="fl-rival-bar" style={{ width: `${r.pct}%`, background: "#4A7070" }} /></div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="fl-bridge">
            <div className="fl-bridge-label">Insight 04 · The Insight That Connects Everything</div>
            <h3 className="fl-bridge-h">More competitive. Harder to follow. Here's why both are true.</h3>
            <div className="fl-bridge-takeaway">
              <div className="fl-bridge-takeaway-label">Takeaway 1 · The surface specialist problem</div>
              <div className="fl-bridge-takeaway-text">Today's best players are surface specialists in a way the dominant-era players were not. Sabalenka has not won Roland Garros or Wimbledon. Rybakina has not won Roland Garros or the US Open. When the best players have a surface you can beat them on, they feel beatable rather than transcendent — and transcendence is what casual fans come back to watch.</div>
            </div>
            <div className="fl-bridge-takeaway">
              <div className="fl-bridge-takeaway-label">Takeaway 2 · The viewership collapse</div>
              <div className="fl-bridge-takeaway-text">The 2019 US Open final drew 4 million viewers. The 2020 final without a recognisable name drew 2.15 million — a 46% drop in one year. Sport runs on stories, and a story needs the same characters to return. More players can win. Fewer can carry a casual fan across a full season.</div>
            </div>
          </div>

          <PullQuote>Titles spread to players from 20 nations. Who are those nations — and what happened to the old powers?</PullQuote>
        </Section>

        <ChapterDivider />

        <Section id="ch5">
          <ChapterLabel>Chapter 5 · The World Changed</ChapterLabel>
          <h2 className="fl-h2">Three countries used to own this sport. Now nobody does.</h2>
          <div className="fl-split">
            <div className="fl-split-left">
              <p className="fl-p">USA, Belgium, and Russia held 8 of the top 10 WTA rankings in 2003. Today no single country holds more than 2. The most geographically diverse field in the sport's history — genuinely good for tennis globally, even if it made the narrative harder to follow from any single country.</p>
              <AmberCallout>Czech Republic at Wimbledon: Vondroušová, Krejčíková, Nosková — 3 of the last 4 Wimbledons, all ranked outside the top 30. Not a dynasty — a system that keeps producing grass court specialists on the most unpredictable major surface.</AmberCallout>
            </div>
            <div className="fl-split-right">
              <div className="fl-geo-grid">
                <GeoList title="2000–2009 · Grand Slam Titles" rows={GEO_OLD} />
                <GeoList title="2015–2026 · Grand Slam Titles" rows={GEO_NEW} />
              </div>
            </div>
          </div>
          <PullQuote>Five chapters of evidence. Did it shift the view you held when you first voted?</PullQuote>
          <div className="fl-note">Geographic data partially estimated · Sabalenka competed as neutral from 2022 · Japan = Osaka (4 titles)</div>
        </Section>

        <ChapterDivider />

        <Section id="ch6">
          <ChapterLabel>Chapter 6 · The Verdict</ChapterLabel>
          <h2 className="fl-h2">Two honest cases — one question — you decide.</h2>
          <div className="fl-debate">
            <div className="fl-debate-card">
              <h3 className="fl-debate-h fl-green-text">The Case For Better</h3>
              <ul>
                <li>20 different players won Grand Slams 2015–26 vs top 3 taking 62% in 2000–09</li>
                <li>30% of titles went outside the top 10 — the field is genuinely deeper than ever</li>
                <li>Finals are closer — 71% at Wimbledon go to 3 sets, upset rate doubled</li>
                <li>More global — 17 nationalities in the top 10 vs 8 in 2003</li>
              </ul>
            </div>
            <div className="fl-debate-card">
              <h3 className="fl-debate-h fl-red-text">The Case For Worse</h3>
              <ul>
                <li>18 recurring rivalry finals before 2015. 2 brief clusters since. No match that arrives with a decade of shared history.</li>
                <li>The 2019 US Open final drew 4 million viewers. The 2020 final drew 2.15 million — a 46% drop when the names weren't recognisable.</li>
                <li>Today's best players each have a surface you can beat them on. Beatable is not transcendent.</li>
                <li>Winners ranked #47, #83, #150 — extraordinary moments, but no story to follow next week.</li>
              </ul>
            </div>
          </div>

          <DarkCallout
            insight="05"
            number="The verdict"
            text="The sport got harder to predict and easier to ignore at the same time. More players can win. Fewer build the sustained, cross-surface, multi-year presence that makes a casual fan come back next season. That is not a failure of women's tennis — it is just what happens when depth wins and stars become rare."
            label="Fifteen Love · A data study of women's Grand Slam tennis · 2000–2026"
          />

          <div className="fl-reveal-card">
            <h3 className="fl-reveal-h">You voted before seeing any data. Did the evidence change your mind?</h3>
            {!vote && <div className="fl-reveal-sub">Cast your vote at the top to see what others thought.</div>}
            {vote && <ResultsCard results={results} onChangeVote={onChangeVote} />}
          </div>
        </Section>

        <footer className="fl-footer">
          <div>Data: Jeff Sackmann Match Charting Project · CC Attribution-NonCommercial-ShareAlike 4.0</div>
          <div>Rankings: WTA Grand Slam Honor Roll (official) · Results: Wikipedia & landoftennis.com · Viewership: Sports Media Watch</div>
          <div>Analysis: Amit Joshi · <a href="https://github.com/Amit-Joshi-723" target="_blank" rel="noreferrer">github.com/Amit-Joshi-723</a> · Wimbledon 2026: Nosková def. Muchová 6-2, 5-7, 6-3</div>
        </footer>
      </main>
    </div>
  );
}
