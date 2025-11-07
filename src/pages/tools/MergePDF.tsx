
import { useState } from "react";
import PDFToolLayout from "@/components/PDFToolLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from 'pdf-lib';

const MergePDF = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mergedPdfUrl, setMergedPdfUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    const pdfFiles = files.filter(file => file.type === "application/pdf");
    if (pdfFiles.length !== files.length) {
      toast({
        title: "Invalid files",
        description: "Please select only PDF files.",
        variant: "destructive",
      });
    }
    setSelectedFiles(prev => [...prev, ...pdfFiles]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleMerge = async () => {
    if (selectedFiles.length < 2) {
      toast({
        title: "Need more files",
        description: "Please select at least 2 PDF files to merge.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const mergedPdf = await PDFDocument.create();
      
      for (const file of selectedFiles) {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setMergedPdfUrl(url);

      toast({
        title: "Success!",
        description: "Your PDFs have been merged successfully.",
      });
    } catch (error) {
      console.error('Merge error:', error);
      toast({
        title: "Merge failed",
        description: "There was an error merging your PDFs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadMergedPdf = () => {
    if (mergedPdfUrl) {
      const link = document.createElement('a');
      link.href = mergedPdfUrl;
      link.download = 'merged-document.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <PDFToolLayout
      title="Merge PDF"
      description="Combine multiple PDF files into a single document"
    >
      <div className="space-y-8">
        <FileUploadZone
          accept=".pdf"
          multiple={true}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
        />

        {selectedFiles.length >= 2 && (
          <div className="text-center">
            <Button
              size="lg"
              onClick={handleMerge}
              disabled={isProcessing}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 px-8 py-4"
            >
              {isProcessing ? (
                "Processing..."
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Merge PDFs
                </>
              )}
            </Button>
          </div>
        )}

        {mergedPdfUrl && (
          <div className="text-center">
            <Button
              size="lg"
              onClick={downloadMergedPdf}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-0 px-8 py-4"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Merged PDF
            </Button>
          </div>
        )}
      </div>
    </PDFToolLayout>
  );
};

export default MergePDF;
