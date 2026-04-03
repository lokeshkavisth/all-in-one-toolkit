import { type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { type ToolCategory } from "@/lib/tools";
import { cn } from "@/lib/utils";

interface ToolPageLayoutProps {
  title: string;
  description: string;
  icon: LucideIcon;
  category: ToolCategory;
  categoryLabel: string;
  children: React.ReactNode;
}

export function ToolPageLayout({
  title,
  description,
  icon: Icon,
  category,
  categoryLabel,
  children,
}: ToolPageLayoutProps) {
  const colorClass = category === "pdf" ? "text-pdf" : "text-image";
  const bgClass = category === "pdf" ? "bg-pdf-bg" : "bg-image-bg";

  return (
    <div className="container py-8 max-w-4xl">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to={`/#${category}`}>{categoryLabel}</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{title}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className={cn("flex h-14 w-14 items-center justify-center rounded-xl", bgClass)}>
          <Icon className={cn("h-7 w-7", colorClass)} />
        </div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
      </div>

      {/* Tool Content */}
      {children}
    </div>
  );
}
