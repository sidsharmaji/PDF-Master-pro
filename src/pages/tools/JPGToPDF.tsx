
import { useState } from "react";
import PDFToolLayout from "@/components/PDFToolLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument } from 'pdf-lib';

interface ConvertedFile {
  name: string;
  url: string;
  blob: Blob;
}

const JPGToPDF = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pageSize, setPageSize] = useState("A4");
  const [orientation, setOrientation] = useState("portrait");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    const imageFiles = files.filter(file => 
      file.type.startsWith("image/") && 
      (file.type.includes("jpeg") || file.type.includes("jpg") || file.type.includes("png") || file.type.includes("gif") || file.type.includes("bmp") || file.type.includes("webp"))
    );
    if (imageFiles.length !== files.length) {
      toast({
        title: "Invalid files",
        description: "Please select only image files (JPG, JPEG, PNG, GIF, BMP, WebP).",
        variant: "destructive",
      });
    }
    setSelectedFiles(prev => [...prev, ...imageFiles]);
    setConvertedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const moveFile = (fromIndex: number, toIndex: number) => {
    setSelectedFiles(prev => {
      const newFiles = [...prev];
      const [movedFile] = newFiles.splice(fromIndex, 1);
      newFiles.splice(toIndex, 0, movedFile);
      return newFiles;
    });
  };

  const createPDFFromImages = async (): Promise<ConvertedFile> => {
    const pdfDoc = await PDFDocument.create();
    const totalFiles = selectedFiles.length;
    let processedFiles = 0;
    
    for (const file of selectedFiles) {
      setProcessingProgress((processedFiles / totalFiles) * 100);
      const imageBytes = await file.arrayBuffer();
      let image;
      
      try {
        if (file.type.includes('png')) {
          image = await pdfDoc.embedPng(imageBytes);
        } else if (file.type.includes('jpeg') || file.type.includes('jpg')) {
          image = await pdfDoc.embedJpg(imageBytes);
        } else {
          // For other formats (GIF, BMP, WebP), convert to canvas first then to JPEG
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
          });
          
          canvas.width = img.width;
          canvas.height = img.height;
          ctx?.drawImage(img, 0, 0);
          
          // Convert canvas to JPEG blob
          const jpegBlob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9);
          });
          
          const jpegBytes = await jpegBlob.arrayBuffer();
          image = await pdfDoc.embedJpg(jpegBytes);
          
          URL.revokeObjectURL(img.src);
        }
      } catch (error) {
         console.error(`Error processing image ${file.name}:`, error);
         toast({
           title: "Image processing error",
           description: `Failed to process ${file.name}. Skipping this image.`,
           variant: "destructive",
         });
         // Skip this image and continue with the next one
         processedFiles++;
         continue;
       }
       
       // Get page dimensions based on settings
      let pageWidth = 595; // A4 width in points
      let pageHeight = 842; // A4 height in points
      
      if (pageSize === "A3") {
        pageWidth = 842;
        pageHeight = 1191;
      } else if (pageSize === "A5") {
        pageWidth = 420;
        pageHeight = 595;
      } else if (pageSize === "Letter") {
        pageWidth = 612;
        pageHeight = 792;
      } else if (pageSize === "Legal") {
        pageWidth = 612;
        pageHeight = 1008;
      } else if (pageSize === "custom") {
        // Fit to image size
        pageWidth = image.width;
        pageHeight = image.height;
      }
      
      // Handle orientation
      if (orientation === "landscape") {
        [pageWidth, pageHeight] = [pageHeight, pageWidth];
      } else if (orientation === "auto") {
        // Auto-detect orientation based on image aspect ratio
        const imageAspectRatio = image.width / image.height;
        const pageAspectRatio = pageWidth / pageHeight;
        
        if (imageAspectRatio > 1 && pageAspectRatio < 1) {
          // Image is landscape, page is portrait - switch to landscape
          [pageWidth, pageHeight] = [pageHeight, pageWidth];
        }
      }
      
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      
      // Scale image to fit page
      const imageWidth = image.width;
      const imageHeight = image.height;
      const scaleX = pageWidth / imageWidth;
      const scaleY = pageHeight / imageHeight;
      const scale = Math.min(scaleX, scaleY);
      
      const scaledWidth = imageWidth * scale;
      const scaledHeight = imageHeight * scale;
      
      // Center the image on the page
      const x = (pageWidth - scaledWidth) / 2;
      const y = (pageHeight - scaledHeight) / 2;
      
      page.drawImage(image, {
        x,
        y,
        width: scaledWidth,
        height: scaledHeight,
      });
      
      processedFiles++;
    }
    
    setProcessingProgress(100);
    
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    
    return {
      name: `images_to_pdf_${Date.now()}.pdf`,
      url,
      blob
    };
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select image files to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProcessingProgress(0);
    
    try {
      const convertedFile = await createPDFFromImages();
      setConvertedFiles([convertedFile]);
      
      toast({
        title: "Success!",
        description: "Your images have been converted to PDF successfully.",
      });
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: "Conversion failed",
        description: "There was an error converting your images. Please try again.",
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

  return (
    <PDFToolLayout
      title="Image to PDF"
      description="Convert images (JPG, JPEG, PNG, GIF, BMP, WebP) to PDF documents"
    >
      <div className="space-y-8">
        <FileUploadZone
          accept="image/*"
          multiple={true}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
        />

        {selectedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-6">
              <Label className="text-lg font-semibold text-white">PDF Settings</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label className="text-white">Page Size</Label>
                  <Select value={pageSize} onValueChange={setPageSize}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="A4">A4</SelectItem>
                      <SelectItem value="A3">A3</SelectItem>
                      <SelectItem value="A5">A5</SelectItem>
                      <SelectItem value="Letter">Letter</SelectItem>
                      <SelectItem value="Legal">Legal</SelectItem>
                      <SelectItem value="custom">Fit to Image</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-white">Orientation</Label>
                  <Select value={orientation} onValueChange={setOrientation}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="portrait">Portrait</SelectItem>
                      <SelectItem value="landscape">Landscape</SelectItem>
                      <SelectItem value="auto">Auto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center">
                <div className="p-4 bg-white/5 rounded-lg">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-pink-400" />
                  <div className="text-white font-medium">Output Format</div>
                  <div className="text-pink-400">PDF Document</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-white font-medium">Images Selected</div>
                  <div className="text-purple-400">{selectedFiles.length}</div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {selectedFiles.length > 0 && (
          <div className="text-center space-y-4">
            <Button
              size="lg"
              onClick={handleConvert}
              disabled={isProcessing}
              className="bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white border-0 px-8 py-4"
            >
              {isProcessing ? (
                "Creating PDF..."
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Create PDF
                </>
              )}
            </Button>
            
            {isProcessing && (
              <div className="max-w-md mx-auto space-y-2">
                <Progress value={processingProgress} className="w-full" />
                <p className="text-sm text-gray-400">
                  Processing images... {Math.round(processingProgress)}%
                </p>
              </div>
            )}
          </div>
        )}

        {convertedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <Label className="text-lg font-semibold text-white">
                  Created PDF
                </Label>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {convertedFiles.map((file, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <FileText className="w-6 h-6 text-pink-400" />
                        <div>
                          <p className="text-white text-sm font-medium">{file.name}</p>
                          <p className="text-gray-400 text-xs">PDF containing {selectedFiles.length} image{selectedFiles.length > 1 ? 's' : ''}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => downloadFile(file)}
                        className="bg-pink-500 hover:bg-pink-600"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                    </div>
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

export default JPGToPDF;
