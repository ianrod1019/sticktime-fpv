/**
 * The docs component set — the MDX components referenced by name from the
 * documentation pages (<Note>, <Warning>, <Steps>, <Card>...), plus the
 * typed internal-link helper the pages compile to.
 *
 * Keep the exported names in sync with the component names used in
 * docs/*.mdx. All of them are also exported through mdx-context.tsx.
 */
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check as CheckIcon,
  ChevronDown,
  Info as InfoIcon,
  Lightbulb,
  Pencil,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Internal link resolution                                            */
/* ------------------------------------------------------------------ */

/** Slug of the docs page currently being rendered. */
const DocsPageContext = createContext<string>("introduction");
export function useDocsPage() {
  return useContext(DocsPageContext);
}
export function DocsPageProvider({
  slug,
  children,
}: {
  slug: string;
  children: ReactNode;
}) {
  return (
    <DocsPageContext.Provider value={slug}>{children}</DocsPageContext.Provider>
  );
}

const DOCS_ROUTES = new Set(["introduction", "quickstart"]);

/**
 * Resolve a docs-internal href ("/quickstart") to the in-app route.
 * Slug routes other than the two static ones live under /docs/$slug;
 * keeping the static routes explicit keeps typed-router happy and the
 * URLs pretty.
 */
export function DocsLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  const isDocsPath = to.startsWith("/");
  if (!isDocsPath) {
    return (
      <a href={to} className="text-primary underline-offset-4 hover:underline">
        {children}
      </a>
    );
  }
  const slug = to.replace(/^\//, "");
  const route = DOCS_ROUTES.has(slug) ? "/docs/$slug" : "/docs/$slug";
  return (
    <Link
      to={route}
      params={{ slug }}
      className="text-primary underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Callouts                                                            */
/* ------------------------------------------------------------------ */

type CalloutKind = "note" | "tip" | "warning" | "info" | "check";

const CALLOUT_STYLES: Record<
  CalloutKind,
  {
    icon: typeof InfoIcon;
    border: string;
    bg: string;
    text: string;
    label: string;
  }
> = {
  note: {
    icon: Pencil,
    border: "border-primary/40",
    bg: "bg-primary/5",
    text: "text-primary",
    label: "Note",
  },
  tip: {
    icon: Lightbulb,
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    text: "text-emerald-500",
    label: "Tip",
  },
  check: {
    icon: CheckIcon,
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/5",
    text: "text-emerald-500",
    label: "",
  },
  info: {
    icon: InfoIcon,
    border: "border-sky-500/40",
    bg: "bg-sky-500/5",
    text: "text-sky-400",
    label: "Info",
  },
  warning: {
    icon: AlertTriangle,
    border: "border-amber-500/40",
    bg: "bg-amber-500/5",
    text: "text-amber-500",
    label: "Warning",
  },
};

function Callout({
  kind,
  children,
}: {
  kind: CalloutKind;
  children: ReactNode;
}) {
  const s = CALLOUT_STYLES[kind];
  const Icon = s.icon;
  return (
    <div className={`mt-4 rounded-lg border ${s.border} ${s.bg} px-4 py-3`}>
      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.text}`} aria-hidden />
        <div className="min-w-0 text-sm [&>p]:mt-0 [&>p]:text-muted-foreground">
          {s.label && (
            <span className={`mr-2 font-semibold ${s.text}`}>{s.label}:</span>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

export const Note = (p: { title?: string; children: ReactNode }) => (
  <Callout kind="note" {...p} />
);
export const Tip = (p: { title?: string; children: ReactNode }) => (
  <Callout kind="tip" {...p} />
);
export const Check = (p: { title?: string; children: ReactNode }) => (
  <Callout kind="check" {...p} />
);
export const Info = (p: { title?: string; children: ReactNode }) => (
  <Callout kind="info" {...p} />
);
export const Warning = (p: { title?: string; children: ReactNode }) => (
  <Callout kind="warning" {...p} />
);

/* ------------------------------------------------------------------ */
/* Screenshot                                                          */
/* ------------------------------------------------------------------ */

export function Screenshot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  // Pages reference /images/<name>.png (the Mintlify path). The in-app copy
  // of the images lives under /docs/<name>.png.
  const appSrc = src.replace(/^\/images\//, "/docs/");
  return (
    <figure className="mt-6 overflow-hidden rounded-xl border border-border bg-muted/30 shadow-sm">
      <img src={appSrc} alt={alt} loading="lazy" className="w-full" />
      {caption && (
        <figcaption className="border-t border-border/60 px-4 py-2.5 text-xs text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Steps                                                               */
/* ------------------------------------------------------------------ */

export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol className="mt-4 space-y-3 border-l-2 border-primary/30 pl-6">
      {children}
    </ol>
  );
}
export function Step({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border border-primary/40 bg-background text-[10px] font-bold text-primary">
        ✓
      </span>
      {title && <p className="font-medium text-foreground">{title}</p>}
      <div className="text-sm text-muted-foreground [&>p]:mt-1">{children}</div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Cards                                                               */
/* ------------------------------------------------------------------ */

export function CardGroup({
  cols = 2,
  children,
}: {
  cols?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="mt-4 grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function Card({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon?: string;
  href?: string;
  children: ReactNode;
}) {
  const body = (
    <div className="h-full rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
      <div className="flex items-center gap-2">
        {icon && <span aria-hidden>{icon}</span>}
        <p className="font-semibold text-foreground">{title}</p>
      </div>
      <div className="mt-1.5 text-sm text-muted-foreground [&>p]:mt-0">
        {children}
      </div>
    </div>
  );
  if (href) {
    return (
      <DocsLink to={href}>
        <span className="block h-full">{body}</span>
      </DocsLink>
    );
  }
  return body;
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

/**
 * Simple title-based tabs: `<Tabs><Tab title="A">…</Tab></Tabs>` renders a
 * button bar from the titles and shows one panel at a time.
 */
export function Tabs({ children }: { children: ReactNode }) {
  const items = Children.toArray(children).filter(
    isValidElement,
  ) as unknown as Array<ReactElement<{ title?: string; children?: ReactNode }>>;
  const titles = items.map((el, i) => el.props.title ?? `Tab ${i + 1}`);
  const [active, setActive] = useState<string | null>(null);
  const current = active && titles.includes(active) ? active : titles[0]!;

  return (
    <div className="mt-4">
      <div
        role="tablist"
        className="mb-2 flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1"
      >
        {titles.map((t) => {
          const isActive = t === current;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t)}
              className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive
                  ? "bg-background font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          );
        })}
      </div>
      {items.map((el, i) =>
        titles[i] === current ? (
          <div key={i} className="text-sm text-muted-foreground">
            {el.props.children}
          </div>
        ) : null,
      )}
    </div>
  );
}

/** Tab panel — content is rendered by the parent <Tabs>. */
export function Tab({ children }: { title?: string; children: ReactNode }) {
  return <>{children}</>;
}

/* ------------------------------------------------------------------ */
/* Accordion (FAQ)                                                     */
/* ------------------------------------------------------------------ */

export function Accordion({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded-lg border border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground"
      >
        {title}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open && (
        <div className="border-t border-border/60 px-4 py-3 text-sm text-muted-foreground [&>p]:mt-0">
          {children}
        </div>
      )}
    </div>
  );
}

/** The named component set MDX pages reference (Note, Steps, Card...). */
export const DocsComponents = {
  Note,
  Tip,
  Check,
  Info,
  Warning,
  Screenshot,
  Steps,
  Step,
  CardGroup,
  Card,
  Tabs,
  Tab,
  Accordion,
  DocsLink,
} as const;

export type DocsComponentSet = typeof DocsComponents;
