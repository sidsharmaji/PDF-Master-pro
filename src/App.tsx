
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Toaster } from "@/components/ui/toaster";
import Index from './pages/Index';
import MergePDF from './pages/tools/MergePDF';
import SplitPDF from './pages/tools/SplitPDF';
import CompressPDF from './pages/tools/CompressPDF';
import WordToPDF from './pages/tools/WordToPDF';
import ExcelToPDF from './pages/tools/ExcelToPDF';
import PowerPointToPDF from './pages/tools/PowerPointToPDF';
import PDFToImage from './pages/tools/PDFToImage';
import JPGToPDF from './pages/tools/JPGToPDF';
import PDFToJPG from './pages/tools/PDFToJPG';
// import PDFToExcel from './pages/tools/PDFToExcel'; // File not found
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen">
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/merge" element={<MergePDF />} />
          <Route path="/split" element={<SplitPDF />} />
          <Route path="/compress" element={<CompressPDF />} />
          <Route path="/convert" element={<WordToPDF />} />
          <Route path="/excel-to-pdf" element={<ExcelToPDF />} />
          <Route path="/powerpoint-to-pdf" element={<PowerPointToPDF />} />
          <Route path="/pdf-to-image" element={<PDFToImage />} />
          <Route path="/jpg-to-pdf" element={<JPGToPDF />} />
          <Route path="/pdf-to-jpg" element={<PDFToJPG />} />
          {/* <Route path="/pdf-to-excel" element={<PDFToExcel />} /> */}
        </Routes>
        <Toaster />
      </div>
    </Router>
  );
}

export default App;
