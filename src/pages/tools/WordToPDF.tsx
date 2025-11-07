import { useState } from "react";
import PDFToolLayout from "@/components/PDFToolLayout";
import FileUploadZone from "@/components/FileUploadZone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Download, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import mammoth from 'mammoth';
import * as fontkit from 'fontkit';

interface ConvertedFile {
  name: string;
  url: string;
  blob: Blob;
}

interface TextStyle {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  color: { r: number; g: number; b: number };
  fontSize: number;
  fontFamily: string;
  strikethrough?: boolean;
  highlight?: { r: number; g: number; b: number };
  subscript?: boolean;
  superscript?: boolean;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
}

interface TableStyle {
  borderColor: { r: number; g: number; b: number };
  borderWidth: number;
  cellPadding: number;
  headerBackground: { r: number; g: number; b: number };
}

interface PageStyle {
  margin: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  header?: {
    enabled: boolean;
    text?: string;
    fontSize: number;
  };
  footer?: {
    enabled: boolean;
    text?: string;
    fontSize: number;
    pageNumber?: boolean;
  };
}

const WordToPDF = () => {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [convertedFiles, setConvertedFiles] = useState<ConvertedFile[]>([]);
  const { toast } = useToast();

  const handleFilesSelected = (files: File[]) => {
    const wordFiles = files.filter(file => 
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.type === "application/msword" ||
      file.name.endsWith('.docx') ||
      file.name.endsWith('.doc')
    );
    if (wordFiles.length !== files.length) {
      toast({
        title: "Invalid files",
        description: "Please select only Word document files (.doc, .docx).",
        variant: "destructive",
      });
    }
    setSelectedFiles(wordFiles);
    setConvertedFiles([]);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  // Enhanced color parsing function
  const parseColor = (colorStr: string): { r: number; g: number; b: number } => {
    if (!colorStr) return { r: 0, g: 0, b: 0 };
    
    // Handle hex colors
    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      if (hex.length === 3) {
        return {
          r: parseInt(hex[0] + hex[0], 16) / 255,
          g: parseInt(hex[1] + hex[1], 16) / 255,
          b: parseInt(hex[2] + hex[2], 16) / 255
        };
      } else if (hex.length === 6) {
        return {
          r: parseInt(hex.slice(0, 2), 16) / 255,
          g: parseInt(hex.slice(2, 4), 16) / 255,
          b: parseInt(hex.slice(4, 6), 16) / 255
        };
      }
    }
    
    // Handle rgb colors
    if (colorStr.startsWith('rgb')) {
      const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (match) {
        return {
          r: parseInt(match[1]) / 255,
          g: parseInt(match[2]) / 255,
          b: parseInt(match[3]) / 255
        };
      }
    }
    
    // Handle named colors
    const namedColors: { [key: string]: { r: number; g: number; b: number } } = {
      'black': { r: 0, g: 0, b: 0 },
      'white': { r: 1, g: 1, b: 1 },
      'red': { r: 1, g: 0, b: 0 },
      'green': { r: 0, g: 0.5, b: 0 },
      'blue': { r: 0, g: 0, b: 1 },
      'yellow': { r: 1, g: 1, b: 0 },
      'cyan': { r: 0, g: 1, b: 1 },
      'magenta': { r: 1, g: 0, b: 1 },
      'gray': { r: 0.5, g: 0.5, b: 0.5 },
      'grey': { r: 0.5, g: 0.5, b: 0.5 },
      'darkblue': { r: 0, g: 0, b: 0.5 },
      'darkgreen': { r: 0, g: 0.5, b: 0 },
      'darkred': { r: 0.5, g: 0, b: 0 },
      'lightgray': { r: 0.8, g: 0.8, b: 0.8 },
      'lightgrey': { r: 0.8, g: 0.8, b: 0.8 },
      'orange': { r: 1, g: 0.5, b: 0 },
      'purple': { r: 0.5, g: 0, b: 0.5 },
      'pink': { r: 1, g: 0.75, b: 0.8 }
    };
    
    return namedColors[colorStr.toLowerCase()] || { r: 0, g: 0, b: 0 };
  };

  // Extract text style from HTML element
  const getTextStyle = (element: HTMLElement): TextStyle => {
    const computedStyle = window.getComputedStyle ? window.getComputedStyle(element) : null;
    const style = element.style;
    
    return {
      bold: element.tagName === 'B' || element.tagName === 'STRONG' || 
            (computedStyle?.fontWeight && parseInt(computedStyle.fontWeight) >= 700) ||
            style.fontWeight === 'bold' || style.fontWeight === 'bolder',
      italic: element.tagName === 'I' || element.tagName === 'EM' || 
             (computedStyle?.fontStyle === 'italic') || style.fontStyle === 'italic',
      underline: element.tagName === 'U' || 
                (computedStyle?.textDecoration?.includes('underline')) || 
                style.textDecoration?.includes('underline'),
      strikethrough: computedStyle?.textDecoration?.includes('line-through') || 
                    style.textDecoration?.includes('line-through'),
      color: parseColor(computedStyle?.color || style.color || 'black'),
      fontSize: parseInt(computedStyle?.fontSize || style.fontSize || '12') || 12,
      fontFamily: computedStyle?.fontFamily || style.fontFamily || 'Arial',
      highlight: element.style.backgroundColor ? parseColor(element.style.backgroundColor) : undefined,
      subscript: element.tagName === 'SUB' || computedStyle?.verticalAlign === 'sub',
      superscript: element.tagName === 'SUP' || computedStyle?.verticalAlign === 'super',
      lineHeight: computedStyle?.lineHeight ? parseFloat(computedStyle.lineHeight) : undefined,
      letterSpacing: computedStyle?.letterSpacing ? parseFloat(computedStyle.letterSpacing) : undefined,
      textAlign: (computedStyle?.textAlign || style.textAlign) as TextStyle['textAlign']
    };
  };

  const convertWordToPdf = async (file: File): Promise<ConvertedFile> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      // Enhanced mammoth options for better formatting preservation
      const result = await mammoth.convertToHtml(
        { arrayBuffer },
        {
          convertImage: mammoth.images.dataUri,
          styleMap: [
            "p[style-name='Title'] => h1:fresh",
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh",
            "p[style-name='Heading 3'] => h3:fresh",
            "p[style-name='Heading 4'] => h4:fresh",
            "p[style-name='Heading 5'] => h5:fresh",
            "p[style-name='Heading 6'] => h6:fresh",
            "r[style-name='Strong'] => strong",
            "r[style-name='Emphasis'] => em",
            "r[style-name='Strike'] => s",
            "r[style-name='Subscript'] => sub",
            "r[style-name='Superscript'] => sup",
            "p[style-name='Quote'] => blockquote:fresh",
            "p[style-name='Intense Quote'] => blockquote.intense:fresh",
            "p[style-name='List Paragraph'] => p.list:fresh",
            "p[style-name='TOC 1'] => p.toc1:fresh",
            "p[style-name='TOC 2'] => p.toc2:fresh",
            "p[style-name='TOC 3'] => p.toc3:fresh",
            "p[style-name='TOC 4'] => p.toc4:fresh",
            "p[style-name='TOC 5'] => p.toc5:fresh",
            "p[style-name='TOC 6'] => p.toc6:fresh",
            "p[style-name='TOC 7'] => p.toc7:fresh",
            "p[style-name='TOC 8'] => p.toc8:fresh",
            "p[style-name='TOC 9'] => p.toc9:fresh"
          ],
          includeDefaultStyleMap: true,
          includeEmbeddedStyleMap: true,
          transformDocument: (element) => {
            // Handle hyperlinks
            if (element.type === 'hyperlink') {
              return {
                type: 'hyperlink',
                href: element.href,
                children: element.children
              };
            }
            return element;
          }
        }
      );
      
      const html = result.value;

      // Create PDF document
      const pdfDoc = await PDFDocument.create();
      
      // Register fontkit with PDFDocument
      pdfDoc.registerFontkit(fontkit);

      // Load custom fonts that support Unicode
      const regularFontBytes = await fetch('/fonts/NotoSans-Regular.ttf').then(res => res.arrayBuffer());
      const boldFontBytes = await fetch('/fonts/NotoSans-Bold.ttf').then(res => res.arrayBuffer());
      const italicFontBytes = await fetch('/fonts/NotoSans-Italic.ttf').then(res => res.arrayBuffer());
      const boldItalicFontBytes = await fetch('/fonts/NotoSans-BoldItalic.ttf').then(res => res.arrayBuffer());

      const fonts = {
        regular: await pdfDoc.embedFont(regularFontBytes),
        bold: await pdfDoc.embedFont(boldFontBytes),
        italic: await pdfDoc.embedFont(italicFontBytes),
        boldItalic: await pdfDoc.embedFont(boldItalicFontBytes)
      };

      // Default page style
      const pageStyle: PageStyle = {
        margin: {
          top: 72,    // 1 inch
          bottom: 72, // 1 inch
          left: 72,   // 1 inch
          right: 72   // 1 inch
        },
        header: {
          enabled: true,
          fontSize: 10
        },
        footer: {
          enabled: true,
          fontSize: 10,
          pageNumber: true
        }
      };

      // Default table style
      const tableStyle: TableStyle = {
        borderColor: { r: 0, g: 0, b: 0 },
        borderWidth: 1,
        cellPadding: 5,
        headerBackground: { r: 0.9, g: 0.9, b: 0.9 }
      };

      let page = pdfDoc.addPage([595, 842]); // A4 size
      let pageNumber = 1;
      
      // Enhanced page settings
      const pageWidth = 595;
      const pageHeight = 842;
      const margin = pageStyle.margin;
      const maxWidth = pageWidth - margin.left - margin.right;
      let yPosition = pageHeight - margin.top;

      // Parse HTML content
      const parser = new DOMParser();
      const htmlDoc = parser.parseFromString(html, 'text/html');

      // Enhanced heading configurations
      const headingConfigs: { [key: string]: { fontSize: number; lineHeight: number; spaceBefore: number; spaceAfter: number } } = {
        'H1': { fontSize: 24, lineHeight: 30, spaceBefore: 18, spaceAfter: 12 },
        'H2': { fontSize: 20, lineHeight: 26, spaceBefore: 16, spaceAfter: 10 },
        'H3': { fontSize: 18, lineHeight: 24, spaceBefore: 14, spaceAfter: 8 },
        'H4': { fontSize: 16, lineHeight: 22, spaceBefore: 12, spaceAfter: 6 },
        'H5': { fontSize: 14, lineHeight: 20, spaceBefore: 10, spaceAfter: 4 },
        'H6': { fontSize: 13, lineHeight: 18, spaceBefore: 8, spaceAfter: 4 },
      };

      // Get appropriate font based on style
      const getFont = (style: TextStyle) => {
        if (style.bold && style.italic) return fonts.boldItalic;
        if (style.bold) return fonts.bold;
        if (style.italic) return fonts.italic;
        return fonts.regular;
      };

      const ensureSpace = (requiredHeight: number) => {
        if (yPosition - requiredHeight < margin.bottom) {
          // Add footer to current page
          if (pageStyle.footer?.enabled) {
            const footerText = pageStyle.footer.text || '';
            const footerY = margin.bottom - 10;
            
            if (footerText) {
              page.drawText(footerText, {
                x: margin.left,
                y: footerY,
                size: pageStyle.footer.fontSize,
                font: fonts.regular,
                color: rgb(0, 0, 0)
              });
            }
            
            if (pageStyle.footer.pageNumber) {
              const pageText = `Page ${pageNumber}`;
              const pageTextWidth = fonts.regular.widthOfTextAtSize(pageText, pageStyle.footer.fontSize);
              page.drawText(pageText, {
                x: pageWidth - margin.right - pageTextWidth,
                y: footerY,
                size: pageStyle.footer.fontSize,
                font: fonts.regular,
                color: rgb(0, 0, 0)
              });
            }
          }

          // Create new page
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          yPosition = pageHeight - margin.top;

          // Add header to new page
          if (pageStyle.header?.enabled) {
            const headerText = pageStyle.header.text || '';
            if (headerText) {
              page.drawText(headerText, {
                x: margin.left,
                y: pageHeight - margin.top + 10,
                size: pageStyle.header.fontSize,
                font: fonts.regular,
                color: rgb(0, 0, 0)
              });
            }
          }
        }
      };

      // Enhanced text drawing with proper wrapping and styling
      const drawStyledText = (text: string, style: TextStyle, x: number, indent = 0) => {
        const font = getFont(style);
        const fontSize = style.fontSize;
        const words = text.trim().split(/\s+/);
        let currentLine = '';
        const lineHeight = (style.lineHeight || 1.4) * fontSize;

        // Calculate text alignment
        const getXPosition = (lineWidth: number) => {
          if (!style.textAlign || style.textAlign === 'left') return x + indent;
          if (style.textAlign === 'center') return x + (maxWidth - lineWidth) / 2;
          if (style.textAlign === 'right') return x + maxWidth - lineWidth;
          return x + indent; // Default to left alignment
        };

        for (const word of words) {
          const testLine = currentLine + (currentLine ? ' ' : '') + word;
          const lineWidth = font.widthOfTextAtSize(testLine, fontSize);

          if (lineWidth <= maxWidth - indent) {
            currentLine = testLine;
          } else {
            if (currentLine) {
              ensureSpace(lineHeight);
              
              const xPos = getXPosition(font.widthOfTextAtSize(currentLine, fontSize));
              
              // Draw highlight if needed
              if (style.highlight) {
                const highlightWidth = font.widthOfTextAtSize(currentLine, fontSize);
                page.drawRectangle({
                  x: xPos,
                  y: yPosition - 2,
                  width: highlightWidth,
                  height: fontSize + 4,
                  color: rgb(style.highlight.r, style.highlight.g, style.highlight.b),
                });
              }
              
              // Draw text
              page.drawText(currentLine, {
                x: xPos,
                y: yPosition,
                size: fontSize,
                font: font,
                color: rgb(style.color.r, style.color.g, style.color.b),
              });

              // Draw underline if needed
              if (style.underline) {
                const textWidth = font.widthOfTextAtSize(currentLine, fontSize);
                page.drawLine({
                  start: { x: xPos, y: yPosition - 2 },
                  end: { x: xPos + textWidth, y: yPosition - 2 },
                  thickness: 1,
                  color: rgb(style.color.r, style.color.g, style.color.b),
                });
              }

              // Draw strikethrough if needed
              if (style.strikethrough) {
                const textWidth = font.widthOfTextAtSize(currentLine, fontSize);
                page.drawLine({
                  start: { x: xPos, y: yPosition + fontSize / 2 },
                  end: { x: xPos + textWidth, y: yPosition + fontSize / 2 },
                  thickness: 1,
                  color: rgb(style.color.r, style.color.g, style.color.b),
                });
              }

              yPosition -= lineHeight;
            }
            currentLine = word;
          }
        }

        if (currentLine) {
          ensureSpace(lineHeight);
          
          const xPos = getXPosition(font.widthOfTextAtSize(currentLine, fontSize));
          
          // Draw highlight if needed
          if (style.highlight) {
            const highlightWidth = font.widthOfTextAtSize(currentLine, fontSize);
            page.drawRectangle({
              x: xPos,
              y: yPosition - 2,
              width: highlightWidth,
              height: fontSize + 4,
              color: rgb(style.highlight.r, style.highlight.g, style.highlight.b),
            });
          }
          
          // Draw text
          page.drawText(currentLine, {
            x: xPos,
            y: yPosition,
            size: fontSize,
            font: font,
            color: rgb(style.color.r, style.color.g, style.color.b),
          });

          // Draw underline if needed
          if (style.underline) {
            const textWidth = font.widthOfTextAtSize(currentLine, fontSize);
            page.drawLine({
              start: { x: xPos, y: yPosition - 2 },
              end: { x: xPos + textWidth, y: yPosition - 2 },
              thickness: 1,
              color: rgb(style.color.r, style.color.g, style.color.b),
            });
          }

          // Draw strikethrough if needed
          if (style.strikethrough) {
            const textWidth = font.widthOfTextAtSize(currentLine, fontSize);
            page.drawLine({
              start: { x: xPos, y: yPosition + fontSize / 2 },
              end: { x: xPos + textWidth, y: yPosition + fontSize / 2 },
              thickness: 1,
              color: rgb(style.color.r, style.color.g, style.color.b),
            });
          }

          yPosition -= lineHeight;
        }
      };

      // Draw table with borders and styling
      const drawTable = async (table: HTMLTableElement, style: TextStyle) => {
        const rows = Array.from(table.rows);
        if (rows.length === 0) return;

        // Calculate column widths
        const colWidths: number[] = [];
        const maxColWidth = (maxWidth - tableStyle.cellPadding * 2) / rows[0].cells.length;

        for (let i = 0; i < rows[0].cells.length; i++) {
          let maxWidth = 0;
          for (const row of rows) {
            const cell = row.cells[i];
            const cellText = cell.textContent || '';
            const cellWidth = fonts.regular.widthOfTextAtSize(cellText, style.fontSize);
            maxWidth = Math.max(maxWidth, cellWidth);
          }
          colWidths.push(Math.min(maxWidth + tableStyle.cellPadding * 2, maxColWidth));
        }

        // Calculate total table height
        let totalHeight = 0;
        for (const row of rows) {
          const rowHeight = Math.max(...Array.from(row.cells).map(cell => {
            const cellText = cell.textContent || '';
            const lines = Math.ceil(fonts.regular.widthOfTextAtSize(cellText, style.fontSize) / colWidths[0]);
            return lines * style.fontSize * 1.4;
          }));
          totalHeight += rowHeight + tableStyle.cellPadding * 2;
        }

        ensureSpace(totalHeight);

        // Draw table
        let currentY = yPosition;
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const isHeader = row.cells[0].tagName === 'TH';
          const rowHeight = Math.max(...Array.from(row.cells).map(cell => {
            const cellText = cell.textContent || '';
            const lines = Math.ceil(fonts.regular.widthOfTextAtSize(cellText, style.fontSize) / colWidths[0]);
            return lines * style.fontSize * 1.4;
          })) + tableStyle.cellPadding * 2;

          let currentX = margin.left;
          for (let j = 0; j < row.cells.length; j++) {
            const cell = row.cells[j];
            const cellText = cell.textContent || '';
            const cellWidth = colWidths[j];

            // Draw cell background for header
            if (isHeader) {
              page.drawRectangle({
                x: currentX,
                y: currentY - rowHeight,
                width: cellWidth,
                height: rowHeight,
                color: rgb(tableStyle.headerBackground.r, tableStyle.headerBackground.g, tableStyle.headerBackground.b),
              });
            }

            // Draw cell borders
            page.drawRectangle({
              x: currentX,
              y: currentY - rowHeight,
              width: cellWidth,
              height: rowHeight,
              borderColor: rgb(tableStyle.borderColor.r, tableStyle.borderColor.g, tableStyle.borderColor.b),
              borderWidth: tableStyle.borderWidth,
            });

            // Draw cell text
            const cellStyle: TextStyle = {
              ...style,
              bold: isHeader || style.bold,
              textAlign: cell.style.textAlign as TextStyle['textAlign'] || 'left'
            };

            const lines = cellText.split('\n');
            let lineY = currentY - tableStyle.cellPadding;
            for (const line of lines) {
              if (line.trim()) {
                drawStyledText(line, cellStyle, currentX + tableStyle.cellPadding, 0);
                lineY -= style.fontSize * 1.4;
              }
            }

            currentX += cellWidth;
          }

          currentY -= rowHeight;
        }

        yPosition = currentY - tableStyle.cellPadding;
      };

      // Enhanced node processing with better formatting
      const processNode = async (node: ChildNode, indent = 0, inheritedStyle: TextStyle | null = null, listLevel = 0) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent) {
          const textContent = node.textContent.trim();
          if (textContent) {
            const style = inheritedStyle || {
              bold: false,
              italic: false,
              underline: false,
              color: { r: 0, g: 0, b: 0 },
              fontSize: 12,
              fontFamily: 'Arial'
            };
            drawStyledText(textContent, style, margin.left, indent);
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as HTMLElement;
          const tagName = element.tagName;
          const currentStyle = getTextStyle(element);

          // Merge with inherited style
          const effectiveStyle: TextStyle = inheritedStyle ? {
            bold: currentStyle.bold || inheritedStyle.bold,
            italic: currentStyle.italic || inheritedStyle.italic,
            underline: currentStyle.underline || inheritedStyle.underline,
            strikethrough: currentStyle.strikethrough || inheritedStyle.strikethrough,
            color: currentStyle.color.r !== 0 || currentStyle.color.g !== 0 || currentStyle.color.b !== 0 
                   ? currentStyle.color : inheritedStyle.color,
            fontSize: currentStyle.fontSize !== 12 ? currentStyle.fontSize : inheritedStyle.fontSize,
            fontFamily: currentStyle.fontFamily !== 'Arial' ? currentStyle.fontFamily : inheritedStyle.fontFamily,
            highlight: currentStyle.highlight || inheritedStyle.highlight,
            subscript: currentStyle.subscript || inheritedStyle.subscript,
            superscript: currentStyle.superscript || inheritedStyle.superscript,
            lineHeight: currentStyle.lineHeight || inheritedStyle.lineHeight,
            letterSpacing: currentStyle.letterSpacing || inheritedStyle.letterSpacing,
            textAlign: currentStyle.textAlign || inheritedStyle.textAlign
          } : currentStyle;

          if (tagName.match(/^H[1-6]$/)) {
            const config = headingConfigs[tagName];
            const headingText = element.textContent?.trim() || '';
            
            if (headingText) {
              // Space before heading
              yPosition -= config.spaceBefore;
              ensureSpace(config.lineHeight + config.spaceAfter);
              
              const headingStyle: TextStyle = {
                ...effectiveStyle,
                fontSize: config.fontSize,
                bold: true
              };
              
              drawStyledText(headingText, headingStyle, margin.left, indent);
              yPosition -= config.spaceAfter;
            }
          } else if (tagName === 'P') {
            // Add paragraph spacing
            if (yPosition < pageHeight - margin.top - 20) {
              yPosition -= 6; // Space before paragraph
            }
            
            for (const child of Array.from(element.childNodes)) {
              await processNode(child, indent, effectiveStyle);
            }
            
            yPosition -= 6; // Space after paragraph
          } else if (tagName === 'UL' || tagName === 'OL') {
            yPosition -= 4; // Space before list
            let listItemNumber = 1;
            
            for (const child of Array.from(element.childNodes)) {
              if (child.nodeType === Node.ELEMENT_NODE && (child as HTMLElement).tagName === 'LI') {
                ensureSpace(20);
                
                // Determine bullet based on list level
                let bullet = '';
                const bulletIndent = indent + (listLevel * 15); // Increase indent for nested lists
                if (tagName === 'UL') {
                  const bullets = ['•', '○', '▪']; // Different bullets for nested levels
                  bullet = bullets[listLevel % bullets.length];
                } else {
                  bullet = `${listItemNumber}.`;
                }

                const bulletStyle: TextStyle = {
                  ...effectiveStyle,
                  fontSize: effectiveStyle.fontSize || 12
                };
                
                page.drawText(bullet, {
                  x: margin.left + bulletIndent,
                  y: yPosition,
                  size: bulletStyle.fontSize,
                  font: getFont(bulletStyle),
                  color: rgb(bulletStyle.color.r, bulletStyle.color.g, bulletStyle.color.b),
                });
                
                // Process list item content
                for (const liChild of Array.from(child.childNodes)) {
                  await processNode(liChild, bulletIndent + 20, effectiveStyle, listLevel + 1);
                }
                
                if (tagName === 'OL') listItemNumber++;
                yPosition -= 4; // Space between list items
              }
            }
            yPosition -= 4; // Space after list
          } else if (tagName === 'IMG') {
            const imgElement = element as HTMLImageElement;
            if (imgElement.src) {
              try {
                const imgResponse = await fetch(imgElement.src);
                const imgArrayBuffer = await imgResponse.arrayBuffer();
                let embeddedImage;
                
                if (imgElement.src.startsWith('data:image/png')) {
                  embeddedImage = await pdfDoc.embedPng(imgArrayBuffer);
                } else if (imgElement.src.startsWith('data:image/jpeg') || imgElement.src.startsWith('data:image/jpg')) {
                  embeddedImage = await pdfDoc.embedJpg(imgArrayBuffer);
                }
                
                if (embeddedImage) {
                  const imgWidth = embeddedImage.width;
                  const imgHeight = embeddedImage.height;
                  const maxImgWidth = maxWidth - indent;
                  const maxImgHeight = yPosition - margin.bottom - 20;
                  
                  const scale = Math.min(maxImgWidth / imgWidth, maxImgHeight / imgHeight, 1);
                  const drawnWidth = imgWidth * scale;
                  const drawnHeight = imgHeight * scale;
                  
                  ensureSpace(drawnHeight + 20);
                  yPosition -= drawnHeight;
                  
                  page.drawImage(embeddedImage, {
                    x: margin.left + indent + (maxImgWidth - drawnWidth) / 2,
                    y: yPosition,
                    width: drawnWidth,
                    height: drawnHeight,
                  });
                  
                  yPosition -= 10; // Space after image
                }
              } catch (imgError) {
                console.error('Error embedding image:', imgError);
              }
            }
          } else if (tagName === 'BR') {
            yPosition -= 14; // Line break
          } else if (tagName === 'TABLE') {
            await drawTable(element as HTMLTableElement, effectiveStyle);
          } else if (tagName === 'A') {
            // Handle hyperlinks
            const href = element.getAttribute('href');
            if (href) {
              const linkStyle: TextStyle = {
                ...effectiveStyle,
                color: { r: 0, g: 0, b: 1 }, // Blue color for links
                underline: true
              };
              
              for (const child of Array.from(element.childNodes)) {
                await processNode(child, indent, linkStyle);
              }
            } else {
              for (const child of Array.from(element.childNodes)) {
                await processNode(child, indent, effectiveStyle);
              }
            }
          } else if (tagName === 'BLOCKQUOTE') {
            yPosition -= 10; // Space before blockquote
            const blockquoteStyle: TextStyle = {
              ...effectiveStyle,
              fontSize: effectiveStyle.fontSize - 1,
              color: { r: 0.4, g: 0.4, b: 0.4 } // Gray color for blockquotes
            };
            
            for (const child of Array.from(element.childNodes)) {
              await processNode(child, indent + 20, blockquoteStyle);
            }
            
            yPosition -= 10; // Space after blockquote
          } else {
            // Process other elements with inherited styling
            for (const child of Array.from(element.childNodes)) {
              await processNode(child, indent, effectiveStyle);
            }
          }
        }
      };

      // Process the document
      for (const node of Array.from(htmlDoc.body.childNodes)) {
        await processNode(node);
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);

      return {
        name: file.name.replace(/\.(docx?|doc)$/i, '.pdf'),
        url,
        blob
      };
    } catch (error) {
      console.error('Conversion error:', error);
      throw new Error(`Failed to convert Word document to PDF: ${error.message}`);
    }
  };

  const handleConvert = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select Word files to convert.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      const processedFiles: ConvertedFile[] = [];
      
      for (const file of selectedFiles) {
        const convertedFile = await convertWordToPdf(file);
        processedFiles.push(convertedFile);
      }
      
      setConvertedFiles(processedFiles);
      toast({
        title: "Success!",
        description: `Your Word document${selectedFiles.length > 1 ? 's have' : ' has'} been converted to PDF successfully with enhanced formatting.`, 
      });
    } catch (error) {
      console.error('Conversion error:', error);
      toast({
        title: "Conversion failed",
        description: "There was an error converting your files. Please try again.",
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
      title="Word to PDF"
      description="Convert Word documents to PDF files with enhanced formatting"
    >
      <div className="space-y-8">
        <FileUploadZone
          accept=".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple={true}
          onFilesSelected={handleFilesSelected}
          selectedFiles={selectedFiles}
          onRemoveFile={handleRemoveFile}
        />

        {selectedFiles.length > 0 && (
          <Card className="p-6 bg-white/5 backdrop-blur-lg border border-white/10">
            <div className="space-y-6">
              <Label className="text-lg font-semibold text-white">Enhanced Conversion Features</Label>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                <div className="p-4 bg-white/5 rounded-lg">
                  <FileText className="w-8 h-8 mx-auto mb-2 text-orange-400" />
                  <div className="text-white font-medium">Output Format</div>
                  <div className="text-orange-400">PDF Document</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-white font-medium">Files Selected</div>
                  <div className="text-orange-400">{selectedFiles.length}</div>
                </div>
                <div className="p-4 bg-white/5 rounded-lg">
                  <div className="text-white font-medium">Formatting</div>
                  <div className="text-orange-400">Full Support</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Bold Text
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Italic Text
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Underlined Text
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Text Colors
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Headings
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Lists
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Images
                </div>
                <div className="flex items-center text-green-400">
                  <span className="w-2 h-2 bg-green-400 rounded-full mr-2"></span>
                  Tables
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
              className="bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white border-0 px-8 py-4"
            >
              {isProcessing ? (
                "Converting with Enhanced Formatting..."
              ) : (
                <>
                  <Download className="w-5 h-5 mr-2" />
                  Convert to PDF
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
                {convertedFiles.length > 1 && (
                  <Button
                    onClick={downloadAll}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download All
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                {convertedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <FileText className="w-5 h-5 text-orange-400" />
                      <span className="text-white">{file.name}</span>
                    </div>
                    <Button
                      onClick={() => downloadFile(file)}
                      variant="ghost"
                      className="text-orange-400 hover:text-orange-300"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
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

export default WordToPDF;
