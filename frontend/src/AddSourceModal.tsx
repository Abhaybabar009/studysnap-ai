import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, UploadCloud, FileText, PlaySquare, Link2,
  Trash2, FileAudio, FileVideo, FileSpreadsheet, Loader2, CheckCircle, Image as ImageIcon, AlertCircle
} from 'lucide-react';

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: (newSources: any[]) => void;
  backendUrl: string;
}

const DOCUMENT_ACCEPTED_FORMATS = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/plain': ['.txt'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'text/markdown': ['.md'],
  'application/json': ['.json'],
  'text/html': ['.html'],
  'application/xml': ['.xml'],
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/x-m4a': ['.m4a']
};

const IMAGE_ACCEPTED_FORMATS = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp']
};

export default function AddSourceModal({ isOpen, onClose, onUploadSuccess, backendUrl }: AddSourceModalProps) {
  const [activeTab, setActiveTab] = useState<'files' | 'image' | 'url'>('files');
  const [files, setFiles] = useState<File[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<{ [key: string]: string }>({});
  const [urlInput, setUrlInput] = useState('');
  
  const [isUploading, setIsUploading] = useState(false);
  const [statusText, setStatusText] = useState<string>('Processing...');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // File Dropzone logic for general documents
  const onDropFiles = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setErrorMessage(null);
    if (rejectedFiles && rejectedFiles.length > 0) {
      setErrorMessage('Some files were rejected due to unsupported format or excessive file size.');
    }
    setFiles(prev => [...prev, ...acceptedFiles]);
  }, []);

  // Image Dropzone logic for images
  const onDropImages = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    setErrorMessage(null);
    const validImages: File[] = [];
    const newPreviews: { [key: string]: string } = {};

    acceptedFiles.forEach(file => {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (['jpg', 'jpeg', 'png', 'webp'].includes(ext || '')) {
        validImages.push(file);
        newPreviews[file.name] = URL.createObjectURL(file);
      }
    });

    if (rejectedFiles && rejectedFiles.length > 0 || validImages.length < acceptedFiles.length) {
      setErrorMessage('Only JPG, JPEG, PNG, and WEBP image formats are supported.');
    }

    setImageFiles(prev => [...prev, ...validImages]);
    setImagePreviews(prev => ({ ...prev, ...newPreviews }));
  }, []);

  const { getRootProps: getFileRootProps, getInputProps: getFileInputProps, isDragActive: isFileDragActive } = useDropzone({
    onDrop: onDropFiles,
    accept: DOCUMENT_ACCEPTED_FORMATS,
    maxSize: 50 * 1024 * 1024
  });

  const { getRootProps: getImageRootProps, getInputProps: getImageInputProps, isDragActive: isImageDragActive } = useDropzone({
    onDrop: onDropImages,
    accept: IMAGE_ACCEPTED_FORMATS,
    maxSize: 20 * 1024 * 1024
  });

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeImageFile = (index: number) => {
    const fileToRemove = imageFiles[index];
    if (fileToRemove && imagePreviews[fileToRemove.name]) {
      URL.revokeObjectURL(imagePreviews[fileToRemove.name]);
      setImagePreviews(prev => {
        const copy = { ...prev };
        delete copy[fileToRemove.name];
        return copy;
      });
    }
    setImageFiles(prev => prev.filter((_, i) => i !== index));
  };

  const getFileIcon = (filename: string) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (['mp3', 'wav', 'm4a'].includes(ext || '')) return <FileAudio size={20} className="text-blue-400" />;
    if (['mp4', 'mov'].includes(ext || '')) return <FileVideo size={20} className="text-purple-400" />;
    if (['csv', 'xlsx'].includes(ext || '')) return <FileSpreadsheet size={20} className="text-green-400" />;
    return <FileText size={20} className="text-gray-400" />;
  };

  const handleUpload = async () => {
    setErrorMessage(null);
    const targetFiles = activeTab === 'image' ? imageFiles : files;

    if ((activeTab === 'files' || activeTab === 'image') && targetFiles.length > 0) {
      setIsUploading(true);
      setStatusText('Uploading...');
      setUploadProgress(20);

      const formData = new FormData();
      targetFiles.forEach(file => formData.append('files', file));

      try {
        const progressTimer = setInterval(() => {
          setUploadProgress(prev => {
            if (prev < 50) {
              setStatusText('Processing OCR & Visual Layout...');
              return prev + 15;
            } else if (prev < 85) {
              setStatusText('Indexing into Vector Store...');
              return prev + 10;
            }
            return prev;
          });
        }, 700);

        const res = await fetch(`${backendUrl}/api/sources/upload`, {
          method: 'POST',
          body: formData
        });

        clearInterval(progressTimer);
        const data = await res.json();

        if (res.ok && data.success) {
          setStatusText('Ready');
          setUploadProgress(100);
          setTimeout(() => {
            onUploadSuccess(data.sources);
            resetAndClose();
          }, 400);
        } else {
          setStatusText('Failed');
          setErrorMessage(data.detail || 'Upload or image processing failed.');
          setIsUploading(false);
        }
      } catch (err: any) {
        console.error("Upload Error", err);
        setStatusText('Failed');
        setErrorMessage('Failed to connect to backend server or upload files.');
        setIsUploading(false);
      }
    } else if (activeTab === 'url' && urlInput.trim()) {
      setIsUploading(true);
      setStatusText('Processing Web/Video URL...');
      setUploadProgress(40);

      try {
        const res = await fetch(`${backendUrl}/api/sources/url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: urlInput.trim() })
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          setStatusText('Ready');
          setUploadProgress(100);
          setTimeout(() => {
            onUploadSuccess([data.source]);
            resetAndClose();
          }, 400);
        } else {
          setStatusText('Failed');
          setErrorMessage(data.detail || 'Failed to process URL or transcript.');
          setIsUploading(false);
        }
      } catch (err: any) {
        console.error("URL Processing Error", err);
        setStatusText('Failed');
        setErrorMessage('Network error while processing URL.');
        setIsUploading(false);
      }
    }
  };

  const resetAndClose = () => {
    Object.values(imagePreviews).forEach(url => URL.revokeObjectURL(url));
    setFiles([]);
    setImageFiles([]);
    setImagePreviews({});
    setUrlInput('');
    setIsUploading(false);
    setStatusText('Processing...');
    setUploadProgress(0);
    setErrorMessage(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="modal-overlay">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="modal-content"
        >
          <div className="modal-header">
            <h2>Add Sources</h2>
            <button onClick={resetAndClose} className="icon-btn" disabled={isUploading}>
              <X size={20} />
            </button>
          </div>

          {/* 3 Source Options: File, Image, Video URL */}
          <div className="modal-tabs">
            <button 
              className={`tab ${activeTab === 'files' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('files'); setErrorMessage(null); }}
            >
              <FileText size={16} /> File
            </button>
            <button 
              className={`tab ${activeTab === 'image' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('image'); setErrorMessage(null); }}
            >
              <ImageIcon size={16} /> Image
            </button>
            <button 
              className={`tab ${activeTab === 'url' ? 'active' : ''}`} 
              onClick={() => { setActiveTab('url'); setErrorMessage(null); }}
            >
              <PlaySquare size={16} /> Video URL
            </button>
          </div>

          {errorMessage && (
            <div style={{ margin: '12px 24px 0 24px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.4)', color: '#f87171', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="modal-body">
            {/* FILE TAB */}
            {activeTab === 'files' && (
              <>
                <div 
                  {...getFileRootProps()} 
                  className={`dropzone ${isFileDragActive ? 'active' : ''}`}
                >
                  <input {...getFileInputProps()} />
                  <UploadCloud size={44} className="dropzone-icon" />
                  <h3>Drag & drop documents here, or click to browse</h3>
                  <p>Supports PDF, DOCX, TXT, CSV, XLSX, PPTX, MD, HTML, JSON, Audio</p>
                </div>

                {files.length > 0 && (
                  <div className="file-list">
                    <h4>Selected Documents ({files.length})</h4>
                    <div className="file-items">
                      {files.map((file, idx) => (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={`${file.name}-${idx}`} className="file-item">
                          <div className="file-info">
                            {getFileIcon(file.name)}
                            <span className="file-name" title={file.name}>{file.name}</span>
                            <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                          <button className="icon-btn danger" onClick={() => removeFile(idx)} disabled={isUploading}>
                            <Trash2 size={16} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* IMAGE TAB */}
            {activeTab === 'image' && (
              <>
                <div 
                  {...getImageRootProps()} 
                  className={`dropzone ${isImageDragActive ? 'active' : ''}`}
                  style={{ borderColor: 'var(--accent-color)', backgroundColor: 'rgba(168, 199, 250, 0.03)' }}
                >
                  <input {...getImageInputProps()} />
                  <ImageIcon size={44} className="dropzone-icon" color="var(--accent-color)" />
                  <h3>Drag & drop images here, or click to browse</h3>
                  <p>Supports <strong>JPG, JPEG, PNG, WEBP</strong> images for OCR & Visual Analysis</p>
                </div>

                {imageFiles.length > 0 && (
                  <div className="file-list">
                    <h4>Selected Images ({imageFiles.length})</h4>
                    <div className="file-items">
                      {imageFiles.map((file, idx) => (
                        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} key={`${file.name}-${idx}`} className="file-item">
                          <div className="file-info">
                            {imagePreviews[file.name] ? (
                              <img 
                                src={imagePreviews[file.name]} 
                                alt={file.name} 
                                style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }} 
                              />
                            ) : (
                              <ImageIcon size={20} color="var(--accent-color)" />
                            )}
                            <span className="file-name" title={file.name}>{file.name}</span>
                            <span className="file-size" style={{ backgroundColor: 'rgba(168, 199, 250, 0.15)', color: 'var(--accent-color)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600 }}>IMAGE</span>
                            <span className="file-size">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                          </div>
                          <button className="icon-btn danger" onClick={() => removeImageFile(idx)} disabled={isUploading}>
                            <Trash2 size={16} />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* VIDEO URL TAB */}
            {activeTab === 'url' && (
              <div className="url-input-container">
                <div className="url-icon-wrapper" style={{ display: 'flex', gap: '12px', justifyContent: 'center', alignItems: 'center' }}>
                  <Link2 size={24} />
                  <PlaySquare size={24} color="#ff0000" />
                </div>
                <h3>Add a Web Link or YouTube Video</h3>
                <p>Paste a URL to automatically extract text content or video transcripts.</p>
                <input 
                  type="text" 
                  className="url-input" 
                  placeholder="https://example.com or https://youtube.com/watch?v=..." 
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  disabled={isUploading}
                />
              </div>
            )}
          </div>

          <div className="modal-footer">
            {isUploading && (
              <div className="upload-progress-container">
                <div className="progress-bar">
                  <motion.div 
                    className="progress-fill" 
                    initial={{ width: 0 }} 
                    animate={{ width: `${uploadProgress}%` }} 
                  />
                </div>
                <span className="progress-text">
                  {uploadProgress === 100 ? (
                    <CheckCircle size={14} color="#4ade80" />
                  ) : (
                    <Loader2 size={14} className="animate-spin" />
                  )}
                  {statusText}
                </span>
              </div>
            )}
            <div style={{ flex: 1 }}></div>
            <button className="btn-cancel" onClick={resetAndClose} disabled={isUploading}>
              Cancel
            </button>
            <button 
              className="btn-primary" 
              onClick={handleUpload} 
              disabled={
                isUploading || 
                (activeTab === 'files' && files.length === 0) ||
                (activeTab === 'image' && imageFiles.length === 0) ||
                (activeTab === 'url' && !urlInput.trim())
              }
            >
              {isUploading ? 'Processing...' : 'Add Sources'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
