export type TaskType = 'compress' | 'extract' | 'convert' | 'speed' | 'gif' | 'slice' | 'transform';

export interface VideoFile {
  id: string;
  file: File;
  name: string;
  size: number;
  status: 'idle' | 'processing' | 'done' | 'error';
  progress: number;
  message?: string;
  outputUrl?: string;
  outputName?: string;
  isMultiOutput?: boolean;
  outputUrls?: { name: string; url: string }[];
}

export interface ProcessingOptions {
  task: TaskType;
  // Compress
  compressionLevel: number;
  resolution: 'original' | '4k' | '1080p' | '720p' | '480p';
  // Extract / Convert
  extractType: 'audio' | 'video' | 'both';
  targetFormat: string;
  // Speed
  speedMultiplier: number;
  // GIF
  gifFps: number;
  gifWidth: number;
  // Slice
  sliceMode: 'split' | 'range';
  splitInterval: number; // in seconds
  rangeStart: string; // HH:MM:SS
  rangeEnd: string; // HH:MM:SS
  // Transform
  rotation: '0' | '90' | '180' | '270';
  flip: 'none' | 'h' | 'v' | 'both';
  loopCount: number;
  reverse: boolean;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}
