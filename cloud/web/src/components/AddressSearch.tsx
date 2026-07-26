import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import type { AddressResult } from "../lib/types";

// Campo di ricerca indirizzo con autocompletamento (jaedrive_todo #14, editor mappa
// percorsi) - debounced (450ms, sotto la soglia dei 3 caratteri niente richiesta) per
// restare nei limiti d'uso di Nominatim (vedi routes/user.ts GET .../geocode/search).
// requestId scarta risposte arrivate in ritardo rispetto a una ricerca piu' recente (stesso
// problema/soluzione della dedup gia' vista altrove nel progetto).
export function AddressSearch({
  placeholder,
  onSelect,
}: {
  placeholder: string;
  onSelect: (result: AddressResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);
    const timer = setTimeout(() => {
      api.geocodeSearch(query.trim()).then((res) => {
        if (id !== requestId.current) return; // risposta di una ricerca ormai superata
        setResults(res);
        setOpen(true);
        setLoading(false);
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="relative">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        // Il ritardo lascia il tempo all'onMouseDown di un risultato di scattare prima che
        // il blur chiuda il menu (onMouseDown precede onBlur, ma solo se il menu e' ancora
        // montato quando arriva).
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full rounded-md border border-surface-border bg-bg px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      {loading && <p className="absolute mt-1 text-xs text-onsurface-variant">Ricerca...</p>}
      {open && results.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-md border border-surface-border bg-surface shadow-lg">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(r);
                setQuery(r.displayName);
                setOpen(false);
              }}
              className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-surface-border"
            >
              {r.displayName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
