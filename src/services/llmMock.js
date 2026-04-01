/**
 * Mock Service for simulating LLM Editor Commands
 * In production, this would send the text to Claude Haiku/Gemini Flash
 * and return the structured JSON commands.
 */

export const parseEditorCommand = async (userInput, duration) => {
  return new Promise((resolve) => {
    setTimeout(() => {
      // Basic heuristic to mock LLM understanding
      const input = userInput.toLowerCase();
      
      let commands = [];
      let message = "";

      if (input.includes("silence") || input.includes("cut")) {
        // Mock finding silences (e.g. at 0.5s - 1.2s and 3.0s - 4.2s)
        const t1 = Math.min(0.5, duration || 0.5);
        const t2 = Math.min(1.2, duration || 1.2);
        
        commands = [
          { action: "trim", start: 0, end: t1 },
          { action: "trim", start: t2, end: duration || t2 + 5 }
        ];
        message = "I analyzed the audio and removed the major silences.";
      } else if (input.includes("tiktok") || input.includes("vertical") || input.includes("reframe")) {
        commands = [
          { action: "crop", ratio: "9:16" }
        ];
        message = "I've centered the subject and reframed the video to 9:16 for TikTok/Reels.";
      } else if (input.includes("caption") || input.includes("subtitle")) {
        commands = [
          { action: "captions", style: "dynamic" }
        ];
        message = "Generated dynamic bouncing captions perfectly synced with your speech.";
      } else if (input.includes("pop") || input.includes("bright")) {
        commands = [
          { action: "filter", video_filter: "eq=brightness=0.1:saturation=1.5" }
        ];
        message = "I boosted the brightness and saturation to make the video pop!";
      } else if (input.includes("vintage") || input.includes("old") || input.includes("black and white") || input.includes("greyscale")) {
        commands = [
          { action: "filter", video_filter: "hue=s=0" }
        ];
        message = "I applied a vintage black and white effect.";
      } else if (input.includes("mute") || input.includes("silence all") || input.includes("remove audio")) {
        commands = [
          { action: "mute" }
        ];
        message = "Done! I have completely muted the audio track.";
      } else if (input.includes("speed") || input.includes("fast") || input.includes("2x")) {
        commands = [
          { action: "filter", video_filter: "setpts=0.5*PTS", audio_filter: "atempo=2.0" }
        ];
        message = "I've sped up the clip by 2x!";
      } else if (input.includes("slow") || input.includes("mo")) {
        commands = [
          { action: "filter", video_filter: "setpts=2.0*PTS", audio_filter: "atempo=0.5" }
        ];
        message = "Applied smooth slow-motion effect.";
      } else if (input.includes("reverse") || input.includes("backward")) {
        commands = [
          { action: "filter", video_filter: "reverse", audio_filter: "areverse" }
        ];
        message = "Reversed the timeline! The video now plays backward.";
      } else if (input.includes("blur") && (input.includes("center") || input.includes("section") || input.includes("region") || input.includes("part"))) {
        commands = [
          { action: "filter", video_filter: "split[main][tmp];[tmp]crop=iw/2:ih/2:iw/4:ih/4,boxblur=15[blur];[main][blur]overlay=W/4:H/4" }
        ];
        message = "I applied a dense spatial blur specifically targeting the center region of the video.";
      } else if (input.includes("blur")) {
        commands = [
          { action: "filter", video_filter: "boxblur=10:1" }
        ];
        message = "Applied a heavy blur effect to the video.";
      } else if (input.includes("sharpen") || input.includes("crisp")) {
        commands = [
          { action: "filter", video_filter: "unsharp=5:5:1.0:5:5:0.0" }
        ];
        message = "Sharpened the details in the footage.";
      } else if (input.includes("mirror") || input.includes("flip horizontally") || input.includes("horizontal")) {
        commands = [
          { action: "filter", video_filter: "hflip" }
        ];
        message = "Mirrored the video horizontally.";
      } else if (input.includes("upside down") || input.includes("flip vertically") || input.includes("vertical flip")) {
        commands = [
          { action: "filter", video_filter: "vflip" }
        ];
        message = "Flipped the video completely upside down.";
      } else if (input.includes("loud") || input.includes("boost") || input.includes("volume")) {
        commands = [
          { action: "filter", audio_filter: "volume=2.0" }
        ];
        message = "Boosted the volume by 200%.";
      } else if (input.includes("fade in")) {
        commands = [
          { action: "filter", video_filter: "fade=t=in:st=0:d=2", audio_filter: "afade=t=in:st=0:d=2" }
        ];
        message = "Added a cinematic 2-second fade-in from black.";
      } else if ((input.includes("crop") || input.includes("trim")) && (input.includes("sides") || input.includes("edges") || input.includes("zoom"))) {
        commands = [
          { action: "filter", video_filter: "crop=iw*0.8:ih*0.8" }
        ];
        message = "Calculated aspect ratio and dynamically cropped 10% from all edges of the frame.";
      } else {
        // Fallback or multiple
        commands = [
          { action: "trim", start: 0, end: Math.min(5, duration || 5) }
        ];
        message = "I've trimmed the video to the first 5 seconds as a quick highlight.";
      }

      resolve({
        success: true,
        message,
        payload: commands
      });
    }, 1500); // simulate network latency
  });
};
