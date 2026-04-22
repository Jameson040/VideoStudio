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
  Bell,
  Scissors,
  Image,
  Repeat,
  RotateCw,
  ArrowLeftRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import type { TaskType, VideoFile, ProcessingOptions, Notification } from './types';

const TASKS: { id: TaskType; label: string; icon: any; description: string }[] = [
  { id: 'compress', label: 'Video Compressor', icon: Maximize, description: 'Batch reduce file size & scale resolution' },
  { id: 'extract', label: 'Media Extractor', icon: Volume2, description: 'Batch extract audio or video streams' },
  { id: 'slice', label: 'Clip Slicer', icon: Scissors, description: 'Lossless splitting or range extraction' },
  { id: 'gif', label: 'GIF Maker', icon: Image, description: 'High-quality 2-pass GIF generation' },
  { id: 'convert', label: 'Format Converter', icon: Layers, description: 'Batch change container formats' },
  { id: 'speed', label: 'Variable Speed', icon: Zap, description: 'Batch playback acceleration with pitch sync' },
  { id: 'transform', label: 'Video Transform', icon: RotateCw, description: 'Loop, Rotate, Flip, or Reverse videos' },
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
    compressionLevel: 28,
    resolution: 'original',
    extractType: 'audio',
    targetFormat: 'mp4',
    speedMultiplier: 2.0,
    gifFps: 10,
    gifWidth: 480,
    sliceMode: 'range',
    splitInterval: 600,
    rangeStart: '00:00:00',
    rangeEnd: '00:01:00',
    rotation: '0',
    flip: 'none',
    loopCount: 2,
    reverse: false,
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
    const finishedFiles = files.filter(f => f.status === 'done' && (f.outputUrl || f.isMultiOutput));
    if (finishedFiles.length === 0) return;

    // Single file download (if not multi-output)
    if (finishedFiles.length === 1 && !finishedFiles[0].isMultiOutput) {
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
      addNotification('Large Batch Warning', 'Total size exceeds 1.5GB. Browser memory limits may cause zip failure. Recommended: Download individually.', 'warning');
    }

    addNotification('Zipping Files', `Compiling results into a single ZIP...`, 'info');

    try {
      for (const file of finishedFiles) {
        if (file.isMultiOutput && file.outputUrls) {
          for (const out of file.outputUrls) {
            const response = await fetch(out.url);
            const blob = await response.blob();
            zip.file(out.name, blob);
          }
        } else if (file.outputUrl) {
          const response = await fetch(file.outputUrl);
          const blob = await response.blob();
          zip.file(file.outputName!, blob);
        }
      }

      const content = await zip.generateAsync({ 
        type: 'blob',
        compression: 'STORE',
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
    const { 
      compressionLevel, 
      resolution, 
      extractType, 
      targetFormat, 
      speedMultiplier,
      gifFps,
      gifWidth,
      sliceMode,
      splitInterval,
      rangeStart,
      rangeEnd,
      rotation,
      flip,
      loopCount,
      reverse 
    } = options;
    
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
          const scaleFilter = resolution === 'original' ? '' : `,scale=${resolution === '4k' ? '3840' : resolution === '1080p' ? '1920' : resolution === '720p' ? '1280' : '854'}:-1`;
          args = ['-i', inputName, '-vf', `format=yuv420p${scaleFilter}`, '-vcodec', 'libx264', '-crf', compressionLevel.toString(), '-preset', 'ultrafast', outputName];
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
        case 'slice':
          if (sliceMode === 'range') {
            outputName = `clip_${item.id}_${item.name}`;
            // Use -avoid_negative_ts make_zero to ensure the output starts at 00:00:00
            args = ['-i', inputName, '-ss', rangeStart, '-to', rangeEnd, '-c', 'copy', '-avoid_negative_ts', 'make_zero', outputName];
          } else {
            // Split mode
            outputName = `${item.id}_part_%03d_${item.name}`;
            // -reset_timestamps 1 ensures each segment starts at 0
            args = ['-i', inputName, '-f', 'segment', '-segment_time', splitInterval.toString(), '-reset_timestamps', '1', '-c', 'copy', outputName];
          }
          break;
        case 'gif':
          outputName = `processed_${item.id}_${item.name.replace(/\.[^/.]+$/, "")}.gif`;
          // 2-pass palette generation for HQ GIF
          const paletteName = 'palette.png';
          const gifFilter = `fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos`;
          
          await ffmpeg.exec(['-i', inputName, '-vf', `${gifFilter},palettegen`, paletteName]);
          args = ['-i', inputName, '-i', paletteName, '-filter_complex', `[0:v]${gifFilter}[x];[x][1:v]paletteuse`, outputName];
          break;
        case 'convert':
          outputName = `${item.id}_${item.name.replace(/\.[^/.]+$/, "")}.${targetFormat}`;
          args = ['-i', inputName, '-c', 'copy', '-map', '0', outputName];
          break;
        case 'speed':
          outputName = `speed_${item.id}_${item.name}`;
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
        case 'transform':
          outputName = `transformed_${item.id}_${item.name}`;
          const filters: string[] = [];
          if (rotation !== '0') filters.push(rotation === '90' ? 'transpose=1' : rotation === '180' ? 'transpose=2,transpose=2' : 'transpose=2');
          if (flip === 'h' || flip === 'both') filters.push('hflip');
          if (flip === 'v' || flip === 'both') filters.push('vflip');
          if (reverse) filters.push('reverse'); // Note: reverse is heavy
          
          const vf = filters.length > 0 ? ['-vf', filters.join(',')] : [];
          
          if (loopCount > 1) {
            args = ['-stream_loop', (loopCount - 1).toString(), '-i', inputName, ...vf, '-vcodec', 'libx264', '-preset', 'ultrafast', outputName];
          } else {
            args = ['-i', inputName, ...vf, '-vcodec', 'libx264', '-preset', 'ultrafast', outputName];
          }
          break;
      }

      const result = await ffmpeg.exec(args);

      if (activeTask === 'slice' && sliceMode === 'split') {
        // Find all files matching the pattern
        const list = await ffmpeg.listDir('.');
        const parts = list.filter(f => !f.isDir && f.name.startsWith(`${item.id}_part_`));
        
        const outputs = await Promise.all(parts.map(async (p) => {
          const d = await ffmpeg.readFile(p.name);
          const u = URL.createObjectURL(new Blob([(d as any).buffer], { type: 'video/mp4' }));
          await ffmpeg.deleteFile(p.name);
          return { name: p.name.replace(`${item.id}_`, ''), url: u };
        }));

        await ffmpeg.deleteFile(inputName);
        
        setFiles(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: 'done', 
          progress: 100, 
          isMultiOutput: true,
          outputUrls: outputs
        } : f));

      } else {
        // Read output
        const data = await ffmpeg.readFile(outputName);
        const url = URL.createObjectURL(new Blob([(data as any).buffer], { type: 'video/mp4' }));

        // CLEANUP IMMEDIATELY
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        if (activeTask === 'gif') await ffmpeg.deleteFile('palette.png');

        setFiles(prev => prev.map(f => f.id === item.id ? { 
          ...f, 
          status: 'done', 
          progress: 100, 
          outputUrl: url,
          outputName: outputName
        } : f));
      }
    } catch (error) {
      console.error('Processing error:', error);
      const isMemoryError = String(error).includes('memory access out of bounds');
      if (isMemoryError) {
        addNotification('Memory Limit Hit', 'Batch paused to protect engine. Resetting WASM system...', 'warning');
        await reloadEngine();
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
    <div className="flex h-screen bg-bg text-text-primary overflow-hidden relative">
      {/* Sidebar Navigation */}
      <aside 
        className={cn(
          "bg-surface border-r border-border flex flex-col transition-all duration-300 z-[70] h-full shadow-2xl overflow-hidden",
          "fixed lg:relative",
          isSidebarOpen ? "w-72 translate-x-0" : "w-72 lg:w-20 -translate-x-full lg:translate-x-0"
        )}
      >
        <div className="p-6 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 font-bold text-xl tracking-tight overflow-hidden whitespace-nowrap">
            <span className="text-accent italic font-black text-2xl shrink-0">V</span>
            <span className={cn(
              "transition-all duration-300 origin-left truncate",
              isSidebarOpen ? "opacity-100 scale-100" : "opacity-0 scale-95 lg:hidden"
            )}>
              VELOVIDEO
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-bg rounded-xl transition-colors lg:hidden shrink-0"
          >
            <X size={20} />
          </button>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-bg rounded-xl transition-colors hidden lg:block shrink-0"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 mt-4 overflow-y-auto overflow-x-hidden pt-2">
          <div className="px-4 space-y-2">
            {TASKS.map((task) => (
              <button
                key={task.id}
                onClick={() => {
                  setActiveTask(task.id);
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all text-sm group relative",
                  activeTask === task.id 
                    ? "bg-accent/15 text-white ring-1 ring-accent/30" 
                    : "text-text-secondary hover:bg-bg/60 hover:text-text-primary"
                )}
              >
                <div className={cn(
                  "shrink-0 transition-transform group-hover:scale-110",
                  activeTask === task.id ? "text-accent" : "text-text-secondary"
                )}>
                  <task.icon size={20} />
                </div>
                <span className={cn(
                  "font-semibold transition-all duration-300 truncate",
                  isSidebarOpen ? "opacity-100 translate-x-0" : "lg:opacity-0 lg:-translate-x-2 lg:hidden"
                )}>
                  {task.label}
                </span>
                {activeTask === task.id && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute left-0 w-1 h-6 bg-accent rounded-r-full"
                  />
                )}
              </button>
            ))}
          </div>
        </nav>

        {isSidebarOpen && (
          <div className="p-4 mt-auto border-t border-border">
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
                  {ffmpegLoaded ? 'WASM READY' : 'LOADING...'}
                </div>
                {ffmpegLoaded && (
                  <button 
                    onClick={reloadEngine}
                    className="p-1 hover:bg-white/10 rounded transition-colors text-accent flex items-center gap-1"
                    title="Refresh Engine"
                  >
                    <Loader2 size={10} className={cn(isProcessing && "animate-spin")} />
                  </button>
                )}
              </div>
              {!ffmpegLoaded && <div className="h-1 bg-border rounded-full overflow-hidden"><div className="h-full bg-accent animate-shimmer w-1/2" /></div>}
            </div>
          </div>
        )}
      </aside>

      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[55] lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative min-w-0 overflow-hidden h-full">
        {/* Header */}
        <header className="h-20 border-b border-border bg-bg/80 backdrop-blur-xl flex items-center justify-between px-6 lg:px-10 shrink-0 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className={cn(
                "p-2.5 hover:bg-surface rounded-xl lg:hidden transition-all active:scale-95",
                isSidebarOpen ? "opacity-0 pointer-events-none" : "opacity-100"
              )}
            >
              <Menu size={22} />
            </button>
            <div className="min-w-0">
              <h1 className="text-base lg:text-xl font-bold tracking-tight text-white/90">
                {TASKS.find(t => t.id === activeTask)?.label}
              </h1>
              <p className="text-[10px] text-text-secondary uppercase tracking-[0.2em] font-medium hidden sm:block mt-0.5">FFmpeg Studio Engine</p>
            </div>
          </div>
          <div className="flex items-center gap-3 lg:gap-6">
            <button className="p-2.5 hover:bg-surface rounded-xl transition-all relative group">
               <Bell size={20} className="text-text-secondary group-hover:text-white" />
               {notifications.length > 0 && <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-accent rounded-full border-2 border-bg" />}
            </button>
            <div className="flex items-center gap-3 pl-4 border-l border-border/50">
               <div className="text-right hidden sm:block">
                 <p className="text-[10px] font-bold text-white/80 leading-none">James B.</p>
                 <p className="text-[9px] text-accent font-medium mt-1">PRO USER</p>
               </div>
               <div className="w-10 h-10 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent shrink-0 shadow-lg shadow-accent/5">
                 <span className="text-sm font-black">JB</span>
               </div>
            </div>
          </div>
        </header>

        {/* Workspace Area - Scrollable */}
        <div className="flex-1 overflow-y-auto lg:overflow-hidden">
          <div className="h-full grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 lg:gap-8 p-4 lg:p-8">
            {/* File Management Area */}
            <div className="flex flex-col gap-6 min-w-0 h-full lg:overflow-hidden">
              {/* Drop Zone */}
              <div 
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleFileUpload}
                className="group relative h-32 lg:h-48 border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center gap-2 lg:gap-4 bg-surface/20 transition-all hover:bg-surface/40 hover:border-accent/40 overflow-hidden shrink-0"
              >
                <div className="p-2 lg:p-4 bg-accent/10 rounded-full text-accent transition-transform group-hover:scale-110">
                  <Plus size={window.innerWidth < 1024 ? 20 : 24} />
                </div>
                <div className="text-center px-4">
                  <p className="font-medium text-xs lg:text-base">Upload or Drag Videos</p>
                  <p className="text-[10px] text-text-secondary mt-1 hidden sm:block">MP4, MOV, WEBM, AVI supported</p>
                </div>
                <input 
                  type="file" 
                  multiple 
                  onChange={handleFileUpload} 
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </div>

              {/* File List */}
              <div className="flex-1 lg:overflow-y-auto pr-0 lg:pr-2 space-y-4 min-h-[200px]">
                <div className="flex items-center justify-between sticky top-0 bg-bg/80 backdrop-blur-sm py-1 z-10">
                  <h2 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Queue ({files.length})</h2>
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
                  <div className="flex flex-col items-center justify-center h-full text-text-secondary opacity-40 py-12 lg:py-0">
                     <FileVideo size={window.innerWidth < 1024 ? 48 : 64} strokeWidth={1} />
                     <p className="mt-4 text-sm">No files added yet</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {files.map((file) => (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "bg-surface border border-border p-3 lg:p-4 rounded-xl group relative overflow-hidden",
                          activeFileId === file.id && "border-accent/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]"
                        )}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={cn(
                              "p-2 rounded-lg bg-bg text-accent shrink-0",
                              file.status === 'processing' && "animate-pulse"
                            )}>
                              <FileVideo size={14} />
                            </div>
                            <div className="truncate pr-2">
                              <h3 className="text-xs lg:text-sm font-medium truncate">{file.name}</h3>
                              <p className="text-[9px] lg:text-[10px] font-mono text-text-secondary">{formatSize(file.size)}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 lg:gap-2 shrink-0">
                            {file.status === 'done' && (file.outputUrl || file.isMultiOutput) && (
                              <button 
                                onClick={() => {
                                  if (file.isMultiOutput) {
                                    downloadAllAsZip(); 
                                  } else {
                                    const link = document.createElement('a');
                                    link.href = file.outputUrl!;
                                    link.download = file.outputName!;
                                    link.click();
                                  }
                                }}
                                className="p-1.5 lg:p-2 bg-success/10 text-success rounded-lg hover:bg-success/20 transition-colors"
                                title="Download"
                              >
                                <Download size={12} lg:size={14} />
                              </button>
                            )}
                            <button 
                              disabled={file.status === 'processing'}
                              onClick={() => removeFile(file.id)}
                              className="p-1.5 lg:p-2 hover:bg-red-500/10 hover:text-red-400 text-text-secondary rounded-lg transition-colors disabled:opacity-30"
                            >
                              <Trash2 size={12} lg:size={14} />
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

                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest mt-4 block">Resize Output</label>
                  <select 
                    value={options.resolution}
                    onChange={(e) => setOptions({...options, resolution: e.target.value as any})}
                    className="w-full bg-bg border border-border rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    <option value="original">Original Size</option>
                    <option value="4k">4K (3840px)</option>
                    <option value="1080p">1080p (1920px)</option>
                    <option value="720p">720p (1280px)</option>
                    <option value="480p">480p (854px)</option>
                  </select>
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

              {activeTask === 'slice' && (
                <div className="space-y-4">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Slicing Method</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => setOptions({...options, sliceMode: 'range'})}
                      className={cn(
                        "p-3 rounded-xl border text-sm transition-all",
                        options.sliceMode === 'range' ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg/50 border-border text-text-secondary hover:bg-bg"
                      )}
                    >
                      Custom Range
                    </button>
                    <button 
                      onClick={() => setOptions({...options, sliceMode: 'split'})}
                      className={cn(
                        "p-3 rounded-xl border text-sm transition-all",
                        options.sliceMode === 'split' ? "bg-accent/10 border-accent/40 text-accent" : "bg-bg/50 border-border text-text-secondary hover:bg-bg"
                      )}
                    >
                      Auto Split
                    </button>
                  </div>

                  {options.sliceMode === 'range' ? (
                    <div className="space-y-3 p-4 bg-bg rounded-xl">
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-text-secondary">Start Time</label>
                        <input 
                          type="text" 
                          placeholder="00:00:00"
                          value={options.rangeStart}
                          onChange={(e) => setOptions({...options, rangeStart: e.target.value})}
                          className="w-full bg-surface border border-border p-2 rounded-lg text-xs font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] uppercase font-bold text-text-secondary">End Time</label>
                        <input 
                          type="text" 
                          placeholder="00:01:00"
                          value={options.rangeEnd}
                          onChange={(e) => setOptions({...options, rangeEnd: e.target.value})}
                          className="w-full bg-surface border border-border p-2 rounded-lg text-xs font-mono"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3 p-4 bg-bg rounded-xl">
                      <label className="text-[9px] uppercase font-bold text-text-secondary">Split Every (Seconds)</label>
                      <input 
                        type="number" 
                        value={options.splitInterval}
                        onChange={(e) => setOptions({...options, splitInterval: parseInt(e.target.value)})}
                        className="w-full bg-surface border border-border p-2 rounded-lg text-xs font-mono"
                      />
                      <p className="text-[9px] text-text-secondary italic">Lossless slicing cuts at the nearest keyframe.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTask === 'gif' && (
                <div className="space-y-4">
                  <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">GIF Quality Settings</label>
                  <div className="bg-bg p-4 rounded-xl space-y-4">
                    <div className="space-y-2">
                       <div className="flex justify-between text-[10px] uppercase font-bold text-text-secondary">
                         <span>Frame Rate</span>
                         <span className="text-accent">{options.gifFps} fps</span>
                       </div>
                       <input 
                        type="range" min="5" max="30" step="1"
                        value={options.gifFps}
                        onChange={(e) => setOptions({...options, gifFps: parseInt(e.target.value)})}
                        className="w-full accent-accent bg-border h-1 rounded-full appearance-none"
                       />
                    </div>
                    <div className="space-y-2">
                       <div className="flex justify-between text-[10px] uppercase font-bold text-text-secondary">
                         <span>Output Width</span>
                         <span className="text-accent">{options.gifWidth}px</span>
                       </div>
                       <input 
                        type="range" min="160" max="1080" step="20"
                        value={options.gifWidth}
                        onChange={(e) => setOptions({...options, gifWidth: parseInt(e.target.value)})}
                        className="w-full accent-accent bg-border h-1 rounded-full appearance-none"
                       />
                    </div>
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
                     <option value="mkv">Matroska (MKV)</option>
                     <option value="flv">Flash Video (FLV)</option>
                     <option value="wmv">Windows Media (WMV)</option>
                   </select>
                </div>
              )}

              {activeTask === 'transform' && (
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Orientation</label>
                    <div className="grid grid-cols-2 gap-2">
                      <select 
                        value={options.rotation}
                        onChange={(e) => setOptions({...options, rotation: e.target.value as any})}
                        className="bg-bg border border-border rounded-lg p-2 text-xs"
                      >
                         <option value="0">No Rotation</option>
                         <option value="90">Rotate 90° CW</option>
                         <option value="180">Rotate 180°</option>
                         <option value="270">Rotate 90° CCW</option>
                      </select>
                      <select 
                        value={options.flip}
                        onChange={(e) => setOptions({...options, flip: e.target.value as any})}
                        className="bg-bg border border-border rounded-lg p-2 text-xs"
                      >
                         <option value="none">No Flip</option>
                         <option value="h">Flip Horizontal</option>
                         <option value="v">Flip Vertical</option>
                         <option value="both">Flip Both</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] uppercase font-bold text-text-secondary tracking-widest">Loop Settings</label>
                    <div className="flex items-center gap-4 bg-bg p-3 rounded-xl">
                      <Repeat size={16} className="text-accent" />
                      <input 
                        type="number" min="1" max="50"
                        value={options.loopCount}
                        onChange={(e) => setOptions({...options, loopCount: parseInt(e.target.value)})}
                        className="bg-transparent border-none text-sm w-full focus:outline-none"
                      />
                      <span className="text-[10px] text-text-secondary">TIMES</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => setOptions({...options, reverse: !options.reverse})}
                    className={cn(
                      "w-full flex items-center justify-center gap-3 p-3 rounded-xl border transition-all text-xs font-bold",
                      options.reverse ? "bg-accent/10 border-accent text-accent" : "bg-bg/50 border-border text-text-secondary"
                    )}
                  >
                    <ArrowLeftRight size={14} />
                    {options.reverse ? 'REVERSING ACTIVE' : 'ENABLE REVERSE'}
                  </button>
                  {options.reverse && (
                    <p className="text-[9px] text-warning italic text-center">Note: Reversing large files is memory intensive.</p>
                  )}
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

              {/* Action Buttons - Fixed for Mobile accessibility */}
              <div className="mt-auto pt-4 border-t border-border space-y-3">
                 <div className="flex items-center justify-between text-[10px] px-1">
                    <span className="text-text-secondary">Queue Size</span>
                    <span className="font-bold text-accent">{files.filter(f => f.status === 'idle' || f.status === 'error').length} Files</span>
                 </div>

                 <button
                   disabled={!ffmpegLoaded || isProcessing || files.filter(f => f.status === 'idle' || f.status === 'error').length === 0}
                   onClick={startBatch}
                   className={cn(
                     "w-full py-3.5 lg:py-4 rounded-xl font-bold text-xs lg:text-sm tracking-widest transition-all flex items-center justify-center gap-3",
                     isProcessing 
                       ? "bg-bg text-accent border border-accent/40" 
                       : "bg-accent hover:bg-accent/90 shadow-xl active:scale-[0.98] disabled:opacity-40"
                   )}
                 >
                   {isProcessing ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} fill="currentColor" />}
                   {isProcessing ? 'PROCESSING...' : 'START BATCH'}
                 </button>

                 {files.some(f => f.status === 'done') && (
                   <button
                     onClick={downloadAllAsZip}
                     className="w-full py-2.5 lg:py-3 rounded-xl border border-accent/50 text-accent font-bold text-[10px] lg:text-xs tracking-widest hover:bg-accent/10 transition-all flex items-center justify-center gap-2"
                   >
                     <Download size={14} />
                     DOWNLOAD ALL (ZIP)
                   </button>
                 )}
              </div>
            </aside>
          </div>
        </div>

        {/* Global Progress Indicator (Mobile Only) */}
        {isProcessing && (
          <div className="fixed bottom-0 left-0 right-0 h-1 bg-bg z-[100] lg:hidden">
            <div className="h-full bg-accent animate-pulse w-full origin-left" style={{ scaleX: 0.5 }} />
          </div>
        )}

        {/* Notification Container */}
        <div className="absolute top-20 right-4 lg:right-6 flex flex-col gap-3 pointer-events-none w-[85vw] sm:w-80 z-[100]">
          <AnimatePresence>
            {notifications.map((notif) => (
              <motion.div
                key={notif.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="pointer-events-auto bg-surface/95 backdrop-blur-md border border-border shadow-2xl p-3 lg:p-4 rounded-2xl flex items-start gap-3"
              >
                <div className={cn(
                  "p-2 rounded-lg",
                  notif.type === 'success' ? "bg-success/20 text-success" : 
                  notif.type === 'error' ? "bg-red-500/20 text-red-400" : "bg-accent/20 text-accent"
                )}>
                  {notif.type === 'success' ? <CheckCircle size={16} /> : <Bell size={16} />}
                </div>
                <div className="flex-1 overflow-hidden">
                  <h4 className="text-xs lg:text-sm font-bold">{notif.title}</h4>
                  <p className="text-[10px] text-text-secondary truncate">{notif.message}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
