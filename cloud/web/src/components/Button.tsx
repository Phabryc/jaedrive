import type { ButtonHTMLAttributes } from "react";

// Stile bottoni mirrorato da quello Android (vedi btn_primary_bg/btn_secondary_bg/
// btn_danger_bg.xml + colors.xml): forme piene "tonali" (colore container pieno, non
// outline), raggio 8px (equivalente ai radius 8dp usati li'), testo bold - non i bottoni
// outline/testo-sottile usati finora sul web, che non si leggevano come lo stesso prodotto
// dell'app in auto (feedback utente 2026-08-02).
export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "md" | "sm";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent/90",
  secondary: "bg-secondary-container text-on-secondary-container hover:bg-secondary-container/80",
  danger: "bg-danger-container text-on-danger-container hover:bg-danger-container/80",
  // Unico stile non "pieno": per azioni testuali secondarie (link-like) dove un riquadro
  // colorato sarebbe eccessivo - stessa gerarchia dei TextView senza background in app.
  ghost: "bg-transparent text-onsurface-variant hover:bg-surface hover:text-onsurface",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-5 py-2.5 text-sm",
  sm: "px-3 py-1.5 text-xs",
};

// Classi pure, riusabili anche su un <Link>/<a> (es. CTA della Landing) dove non ha senso
// un vero elemento <button> - vedi Button qui sotto per il caso comune.
export function buttonVariants({
  variant = "secondary",
  size = "md",
  className = "",
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
} = {}) {
  return `inline-flex items-center justify-center gap-1.5 rounded-lg font-bold whitespace-nowrap transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${className}`.trim();
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({ variant = "secondary", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} {...props} />;
}
