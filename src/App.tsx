import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Index from "./pages/Index";
import ToolPlaceholder from "./pages/ToolPlaceholder";
import ImageCompressor from "./pages/ImageCompressor";
import ImageCropper from "./pages/ImageCropper";
import PassportPhoto from "./pages/PassportPhoto";
import RemoveBackground from "./pages/RemoveBackground";
import PdfEditor from "./pages/PdfEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <div className="flex min-h-screen flex-col">
          <Navbar />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/tools/image-compressor" element={<ImageCompressor />} />
              <Route path="/tools/crop-image" element={<ImageCropper />} />
              <Route path="/tools/passport-photo" element={<PassportPhoto />} />
              <Route path="/tools/remove-background" element={<RemoveBackground />} />
              <Route path="/tools/pdf-editor" element={<PdfEditor />} />
              <Route path="/tools/:toolId" element={<ToolPlaceholder />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
