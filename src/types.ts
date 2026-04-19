export type TaskType = 'compress' | 'extract' | 'convert' | 'speed';

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
}

export interface ProcessingOptions {
  task: TaskType;
  compressionLevel: number; // 0-100
  extractType: 'audio' | 'video' | 'both';
  targetFormat: string;
  speedMultiplier: number; // 1.2 to 16
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}
