# Director AI Video Editor 🎬🤖

**Director AI Video Editor** is a lightweight, zero-infrastructure, browser-based AI video editor. Designed for non-technical content creators, it allows you to edit videos using simple, natural language prompts directly in your web browser. 

Say goodbye to complex timelines and heavy server rendering—let the AI do the heavy lifting locally!

---

## ✨ Features

- **Chat-First Interface**: A massive, premium dark-mode chat interface replaces the traditional complex non-linear editor (NLE) sidebar. Just tell the AI what you want to do!
- **Zero-Infrastructure Processing**: Uses the incredibly powerful `FFmpeg.wasm` engine to compile and execute video edits entirely client-side. No backend server, no upload limits, and maximum privacy.
- **Natural Language Parsing**: (Simulated via Mock LLM) Translates natural language prompts—like *"Trim the silences"* or *"Make it vertical for TikTok"*—into rigid JSON payloads to control the FFmpeg underlying layer.
- **Real-Time Client Feedback**: Visual loading states and on-the-fly replacement of the `video.src` object URL when the local processing completes.
- **Fast Local Exports**: Download the newly minted, edited MP4 file straight from the browser's memory buffer.

## 🚀 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Installation & Run Locally

1. **Clone the Repo:**
   ```bash
   git clone https://github.com/girijesh18/DirectorAI.git
   cd DirectorAI
   ```

2. **Install Dependencies:**
   ```bash
   npm install
   ```

3. **Start the Development Server:**
   ```bash
   npm run dev
   ```

4. **Experience the Magic:**
   Open your browser to `http://localhost:5173`. Wait a few seconds for the "WASM Engine Ready" indicator in the top right. 
   Upload an `.mp4`, type a prompt like *"Trim it"*, and watch the magic happen in-browser!

## 🛠️ Built With

- **React + Vite**: For blazing fast HMR and responsive component structure.
- **Vanilla CSS**: Fully custom, premium dark-mode styling with a responsive UI.
- **@ffmpeg/ffmpeg**: The core magic. Compiles C logic into WebAssembly to execute heavy multimedia processing in the browser sandbox.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
