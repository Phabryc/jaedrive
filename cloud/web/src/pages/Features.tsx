import { Link } from "react-router-dom";
import { useLanguage } from "../lib/i18n/LanguageContext";
import { StaticHeader } from "../components/StaticHeader";
import { buttonVariants } from "../components/Button";

// ─── Inline SVG icons ─────────────────────────────────────────────────────────

function Ico({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
      {children}
    </svg>
  );
}

const icons = {
  bus: <Ico><path d="M3 11l1-7h16l1 7M3 11v6a2 2 0 002 2h14a2 2 0 002-2v-6M3 11h18M8 17v2M16 17v2M7 7h3M14 7h3"/></Ico>,
  zap: <Ico><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Ico>,
  map: <Ico><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><path d="M9 3v15M15 6v15"/></Ico>,
  route: <Ico><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M12 19h4.5a3.5 3.5 0 000-7h-8a3.5 3.5 0 010-7H12"/></Ico>,
  cloud: <Ico><path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/></Ico>,
  chart: <Ico><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Ico>,
  gpx: <Ico><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></Ico>,
  overlay: <Ico><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 8h10M7 11h7"/></Ico>,
  swap: <Ico><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></Ico>,
  garage: <Ico><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></Ico>,
  bell: <Ico><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></Ico>,
  history: <Ico><path d="M12 8v4l3 3"/><path d="M3.05 11a9 9 0 1 0 .5-4.2"/><polyline points="3 2 3 7 8 7"/></Ico>,
};

// ─── Feature data ─────────────────────────────────────────────────────────────

type Feature = {
  id: string;
  icon: React.ReactNode;
  color: string; // tailwind accent color token
  itTitle: string;
  enTitle: string;
  itBody: string;
  enBody: string;
  premium?: boolean;
  premiumTier?: "STANDARD" | "GARAGE";
  itDetails: string[];
  enDetails: string[];
};

