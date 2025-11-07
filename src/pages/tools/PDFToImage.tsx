import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Download, FileImage, Trash2, Settings } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import PDFToolLayout from '@/components/PDFToolLayout';
import * as pdfjsLib from 'pdfjs-dist';

// Set up the worker - using static asset from public directory
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

interface ConvertedFile {
  id: string;
  name: string;
  originalFile: File;
  imageBlob?: Blob;
  status: 'pending' | 'converting' | 'completed' | 'error';
  error?: string;
  progress: number;
  url?: string;
  pageNumber: number;
}

type ImageFormat = 'jpeg' | 'png' | 'webp';

interface ConversionSettings {
  format: ImageFormat;
  quality: number;
  scale: number;
  backgroundColor: string;
}

const PDFToImage = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [settings, setSettings] = useState<ConversionSettings>({
    format: 'jpeg',
    quality: 80,
    scale: 2.0,
    backgroundColor: '#ffffff'
  });
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    const validFiles = files.filter(file => file.type === 'application/pdf');
    
    if (validFiles.length !== files.length) {
      toast({
        title: 'Invalid files',
        description: 'Please select only PDF files.',
        variant: 'destructive',
      });
    }
    
    setSelectedFiles(validFiles);
    setConvertedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileExtension = (format: ImageFormat): string => {
    switch (format) {
      case 'jpeg': return 'jpg';
      case 'png': return 'png';
      case 'webp': return 'webp';
      default: return 'jpg';
    }
  };

  const getMimeType = (format: ImageFormat): string => {
    switch (format) {
      case 'jpeg': return 'image/jpeg';
      case 'png': return 'image/png';
      case 'webp': return 'image/webp';
      default: return 'image/jpeg';
    }
  };

  const convertPdfToImages = async (file: File): Promise<ConvertedFile[]> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const convertedImages: ConvertedFile[] = [];
      const totalPages = pdf.numPages;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: settings.scale });

        // Create canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) continue;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Set background color for transparent PDFs
        if (settings.format === 'jpeg' || settings.backgroundColor !== 'transparent') {
          ctx.fillStyle = settings.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Render PDF page to canvas
        const renderContext = {
          canvasContext: ctx,
          viewport: viewport,
        };

        await page.render(renderContext).promise;

        // Convert canvas to blob
        const blob = await new Promise<Blob>((resolve, reject) => {
          const qualityValue = settings.format === 'png' ? undefined : settings.quality / 100;
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to create blob'));
            }
          }, getMimeType(settings.format), qualityValue);
        });

        const extension = getFileExtension(settings.format);
        const fileName = `${file.name.replace('.pdf', '')}_page_${pageNum.toString().padStart(2, '0')}.${extension}`;
        const url = URL.createObjectURL(blob);

        convertedImages.push({
          id: `${Date.now()}_${pageNum}`,
          name: fileName,
          originalFile: file,
          imageBlob: blob,
          status: 'completed',
          progress: 100,
          url,
          pageNumber: pageNum
        });

        // Update progress
        setConversionProgress((pageNum / totalPages) * 100);
      }

      return convertedImages;
    } catch (error) {
      console.error('Error converting PDF to images:', error);
      console.error('Error details:', {
        name: error instanceof Error ? error.name : 'Unknown',
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new Error(`Failed to convert PDF to images: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select PDF files to convert.',
        variant: 'destructive',
      });
      return;
    }

    setIsConverting(true);
    setConversionProgress(0);
    const newConvertedFiles: ConvertedFile[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        
        try {
          const convertedImages = await convertPdfToImages(file);
          newConvertedFiles.push(...convertedImages);
        } catch (error) {
          // Add error entry for failed file
          newConvertedFiles.push({
            id: Date.now().toString() + i,
            name: file.name,
            originalFile: file,
            status: 'error',
            error: error instanceof Error ? error.message : 'Conversion failed',
            progress: 0,
            pageNumber: 0
          });
        }
      }

      setConvertedFiles(newConvertedFiles);
      
      const successCount = newConvertedFiles.filter(f => f.status === 'completed').length;
      const errorCount = newConvertedFiles.filter(f => f.status === 'error').length;
      
      if (successCount > 0) {
        toast({
          title: 'Conversion completed!',
          description: `${successCount} image${successCount > 1 ? 's' : ''} converted successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
        });
      } else {
        toast({
          title: 'Conversion failed',
          description: 'No images were converted successfully.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Conversion failed',
        description: 'There was an error during conversion. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsConverting(false);
      setSelectedFiles([]);
    }
  };

  const downloadFile = (file: ConvertedFile) => {
    if (file.url) {
      const a = document.createElement('a');
      a.href = file.url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const downloadAll = () => {
    const completedFiles = convertedFiles.filter(f => f.status === 'completed' && f.url);
    completedFiles.forEach((file, index) => {
      setTimeout(() => downloadFile(file), index * 100);
    });
  };

  const formatDisplayName = (format: ImageFormat): string => {
    switch (format) {
      case 'jpeg': return 'JPEG';
      case 'png': return 'PNG';
      case 'webp': return 'WebP';
      default: return 'JPEG';
    }
  };

  return (
    <PDFToolLayout
      title="PDF to Image Converter"
      description="Convert PDF pages to high-quality images in multiple formats (JPEG, PNG, WebP)"
    >
      <div className="space-y-6">
        {/* File Upload Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileImage className="w-5 h-5" />
              Upload PDF Files
            </CardTitle>
            <CardDescription>
              Select PDF files to convert to images. Each page will be converted to a separate image file.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors cursor-pointer"
              onClick={() => document.getElementById('pdf-file-input')?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('border-blue-400', 'bg-blue-50');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('border-blue-400', 'bg-blue-50');
                const files = Array.from(e.dataTransfer.files);
                handleFilesSelected(files);
              }}
            >
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-lg font-medium text-gray-700 mb-2">
                Drop PDF files here or click to browse
              </p>
              <p className="text-sm text-gray-500">
                Supports PDF files only
              </p>
            </div>
            <input
              id="pdf-file-input"
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                handleFilesSelected(files);
              }}
            />
          </CardContent>
        </Card>

        {/* Conversion Settings */}
        {selectedFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Conversion Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Output Format */}
              <div className="space-y-2">
                <Label>Output Format</Label>
                <Select value={settings.format} onValueChange={(value: ImageFormat) => setSettings(prev => ({ ...prev, format: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="jpeg">JPEG - Best for photos, smaller file size</SelectItem>
                    <SelectItem value="png">PNG - Lossless, supports transparency</SelectItem>
                    <SelectItem value="webp">WebP - Modern format, excellent compression</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quality Setting (for JPEG and WebP) */}
              {(settings.format === 'jpeg' || settings.format === 'webp') && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Image Quality</Label>
                    <span className="text-sm font-medium">{settings.quality}%</span>
                  </div>
                  <Slider
                    value={[settings.quality]}
                    onValueChange={(value) => setSettings(prev => ({ ...prev, quality: value[0] }))}
                    max={100}
                    min={10}
                    step={5}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Smaller file</span>
                    <span>Better quality</span>
                  </div>
                </div>
              )}

              {/* Scale/Resolution */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <Label>Resolution Scale</Label>
                  <span className="text-sm font-medium">{settings.scale}x</span>
                </div>
                <Slider
                  value={[settings.scale]}
                  onValueChange={(value) => setSettings(prev => ({ ...prev, scale: value[0] }))}
                  max={4.0}
                  min={0.5}
                  step={0.1}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500">
                  <span>Lower resolution</span>
                  <span>Higher resolution</span>
                </div>
              </div>

              {/* Background Color (for JPEG) */}
              {settings.format === 'jpeg' && (
                <div className="space-y-2">
                  <Label>Background Color</Label>
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={settings.backgroundColor}
                      onChange={(e) => setSettings(prev => ({ ...prev, backgroundColor: e.target.value }))}
                      className="w-12 h-8 rounded border"
                    />
                    <span className="text-sm text-gray-600">{settings.backgroundColor}</span>
                  </div>
                  <p className="text-xs text-gray-500">Background color for transparent areas in PDF</p>
                </div>
              )}

              {/* Settings Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                  <div className="font-medium text-sm">Format</div>
                  <div className="text-blue-600">{formatDisplayName(settings.format)}</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-sm">Quality</div>
                  <div className="text-green-600">{settings.format === 'png' ? 'Lossless' : `${settings.quality}%`}</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-sm">Scale</div>
                  <div className="text-purple-600">{settings.scale}x</div>
                </div>
                <div className="text-center">
                  <div className="font-medium text-sm">Files</div>
                  <div className="text-orange-600">{selectedFiles.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Selected Files */}
        {selectedFiles.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Selected Files ({selectedFiles.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileImage className="w-5 h-5 text-red-600" />
                      <div>
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {(file.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveFile(index)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <Button
                  onClick={handleConvert}
                  disabled={isConverting}
                  className="w-full"
                >
                  {isConverting ? 'Converting...' : `Convert ${selectedFiles.length} File${selectedFiles.length > 1 ? 's' : ''} to ${formatDisplayName(settings.format)}`}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Conversion Progress */}
        {isConverting && (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Converting to {formatDisplayName(settings.format)}...</span>
                  <span>{Math.round(conversionProgress)}%</span>
                </div>
                <Progress value={conversionProgress} className="w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Converted Files */}
        {convertedFiles.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Converted Images ({convertedFiles.filter(f => f.status === 'completed').length})</CardTitle>
                {convertedFiles.some(f => f.status === 'completed') && (
                  <Button onClick={downloadAll} variant="outline">
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {convertedFiles.map((file) => (
                  <div key={file.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <FileImage className="w-5 h-5 text-blue-600" />
                      <Badge
                        variant={file.status === 'completed' ? 'default' : file.status === 'error' ? 'destructive' : 'secondary'}
                      >
                        {file.status}
                      </Badge>
                    </div>
                    <p className="font-medium text-sm mb-1 truncate" title={file.name}>
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500 mb-2">
                      Page {file.pageNumber} • {formatDisplayName(settings.format)}
                    </p>
                    {file.error && (
                      <Alert className="mb-2">
                        <AlertDescription className="text-xs">{file.error}</AlertDescription>
                      </Alert>
                    )}
                    {file.status === 'completed' && (
                      <Button onClick={() => downloadFile(file)} size="sm" className="w-full">
                        <Download className="w-3 h-3 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PDFToolLayout>
  );
};

export default PDFToImage;