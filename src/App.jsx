import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { parseEditorCommand } from './services/llmMock';
import './App.css';

function App() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! I am your AI Video Editor. Upload a video and just tell me what you want to change (e.g. "trim the first 5 seconds").' }
  ]);
  const [inputText, setInputText] = useState('');
  
  // Video & Engine State
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ffmpegLoaded, setFfmpegLoaded] = useState(false);
  
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(new FFmpeg());
  const messageEndRef = useRef(null);

  // Auto-scroll chat
  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load FFmpeg via CDN on mount
  useEffect(() => {
    const loadFFmpeg = async () => {
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      const ffmpeg = ffmpegRef.current;
      
      ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      try {
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
        setFfmpegLoaded(true);
      } catch (err) {
        console.error("FFmpeg load failed", err);
        setMessages(prev => [...prev, { role: 'system-action', text: 'Error: Could not load FFmpeg engine.' }]);
      }
    };
    loadFFmpeg();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      
      // We will grab duration once the video loads its metadata
      
      setMessages(prev => [
        ...prev, 
        { role: 'system-action', text: `Loaded video: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)` }
      ]);
    }
  };

  const processVideoWithFFmpeg = async (commands) => {
    if (!ffmpegLoaded) {
       setMessages(prev => [...prev, { role: 'ai', text: 'Engine is still loading, please wait a moment...' }]);
       return;
    }
    
    setIsProcessing(true);
    const ffmpeg = ffmpegRef.current;
    
    // 1. Write file to ffmpeg memory
    const inputFileName = 'input.mp4';
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoFile));

    // 2. We only handle the first command for MVP demo
    const task = commands[0];
    const outputName = 'output.mp4';
    
    setMessages(prev => [...prev, { role: 'system-action', text: `[FFmpeg] Executing action: ${task.action}...` }]);

    try {
        if (task.action === 'trim') {
           // Direct stream copy for instant, lossless trim
           await ffmpeg.exec([
             '-i', inputFileName,
             '-ss', String(task.start),
             '-to', String(task.end),
             '-c', 'copy',
             outputName
           ]);
        } else if (task.action === 'crop') {
           // We re-encode to crop to 9:16
           const cropFilter = 'crop=ih*9/16:ih'; // Basic center crop to 9:16
           await ffmpeg.exec([
             '-i', inputFileName,
             '-vf', cropFilter,
             '-c:v', 'libx264',
             '-preset', 'ultrafast',
             '-c:a', 'copy',
             outputName
           ]);
        } else {
           // Fallback copy
           await ffmpeg.exec(['-i', inputFileName, '-c', 'copy', outputName]);
        }

        // 3. Read output and update video
        const data = await ffmpeg.readFile(outputName);
        const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        
        setVideoUrl(url);
        
        setMessages(prev => [...prev, 
            { role: 'system-action', text: '[FFmpeg] Processing complete. Video URL updated.' },
            { role: 'ai', text: 'Here is your edited video! You can play it or hit Export.' }
        ]);

    } catch(err) {
        console.error(err);
        setMessages(prev => [...prev, { role: 'system-action', text: '[FFmpeg] Processing failed. Check console.' }]);
    }
    
    setIsProcessing(false);
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const newMsgs = [...messages, { role: 'user', text: inputText }];
    setMessages(newMsgs);
    setInputText('');

    if (!videoFile) {
      setTimeout(() => {
        setMessages(prev => [...prev, { role: 'ai', text: 'Please upload a video first before issuing commands!' }]);
      }, 500);
      return;
    }

    // 1. Get JSON instructions from LLM mock
    setMessages(prev => [...prev, { role: 'system-action', text: 'Sending to Director AI...' }]);
    const response = await parseEditorCommand(inputText, videoDuration);
    
    // 2. Display LLM reasoning
    setMessages(prev => [
      ...prev, 
      { role: 'ai', text: response.message },
      { role: 'system-action', text: `JSON Strategy:\n${JSON.stringify(response.payload, null, 2)}` }
    ]);

    // 3. Hand off JSON array to FFmpeg engine
    if (response.payload && response.payload.length > 0) {
        await processVideoWithFFmpeg(response.payload);
    }
  };

  return (
    <div className="app-container">
      <header className="header" style={{ position: 'relative', zIndex: 10 }}>
        <div className="logo">
          <div className="logo-icon">▲</div>
          Antigravity Chat Editor
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {!ffmpegLoaded && <span style={{ fontSize: '11px', color: 'var(--accent-danger)' }}>Loading Engine...</span>}
          {ffmpegLoaded && <span style={{ fontSize: '11px', color: 'var(--accent-secondary)' }}>WASM Engine Ready</span>}
          <a  
            href={videoUrl} 
            download="ai_edited_video.mp4"
            className="btn-primary" 
            style={{ opacity: !videoUrl ? 0.5 : 1, pointerEvents: !videoUrl ? 'none' : 'auto', textDecoration: 'none' }}
          >
            Export Video
          </a>
        </div>
      </header>

      <main className="main-content">
        <section className="workspace">
          <div className="canvas-area">
            <div className={`mock-video-player ${isProcessing ? 'processing' : ''}`} style={videoUrl ? { backgroundColor: 'transparent', border: 'none', boxShadow: 'none' } : {}}>
              
              {isProcessing && (
                  <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                      <div className="spinner" style={{ width: '40px', height: '40px', border: '3px solid rgba(255,255,255,0.1)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                      <div style={{ marginTop: '16px', fontSize: '14px', fontWeight: '500' }}>FFmpeg is processing...</div>
                  </div>
              )}

              {!videoUrl ? (
                <div style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎬</div>
                  Your video will play here.<br/>
                  <span style={{ fontSize: '12px', display: 'block', marginBottom: '20px' }}>Fully processed in-browser. Zero uploads.</span>
                  
                  <input 
                    type="file" 
                    accept="video/*" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }} 
                  />
                  <button className="btn-primary" onClick={() => fileInputRef.current.click()}>
                    Select Video File
                  </button>
                </div>
              ) : (
                <video 
                  ref={videoRef}
                  src={videoUrl} 
                  controls 
                  onLoadedMetadata={(e) => setVideoDuration(e.target.duration)}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 'var(--radius-lg)' }}
                >
                  Your browser does not support the video tag.
                </video>
              )}
            </div>
          </div>

          <div className="timeline-area">
            <div style={{ padding: '8px 16px', fontSize: '11px', color: 'var(--text-secondary)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              LIVE TIMELINE VISUALIZER
            </div>
            <div className="track">
              <span style={{ fontSize:'10px', color:'#A1A1A6', width:'60px' }}>V2 (FX)</span>
            </div>
            <div className="track">
              <span style={{ fontSize:'10px', color:'#A1A1A6', width:'60px' }}>V1 (Main)</span>
              <div className="clip" style={{ left: '5%', width: '90%' }}> {videoFile ? videoFile.name : 'Waiting for video...'} </div>
            </div>
            <div className="track">
              <span style={{ fontSize:'10px', color:'#A1A1A6', width:'60px' }}>A1 (Audio)</span>
              <div className="clip" style={{ left: '5%', width: '90%', borderColor: 'transparent', opacity: 0.5 }}>Audio Track</div>
            </div>
          </div>
        </section>

        <aside className="assistant-panel">
          <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', fontSize: '13px', fontWeight: '600' }}>
            Director AI
          </div>
          
          <div className="chat-history">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-bubble ${msg.role}`}>
                {msg.role === 'system-action' ? (
                   <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '10px', margin: 0 }}>{msg.text}</pre>
                ) : msg.text}
              </div>
            ))}
            <div ref={messageEndRef} />
          </div>

          <div className="chat-input-area">
            <div className="chat-input-wrapper">
              <input 
                type="text" 
                className="chat-input" 
                placeholder="E.g., Trim the first 5 seconds..." 
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
                disabled={isProcessing}
              />
              <button className="send-btn" onClick={handleSend} disabled={isProcessing}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"></line>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                </svg>
              </button>
            </div>
          </div>
        </aside>
      </main>
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

export default App;