const FEATURES: Feature[] = [
  {
    id: "bus",
    icon: icons.bus,
    color: "text-accent bg-accent/10",
    itTitle: "Dati diretti dal bus veicolo",
    enTitle: "Direct vehicle bus data",
    itBody:
      "JaeDrive non si affida ai valori dell'infotainment di serie — legge direttamente il bus CAN della tua Jaecoo o Omoda. Questo significa che ogni dato che vedi è reale, non stimato.",
    enBody:
      "JaeDrive doesn't rely on stock infotainment values — it reads directly from your Jaecoo or Omoda's CAN bus. Every value you see is real, not estimated.",
    itDetails: [
      "Modalità di guida attiva (EV, Hybrid, Sport, ECO, Snow)",
      "Stato di carica batteria (SOC) e range elettrico residuo",
      "Flusso di energia ibrida in tempo reale (motore/batteria/rigenerazione)",
      "Velocità, RPM, temperatura liquido di raffreddamento",
      "Livello carburante effettivo",
    ],
    enDetails: [
      "Active drive mode (EV, Hybrid, Sport, ECO, Snow)",
      "Battery state of charge (SOC) and remaining EV range",
      "Real-time hybrid energy flow (engine/battery/regen)",
      "Speed, RPM, coolant temperature",
      "Actual fuel level",
    ],
  },
  {
    id: "trips",
    icon: icons.map,
    color: "text-blue-400 bg-blue-500/10",
    itTitle: "Registrazione automatica dei viaggi",
    enTitle: "Automatic trip recording",
    itBody:
      "Ogni volta che metti in moto la tua auto JaeDrive inizia a registrare — automaticamente, senza dover aprire l'app. I dati vengono salvati sull'headunit; con un piano Premium arrivano automaticamente sul cloud, consultabili da qualsiasi dispositivo.",
    enBody:
      "Every time you start your car JaeDrive begins recording — automatically, without opening the app. Data is saved on the headunit; with a Premium plan, trips land automatically in the cloud and are accessible from any device.",
    itDetails: [
      "Traccia GPS completa con mappa interattiva del percorso",
      "Suddivisione km in modalità EV / ibrida / termica",
      "Consumi reali per tratto di percorso",
      "Livello carburante e SOC a inizio e fine viaggio",
      "Rilevamento automatico stop intermedi",
      "Unione di viaggi consecutivi (più soste, un unico percorso combinato)",
    ],
    enDetails: [
      "Full GPS track with interactive route map",
      "Km breakdown by EV / hybrid / thermal mode",
      "Real consumption per road segment",
      "Fuel level and SOC at trip start and end",
      "Automatic intermediate stop detection",
      "Merge consecutive trips (multiple stops, one combined journey)",
    ],
  },
  {
    id: "routes",
    icon: icons.route,
    color: "text-purple-400 bg-purple-500/10",
    itTitle: "Percorsi ricorrenti & statistiche aggregate",
    enTitle: "Recurring routes & aggregate stats",
    itBody:
      "Salva i percorsi che fai spesso — casa-lavoro, palestra, vacanze — e osserva come cambiano i consumi nel tempo. JaeDrive riconosce automaticamente i percorsi salvati.",
    enBody:
      "Save the routes you drive often — commute, gym, holidays — and watch how consumption evolves over time. JaeDrive automatically recognises saved routes.",
    itDetails: [
      "Salvataggio manuale di qualsiasi percorso con nome personalizzato",
      "Statistiche aggregate per percorso (media consumi, km totali, viaggi)",
      "Confronto tra viaggi sullo stesso percorso",
      "Visualizzazione heatmap dei tratti più frequenti",
    ],
    enDetails: [
      "Manual saving of any route with a custom name",
      "Aggregate stats per route (avg consumption, total km, trips)",
      "Comparison between trips on the same route",
      "Heatmap view of the most frequent segments",
    ],
  },
  {
    id: "cloud",
    icon: icons.cloud,
    color: "text-sky-400 bg-sky-500/10",
    itTitle: "Sincronizzazione cloud automatica",
    enTitle: "Automatic cloud sync",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Associa la tua auto all'account con un codice QR dall'headunit: da quel momento i viaggi appaiono su jaedrive.com da soli, accessibili da qualsiasi dispositivo.",
    enBody:
      "Pair your car to your account with a QR code from the headunit: trips appear on jaedrive.com on their own, accessible from any device.",
    itDetails: [
      "Pairing tramite codice a 8 caratteri o QR direttamente sull'headunit",
      "Sincronizzazione in background ad ogni fine viaggio",
      "Storico completo illimitato nel cloud",
      "Accesso da browser desktop, tablet o smartphone",
      "Dati sempre disponibili anche se cambi telefono",
    ],
    enDetails: [
      "Pairing via 8-character code or QR directly on the headunit",
      "Background sync at the end of every trip",
      "Unlimited full history in the cloud",
      "Access from desktop browser, tablet, or smartphone",
      "Data always available even if you change phone",
    ],
  },
  {
    id: "analytics",
    icon: icons.chart,
    color: "text-emerald-400 bg-emerald-500/10",
    itTitle: "Analisi avanzata & telemetria",
    enTitle: "Advanced analytics & telemetry",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Molto più di una lista di viaggi: grafici interattivi, heatmap di percorso, andamento del SOC nel tempo e analisi dell'efficienza per capire come guidi davvero.",
    enBody:
      "Far more than a trip list: interactive charts, route heatmaps, SOC trend over time, and efficiency analysis to understand how you actually drive.",
    itDetails: [
      "Grafici interattivi di consumo nel tempo",
      "Heatmap dei percorsi più battuti",
      "Andamento SOC e range elettrico nel corso delle settimane",
      "Analisi dell'efficienza per modalità di guida",
      "Statistiche aggregate su tutti i veicoli del garage (piano Garage)",
    ],
    enDetails: [
      "Interactive consumption charts over time",
      "Heatmap of most-driven routes",
      "SOC and EV range trend over weeks",
      "Efficiency analysis by drive mode",
      "Aggregate stats across all garage vehicles (Garage plan)",
    ],
  },
  {
    id: "gpx",
    icon: icons.gpx,
    color: "text-orange-400 bg-orange-500/10",
    itTitle: "Export GPX completo (+ CSV e PDF 🔜)",
    enTitle: "Full GPX export (+ CSV & PDF 🔜)",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Esporta i tuoi viaggi in formato aperto. L'export GPX Premium include tutte le estensioni JaeDrive con dati energetici e di guida. CSV e PDF sono in sviluppo e saranno disponibili in una versione futura.",
    enBody:
      "Export your trips in an open format. The Premium GPX export includes all JaeDrive extensions with energy and driving data. CSV and PDF are in development and will be available in a future release.",
    itDetails: [
      "GPX 1.1 standard con lat/lon/ele/time (disponibile gratis)",
      "Estensioni GPX JaeDrive: flusso energia, SOC, livello carburante, modalità guida, velocità, consumo istantaneo, livello regen (Premium)",
      "Export CSV con dati di telemetria completi 🔜 in arrivo",
      "Report PDF con mappa del percorso e statistiche 🔜 in arrivo",
    ],
    enDetails: [
      "Standard GPX 1.1 with lat/lon/ele/time (free)",
      "JaeDrive GPX extensions: energy flow, SOC, fuel level, drive mode, speed, instant consumption, regen level (Premium)",
      "CSV export with full telemetry data 🔜 coming soon",
      "Formatted PDF report with route map and stats 🔜 coming soon",
    ],
  },
  {
    id: "overlay",
    icon: icons.overlay,
    color: "text-yellow-400 bg-yellow-500/10",
    itTitle: "Overlay status bar in-car",
    enTitle: "In-car status bar overlay",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Un sottile overlay nella barra di stato dell'headunit mostra in tempo reale le metriche chiave — senza aprire l'app, sempre visibile mentre guidi.",
    enBody:
      "A subtle overlay in the headunit status bar shows real-time key metrics — without opening the app, always visible while driving.",
    itDetails: [
      "Modalità di guida attiva in tempo reale",
      "SOC e indicatore di flusso energetico",
      "Sempre visibile sopra le app dell'infotainment",
      "Attivabile/disattivabile dalle impostazioni",
    ],
    enDetails: [
      "Active drive mode in real time",
      "SOC and energy flow indicator",
      "Always visible above other infotainment apps",
      "Toggle on/off from settings",
    ],
  },
  {
    id: "popups",
    icon: icons.bell,
    color: "text-pink-400 bg-pink-500/10",
    itTitle: "Popup regen & rifornimento",
    enTitle: "Regen & refuel popups",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Notifiche contestuali sull'headunit quando viene rilevato un evento significativo: livello di rigenerazione elevato o rifornimento completato.",
    enBody:
      "Contextual notifications on the headunit when a significant event is detected: high regen level or completed refuel.",
    itDetails: [
      "Popup automatico alla fine di una fase di rigenerazione intensa",
      "Rilevamento automatico del rifornimento (variazione livello carburante)",
      "Dismissibili con un tap; 'Non mostrare più' ricordato per quella sessione",
      "Funzionano anche con l'app in background",
    ],
    enDetails: [
      "Automatic popup at the end of an intense regen phase",
      "Automatic refuel detection (fuel level variation)",
      "Dismissible with a tap; 'Don't remind me' remembered for that session",
      "Work even with the app in the background",
    ],
  },
  {
    id: "history",
    icon: icons.history,
    color: "text-cyan-400 bg-cyan-500/10",
    itTitle: "Storico viaggi illimitato",
    enTitle: "Unlimited trip history",
    premium: true,
    premiumTier: "STANDARD",
    itBody:
      "Il piano Free mostra gli ultimi 7 giorni di viaggi — quelli più vecchi continuano ad essere registrati localmente, ma diventano consultabili solo con Premium. Con il cloud lo storico è illimitato: ogni viaggio registrato è accessibile per sempre da qualsiasi dispositivo.",
    enBody:
      "The Free plan shows the last 7 days of trips — older ones keep being recorded locally but become viewable only with Premium. With the cloud, history is unlimited: every recorded trip is accessible forever from any device.",
    itDetails: [
      "Nessun limite di tempo o numero di viaggi",
      "Ricerca e filtro per data, percorso, modalità",
      "Dati mai cancellati (salvo richiesta esplicita dell'utente)",
      "Accessibile da qualsiasi dispositivo in qualsiasi momento",
    ],
    enDetails: [
      "No time or trip count limit",
      "Search and filter by date, route, mode",
      "Data never deleted (unless explicitly requested by the user)",
      "Accessible from any device at any time",
    ],
  },
  {
    id: "garage",
    icon: icons.garage,
    color: "text-emerald-300 bg-emerald-400/10",
    itTitle: "Garage multi-veicolo",
    enTitle: "Multi-vehicle garage",
    premium: true,
    premiumTier: "GARAGE",
    itBody:
      "Il piano Garage permette di collegare fino a 3 auto allo stesso account. Statistiche aggregate, confronto tra veicoli, gestione centralizzata.",
    enBody:
      "The Garage plan allows up to 3 cars connected to the same account. Aggregate stats, vehicle comparison, centralised management.",
    itDetails: [
      "Fino a 3 auto attive nel garage cloud",
      "Statistiche aggregate su tutti i veicoli",
      "Confronto di efficienza e consumi tra veicoli diversi",
      "Ogni auto mantiene la propria cronologia e impostazioni",
      "Max 5 cambi headunit / 365 giorni (vs 2 del piano Standard)",
    ],
    enDetails: [
      "Up to 3 active cars in the cloud garage",
      "Aggregate stats across all vehicles",
      "Efficiency and consumption comparison between vehicles",
      "Each car retains its own history and settings",
      "Max 5 headunit swaps / 365 days (vs 2 on Standard)",
    ],
  },
];

