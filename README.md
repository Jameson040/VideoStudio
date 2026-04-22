# VeloVideo Studio 🎬
A high-performance, professional-grade processing toolkit for batch video manipulation—built entirely for the browser. No uploads, no subscriptions, just pure FFmpeg power in your tab.

## 🚀 Key Toolsets

### 1. 🎞️ Video Compressor (with Scaling)
- **Batch Processing**: Squeeze dozens of videos simultaneously.
- **Resolution Downscaling**: Optionally scale 4K/8K footage down to 1080p, 720p, or 480p to save massive space.
- **CRF Control**: Intelligent H.264 encoding that balances quality and size.

### 2. ✂️ Clip Slicer & Extractor
- **Lossless Cutting**: Splitting videos without re-encoding to keep processing near-instant.
- **Smart Slicing**: Automatically split long videos (e.g., 2 hours) into equal segments (e.g., 10-minute clips).
- **Range Extraction**: Select specific Start/End times to extract only the highlights you need.

### 3. 🖼️ Video to GIF Maker
- **High Quality**: Uses 2-pass encoding with high-fidelity color palettes.
- **Customizable**: Control frame rates and resolution for the perfect social media loop.
- **Batch GIF**: Convert an entire directory of clips to GIFs in one go.

### 4. 🔈 Media Extractor
- **Audio Rip**: Batch extract sound to high-quality MP3 or AAC.
- **Stream Isolation**: Isolate video streams by stripping audio entirely.

### 5. ⚡ Variable Speed FX
- **Extreme Range**: Accelerate footage from 1.2x up to 16x.
- **Audio Sync**: Uses multi-chained `atempo` filters to ensure high-speed audio stays pitch-corrected and intelligible.

### 6. 🔄 Video Transform & Loop
- **Creative Loops**: Repeat segments up to 50 times (great for cinemagraphs).
- **Spatial Transforms**: Batch Rotate (90/180/270), Flip (Horizontal/Vertical).
- **Reversing**: Full frame-reversal for unique visual effects (memory optimized).

### 7. 📦 Format Converter
- **Broad Compatibility**: Batch switch between MP4, MKV, MOV, and WebM containers.

---

## 🛡️ Privacy & Security
- **100% Client-Side**: All video processing happens in your local browser memory using **FFmpeg WASM**.
- **Zero Uploads**: Your private videos never leave your computer.
- **Secure Sandbox**: Operates within a COOP/COEP secured context for safe multithreading.

## 🛠️ Tech Stack
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS + Framer Motion (Adaptive Dark Design)
- **Engine**: FFmpeg.wasm (Multithreaded WebAssembly)
- **Deployment**: Optimized for standard Node.js environments with custom headers.

## 💻 Local Development
1. Clone the repository.
2. Install dependencies: `npm install`
3. Start the secure dev server: `npm run dev`
4. Access the app at `http://localhost:3000`

---
*Developed with ❤️ and FFmpeg.*
