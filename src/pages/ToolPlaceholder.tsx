import { useParams } from "react-router-dom";
import { tools } from "@/lib/tools";
import { ToolPageLayout } from "@/components/ToolPageLayout";
import { FileUploader } from "@/components/FileUploader";

const categoryLabels = { pdf: "PDF Tools", image: "Image Tools" } as const;

export default function ToolPlaceholder() {
  const { toolId } = useParams<{ toolId: string }>();
  const tool = tools.find((t) => t.id === toolId);

  if (!tool) {
    return (
      <div className="container py-20 text-center">
        <h1 className="font-display text-2xl font-bold">Tool not found</h1>
      </div>
    );
  }

  const accept = tool.category === "image" ? "image/*" : ".pdf";

  return (
    <ToolPageLayout
      title={tool.name}
      description={tool.description}
      icon={tool.icon}
      category={tool.category}
      categoryLabel={categoryLabels[tool.category]}
    >
      <FileUploader
        accept={accept}
        onFilesSelected={() => {}}
        label={`Upload ${tool.category === "pdf" ? "PDF" : "image"} files`}
        description={`Select or drop your files here to use ${tool.name}`}
      />

      <div className="mt-8 rounded-xl border bg-secondary/30 p-8 text-center">
        <p className="text-muted-foreground">
          🚧 This tool is coming soon! We're building it step by step.
        </p>
      </div>
    </ToolPageLayout>
  );
}
