import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const MONTH_NAMES = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre",
];
const WEEKDAY_LABELS = ["L", "M", "M", "G", "V", "S", "D"];
const CELL = 30; // px, lato di ogni casella - calendario compatto invece che a piena larghezza
const GAP = 3;

interface DayStat {
  date: string;
  km: number;
  liters: number;
  durationMin: number;
  tripCount: number;
  avgConsumption: number | null;
}

function formatDuration(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rest = Math.round(min % 60);
  return rest > 0 ? `${h}h ${rest}min` : `${h}h`;
}

function formatDayFull(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

// Calendario mensile compatto: il consumo medio del giorno e' scritto direttamente nella
// casella (non serve piu' passarci sopra), cliccando un giorno si filtra la lista viaggi
// nella pagina (vedi Trips.tsx - selectedDate/onSelectDate sono sollevati li' perche' e'
// quella pagina a possedere la query della lista).
export function CalendarHeatmap({
  vehicleId,
  selectedDate,
  onSelectDate,
}: {
  vehicleId: string;
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [days, setDays] = useState<DayStat[] | null>(null);

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

  const gridWidth = CELL * 7 + GAP * 6;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between" style={{ maxWidth: gridWidth + 16, margin: "0 auto 12px" }}>
        <p className="text-sm font-medium">Giorni guidati</p>
        <div className="flex items-center gap-1.5 text-xs text-onsurface-variant">
          <button onClick={() => shiftMonth(-1)} className="rounded border border-surface-border px-1.5 py-0.5 hover:text-onsurface">
            ←
          </button>
          <span className="w-16 text-center tabular-nums text-[11px]">{MONTH_NAMES[month].slice(0, 3)} {year}</span>
          <button onClick={() => shiftMonth(1)} className="rounded border border-surface-border px-1.5 py-0.5 hover:text-onsurface">
            →
          </button>
        </div>
      </div>

      {days === null ? (
        <p className="text-sm text-onsurface-variant">Caricamento...</p>
      ) : (
        <div
          className="mx-auto grid"
          style={{ gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP, width: gridWidth }}
        >
          {WEEKDAY_LABELS.map((w, i) => (
            <div key={i} className="text-center text-[9px] text-onsurface-variant">
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} style={{ width: CELL, height: CELL }} />;
            const stat = byDate.get(date);
            const dayNum = Number(date.slice(8, 10));
            const km = stat?.km ?? 0;
            const bg = km > 0 ? `rgba(0,191,255,${0.12 + 0.68 * (km / maxKm)})` : "rgba(255,255,255,0.03)";
            const isSelected = date === selectedDate;
            const title = stat
              ? `${stat.km.toFixed(1)} km · ${stat.tripCount} ${stat.tripCount === 1 ? "viaggio" : "viaggi"}${
                  stat.avgConsumption != null ? ` · ${stat.avgConsumption.toFixed(1)} km/l` : ""
                }`
              : "Nessun viaggio";
            return (
              <button
                key={date}
                title={title}
                onClick={() => onSelectDate(isSelected ? null : date)}
                className="flex flex-col items-center justify-center rounded transition"
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: bg,
                  outline: isSelected ? "2px solid #00BFFF" : undefined,
                  outlineOffset: -2,
                }}
              >
                <span className="text-[8px] leading-none text-onsurface-variant">{dayNum}</span>
                {stat?.avgConsumption != null && (
                  <span className="text-[9px] font-semibold leading-tight tabular-nums text-onsurface">
                    {stat.avgConsumption.toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <div className="mx-auto mt-4" style={{ maxWidth: gridWidth + 120 }}>
          <p className="mb-2 text-center text-xs text-onsurface-variant">{formatDayFull(selectedDate)}</p>
          {(() => {
            const stat = byDate.get(selectedDate);
            if (!stat || stat.tripCount === 0) {
              return <p className="text-center text-sm text-onsurface-variant">Nessun viaggio questo giorno.</p>;
            }
            return (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <DayStatTile label="Km percorsi" value={stat.km.toFixed(1)} />
                <DayStatTile label="Consumo medio" value={stat.avgConsumption != null ? `${stat.avgConsumption.toFixed(1)} km/l` : "–"} />
                <DayStatTile label="Carburante" value={`${stat.liters.toFixed(2)} L`} />
                <DayStatTile label="Tempo alla guida" value={formatDuration(stat.durationMin)} />
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

function DayStatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-surface-border bg-bg/40 px-2 py-2 text-center">
      <p className="text-sm font-semibold tabular-nums text-onsurface">{value}</p>
      <p className="text-[10px] text-onsurface-variant">{label}</p>
    </div>
  );
}
