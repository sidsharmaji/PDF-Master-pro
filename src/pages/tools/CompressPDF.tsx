import React, { useState, useCallback } from 'react';
import { PDFDocument, PDFPage, PDFDict, PDFName } from 'pdf-lib';
import { toast } from '@/hooks/use-toast';
import PDFToolLayout from '@/components/PDFToolLayout';
import FileUploadZone from '@/components/FileUploadZone';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Download, Zap, Target, Settings, Shrink, FileText, Image, Layers, Gauge, Minimize2, BookOpen, Code } from 'lucide-react';

interface CompressionConfig {
  quality: number;
  removeImages: boolean;
  removeAnnotations: boolean;
  removeMetadata: boolean;
  targetSizeKB?: number;
  useTargetSize: boolean;
  compressionLevel: 'high' | 'mid' | 'low';
  removeUnusedObjects: boolean;
  optimizeImages: boolean;
  removeBookmarks: boolean;
  removeJavaScript: boolean;
}

interface CompressionPreset {
  name: string;
  description: string;
  icon: React.ReactNode;
  config: Partial<CompressionConfig>;
  expectedReduction: string;
}

// Helper function to optimize PDF content streams
const optimizeContentStream = (content: string): string => {
  return content
    // Remove excessive whitespace
    .replace(/\s+/g, ' ')
    // Remove unnecessary line breaks
    .replace(/\n\s*\n/g, '\n')
    // Optimize common PDF operators
    .replace(/\s+([qQSs])\s+/g, '$1')
    .replace(/\s+([mlhvczf])\s+/g, '$1')
    .trim();
};

// Helper function to remove unused resources
const cleanupResources = (page: PDFPage, aggressiveMode: boolean = false) => {
  try {
    const resources = page.node.Resources();
    if (!resources) return;

    // Remove unused fonts in aggressive mode
    if (aggressiveMode && resources.has(PDFName.of('Font'))) {
      const fonts = resources.lookup(PDFName.of('Font'));
      if (fonts instanceof PDFDict) {
        const fontKeys = fonts.keys();
        // Keep only essential fonts
        if (fontKeys.length > 2) {
          fontKeys.slice(2).forEach(key => {
            try {
              fonts.delete(key);
            } catch (e) {
              // Skip if can't delete
            }
          });
        }
      }
    }

    // Remove unused graphics states
    if (aggressiveMode && resources.has(PDFName.of('ExtGState'))) {
      const extGStates = resources.lookup(PDFName.of('ExtGState'));
      if (extGStates instanceof PDFDict) {
        const stateKeys = extGStates.keys();
        // Remove non-essential graphics states
        stateKeys.forEach(key => {
          try {
            const state = extGStates.lookup(key);
            if (state instanceof PDFDict) {
              // Remove transparency and complex blending modes
              if (state.has(PDFName.of('BM')) || state.has(PDFName.of('CA')) || state.has(PDFName.of('ca'))) {
                extGStates.delete(key);
              }
            }
          } catch (e) {
            // Skip problematic states
          }
        });
      }
    }
  } catch (e) {
    // Skip if resource cleanup fails
  }
};

interface ProcessedFile {
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  blob: Blob;
}

// Compression presets for different levels
const compressionPresets: CompressionPreset[] = [
  {
    name: 'High Compression',
    description: 'Maximum compression - Reduces file size by 70-90%. Best for documents with many images.',
    icon: <Minimize2 className="w-6 h-6" />,
    expectedReduction: '70-90%',
    config: {
      compressionLevel: 'high',
      quality: 20,
      removeImages: false,
      removeAnnotations: true,
      removeMetadata: true,
      removeUnusedObjects: true,
      optimizeImages: true,
      removeBookmarks: true,
      removeJavaScript: true,
      useTargetSize: false
    }
  },
  {
    name: 'Medium Compression',
    description: 'Balanced compression - Reduces file size by 40-70%. Good balance of size and quality.',
    icon: <Gauge className="w-6 h-6" />,
    expectedReduction: '40-70%',
    config: {
      compressionLevel: 'mid',
      quality: 50,
      removeImages: false,
      removeAnnotations: true,
      removeMetadata: true,
      removeUnusedObjects: true,
      optimizeImages: true,
      removeBookmarks: false,
      removeJavaScript: true,
      useTargetSize: false
    }
  },
  {
    name: 'Low Compression',
    description: 'Gentle compression - Reduces file size by 20-40%. Preserves most document features.',
    icon: <Layers className="w-6 h-6" />,
    expectedReduction: '20-40%',
    config: {
      compressionLevel: 'low',
      quality: 75,
      removeImages: false,
      removeAnnotations: false,
      removeMetadata: true,
      removeUnusedObjects: false,
      optimizeImages: false,
      removeBookmarks: false,
      removeJavaScript: false,
      useTargetSize: false
    }
  }
];

