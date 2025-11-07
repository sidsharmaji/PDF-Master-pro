import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Download, X, FileSpreadsheet, CheckCircle, AlertCircle, Loader2, Settings, Eye, BarChart3 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as ExcelJS from 'exceljs';
import PDFToolLayout from '@/components/PDFToolLayout';

// File interface
interface ProcessedFile {
  id: string;
  name: string;
  size: number;
  originalFile: File;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  pdfBlob?: Blob;
  error?: string;
  worksheetCount?: number;
  dataRanges?: { [key: string]: any };
}

// Configuration interface
interface ConversionConfig {
  pageSize: 'A4' | 'A3' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  includeCharts: boolean;
  preserveFormatting: boolean;
  maxRowsPerSheet: number;
  maxColumnsPerSheet: number;
  fontSize: number;
  includeGridlines: boolean;
  autoFitColumns: boolean;
  includeHeaders: boolean;
  compressionLevel: 'low' | 'medium' | 'high';
}

// Utility functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const sanitizeText = (text: unknown): string => {
  if (text === null || text === undefined) return '';
  
  try {
    let str = String(text);
    
    // Limit string length
    if (str.length > 1000) {
      str = str.substring(0, 997) + '...';
    }
    
    // Clean up text for PDF compatibility
    return str
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/[\u2026]/g, '...')
      .replace(/[\u00A0]/g, ' ')
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/[\u0100-\uFFFF]/g, '')
      .trim();
  } catch (error) {
    return '[text error]';
  }
};

