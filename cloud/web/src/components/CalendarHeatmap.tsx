import { useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { IconRoute, IconGauge, IconFuel, IconClock } from "./icons";
import { Collapsible } from "./Collapsible";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";
import { useUnits } from "../lib/UnitsContext";
import { formatDistance, formatConsumption, toDisplayConsumption } from "../lib/units";

const MONTH_KEYS: TranslationKey[] = [
  "calendar.month0", "calendar.month1", "calendar.month2", "calendar.month3",
  "calendar.month4", "calendar.month5", "calendar.month6", "calendar.month7",
  "calendar.month8", "calendar.month9", "calendar.month10", "calendar.month11",
];
const WEEKDAY_KEYS: TranslationKey[] = [
  "calendar.weekday0", "calendar.weekday1", "calendar.weekday2", "calendar.weekday3",
  "calendar.weekday4", "calendar.weekday5", "calendar.weekday6",
];
// Larghezza massima del calendario (etichetta mesi + griglia) su schermi larghi - le celle
// stesse sono a griglia fluida (repeat(7, minmax(0,1fr)) + aspect-square), non piu' a
// dimensione fissa in px: la versione a pixel fissi (42px/cella) andava in overflow sotto
// ~390px di larghezza (trovato con uno screenshot mobile reale - la card contenitore su un
// telefono da 360px lascia solo ~296px liberi dopo il proprio padding, meno dei 324px che la
// griglia a celle fisse richiedeva sempre).
const MAX_WIDTH = 320;
const DETAIL_MAX_WIDTH = 440;

interface DayStat {
  date: string;
  km: number;
  liters: number;
  durationMin: number;
  tripCount: number;
  avgConsumption: number | null;
}

// Calendario mensile compatto: il consumo medio del giorno e' scritto direttamente nella
// casella (non serve piu' passarci sopra), cliccando un giorno si filtra la lista viaggi e
// le statistiche nella pagina (vedi Trips.tsx - rangeFrom/rangeTo/onRangeChange sollevati
// li' perche' e' quella pagina a possedere la query della lista).
//
// Due modalita' di click sulla griglia:
// - normale: click su un giorno lo seleziona da solo (rangeFrom=rangeTo=quel giorno),
//   ri-click lo deseleziona - comportamento originale, invariato.
// - "Periodo" (bottone dedicato, richiesto dall'utente 2026-08-01 al posto di due campi
//   data separati sotto la lista viaggi): primo click = inizio, secondo click = fine
//   (ordine libero, riordinati se il secondo click e' prima del primo). Colore dedicato
//   (arancio, token "warn" gia' in tailwind.config) per non confondersi con l'intensita'
//   km della casella (blu) ne' con l'evidenziazione del giorno singolo.
export function CalendarHeatmap({
  vehicleId,
  rangeFrom,
  rangeTo,
  onRangeChange,
  className,
}: {
  vehicleId: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  onRangeChange: (from: string | null, to: string | null) => void;
  className?: string;
}) {
  const { t, locale } = useLanguage();
  const { distanceUnit, consumptionFormat } = useUnits();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [days, setDays] = useState<DayStat[] | null>(null);
  const [periodMode, setPeriodMode] = useState(false);
  // Giorno di inizio gia' cliccato in modalita' Periodo, in attesa del secondo click (fine) -
  // stato locale, non sollevato: e' solo un dettaglio dell'interazione con la griglia, non
  // un filtro attivo finche' non c'e' anche la fine (vedi handleDayClick()).
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const isSingleDay = rangeFrom != null && rangeFrom === rangeTo;
  const isRealRange = rangeFrom != null && rangeTo != null && rangeFrom !== rangeTo;

  function togglePeriodMode() {
    setPeriodMode((m) => !m);
    setPendingStart(null);
  }

  function clearRange() {
    onRangeChange(null, null);
    setPendingStart(null);
  }

  function handleDayClick(date: string) {
    if (!periodMode) {
      const isExact = rangeFrom === date && rangeTo === date;
      onRangeChange(isExact ? null : date, isExact ? null : date);
      return;
    }
    if (pendingStart == null) {
      setPendingStart(date);
      onRangeChange(date, date); // feedback immediato mentre si attende il secondo click
    } else if (pendingStart === date) {
      // Ri-click sullo stesso giorno di inizio: annulla invece di creare un periodo di un
      // solo giorno "per sbaglio" - per quello c'e' gia' la modalita' normale.
      setPendingStart(null);
      onRangeChange(null, null);
    } else {
      const [start, end] = pendingStart < date ? [pendingStart, date] : [date, pendingStart];
      onRangeChange(start, end);
      setPendingStart(null);
    }
  }

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

  const selectedStat = isSingleDay && rangeFrom ? byDate.get(rangeFrom) : undefined;
  // Aggregato del periodo (solo sui giorni dell'anno correntemente mostrato che hanno gia'
  // un dato - se il periodo scavalca un anno diverso da quello caricato qui, quella parte
  // non e' inclusa in QUESTO riepilogo: la lista viaggi sotto, che interroga il server, resta
  // comunque corretta su tutto l'intervallo).
  const rangeDays = useMemo(() => {
    if (!isRealRange || !rangeFrom || !rangeTo) return [];
    return Array.from(byDate.values()).filter((d) => d.date >= rangeFrom && d.date <= rangeTo);
  }, [byDate, isRealRange, rangeFrom, rangeTo]);
  const rangeAgg = rangeDays.length > 0
    ? {
        km: rangeDays.reduce((s, d) => s + d.km, 0),
        liters: rangeDays.reduce((s, d) => s + d.liters, 0),
        durationMin: rangeDays.reduce((s, d) => s + d.durationMin, 0),
        tripCount: rangeDays.reduce((s, d) => s + d.tripCount, 0),
      }
    : null;
  const rangeAvg = rangeAgg && rangeAgg.liters > 0 ? rangeAgg.km / rangeAgg.liters : null;

  const headerControls = (
    <div className="flex flex-wrap items-center gap-2 text-xs text-onsurface-variant">
      <button
        onClick={togglePeriodMode}
        className={`rounded border px-2 py-1 ${
          periodMode ? "border-warn text-warn" : "border-surface-border hover:border-accent hover:text-onsurface"
        }`}
      >
        {t("calendar.periodMode")}
      </button>
      {(rangeFrom || rangeTo) && (
        <button
          onClick={clearRange}
          title={t("calendar.clearRange")}
          className="rounded border border-surface-border px-2 py-1 hover:border-accent hover:text-onsurface"
        >
          ✕
        </button>
      )}
      <div className="flex items-center gap-2">
        <button onClick={() => shiftMonth(-1)} className="rounded border border-surface-border px-2 py-1 hover:border-accent hover:text-onsurface">
          ←
        </button>
        <span className="w-20 text-center tabular-nums text-[13px] text-onsurface">{t(MONTH_KEYS[month])} {year}</span>
        <button onClick={() => shiftMonth(1)} className="rounded border border-surface-border px-2 py-1 hover:border-accent hover:text-onsurface">
          →
        </button>
      </div>
    </div>
  );

  return (
    <Collapsible className={className} id="calendarHeatmap" title={t("calendar.title")} headerExtra={headerControls}>
      <p className="mb-3 text-xs text-onsurface-variant">
        {periodMode ? (pendingStart == null ? t("calendar.periodHintStart") : t("calendar.periodHintEnd")) : t("calendar.periodHintOff")}
      </p>
      {days === null ? (
        <p className="text-sm text-onsurface-variant">{t("common.loading")}</p>
      ) : (
        <div
          className="mx-auto grid w-full grid-cols-7 gap-1.5"
          style={{ maxWidth: MAX_WIDTH }}
        >
          {WEEKDAY_KEYS.map((w, i) => (
            <div key={i} className="text-center text-[11px] text-onsurface-variant">
              {t(w)}
            </div>
          ))}
          {cells.map((date, i) => {
            // Placeholder vuoto (giorni prima dell'1 del mese) - stesso ingombro di una
            // casella vera (aspect-square, non piu' un width/height fisso in px) cosi' la
            // griglia resta allineata a qualunque larghezza.
            if (!date) return <div key={i} className="aspect-square" />;
            const stat = byDate.get(date);
            const dayNum = Number(date.slice(8, 10));
            const km = stat?.km ?? 0;
            const bg = km > 0 ? `rgba(0,191,255,${0.14 + 0.66 * (km / maxKm)})` : "rgba(255,255,255,0.04)";
            const isEndpoint = date === rangeFrom || date === rangeTo || date === pendingStart;
            const isBetween = isRealRange && !!rangeFrom && !!rangeTo && date > rangeFrom && date < rangeTo;
            const outline = isEndpoint
              ? "2px solid #FB8C00"
              : isBetween
                ? "1px solid rgba(251,140,0,0.6)"
                : "1px solid rgba(255,255,255,0.06)";
            const title = stat
              ? `${formatDistance(stat.km, distanceUnit)} · ${stat.tripCount} ${t(stat.tripCount === 1 ? "calendar.tripSingular" : "calendar.tripPlural")}${
                  stat.avgConsumption != null ? ` · ${formatConsumption(stat.avgConsumption, distanceUnit, consumptionFormat)}` : ""
                }`
              : t("calendar.noTrips");
            return (
              <button
                key={date}
                title={title}
                onClick={() => handleDayClick(date)}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md transition"
                style={{
                  backgroundColor: isBetween ? "rgba(251,140,0,0.12)" : bg,
                  outline,
                  outlineOffset: -1,
                }}
              >
                <span className="text-[10px] leading-none text-onsurface-variant">{dayNum}</span>
                {stat?.avgConsumption != null && (
                  <span className="text-[11px] font-semibold leading-none tabular-nums text-onsurface">
                    {toDisplayConsumption(stat.avgConsumption, distanceUnit, consumptionFormat).toFixed(1)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {isSingleDay && rangeFrom && (
        <div className="mx-auto mt-5 w-full" style={{ maxWidth: DETAIL_MAX_WIDTH }}>
          <p className="mb-2 text-center text-xs text-onsurface-variant">{formatDayFull(rangeFrom)}</p>
          {!selectedStat || selectedStat.tripCount === 0 ? (
            <p className="text-center text-sm text-onsurface-variant">{t("calendar.noTripsThisDay")}</p>
          ) : (
            <div className="flex items-stretch rounded-lg border border-surface-border bg-bg/40 p-3">
              <DayStatBlock icon={<IconRoute size={18} />} value={formatDistance(selectedStat.km, distanceUnit)} label={t("calendar.statDistance")} />
              <Divider />
              <DayStatBlock
                icon={<IconGauge size={18} />}
                value={selectedStat.avgConsumption != null ? formatConsumption(selectedStat.avgConsumption, distanceUnit, consumptionFormat) : "–"}
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

      {isRealRange && rangeFrom && rangeTo && (
        <div className="mx-auto mt-5 w-full" style={{ maxWidth: DETAIL_MAX_WIDTH }}>
          <p className="mb-2 text-center text-xs text-onsurface-variant">
            {t("calendar.rangeSelected", { from: formatDayFull(rangeFrom), to: formatDayFull(rangeTo) })}
          </p>
          {!rangeAgg || rangeAgg.tripCount === 0 ? (
            <p className="text-center text-sm text-onsurface-variant">{t("calendar.noTripsThisDay")}</p>
          ) : (
            <div className="flex items-stretch rounded-lg border border-surface-border bg-bg/40 p-3">
              <DayStatBlock icon={<IconRoute size={18} />} value={formatDistance(rangeAgg.km, distanceUnit)} label={t("calendar.statDistance")} />
              <Divider />
              <DayStatBlock
                icon={<IconGauge size={18} />}
                value={rangeAvg != null ? formatConsumption(rangeAvg, distanceUnit, consumptionFormat) : "–"}
                label={t("calendar.statConsumption")}
              />
              <Divider />
              <DayStatBlock icon={<IconFuel size={18} />} value={`${rangeAgg.liters.toFixed(2)} L`} label={t("calendar.statFuel")} />
              <Divider />
              <DayStatBlock icon={<IconClock size={18} />} value={formatDuration(rangeAgg.durationMin)} label={t("calendar.statDuration")} />
            </div>
          )}
        </div>
      )}
    </Collapsible>
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
