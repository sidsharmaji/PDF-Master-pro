
import { useState } from "react";
import { Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface FileUploadZoneProps {
  accept?: string;
  multiple?: boolean;
  onFilesSelected: (files: File[]) => void;
  selectedFiles: File[];
  onRemoveFile: (index: number) => void;
}

const FileUploadZone = ({ 
  accept = ".pdf", 
  multiple = false, 
  onFilesSelected, 
  selectedFiles, 
  onRemoveFile 
}: FileUploadZoneProps) => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    onFilesSelected(files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      onFilesSelected(files);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        className={`p-12 border-2 border-dashed transition-all duration-300 cursor-pointer bg-white/5 backdrop-blur-lg ${
          isDragOver
            ? "border-purple-400 bg-purple-400/10"
            : "border-white/20 hover:border-purple-400/50"
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
      >
        <div className="text-center">
          <Upload className="w-16 h-16 mx-auto mb-6 text-purple-400" />
          <h3 className="text-xl font-semibold text-white mb-2">
            {multiple ? "Drop your files here" : "Drop your file here"}
          </h3>
          <p className="text-gray-400 mb-6">
            Or click to browse {multiple ? "files" : "file"}
          </p>
          <input
            type="file"
            accept={accept}
            multiple={multiple}
            onChange={handleFileSelect}
            className="hidden"
            id="file-upload"
          />
          <Button
            asChild
            className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0"
          >
            <label htmlFor="file-upload" className="cursor-pointer">
              Choose {multiple ? "Files" : "File"}
            </label>
          </Button>
        </div>
      </Card>

      {selectedFiles.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-lg font-semibold text-white">Selected Files:</h4>
          {selectedFiles.map((file, index) => (
            <Card key={index} className="p-4 bg-white/5 backdrop-blur-lg border border-white/10">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <FileText className="w-6 h-6 text-purple-400" />
                  <div>
                    <p className="text-white font-medium">{file.name}</p>
                    <p className="text-gray-400 text-sm">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveFile(index)}
                  className="text-gray-400 hover:text-red-400"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploadZone;