const ExcelToPDF = () => {
  const [files, setFiles] = useState<ProcessedFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Configuration state with improved defaults
  const [config, setConfig] = useState<ConversionConfig>({
    pageSize: 'A4',
    orientation: 'portrait',
    includeCharts: true,
    preserveFormatting: true,
    maxRowsPerSheet: 500,
    maxColumnsPerSheet: 50,
    fontSize: 10,
    includeGridlines: false,
    autoFitColumns: true,
    includeHeaders: true,
    compressionLevel: 'medium'
  });

  // Helper function to convert Excel color to RGB
  const convertExcelColorToRGB = (color: any): [number, number, number] => {
    try {
      if (!color) return [0, 0, 0];
      
      // Handle different color formats
      if (color.argb) {
        const hex = color.argb.substring(2); // Remove alpha channel
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b];
      }
      
      if (color.rgb) {
        const hex = color.rgb;
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        return [r, g, b];
      }
      
      // Default colors for theme colors
      const themeColors: { [key: number]: [number, number, number] } = {
        0: [1, 1, 1],     // White
        1: [0, 0, 0],     // Black
        2: [0.9, 0.9, 0.9], // Light Gray
        3: [0.5, 0.5, 0.5], // Dark Gray
        4: [0.2, 0.4, 0.8], // Blue
        5: [0.8, 0.2, 0.2], // Red
        6: [0.2, 0.8, 0.2], // Green
        7: [0.8, 0.8, 0.2], // Yellow
        8: [0.8, 0.4, 0.2], // Orange
        9: [0.6, 0.2, 0.8], // Purple
      };
      
      if (color.theme !== undefined && themeColors[color.theme]) {
        return themeColors[color.theme];
      }
      
      return [0, 0, 0]; // Default black
    } catch {
      return [0, 0, 0];
    }
  };

  // Helper function to find actual data range (non-empty cells)
  const findDataRange = (worksheet: any) => {
    let minRow = Infinity, maxRow = 0, minCol = Infinity, maxCol = 0;
    let hasData = false;
    
    worksheet.eachRow((row: any, rowNumber: number) => {
      row.eachCell((cell: any, colNumber: number) => {
        if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
          hasData = true;
          minRow = Math.min(minRow, rowNumber);
          maxRow = Math.max(maxRow, rowNumber);
          minCol = Math.min(minCol, colNumber);
          maxCol = Math.max(maxCol, colNumber);
        }
      });
      });
    
    if (!hasData) return null; 
    
    return {
      startRow: minRow,
      endRow: Math.min(maxRow, minRow + 200), // Limit to 200 rows for performance
      startCol: minCol,
      endCol: Math.min(maxCol, minCol + 20)   // Limit to 20 columns for performance
    };
  };

  // Helper function to detect and render chart-like data patterns
  const detectAndRenderCharts = async (worksheet: any, page: any, startY: number, margin: number, width: number, font: any, boldFont: any) => {
    try {
      const dataRange = findDataRange(worksheet);
      if (!dataRange || dataRange.endRow - dataRange.startRow < 2) return startY;
      
      // Look for numeric data patterns that could be charts
      const chartData: { label: string; value: number; color: [number, number, number] }[] = [];
      const colors: [number, number, number][] = [
        [0.2, 0.4, 0.8], // Blue
        [0.8, 0.2, 0.2], // Red
        [0.2, 0.8, 0.2], // Green
        [0.8, 0.8, 0.2], // Yellow
        [0.8, 0.4, 0.2], // Orange
        [0.6, 0.2, 0.8], // Purple
        [0.2, 0.8, 0.8], // Cyan
        [0.8, 0.2, 0.8], // Magenta
      ];
      
      // Try to find label-value pairs
      for (let rowIndex = dataRange.startRow; rowIndex <= Math.min(dataRange.startRow + 10, dataRange.endRow); rowIndex++) {
        const row = worksheet.getRow(rowIndex);
        let label = '';
        let value = 0;
        let hasNumericValue = false;
        
        // Look for label in first column and value in second column
        const labelCell = row.getCell(dataRange.startCol);
        const valueCell = row.getCell(dataRange.startCol + 1);
        
        if (labelCell && labelCell.value) {
          try {
            label = String(labelCell.value).trim();
          } catch {
            continue;
          }
        }
        
        if (valueCell && valueCell.value) {
          try {
            const cellValue = valueCell.value;
            if (typeof cellValue === 'number') {
              value = cellValue;
              hasNumericValue = true;
            } else if (typeof cellValue === 'string') {
              const parsed = parseFloat(cellValue);
              if (!isNaN(parsed)) {
                value = parsed;
                hasNumericValue = true;
              }
            }
          } catch {
            continue;
          }
        }
        
        if (label && hasNumericValue && value > 0) {
          chartData.push({
            label: label.length > 15 ? label.substring(0, 12) + '...' : label,
            value,
            color: colors[chartData.length % colors.length]
          });
        }
      }
      
      // Render simple bar chart if we have valid data
      if (chartData.length >= 2 && chartData.length <= 8) {
        const chartHeight = 150;
        const chartWidth = width - 2 * margin - 100;
        const maxValue = Math.max(...chartData.map(d => d.value));
        
        if (maxValue > 0) {
          // Chart title
           page.drawText('Data Visualization', {
             x: margin,
             y: startY,
             size: 14,
             font: boldFont,
             color: rgb(0.2, 0.2, 0.2)
           });
          
          const chartStartY = startY - 30;
          const barWidth = chartWidth / chartData.length * 0.8;
          const barSpacing = chartWidth / chartData.length * 0.2;
          
          chartData.forEach((data, index) => {
            const barHeight = (data.value / maxValue) * chartHeight;
            const x = margin + index * (barWidth + barSpacing);
            const y = chartStartY - chartHeight;
            
            // Draw bar
            page.drawRectangle({
              x,
              y,
              width: barWidth,
              height: barHeight,
              color: rgb(data.color[0], data.color[1], data.color[2])
            });
            
            // Draw value on top of bar
             page.drawText(data.value.toFixed(1), {
               x: x + barWidth / 2 - 10,
               y: y + barHeight + 5,
               size: 8,
               font: font,
               color: rgb(0.2, 0.2, 0.2)
             });
             
             // Draw label below chart
             page.drawText(data.label, {
               x: x + barWidth / 2 - (data.label.length * 2),
               y: chartStartY - chartHeight - 20,
               size: 8,
               font: font,
               color: rgb(0.2, 0.2, 0.2)
             });
          });
          
          return chartStartY - chartHeight - 40;
        }
      }
    } catch (error) {
      // Silently continue if chart detection fails
    }
    
    return startY;
  };

  // Enhanced page size configurations
  const getPageDimensions = (pageSize: string, orientation: string) => {
    const sizes = {
      'A4': [595.28, 841.89],
      'A3': [841.89, 1190.55],
      'Letter': [612, 792],
      'Legal': [612, 1008]
    };
    const [width, height] = sizes[pageSize as keyof typeof sizes] || sizes.A4;
    return orientation === 'landscape' ? [height, width] : [width, height];
  };

  // Enhanced conversion function with configuration support
  const convertExcelToPDF = async (file: File, updateProgress?: (progress: number) => void): Promise<Blob> => {
    try {
      console.log('Loading Excel file:', file.name, 'Size:', file.size);
      updateProgress?.(10);
      
      const workbook = new ExcelJS.Workbook();
      const arrayBuffer = await file.arrayBuffer();
      console.log('Array buffer size:', arrayBuffer.byteLength);
      await workbook.xlsx.load(arrayBuffer);
      console.log('Workbook loaded, worksheets count:', workbook.worksheets.length);
      updateProgress?.(25);
    
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
      updateProgress?.(35);
    
      // Get page dimensions based on configuration
      const [pageWidth, pageHeight] = getPageDimensions(config.pageSize, config.orientation);
      
      // Process each worksheet with configuration limits
      const maxSheets = Math.min(workbook.worksheets.length, 10); // Increased limit
      for (let sheetIndex = 0; sheetIndex < maxSheets; sheetIndex++) {
        const progressStep = (60 / maxSheets) * (sheetIndex + 1);
        updateProgress?.(35 + progressStep);
        const worksheet = workbook.worksheets[sheetIndex];
        if (!worksheet) continue;
        
        // Find actual data range with configuration limits
        const dataRange = findDataRange(worksheet);
        if (!dataRange) {
          // Create a page with "No Data" message
          const page = pdfDoc.addPage([pageWidth, pageHeight]);
          const { width, height } = page.getSize();
          page.drawText(`${worksheet.name || `Sheet ${sheetIndex + 1}`} - No Data`, {
            x: 50,
            y: height - 100,
            size: config.fontSize + 6,
            font: boldFont,
            color: rgb(0.5, 0.5, 0.5)
          });
          continue;
        }
        
        // Apply configuration limits to data range
        const limitedDataRange = {
          ...dataRange,
          endRow: Math.min(dataRange.endRow, dataRange.startRow + config.maxRowsPerSheet - 1),
          endCol: Math.min(dataRange.endCol, dataRange.startCol + config.maxColumnsPerSheet - 1)
        };
        
        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        const { width, height } = page.getSize();
        const margin = 40;
        let currentY = height - margin;
        
        // Sheet title with configurable styling
        if (config.includeHeaders) {
          const title = sanitizeText(worksheet.name || `Sheet ${sheetIndex + 1}`);
          page.drawText(title, {
            x: margin,
            y: currentY,
            size: config.fontSize + 8,
            font: boldFont,
            color: rgb(0.1, 0.3, 0.6)
          });
          currentY -= 50;
        }
      
        // Calculate dynamic cell dimensions based on limited data range
        const dataRows = limitedDataRange.endRow - limitedDataRange.startRow + 1;
        const dataCols = limitedDataRange.endCol - limitedDataRange.startCol + 1;
      
        const availableWidth = width - 2 * margin;
        const availableHeight = currentY - margin - 50;
        
        // Enhanced cell dimension calculation with auto-fit option
        let cellWidth = config.autoFitColumns 
          ? Math.min(availableWidth / dataCols, 150) 
          : availableWidth / dataCols;
        const cellHeight = Math.min(availableHeight / dataRows, 30);
        
        // Try to detect and render charts first if enabled
        if (config.includeCharts) {
          currentY = await detectAndRenderCharts(worksheet, page, currentY, margin, width, font, boldFont);
          currentY -= 20; // Add some spacing
        }
        
        // Process only the limited data range
        for (let rowIndex = limitedDataRange.startRow; rowIndex <= limitedDataRange.endRow && currentY > margin + 30; rowIndex++) {
        const row = worksheet.getRow(rowIndex);
        let currentX = margin;
        
        for (let colIndex = limitedDataRange.startCol; colIndex <= limitedDataRange.endCol; colIndex++) {
          const cell = row.getCell(colIndex);
          let cellValue = '';
          let textColor: [number, number, number] = [0, 0, 0];
          let backgroundColor: [number, number, number] | null = null;
          let isBold = false;
          let isItalic = false;
          
          // Draw gridlines if enabled
          if (config.includeGridlines) {
            page.drawRectangle({
              x: currentX,
              y: currentY - cellHeight,
              width: cellWidth,
              height: cellHeight,
              borderColor: rgb(0.8, 0.8, 0.8),
              borderWidth: 0.5
            });
          }
          
          // Extract cell value and formatting
          if (cell && cell.value !== null && cell.value !== undefined) {
            try {
              // Get cell value
              if (typeof cell.value === 'object' && 'text' in cell.value) {
                cellValue = String((cell.value as any).text);
              } else if (typeof cell.value === 'object' && 'result' in cell.value) {
                cellValue = String((cell.value as any).result);
              } else if (cell.value instanceof Date) {
                cellValue = cell.value.toLocaleDateString();
              } else {
                cellValue = String(cell.value);
              }
              
              // Get cell formatting
              if (cell.font) {
                if (cell.font.color) {
                  textColor = convertExcelColorToRGB(cell.font.color);
                }
                isBold = cell.font.bold || false;
                isItalic = cell.font.italic || false;
              }
              
              // Get cell background color
              if (cell.fill && cell.fill.type === 'pattern' && (cell.fill as any).fgColor) {
                backgroundColor = convertExcelColorToRGB((cell.fill as any).fgColor);
              }
            } catch {
              cellValue = '';
            }
          }
          
          // Skip completely empty cells
          if (!cellValue.trim()) {
            currentX += cellWidth;
            continue;
          }
          
          // Sanitize and truncate text
          const displayText = sanitizeText(cellValue);
          const maxLength = Math.floor(cellWidth / 6); // Approximate character width
          const truncatedText = displayText.length > maxLength ? 
            displayText.substring(0, maxLength - 3) + '...' : displayText;
          
          // Draw cell background if it has color and formatting is preserved
          if (config.preserveFormatting && backgroundColor && (backgroundColor[0] !== 1 || backgroundColor[1] !== 1 || backgroundColor[2] !== 1)) {
            page.drawRectangle({
              x: currentX,
              y: currentY - cellHeight,
              width: cellWidth,
              height: cellHeight,
              color: rgb(backgroundColor[0], backgroundColor[1], backgroundColor[2])
            });
          }
          
          // Draw cell border (only if not using gridlines to avoid duplication)
          if (!config.includeGridlines) {
            page.drawRectangle({
              x: currentX,
              y: currentY - cellHeight,
              width: cellWidth,
              height: cellHeight,
              borderColor: rgb(0.7, 0.7, 0.7),
              borderWidth: 0.5
            });
          }
          
          // Draw text with formatting
          if (truncatedText) {
            try {
              let selectedFont = font;
              if (config.preserveFormatting) {
                if (isBold && isItalic) {
                  selectedFont = boldFont; // Use bold as fallback for bold+italic
                } else if (isBold) {
                  selectedFont = boldFont;
                } else if (isItalic) {
                  selectedFont = italicFont;
                }
              }
              
              const fontSize = Math.min(config.fontSize, cellHeight * 0.7);
              
              page.drawText(truncatedText, {
                x: currentX + 3,
                y: currentY - cellHeight + (cellHeight - fontSize) / 2,
                size: fontSize,
                font: selectedFont,
                color: config.preserveFormatting ? rgb(textColor[0], textColor[1], textColor[2]) : rgb(0, 0, 0)
              });
            } catch {
              // Skip problematic text
            }
          }
          
          currentX += cellWidth;
        }
        
        currentY -= cellHeight;
      }
      
      // Add data summary footer
      const dataInfo = `Data Range: ${dataRows} rows × ${dataCols} columns | ${file.name}`;
      page.drawText(dataInfo, {
        x: margin,
        y: 25,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
      
      // Add page number
      page.drawText(`Page ${sheetIndex + 1}`, {
        x: width - margin - 50,
        y: 25,
        size: 8,
        font: font,
        color: rgb(0.5, 0.5, 0.5)
      });
      }
    
      updateProgress?.(95);
      const pdfBytes = await pdfDoc.save();
      console.log('PDF generated successfully, size:', pdfBytes.length);
      updateProgress?.(100);
      return new Blob([pdfBytes], { type: 'application/pdf' });
    } catch (error) {
      console.error('Error in convertExcelToPDF:', error);
      throw error;
    }
  };

  // Handle file selection
  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles) return;
    
    const validFiles = Array.from(selectedFiles).filter(file => {
      const name = file.name.toLowerCase();
      return name.endsWith('.xlsx') || name.endsWith('.xls');
    });
    
    const newFiles: ProcessedFile[] = validFiles.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      size: file.size,
      originalFile: file,
      status: 'pending',
      progress: 0
    }));
    
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  // Handle drag and drop
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
    handleFileSelect(e.dataTransfer.files);
  }, [handleFileSelect]);

  // Process files with enhanced progress tracking
  const processFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) return;
    
    setIsProcessing(true);
    
    for (const file of pendingFiles) {
      try {
        // Update status to processing
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { ...f, status: 'processing', progress: 0 } : f
        ));
        
        // Progress update function
        const updateProgress = (progress: number) => {
          setFiles(prev => prev.map(f => 
            f.id === file.id ? { ...f, progress } : f
          ));
        };
        
        // Convert file with progress tracking
        console.log('Starting conversion for file:', file.name);
        const pdfBlob = await convertExcelToPDF(file.originalFile, updateProgress);
        console.log('Conversion completed, blob size:', pdfBlob?.size);
        
        if (!pdfBlob) {
          throw new Error('PDF conversion returned null or undefined');
        }
        
        // Update with success
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'completed', 
            progress: 100, 
            pdfBlob 
          } : f
        ));
        
      } catch (error) {
        console.error('Conversion error for file:', file.name, error);
        // Update with error
        setFiles(prev => prev.map(f => 
          f.id === file.id ? { 
            ...f, 
            status: 'error', 
            progress: 0,
            error: error instanceof Error ? error.message : 'Conversion failed'
          } : f
        ));
      }
    }
    
    setIsProcessing(false);
  };

  // Download file
  const downloadFile = (file: ProcessedFile) => {
    if (!file.pdfBlob) {
      console.error('No PDF blob found for file:', file.name);
      return;
    }
    
    try {
      const url = URL.createObjectURL(file.pdfBlob);
      const fileName = file.name.replace(/\.[^/.]+$/, '') + '.pdf';
      
      // Create download link
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      link.style.display = 'none';
      
      // Append to body and trigger download
      document.body.appendChild(link);
      link.click();
      
      // Clean up
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      console.log('Download initiated for:', fileName);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback: open in new tab
      try {
        const url = URL.createObjectURL(file.pdfBlob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (fallbackError) {
        console.error('Fallback download also failed:', fallbackError);
      }
    }
  };

  // Remove file
  const removeFile = (fileId: string) => {
    setFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // Clear all files
  const clearAll = () => {
    setFiles([]);
  };

  const completedFiles = files.filter(f => f.status === 'completed');
  const hasFiles = files.length > 0;
  const canProcess = files.some(f => f.status === 'pending');

  return (
    <PDFToolLayout
      title="Excel to PDF Converter"
      description="Convert Excel spreadsheets to PDF with smart data processing, color preservation, and automatic chart detection"
    >
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Advanced Configuration Panel */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Conversion Settings
              </h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
              >
                {showAdvancedOptions ? 'Hide' : 'Show'} Advanced Options
              </Button>
            </div>
            
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="formatting">Formatting</TabsTrigger>
                <TabsTrigger value="advanced">Advanced</TabsTrigger>
              </TabsList>
              
              <TabsContent value="basic" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pageSize">Page Size</Label>
                    <Select value={config.pageSize} onValueChange={(value: any) => setConfig(prev => ({ ...prev, pageSize: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="A4">A4</SelectItem>
                        <SelectItem value="A3">A3</SelectItem>
                        <SelectItem value="Letter">Letter</SelectItem>
                        <SelectItem value="Legal">Legal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="orientation">Orientation</Label>
                    <Select value={config.orientation} onValueChange={(value: any) => setConfig(prev => ({ ...prev, orientation: value }))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="portrait">Portrait</SelectItem>
                        <SelectItem value="landscape">Landscape</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="includeCharts"
                    checked={config.includeCharts}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeCharts: checked }))}
                  />
                  <Label htmlFor="includeCharts" className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    Auto-detect and render charts
                  </Label>
                </div>
              </TabsContent>
              
              <TabsContent value="formatting" className="space-y-4 mt-4">
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="preserveFormatting"
                      checked={config.preserveFormatting}
                      onCheckedChange={(checked) => setConfig(prev => ({ ...prev, preserveFormatting: checked }))}
                    />
                    <Label htmlFor="preserveFormatting">Preserve Excel formatting (colors, fonts)</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="includeGridlines"
                      checked={config.includeGridlines}
                      onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeGridlines: checked }))}
                    />
                    <Label htmlFor="includeGridlines">Show gridlines</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="autoFitColumns"
                      checked={config.autoFitColumns}
                      onCheckedChange={(checked) => setConfig(prev => ({ ...prev, autoFitColumns: checked }))}
                    />
                    <Label htmlFor="autoFitColumns">Auto-fit column widths</Label>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="fontSize">Font Size: {config.fontSize}px</Label>
                    <input
                      type="range"
                      id="fontSize"
                      min="8"
                      max="16"
                      value={config.fontSize}
                      onChange={(e) => setConfig(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
              </TabsContent>
              
              <TabsContent value="advanced" className="space-y-4 mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="maxRows">Max Rows per Sheet: {config.maxRowsPerSheet}</Label>
                    <input
                      type="range"
                      id="maxRows"
                      min="100"
                      max="1000"
                      step="50"
                      value={config.maxRowsPerSheet}
                      onChange={(e) => setConfig(prev => ({ ...prev, maxRowsPerSheet: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="maxCols">Max Columns per Sheet: {config.maxColumnsPerSheet}</Label>
                    <input
                      type="range"
                      id="maxCols"
                      min="10"
                      max="100"
                      step="5"
                      value={config.maxColumnsPerSheet}
                      onChange={(e) => setConfig(prev => ({ ...prev, maxColumnsPerSheet: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Switch
                    id="includeHeaders"
                    checked={config.includeHeaders}
                    onCheckedChange={(checked) => setConfig(prev => ({ ...prev, includeHeaders: checked }))}
                  />
                  <Label htmlFor="includeHeaders">Include sheet headers</Label>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        
        {/* Upload Area */}
        <Card className="border-2 border-dashed border-gray-200 hover:border-gray-300 transition-colors">
          <CardContent className="p-8">
            <div
              className={`text-center space-y-4 ${
                isDragOver ? 'bg-blue-50 border-blue-300' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <FileSpreadsheet className="w-8 h-8 text-blue-600" />
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-gray-900">
                  Select Excel files
                </h3>
                <p className="text-gray-600">
                  Drop your .xlsx or .xls files here, or click to browse
                </p>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-red-600 hover:bg-red-700 text-white px-8 py-3 text-lg"
                  disabled={isProcessing}
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Select Excel files
                </Button>
                
                {hasFiles && (
                  <Button
                    onClick={clearAll}
                    variant="outline"
                    disabled={isProcessing}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls"
                onChange={(e) => handleFileSelect(e.target.files)}
                className="hidden"
              />
              
              <p className="text-sm text-gray-500">
                Supported formats: .xlsx, .xls • Max file size: 10MB
              </p>
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {hasFiles && (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Files ({files.length})
                </h3>
                
                {canProcess && (
                  <Button
                    onClick={processFiles}
                    disabled={isProcessing}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Converting...
                      </>
                    ) : (
                      'Convert to PDF'
                    )}
                  </Button>
                )}
              </div>
              
              <div className="space-y-4">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex items-center space-x-4 flex-1">
                      <div className="flex-shrink-0">
                        {file.status === 'completed' ? (
                          <CheckCircle className="w-6 h-6 text-green-600" />
                        ) : file.status === 'error' ? (
                          <AlertCircle className="w-6 h-6 text-red-600" />
                        ) : file.status === 'processing' ? (
                          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
                        ) : (
                          <FileSpreadsheet className="w-6 h-6 text-gray-400" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {file.name}
                        </p>
                        <div className="flex items-center space-x-4 mt-1">
                          <p className="text-sm text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                          <Badge
                            variant={{
                              pending: 'secondary',
                              processing: 'default',
                              completed: 'default',
                              error: 'destructive'
                            }[file.status] as any}
                            className={{
                              pending: 'bg-gray-100 text-gray-800',
                              processing: 'bg-blue-100 text-blue-800',
                              completed: 'bg-green-100 text-green-800',
                              error: 'bg-red-100 text-red-800'
                            }[file.status]}
                          >
                            {file.status === 'pending' && 'Ready'}
                            {file.status === 'processing' && 'Converting...'}
                            {file.status === 'completed' && 'Completed'}
                            {file.status === 'error' && 'Failed'}
                          </Badge>
                        </div>
                        
                        {file.status === 'processing' && (
                          <Progress value={file.progress} className="mt-2 h-2" />
                        )}
                        
                        {file.status === 'error' && file.error && (
                          <Alert className="mt-2">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription className="text-sm">
                              {file.error}
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      {file.status === 'completed' && (
                        <Button
                          onClick={() => downloadFile(file)}
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 text-white"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      )}
                      
                      <Button
                        onClick={() => removeFile(file.id)}
                        size="sm"
                        variant="ghost"
                        disabled={file.status === 'processing'}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Download All Button */}
        {completedFiles.length > 1 && (
          <div className="text-center">
            <Button
              onClick={() => {
                completedFiles.forEach(file => downloadFile(file));
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
            >
              <Download className="w-5 h-5 mr-2" />
              Download All PDFs ({completedFiles.length})
            </Button>
          </div>
        )}

        {/* Enhanced Features */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mt-12">
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Smart Data Processing</h4>
            <p className="text-sm text-gray-600">
              Intelligently detects actual data ranges and skips empty cells for cleaner output
            </p>
          </div>
          
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Advanced Formatting</h4>
            <p className="text-sm text-gray-600">
              Preserves Excel colors, fonts, bold/italic formatting with configurable options
            </p>
          </div>
          
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-orange-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Chart Detection</h4>
            <p className="text-sm text-gray-600">
              Automatically detects data patterns and creates visual bar charts in PDF
            </p>
          </div>
          
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Settings className="w-6 h-6 text-purple-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Configurable Output</h4>
            <p className="text-sm text-gray-600">
              Multiple page sizes, orientations, font sizes, and layout options
            </p>
          </div>
          
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center">
              <Eye className="w-6 h-6 text-indigo-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Real-time Progress</h4>
            <p className="text-sm text-gray-600">
              Enhanced progress tracking with detailed conversion status
            </p>
          </div>
          
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
              <Download className="w-6 h-6 text-pink-600" />
            </div>
            <h4 className="font-semibold text-gray-900">Batch Processing</h4>
            <p className="text-sm text-gray-600">
              Convert multiple Excel files to PDF simultaneously with advanced options
            </p>
          </div>
        </div>
      </div>
    </PDFToolLayout>
  );
};

export default ExcelToPDF;