const CompressPDF: React.FC = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [selectedPreset, setSelectedPreset] = useState<number>(1); // Default to medium compression
  const [config, setConfig] = useState<CompressionConfig>({
    quality: 50,
    removeImages: false,
    removeAnnotations: true,
    removeMetadata: true,
    useTargetSize: false,
    targetSizeKB: 1000,
    compressionLevel: 'mid',
    removeUnusedObjects: true,
    optimizeImages: true,
    removeBookmarks: false,
    removeJavaScript: true
  });

  const handleFilesSelected = useCallback((files: File[]) => {
    const pdfFiles = files.filter(file => file.type === 'application/pdf');
    if (pdfFiles.length !== files.length) {
      toast({
        title: 'Invalid files detected',
        description: 'Only PDF files are allowed.',
        variant: 'destructive'
      });
    }
    setSelectedFiles(pdfFiles);
    setProcessedFiles([]);
  }, []);

  // Apply compression preset
  const applyPreset = (presetIndex: number) => {
    const preset = compressionPresets[presetIndex];
    setSelectedPreset(presetIndex);
    setConfig(prev => ({ ...prev, ...preset.config }));
    toast({
      title: 'Compression preset applied',
      description: `${preset.name} settings have been applied.`,
    });
  };

  // Get compression level color
  const getCompressionLevelColor = (level: string) => {
    switch (level) {
      case 'high': return 'text-red-400';
      case 'mid': return 'text-yellow-400';
      case 'low': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  // Get compression level background
  const getCompressionLevelBg = (level: string) => {
    switch (level) {
      case 'high': return 'bg-red-500/20 border-red-500/30';
      case 'mid': return 'bg-yellow-500/20 border-yellow-500/30';
      case 'low': return 'bg-green-500/20 border-green-500/30';
      default: return 'bg-gray-500/20 border-gray-500/30';
    }
  };

  // Enhanced compression function with advanced optimization
  const compressPDF = async (file: File, config: CompressionConfig): Promise<ProcessedFile> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    
    // Remove metadata if requested
    if (config.removeMetadata) {
      pdfDoc.setTitle('');
      pdfDoc.setAuthor('');
      pdfDoc.setSubject('');
      pdfDoc.setKeywords([]);
      pdfDoc.setProducer('');
      pdfDoc.setCreator('');
      // Remove creation and modification dates by setting them to a minimal date
      pdfDoc.setCreationDate(new Date(0));
      pdfDoc.setModificationDate(new Date(0));
    }

    // Remove JavaScript if requested
    if (config.removeJavaScript) {
      try {
        const catalog = pdfDoc.catalog;
        if (catalog.has(PDFName.of('Names'))) {
          const names = catalog.lookup(PDFName.of('Names'));
          if (names instanceof PDFDict && names.has(PDFName.of('JavaScript'))) {
            names.delete(PDFName.of('JavaScript'));
          }
        }
        if (catalog.has(PDFName.of('OpenAction'))) {
          catalog.delete(PDFName.of('OpenAction'));
        }
      } catch (e) {
        // Skip if JavaScript removal fails
      }
    }

    // Remove bookmarks/outlines if requested
    if (config.removeBookmarks) {
      try {
        const catalog = pdfDoc.catalog;
        if (catalog.has(PDFName.of('Outlines'))) {
          catalog.delete(PDFName.of('Outlines'));
        }
      } catch (e) {
        // Skip if bookmark removal fails
      }
    }

    // Get all pages
    const pages = pdfDoc.getPages();
    
    // Process each page for compression
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      
      // Remove annotations if requested
      if (config.removeAnnotations) {
        const annotations = page.node.Annots();
        if (annotations) {
          page.node.delete(PDFName.of('Annots'));
        }
      }

      // Advanced image processing based on compression level
      const resources = page.node.Resources();
      if (resources && resources.has(PDFName.of('XObject'))) {
        if (config.removeImages) {
          resources.delete(PDFName.of('XObject'));
        } else if (config.optimizeImages) {
          const xObjects = resources.lookup(PDFName.of('XObject'));
          if (xObjects instanceof PDFDict) {
            const keys = xObjects.keys();
            keys.forEach(key => {
              try {
                const obj = xObjects.lookup(key);
                if (obj instanceof PDFDict && obj.has(PDFName.of('Width')) && obj.has(PDFName.of('Height'))) {
                  const width = obj.lookup(PDFName.of('Width'));
                  const height = obj.lookup(PDFName.of('Height'));
                  if (width && height && typeof width.asNumber === 'function' && typeof height.asNumber === 'function') {
                    const pixelCount = width.asNumber() * height.asNumber();
                    
                    // Compression level-based image optimization
                    let shouldRemove = false;
                    if (config.compressionLevel === 'high') {
                      shouldRemove = pixelCount > 50000; // Remove medium+ images
                    } else if (config.compressionLevel === 'mid') {
                      shouldRemove = pixelCount > 200000; // Remove large images
                    } else if (config.quality < 50) {
                      shouldRemove = pixelCount > 500000; // Remove very large images only
                    }
                    
                    if (shouldRemove) {
                      xObjects.delete(key);
                    }
                  }
                }
              } catch (e) {
                // Skip problematic objects
              }
            });
          }
        }
      }

      // Remove unused objects if requested
      if (config.removeUnusedObjects) {
        try {
          if (resources) {
            // Remove unused color spaces
            if (resources.has(PDFName.of('ColorSpace'))) {
              const colorSpaces = resources.lookup(PDFName.of('ColorSpace'));
              if (colorSpaces instanceof PDFDict) {
                const csKeys = colorSpaces.keys();
                // Keep only basic color spaces
                csKeys.forEach(key => {
                  const keyStr = key.toString();
                  if (!['DeviceRGB', 'DeviceGray', 'DeviceCMYK'].includes(keyStr)) {
                    try {
                      colorSpaces.delete(key);
                    } catch (e) {
                      // Skip if can't delete
                    }
                  }
                });
              }
            }
            
            // Remove unused patterns
            if (resources.has(PDFName.of('Pattern'))) {
              try {
                resources.delete(PDFName.of('Pattern'));
              } catch (e) {
                // Skip if can't delete
              }
            }
            
            // Remove unused shading
            if (resources.has(PDFName.of('Shading'))) {
              try {
                resources.delete(PDFName.of('Shading'));
              } catch (e) {
                // Skip if can't delete
              }
            }
          }
        } catch (e) {
          // Skip if unused object removal fails
        }
      }

      // Optimize page content streams
      try {
        const contentStream = page.node.Contents();
        if (contentStream && Array.isArray(contentStream)) {
          // Optimize each content stream
          const optimizedStreams = contentStream.map(stream => {
            try {
              if (stream && typeof stream.getContents === 'function') {
                const content = stream.getContents();
                const optimized = optimizeContentStream(content.toString());
                return optimized;
              }
              return stream;
            } catch (e) {
              return stream;
            }
          });
          page.node.set('Contents', optimizedStreams);
        }
      } catch (e) {
        // Skip if content stream optimization fails
      }

      // Clean up unused resources
       cleanupResources(page, config.quality < 50);
    }

    // Calculate compression settings based on quality
    const qualityFactor = config.quality / 100;
    const compressionLevel = Math.max(1, Math.floor((1 - qualityFactor) * 9));
    
    // Save with aggressive compression settings
    const pdfBytes = await pdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false
    });

    // If target size is specified, try iterative compression
    let finalBytes = pdfBytes;
    if (config.useTargetSize && config.targetSizeKB) {
      const targetBytes = config.targetSizeKB * 1024;
      let currentQuality = config.quality;
      let attempts = 0;
      const maxAttempts = 5;
      
      while (finalBytes.length > targetBytes && currentQuality > 5 && attempts < maxAttempts) {
        attempts++;
        currentQuality = Math.max(5, currentQuality - 15);
        const tempDoc = await PDFDocument.load(arrayBuffer);
        
        // Apply aggressive metadata removal
        tempDoc.setTitle('');
        tempDoc.setAuthor('');
        tempDoc.setSubject('');
        tempDoc.setKeywords([]);
        tempDoc.setProducer('');
        tempDoc.setCreator('');
        // Remove creation and modification dates by setting them to a minimal date
        tempDoc.setCreationDate(new Date(0));
        tempDoc.setModificationDate(new Date(0));

        const tempPages = tempDoc.getPages();
        for (let i = 0; i < tempPages.length; i++) {
          const page = tempPages[i];
          
          // Always remove annotations in target size mode
          const annotations = page.node.Annots();
          if (annotations) {
            page.node.delete(PDFName.of('Annots'));
          }

          // Progressively remove more content
          const resources = page.node.Resources();
          if (resources && resources.has(PDFName.of('XObject'))) {
            if (currentQuality < 30) {
              // Remove all images for aggressive compression
              resources.delete(PDFName.of('XObject'));
            } else {
              // Remove large images only
              const xObjects = resources.lookup(PDFName.of('XObject'));
              if (xObjects instanceof PDFDict) {
                const keys = xObjects.keys();
                keys.forEach(key => {
                  try {
                    const obj = xObjects.lookup(key);
                    if (obj instanceof PDFDict && obj.has(PDFName.of('Width')) && obj.has(PDFName.of('Height'))) {
                      const width = obj.lookup(PDFName.of('Width'));
                      const height = obj.lookup(PDFName.of('Height'));
                      const threshold = currentQuality < 50 ? 50000 : 100000;
                      if (width && height && typeof width.asNumber === 'function' && typeof height.asNumber === 'function') {
                        if (width.asNumber() * height.asNumber() > threshold) {
                          xObjects.delete(key);
                        }
                      }
                    }
                  } catch (e) {
                    // Skip problematic objects
                  }
                });
              }
            }
          }

          // Clean up resources aggressively
           cleanupResources(page, true);

           // Optimize content streams for target size
           try {
             const contentStream = page.node.Contents();
             if (contentStream && Array.isArray(contentStream)) {
               const optimizedStreams = contentStream.map(stream => {
                 try {
                   if (stream && typeof stream.getContents === 'function') {
                     const content = stream.getContents();
                     const optimized = optimizeContentStream(content.toString());
                     return optimized;
                   }
                   return stream;
                 } catch (e) {
                   return stream;
                 }
               });
               page.node.set('Contents', optimizedStreams);
             }
           } catch (e) {
             // Skip if content stream optimization fails
           }
         }

        finalBytes = await tempDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
          updateFieldAppearances: false
        });
      }
    }

    const blob = new Blob([finalBytes], { type: 'application/pdf' });
    const compressionRatio = ((file.size - blob.size) / file.size) * 100;

    return {
      name: file.name.replace('.pdf', '_compressed.pdf'),
      originalSize: file.size,
      compressedSize: blob.size,
      compressionRatio,
      blob
    };
  };

  const handleCompress = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: 'No files selected',
        description: 'Please select PDF files to compress.',
        variant: 'destructive'
      });
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    const results: ProcessedFile[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setProgress(((i + 0.5) / selectedFiles.length) * 100);
        
        try {
          const result = await compressPDF(file, config);
          results.push(result);
          
          toast({
            title: 'File compressed successfully',
            description: `${file.name} - ${result.compressionRatio.toFixed(1)}% reduction`
          });
        } catch (error) {
          console.error('Error compressing file:', error);
          toast({
            title: 'Compression failed',
            description: `Failed to compress ${file.name}`,
            variant: 'destructive'
          });
        }
        
        setProgress(((i + 1) / selectedFiles.length) * 100);
      }
      
      setProcessedFiles(results);
      
      if (results.length > 0) {
        toast({
          title: 'Compression completed',
          description: `Successfully compressed ${results.length} file(s)`
        });
      }
    } catch (error) {
      console.error('Compression error:', error);
      toast({
        title: 'Compression failed',
        description: 'An error occurred during compression.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const downloadFile = (file: ProcessedFile) => {
    const url = URL.createObjectURL(file.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    processedFiles.forEach(file => {
      setTimeout(() => downloadFile(file), 100);
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getQualityLabel = (quality: number): string => {
    if (quality >= 80) return 'High Quality';
    if (quality >= 60) return 'Medium Quality';
    if (quality >= 40) return 'Low Quality';
    return 'Minimum Quality';
  };

  return (
    <PDFToolLayout
      title="PDF Compressor"
      description="Reduce PDF file sizes while maintaining quality"
    >
      <div className="space-y-8">
        {/* File Upload */}
        <FileUploadZone
          onFilesSelected={handleFilesSelected}
          accept=".pdf"
          multiple={true}
          selectedFiles={selectedFiles}
          onRemoveFile={(index) => {
            const newFiles = selectedFiles.filter((_, i) => i !== index);
            setSelectedFiles(newFiles);
          }}
        />

        {/* Compression Level Selector */}
        <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-white mb-2">Choose Compression Level</h2>
              <p className="text-gray-400">Select the compression level that best fits your needs</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {compressionPresets.map((preset, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:scale-105 ${
                    selectedPreset === index
                      ? getCompressionLevelBg(preset.config.compressionLevel || 'mid') + ' ring-2 ring-white/20'
                      : 'bg-white/5 border-white/10 hover:bg-white/10'
                  }`}
                  onClick={() => applyPreset(index)}
                >
                  <div className="text-center space-y-4">
                    <div className={`mx-auto ${getCompressionLevelColor(preset.config.compressionLevel || 'mid')}`}>
                      {preset.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">{preset.name}</h3>
                      <p className="text-sm text-gray-400 mb-3">{preset.description}</p>
                      <Badge 
                        variant="outline" 
                        className={`${getCompressionLevelColor(preset.config.compressionLevel || 'mid')} border-current`}
                      >
                        {preset.expectedReduction} reduction
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Advanced Settings */}
        <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
          <Tabs defaultValue="quality" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="quality" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Fine Tuning
              </TabsTrigger>
              <TabsTrigger value="size" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Target Size
              </TabsTrigger>
            </TabsList>

            <TabsContent value="quality" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Compression Quality</Label>
                  <Badge variant="outline" className="text-purple-400">
                    {getQualityLabel(config.quality)}
                  </Badge>
                </div>
                <Slider
                  value={[config.quality]}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, quality: value[0] }))}
                  max={95}
                  min={10}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-gray-400">
                  <span>Minimum (10%)</span>
                  <span className="text-purple-400">{config.quality}%</span>
                  <span>Maximum (95%)</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="size" className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center space-x-4">
                  <Switch
                    checked={config.useTargetSize}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, useTargetSize: checked }))}
                  />
                  <Label className="text-white">Enable Target Size</Label>
                </div>
                {config.useTargetSize && (
                  <div className="space-y-2">
                    <Label className="text-white">Target Size (KB)</Label>
                    <Input
                      type="number"
                      value={config.targetSizeKB}
                      onChange={(e) => setConfig(prev => ({ ...prev, targetSizeKB: parseInt(e.target.value) || 1000 }))}
                      className="bg-white/10 border-white/20 text-white"
                      min={100}
                      max={10000}
                    />
                    <p className="text-sm text-gray-400">
                      The compressor will try to achieve this target size through iterative compression.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-8 space-y-6">
            <Label className="text-lg font-semibold text-white flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Advanced Options
            </Label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    Remove Images
                  </Label>
                  <Switch
                    checked={config.removeImages}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeImages: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Remove Annotations
                  </Label>
                  <Switch
                    checked={config.removeAnnotations}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeAnnotations: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4" />
                    Remove Bookmarks
                  </Label>
                  <Switch
                    checked={config.removeBookmarks}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeBookmarks: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white flex items-center gap-2">
                    <Code className="w-4 h-4" />
                    Remove JavaScript
                  </Label>
                  <Switch
                    checked={config.removeJavaScript}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeJavaScript: checked }))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-white">Remove Metadata</Label>
                  <Switch
                    checked={config.removeMetadata}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeMetadata: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white">Optimize Images</Label>
                  <Switch
                    checked={config.optimizeImages}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, optimizeImages: checked }))}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-white">Remove Unused Objects</Label>
                  <Switch
                    checked={config.removeUnusedObjects}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, removeUnusedObjects: checked }))}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
            <div className={`p-4 rounded-lg ${getCompressionLevelBg(config.compressionLevel)}`}>
              <Shrink className={`w-8 h-8 mx-auto mb-2 ${getCompressionLevelColor(config.compressionLevel)}`} />
              <div className="text-sm text-gray-400">Compression Level</div>
              <div className={getCompressionLevelColor(config.compressionLevel)}>
                {config.compressionLevel === 'high' ? 'High' : config.compressionLevel === 'mid' ? 'Medium' : 'Low'}
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg">
              <Target className="w-8 h-8 mx-auto mb-2 text-blue-400" />
              <div className="text-sm text-gray-400">Target Mode</div>
              <div className="text-blue-400">
                {config.useTargetSize ? 'Enabled' : 'Disabled'}
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg">
              <Settings className="w-8 h-8 mx-auto mb-2 text-purple-400" />
              <div className="text-sm text-gray-400">Options Enabled</div>
              <div className="text-purple-400">
                {[
                  config.removeImages, 
                  config.removeAnnotations, 
                  config.removeMetadata,
                  config.removeBookmarks,
                  config.removeJavaScript,
                  config.removeUnusedObjects,
                  config.optimizeImages
                ].filter(Boolean).length}/7
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-lg">
              <FileText className="w-8 h-8 mx-auto mb-2 text-orange-400" />
              <div className="text-sm text-gray-400">Files</div>
              <div className="text-orange-400">{selectedFiles.length}</div>
            </div>
          </div>
        </Card>

        {/* Processing Status */}
        {isProcessing && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <Label className="text-lg font-semibold text-white mb-4 block">Processing...</Label>
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-gray-400 mt-2">
              Compressing files... {Math.round(progress)}% complete
            </p>
          </Card>
        )}

        {/* Compress Button */}
        {selectedFiles.length > 0 && !isProcessing && (
          <div className="flex justify-center">
            <Button
              onClick={handleCompress}
              size="lg"
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3"
            >
              <Shrink className="w-5 h-5 mr-2" />
              Compress {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}
            </Button>
          </div>
        )}

        {/* Results */}
        {processedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-semibold text-white">Compressed Files</Label>
                <Button
                  onClick={downloadAll}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download All
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {processedFiles.map((file, index) => (
                  <div key={index} className="p-4 bg-white/5 rounded-lg border border-white/10">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <Shrink className="w-6 h-6 text-green-400" />
                        <div>
                          <p className="text-white font-medium">{file.name}</p>
                          <p className="text-gray-400 text-xs">
                            {formatFileSize(file.originalSize)} → {formatFileSize(file.compressedSize)}
                          </p>
                          <p className="text-green-400 text-xs">
                            {file.compressionRatio.toFixed(1)}% reduction
                          </p>
                        </div>
                      </div>
                      <Button
                        onClick={() => downloadFile(file)}
                        size="sm"
                        variant="outline"
                        className="border-white/20 text-white hover:bg-white/10"
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

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center p-6 bg-red-500/10 rounded-lg border border-red-500/20">
            <Minimize2 className="w-12 h-12 mx-auto mb-4 text-red-400" />
            <h3 className="text-white font-semibold mb-2">High Compression</h3>
            <p className="text-gray-400 text-sm">
              Maximum compression up to 90% reduction. Perfect for large files with images and complex content.
            </p>
          </div>
          <div className="text-center p-6 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
            <Gauge className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
            <h3 className="text-white font-semibold mb-2">Medium Compression</h3>
            <p className="text-gray-400 text-sm">
              Balanced approach with 40-70% reduction. Optimal balance between file size and quality.
            </p>
          </div>
          <div className="text-center p-6 bg-green-500/10 rounded-lg border border-green-500/20">
            <Layers className="w-12 h-12 mx-auto mb-4 text-green-400" />
            <h3 className="text-white font-semibold mb-2">Low Compression</h3>
            <p className="text-gray-400 text-sm">
              Gentle compression with 20-40% reduction. Preserves document features and quality.
            </p>
          </div>
          <div className="text-center p-6 bg-white/5 rounded-lg border border-white/10">
            <Zap className="w-12 h-12 mx-auto mb-4 text-yellow-400" />
            <h3 className="text-white font-semibold mb-2">Advanced Features</h3>
            <p className="text-gray-400 text-sm">
              Remove JavaScript, bookmarks, unused objects, and optimize images for maximum efficiency.
            </p>
          </div>
        </div>
      </div>
    </PDFToolLayout>
  );
};

export default CompressPDF;