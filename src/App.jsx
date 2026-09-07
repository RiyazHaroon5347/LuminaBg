import { useState, useEffect, useCallback, useRef } from 'react';
import { UploadCloud, Image as ImageIcon, Download, Loader2, Sparkles, RefreshCw, Zap, ShieldCheck, Server, AlertCircle, Palette, FileImage, Check, Pipette } from 'lucide-react';
import './index.css';

const API_BASE = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8000' : 'https://luminabg.onrender.com');


const PRESET_COLORS = [
  { id: 'white', name: 'White', color: '#ffffff' },
  { id: 'black', name: 'Black', color: '#000000' },
  { id: 'blue', name: 'Passport Blue', color: '#2563eb' },
  { id: 'gray', name: 'Studio Gray', color: '#e5e7eb' },
  { id: 'red', name: 'Crimson Red', color: '#ef4444' },
  { id: 'emerald', name: 'Emerald Green', color: '#10b981' },
];

const isLightColor = (colorHex) => {
  if (!colorHex || colorHex === 'transparent') return false;
  if (colorHex === 'white' || colorHex === '#ffffff' || colorHex === '#e5e7eb' || colorHex === '#f3f4f6') return true;
  if (colorHex.startsWith('#') && colorHex.length === 7) {
    const r = parseInt(colorHex.slice(1, 3), 16);
    const g = parseInt(colorHex.slice(3, 5), 16);
    const b = parseInt(colorHex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 180;
  }
  return false;
};

const getFormatBadge = (format) => {
  switch (format) {
    case 'png':
      return 'Lossless & Transparent';
    case 'jpg':
      return 'Solid Photo Standard';
    case 'webp':
      return 'High Efficiency Web';
    default:
      return '';
  }
};

const getBgColorLabel = (bgColor, customColor) => {
  if (bgColor === 'transparent') return 'Transparent';
  if (bgColor === 'custom') return `Custom (${customColor.toUpperCase()})`;
  if (bgColor === 'white') return 'White';
  if (bgColor === 'black') return 'Black';
  const found = PRESET_COLORS.find(c => c.color.toLowerCase() === bgColor.toLowerCase() || c.id === bgColor);
  if (found) return found.name;
  return bgColor.toUpperCase();
};


function App() {
  const [serverConnected, setServerConnected] = useState(null); // null = checking, true = connected, false = error
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [processingTime, setProcessingTime] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [alphaMatting, setAlphaMatting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Background & Format Customization options for download
  const [bgColor, setBgColor] = useState('transparent'); // 'transparent', 'white', 'black', or hex
  const [customColor, setCustomColor] = useState('#3b82f6');
  const [downloadFormat, setDownloadFormat] = useState('png'); // 'png', 'jpg', 'webp'

  const canvasRef = useRef(null);

  const isCheckingRef = useRef(false);

  // Check backend server health on mount
  const checkHealth = useCallback(async () => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        setServerConnected(true);
        setErrorMsg(null);
      } else {
        setServerConnected(false);
      }
    } catch (e) {
      clearTimeout(timeoutId);
      setServerConnected(false);
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    checkHealth();
    // Poll every 30s when online, every 8s when offline
    const intervalMs = serverConnected ? 30000 : 8000;
    const interval = setInterval(checkHealth, intervalMs);
    return () => clearInterval(interval);
  }, [checkHealth, serverConnected]);

  const removeBackground = async (fileToProcess, matting = alphaMatting) => {
    if (!fileToProcess) return;

    setIsProcessing(true);
    setErrorMsg(null);
    setResultUrl(null);
    setProcessingTime(null);

    const formData = new FormData();
    formData.append('file', fileToProcess);

    const controller = new AbortController();
    // Allow up to 120 seconds for Render free tier cold-start + processing
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const response = await fetch(`${API_BASE}/api/remove-bg?alpha_matting=${matting}`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || `Server returned error ${response.status}`);
      }

      const timeHeader = response.headers.get('X-Processing-Time');
      if (timeHeader) {
        setProcessingTime(parseFloat(timeHeader).toFixed(2));
      }

      const arrayBuffer = await response.arrayBuffer();
      const blob = new Blob([arrayBuffer], { type: 'image/png' });
      const resultObjectUrl = URL.createObjectURL(blob);
      setResultUrl(resultObjectUrl);
      setServerConnected(true);
    } catch (err) {
      clearTimeout(timeoutId);
      console.error('Background removal error:', err);
      if (err.name === 'AbortError') {
        setErrorMsg('Request timed out. Render backend may still be waking up. Please try again.');
      } else {
        setErrorMsg(err.message || 'Failed to remove background. Please verify backend connection.');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const preprocessImageFile = (file, maxDimension = 1600) => {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const { width, height } = img;
        if (width <= maxDimension && height <= maxDimension) {
          resolve(file);
          return;
        }
        let newW = width;
        let newH = height;
        if (width > height) {
          newW = maxDimension;
          newH = Math.round((height * maxDimension) / width);
        } else {
          newH = maxDimension;
          newW = Math.round((width * maxDimension) / height);
        }

        const canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, newW, newH);
        canvas.toBlob((blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const resizedFile = new File([blob], file.name, { type: file.type || 'image/png' });
          resolve(resizedFile);
        }, file.type || 'image/png', 0.92);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };
      img.src = url;
    });
  };

  const handleFile = async (file) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (JPG, PNG, WEBP).');
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    
    // Quick client-side downscale to prevent large payload network bottlenecks & timeout
    const processedFile = await preprocessImageFile(file);
    removeBackground(processedFile, alphaMatting);
  };

  const handleDrag = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  // High-Resolution Download Handler (Converts to valid JPG, PNG, or WEBP photo format)
  const handleDownload = () => {
    if (!resultUrl) return;

    const img = new Image();
    // Only set crossOrigin if URL is remote http/https (avoiding CORS issues on local blob URLs)
    if (resultUrl.startsWith('http://') || resultUrl.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 800;
        canvas.height = img.naturalHeight || img.height || 600;
        const ctx = canvas.getContext('2d');

        // Determine background color
        const activeColor = bgColor === 'custom' ? customColor : bgColor;

        // Fill background if not transparent or if exporting to JPG
        if (activeColor !== 'transparent' || downloadFormat === 'jpg') {
          ctx.fillStyle = (activeColor === 'transparent' || activeColor === 'white') ? '#ffffff' : activeColor === 'black' ? '#000000' : activeColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Draw cutout on top
        ctx.drawImage(img, 0, 0);

        // Extension and MIME type mapping
        const extension = downloadFormat === 'jpg' ? 'jpg' : downloadFormat === 'webp' ? 'webp' : 'png';
        const mimeType = downloadFormat === 'jpg' ? 'image/jpeg' : downloadFormat === 'webp' ? 'image/webp' : 'image/png';

        // Safe filename extraction (removes extension cleanly)
        let baseName = imageFile?.name ? imageFile.name.replace(/\.[^/.]+$/, '') : 'photo';
        if (!baseName || baseName.trim() === '') baseName = 'photo';

        const fileName = `${baseName}_no_bg.${extension}`;

        // Convert canvas to base64 Data URL with high quality
        const dataUrl = canvas.toDataURL(mimeType, 0.95);

        // Convert Data URL to typed Blob to ensure browser respects file name & extension
        const arr = dataUrl.split(',');
        const mimeMatches = arr[0].match(/:(.*?);/);
        const mime = mimeMatches ? mimeMatches[1] : mimeType;
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const finalBlob = new Blob([u8arr], { type: mime });
        const blobUrl = URL.createObjectURL(finalBlob);

        // Trigger browser file download with explicit filename & extension
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = blobUrl;
        link.download = fileName;
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
          if (document.body.contains(link)) {
            document.body.removeChild(link);
          }
          URL.revokeObjectURL(blobUrl);
        }, 1000);
      } catch (err) {
        console.error('Error during photo export:', err);
        alert('Could not export photo. Please try again.');
      }
    };

    img.onerror = (err) => {
      console.error('Error loading image for download:', err);
      alert('Failed to load image for download.');
    };

    img.src = resultUrl;
  };

  const reset = () => {
    setImageFile(null);
    setImageUrl(null);
    setResultUrl(null);
    setProcessingTime(null);
    setErrorMsg(null);
  };

  const toggleAlphaMatting = () => {
    const nextVal = !alphaMatting;
    setAlphaMatting(nextVal);
    if (imageFile) {
      removeBackground(imageFile, nextVal);
    }
  };

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <header className="navbar">
        <div className="logo-group">
          <div className="logo-icon">
            <Zap size={24} className="bolt" />
          </div>
          <div>
            <h1>Lumina BG</h1>
            <span className="badge">REMOVE.BG INSTANT ENGINE</span>
          </div>
        </div>

        <div className="server-status">
          <div className={`status-pill ${serverConnected ? 'online' : serverConnected === false ? 'offline' : 'checking'}`}>
            <Server size={14} />
            <span>
              {serverConnected 
                ? (API_BASE.includes('onrender.com') ? 'Render Backend Online' : 'Local Backend Online') 
                : serverConnected === false 
                ? 'Backend Disconnected' 
                : 'Connecting to Backend...'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {serverConnected === false && (
          <div className="warning-banner">
            <AlertCircle size={20} />
            <div>
              {API_BASE.includes('onrender.com') ? (
                <>
                  <strong>Render Backend Disconnected / Waking Up:</strong> Connecting to <code>{API_BASE}</code>... Render free tier services may take 30–50 seconds to spin up if idle.
                  <button 
                    onClick={checkHealth} 
                    style={{ marginLeft: '12px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', cursor: 'pointer', fontSize: '12px' }}
                  >
                    Retry Now
                  </button>
                </>
              ) : (
                <>
                  <strong>Python Backend Not Running:</strong> Please start the backend by navigating to the <code>backend/</code> folder and running:
                  <pre className="inline-code">python -m uvicorn main:app --reload --port 8000</pre>
                </>
              )}
            </div>
          </div>
        )}

        {!imageUrl ? (
          <div className="hero-section">
            <div className="hero-badge">
              <Sparkles size={16} /> Instant 100% Automatic Background Removal
            </div>
            <h2>Remove Image Backgrounds <span className="gradient-text">Instantly & In High Resolution</span></h2>
            <p className="hero-desc">Upload your photo and get a crisp transparent cutout in sub-second speed powered by deep neural networks.</p>

            <label 
              className={`upload-zone ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="upload-icon-wrapper">
                <UploadCloud size={48} className="upload-icon" />
              </div>
              <h3>Drag & Drop your image here</h3>
              <p>Supports JPG, PNG, WEBP (High Resolution Preserved)</p>
              <span className="btn-browse">Browse File</span>
              <input 
                type="file" 
                accept="image/*" 
                style={{ display: 'none' }} 
                onChange={handleChange} 
              />
            </label>
          </div>
        ) : (
          <div className="editor-layout">
            <div className="action-bar">
              <button className="btn-secondary" onClick={reset}>
                <RefreshCw size={16} /> Upload New Image
              </button>
              
              <label className="toggle-matting">
                <input 
                  type="checkbox" 
                  checked={alphaMatting} 
                  onChange={toggleAlphaMatting} 
                  disabled={isProcessing}
                />
                <span>Fine Hair Matting (Ultra Edge Detail)</span>
              </label>

              {processingTime && (
                <div className="speed-tag">
                  <Zap size={14} /> Processed in <strong>{processingTime}s</strong>
                </div>
              )}
            </div>

            {errorMsg && (
              <div className="error-banner">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
                <button onClick={() => removeBackground(imageFile)}>Retry</button>
              </div>
            )}

            <div className="preview-grid">
              {/* Original Preview */}
              <div className="preview-card">
                <div className="card-header">Original Image</div>
                <div className="image-frame">
                  <img src={imageUrl} alt="Original input" />
                </div>
              </div>

              {/* Result Preview */}
              <div className="preview-card">
                <div className="card-header">
                  <div className="header-title-badge">
                    <span>Background Removed</span>
                    {resultUrl && <Sparkles size={14} className="sparkle-accent" />}
                  </div>
                  <ShieldCheck size={16} className="check-icon" />
                </div>

                {/* Display Frame with Dynamic Background */}
                <div 
                  className={`image-frame ${bgColor === 'transparent' ? 'transparency-pattern' : ''}`}
                  style={{
                    backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor === 'custom' ? customColor : bgColor
                  }}
                >
                  {isProcessing && (
                    <div className="loading-overlay">
                      <div className="scanner-beam" />
                      <Loader2 size={42} className="spinner" />
                      <p className="processing-text">Removing Background...</p>
                      <span className="sub-text">Running ISNet Neural Network Engine</span>
                    </div>
                  )}

                  {resultUrl ? (
                    <div key={resultUrl} className="result-image-wrapper">
                      <img src={resultUrl} alt="Result cutout" className="result-img" />
                      <div className="reveal-scan-line" />
                      <div className="shine-sweep" />
                    </div>
                  ) : (
                    !isProcessing && !errorMsg && (
                      <div className="empty-state">
                        <ImageIcon size={48} />
                        <p>Processing image...</p>
                      </div>
                    )
                  )}
                </div>

                {resultUrl && (
                  <div className="download-controls">
                    <div className="controls-header-title">
                      <h3>Export & Customization</h3>
                      <p>Select background color and image format</p>
                    </div>

                    {/* Background Color Selector */}
                    <div className="control-group">
                      <div className="control-header">
                        <div className="control-label">
                          <Palette size={16} className="control-icon" />
                          <span>Background Color</span>
                        </div>
                        <span className="selected-color-badge">
                          {getBgColorLabel(bgColor, customColor)}
                        </span>
                      </div>
                      
                      <div className="color-options">
                        {/* Transparent */}
                        <button 
                          type="button"
                          className={`color-btn transparent-btn ${bgColor === 'transparent' ? 'active' : ''}`}
                          onClick={() => setBgColor('transparent')}
                          title="Transparent Background"
                        >
                          {bgColor === 'transparent' && <Check size={14} className="check-icon-light" />}
                        </button>

                        {/* Presets */}
                        {PRESET_COLORS.map((preset) => {
                          const isActive = bgColor === preset.color || bgColor === preset.id || (preset.id === 'white' && (bgColor === '#ffffff' || bgColor === 'white')) || (preset.id === 'black' && (bgColor === '#000000' || bgColor === 'black'));
                          const light = isLightColor(preset.color);

                          return (
                            <button
                              key={preset.id}
                              type="button"
                              className={`color-btn ${isActive ? 'active' : ''}`}
                              style={{ backgroundColor: preset.color }}
                              onClick={() => setBgColor(preset.color)}
                              title={preset.name}
                            >
                              {isActive && (
                                <Check size={14} className={light ? 'check-icon-dark' : 'check-icon-light'} />
                              )}
                            </button>
                          );
                        })}

                        {/* Custom Color Picker */}
                        <label 
                          className={`color-btn custom-picker-btn ${bgColor === 'custom' ? 'active' : ''}`}
                          style={{ backgroundColor: customColor }}
                          title={`Custom Color: ${customColor}`}
                        >
                          <input 
                            type="color" 
                            value={customColor} 
                            onChange={(e) => {
                              setCustomColor(e.target.value);
                              setBgColor('custom');
                            }}
                          />
                          {bgColor === 'custom' ? (
                            <Check size={14} className={isLightColor(customColor) ? 'check-icon-dark' : 'check-icon-light'} />
                          ) : (
                            <Pipette size={13} className={isLightColor(customColor) ? 'check-icon-dark' : 'check-icon-light'} />
                          )}
                        </label>
                      </div>
                    </div>

                    {/* Photo Format Selector */}
                    <div className="control-group">
                      <div className="control-header">
                        <div className="control-label">
                          <FileImage size={16} className="control-icon" />
                          <span>Photo Format</span>
                        </div>
                        <span className="format-info-badge">
                          {getFormatBadge(downloadFormat)}
                        </span>
                      </div>
                      
                      <div className="format-selector">
                        <button 
                          type="button"
                          className={`format-btn ${downloadFormat === 'png' ? 'active' : ''}`}
                          onClick={() => setDownloadFormat('png')}
                        >
                          <span className="format-name">PNG</span>
                          <span className="format-sub">Transparent</span>
                        </button>
                        <button 
                          type="button"
                          className={`format-btn ${downloadFormat === 'jpg' ? 'active' : ''}`}
                          onClick={() => setDownloadFormat('jpg')}
                        >
                          <span className="format-name">JPG</span>
                          <span className="format-sub">Solid Photo</span>
                        </button>
                        <button 
                          type="button"
                          className={`format-btn ${downloadFormat === 'webp' ? 'active' : ''}`}
                          onClick={() => setDownloadFormat('webp')}
                        >
                          <span className="format-name">WEBP</span>
                          <span className="format-sub">Compressed</span>
                        </button>
                      </div>

                      {downloadFormat === 'jpg' && (bgColor === 'transparent') && (
                        <div className="format-warning-note">
                          <AlertCircle size={14} />
                          <span>JPG doesn't support transparency. Solid white will be applied.</span>
                        </div>
                      )}
                    </div>

                    {/* Download Button */}
                    <button className="btn-primary btn-download" onClick={handleDownload} type="button">
                      <Download size={18} className="download-icon" />
                      <span>Download Cutout ({downloadFormat.toUpperCase()})</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
