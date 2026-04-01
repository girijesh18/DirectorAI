import React, { useState, useRef, useEffect } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { parseEditorCommand } from './services/llmMock';
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as blazeface from '@tensorflow-models/blazeface';
import './App.css';

function App() {
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! I am your AI Video Editor. Upload a video and just tell me what you want to change (e.g. "trim the first 5 seconds").' }
  ]);
  const [inputText, setInputText] = useState('');
  
  // Video & Engine State
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [undoHistory, setUndoHistory] = useState([]);
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
      setUndoHistory([]);
      
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
    await ffmpeg.writeFile(inputFileName, await fetchFile(videoUrl));

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
        } else if (task.action === 'mute') {
           await ffmpeg.exec(['-i', inputFileName, '-an', '-c:v', 'copy', outputName]);
        } else if (task.action === 'filter') {
           const args = ['-i', inputFileName];
           if (task.video_filter) {
             args.push('-vf', task.video_filter);
             args.push('-c:v', 'libx264', '-preset', 'ultrafast');
           } else {
             args.push('-c:v', 'copy');
           }
           if (task.audio_filter) {
             args.push('-af', task.audio_filter);
             args.push('-c:a', 'aac');
           } else {
             args.push('-c:a', 'copy');
           }
           args.push(outputName);
           await ffmpeg.exec(args);
        } else {
           // Fallback copy
           await ffmpeg.exec(['-i', inputFileName, '-c', 'copy', outputName]);
        }

        // 3. Read output and update video
        const data = await ffmpeg.readFile(outputName);
        const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
        
        // Save current url to history before overwriting
        setUndoHistory(prev => [...prev, videoUrl]);
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

  const runAIFaceTracking = async (sourceUrl) => {
    setIsProcessing(true);
    setMessages(prev => [...prev, { role: 'system-action', text: '[TFJS] Booting Deep Brain... Loading BlazeFace model...' }]);

    try {
      await tf.ready();
      const model = await blazeface.load();

      setMessages(prev => [...prev, { role: 'system-action', text: '[TFJS] Model loaded. Tracking frames dynamically...' }]);

      const video = document.createElement('video');
      video.src = sourceUrl;
      video.crossOrigin = "anonymous";
      video.muted = true;
      video.playsInline = true;

      await new Promise(resolve => {
        video.onloadedmetadata = () => resolve();
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      const stream = canvas.captureStream(30);
      
      let finalStream = stream;
      const videoStream = video.captureStream ? video.captureStream() : (video.mozCaptureStream ? video.mozCaptureStream() : null);
      if (videoStream && videoStream.getAudioTracks().length > 0) {
        finalStream = new MediaStream([
          ...stream.getVideoTracks(),
          ...videoStream.getAudioTracks()
        ]);
      }

      const recorder = new MediaRecorder(finalStream, { mimeType: 'video/webm' });
      const chunks = [];
      recorder.ondataavailable = e => chunks.push(e.data);
      
      return new Promise((resolve, reject) => {
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'video/webm' });
          const newUrl = URL.createObjectURL(blob);
          
          setUndoHistory(prev => [...prev, videoUrl]);
          setVideoUrl(newUrl);
          
          setMessages(prev => [...prev, 
              { role: 'system-action', text: '[TFJS] AI Tracking complete. Rendered via MediaRecorder.' },
              { role: 'ai', text: 'Face tracking complete! I have dynamically scrubbed out the faces.' }
          ]);
          setIsProcessing(false);
          resolve();
        };

        const processFrame = async () => {
          if (video.paused || video.ended) return;

          // 1. Draw base frame
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // 2. Predict faces
          const predictions = await model.estimateFaces(video, false);

          if (predictions.length > 0) {
            for (let i = 0; i < predictions.length; i++) {
              const start = predictions[i].topLeft;
              const end = predictions[i].bottomRight;
              const size = [end[0] - start[0], end[1] - start[1]];
              
              const padX = size[0] * 0.2;
              const padY = size[1] * 0.2;
              
              const x = start[0] - padX;
              const y = start[1] - padY;
              const w = size[0] + (padX * 2);
              const h = size[1] + (padY * 2);

              // 3. Draw dynamic blur precisely over tracking box
              ctx.save();
              ctx.filter = 'blur(15px)';
              ctx.drawImage(video, x, y, w, h, x, y, w, h);
              ctx.restore();
            }
          }

          requestAnimationFrame(processFrame);
        };

        video.onplay = () => {
          recorder.start();
          processFrame();
        };

        video.onended = () => {
          recorder.stop();
        };

        video.play().catch(err => {
            console.error(err);
            reject(err);
        });
      });

    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'system-action', text: '[TFJS] Tracking engine failed. Check console.' }]);
      setIsProcessing(false);
    }
  };

  const handleUndo = () => {
    if (undoHistory.length > 0) {
      const prevUrl = undoHistory[undoHistory.length - 1];
      setUndoHistory(prev => prev.slice(0, -1));
      setVideoUrl(prevUrl);
      setMessages(prev => [...prev, { role: 'system-action', text: '[System] Reverted to the previous version.' }]);
    } else {
      setMessages(prev => [...prev, { role: 'ai', text: 'There is nothing to undo.' }]);
    }
  };

  const handleSend = async () => {
    if (!inputText.trim()) return;
    
    const newMsgs = [...messages, { role: 'user', text: inputText }];
    setMessages(newMsgs);
    setInputText('');

    if (inputText.toLowerCase().trim() === 'undo') {
       handleUndo();
       return;
    }

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

    // 3. Hand off JSON array to correct engine
    if (response.payload && response.payload.length > 0) {
        if (response.payload[0].action === 'ai_track') {
           await runAIFaceTracking(videoUrl);
        } else {
           await processVideoWithFFmpeg(response.payload);
        }
    }
  };

  return (
    <div className="app-container">
      <header className="header" style={{ position: 'relative', zIndex: 10 }}>
        <div className="logo">
          <div className="logo-icon">▲</div>
          Director AI
        </div>
        <div className="header-actions" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {undoHistory.length > 0 && (
            <button onClick={handleUndo} style={{ padding: '8px 16px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '12px' }}>
              ↶ Undo
            </button>
          )}
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
        <aside className="sidebar">
          <div className="sidebar-header">Capabilities</div>
          <ul className="feature-list">
            <li>
              <strong>🤖 AI Face Blur</strong>
              <span style={{color: 'var(--accent-primary)'}}>Dynamically tracks faces</span>
            </li>
            <li>
              <strong>✨ Make it pop</strong>
              <span>Boosts colors and brightness</span>
            </li>
            <li>
              <strong>🎞️ Make it vintage</strong>
              <span>Applies a black & white filter</span>
            </li>
            <li>
              <strong>⚡ Make it 2x speed</strong>
              <span>Speeds up video & audio</span>
            </li>
            <li>
              <strong>🐢 Slow motion</strong>
              <span>Halves speed to 0.5x</span>
            </li>
            <li>
              <strong>⏪ Reverse video</strong>
              <span>Plays it completely backwards</span>
            </li>
            <li>
              <strong>🌫️ Blur video</strong>
              <span>Applies a heavy cinematic blur</span>
            </li>
            <li>
              <strong>🔍 Sharpen detail</strong>
              <span>Crisps up blurry footage</span>
            </li>
            <li>
              <strong>🪞 Mirror video</strong>
              <span>Flips video horizontally</span>
            </li>
            <li>
              <strong>🙃 Upside down</strong>
              <span>Flips video vertically</span>
            </li>
            <li>
              <strong>🔊 Volume boost</strong>
              <span>Increases master volume by 200%</span>
            </li>
            <li>
              <strong>🌤️ Fade in</strong>
              <span>Smooth 2s transition from black</span>
            </li>
            <li>
              <strong>🔇 Mute it</strong>
              <span>Removes all audio tracks</span>
            </li>
            <li>
              <strong>✂️ Crop edges</strong>
              <span>Trims video from all sides</span>
            </li>
            <li>
              <strong>🔲 Blur region</strong>
              <span>Applies static spatial center blur</span>
            </li>
            <li>
              <strong>📱 Vertical crop</strong>
              <span>Re-frames to 9:16 aspect ratio</span>
            </li>
            <li>
              <strong>✂️ Trim video</strong>
              <span>e.g., "Keep the first 5 seconds"</span>
            </li>
          </ul>
        </aside>

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
