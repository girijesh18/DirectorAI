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
