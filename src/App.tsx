/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import JSZip from 'jszip';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { 
  Plus, 
  Trash2, 
  Play, 
  Settings, 
  CheckCircle, 
  AlertCircle, 
  Download,
  Zap,
  Volume2,
  Maximize,
  Layers,
  FileVideo,
  Menu,
  X,
  Loader2,
  Bell
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import type { TaskType, VideoFile, ProcessingOptions, Notification } from './types';

const TASKS: { id: TaskType; label: string; icon: any; description: string }[] = [
  { id: 'compress', label: 'Video Compressor', icon: Maximize, description: 'Batch reduce file size with H.264' },
  { id: 'extract', label: 'Media Extractor', icon: Volume2, description: 'Batch extract audio or video streams' },
  { id: 'convert', label: 'Format Converter', icon: Layers, description: 'Batch change container formats' },
  { id: 'speed', label: 'Variable Speed', icon: Zap, description: 'Batch playback acceleration with pitch sync' },
];

export default function App() {
  // Navigation & UI State
  const [activeTask, setActiveTask] = useState<TaskType>('compress');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Video State
  const [files, setFiles] = useState<VideoFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  
  // Options State
  const [options, setOptions] = useState<ProcessingOptions>({
    task: 'compress',
    compressionLevel: 28, // CRF value for x264
    extractType: 'audio',
    targetFormat: 'mp4',
    speedMultiplier: 2.0,
  });

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  
  // FFmpeg State
  const ffmpegRef = useRef(new FFmpeg());
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);

  const addNotification = (title: string, message: string, type: Notification['type'] = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [{ id, title, message, type }, ...prev]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const loadFFmpeg = async () => {
    console.log('Starting FFmpeg load...');
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const ffmpeg = ffmpegRef.current;
    
    // Check for SharedArrayBuffer support
    if (typeof SharedArrayBuffer === 'undefined') {
      console.warn('SharedArrayBuffer is not available. multithreading will be disabled or loading might fail.');
      addNotification('Environmental Note', 'SharedArrayBuffer is unavailable. Processing might be slower.', 'info');
    }

    // Listen to logs
    ffmpeg.on('log', ({ message }) => {
      console.log('FFmpeg Log:', message);
    });

    try {
      console.log('Downloading FFmpeg core files...');
      const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
      const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
      
      console.log('Loading FFmpeg engine...');
      await ffmpeg.load({
        coreURL,
        wasmURL,
      });
      console.log('FFmpeg engine loaded successfully.');
      setFfmpegLoaded(true);
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      const errorMsg = error instanceof Error ? error.message : String(error);
      addNotification('Engine Error', `Failed to initialize: ${errorMsg}`, 'error');
    }
  };

  useEffect(() => {
    loadFFmpeg();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let uploadedFiles: FileList | null = null;
    if ('files' in e.target) {
      uploadedFiles = (e.target as HTMLInputElement).files;
    } else if ('dataTransfer' in e) {
      e.preventDefault();
      uploadedFiles = (e as React.DragEvent).dataTransfer.files;
    }

    if (uploadedFiles) {
      const newFiles: VideoFile[] = Array.from(uploadedFiles).map(file => ({
        id: Math.random().toString(36).substring(7),
        file,
        name: file.name,
        size: file.size,
        status: 'idle',
        progress: 0,
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.outputUrl) {
        URL.revokeObjectURL(file.outputUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const clearCompleted = () => {
    setFiles(prev => {
      prev.filter(f => f.status === 'done').forEach(f => {
        if (f.outputUrl) URL.revokeObjectURL(f.outputUrl);
      });
      return prev.filter(f => f.status !== 'done');
    });
  };

  const reloadEngine = async () => {
    setFfmpegLoaded(false);
    try {
      await ffmpegRef.current.terminate();
      ffmpegRef.current = new FFmpeg();
      await loadFFmpeg();
      addNotification('Engine Reset', 'The WASM engine has been successfully re-initialized.', 'success');
    } catch (e) {
      console.error('Reload failed:', e);
      addNotification('Reload Error', 'Could not refresh the engine.', 'error');
    }
  };

  const downloadAllAsZip = async () => {
    const finishedFiles = files.filter(f => f.status === 'done' && f.outputUrl);
    if (finishedFiles.length === 0) return;

    if (finishedFiles.length === 1) {
      // Direct download if only one file
      const f = finishedFiles[0];
      const link = document.createElement('a');
      link.href = f.outputUrl!;
      link.download = f.outputName!;
      link.click();
      return;
    }

    const zip = new JSZip();
    const totalSize = finishedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
    
    if (totalSize > 1.5 * 1024 * 1024 * 1024) {
      addNotification('Large Batch Warning', 'Total size exceeds 1.5GB. browser memory limits may cause zip failure. Recommended: Download individually.', 'warning');
    }

    addNotification('Zipping Files', `Compiling ${finishedFiles.length} files...`, 'info');

    try {
      for (const file of finishedFiles) {
        const response = await fetch(file.outputUrl!);
        const blob = await response.blob();
        zip.file(file.outputName!, blob);
      }

      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE', // Use STORE for fast processing of large files
      }, (metadata) => {
        if (metadata.percent % 10 === 0) {
          console.log(`ZIP Progress: ${metadata.percent.toFixed(2)}%`);
        }
      });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = `VeloVideo_Batch_${new Date().getTime()}.zip`;
      link.click();
      URL.revokeObjectURL(url);
      addNotification('Download Ready', 'Batch ZIP has been downloaded.', 'success');
    } catch (e) {
      console.error('ZIP Error:', e);
      addNotification('ZIP Error', 'Failed to create batch archive.', 'error');
    }
  };

  const formatSize = (bytes: number) => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Byte';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFile = async (item: VideoFile) => {
    const ffmpeg = ffmpegRef.current;
    const { task, compressionLevel, extractType, targetFormat, speedMultiplier } = options;
    
    setActiveFileId(item.id);
    setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'processing', progress: 0 } : f));

    ffmpeg.on('progress', ({ progress }) => {
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: progress * 100 } : f));
    });

    try {
      const inputName = 'input_' + item.id + '_' + item.name;
      let outputName = `processed_${item.id}_${item.name}`;
      let args: string[] = [];

      // Write file to wasm filesystem
      await ffmpeg.writeFile(inputName, await fetchFile(item.file));

      switch (activeTask) {
        case 'compress':
          outputName = `compressed_${item.id}_${item.name}`;
          args = ['-i', inputName, '-vcodec', 'libx264', '-crf', compressionLevel.toString(), '-preset', 'ultrafast', outputName]; // Switch to ultrafast for memory/speed
          break;
        case 'extract':
          if (extractType === 'audio') {
            outputName = `${item.id}_${item.name.replace(/\.[^/.]+$/, "")}.mp3`;
            args = ['-i', inputName, '-vn', '-acodec', 'libmp3lame', outputName];
          } else {
            outputName = `video_only_${item.id}_${item.name}`;
            args = ['-i', inputName, '-an', '-vcodec', 'copy', outputName];
          }
          break;
        case 'convert':
          outputName = `${item.id}_${item.name.replace(/\.[^/.]+$/, "")}.${targetFormat}`;
          // Use copy codec if possible for speed and memory efficiency
          args = ['-i', inputName, '-c', 'copy', '-map', '0', outputName];
          break;
        case 'speed':
          outputName = `speed_${speedMultiplier}x_${item.id}_${item.name}`;
          let atempoChain = '';
          let remainingSpeed = speedMultiplier;
          while (remainingSpeed > 2.0) {
            atempoChain += (atempoChain ? ',' : '') + 'atempo=2.0';
            remainingSpeed /= 2.0;
          }
          if (remainingSpeed >= 0.5) {
             if (remainingSpeed > 1) {
              atempoChain += (atempoChain ? ',' : '') + `atempo=${remainingSpeed.toFixed(2)}`;
            } else if (remainingSpeed < 1) {
               atempoChain += (atempoChain ? ',' : '') + `atempo=${remainingSpeed.toFixed(2)}`;
            }
          }
          
          args = [
            '-i', inputName, 
            '-filter_complex', `[0:v]setpts=${(1/speedMultiplier).toFixed(4)}*PTS[v];[0:a]${atempoChain || 'atempo=1.0'}[a]`,
            '-map', '[v]', '-map', '[a]',
            '-vcodec', 'libx264', '-crf', '28', '-preset', 'ultrafast',
            outputName
          ];
          break;
      }

      await ffmpeg.exec(args);

      // Read output
      const data = await ffmpeg.readFile(outputName);
      const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));

      // CLEANUP IMMEDIATELY
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);

      setFiles(prev => prev.map(f => f.id === item.id ? { 
        ...f, 
        status: 'done', 
        progress: 100, 
        outputUrl: url,
        outputName: outputName
      } : f));
    } catch (error) {
      console.error('Processing error:', error);
      const isMemoryError = String(error).includes('memory access out of bounds');
      if (isMemoryError) {
        addNotification('Memory Limit Hit', 'Batch paused to protect engine. Resetting WASM system...', 'warning');
        await reloadEngine(); // Auto-reset on memory failure
      }
      setFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: 'error', message: isMemoryError ? 'Memory Reset' : 'Task failed' } : f));
    } finally {
      setActiveFileId(null);
    }
  };

  const startBatch = async () => {
    if (!ffmpegLoaded) return;
    setIsProcessing(true);
    
    // Filter files that are not done or processing
    const pendingFiles = files.filter(f => f.status === 'idle' || f.status === 'error');
    
    for (const file of pendingFiles) {
      await processFile(file);
    }
    
    setIsProcessing(false);
    addNotification('Batch Complete', `${pendingFiles.length} files processed.`, 'success');
  };

  return (
    <div className="flex h-screen bg-bg text-text-primary overflow-hidden">
      {/* Sidebar Navigation */}
      <aside 
        className={cn(
          "bg-surface border-r border-border flex flex-col transition-all duration-300 z-50",
          isSidebarOpen ? "w-64" : "w-16"
        )}
      >
        <div className="p-4 flex items-center justify-between">
          {isSidebarOpen && (
            <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
              <span className="text-accent italic font-black">V</span>
              <span>VELOVIDEO</span>
            </div>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-bg rounded-lg transition-colors"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 mt-6">
          <div className="px-3 space-y-1">
            {TASKS.map((task) => (
              <button
                key={task.id}
                onClick={() => setActiveTask(task.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-sm",
                  activeTask === task.id 
                    ? "bg-accent/10 text-white border-l-2 border-accent" 
                    : "text-text-secondary hover:bg-bg/50 hover:text-text-primary border-l-2 border-transparent"
                )}
              >
                <task.icon size={18} className={activeTask === task.id ? "text-accent" : ""} />
                {isSidebarOpen && <span className="font-medium">{task.label}</span>}
              </button>
            ))}
          </div>
        </nav>

        {isSidebarOpen && (
          <div className="p-4 mt-auto">
            {typeof SharedArrayBuffer === 'undefined' && (
              <div className="mb-4 p-3 bg-accent/10 border border-accent/20 rounded-xl">
                <p className="text-[10px] text-accent font-bold uppercase mb-1">Preview Warning</p>
                <p className="text-[10px] text-text-secondary leading-tight">
                  Security headers are restricted in the iframe. Please 
                  <span className="text-accent font-bold"> open in a new tab </span> 
                  to enable the WASM engine.
                </p>
              </div>
            )}
            <div className="bg-bg/40 rounded-xl p-3 border border-border">
              <div className="flex items-center justify-between text-xs font-semibold text-text-secondary mb-2">
                <div className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full", ffmpegLoaded ? "bg-success animate-pulse shadow-[0_0_8px_var(--color-success)]" : "bg-warning")} />
                  WASM ENGINE: {ffmpegLoaded ? 'READY' : 'LOADING...'}
                </div>
                {ffmpegLoaded && (
                  <button 
                    onClick={reloadEngine}
                    className="p-1 hover:bg-white/10 rounded transition-colors text-accent flex items-center gap-1"
                    title="Refresh Engine"
                  >
                    <Loader2 size={10} className={cn(isProcessing && "animate-spin")} />
                    Refresh
                  </button>
                )}
              </div>
              {!ffmpegLoaded && <Loader2 className="animate-spin text-accent" size={16} />}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-surface/50 backdrop-blur-md flex items-center justify-between px-8">
          <div>
            <h1 className="text-lg font-semibold">{TASKS.find(t => t.id === activeTask)?.label}</h1>
            <p className="text-xs text-text-secondary">Client-Side Video Studio • Powered by FFmpeg</p>
          </div>
          <div className="flex items-center gap-4">
            <button className="p-2 hover:bg-surface rounded-full transition-colors relative">
               <Bell size={18} className="text-text-secondary" />
               {notifications.length > 0 && <span className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full border-2 border-bg" />}
            </button>
            <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center text-accent">
               <span className="text-xs font-bold">JB</span>
            </div>
          </div>
        </header>

        {/* Workspace Grid */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 p-8 overflow-hidden">
          {/* File Management Area */}
          <div className="flex flex-col gap-6 overflow-hidden">
            {/* Drop Zone */}
            <div 
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileUpload}
              className="group relative h-48 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-4 bg-surface/20 transition-all hover:bg-surface/40 hover:border-accent/40 overflow-hidden"
            >
              <div className="p-4 bg-accent/10 rounded-full text-accent transition-transform group-hover:scale-110">
                <Plus size={24} />
              </div>
              <div className="text-center">
                <p className="font-medium">Drag & Drop videos to batch process</p>
                <p className="text-xs text-text-secondary mt-1 italic">MP4, MOV, WEBM, AVI supported</p>
              </div>
              <input 
                type="file" 
                multiple 
                onChange={handleFileUpload} 
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </div>

            {/* File List */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-bold text-text-secondary uppercase tracking-tighter">Queue ({files.length})</h2>
                {files.some(f => f.status === 'done') && (
                  <button 
                    onClick={clearCompleted}
                    className="text-[10px] text-accent hover:underline flex items-center gap-1"
                  >
                    Clear Completed
                  </button>
                )}
              </div>
              {files.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-text-secondary opacity-40 py-12">
                   <FileVideo size={64} strokeWidth={1} />
                   <p className="mt-4">No files added yet</p>
                </div>
              ) : (
                <AnimatePresence initial={false}>
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -100 }}
                      className={cn(
                        "bg-surface border border-border p-4 rounded-xl group relative overflow-hidden",
                        activeFileId === file.id && "border-accent/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3 overflow-hidden">
                          <div className={cn(
                            "p-2 rounded-lg bg-bg text-accent",
                            file.status === 'processing' && "animate-pulse"
                          )}>
                            <FileVideo size={16} />
                          </div>
                          <div className="truncate">
                            <h3 className="text-sm font-medium truncate max-w-[200px]">{file.name}</h3>
                            <p className="text-[10px] font-mono text-text-secondary">{formatSize(file.size)}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          {file.status === 'done' && file.outputUrl && (
                            <a 
                              href={file.outputUrl} 
                              download={file.outputName}
                              className="p-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                              title="Download processed file"
                            >
                              <Download size={14} />
                            </a>
                          )}
                          <button 
                            disabled={file.status === 'processing'}
                            onClick={() => removeFile(file.id)}
                            className="p-2 hover:bg-red-500/10 hover:text-red-400 text-text-secondary rounded-lg transition-colors disabled:opacity-30"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Progress Bar & Status */}
                      <div className="space-y-2">
                        <div className="h-1 bg-bg rounded-full overflow-hidden">
                          <motion.div 
                            className={cn(
                              "h-full rounded-full transition-all duration-300",
                              file.status === 'done' ? "bg-success shadow-[0_0_8px_var(--color-success)]" : "bg-accent"
                            )}
                            animate={{ width: `${file.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                           <span className={cn(
                             "font-medium",
                             file.status === 'done' && "text-success",
                             file.status === 'error' && "text-red-400",
                             file.status === 'processing' && "text-accent",
                             file.status === 'idle' && "text-text-secondary"
                           )}>
                             {file.status.toUpperCase()}
                             {file.status === 'processing' && `: ${Math.round(file.progress)}%`}
                           </span>
                           {file.status === 'done' && <span className="text-text-secondary italic">Ready for download</span>}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Controls Panel */}
          <aside className="bg-surface border border-border rounded-2xl p-6 flex flex-col gap-8 shadow-2xl relative">
            <div className="flex items-center gap-2 text-text-secondary text-xs uppercase tracking-widest font-bold">
              <Settings size={14} />
              Task Configuration
            </div>

            {/* Task Specific Options */}
            <div className="space-y-6">
              {activeTask === 'compress' && (
                <div className="space-y-4">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Compression CRF (18-51)</label>
                  <div className="bg-bg p-4 rounded-xl space-y-3">
                    <div className="flex justify-between font-mono text-sm text-accent">
                      <span>High Quality</span>
                      <span className="text-xl font-bold">{options.compressionLevel}</span>
                      <span>Small Size</span>
                    </div>
                    <input 
                      type="range" 
                      min="18" 
                      max="51" 
                      step="1"
                      value={options.compressionLevel}
                      onChange={(e) => setOptions({...options, compressionLevel: parseInt(e.target.value)})}
                      className="w-full accent-accent bg-border h-1.5 rounded-full appearance-none cursor-pointer"
                    />
                    <p className="text-[10px] text-text-secondary mt-1">Lower CRF = Higher Quality. Standard is 23-28.</p>
                  </div>
                </div>
              )}

              {activeTask === 'extract' && (
                <div className="space-y-4">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Extraction Mode</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setOptions({...options, extractType: 'audio'})}
                      className={cn(
                        "p-3 rounded-xl border text-sm transition-all",
                        options.extractType === 'audio' ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg/50 border-border text-text-secondary hover:bg-bg"
                      )}
                    >
                      Only Audio (MP3)
                    </button>
                    <button 
                      onClick={() => setOptions({...options, extractType: 'video'})}
                      className={cn(
                        "p-3 rounded-xl border text-sm transition-all",
                        options.extractType === 'video' ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg/50 border-border text-text-secondary hover:bg-bg"
                      )}
                    >
                      Only Video (MP4)
                    </button>
                  </div>
                </div>
              )}

              {activeTask === 'convert' && (
                <div className="space-y-4">
                   <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Target Format</label>
                   <select 
                     value={options.targetFormat}
                     onChange={(e) => setOptions({...options, targetFormat: e.target.value})}
                     className="w-full bg-bg border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                   >
                     <option value="mp4">MP4 Video</option>
                     <option value="webm">WebM Video</option>
                     <option value="mov">QuickTime (MOV)</option>
                     <option value="avi">AVI Video</option>
                   </select>
                </div>
              )}

              {activeTask === 'speed' && (
                <div className="space-y-4">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Playback Acceleration</label>
                  <div className="bg-bg p-4 rounded-xl space-y-4">
                    <div className="flex justify-between font-mono text-sm text-accent items-end">
                      <span>1.2x</span>
                      <span className="text-3xl font-bold leading-none">{options.speedMultiplier}<span className="text-sm font-normal">x</span></span>
                      <span>16x</span>
                    </div>
                    <input 
                      type="range" 
                      min="1.2" 
                      max="16" 
                      step="0.1"
                      value={options.speedMultiplier}
                      onChange={(e) => setOptions({...options, speedMultiplier: parseFloat(e.target.value)})}
                      className="w-full accent-accent bg-border h-1.5 rounded-full appearance-none cursor-pointer"
                    />
                    <div className="flex items-center gap-2 p-2 bg-accent/5 rounded-lg border border-accent/10">
                      <Volume2 size={12} className="text-accent shrink-0" />
                      <p className="text-[9px] text-text-secondary leading-tight uppercase font-medium">
                        Pitch-corrected audio using multi-chained atempo filters
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-auto pt-6 border-t border-border space-y-4">
               <div className="space-y-2">
                 <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Batch Mode</span>
                    <span className="font-bold text-accent">ACTIVE</span>
                 </div>
                 <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Selected Files</span>
                    <span className="font-bold">{files.filter(f => f.status === 'idle' || f.status === 'error').length}</span>
                 </div>
               </div>

               <button
                 disabled={!ffmpegLoaded || isProcessing || files.filter(f => f.status === 'idle' || f.status === 'error').length === 0}
                 onClick={startBatch}
                 className={cn(
                   "w-full py-4 rounded-xl font-bold text-sm tracking-widest transition-all flex items-center justify-center gap-3",
                   isProcessing 
                     ? "bg-bg text-accent cursor-wait border border-accent/40" 
                     : "bg-accent hover:bg-accent/90 shadow-[0_4px_20px_rgba(59,130,246,0.3)] active:scale-95 disabled:bg-bg disabled:text-text-secondary disabled:shadow-none disabled:active:scale-100 disabled:opacity-50"
                 )}
               >
                 {isProcessing ? (
                   <>
                     <Loader2 className="animate-spin" size={20} />
                     PROCESSING...
                   </>
                 ) : (
                   <>
                     <Play size={20} fill="currentColor" />
                     START BATCH PROCESS
                   </>
                 )}
               </button>

               {files.some(f => f.status === 'done') && (
                 <button
                   onClick={downloadAllAsZip}
                   className="w-full py-3 rounded-xl border border-accent text-accent font-bold text-xs tracking-widest hover:bg-accent/10 transition-all flex items-center justify-center gap-2"
                 >
                   <Download size={16} />
                   DOWNLOAD BATCH (ZIP)
                 </button>
               )}
            </div>
          </aside>
        </div>

        {/* Notification Toasts - Moved to top to avoid blocking controls */}
        <div className="absolute top-20 right-6 flex flex-col gap-3 pointer-events-none w-80 z-[100]">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: 50, scale: 0.9 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className="pointer-events-auto bg-surface border border-border shadow-[0_10px_40px_rgba(0,0,0,0.5)] p-4 rounded-2xl flex items-start gap-3 relative overflow-hidden"
              >
                <div className={cn(
                  "p-2 rounded-lg shrink-0",
                  notif.type === 'success' ? "bg-success/20 text-success" : 
                  notif.type === 'error' ? "bg-red-500/20 text-red-400" : 
                  notif.type === 'warning' ? "bg-warning/20 text-warning" :
                  "bg-accent/20 text-accent"
                )}>
                  {notif.type === 'success' ? <CheckCircle size={18} /> : 
                   notif.type === 'error' ? <AlertCircle size={18} /> : 
                   notif.type === 'warning' ? <AlertCircle size={18} className="text-warning" /> :
                   <Bell size={18} />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-sm font-bold">{notif.title}</h4>
                  <p className="text-xs text-text-secondary truncate">{notif.message}</p>
                </div>
                <div className={cn(
                  "absolute bottom-0 left-0 h-1 bg-current opacity-20",
                  notif.type === 'success' ? "text-success" : 
                  notif.type === 'error' ? "text-red-400" : 
                  notif.type === 'warning' ? "text-warning" :
                  "text-accent"
                )} style={{ width: '100%' }} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
