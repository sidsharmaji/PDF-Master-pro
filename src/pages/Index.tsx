
import { useState } from "react";
import { Upload, FileText, Scissors, Merge, Shield, Download, Shrink, FileImage, FileType, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";

const Index = () => {
  const [hoveredTool, setHoveredTool] = useState<string | null>(null);
  const navigate = useNavigate();

  const pdfTools = [
    {
      id: "merge",
      title: "Merge PDF",
      description: "Combine multiple PDFs into one",
      icon: Merge,
      color: "from-purple-500 to-pink-500",
      popular: true,
      route: "/merge",
    },
    {
      id: "split",
      title: "Split PDF",
      description: "Extract pages from your PDF",
      icon: Scissors,
      color: "from-blue-500 to-cyan-500",
      route: "/split",
    },
    {
      id: "compress",
      title: "Compress PDF",
      description: "Reduce PDF file size",
      icon: Shrink,
      color: "from-green-500 to-emerald-500",
      popular: true,
      route: "/compress",
    },
    {
      id: "convert",
      title: "Word to PDF",
      description: "Convert Word documents to PDF",
      icon: FileType,
      color: "from-orange-500 to-red-500",
      route: "/convert",
    },


    {
      id: "excel-to-pdf",
      title: "Excel to PDF",
      description: "Convert Excel spreadsheets to PDF with enhanced formatting and styles",
      icon: FileText,
      color: "from-emerald-500 to-green-500",
      route: "/excel-to-pdf",
    },

    {
      id: "powerpoint-to-pdf",
      title: "PowerPoint to PDF",
      description: "Convert PowerPoint presentations to PDF with slide formatting preserved",
      icon: FileText,
      color: "from-orange-500 to-red-500",
      route: "/powerpoint-to-pdf",
    },
    {
      id: "pdf-to-image",
      title: "PDF to Image",
      description: "Convert PDF pages to high-quality images in multiple formats (JPEG, PNG, WebP)",
      icon: FileImage,
      color: "from-indigo-500 to-purple-500",
      route: "/pdf-to-image",
    },
    {
      id: "jpg-to-pdf",
      title: "Image to PDF",
      description: "Convert images (JPG, PNG, GIF, BMP, WebP) to PDF with customizable page settings",
      icon: FileImage,
      color: "from-pink-500 to-rose-500",
      route: "/jpg-to-pdf",
    },
  ];

  const handleToolClick = (route: string) => {
    navigate(route);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500 rounded-full blur-3xl animate-pulse delay-1000"></div>
        <div className="absolute top-3/4 left-1/2 w-64 h-64 bg-pink-500 rounded-full blur-3xl animate-pulse delay-500"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 p-6">
        <nav className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              PDF Master
            </span>
          </div>
          <div className="hidden md:flex items-center space-x-8">
            <a href="#" className="text-gray-300 hover:text-white transition-colors">Tools</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors">Pricing</a>
            <a href="#" className="text-gray-300 hover:text-white transition-colors">About</a>
            <Button className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0">
              Get Started
            </Button>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative z-10 text-center py-20 px-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-6">
            <Sparkles className="w-8 h-8 text-purple-400 mr-3" />
            <span className="text-purple-400 font-semibold">The Future of PDF Processing</span>
          </div>
          <h1 className="text-6xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
            PDF Master
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 leading-relaxed">
            Transform, merge, split, and optimize your PDFs with our cutting-edge tools. 
            <br className="hidden md:block" />
            Fast, secure, and completely free.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button size="lg" className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white border-0 px-8 py-4 text-lg">
              <Upload className="w-5 h-5 mr-2" />
              Choose Files
            </Button>
            <Button size="lg" variant="outline" className="border-purple-400 text-purple-400 hover:bg-purple-400 hover:text-white px-8 py-4 text-lg">
              View All Tools
            </Button>
          </div>
        </div>
      </section>

      {/* Tools Grid */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold mb-4 bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              Powerful PDF Tools
            </h2>
            <p className="text-gray-400 text-lg">
              Everything you need to work with PDFs, all in one place
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {pdfTools.map((tool) => {
              const IconComponent = tool.icon;
              return (
                <Card
                  key={tool.id}
                  className="group relative overflow-hidden bg-white/5 backdrop-blur-lg border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-105 cursor-pointer"
                  onMouseEnter={() => setHoveredTool(tool.id)}
                  onMouseLeave={() => setHoveredTool(null)}
                  onClick={() => handleToolClick(tool.route)}
                >
                  {tool.popular && (
                    <div className="absolute top-3 right-3">
                      <div className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black text-xs px-2 py-1 rounded-full font-semibold flex items-center">
                        <Star className="w-3 h-3 mr-1" />
                        Popular
                      </div>
                    </div>
                  )}
                  
                  <CardContent className="p-6 text-center">
                    <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-r ${tool.color} flex items-center justify-center transform transition-transform duration-300 ${
                      hoveredTool === tool.id ? 'scale-110 rotate-3' : ''
                    }`}>
                      <IconComponent className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-semibold text-white mb-2">{tool.title}</h3>
                    <p className="text-gray-400 text-sm">{tool.description}</p>
                  </CardContent>

                  <div className={`absolute inset-0 bg-gradient-to-r ${tool.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`}></div>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative z-10 py-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="text-center p-8 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-green-500 to-emerald-500 rounded-2xl flex items-center justify-center">
                <Sparkles className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Lightning Fast</h3>
              <p className="text-gray-400">Process your PDFs in seconds with our optimized algorithms.</p>
            </div>

            <div className="text-center p-8 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center">
                <FileText className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">100% Secure</h3>
              <p className="text-gray-400">Your files are processed securely and deleted automatically.</p>
            </div>

            <div className="text-center p-8 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10">
              <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center">
                <Download className="w-8 h-8 text-white" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-4">Easy to Use</h3>
              <p className="text-gray-400">No registration required. Just upload, process, and download.</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 py-12 px-6 border-t border-white/10">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              PDF Master
            </span>
          </div>
          <p className="text-gray-400 mb-6">
            The most advanced PDF processing platform on the web.
          </p>
          <div className="flex justify-center space-x-8 text-sm text-gray-400">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
