import { Link } from "react-router-dom";
import { Search, Menu, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { categories } from "@/lib/tools";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Navbar() {
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-md">
      <div className="container flex h-16 items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">A</span>
          </div>
          <span className="font-display text-xl font-bold hidden sm:inline">AllTools Pro</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-1">
          {categories.map((cat) => (
            <DropdownMenu key={cat.id}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1">
                  {cat.label} <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {cat.tools.map((tool) => (
                  <DropdownMenuItem key={tool.id} asChild>
                    <Link to={tool.path} className="flex items-center gap-2">
                      <tool.icon className="h-4 w-4" />
                      {tool.name}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </nav>

        {/* Search + Mobile Menu */}
        <div className="flex items-center gap-2">
          {searchOpen ? (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search tools..."
                className="w-40 sm:w-64 h-9"
                autoFocus
                onBlur={() => setSearchOpen(false)}
              />
              <Button variant="ghost" size="icon" onClick={() => setSearchOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setSearchOpen(true)}>
              <Search className="h-4 w-4" />
            </Button>
          )}

          {/* Mobile hamburger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="font-display text-lg mb-4">AllTools Pro</SheetTitle>
              <nav className="flex flex-col gap-6">
                {categories.map((cat) => (
                  <div key={cat.id}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{cat.label}</h3>
                    <div className="flex flex-col gap-1">
                      {cat.tools.map((tool) => (
                        <Link
                          key={tool.id}
                          to={tool.path}
                          className="flex items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary transition-colors"
                        >
                          <tool.icon className="h-4 w-4" />
                          {tool.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
