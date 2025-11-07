import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, Download, FileText, Trash2, AlertCircle, Loader2, Eye, Settings, ChevronLeft, ChevronRight, Maximize2, RotateCcw } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import PizZip from 'pizzip';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import PDFToolLayout from '@/components/PDFToolLayout';

interface ConvertedFile {
  id: string;
  name: string;
  originalFile: File;
  pdfBlob?: Blob;
  status: 'pending' | 'converting' | 'completed' | 'error';
  error?: string;
  progress: number;
  slides: SlideData[];
  metadata: PresentationMetadata;
  url: string;
  size: number;
}

interface PresentationMetadata {
  slideCount: number;
  title?: string;
  author?: string;
  createdDate?: string;
  modifiedDate?: string;
  slideSize: { width: number; height: number };
  slideWidth: number;
  slideHeight: number;
}

interface SlideData {
  id: string;
  title?: string;
  layout: string;
  backgroundColor?: string;
  backgroundImage?: string;
  elements: SlideElement[];
  notes?: string;
  animations?: Animation[];
  transitions?: Transition[];
  hidden?: boolean;
}

interface SlideElement {
  id: string;
  type: 'text' | 'image' | 'shape' | 'chart' | 'table';
  position: { x: number; y: number; width: number; height: number };
  zIndex: number;
  content: any;
  style: ElementStyle;
  animations?: Animation[];
}

interface ElementStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  borderRadius?: number;
  opacity?: number;
  rotation?: number;
  shadow?: ShadowStyle;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  textShadow?: string;
  boxShadow?: string;
  textDecoration?: string;
}

interface ShadowStyle {
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
}

interface Animation {
  type: string;
  duration: number;
  delay: number;
  direction: string;
}

interface Transition {
  type: string;
  duration: number;
}

interface ConversionSettings {
  quality: number;
  pageSize: 'A4' | 'Letter' | 'Legal' | 'A3' | 'Custom';
  orientation: 'portrait' | 'landscape';
  includeNotes: boolean;
  includeHiddenSlides: boolean;
  preserveAnimations: boolean;
  embedFonts: boolean;
  compression: boolean;
  includeImages: boolean;
  format: string;
  watermark?: string;
  dpi: number;
  colorSpace: 'RGB' | 'CMYK';
  optimizeForPrint: boolean;
}

// Performance optimization constants
const CHUNK_SIZE = 5; // Process slides in chunks
const MAX_CONCURRENT_OPERATIONS = 3;
const DEBOUNCE_DELAY = 300;

// Error types for better error handling
type ProcessingError = {
  type: 'file_read' | 'parsing' | 'conversion' | 'memory' | 'network';
  message: string;
  details?: any;
};

