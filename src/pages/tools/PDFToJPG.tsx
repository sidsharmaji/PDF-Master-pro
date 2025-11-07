
import { useState } from "react";
import PDFToolLayout from "@/components/PDFToolLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Download, FileImage } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - using static asset from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface ConvertedFile {
  name: string;
  url: string;
  blob: Blob;
}

const PDFToJPG = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [quality, setQuality] = useState([80]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
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
    setSelectedFiles(pdfFiles);
    setConvertedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const convertPdfToImages = async (file: File): Promise<ConvertedFile[]> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const convertedImages: ConvertedFile[] = [];

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const scale = 2.0; // Higher scale for better quality
        const viewport = page.getViewport({ scale });

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((blob) => {
            resolve(blob as Blob);
          }, 'image/jpeg', quality[0] / 100);
        });

        const fileName = `${file.name.replace('.pdf', '')}_page_${pageNum}.jpg`;
        const url = URL.createObjectURL(blob);

        convertedImages.push({
          name: fileName,
          url,
          blob
        });
      }

      return convertedImages;
    } catch (error) {
      console.error('Error converting PDF to JPG:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to convert PDF to JPG: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select PDF files to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setConvertedFiles([]);

    try {
      const allConvertedFiles: ConvertedFile[] = [];
      
      for (const file of selectedFiles) {
        const convertedImages = await convertPdfToImages(file);
        allConvertedFiles.push(...convertedImages);
      }

      setConvertedFiles(allConvertedFiles);
      
      toast({
        title: "Success!",
        description: `Your PDF${selectedFiles.length > 1 ? 's have' : ' has'} been converted to JPG successfully.`,
      });
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: "Conversion failed",
        description: "There was an error converting your PDF files. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadFile = (file: ConvertedFile) => {
    const link = document.createElement('a');
    link.href = file.url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAll = () => {
    convertedFiles.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 100);
    });
  };

  return (
    <PDFToolLayout
      title="PDF to JPG"
      description="Convert PDF pages to high-quality JPG images"
    >
      <div className="space-y-8">
        <FileUploadZone
          accept=".pdf"
          multiple={true}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
        />

        {selectedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-6">
              <Label className="text-lg font-semibold text-white">Quality Settings</Label>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-white">Image Quality</span>
                  <span className="text-teal-400 font-medium">{quality[0]}%</span>
                </div>
                
                <Slider
                  value={quality}
                  onValueChange={setQuality}
                  max={100}
                  min={10}
                  step={5}
                  className="w-full"
                />
                
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Smaller file</span>
                  <span>Better quality</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                <div className="p-4 bg-white/5 rounded-lg">
                  <FileImage className="w-8 h-8 mx-auto mb-2 text-teal-400" />
                  <div className="text-white font-medium">Output Format</div>
                  <div className="text-teal-400">JPG Images</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-white font-medium">Files Selected</div>
                  <div className="text-purple-400">{selectedFiles.length}</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {selectedFiles.length > 0 && (
          <div className="text-center">
            <Button
              size="lg"
              onClick={handleConvert}
              disabled={isProcessing}
              className="bg-gradient-to-r from-teal-500 to-green-500 hover:from-teal-600 hover:to-green-600 text-white border-0 px-8 py-4"
            >
              {isProcessing ? (
                "Converting..."
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Convert to JPG
                </>
              )}
            </Button>
          </div>
        )}

        {convertedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-semibold text-white">
                  Converted Files ({convertedFiles.length})
                </Label>
                <Button
                  onClick={downloadAll}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All
                </Button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {convertedFiles.map((file, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between mb-2">
                      <FileImage className="w-6 h-6 text-teal-400" />
                      <Button
                        size="sm"
                        onClick={() => downloadFile(file)}
                        className="bg-teal-500 hover:bg-teal-600"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-white text-sm font-medium truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-gray-400 text-xs">
                      JPG Image
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

export default PDFToJPG;