// ─── Badge helper ─────────────────────────────────────────────────────────────

function PremiumBadge({ tier, it }: { tier?: "STANDARD" | "GARAGE"; it: boolean }) {
  if (!tier) return null;
  if (tier === "GARAGE")
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
        🏎️ Garage
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">
      👑 {it ? "Premium" : "Premium"}
    </span>
  );
}

// ─── Check icon ───────────────────────────────────────────────────────────────

function Check() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" width="13" height="13" className="mt-0.5 shrink-0 text-accent">
      <path fillRule="evenodd" d="M13.707 4.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L6 10.586l6.293-6.293a1 1 0 011.414 0z" clipRule="evenodd" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Features() {
  const { lang, t } = useLanguage();
  const isIt = lang === "it";

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <StaticHeader />

      <main className="mx-auto max-w-5xl px-4 pb-24">
        {/* ── Hero ── */}
        <section className="pt-16 pb-14 text-center">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {isIt ? "Funzionalità" : "Features"}
          </p>
          <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-5xl">
            {isIt
              ? <>Tutto quello che JaeDrive<br />sa fare per te</>
              : <>Everything JaeDrive<br />can do for you</>}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-base text-onsurface-variant sm:text-lg">
            {isIt
              ? "Dal bus veicolo al cloud, dall'headunit al browser. Ogni funzionalità è progettata per darti informazioni che la tua auto già conosce ma non ti mostra."
              : "From vehicle bus to cloud, from headunit to browser. Every feature is designed to surface information your car already knows but doesn't show you."}
          </p>
        </section>

        {/* ── Feature cards ── */}
        <div className="space-y-6">
          {FEATURES.map((f, i) => {
            const isEven = i % 2 === 0;
            return (
              <div
                key={f.id}
                className="group overflow-hidden rounded-2xl border border-surface-border bg-surface transition-colors hover:border-white/20"
              >
                <div className={`flex flex-col gap-0 sm:flex-row ${isEven ? "" : "sm:flex-row-reverse"}`}>
                  {/* Left/right accent strip */}
                  <div className="flex flex-col justify-center gap-4 border-b border-surface-border bg-surface/60 px-8 py-8 sm:w-[42%] sm:border-b-0 sm:border-r sm:py-10">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.color}`}>
                      {f.icon}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold leading-snug">
                        {isIt ? f.itTitle : f.enTitle}
                      </h2>
                      <PremiumBadge tier={f.premiumTier} it={isIt} />
                    </div>
                    <p className="text-sm leading-relaxed text-onsurface-variant">
                      {isIt ? f.itBody : f.enBody}
                    </p>
                    {!f.premium && (
                      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-green-700/40 bg-green-900/20 px-2.5 py-1 text-[11px] font-semibold text-green-400">
                        🟢 {isIt ? "Disponibile gratis" : "Available for free"}
                      </span>
                    )}
                  </div>

                  {/* Detail list */}
                  <div className="flex flex-col justify-center px-8 py-8 sm:w-[58%] sm:py-10">
                    <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-onsurface-variant/60">
                      {isIt ? "Cosa include" : "What's included"}
                    </p>
                    <ul className="space-y-3">
                      {(isIt ? f.itDetails : f.enDetails).map((d) => (
                        <li key={d} className="flex items-start gap-2.5 text-sm text-onsurface-variant">
                          <Check />
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── CTA finale ── */}
        <section className="mt-20 text-center">
          <div className="rounded-2xl border border-accent/30 bg-accent/5 px-8 py-10">
            <h2 className="text-2xl font-semibold">
              {isIt ? "Pronto a iniziare?" : "Ready to get started?"}
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-onsurface-variant">
              {isIt
                ? "Le funzionalità di base sono gratuite. Sblocca il cloud e l'analisi avanzata con un piano Premium."
                : "Core features are free. Unlock the cloud and advanced analytics with a Premium plan."}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link to="/login" className={buttonVariants({ variant: "primary" })}>
                {isIt ? "Crea account gratuito" : "Create free account"}
              </Link>
              <Link to="/plans" className={buttonVariants({ variant: "secondary" })}>
                {t("landing.plansLink")} →
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-surface-border px-4 py-6 text-center text-xs text-onsurface-variant">
        <p>
          <Link to="/legal/eula" className="hover:text-onsurface hover:underline">{t("legal.terms")}</Link>
          <span className="mx-2">·</span>
          <Link to="/legal/privacy" className="hover:text-onsurface hover:underline">{t("legal.privacy")}</Link>
          <span className="mx-2">·</span>
          <Link to="/plans" className="hover:text-onsurface hover:underline">{t("landing.plansLink")}</Link>
          <span className="mx-2">·</span>
          <Link to="/" className="hover:text-onsurface hover:underline">JaeDrive</Link>
        </p>
      </footer>
    </div>
  );
}