const SlidePreview: React.FC<{ slide: SlideData; scale?: number }> = ({ slide, scale = 1 }) => {
  const slideStyle = {
    backgroundColor: slide.backgroundColor || '#ffffff',
    backgroundImage: slide.backgroundImage ? `url(${slide.backgroundImage})` : undefined,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transform: `scale(${scale})`,
    transformOrigin: 'top left'
  };

  const renderElement = (element: SlideElement) => {
    const elementStyle: React.CSSProperties = {
      position: 'absolute',
      left: `${element.position.x}px`,
      top: `${element.position.y}px`,
      width: `${element.position.width}px`,
      height: `${element.position.height}px`,
      zIndex: element.zIndex,
      fontFamily: element.style.fontFamily,
      fontSize: element.style.fontSize ? `${element.style.fontSize}px` : undefined,
      fontWeight: element.style.fontWeight,
      fontStyle: element.style.fontStyle,
      color: element.style.color,
      backgroundColor: element.style.backgroundColor,
      borderColor: element.style.borderColor,
      borderWidth: element.style.borderWidth ? `${element.style.borderWidth}px` : undefined,
      borderStyle: element.style.borderStyle,
      borderRadius: element.style.borderRadius ? `${element.style.borderRadius}px` : undefined,
      opacity: element.style.opacity,
      transform: element.style.rotation ? `rotate(${element.style.rotation}deg)` : undefined,
      textAlign: element.style.textAlign,
      display: 'flex',
      alignItems: element.style.verticalAlign === 'top' ? 'flex-start' : 
                 element.style.verticalAlign === 'bottom' ? 'flex-end' : 'center',
      justifyContent: element.style.textAlign === 'left' ? 'flex-start' :
                     element.style.textAlign === 'right' ? 'flex-end' : 'center',
      boxShadow: element.style.shadow ? 
        `${element.style.shadow.offsetX}px ${element.style.shadow.offsetY}px ${element.style.shadow.blur}px ${element.style.shadow.color}` : undefined
    };

    switch (element.type) {
      case 'text':
        return (
          <div key={element.id} style={elementStyle}>
            <div dangerouslySetInnerHTML={{ __html: element.content.html || element.content.text || '' }} />
          </div>
        );
      case 'image':
        return (
          <div key={element.id} style={elementStyle}>
            <img 
              src={element.content.src} 
              alt={element.content.alt || ''} 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </div>
        );
      case 'shape':
        return (
          <div key={element.id} style={elementStyle}>
            <svg width="100%" height="100%" viewBox={`0 0 ${element.position.width} ${element.position.height}`}>
              {element.content.path && (
                <path d={element.content.path} fill={element.style.backgroundColor} stroke={element.style.borderColor} />
              )}
            </svg>
          </div>
        );
      case 'chart':
        return (
          <div key={element.id} style={elementStyle}>
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-500">
              📊 Chart
            </div>
          </div>
        );
      case 'table':
        return (
          <div key={element.id} style={elementStyle}>
            <table className="w-full h-full border-collapse">
              <tbody>
                {element.content.rows?.map((row: any[], rowIndex: number) => (
                  <tr key={rowIndex}>
                    {row.map((cell: any, cellIndex: number) => (
                      <td key={cellIndex} className="border p-1 text-xs">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="relative border rounded-lg shadow-sm overflow-hidden aspect-[16/9] bg-white"
      style={slideStyle}
    >
      {slide.elements.map(renderElement)}
      {slide.title && (
        <div className="absolute top-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-xs">
          {slide.title}
        </div>
      )}
    </div>
  );
};

const PowerPointToPDF = () => {
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const [isConverting, setIsConverting] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'slide' | 'outline'>('slide');
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [conversionSettings, setConversionSettings] = useState<ConversionSettings>({
    quality: 1.5,
    pageSize: 'A4',
    orientation: 'landscape',
    includeNotes: false,
    includeHiddenSlides: false,
    preserveAnimations: false,
    embedFonts: true,
    compression: true,
    includeImages: true,
    format: 'auto',
    dpi: 150,
    colorSpace: 'RGB',
    optimizeForPrint: false
  });
  const [processingQueue, setProcessingQueue] = useState<string[]>([]);
  const [retryCount, setRetryCount] = useState<Map<string, number>>(new Map());
  const [lastError, setLastError] = useState<ProcessingError | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  // Memoized presentation data for performance
  const presentationData = useMemo(() => {
    const selectedFile = convertedFiles.find(f => f.id === selectedFileId);
    return selectedFile ? { slides: selectedFile.slides, metadata: selectedFile.metadata } : null;
  }, [convertedFiles, selectedFileId]);
  
  // Memoized file statistics
  const fileStats = useMemo(() => {
    if (!convertedFiles.length) return null;
    return {
      total: convertedFiles.length,
      completed: convertedFiles.filter(f => f.status === 'completed').length,
      pending: convertedFiles.filter(f => f.status === 'pending').length,
      errors: convertedFiles.filter(f => f.status === 'error').length,
      totalSize: convertedFiles.reduce((sum, f) => sum + f.size, 0)
    };
  }, [convertedFiles]);
  
  // Enhanced font loading with fallbacks
  useEffect(() => {
    const loadFonts = async () => {
      const fonts = [
        '12px Arial',
        '12px "Times New Roman"',
        '12px Calibri',
        '12px "Segoe UI"',
        '12px Helvetica',
        '12px sans-serif'
      ];
      
      const loadPromises = fonts.map(async (font) => {
        try {
          await document.fonts.load(font);
        } catch (error) {
          console.warn(`Failed to load font: ${font}`, error);
        }
      });
      
      await Promise.allSettled(loadPromises);
    };
    loadFonts();
  }, []);
  
  // Memory cleanup effect
  useEffect(() => {
    return () => {
      // Clean up object URLs to prevent memory leaks
      convertedFiles.forEach(file => {
        if (file.url) {
          URL.revokeObjectURL(file.url);
        }
      });
    };
  }, []);

  // Enhanced error handling helper
  const createProcessingError = (type: ProcessingError['type'], message: string, details?: any): ProcessingError => ({
    type,
    message,
    details
  });
  
  // File validation with detailed feedback
  const validateFile = (file: File): { isValid: boolean; error?: ProcessingError } => {
    const maxSize = 100 * 1024 * 1024; // 100MB
    const allowedTypes = ['.pptx', '.ppt'];
    const fileName = file.name.toLowerCase();
    
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: createProcessingError('file_read', `File size exceeds 100MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB)`)
      };
    }
    
    if (!allowedTypes.some(type => fileName.endsWith(type))) {
      return {
        isValid: false,
        error: createProcessingError('file_read', 'Only .pptx and .ppt files are supported')
      };
    }
    
    return { isValid: true };
  };
  
  // Retry logic for failed operations
  const retryFileProcessing = useCallback(async (fileId: string) => {
    const file = convertedFiles.find(f => f.id === fileId);
    if (!file) return;
    
    const currentRetries = retryCount.get(fileId) || 0;
    if (currentRetries >= 3) {
      setLastError(createProcessingError('conversion', 'Maximum retry attempts reached'));
      return;
    }
    
    setRetryCount(prev => new Map(prev).set(fileId, currentRetries + 1));
    
    // Reset file status and retry
    setConvertedFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'pending' as const, error: undefined } : f
    ));
    
    try {
      const { slides, metadata } = await extractPresentationData(file.originalFile);
      setConvertedFiles(prev => prev.map(f => 
        f.id === fileId ? { ...f, slides, metadata, status: 'pending' as const } : f
      ));
    } catch (error) {
      setConvertedFiles(prev => prev.map(f => 
        f.id === fileId ? { 
          ...f, 
          status: 'error' as const, 
          error: `Retry ${currentRetries + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        } : f
      ));
    }
  }, [convertedFiles, retryCount]);
  
  const handleFilesSelected = useCallback(async (files: File[]) => {
    setLastError(null);
    
    // Validate all files first
    const fileValidations = Array.from(files).map(file => ({
      file,
      validation: validateFile(file)
    }));
    
    const validFiles = fileValidations.filter(({ validation }) => validation.isValid).map(({ file }) => file);
    const invalidFiles = fileValidations.filter(({ validation }) => !validation.isValid);
    
    // Show validation errors
    if (invalidFiles.length > 0) {
      const firstError = invalidFiles[0].validation.error!;
      setLastError(firstError);
    }
    
    // Process valid files in chunks for better performance
    const processFileChunk = async (fileChunk: File[]) => {
      const promises = fileChunk.map(async (file) => {
        const fileId = `${file.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Add file to state immediately
        setConvertedFiles(prev => [...prev, {
          id: fileId,
          name: file.name,
          originalFile: file,
          status: 'pending' as const,
          progress: 0,
          slides: [],
          metadata: { slideCount: 0, slideSize: { width: 720, height: 540 }, slideWidth: 720, slideHeight: 540 },
          url: '',
          size: file.size
        }]);
        
        try {
          const { slides, metadata } = await extractPresentationData(file);
          
          setConvertedFiles(prev => prev.map(f => 
            f.id === fileId ? { ...f, slides, metadata, status: 'pending' as const } : f
          ));
          
          if (slides.length > 0 && !selectedFileId) {
            setSelectedFileId(fileId);
          }
        } catch (error) {
          console.error('Error processing file:', error);
          const processingError = createProcessingError(
            'parsing',
            `Failed to process ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            error
          );
          
          setConvertedFiles(prev => prev.map(f => 
            f.id === fileId ? { 
              ...f, 
              status: 'error' as const, 
              error: processingError.message
            } : f
          ));
          
          setLastError(processingError);
        }
      });
      
      await Promise.allSettled(promises);
    };
    
    // Process files in chunks to avoid overwhelming the browser
    for (let i = 0; i < validFiles.length; i += CHUNK_SIZE) {
      const chunk = validFiles.slice(i, i + CHUNK_SIZE);
      await processFileChunk(chunk);
      
      // Add small delay between chunks to keep UI responsive
      if (i + CHUNK_SIZE < validFiles.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }, [selectedFileId]);

  const handleRemoveFile = useCallback((id: string) => {
    setConvertedFiles(prev => prev.filter(file => file.id !== id));
  }, []);

  const extractPresentationData = async (file: File): Promise<{ slides: SlideData[]; metadata: PresentationMetadata }> => {
    const arrayBuffer = await file.arrayBuffer();
    const zip = new PizZip(arrayBuffer);
    
    // Extract presentation metadata
    const metadata = await extractMetadata(zip);
    
    // Get slide files and sort them
    const slideFiles = Object.keys(zip.files)
      .filter(filename => filename.startsWith('ppt/slides/slide') && filename.endsWith('.xml'))
      .sort((a, b) => {
        const aNum = parseInt(a.match(/slide(\d+)\.xml$/)?.[1] || '0');
        const bNum = parseInt(b.match(/slide(\d+)\.xml$/)?.[1] || '0');
        return aNum - bNum;
      });

    // Extract media files
    const mediaMap = await extractMediaFiles(zip);
    
    // Extract slide layouts
    const layoutMap = await extractSlideLayouts(zip);
    
    // Extract theme information
    const themeData = await extractThemeData(zip);
    
    const slides: SlideData[] = [];

    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const slideXml = zip.files[slideFile].asText();
      const slideNumber = i + 1;
      
      try {
        const slideData = await parseSlideXml(slideXml, slideFile, slideNumber, zip, mediaMap, layoutMap, themeData, metadata);
        slides.push(slideData);
      } catch (error) {
        console.error(`Error parsing slide ${slideNumber}:`, error);
        // Create a fallback slide
        slides.push({
          id: `slide-${slideNumber}`,
          title: `Slide ${slideNumber}`,
          layout: 'blank',
          elements: [{
            id: 'error-text',
            type: 'text',
            position: { x: 50, y: 200, width: 620, height: 100 },
            zIndex: 1,
            content: { text: 'Error loading slide content' },
            style: { fontSize: 24, color: '#ff0000', textAlign: 'center' }
          }]
        });
      }
    }

    return { slides, metadata };
  };
  
  const extractMetadata = async (zip: PizZip): Promise<PresentationMetadata> => {
    try {
      const corePropsXml = zip.files['docProps/core.xml']?.asText() || '';
      const appPropsXml = zip.files['docProps/app.xml']?.asText() || '';
      const presentationXml = zip.files['ppt/presentation.xml']?.asText() || '';
      
      // Extract slide size from presentation.xml
      const slideSizeMatch = presentationXml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
      const slideSize = slideSizeMatch ? {
        width: parseInt(slideSizeMatch[1]) / 12700, // Convert EMU to pixels
        height: parseInt(slideSizeMatch[2]) / 12700
      } : { width: 720, height: 540 };
      
      // Count slides
      const slideCount = (presentationXml.match(/<p:sldId/g) || []).length;
      
      return {
        slideCount,
        title: extractXmlValue(corePropsXml, 'dc:title'),
        author: extractXmlValue(corePropsXml, 'dc:creator'),
        createdDate: extractXmlValue(corePropsXml, 'dcterms:created'),
        modifiedDate: extractXmlValue(corePropsXml, 'dcterms:modified'),
        slideSize,
        slideWidth: slideSize.width,
        slideHeight: slideSize.height
      };
    } catch (error) {
      console.error('Error extracting metadata:', error);
      return {
        slideCount: 0,
        slideSize: { width: 720, height: 540 },
        slideWidth: 720,
        slideHeight: 540
      };
    }
  };
  
  const extractMediaFiles = async (zip: PizZip): Promise<Map<string, string>> => {
    const mediaMap = new Map<string, string>();
    const mediaFiles = Object.keys(zip.files).filter(filename => filename.startsWith('ppt/media/'));
    
    for (const mediaFile of mediaFiles) {
      try {
        const imageData = zip.files[mediaFile].asUint8Array();
        const extension = mediaFile.split('.').pop()?.toLowerCase() || 'png';
        const mimeType = getMimeType(extension);
        // Create a new Uint8Array with a standard ArrayBuffer to ensure compatibility with Blob
        const safeImageData = new Uint8Array(imageData.length);
        safeImageData.set(imageData);
        const blob = new Blob([safeImageData], { type: mimeType });
        const fileName = mediaFile.split('/').pop()!;
        mediaMap.set(fileName, URL.createObjectURL(blob));
      } catch (error) {
        console.error(`Error processing media file ${mediaFile}:`, error);
      }
    }
    
    return mediaMap;
  };
  
  const extractSlideLayouts = async (zip: PizZip): Promise<Map<string, any>> => {
    const layoutMap = new Map<string, any>();
    const layoutFiles = Object.keys(zip.files).filter(filename => 
      filename.startsWith('ppt/slideLayouts/') && filename.endsWith('.xml')
    );
    
    for (const layoutFile of layoutFiles) {
      try {
        const layoutXml = zip.files[layoutFile].asText();
        const layoutId = layoutFile.match(/slideLayout(\d+)\.xml$/)?.[1] || '1';
        layoutMap.set(layoutId, parseLayoutXml(layoutXml));
      } catch (error) {
        console.error(`Error processing layout ${layoutFile}:`, error);
      }
    }
    
    return layoutMap;
  };
  
  const extractThemeData = async (zip: PizZip): Promise<any> => {
     try {
       const themeXml = zip.files['ppt/theme/theme1.xml']?.asText() || '';
       return parseThemeXml(themeXml);
     } catch (error) {
       console.error('Error extracting theme data:', error);
       return {};
     }
   };
   
   // Helper functions for XML parsing
   const extractXmlValue = (xml: string, tagName: string): string | undefined => {
     const match = xml.match(new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i'));
     return match ? match[1] : undefined;
   };
   
   const getMimeType = (extension: string): string => {
     const mimeTypes: { [key: string]: string } = {
       'png': 'image/png',
       'jpg': 'image/jpeg',
       'jpeg': 'image/jpeg',
       'gif': 'image/gif',
       'bmp': 'image/bmp',
       'svg': 'image/svg+xml',
       'webp': 'image/webp'
     };
     return mimeTypes[extension] || 'image/png';
   };
   
   const parseLayoutXml = (layoutXml: string): any => {
     // Extract layout information
     const layoutType = layoutXml.match(/<p:cSld[^>]*name="([^"]*)"/)?.[1] || 'blank';
     return {
       type: layoutType,
       placeholders: extractPlaceholders(layoutXml)
     };
   };
   
   const parseThemeXml = (themeXml: string): any => {
     // Extract theme colors, fonts, and effects
     const colorScheme = extractColorScheme(themeXml);
     const fontScheme = extractFontScheme(themeXml);
     return {
       colors: colorScheme,
       fonts: fontScheme
     };
   };
   
   const extractPlaceholders = (xml: string): any[] => {
     const placeholders: any[] = [];
     const phMatches = xml.matchAll(/<p:ph[^>]*type="([^"]*)"/g);
     for (const match of phMatches) {
       placeholders.push({ type: match[1] });
     }
     return placeholders;
   };
   
   const extractColorScheme = (themeXml: string): any => {
     const colors: any = {};
     const colorMatches = themeXml.matchAll(/<a:(\w+)>\s*<a:srgbClr val="([a-fA-F0-9]{6})"/g);
     for (const match of colorMatches) {
       colors[match[1]] = `#${match[2]}`;
     }
     return colors;
   };
   
   const extractFontScheme = (themeXml: string): any => {
     const fonts: any = {};
     const fontMatches = themeXml.matchAll(/<a:(\w+)Font[^>]*typeface="([^"]*)"/g);
     for (const match of fontMatches) {
       fonts[match[1]] = match[2];
     }
     return fonts;
   };
   
   const parseSlideXml = async (
      slideXml: string, 
      slideFile: string, 
      slideNumber: number, 
      zip: PizZip, 
      mediaMap: Map<string, string>, 
      layoutMap: Map<string, any>, 
      themeData: any, 
      metadata: PresentationMetadata
    ): Promise<SlideData> => {
      const slideId = `slide-${slideNumber}`;
      const elements: SlideElement[] = [];
      
      // Extract slide background
      const backgroundColor = extractBackgroundColor(slideXml, themeData);
      const backgroundImage = await extractBackgroundImage(slideXml, slideFile, zip, mediaMap);
      
      // Extract layout reference
      const layoutRef = slideXml.match(/<p:sldLayoutIdLst>\s*<p:sldLayoutId[^>]*r:id="([^"]*)"/)?.[1];
      const layout = layoutRef ? layoutMap.get(layoutRef) || { type: 'blank' } : { type: 'blank' };
      
      // Extract text elements
      const textElements = await extractTextElements(slideXml, themeData, metadata);
      elements.push(...textElements);
      
      // Extract image elements
      const imageElements = await extractImageElements(slideXml, slideFile, zip, mediaMap, metadata);
      elements.push(...imageElements);
      
      // Extract shape elements
      const shapeElements = await extractShapeElements(slideXml, themeData, metadata);
      elements.push(...shapeElements);
      
      // Extract table elements
      const tableElements = await extractTableElements(slideXml, themeData, metadata);
      elements.push(...tableElements);
      
      // Extract slide title
      const title = extractSlideTitle(slideXml);
      
      // Extract slide notes
      const notes = await extractSlideNotes(slideFile, zip);
      
      return {
        id: slideId,
        title,
        layout: layout.type,
        backgroundColor,
        backgroundImage,
        elements,
        notes
      };
    };
    
    // Element extraction functions
    const extractBackgroundColor = (slideXml: string, themeData: any): string | undefined => {
      const bgMatch = slideXml.match(/<p:bg>.*?<a:srgbClr val="([a-fA-F0-9]{6})"/s);
      if (bgMatch) return `#${bgMatch[1]}`;
      
      // Check for theme color reference
      const themeColorMatch = slideXml.match(/<p:bg>.*?<a:(\w+)Clr/s);
      if (themeColorMatch && themeData.colors) {
        return themeData.colors[themeColorMatch[1]] || '#ffffff';
      }
      
      return '#ffffff';
    };
    
    const extractBackgroundImage = async (slideXml: string, slideFile: string, zip: PizZip, mediaMap: Map<string, string>): Promise<string | undefined> => {
      const bgImageMatch = slideXml.match(/<p:bg>.*?<a:blip r:embed="([^"]*)"/s);
      if (!bgImageMatch) return undefined;
      
      const relId = bgImageMatch[1];
      const relsXml = zip.files[`ppt/slides/_rels/${slideFile.split('/').pop()}.rels`]?.asText() || '';
      const targetMatch = relsXml.match(new RegExp(`<Relationship Id="${relId}"[^>]*Target="../media/([^"]+)"`));
      
      if (targetMatch) {
        return mediaMap.get(targetMatch[1]);
      }
      
      return undefined;
    };
    
    const extractTextElements = async (slideXml: string, themeData: any, metadata: PresentationMetadata): Promise<SlideElement[]> => {
      const elements: SlideElement[] = [];
      const textBoxes = slideXml.matchAll(/<p:sp[^>]*>.*?<p:txBody>(.*?)<\/p:txBody>.*?<\/p:sp>/gs);
      
      let elementIndex = 0;
      for (const textBox of textBoxes) {
        const spXml = textBox[0];
        const txBodyXml = textBox[1];
        
        // Extract position and size
        const position = extractElementPosition(spXml, metadata);
        if (!position) continue;
        
        // Extract text content and formatting
        const textContent = extractFormattedText(txBodyXml, themeData);
        if (!textContent.text.trim()) continue;
        
        elements.push({
          id: `text-${elementIndex++}`,
          type: 'text',
          position,
          zIndex: elementIndex,
          content: textContent,
          style: textContent.style || {}
        });
      }
      
      return elements;
    };
    
    const extractImageElements = async (slideXml: string, slideFile: string, zip: PizZip, mediaMap: Map<string, string>, metadata: PresentationMetadata): Promise<SlideElement[]> => {
      const elements: SlideElement[] = [];
      const images = slideXml.matchAll(/<p:pic[^>]*>(.*?)<\/p:pic>/gs);
      
      let elementIndex = 0;
      for (const image of images) {
        const picXml = image[0];
        const picContent = image[1];
        
        // Extract position and size
        const position = extractElementPosition(picXml, metadata);
        if (!position) continue;
        
        // Extract image reference
        const embedMatch = picContent.match(/<a:blip r:embed="([^"]*)"/);
        if (!embedMatch) continue;
        
        const relId = embedMatch[1];
        const relsXml = zip.files[`ppt/slides/_rels/${slideFile.split('/').pop()}.rels`]?.asText() || '';
        const targetMatch = relsXml.match(new RegExp(`<Relationship Id="${relId}"[^>]*Target="../media/([^"]+)"`));
        
        if (targetMatch) {
          const imageSrc = mediaMap.get(targetMatch[1]);
          if (imageSrc) {
            elements.push({
              id: `image-${elementIndex++}`,
              type: 'image',
              position,
              zIndex: elementIndex,
              content: { src: imageSrc, alt: targetMatch[1] },
              style: {}
            });
          }
        }
      }
      
      return elements;
    };
    
    const extractShapeElements = async (slideXml: string, themeData: any, metadata: PresentationMetadata): Promise<SlideElement[]> => {
      const elements: SlideElement[] = [];
      const shapes = slideXml.matchAll(/<p:sp[^>]*>(?!.*<p:txBody>)(.*?)<\/p:sp>/gs);
      
      let elementIndex = 0;
      for (const shape of shapes) {
        const spXml = shape[0];
        
        // Extract position and size
        const position = extractElementPosition(spXml, metadata);
        if (!position) continue;
        
        // Extract shape properties
        const shapeProps = extractShapeProperties(spXml, themeData);
        
        elements.push({
          id: `shape-${elementIndex++}`,
          type: 'shape',
          position,
          zIndex: elementIndex,
          content: shapeProps.content,
          style: shapeProps.style
        });
      }
      
      return elements;
    };
    
    const extractTableElements = async (slideXml: string, themeData: any, metadata: PresentationMetadata): Promise<SlideElement[]> => {
      const elements: SlideElement[] = [];
      const tables = slideXml.matchAll(/<p:graphicFrame[^>]*>.*?<a:tbl>(.*?)<\/a:tbl>.*?<\/p:graphicFrame>/gs);
      
      let elementIndex = 0;
      for (const table of tables) {
        const frameXml = table[0];
        const tblXml = table[1];
        
        // Extract position and size
        const position = extractElementPosition(frameXml, metadata);
        if (!position) continue;
        
        // Extract table data
        const tableData = extractTableData(tblXml, themeData);
        
        elements.push({
          id: `table-${elementIndex++}`,
          type: 'table',
          position,
          zIndex: elementIndex,
          content: tableData,
          style: {}
        });
      }
      
      return elements;
    };
    
    // Position and formatting helper functions
    const extractElementPosition = (elementXml: string, metadata: PresentationMetadata): { x: number; y: number; width: number; height: number } | null => {
      const transformMatch = elementXml.match(/<a:xfrm[^>]*>.*?<a:off x="([^"]*?)" y="([^"]*?)"\/?>.*?<a:ext cx="([^"]*?)" cy="([^"]*?)"\/?>.*?<\/a:xfrm>/s);
      if (!transformMatch) return null;
      
      const x = parseInt(transformMatch[1]) / 914400 * 96; // Convert EMU to pixels
      const y = parseInt(transformMatch[2]) / 914400 * 96;
      const width = parseInt(transformMatch[3]) / 914400 * 96;
      const height = parseInt(transformMatch[4]) / 914400 * 96;
      
      return { x, y, width, height };
    };
    
    const extractFormattedText = (txBodyXml: string, themeData: any): { text: string; style: ElementStyle } => {
      let text = '';
      const style: ElementStyle = {
        fontFamily: 'Arial',
        fontSize: 12,
        color: '#000000',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textAlign: 'left'
      };
      
      // Extract paragraphs
      const paragraphs = txBodyXml.matchAll(/<a:p[^>]*>(.*?)<\/a:p>/gs);
      
      for (const paragraph of paragraphs) {
        const pXml = paragraph[1];
        
        // Extract paragraph properties
        const pPrMatch = pXml.match(/<a:pPr[^>]*>(.*?)<\/a:pPr>/s);
        if (pPrMatch) {
          const algn = pPrMatch[1].match(/<a:pPr[^>]*algn="([^"]*)"/)?.[1];
          if (algn) {
            style.textAlign = algn === 'ctr' ? 'center' : algn === 'r' ? 'right' : 'left';
          }
        }
        
        // Extract text runs
        const runs = pXml.matchAll(/<a:r[^>]*>(.*?)<\/a:r>/gs);
        
        for (const run of runs) {
          const rXml = run[1];
          
          // Extract run properties
          const rPrMatch = rXml.match(/<a:rPr[^>]*>(.*?)<\/a:rPr>/s);
          if (rPrMatch) {
            const rPrXml = rPrMatch[1];
            
            // Font size
            const szMatch = rPrMatch[0].match(/sz="([^"]*)"/)?.[1];
            if (szMatch) {
              style.fontSize = parseInt(szMatch) / 100;
            }
            
            // Font family
            const fontMatch = rPrXml.match(/<a:latin[^>]*typeface="([^"]*)"/)?.[1];
            if (fontMatch) {
              style.fontFamily = fontMatch;
            }
            
            // Bold
            if (rPrMatch[0].includes('b="1"')) {
              style.fontWeight = 'bold';
            }
            
            // Italic
            if (rPrMatch[0].includes('i="1"')) {
              style.fontStyle = 'italic';
            }
            
            // Color
            const colorMatch = rPrXml.match(/<a:srgbClr val="([a-fA-F0-9]{6})"/)?.[1];
            if (colorMatch) {
              style.color = `#${colorMatch}`;
            }
          }
          
          // Extract text content
          const textMatch = rXml.match(/<a:t[^>]*>(.*?)<\/a:t>/s)?.[1];
          if (textMatch) {
            text += textMatch;
          }
        }
        
        text += '\n';
      }
      
      return { text: text.trim(), style };
    };
    
    const extractShapeProperties = (spXml: string, themeData: any): { content: any; style: ElementStyle } => {
      const style: ElementStyle = {};
      
      // Extract shape type
      const shapeTypeMatch = spXml.match(/<a:prstGeom prst="([^"]*)"/)?.[1] || 'rect';
      
      // Extract fill properties
      const fillMatch = spXml.match(/<a:solidFill>.*?<a:srgbClr val="([a-fA-F0-9]{6})"/s)?.[1];
      if (fillMatch) {
        style.backgroundColor = `#${fillMatch}`;
      }
      
      // Extract line properties
      const lineMatch = spXml.match(/<a:ln[^>]*>.*?<a:solidFill>.*?<a:srgbClr val="([a-fA-F0-9]{6})"/s)?.[1];
      if (lineMatch) {
        style.borderColor = `#${lineMatch}`;
        style.borderWidth = 1;
      }
      
      return {
        content: { shapeType: shapeTypeMatch },
        style
      };
    };
    
    const extractTableData = (tblXml: string, themeData: any): any => {
      const rows: any[] = [];
      const tableRows = tblXml.matchAll(/<a:tr[^>]*>(.*?)<\/a:tr>/gs);
      
      for (const row of tableRows) {
        const rowXml = row[1];
        const cells: any[] = [];
        const tableCells = rowXml.matchAll(/<a:tc[^>]*>(.*?)<\/a:tc>/gs);
        
        for (const cell of tableCells) {
          const cellXml = cell[1];
          const textContent = extractFormattedText(cellXml, themeData);
          
          cells.push({
            text: textContent.text,
            style: textContent.style
          });
        }
        
        rows.push({ cells });
      }
      
      return { rows };
    };
    
    const extractSlideTitle = (slideXml: string): string => {
      // Look for title placeholder
      const titleMatch = slideXml.match(/<p:sp[^>]*>.*?<p:nvSpPr>.*?<p:ph[^>]*type="title".*?<\/p:nvSpPr>.*?<p:txBody>(.*?)<\/p:txBody>.*?<\/p:sp>/s);
      if (titleMatch) {
        const titleText = titleMatch[1].match(/<a:t[^>]*>(.*?)<\/a:t>/s)?.[1];
        return titleText || 'Untitled Slide';
      }
      
      return 'Untitled Slide';
    };
    
    const extractSlideNotes = async (slideFile: string, zip: PizZip): Promise<string> => {
      const slideNumber = slideFile.match(/slide(\d+)\.xml/)?.[1];
      if (!slideNumber) return '';
      
      const notesFile = `ppt/notesSlides/notesSlide${slideNumber}.xml`;
      const notesXml = zip.files[notesFile]?.asText();
      
      if (!notesXml) return '';
      
      const notesMatch = notesXml.match(/<p:txBody>(.*?)<\/p:txBody>/s)?.[1];
      if (notesMatch) {
        const textMatches = notesMatch.matchAll(/<a:t[^>]*>(.*?)<\/a:t>/gs);
        return Array.from(textMatches).map(match => match[1]).join(' ');
      }
      
      return '';
    };
    
    const convertPowerPointToPDF = async () => {
      setIsConverting(true);
      setConversionProgress(0);
      
      try {
        if (!presentationData || presentationData.slides.length === 0) {
          throw new Error('No presentation data available');
        }
        
        // Enhanced PDF dimension calculation based on settings
        const slideWidth = presentationData.metadata.slideWidth || 1280;
        const slideHeight = presentationData.metadata.slideHeight || 720;
        const slideAspectRatio = slideWidth / slideHeight;
        
        // Calculate base PDF dimensions based on page size and DPI
        let basePdfWidth: number, basePdfHeight: number;
        const dpiScale = conversionSettings.dpi / 72; // 72 DPI is PDF default
        
        switch (conversionSettings.pageSize) {
          case 'A4':
            basePdfWidth = 595 * dpiScale;
            basePdfHeight = 842 * dpiScale;
            break;
          case 'Letter':
            basePdfWidth = 612 * dpiScale;
            basePdfHeight = 792 * dpiScale;
            break;
          case 'Legal':
            basePdfWidth = 612 * dpiScale;
            basePdfHeight = 1008 * dpiScale;
            break;
          case 'A3':
            basePdfWidth = 842 * dpiScale;
            basePdfHeight = 1191 * dpiScale;
            break;
          default:
            basePdfWidth = 842 * dpiScale;
            basePdfHeight = 595 * dpiScale;
        }
        
        // Adjust for orientation
        if (conversionSettings.orientation === 'landscape') {
          [basePdfWidth, basePdfHeight] = [basePdfHeight, basePdfWidth];
        }
        
        // Calculate optimal PDF dimensions that preserve slide aspect ratio
        const pageAspectRatio = basePdfWidth / basePdfHeight;
        let pdfWidth: number, pdfHeight: number;
        let contentMargin = 20; // Add margin to prevent content cutoff
        
        if (slideAspectRatio > pageAspectRatio) {
          // Slide is wider than page - fit to width with margins
          pdfWidth = basePdfWidth;
          pdfHeight = basePdfHeight;
          const availableWidth = pdfWidth - (contentMargin * 2);
          const scaledHeight = availableWidth / slideAspectRatio;
          
          if (scaledHeight <= pdfHeight - (contentMargin * 2)) {
            // Content fits with margins
            pdfHeight = scaledHeight + (contentMargin * 2);
          }
        } else {
          // Slide is taller than page - fit to height with margins
          pdfWidth = basePdfWidth;
          pdfHeight = basePdfHeight;
          const availableHeight = pdfHeight - (contentMargin * 2);
          const scaledWidth = availableHeight * slideAspectRatio;
          
          if (scaledWidth <= pdfWidth - (contentMargin * 2)) {
            // Content fits with margins
            pdfWidth = scaledWidth + (contentMargin * 2);
          }
        }
        
        const pdf = new jsPDF({
          orientation: conversionSettings.orientation,
          unit: 'pt',
          format: [pdfWidth, pdfHeight],
          compress: conversionSettings.compression
        });
        
        // Set PDF metadata
        pdf.setProperties({
          title: presentationData.metadata.title || 'PowerPoint Presentation',
          author: presentationData.metadata.author || 'PowerPoint to PDF Converter',
          subject: 'Converted PowerPoint Presentation',
          creator: 'PowerPoint to PDF Converter'
        });
        
        // Filter slides based on settings
        const slidesToProcess = presentationData.slides.filter(slide => 
          conversionSettings.includeHiddenSlides || !slide.hidden
        );
        
        const totalSlides = slidesToProcess.length;
        const chunkSize = 5; // Process slides in chunks to prevent UI blocking
        
        // Process slides in chunks for better performance
        for (let chunkStart = 0; chunkStart < totalSlides; chunkStart += chunkSize) {
          const chunkEnd = Math.min(chunkStart + chunkSize, totalSlides);
          const chunk = slidesToProcess.slice(chunkStart, chunkEnd);
          
          // Process chunk
          for (let i = 0; i < chunk.length; i++) {
            const slideIndex = chunkStart + i;
            const slide = chunk[i];
            
            // Update progress
            const progress = (slideIndex / totalSlides) * 85;
            setConversionProgress(progress);
            
            // Add new page for slides after the first
            if (slideIndex > 0) {
              pdf.addPage([pdfWidth, pdfHeight]);
            }
            
            try {
              await renderSlideToPDF(pdf, slide, pdfWidth, pdfHeight, slideWidth, slideHeight, conversionSettings);
              
              // Add watermark if specified
              if (conversionSettings.watermark) {
                await addWatermark(pdf, conversionSettings.watermark, pdfWidth, pdfHeight);
              }
              
            } catch (slideError) {
              console.warn(`Failed to render slide ${slideIndex + 1}:`, slideError);
              // Add error placeholder
              pdf.setFillColor(245, 245, 245);
              pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
              pdf.setTextColor(100, 100, 100);
              pdf.setFontSize(16);
              pdf.text(`Error rendering slide ${slideIndex + 1}`, pdfWidth / 2, pdfHeight / 2, { align: 'center' });
            }
          }
          
          // Allow UI to update between chunks
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        
        setConversionProgress(95);
        
        // Generate PDF blob with optimization
        const pdfBlob = new Blob([pdf.output('arraybuffer')], { type: 'application/pdf' });
        
        setConversionProgress(100);
        
        // Create download link
        const url = URL.createObjectURL(pdfBlob);
        const fileName = `${presentationData.metadata.title || 'presentation'}.pdf`;
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        // Clean up URL after download
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        // Update the selected file with PDF blob and metadata
        if (selectedFileId) {
          const pdfUrl = URL.createObjectURL(pdfBlob);
          setConvertedFiles(prev => prev.map(f => 
            f.id === selectedFileId ? { 
              ...f, 
              pdfBlob, 
              status: 'completed' as const, 
              url: pdfUrl,
              size: pdfBlob.size
            } : f
          ));
        }
        
      } catch (error) {
        console.error('PDF conversion error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown conversion error';
        
        // Update file status with error
        if (selectedFileId) {
          setConvertedFiles(prev => prev.map(f => 
            f.id === selectedFileId ? { 
              ...f, 
              status: 'error' as const, 
              error: errorMessage
            } : f
          ));
        }
        
        // Show user-friendly error message
        alert(`Conversion failed: ${errorMessage}\n\nPlease try again or check if the PowerPoint file is valid.`);
      } finally {
        setIsConverting(false);
        setConversionProgress(0);
      }
    };
    
    // Helper function to add watermark
    const addWatermark = async (pdf: jsPDF, watermarkText: string, pdfWidth: number, pdfHeight: number) => {
      try {
        pdf.saveGraphicsState();
        pdf.setGState({ opacity: 0.1 });
        pdf.setTextColor(128, 128, 128);
        pdf.setFontSize(48);
        
        // Rotate and center the watermark
        const centerX = pdfWidth / 2;
        const centerY = pdfHeight / 2;
        
        pdf.text(watermarkText, centerX, centerY, {
          align: 'center',
          angle: 45
        });
        
        pdf.restoreGraphicsState();
      } catch (error) {
        console.warn('Failed to add watermark:', error);
      }
    };
    
    const renderSlideToPDF = async (
      pdf: jsPDF, 
      slide: SlideData, 
      pdfWidth: number, 
      pdfHeight: number, 
      slideWidth: number, 
      slideHeight: number, 
      conversionSettings: ConversionSettings
    ) => {
      // Calculate content area with margins
      const contentMargin = 20;
      const contentWidth = pdfWidth - (contentMargin * 2);
      const contentHeight = pdfHeight - (contentMargin * 2);
      
      // Set background
      if (slide.backgroundColor) {
        pdf.setFillColor(slide.backgroundColor);
        pdf.rect(0, 0, pdfWidth, pdfHeight, 'F');
      }
      
      // Render background image if present
      if (slide.backgroundImage && conversionSettings.includeImages) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = slide.backgroundImage!;
          });
          
          // Fit background image to content area
          pdf.addImage(img, 'JPEG', contentMargin, contentMargin, contentWidth, contentHeight);
        } catch (error) {
          console.warn('Failed to load background image:', error);
        }
      }
      
      // Sort elements by z-index
      const sortedElements = [...slide.elements].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
      
      // Render each element with proper content area scaling
      for (const element of sortedElements) {
        await renderElementToPDF(pdf, element, contentWidth, contentHeight, slideWidth, slideHeight, conversionSettings, contentMargin);
      }
    };
    
    const renderElementToPDF = async (
      pdf: jsPDF,
      element: SlideElement,
      contentWidth: number,
      contentHeight: number,
      slideWidth: number,
      slideHeight: number,
      conversionSettings: ConversionSettings,
      contentMargin: number = 20
    ) => {
      // Scale position and size to fit within content area
      const scaleX = contentWidth / slideWidth;
      const scaleY = contentHeight / slideHeight;
      
      // Use uniform scaling to maintain aspect ratio
      const scale = Math.min(scaleX, scaleY);
      
      // Calculate centered positioning if aspect ratios don't match
      const scaledSlideWidth = slideWidth * scale;
      const scaledSlideHeight = slideHeight * scale;
      const offsetX = (contentWidth - scaledSlideWidth) / 2;
      const offsetY = (contentHeight - scaledSlideHeight) / 2;
      
      // Calculate element position and size with proper scaling and margins
      const x = contentMargin + offsetX + (element.position.x * scale);
      const y = contentMargin + offsetY + (element.position.y * scale);
      const width = element.position.width * scale;
      const height = element.position.height * scale;
      
      // Ensure elements don't exceed content boundaries
      const maxX = contentMargin + contentWidth;
      const maxY = contentMargin + contentHeight;
      
      if (x >= maxX || y >= maxY || x + width <= contentMargin || y + height <= contentMargin) {
        // Element is completely outside content area, skip rendering
        return;
      }
      
      // Clip element dimensions if they extend beyond content area
      const clippedWidth = Math.min(width, maxX - x);
      const clippedHeight = Math.min(height, maxY - y);
      
      switch (element.type) {
        case 'text':
          await renderTextElement(pdf, element, x, y, clippedWidth, clippedHeight, conversionSettings);
          break;
        case 'image':
          if (conversionSettings.includeImages) {
            await renderImageElement(pdf, element, x, y, clippedWidth, clippedHeight);
          }
          break;
        case 'shape':
          await renderShapeElement(pdf, element, x, y, clippedWidth, clippedHeight);
          break;
        case 'table':
          await renderTableElement(pdf, element, x, y, clippedWidth, clippedHeight, conversionSettings);
          break;
       }
     };
     
     const renderTextElement = async (
       pdf: jsPDF,
       element: SlideElement,
       x: number,
       y: number,
       width: number,
       height: number,
       conversionSettings: ConversionSettings
     ) => {
       const content = element.content as { text: string; style?: ElementStyle };
       const style = { ...element.style, ...content.style };
       
       if (!content.text || content.text.trim() === '') return;
       
       // Enhanced font handling with better scaling
       const fontFamily = style.fontFamily || 'Arial';
       const baseFontSize = style.fontSize || 12;
       // Improve font size scaling to better match original appearance
       const fontSizeScale = Math.min(width / 200, height / 50, 1.5); // Dynamic scaling based on element size
       const fontSize = Math.max(8, Math.min(48, baseFontSize * fontSizeScale * conversionSettings.quality));
       const fontWeight = style.fontWeight === 'bold' ? 'bold' : 'normal';
       const fontStyle = style.fontStyle === 'italic' ? 'italic' : 'normal';
       
       // Font mapping for better compatibility
       const fontMap: { [key: string]: string } = {
         'arial': 'helvetica',
         'times': 'times',
         'courier': 'courier',
         'calibri': 'helvetica',
         'georgia': 'times',
         'verdana': 'helvetica',
         'tahoma': 'helvetica'
       };
       
       const mappedFont = fontMap[fontFamily.toLowerCase()] || 'helvetica';
       const fontVariant = `${fontStyle === 'italic' ? 'italic' : ''}${fontWeight === 'bold' ? 'bold' : ''}`;
       
       // Set font with fallback
       try {
         pdf.setFont(mappedFont, fontVariant || 'normal');
       } catch {
         pdf.setFont('helvetica', 'normal');
       }
       
       pdf.setFontSize(fontSize);
       
       // Enhanced color handling
       if (style.color) {
         try {
           const color = style.color.replace('#', '');
           if (color.length === 6) {
             const r = parseInt(color.substr(0, 2), 16);
             const g = parseInt(color.substr(2, 2), 16);
             const b = parseInt(color.substr(4, 2), 16);
             pdf.setTextColor(r, g, b);
           } else {
             pdf.setTextColor(0, 0, 0); // Default to black
           }
         } catch {
           pdf.setTextColor(0, 0, 0);
         }
       } else {
         pdf.setTextColor(0, 0, 0);
       }
       
       // Handle text background
       if (style.backgroundColor) {
         try {
           const bgColor = style.backgroundColor.replace('#', '');
           if (bgColor.length === 6) {
             const r = parseInt(bgColor.substr(0, 2), 16);
             const g = parseInt(bgColor.substr(2, 2), 16);
             const b = parseInt(bgColor.substr(4, 2), 16);
             pdf.setFillColor(r, g, b);
             pdf.rect(x, y, width, height, 'F');
           }
         } catch {
           // Ignore background color errors
         }
       }
       
       // Enhanced text alignment
       const align = style.textAlign === 'center' ? 'center' : 
                    style.textAlign === 'right' ? 'right' : 
                    style.textAlign === 'justify' ? 'justify' : 'left';
       
       // Improved text wrapping with better padding calculation
       const padding = Math.max(3, fontSize * 0.2);
       const availableWidth = Math.max(fontSize, width - (padding * 2));
       
       if (availableWidth <= fontSize) return;
       
       // Split text into lines with enhanced handling
       let lines: string[];
       try {
         lines = pdf.splitTextToSize(content.text, availableWidth);
       } catch {
         // Enhanced fallback: word wrapping with character breaking for long words
         const words = content.text.split(/\s+/);
         lines = [];
         let currentLine = '';
         
         for (const word of words) {
           const testLine = currentLine ? `${currentLine} ${word}` : word;
           const testWidth = pdf.getTextWidth(testLine);
           
           if (testWidth <= availableWidth) {
             currentLine = testLine;
           } else {
             if (currentLine) {
               lines.push(currentLine);
               currentLine = word;
             } else {
               // Word is too long, break it
               let remainingWord = word;
               while (remainingWord.length > 0) {
                 let charCount = 1;
                 while (charCount <= remainingWord.length) {
                   const testSubstring = remainingWord.substring(0, charCount);
                   if (pdf.getTextWidth(testSubstring) > availableWidth) {
                     break;
                   }
                   charCount++;
                 }
                 const lineToAdd = remainingWord.substring(0, Math.max(1, charCount - 1));
                 lines.push(lineToAdd);
                 remainingWord = remainingWord.substring(lineToAdd.length);
               }
               currentLine = '';
             }
           }
         }
         if (currentLine) lines.push(currentLine);
       }
       
       // Calculate optimal line height with better spacing
       const lineHeight = fontSize * 1.4; // Slightly increased for better readability
       const totalTextHeight = lines.length * lineHeight;
       
       // Vertical alignment
       let startY = y + lineHeight;
       if (style.verticalAlign === 'middle') {
         startY = y + (height - totalTextHeight) / 2 + lineHeight;
       } else if (style.verticalAlign === 'bottom') {
         startY = y + height - totalTextHeight + lineHeight;
       }
       
       // Render text lines with improved positioning
       for (let i = 0; i < lines.length; i++) {
         const lineY = startY + (i * lineHeight);
         
         // Check if line fits within element bounds
         if (lineY > y + height - (lineHeight * 0.5)) break;
         
         let lineX = x + padding;
         
         // Handle horizontal alignment
         if (align === 'center') {
           lineX = x + width / 2;
         } else if (align === 'right') {
           lineX = x + width - padding;
         }
         
         try {
           // Add text shadow effect if specified
           if (style.textShadow) {
             pdf.setTextColor(200, 200, 200);
             pdf.text(lines[i], lineX + 1, lineY + 1, { align });
             
             // Restore original color
             if (style.color) {
               const color = style.color.replace('#', '');
               const r = parseInt(color.substr(0, 2), 16);
               const g = parseInt(color.substr(2, 2), 16);
               const b = parseInt(color.substr(4, 2), 16);
               pdf.setTextColor(r, g, b);
             }
           }
           
           pdf.text(lines[i], lineX, lineY, { align });
           
           // Add underline if specified
           if (style.textDecoration === 'underline') {
             const textWidth = pdf.getTextWidth(lines[i]);
             let underlineX = lineX;
             
             if (align === 'center') {
               underlineX = lineX - textWidth / 2;
             } else if (align === 'right') {
               underlineX = lineX - textWidth;
             }
             
             pdf.setLineWidth(0.5);
             pdf.line(underlineX, lineY + 2, underlineX + textWidth, lineY + 2);
           }
           
         } catch (textError) {
           console.warn('Error rendering text line:', textError);
         }
       }
     };
     
     const renderImageElement = async (
       pdf: jsPDF,
       element: SlideElement,
       x: number,
       y: number,
       width: number,
       height: number
     ) => {
       const content = element.content as { src: string; alt?: string; format?: string };
       
       if (!content.src) {
         await renderImagePlaceholder(pdf, x, y, width, height, 'No image source');
         return;
       }
       
       try {
         // Create image with timeout
         const img = await loadImageWithTimeout(content.src, 10000);
         
         if (!img.width || !img.height) {
           throw new Error('Invalid image dimensions');
         }
         
         // Enhanced aspect ratio handling with better fit options
         const imgAspectRatio = img.width / img.height;
         const elementAspectRatio = width / height;
         
         let renderWidth = width;
         let renderHeight = height;
         let renderX = x;
         let renderY = y;
         
         // Preserve image aspect ratio and fit within element bounds
         if (Math.abs(imgAspectRatio - elementAspectRatio) > 0.01) {
           // Aspect ratios differ significantly, need to fit properly
           if (imgAspectRatio > elementAspectRatio) {
             // Image is wider than container - fit to width
             renderHeight = width / imgAspectRatio;
             renderY = y + (height - renderHeight) / 2;
           } else {
             // Image is taller than container - fit to height
             renderWidth = height * imgAspectRatio;
             renderX = x + (width - renderWidth) / 2;
           }
         }
         
         // Ensure rendered dimensions are positive and within bounds
         renderWidth = Math.max(1, Math.min(renderWidth, width));
         renderHeight = Math.max(1, Math.min(renderHeight, height));
         renderX = Math.max(x, Math.min(renderX, x + width - renderWidth));
         renderY = Math.max(y, Math.min(renderY, y + height - renderHeight));
         
         // Determine optimal image format
         let imageFormat = 'JPEG';
         const src = content.src.toLowerCase();
         
         if (src.includes('.png') || src.includes('data:image/png')) {
           imageFormat = 'PNG';
         } else if (src.includes('.webp')) {
           imageFormat = 'WEBP';
         } else if (src.includes('.gif')) {
           imageFormat = 'GIF';
         }
         
         // Add image with error handling and quality preservation
         try {
           pdf.addImage(img, imageFormat, renderX, renderY, renderWidth, renderHeight, undefined, 'FAST');
         } catch (formatError) {
           // Fallback to JPEG if format fails
           console.warn(`Failed to add image as ${imageFormat}, trying JPEG:`, formatError);
           try {
             pdf.addImage(img, 'JPEG', renderX, renderY, renderWidth, renderHeight, undefined, 'FAST');
           } catch (jpegError) {
             console.warn('JPEG fallback also failed:', jpegError);
             await renderImagePlaceholder(pdf, x, y, width, height, 'Image format not supported');
             return;
           }
         }
         
         // Add border if specified in style
         if (element.style?.borderWidth && element.style?.borderColor) {
           const borderColor = element.style.borderColor.replace('#', '');
           if (borderColor.length === 6) {
             const r = parseInt(borderColor.substr(0, 2), 16);
             const g = parseInt(borderColor.substr(2, 2), 16);
             const b = parseInt(borderColor.substr(4, 2), 16);
             
             pdf.setDrawColor(r, g, b);
             pdf.setLineWidth(element.style.borderWidth);
             pdf.rect(renderX, renderY, renderWidth, renderHeight, 'D');
           }
         }
         
       } catch (error) {
         console.warn('Failed to load image:', error);
         await renderImagePlaceholder(pdf, x, y, width, height, content.alt || 'Image failed to load');
       }
     };
     
     // Helper function to load image with timeout
     const loadImageWithTimeout = (src: string, timeout: number = 10000): Promise<HTMLImageElement> => {
       return new Promise((resolve, reject) => {
         const img = new Image();
         img.crossOrigin = 'anonymous';
         
         const timeoutId = setTimeout(() => {
           reject(new Error('Image load timeout'));
         }, timeout);
         
         img.onload = () => {
           clearTimeout(timeoutId);
           resolve(img);
         };
         
         img.onerror = () => {
           clearTimeout(timeoutId);
           reject(new Error('Image load failed'));
         };
         
         img.src = src;
       });
     };
     
     // Helper function to render image placeholder
     const renderImagePlaceholder = async (
       pdf: jsPDF, 
       x: number, 
       y: number, 
       width: number, 
       height: number, 
       message: string
     ) => {
       // Draw placeholder background
       pdf.setFillColor(248, 249, 250);
       pdf.setDrawColor(220, 220, 220);
       pdf.setLineWidth(1);
       pdf.rect(x, y, width, height, 'FD');
       
       // Draw diagonal lines for broken image effect
       pdf.setDrawColor(200, 200, 200);
       pdf.setLineWidth(0.5);
       pdf.line(x, y, x + width, y + height);
       pdf.line(x + width, y, x, y + height);
       
       // Add icon-like rectangle in center
       const iconSize = Math.min(width, height) * 0.3;
       const iconX = x + (width - iconSize) / 2;
       const iconY = y + (height - iconSize) / 2;
       
       pdf.setFillColor(220, 220, 220);
       pdf.rect(iconX, iconY, iconSize, iconSize * 0.7, 'F');
       
       // Add text below icon
       pdf.setTextColor(120, 120, 120);
       pdf.setFontSize(Math.max(8, Math.min(12, width / 15)));
       
       const lines = pdf.splitTextToSize(message, width - 10);
       const lineHeight = pdf.getFontSize() * 1.2;
       const textStartY = iconY + iconSize + lineHeight;
       
       for (let i = 0; i < lines.length && i < 3; i++) {
         const lineY = textStartY + (i * lineHeight);
         if (lineY < y + height - 5) {
           pdf.text(lines[i], x + width / 2, lineY, { align: 'center' });
         }
       }
     };
     
     const renderShapeElement = async (
       pdf: jsPDF,
       element: SlideElement,
       x: number,
       y: number,
       width: number,
       height: number
     ) => {
       const style = element.style || {};
       const content = element.content as { shapeType?: string; cornerRadius?: number };
       const shapeType = content.shapeType || 'rectangle';
       
       // Set fill color with transparency support
       let hasFill = false;
       if (style.backgroundColor) {
         try {
           const color = style.backgroundColor.replace('#', '');
           if (color.length >= 6) {
             const r = parseInt(color.substr(0, 2), 16);
             const g = parseInt(color.substr(2, 2), 16);
             const b = parseInt(color.substr(4, 2), 16);
             pdf.setFillColor(r, g, b);
             hasFill = true;
             
             // Handle opacity if specified
             if (style.opacity && style.opacity < 1) {
               pdf.saveGraphicsState();
               pdf.setGState({ opacity: style.opacity });
             }
           }
         } catch {
           // Ignore color parsing errors
         }
       }
       
       // Set border properties
       let hasBorder = false;
       if (style.borderColor && style.borderWidth) {
         try {
           const color = style.borderColor.replace('#', '');
           if (color.length >= 6) {
             const r = parseInt(color.substr(0, 2), 16);
             const g = parseInt(color.substr(2, 2), 16);
             const b = parseInt(color.substr(4, 2), 16);
             pdf.setDrawColor(r, g, b);
             pdf.setLineWidth(Math.max(0.1, style.borderWidth));
             hasBorder = true;
             
             // Handle border style
             if (style.borderStyle === 'dashed') {
               pdf.setLineDashPattern([3, 3], 0);
             } else if (style.borderStyle === 'dotted') {
               pdf.setLineDashPattern([1, 2], 0);
             }
           }
         } catch {
           // Ignore color parsing errors
         }
       }
       
       // Determine draw style
       const drawStyle = hasFill && hasBorder ? 'FD' : 
                        hasFill ? 'F' : 
                        hasBorder ? 'D' : 'D';
       
       try {
         // Draw different shape types
         switch (shapeType.toLowerCase()) {
           case 'circle':
           case 'ellipse':
             const centerX = x + width / 2;
             const centerY = y + height / 2;
             const radiusX = width / 2;
             const radiusY = height / 2;
             
             if (radiusX === radiusY) {
               // Perfect circle
               pdf.circle(centerX, centerY, radiusX, drawStyle);
             } else {
               // Ellipse - approximate with bezier curves
               pdf.ellipse(centerX, centerY, radiusX, radiusY, drawStyle);
             }
             break;
             
           case 'roundedrectangle':
           case 'rounded-rectangle':
             const cornerRadius = Math.min(
               content.cornerRadius || Math.min(width, height) * 0.1,
               Math.min(width, height) / 2
             );
             pdf.roundedRect(x, y, width, height, cornerRadius, cornerRadius, drawStyle);
             break;
             
           case 'triangle':
             // Draw triangle using lines
             const trianglePoints = [
               [x + width / 2, y], // Top point
               [x, y + height],    // Bottom left
               [x + width, y + height] // Bottom right
             ];
             
             if (hasFill) {
               pdf.triangle(trianglePoints[0][0], trianglePoints[0][1],
                          trianglePoints[1][0], trianglePoints[1][1],
                          trianglePoints[2][0], trianglePoints[2][1], 'F');
             }
             
             if (hasBorder) {
               pdf.triangle(trianglePoints[0][0], trianglePoints[0][1],
                          trianglePoints[1][0], trianglePoints[1][1],
                          trianglePoints[2][0], trianglePoints[2][1], 'D');
             }
             break;
             
           case 'diamond':
             // Draw diamond using lines
             const diamondPoints = [
               [x + width / 2, y],         // Top
               [x + width, y + height / 2], // Right
               [x + width / 2, y + height], // Bottom
               [x, y + height / 2]         // Left
             ];
             
             pdf.lines([
               [diamondPoints[1][0] - diamondPoints[0][0], diamondPoints[1][1] - diamondPoints[0][1]],
               [diamondPoints[2][0] - diamondPoints[1][0], diamondPoints[2][1] - diamondPoints[1][1]],
               [diamondPoints[3][0] - diamondPoints[2][0], diamondPoints[3][1] - diamondPoints[2][1]],
               [diamondPoints[0][0] - diamondPoints[3][0], diamondPoints[0][1] - diamondPoints[3][1]]
             ], diamondPoints[0][0], diamondPoints[0][1], [1, 1], drawStyle, true);
             break;
             
           case 'arrow':
             // Simple right-pointing arrow
             const arrowBodyHeight = height * 0.6;
             const arrowBodyY = y + (height - arrowBodyHeight) / 2;
             const arrowHeadWidth = width * 0.3;
             
             // Arrow body (rectangle)
             pdf.rect(x, arrowBodyY, width - arrowHeadWidth, arrowBodyHeight, drawStyle);
             
             // Arrow head (triangle)
             const arrowHeadPoints = [
               [x + width - arrowHeadWidth, y],
               [x + width, y + height / 2],
               [x + width - arrowHeadWidth, y + height]
             ];
             
             if (hasFill) {
               pdf.triangle(arrowHeadPoints[0][0], arrowHeadPoints[0][1],
                          arrowHeadPoints[1][0], arrowHeadPoints[1][1],
                          arrowHeadPoints[2][0], arrowHeadPoints[2][1], 'F');
             }
             
             if (hasBorder) {
               pdf.triangle(arrowHeadPoints[0][0], arrowHeadPoints[0][1],
                          arrowHeadPoints[1][0], arrowHeadPoints[1][1],
                          arrowHeadPoints[2][0], arrowHeadPoints[2][1], 'D');
             }
             break;
             
           case 'line':
             // Simple line from top-left to bottom-right
             pdf.line(x, y, x + width, y + height);
             break;
             
           case 'rectangle':
           default:
             // Default rectangle
             pdf.rect(x, y, width, height, drawStyle);
             break;
         }
         
         // Add shadow effect if specified
         if (style.boxShadow) {
           pdf.saveGraphicsState();
           pdf.setGState({ opacity: 0.3 });
           pdf.setFillColor(100, 100, 100);
           
           const shadowOffset = Math.min(width, height) * 0.02;
           pdf.rect(x + shadowOffset, y + shadowOffset, width, height, 'F');
           
           pdf.restoreGraphicsState();
         }
         
       } catch (shapeError) {
         console.warn('Error rendering shape:', shapeError);
         // Fallback to simple rectangle
         pdf.rect(x, y, width, height, drawStyle);
       } finally {
         // Reset line dash pattern
         pdf.setLineDashPattern([], 0);
         
         // Restore graphics state if opacity was used
         if (style.opacity && style.opacity < 1) {
           pdf.restoreGraphicsState();
         }
       }
     };
     
     const renderTableElement = async (
       pdf: jsPDF,
       element: SlideElement,
       x: number,
       y: number,
       width: number,
       height: number,
       conversionSettings: ConversionSettings
     ) => {
       const content = element.content as { rows: Array<{ cells: Array<{ text: string; style?: ElementStyle }> }> };
       
       if (!content.rows || content.rows.length === 0) return;
       
       const rowHeight = height / content.rows.length;
       const colWidth = width / (content.rows[0]?.cells.length || 1);
       
       // Draw table borders
       pdf.setDrawColor(0, 0, 0);
       pdf.setLineWidth(0.5);
       
       for (let rowIndex = 0; rowIndex < content.rows.length; rowIndex++) {
         const row = content.rows[rowIndex];
         const rowY = y + rowIndex * rowHeight;
         
         for (let colIndex = 0; colIndex < row.cells.length; colIndex++) {
           const cell = row.cells[colIndex];
           const cellX = x + colIndex * colWidth;
           
           // Draw cell border
           pdf.rect(cellX, rowY, colWidth, rowHeight, 'D');
           
           // Render cell text
           if (cell.text.trim()) {
             const cellStyle = cell.style || {};
             const fontSize = Math.max(8, (cellStyle.fontSize || 10) * conversionSettings.quality);
             
             pdf.setFontSize(fontSize);
             
             if (cellStyle.color) {
               const color = cellStyle.color.replace('#', '');
               const r = parseInt(color.substr(0, 2), 16);
               const g = parseInt(color.substr(2, 2), 16);
               const b = parseInt(color.substr(4, 2), 16);
               pdf.setTextColor(r, g, b);
             } else {
               pdf.setTextColor(0, 0, 0);
             }
             
             const lines = pdf.splitTextToSize(cell.text, colWidth - 10);
             const lineHeight = fontSize * 1.2;
             
             for (let i = 0; i < lines.length && i < Math.floor(rowHeight / lineHeight); i++) {
               pdf.text(lines[i], cellX + 5, rowY + (i + 1) * lineHeight);
             }
           }
         }
       }
     };
 
     // UI Event Handlers
     const handleSettingsChange = (key: keyof ConversionSettings, value: any) => {
       setConversionSettings(prev => ({ ...prev, [key]: value }));
     };
     
     const handleSlideNavigation = (direction: 'prev' | 'next') => {
       if (!presentationData) return;
       
       if (direction === 'prev' && currentSlideIndex > 0) {
         setCurrentSlideIndex(currentSlideIndex - 1);
       } else if (direction === 'next' && currentSlideIndex < presentationData.slides.length - 1) {
         setCurrentSlideIndex(currentSlideIndex + 1);
       }
     };
     
     const handleDragOver = useCallback((e: React.DragEvent) => {
       e.preventDefault();
       setIsDragOver(true);
     }, []);
     
     const handleDragLeave = useCallback((e: React.DragEvent) => {
       e.preventDefault();
       setIsDragOver(false);
     }, []);
     
     const handleDrop = useCallback((e: React.DragEvent) => {
       e.preventDefault();
       setIsDragOver(false);
       const files = Array.from(e.dataTransfer.files);
       handleFilesSelected(files);
     }, [handleFilesSelected]);
     
     const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
       const files = e.target.files ? Array.from(e.target.files) : [];
       handleFilesSelected(files);
     }, [handleFilesSelected]);
     
     const currentSlide = presentationData?.slides[currentSlideIndex];
     
     return (
       <div className="max-w-6xl mx-auto p-6 space-y-6">
         <div className="text-center">
           <h1 className="text-3xl font-bold text-gray-900 mb-2">PowerPoint to PDF Converter</h1>
           <p className="text-gray-600">Convert PowerPoint presentations to high-quality PDF documents with professional formatting</p>
         </div>
         
         {/* File Upload Section */}
         <Card>
           <CardHeader>
             <CardTitle>Upload PowerPoint Files</CardTitle>
           </CardHeader>
           <CardContent>
             <div
               className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                 isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
               }`}
               onDragOver={handleDragOver}
               onDragLeave={handleDragLeave}
               onDrop={handleDrop}
             >
               <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
               <p className="text-lg font-medium text-gray-900 mb-2">
                 Drag and drop PowerPoint files here
               </p>
               <p className="text-gray-500 mb-4">or</p>
               <input
                 type="file"
                 ref={fileInputRef}
                 onChange={handleFileSelect}
                 accept=".pptx,.ppt"
                 multiple
                 className="hidden"
               />
               <Button
                 onClick={() => fileInputRef.current?.click()}
                 variant="outline"
                 className="mb-4"
               >
                 <FileText className="mr-2 h-4 w-4" />
                 Choose Files
               </Button>
               <p className="text-sm text-gray-500">
                 Supports .pptx and .ppt files (up to 50MB each)
               </p>
             </div>
           </CardContent>
         </Card>
         
         {/* Conversion Settings */}
         {presentationData && (
           <Card>
             <CardHeader>
               <CardTitle>Conversion Settings</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                 <div className="space-y-2">
                   <Label htmlFor="quality">Quality</Label>
                   <Select
                     value={conversionSettings.quality.toString()}
                     onValueChange={(value) => handleSettingsChange('quality', parseFloat(value))}
                   >
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="0.5">Low (0.5x)</SelectItem>
                       <SelectItem value="1">Standard (1x)</SelectItem>
                       <SelectItem value="1.5">High (1.5x)</SelectItem>
                       <SelectItem value="2">Ultra (2x)</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 
                 <div className="space-y-2">
                   <Label htmlFor="format">Page Format</Label>
                   <Select
                     value={conversionSettings.format}
                     onValueChange={(value) => handleSettingsChange('format', value)}
                   >
                     <SelectTrigger>
                       <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                       <SelectItem value="auto">Auto</SelectItem>
                       <SelectItem value="a4">A4</SelectItem>
                       <SelectItem value="letter">Letter</SelectItem>
                       <SelectItem value="custom">Custom</SelectItem>
                     </SelectContent>
                   </Select>
                 </div>
                 
                 <div className="flex items-center space-x-2">
                   <Checkbox
                     id="includeImages"
                     checked={conversionSettings.includeImages}
                     onCheckedChange={(checked) => handleSettingsChange('includeImages', checked)}
                   />
                   <Label htmlFor="includeImages">Include Images</Label>
                 </div>
                 
                 <div className="flex items-center space-x-2">
                   <Checkbox
                     id="preserveAnimations"
                     checked={conversionSettings.preserveAnimations}
                     onCheckedChange={(checked) => handleSettingsChange('preserveAnimations', checked)}
                   />
                   <Label htmlFor="preserveAnimations">Preserve Animations</Label>
                 </div>
               </div>
             </CardContent>
           </Card>
         )}
         
         {/* Preview Section */}
         {presentationData && (
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center justify-between">
                 <span>Preview</span>
                 <div className="flex items-center space-x-2">
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => handleSlideNavigation('prev')}
                     disabled={currentSlideIndex === 0}
                   >
                     <ChevronLeft className="h-4 w-4" />
                   </Button>
                   <span className="text-sm text-gray-500">
                     {currentSlideIndex + 1} / {presentationData.slides.length}
                   </span>
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => handleSlideNavigation('next')}
                     disabled={currentSlideIndex === presentationData.slides.length - 1}
                   >
                     <ChevronRight className="h-4 w-4" />
                   </Button>
                 </div>
               </CardTitle>
             </CardHeader>
             <CardContent>
               <Tabs value={previewMode} onValueChange={(value) => setPreviewMode(value as 'slide' | 'outline')}>
                 <TabsList>
                   <TabsTrigger value="slide">Slide View</TabsTrigger>
                   <TabsTrigger value="outline">Outline View</TabsTrigger>
                 </TabsList>
                 
                 <TabsContent value="slide" className="mt-4">
                   {currentSlide && (
                     <div className="border rounded-lg overflow-hidden">
                       <SlidePreview slide={currentSlide} />
                     </div>
                   )}
                 </TabsContent>
                 
                 <TabsContent value="outline" className="mt-4">
                   <div className="space-y-2 max-h-96 overflow-y-auto">
                     {presentationData.slides.map((slide, index) => (
                       <div
                         key={slide.id}
                         className={`p-3 border rounded cursor-pointer transition-colors ${
                           index === currentSlideIndex ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                         }`}
                         onClick={() => setCurrentSlideIndex(index)}
                       >
                         <div className="font-medium">{slide.title}</div>
                         <div className="text-sm text-gray-500">
                           {slide.elements.length} elements
                         </div>
                       </div>
                     ))}
                   </div>
                 </TabsContent>
               </Tabs>
             </CardContent>
           </Card>
         )}
         
         {/* Conversion Controls */}
         {presentationData && (
           <Card>
             <CardContent className="pt-6">
               <div className="flex items-center justify-between">
                 <div>
                   <h3 className="font-medium">Ready to Convert</h3>
                   <p className="text-sm text-gray-500">
                     {presentationData.slides.length} slides • {presentationData.metadata.title}
                   </p>
                 </div>
                 
                 <Button
                   onClick={convertPowerPointToPDF}
                   disabled={isConverting}
                   size="lg"
                   className="min-w-32"
                 >
                   {isConverting ? (
                     <>
                       <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                       Converting...
                     </>
                   ) : (
                     <>
                       <Download className="mr-2 h-4 w-4" />
                       Convert to PDF
                     </>
                   )}
                 </Button>
               </div>
               
               {isConverting && (
                 <div className="mt-4">
                   <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                     <span>Converting slides...</span>
                     <span>{Math.round(conversionProgress)}%</span>
                   </div>
                   <div className="w-full bg-gray-200 rounded-full h-2">
                     <div
                       className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                       style={{ width: `${conversionProgress}%` }}
                     />
                   </div>
                 </div>
               )}
             </CardContent>
           </Card>
         )}
         
         {/* Converted Files */}
         {convertedFiles.length > 0 && (
           <Card>
             <CardHeader>
               <CardTitle>Converted Files</CardTitle>
             </CardHeader>
             <CardContent>
               <div className="space-y-2">
                 {convertedFiles.map((file, index) => (
                   <div key={index} className="flex items-center justify-between p-3 border rounded">
                     <div className="flex items-center space-x-3">
                       <FileText className="h-5 w-5 text-red-500" />
                       <div>
                         <div className="font-medium">{file.name}</div>
                         <div className="text-sm text-gray-500">
                           {(file.size / 1024 / 1024).toFixed(2)} MB
                         </div>
                       </div>
                     </div>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => {
                         const link = document.createElement('a');
                         link.href = file.url;
                         link.download = file.name;
                         link.click();
                       }}
                     >
                       <Download className="mr-2 h-4 w-4" />
                       Download
                     </Button>
                   </div>
                 ))}
               </div>
             </CardContent>
           </Card>
         )}
       </div>
     );
   };
   
   export default PowerPointToPDF;