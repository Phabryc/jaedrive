import type { ReactNode } from "react";

// Renderer minimale per i soli 4 documenti legali (EULA/Privacy, IT/EN) - non un parser
// markdown generico: gestisce solo # / ## / liste puntate / **grassetto** / [link](url),
// l'esatto sottoinsieme usato in quei file, per evitare una dipendenza intera solo per
// pagine statiche. I link che puntano a un altro documento legale (.md) vengono
// riscritti verso la rotta interna corrispondente invece di restare relativi al file.
function resolveHref(href: string): { href: string; external: boolean } {
  if (href.endsWith(".md")) {
    return { href: href.includes("privacy") ? "/legal/privacy" : "/legal/eula", external: false };
  }
  return { href, external: /^https?:\/\//.test(href) };
}

function inlineFormat(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const regex = /(\*\*(.+?)\*\*)|(\[(.+?)\]\((.+?)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1]) {
      nodes.push(<strong key={`${keyPrefix}-${i++}`}>{m[2]}</strong>);
    } else if (m[3]) {
      const { href, external } = resolveHref(m[5]);
      nodes.push(
        <a
          key={`${keyPrefix}-${i++}`}
          href={href}
          target={external ? "_blank" : undefined}
          rel={external ? "noreferrer" : undefined}
          className="text-accent hover:underline"
        >
          {m[4]}
        </a>,
      );
    }
    last = regex.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function SimpleMarkdown({ source }: { source: string }) {
  const lines = source.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems;
    blocks.push(
      <ul key={key++} className="mb-4 ml-5 list-disc space-y-1.5">
        {items.map((li, i) => (
          <li key={i}>{inlineFormat(li, `li${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      flushList();
      blocks.push(
        <h1 key={key} className="mb-2 text-2xl font-bold text-onsurface">
          {inlineFormat(line.slice(2), `h1-${key++}`)}
        </h1>,
      );
    } else if (line.startsWith("## ")) {
      flushList();
      blocks.push(
        <h2 key={key} className="mb-2 mt-7 text-lg font-semibold text-onsurface">
          {inlineFormat(line.slice(3), `h2-${key++}`)}
        </h2>,
      );
    } else if (line.startsWith("- ")) {
      listItems.push(line.slice(2));
    } else if (line.trim() === "") {
      flushList();
    } else {
      flushList();
      blocks.push(
        <p key={key} className="mb-3 text-sm leading-relaxed text-onsurface-variant">
          {inlineFormat(line, `p-${key++}`)}
        </p>,
      );
    }
  }
  flushList();

  return <div>{blocks}</div>;
}
