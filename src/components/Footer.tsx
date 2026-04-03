import { Link } from "react-router-dom";
import { categories } from "@/lib/tools";

export function Footer() {
  return (
    <footer className="border-t bg-secondary/50 mt-auto">
      <div className="container py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <span className="font-display text-sm font-bold text-primary-foreground">A</span>
              </div>
              <span className="font-display text-lg font-bold">AllTools Pro</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              All your document & image tools in one place. Free, fast, and easy to use.
            </p>
          </div>

          {/* Tool categories */}
          {categories.map((cat) => (
            <div key={cat.id}>
              <h4 className="font-display font-semibold mb-3">{cat.label}</h4>
              <ul className="space-y-2">
                {cat.tools.map((tool) => (
                  <li key={tool.id}>
                    <Link
                      to={tool.path}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {tool.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-3">Company</h4>
            <ul className="space-y-2">
              <li><Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">About</Link></li>
              <li><Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Privacy</Link></li>
              <li><Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Terms</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t mt-8 pt-6 text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} AllTools Pro. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
