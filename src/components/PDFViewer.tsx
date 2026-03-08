import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { Loader2, AlertCircle, Download } from 'lucide-react';

// Set worker path - using a more reliable CDN link
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

interface PDFViewerProps {
  url: string;
  fileName?: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ url, fileName }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderedPages, setRenderedPages] = useState<number[]>([]);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        setRenderedPages([]);
        
        const loadingTask = pdfjsLib.getDocument(url);
        const pdfDoc = await loadingTask.promise;
        setPdf(pdfDoc);
        setNumPages(pdfDoc.numPages);
        setLoading(false);
      } catch (err: any) {
        console.error('Error loading PDF:', err);
        setError('PDF লোড করতে সমস্যা হয়েছে। আপনার ব্রাউজার এটি সাপোর্ট নাও করতে পারে।');
        setLoading(false);
      }
    };

    loadPdf();
  }, [url]);

  // Component to render a single page
  const PDFPage = ({ pageNum, pdfDoc }: { pageNum: number, pdfDoc: pdfjsLib.PDFDocumentProxy, key?: any }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pageLoading, setPageLoading] = useState(true);

    useEffect(() => {
      let isMounted = true;
      const render = async () => {
        try {
          const page = await pdfDoc.getPage(pageNum);
          if (!isMounted) return;

          const viewport = page.getViewport({ scale: 1.5 }); // Good balance for mobile
          const canvas = canvasRef.current;
          if (!canvas) return;

          const context = canvas.getContext('2d');
          if (!context) return;

          // Adjust for high DPI screens
          const dpr = window.devicePixelRatio || 1;
          canvas.height = viewport.height * dpr;
          canvas.width = viewport.width * dpr;
          canvas.style.height = `${viewport.height}px`;
          canvas.style.width = '100%'; // Responsive width
          canvas.style.maxWidth = '100%';

          context.scale(dpr, dpr);

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          // @ts-ignore - Handle potential version differences in RenderParameters
          await page.render(renderContext).promise;
          if (isMounted) setPageLoading(false);
        } catch (err) {
          console.error(`Error rendering page ${pageNum}:`, err);
          if (isMounted) setPageLoading(false);
        }
      };

      render();
      return () => { isMounted = false; };
    }, [pdfDoc, pageNum]);

    return (
      <div className="relative mb-4 bg-white shadow-md rounded-lg overflow-hidden w-full max-w-2xl mx-auto">
        {pageLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
            <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className="block w-full h-auto" />
        <div className="absolute bottom-2 right-2 bg-black/20 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded-full">
          Page {pageNum}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 w-full">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-4" />
        <p className="text-slate-500 font-medium">PDF লোড হচ্ছে...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-10 text-center w-full">
        <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-rose-500" />
        </div>
        <p className="text-slate-700 font-bold mb-2">{error}</p>
        <p className="text-slate-400 text-xs mb-6">সরাসরি ডাউনলোড করে দেখতে পারেন।</p>
        <button 
          onClick={() => {
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName || 'document.pdf';
            link.click();
          }}
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-sm font-bold flex items-center gap-2 mx-auto shadow-lg shadow-indigo-200"
        >
          <Download className="w-4 h-4" />
          ডাউনলোড করুন
        </button>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="w-full max-h-[75vh] overflow-y-auto custom-scrollbar p-2 sm:p-4 bg-slate-100/50 rounded-2xl"
    >
      <div className="flex flex-col gap-2">
        {pdf && Array.from({ length: numPages }, (_, i) => (
          <PDFPage key={i + 1} pageNum={i + 1} pdfDoc={pdf} />
        ))}
      </div>
      
      <div className="mt-4 text-center pb-4">
        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
          End of Document • {numPages} Pages
        </p>
      </div>
    </div>
  );
};

export default PDFViewer;
