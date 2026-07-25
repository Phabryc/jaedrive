import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

interface DayStat {
  date: string;
  km: number;
  tripCount: number;
  avgConsumption: number | null;
}

// Calendario mensile (non piu' l'intero anno in un'unica griglia ECharts) - piu' leggibile
// per capire a colpo d'occhio un singolo mese, con il consumo medio del giorno visibile
// passandoci sopra, non solo i km.
export function CalendarHeatmap({ vehicleId }: { vehicleId: string }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [days, setDays] = useState<DayStat[] | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  useEffect(() => {
    setDays(null);
    api.statsCalendar(vehicleId, year).then((r) => setDays(r.days));
  }, [vehicleId, year]);

  function shiftMonth(delta: number) {
    let m = month + delta;
    let y = year;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setMonth(m);
    setYear(y);
    setActiveDate(null);
  }

  const byDate = useMemo(() => {
    const m = new Map<string, DayStat>();
    for (const d of days ?? []) m.set(d.date, d);
    return m;
  }, [days]);

  const monthDays = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    return Array.from(byDate.values()).filter((d) => d.date.startsWith(prefix));
  }, [byDate, year, month]);

  const maxKm = Math.max(1, ...monthDays.map((d) => d.km));

  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // getUTCDay(): 0=domenica..6=sabato -> indice lun-first (0=lun..6=dom)
  const leadingBlanks = (firstOfMonth.getUTCDay() + 6) % 7;

  const cells: (string | null)[] = [
    ...Array(leadingBlanks).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const active = activeDate ? byDate.get(activeDate) : undefined;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium">Giorni guidati</p>
        <div className="flex items-center gap-2 text-xs text-onsurface-variant">
          <button onClick={() => shiftMonth(-1)} className="rounded border border-surface-border px-2 py-0.5 hover:text-onsurface">
            ←
          </button>
          <span className="w-28 text-center tabular-nums">{MONTH_NAMES[month]} {year}</span>
          <button onClick={() => shiftMonth(1)} className="rounded border border-surface-border px-2 py-0.5 hover:text-onsurface">
            →
          </button>
        </div>
      </div>

      {days === null ? (
        <p className="text-sm text-onsurface-variant">Caricamento...</p>
      ) : (
        <>
          <div className="grid grid-cols-7 gap-1.5 text-center">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="text-[11px] text-onsurface-variant">
                {w}
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={i} />;
              const stat = byDate.get(date);
              const dayNum = Number(date.slice(8, 10));
              const km = stat?.km ?? 0;
              const bg = km > 0 ? `rgba(0,191,255,${0.12 + 0.68 * (km / maxKm)})` : "rgba(255,255,255,0.03)";
              const isActive = date === activeDate;
              return (
                <button
                  key={date}
                  onMouseEnter={() => setActiveDate(date)}
                  onClick={() => setActiveDate(date)}
                  className="flex aspect-square items-center justify-center rounded text-xs tabular-nums transition"
                  style={{
                    backgroundColor: bg,
                    outline: isActive ? "1px solid #00BFFF" : undefined,
                    color: km > 0 ? "#E5E2E1" : "#BCC8D1",
                  }}
                >
                  {dayNum}
                </button>
              );
            })}
          </div>

          <div className="mt-3 min-h-[1.25rem] text-xs text-onsurface-variant">
            {active ? (
              active.km > 0 ? (
                <span>
                  <span className="text-onsurface">{formatDate(active.date)}</span> — {active.km.toFixed(1)} km ·{" "}
                  {active.tripCount} {active.tripCount === 1 ? "viaggio" : "viaggi"}
                  {active.avgConsumption != null && <> · {active.avgConsumption.toFixed(1)} km/l</>}
                </span>
              ) : (
                <span>{formatDate(active.date)} — nessun viaggio</span>
              )
            ) : (
              <span>Passa il mouse (o tocca) un giorno per i dettagli.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}
