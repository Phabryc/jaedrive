import { Link } from "react-router-dom";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { StaticHeader } from "../components/StaticHeader";
import { buttonVariants } from "../components/Button";

// ─── icons (inline SVG per zero deps aggiuntive) ──────────────────────────────

function IconCheck({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function IconX({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="currentColor" width="16" height="16">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function IconLock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

type FeatureRow = {
  itLabel: string;
  enLabel: string;
  free: string | boolean;
  standard: string | boolean;
  garage: string | boolean;
};

const TABLE_ROWS: FeatureRow[] = [
  {
    itLabel: "Posti auto nel garage cloud",
    enLabel: "Cloud garage slots",
    free: false,
    standard: "1",
    garage: "3",
  },
  {
    itLabel: "Sincronizzazione viaggi cloud",
    enLabel: "Cloud trip sync",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Storico viaggi",
    enLabel: "Trip history",
    free: "7 giorni / 7 days",
    standard: "Illimitato / Unlimited",
    garage: "Illimitato / Unlimited",
  },
  {
    itLabel: "Analisi & telemetria avanzata",
    enLabel: "Advanced analytics & telemetry",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Heatmap, SOC, costi, efficienza",
    enLabel: "Heatmap, SOC, costs, efficiency",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Export GPX (con estensioni JaeDrive)",
    enLabel: "GPX export (with JaeDrive extensions)",
    free: "Base (solo lat/lon/time)",
    standard: true,
    garage: true,
  },
  {
    itLabel: "Export CSV e PDF",
    enLabel: "CSV and PDF export",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Overlay status bar in-car",
    enLabel: "In-car status bar overlay",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Popup regen & rifornimento",
    enLabel: "Regen & refuel popups",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Avviso scadenza abbonamento",
    enLabel: "Subscription expiry warning",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Cambi headunit (365 giorni)",
    enLabel: "Headunit swaps (365 days)",
    free: "N/A",
    standard: "Max 2",
    garage: "Max 5",
  },
  {
    itLabel: "Re-pairing senza penalità",
    enLabel: "Re-pairing without penalty",
    free: false,
    standard: true,
    garage: true,
  },
  {
    itLabel: "Supporto Lifetime",
    enLabel: "Lifetime subscription",
    free: false,
    standard: true,
    garage: true,
  },
];

// ─── Cell helper ──────────────────────────────────────────────────────────────

function Cell({ value, highlight = false }: { value: string | boolean; highlight?: boolean }) {
  if (value === true)
    return (
      <span className={`inline-flex items-center justify-center ${highlight ? "text-emerald-400" : "text-green-500"}`}>
        <IconCheck />
      </span>
    );
  if (value === false)
    return (
      <span className="inline-flex items-center justify-center text-white/20">
        <IconX />
      </span>
    );
  return <span className={`text-xs font-medium ${highlight ? "text-amber-300" : "text-white/70"}`}>{value}</span>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Plans() {
  const { lang, t } = useLanguage();
  const it = lang === "it";

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <StaticHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24">
        {/* ── Hero ── */}
        <section className="pt-16 pb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {it ? "Scegli il tuo piano" : "Choose your plan"}
          </p>
          <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-5xl">
            {it
              ? <>L'app è gratis.<br />Il cloud è Premium.</>
              : <>The app is free.<br />The cloud is Premium.</>}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-onsurface-variant sm:text-lg">
            {it
              ? "JaeDrive funziona sull'headunit anche senza un account. Per sincronizzare i dati nel cloud, accedere all'analisi avanzata e sbloccare tutte le funzionalità serve un piano Premium."
              : "JaeDrive works on your headunit without an account. Cloud sync, advanced analytics, and the full feature set require a Premium plan."}
          </p>
        </section>

        {/* ── Sezione 1: App Gratuita ── */}
        <section className="mb-16">
          <div className="rounded-2xl border border-surface-border bg-surface p-8 sm:p-10">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/60">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="20" height="20">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
              </div>
              <div>
                <span className="mb-1 inline-block rounded-full border border-white/10 bg-white/5 px-3 py-0.5 text-xs font-medium text-white/60">
                  {it ? "🟢 Gratuito — sempre" : "🟢 Free — always"}
                </span>
                <h2 className="mt-2 text-xl font-semibold">
                  {it ? "JaeDrive sull'headunit, senza limiti di tempo" : "JaeDrive on the headunit, no time limits"}
                </h2>
                <p className="mt-3 max-w-2xl leading-relaxed text-onsurface-variant">
                  {it
                    ? "Installi l'app, l'auto si collega e i dati cominciano a scorrere. Niente account obbligatorio, niente scadenze, niente da pagare per usare JaeDrive sulla tua Jaecoo o Omoda."
                    : "Install the app, the car connects, and data starts flowing. No mandatory account, no expiration, nothing to pay to use JaeDrive on your Jaecoo or Omoda."}
                </p>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {(it
                    ? [
                        "Dati reali dal bus veicolo (non stime)",
                        "Modalità di guida, SOC, flusso energia ibrida",
                        "Registrazione automatica di tutti i viaggi GPS",
                        "Storico viaggi degli ultimi 7 giorni",
                        "Export GPX base (lat/lon/time)",
                        "Funziona offline, senza internet",
                      ]
                    : [
                        "Real data from the vehicle bus (not estimates)",
                        "Drive mode, SOC, hybrid energy flow",
                        "Automatic GPS trip recording",
                        "7-day trip history",
                        "Basic GPX export (lat/lon/time)",
                        "Works offline, no internet needed",
                      ]
                  ).map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-onsurface-variant">
                      <IconCheck className="mt-0.5 shrink-0 text-green-500" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── Sezione 2: Premium ── */}
        <section className="mb-6">
          <div className="mb-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">
              {it ? "Sblocca tutto" : "Unlock everything"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {it ? "Il cloud porta JaeDrive un livello più in alto" : "The cloud takes JaeDrive one level higher"}
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-onsurface-variant">
              {it
                ? "Associa la tua auto all'account e i dati si sincronizzano automaticamente su jaedrive.com. Nessuna importazione manuale: ogni viaggio finisce nel cloud da solo."
                : "Pair your car to your account and data syncs automatically to jaedrive.com. No manual import: every trip lands in the cloud on its own."}
            </p>
          </div>
        </section>

        {/* ── Cards Premium ── */}
        <section className="mb-20 grid gap-4 sm:grid-cols-2">
          {/* Standard */}
          <div className="relative overflow-hidden rounded-2xl border border-accent/40 bg-surface p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-semibold text-accent">
              👑 {it ? "Premium Standard" : "Premium Standard"}
            </span>
            <h3 className="mt-1 text-lg font-semibold">
              {it ? "La tua auto, in tasca ovunque" : "Your car, in your pocket everywhere"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-onsurface-variant">
              {it
                ? "Perfetto per chi ha un'auto e vuole accesso completo alla telemetria, al cloud e all'analisi storica senza limite di tempo."
                : "Perfect for owners of a single car who want full telemetry access, cloud sync, and unlimited history."}
            </p>
            <ul className="mt-5 space-y-2">
              {(it
                ? [
                    "1 posto auto nel garage cloud",
                    "Sincronizzazione cloud automatica",
                    "Storico viaggi illimitato",
                    "Analisi avanzata: heatmap, costi, efficienza",
                    "Export GPX completo + CSV + PDF",
                    "Overlay status bar in-car",
                    "Popup regen & rifornimento",
                    "Max 2 cambi headunit / 365 giorni",
                  ]
                : [
                    "1 cloud garage slot",
                    "Automatic cloud sync",
                    "Unlimited trip history",
                    "Advanced analytics: heatmap, costs, efficiency",
                    "Full GPX export + CSV + PDF",
                    "In-car status bar overlay",
                    "Regen & refuel popups",
                    "Max 2 headunit swaps / 365 days",
                  ]
              ).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-onsurface-variant">
                  <IconCheck className="mt-0.5 shrink-0 text-accent" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Garage */}
          <div className="relative overflow-hidden rounded-2xl border border-emerald-500/40 bg-surface p-8">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
              🏎️ {it ? "Premium Garage" : "Premium Garage"}
            </span>
            <h3 className="mt-1 text-lg font-semibold">
              {it ? "Per chi ha più di un'auto" : "For multi-car households"}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-onsurface-variant">
              {it
                ? "Fino a 3 auto nello stesso garage cloud, con statistiche aggregate e possibilità di cambiare headunit più spesso. Ideale per famiglie o appassionati con più veicoli Jaecoo / Omoda."
                : "Up to 3 cars in the same cloud garage, with aggregate stats and more headunit flexibility. Ideal for families or enthusiasts with multiple Jaecoo / Omoda vehicles."}
            </p>
            <ul className="mt-5 space-y-2">
              {(it
                ? [
                    "Fino a 3 auto nel garage cloud",
                    "Tutto ciò che include Standard, moltiplicato per 3",
                    "Statistiche aggregate su tutti i veicoli",
                    "Max 5 cambi headunit / 365 giorni",
                    "Re-pairing senza consumo di quota",
                  ]
                : [
                    "Up to 3 cars in the cloud garage",
                    "Everything in Standard, ×3",
                    "Aggregate stats across all vehicles",
                    "Max 5 headunit swaps / 365 days",
                    "Re-pairing without quota consumption",
                  ]
              ).map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-onsurface-variant">
                  <IconCheck className="mt-0.5 shrink-0 text-emerald-400" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Tabella comparativa ── */}
        <section className="mb-20">
          <h2 className="mb-8 text-center text-xl font-semibold">
            {it ? "Confronto completo" : "Full comparison"}
          </h2>

          <div className="overflow-x-auto rounded-2xl border border-surface-border">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface/60">
                  <th className="py-4 pl-6 pr-4 text-left font-medium text-onsurface-variant">
                    {it ? "Funzionalità" : "Feature"}
                  </th>
                  <th className="px-4 py-4 text-center font-medium text-white/50">
                    🟢 Free
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-accent">
                    👑 Standard
                  </th>
                  <th className="px-4 py-4 text-center font-semibold text-emerald-400">
                    🏎️ Garage
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((row, i) => (
                  <tr
                    key={row.itLabel}
                    className={`border-b border-surface-border/60 transition-colors hover:bg-white/[0.02] ${
                      i % 2 === 0 ? "" : "bg-white/[0.015]"
                    }`}
                  >
                    <td className="py-3 pl-6 pr-4 text-onsurface-variant">
                      {it ? row.itLabel : row.enLabel}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.standard} highlight />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Cell value={row.garage} highlight />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Note swap headunit ── */}
        <section className="mb-20 rounded-2xl border border-surface-border bg-surface/40 p-6">
          <div className="flex gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <IconLock />
            </div>
            <div>
              <p className="font-medium">
                {it ? "Cosa sono i \"cambi headunit\"?" : "What are \"headunit swaps\"?"}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-onsurface-variant">
                {it
                  ? "Ogni volta che associ un nuovo dispositivo headunit al tuo account, si consuma una quota. Questo previene la condivisione impropria dello stesso abbonamento tra utenti diversi. Ricollegare un dispositivo già usato in passato non consuma alcuna quota."
                  : "Each time you pair a new headunit device to your account, one swap quota is consumed. This prevents improper subscription sharing across different users. Re-pairing a previously used device never consumes any quota."}
              </p>
            </div>
          </div>
        </section>

        {/* ── CTA finale ── */}
        <section className="text-center">
          <h2 className="text-2xl font-semibold">
            {it ? "Pronto a partire?" : "Ready to get started?"}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-onsurface-variant">
            {it
              ? "Crea il tuo account gratuitamente. Il piano si attiva con un codice promo o direttamente dall'amministratore."
              : "Create your free account. A plan is activated with a promo code or directly by an administrator."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className={buttonVariants({ variant: "primary" })}>
              {it ? "Crea account gratuito" : "Create free account"}
            </Link>
            <Link to="/" className={buttonVariants({ variant: "secondary" })}>
              {it ? "Torna alla home" : "Back to home"}
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-surface-border px-4 py-6 text-center text-xs text-onsurface-variant">
        <p>
          <Link to="/legal/eula" className="hover:text-onsurface hover:underline">
            {t("legal.terms")}
          </Link>
          <span className="mx-2">·</span>
          <Link to="/legal/privacy" className="hover:text-onsurface hover:underline">
            {t("legal.privacy")}
          </Link>
          <span className="mx-2">·</span>
          <Link to="/plans" className="hover:text-onsurface hover:underline">
            {it ? "Piani" : "Plans"}
          </Link>
        </p>
      </footer>
    </div>
  );
}
