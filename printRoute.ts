import { Express, Request, Response } from 'express';

/**
 * Register print route that handles automatic printing
 * This route receives PDF data and returns an HTML page that automatically prints
 */
export function registerPrintRoute(app: Express) {
  app.post('/api/print', (req: Request, res: Response) => {
    const { pdfBase64, fileName } = req.body;

    // Validate inputs
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      res.status(400).send('Missing or invalid pdfBase64 parameter');
      return;
    }

    const decodedFileName = fileName ? decodeURIComponent(fileName as string) : 'label.pdf';

    // Generate HTML page with automatic print
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>列印標籤</title>
  <style>
    @page {
      size: 60mm 80mm;
      margin: 0;
      orientation: portrait;
    }
    body {
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    }
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .message {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    .message h1 {
      margin: 0 0 20px 0;
      color: #333;
      font-size: 24px;
    }
    .message p {
      margin: 0 0 10px 0;
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .status {
      margin-top: 30px;
      padding: 15px;
      background: #f0f8ff;
      border-left: 4px solid #3498db;
      border-radius: 4px;
      color: #0066cc;
      font-size: 14px;
    }
    @media print {
      body {
        background: white;
      }
      .container {
        display: none;
      }
      iframe {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="message">
      <h1><span class="spinner"></span>正在準備列印</h1>
      <p>標籤已準備就緒，列印對話框即將打開...</p>
      <p>如果列印對話框未出現，請檢查瀏覽器的彈窗設定。</p>
      <div class="status">
        <strong>檔案名稱：</strong> ${decodedFileName}
      </div>
    </div>
  </div>

  <!-- Hidden iframe for PDF display and printing -->
  <iframe 
    id="printFrame" 
    style="display: none; width: 0; height: 0; border: none;"
  ></iframe>

  <script>
    (function() {
      // PDF base64 data
      const pdfBase64 = '${pdfBase64}';
      
      // Convert base64 to blob
      function base64ToBlob(base64, contentType = 'application/pdf') {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: contentType });
      }

      // Create blob URL and load into iframe
      function loadAndPrint() {
        try {
          const blob = base64ToBlob(pdfBase64);
          const blobUrl = URL.createObjectURL(blob);
          const iframe = document.getElementById('printFrame');
          
          // Set iframe src to blob URL
          iframe.src = blobUrl;
          
          // Wait for iframe to load, then print
          iframe.onload = function() {
            try {
              // Delay to ensure PDF is fully loaded
              setTimeout(function() {
                // Try to print using iframe's contentWindow
                if (iframe.contentWindow) {
                  iframe.contentWindow.print();
                }
              }, 500);
            } catch (e) {
              console.error('Print failed:', e);
              // Fallback: open in new window
              window.open(blobUrl, '_blank');
            }
          };

          // Fallback timeout: if iframe doesn't load within 5 seconds, open in new window
          setTimeout(function() {
            if (!iframe.contentWindow || !iframe.contentWindow.document.body) {
              window.open(blobUrl, '_blank');
            }
          }, 5000);
        } catch (error) {
          console.error('Error loading PDF:', error);
          alert('無法載入標籤，請重試。');
        }
      }

      // Load and print when page is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAndPrint);
      } else {
        loadAndPrint();
      }

      // Handle page visibility changes
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          // Page became visible again, try to print again
          const iframe = document.getElementById('printFrame');
          if (iframe && iframe.contentWindow) {
            try {
              iframe.contentWindow.print();
            } catch (e) {
              console.warn('Could not print on visibility change:', e);
            }
          }
        }
      });
    })();
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(htmlContent);
  });

  // Also support GET for backward compatibility with smaller PDFs
  app.get('/api/print', (req: Request, res: Response) => {
    const { pdfBase64, fileName } = req.query;

    // Validate inputs
    if (!pdfBase64 || typeof pdfBase64 !== 'string') {
      res.status(400).send('Missing or invalid pdfBase64 parameter');
      return;
    }

    const decodedFileName = fileName ? decodeURIComponent(fileName as string) : 'label.pdf';

    // Generate HTML page with automatic print
    const htmlContent = `
<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>列印標籤</title>
  <style>
    @page {
      size: 60mm 80mm;
      margin: 0;
      orientation: portrait;
    }
    body {
      margin: 0;
      padding: 0;
      background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
    }
    .container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      padding: 20px;
    }
    .message {
      background: white;
      padding: 40px;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      text-align: center;
      max-width: 500px;
    }
    .message h1 {
      margin: 0 0 20px 0;
      color: #333;
      font-size: 24px;
    }
    .message p {
      margin: 0 0 10px 0;
      color: #666;
      font-size: 16px;
      line-height: 1.5;
    }
    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 3px solid #f3f3f3;
      border-top: 3px solid #3498db;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
      vertical-align: middle;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    .status {
      margin-top: 30px;
      padding: 15px;
      background: #f0f8ff;
      border-left: 4px solid #3498db;
      border-radius: 4px;
      color: #0066cc;
      font-size: 14px;
    }
    @media print {
      body {
        background: white;
      }
      .container {
        display: none;
      }
      iframe {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="message">
      <h1><span class="spinner"></span>正在準備列印</h1>
      <p>標籤已準備就緒，列印對話框即將打開...</p>
      <p>如果列印對話框未出現，請檢查瀏覽器的彈窗設定。</p>
      <div class="status">
        <strong>檔案名稱：</strong> ${decodedFileName}
      </div>
    </div>
  </div>

  <!-- Hidden iframe for PDF display and printing -->
  <iframe 
    id="printFrame" 
    style="display: none; width: 0; height: 0; border: none;"
  ></iframe>

  <script>
    (function() {
      // PDF base64 data
      const pdfBase64 = '${pdfBase64}';
      
      // Convert base64 to blob
      function base64ToBlob(base64, contentType = 'application/pdf') {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        return new Blob([bytes], { type: contentType });
      }

      // Create blob URL and load into iframe
      function loadAndPrint() {
        try {
          const blob = base64ToBlob(pdfBase64);
          const blobUrl = URL.createObjectURL(blob);
          const iframe = document.getElementById('printFrame');
          
          // Set iframe src to blob URL
          iframe.src = blobUrl;
          
          // Wait for iframe to load, then print
          iframe.onload = function() {
            try {
              // Delay to ensure PDF is fully loaded
              setTimeout(function() {
                // Try to print using iframe's contentWindow
                if (iframe.contentWindow) {
                  iframe.contentWindow.print();
                }
              }, 500);
            } catch (e) {
              console.error('Print failed:', e);
              // Fallback: open in new window
              window.open(blobUrl, '_blank');
            }
          };

          // Fallback timeout: if iframe doesn't load within 5 seconds, open in new window
          setTimeout(function() {
            if (!iframe.contentWindow || !iframe.contentWindow.document.body) {
              window.open(blobUrl, '_blank');
            }
          }, 5000);
        } catch (error) {
          console.error('Error loading PDF:', error);
          alert('無法載入標籤，請重試。');
        }
      }

      // Load and print when page is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadAndPrint);
      } else {
        loadAndPrint();
      }

      // Handle page visibility changes
      document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
          // Page became visible again, try to print again
          const iframe = document.getElementById('printFrame');
          if (iframe && iframe.contentWindow) {
            try {
              iframe.contentWindow.print();
            } catch (e) {
              console.warn('Could not print on visibility change:', e);
            }
          }
        }
      });
    })();
  </script>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(htmlContent);
  });
}
