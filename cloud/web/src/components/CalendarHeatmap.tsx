import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { IconRoute, IconGauge, IconFuel, IconClock } from "./icons";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";

const MONTH_KEYS: TranslationKey[] = [
  "calendar.month0", "calendar.month1", "calendar.month2", "calendar.month3",
  "calendar.month4", "calendar.month5", "calendar.month6", "calendar.month7",
  "calendar.month8", "calendar.month9", "calendar.month10", "calendar.month11",
];
const WEEKDAY_KEYS: TranslationKey[] = [
  "calendar.weekday0", "calendar.weekday1", "calendar.weekday2", "calendar.weekday3",
  "calendar.weekday4", "calendar.weekday5", "calendar.weekday6",
];
const CELL = 42; // px, lato di ogni casella - compatto ma leggibile, non a piena larghezza
const GAP = 5;

interface DayStat {
  date: string;
  km: number;
  liters: number;
  durationMin: number;
  tripCount: number;
  avgConsumption: number | null;
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
  const { t, locale } = useLanguage();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [days, setDays] = useState<DayStat[] | null>(null);

  useEffect(() => {
    setDays(null);
    api.statsCalendar(vehicleId, year).then((r) => setDays(r.days));
  }, [vehicleId, year]);

  function formatDuration(min: number): string {
    if (min < 60) return t("calendar.durationMinutesOnly", { m: min });
    const h = Math.floor(min / 60);
    const rest = Math.round(min % 60);
    return rest > 0 ? t("calendar.durationHoursMinutes", { h, m: rest }) : t("calendar.durationHoursOnly", { h });
  }

  function formatDayFull(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
  }

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

  const selectedStat = selectedDate ? byDate.get(selectedDate) : undefined;

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-4">
      <div className="mb-4 flex items-center justify-between" style={{ maxWidth: gridWidth + 16, margin: "0 auto 16px" }}>
        <p className="text-sm font-medium">{t("calendar.title")}</p>
        <div className="flex items-center gap-2 text-xs text-onsurface-variant">
          <button onClick={() => shiftMonth(-1)} className="rounded border border-surface-border px-2 py-1 hover:border-accent hover:text-onsurface">
            ←
          </button>
          <span className="w-20 text-center tabular-nums text-[13px] text-onsurface">{t(MONTH_KEYS[month])} {year}</span>
          <button onClick={() => shiftMonth(1)} className="rounded border border-surface-border px-2 py-1 hover:border-accent hover:text-onsurface">
            →
          </button>
        </div>
      </div>

      {days === null ? (
        <p className="text-sm text-onsurface-variant">{t("common.loading")}</p>
      ) : (
        <div
          className="mx-auto grid"
          style={{ gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP, width: gridWidth }}
        >
          {WEEKDAY_KEYS.map((w, i) => (
            <div key={i} className="text-center text-[11px] text-onsurface-variant">
              {t(w)}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={i} style={{ width: CELL, height: CELL }} />;
            const stat = byDate.get(date);
            const dayNum = Number(date.slice(8, 10));
            const km = stat?.km ?? 0;
            const bg = km > 0 ? `rgba(0,191,255,${0.14 + 0.66 * (km / maxKm)})` : "rgba(255,255,255,0.04)";
            const isSelected = date === selectedDate;
            const title = stat
              ? `${stat.km.toFixed(1)} km · ${stat.tripCount} ${t(stat.tripCount === 1 ? "calendar.tripSingular" : "calendar.tripPlural")}${
                  stat.avgConsumption != null ? ` · ${stat.avgConsumption.toFixed(1)} km/l` : ""
                }`
              : t("calendar.noTrips");
            return (
              <button
                key={date}
                title={title}
                onClick={() => onSelectDate(isSelected ? null : date)}
                className="flex flex-col items-center justify-center gap-0.5 rounded-md transition"
                style={{
                  width: CELL,
                  height: CELL,
                  backgroundColor: bg,
                  outline: isSelected ? "2px solid #00BFFF" : "1px solid rgba(255,255,255,0.06)",
                  outlineOffset: -1,
                }}
              >
                <span className="text-[10px] leading-none text-onsurface-variant">{dayNum}</span>
                {stat?.avgConsumption != null && (
                  <span className="text-[11px] font-semibold leading-none tabular-nums text-onsurface">
                    {stat.avgConsumption.toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selectedDate && (
        <div className="mx-auto mt-5" style={{ maxWidth: gridWidth + 140 }}>
          <p className="mb-2 text-center text-xs text-onsurface-variant">{formatDayFull(selectedDate)}</p>
          {!selectedStat || selectedStat.tripCount === 0 ? (
            <p className="text-center text-sm text-onsurface-variant">{t("calendar.noTripsThisDay")}</p>
          ) : (
            <div className="flex items-stretch rounded-lg border border-surface-border bg-bg/40 p-3">
              <DayStatBlock icon={<IconRoute size={18} />} value={`${selectedStat.km.toFixed(1)} km`} label={t("calendar.statDistance")} />
              <Divider />
              <DayStatBlock
                icon={<IconGauge size={18} />}
                value={selectedStat.avgConsumption != null ? `${selectedStat.avgConsumption.toFixed(1)} km/l` : "–"}
                label={t("calendar.statConsumption")}
              />
              <Divider />
              <DayStatBlock icon={<IconFuel size={18} />} value={`${selectedStat.liters.toFixed(2)} L`} label={t("calendar.statFuel")} />
              <Divider />
              <DayStatBlock icon={<IconClock size={18} />} value={formatDuration(selectedStat.durationMin)} label={t("calendar.statDuration")} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Divider() {
  return <div className="h-14 w-px bg-surface-border" />;
}

function DayStatBlock({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 py-1">
      <span className="text-accent">{icon}</span>
      <span className="text-[15px] font-bold tabular-nums text-onsurface">{value}</span>
      <span className="text-[11px] text-onsurface-variant">{label}</span>
    </div>
  );
}
