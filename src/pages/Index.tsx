import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import { Search, Github } from "lucide-react";
import { Input } from "@/components/ui/input";
import { tools, categories, type Tool } from "@/lib/tools";
import { cn } from "@/lib/utils";

function ToolCard({ tool }: { tool: Tool }) {
  const isPdf = tool.category === "pdf";
  return (
    <Link
      to={tool.path}
      className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-6 text-center transition-all hover:shadow-md hover:-translate-y-0.5"
    >
      <div
        className={cn(
          "flex h-14 w-14 items-center justify-center rounded-xl transition-colors",
          isPdf ? "bg-pdf-bg group-hover:bg-pdf/10" : "bg-image-bg group-hover:bg-image/10"
        )}
      >
        <tool.icon
          className={cn("h-7 w-7", isPdf ? "text-pdf" : "text-image")}
        />
      </div>
      <h3 className="font-display font-semibold">{tool.name}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">
        {tool.description}
      </p>
    </Link>
  );
}

export default function Index() {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return null;
    const q = query.toLowerCase();
    return tools.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="flex flex-col">
      <Helmet>
        <title>AllTools Pro — Free Online PDF & Image Tools</title>
        <meta name="description" content="Free, fast online tools for PDFs and images: passport photo maker, image compressor, cropper, background remover, and more. No signup, runs in your browser." />
        <link rel="canonical" href="/" />
        <meta property="og:title" content="AllTools Pro — Free Online PDF & Image Tools" />
        <meta property="og:description" content="Free, fast online tools for PDFs and images." />
        <meta property="og:url" content="/" />
      </Helmet>
      {/* Hero */}
      <section className="py-16 md:py-24 text-center">
        <div className="container max-w-3xl">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight">
            All your document & image tools{" "}
            <span className="text-primary">in one place</span>
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto">
            Edit PDFs, resize images, convert files and more — all free, fast, and easy to use.
          </p>

          {/* Search */}
          <div className="relative mt-8 max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search tools..."
              className="pl-10 h-12 rounded-xl"
            />
          </div>

          {/* Creator credit */}
          <div className="mt-4 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            <span>Made by</span>
            <a
              href="https://github.com/lokeshkavisth"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary transition-colors"
            >
              lokeshkavisth
              <Github className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Search results */}
      {filtered !== null ? (
        <section className="container pb-16">
          <h2 className="font-display text-xl font-semibold mb-6">
            {filtered.length ? `Results for "${query}"` : "No tools found"}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </section>
      ) : (
        /* Tool grid by category */
        <section className="container pb-16 space-y-12">
          {categories.map((cat) => (
            <div key={cat.id} id={cat.id}>
              <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-2">
                <span
                  className={cn(
                    "inline-block h-1.5 w-1.5 rounded-full",
                    cat.id === "pdf" ? "bg-pdf" : "bg-image"
                  )}
                />
                {cat.label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {cat.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
