import { initialize, type ActivationContext, AudioClip } from "@ableton-extensions/sdk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// esbuild inlines this HTML file as a string for production builds.
import bundledInterface from "./ui/interface.html";

export function activate(activation: ActivationContext) {
  const context = initialize(activation, "1.0.0");

  context.commands.registerCommand("mixtape-cuesheet.showDialog", async () => {
    try {
      const song = context.application.song;
      
      // Gather relevant project data for the cuesheet generation
      const projectData = {
        tempo: song.tempo,
        clips: song.tracks.flatMap((track) =>
          track.arrangementClips.map((clip) => {
            let fileName = "";
            let isAudio = false;
            if (clip instanceof AudioClip) {
              fileName = path.basename(clip.filePath);
              isAudio = true;
            }
            return {
              name: clip.name,
              startTime: clip.startTime,
              endTime: clip.endTime,
              duration: clip.duration,
              trackName: track.name,
              isAudio: isAudio,
              fileName: fileName,
            };
          })
        ),
      };

      // Dynamically inject the project data at the start of <head> in our Webview HTML
      const scriptTag = `<script>const projectData = ${JSON.stringify(projectData)};</script>`;
      const injectedHtml = bundledInterface.replace("<head>", `<head>${scriptTag}`);
      const url = `data:text/html,${encodeURIComponent(injectedHtml)}`;

      // Open the modal dialog with Ableton-friendly sizing
      const resultStr = await context.ui.showModalDialog(url, 640, 680);
      
      if (!resultStr) return;

      const result = JSON.parse(resultStr);
      if (result && result.action === "save") {
        // Write the cuesheet file directly to the user's Desktop
        const desktopPath = path.join(os.homedir(), "Desktop");
        const filePath = path.join(desktopPath, result.filename);
        
        fs.writeFileSync(filePath, result.content, "utf8");
        console.log(`[mixtape-cuesheet] Cue sheet successfully saved to: ${filePath}`);
      }
    } catch (error) {
      console.error("[mixtape-cuesheet] Error in mixtape cuesheet dialog:", error);
    }
  });

  // Register context menu actions in various layout locations for convenience
  const scopes = ["AudioClip", "AudioTrack", "MidiClip", "MidiTrack"] as const;
  
  scopes.forEach((scope) => {
    context.ui.registerContextMenuAction(
      scope,
      "Generate Mixtape Cue Sheet...",
      "mixtape-cuesheet.showDialog"
    );
  });
}
