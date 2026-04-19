# VeloVideo Studio 🎬
A high-performance, client-side video processing toolkit powered by FFmpeg.wasm.

### Key Features
- **Batch Compression**: Reduce video sizes using H.264 (CRF controlled).
- **Media Extractor**: Batch extract audio to MP3 or isolate video streams.
- **Format Converter**: Batch container conversion (MP4, WebM, MOV, AVI).
- **Variable Speed FX**: 1.2x to 16x acceleration with pitch-corrected audio.
- **Privacy First**: All processing happens in your browser. No files are uploaded to any server.
- **Batch ZIP Exports**: Compiles processed results into a single archive for one-click downloading.

### Tech Stack
- **Frontend**: React 19 + TypeScript + Tailwind CSS
- **Engine**: FFmpeg.wasm (WebAssembly)
- **Styling**: Elegant Dark Theme with Motion (Framer Motion)
- **Backend / Proxy**: Express (providing COOP/COEP security headers)

### Local Development
1. `npm install`
2. `npm run dev` (Runs the custom Express + Vite server)
3. Open `http://localhost:3000`

*Note: Requires a browser that supports SharedArrayBuffer (Chrome, Edge, Firefox).*
