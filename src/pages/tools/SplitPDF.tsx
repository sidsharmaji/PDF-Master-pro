
import { useState } from "react";
import PDFToolLayout from "@/components/PDFToolLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Scissors } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from 'pdf-lib';

interface SplitFile {
  name: string;
  url: string;
  blob: Blob;
}

const SplitPDF = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [splitOption, setSplitOption] = useState<"pages" | "range">("pages");
  const [pageNumbers, setPageNumbers] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitFiles, setSplitFiles] = useState<SplitFile[]>([]);
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
    setSelectedFiles(pdfFiles.slice(0, 1));
    setSplitFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const splitByPages = async (pdf: PDFDocument, originalName: string) => {
    const totalPages = pdf.getPageCount();
    const splitResults: SplitFile[] = [];

    for (let i = 0; i < totalPages; i++) {
      const newPdf = await PDFDocument.create();
      const [copiedPage] = await newPdf.copyPages(pdf, [i]);
      newPdf.addPage(copiedPage);

      const pdfBytes = await newPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      splitResults.push({
        name: `${originalName.replace('.pdf', '')}_page_${i + 1}.pdf`,
        url,
        blob
      });
    }

    return splitResults;
  };

  const parsePageRanges = (input: string, totalPages: number): number[] => {
    const pages: number[] = [];
    const ranges = input.split(',').map(r => r.trim());

    for (const range of ranges) {
      if (range.includes('-')) {
        const [start, end] = range.split('-').map(n => parseInt(n.trim()));
        if (start && end && start <= totalPages && end <= totalPages && start <= end) {
          for (let i = start; i <= end; i++) {
            pages.push(i - 1); // Convert to 0-based index
          }
        }
      } else {
        const page = parseInt(range);
        if (page && page <= totalPages) {
          pages.push(page - 1); // Convert to 0-based index
        }
      }
    }

    return [...new Set(pages)].sort((a, b) => a - b);
  };

  const splitByRange = async (pdf: PDFDocument, originalName: string) => {
    const totalPages = pdf.getPageCount();
    const pageIndices = parsePageRanges(pageNumbers, totalPages);

    if (pageIndices.length === 0) {
      throw new Error('Invalid page range specified');
    }

    const newPdf = await PDFDocument.create();
    const copiedPages = await newPdf.copyPages(pdf, pageIndices);
    copiedPages.forEach(page => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    return [{
      name: `${originalName.replace('.pdf', '')}_pages_${pageNumbers.replace(/\s+/g, '')}.pdf`,
      url,
      blob
    }];
  };

  const handleSplit = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No file selected",
        description: "Please select a PDF file to split.",
        variant: "destructive",
      });
      return;
    }

    if (splitOption === "range" && !pageNumbers.trim()) {
      toast({
        title: "Page range required",
        description: "Please specify the page numbers to extract.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const file = selectedFiles[0];
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);

      let results: SplitFile[];
      if (splitOption === "pages") {
        results = await splitByPages(pdf, file.name);
      } else {
        results = await splitByRange(pdf, file.name);
      }

      setSplitFiles(results);
      toast({
        title: "Success!",
        description: "Your PDF has been split successfully.",
      });
    } catch (error) {
      console.error('Split error:', error);
      toast({
        title: "Split failed",
        description: "There was an error splitting your PDF. Please check your page range and try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (file: SplitFile) => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = () => {
    splitFiles.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 100);
    });
  };

  return (
    <PDFToolLayout
      title="Split PDF"
      description="Extract specific pages or split your PDF into separate files"
    >
      <div className="space-y-8">
        <FileUploadZone
          accept=".pdf"
          multiple={false}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
        />

        {selectedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-4">
              <Label className="text-lg font-semibold text-white">Split Options</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  variant={splitOption === "pages" ? "default" : "outline"}
                  onClick={() => setSplitOption("pages")}
                  className="p-4 h-auto"
                >
                  <div className="text-center">
                    <Scissors className="w-6 h-6 mx-auto mb-2" />
                    <div className="font-medium">Split by Pages</div>
                    <div className="text-sm opacity-75">Every page as separate file</div>
                  </div>
                </Button>
                
                <Button
                  variant={splitOption === "range" ? "default" : "outline"}
                  onClick={() => setSplitOption("range")}
                  className="p-4 h-auto"
                >
                  <div className="text-center">
                    <Scissors className="w-6 h-6 mx-auto mb-2" />
                    <div className="font-medium">Split by Range</div>
                    <div className="text-sm opacity-75">Specify page ranges</div>
                  </div>
                </Button>
              </div>

              {splitOption === "range" && (
                <div className="space-y-2">
                  <Label htmlFor="pageNumbers" className="text-white">
                    Page Numbers (e.g., 1-3, 5, 7-10)
                  </Label>
                  <Input
                    id="pageNumbers"
                    value={pageNumbers}
                    onChange={(e) => setPageNumbers(e.target.value)}
                    placeholder="1-3, 5, 7-10"
                    className="bg-white/10 border-white/20 text-white"
                  />
                </div>
              )}
            </div>
          </Card>
        )}

        {selectedFiles.length > 0 && (
          <div className="text-center">
            <Button
              size="lg"
              onClick={handleSplit}
              disabled={isProcessing}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-0 px-8 py-4"
            >
              {isProcessing ? (
                "Processing..."
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Split PDF
                </>
              )}
            </Button>
          </div>
        )}

        {splitFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-semibold text-white">
                  Split Files ({splitFiles.length})
                </Label>
                {splitFiles.length > 1 && (
                  <Button
                    onClick={downloadAll}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {splitFiles.map((file, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <Scissors className="w-6 h-6 text-blue-400" />
                      <Button
                        size="sm"
                        onClick={() => downloadFile(file)}
                        className="bg-blue-500 hover:bg-blue-600"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-white text-sm font-medium truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-gray-400 text-xs">
                      PDF Document
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </div>
    </PDFToolLayout>
  );
};

export default SplitPDF;
