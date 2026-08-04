import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { useLanguage, type TranslationKey } from "../lib/i18n/LanguageContext";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { buttonVariants } from "../components/Button";
import jdLogo from "../assets/jd_logo.png";
import { IconGauge, IconFuel, IconCloud, IconRoute } from "../components/icons";
import { vehicleImageFor } from "../lib/vehicleCatalog";

// Stesse chiavi brand/model di VehicleCatalog.java (Android) - vehicleImageFor() e' la
// stessa funzione usata da Dashboard.tsx, cosi' le sei silhouette restano un'unica fonte
// invece di duplicare i percorsi dei file qui.
const MODELS: { brand: string; model: string; label: string }[] = [
  { brand: "JAECOO", model: "5", label: "Jaecoo 5" },
  { brand: "JAECOO", model: "7", label: "Jaecoo 7" },
  { brand: "JAECOO", model: "8", label: "Jaecoo 8" },
  { brand: "OMODA", model: "5", label: "Omoda 5" },
  { brand: "OMODA", model: "7", label: "Omoda 7" },
  { brand: "OMODA", model: "9", label: "Omoda 9" },
];

const FEATURES: { icon: typeof IconGauge; titleKey: TranslationKey; bodyKey: TranslationKey }[] = [
  { icon: IconGauge, titleKey: "landing.feature1Title", bodyKey: "landing.feature1Body" },
  { icon: IconRoute, titleKey: "landing.feature2Title", bodyKey: "landing.feature2Body" },
  { icon: IconFuel, titleKey: "landing.feature3Title", bodyKey: "landing.feature3Body" },
  { icon: IconCloud, titleKey: "landing.feature4Title", bodyKey: "landing.feature4Body" },
];

export default function Landing() {
  const { user, loading } = useAuth();
  const { t } = useLanguage();
  // Chi ha gia' una sessione attiva salta la pagina marketing e va dritto in app - stesso
  // pattern di Login.tsx (li' pero' e' l'utente ad aver cercato /login esplicitamente).
  if (!loading && user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-bg text-onsurface">
      <header className="border-b border-surface-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <img src={jdLogo} alt="JaeDrive" className="h-7 w-auto" />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link to="/login" className={buttonVariants({ variant: "secondary", size: "sm" })}>
              {t("common.login")}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: nessun gradiente/hero gigante fuori luogo - il tono e' quello di uno
            strumento tecnico per un pubblico che gia' sa cosa vuole (proprietari
            Jaecoo/Omoda che cercano dati reali), non una landing SaaS generica. */}
        <section className="mx-auto max-w-3xl px-4 pb-16 pt-20 text-center sm:pt-28">
          <p className="mb-4 text-xs font-medium uppercase tracking-[0.2em] text-accent">{t("landing.eyebrow")}</p>
          <h1 className="text-balance text-3xl font-semibold leading-tight sm:text-5xl">
            {t("landing.heroTitleLine1")}
            <br />
            {t("landing.heroTitleLine2")}
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-balance text-base text-onsurface-variant sm:text-lg">{t("landing.heroSubtitle")}</p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link to="/login" className={buttonVariants({ variant: "primary" })}>
              {t("common.login")}
            </Link>
            <a href="#funzionalita" className={buttonVariants({ variant: "secondary" })}>
              {t("landing.ctaSecondary")}
            </a>
          </div>
        </section>

        <section id="funzionalita" className="mx-auto max-w-5xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-2">
            {FEATURES.map(({ icon: Icon, titleKey, bodyKey }) => (
              <div key={titleKey} className="rounded-xl border border-surface-border bg-surface p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent/10 text-accent">
                  <Icon size={22} />
                </div>
                <h3 className="text-base font-semibold">{t(titleKey)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-onsurface-variant">{t(bodyKey)}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="border-t border-surface-border bg-surface/40 py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-center text-xl font-semibold">{t("landing.modelsTitle")}</h2>
            <p className="mx-auto mt-2 max-w-md text-center text-sm text-onsurface-variant">{t("landing.modelsSubtitle")}</p>
            <div className="mt-10 grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-6">
              {MODELS.map((m) => (
                <div key={m.label} className="flex flex-col items-center gap-2">
                  <img src={vehicleImageFor(m.brand, m.model) ?? ""} alt={m.label} className="h-16 w-full object-contain" />
                  <p className="text-xs text-onsurface-variant">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-2xl px-4 py-20 text-center">
          <h2 className="text-2xl font-semibold">{t("landing.finalCtaTitle")}</h2>
          <Link to="/login" className={buttonVariants({ variant: "primary", className: "mt-6 inline-flex" })}>
            {t("landing.finalCtaButton")}
          </Link>
        </section>
      </main>

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
            {t("landing.plansLink")}
          </Link>
        </p>
        <p className="mt-3">{t("landing.disclaimer")}</p>
      </footer>
    </div>
  );
}
