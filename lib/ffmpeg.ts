import ffmpeg from "fluent-ffmpeg";
import { resolveFfmpegPath, resolveFfprobePath } from "@/lib/tools";

ffmpeg.setFfmpegPath(resolveFfmpegPath());
ffmpeg.setFfprobePath(resolveFfprobePath());

export type TrimOptions = {
  fadeIn?: boolean;
  fadeOut?: boolean;
};

export function trimToDiscordMp3(
  inputPath: string,
  outputPath: string,
  start: number,
  duration: number,
  options: TrimOptions = {},
) {
  const filters = ["loudnorm=I=-16:LRA=11:TP=-1.5"];
  const fadeLength = Math.min(0.75, duration / 3);

  if (options.fadeIn && fadeLength > 0) {
    filters.push(`afade=t=in:st=0:d=${fadeLength.toFixed(2)}`);
  }

  if (options.fadeOut && fadeLength > 0) {
    filters.push(`afade=t=out:st=${Math.max(0, duration - fadeLength).toFixed(2)}:d=${fadeLength.toFixed(2)}`);
  }

  return new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .setStartTime(start)
      .duration(duration)
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .audioChannels(2)
      .audioFrequency(48_000)
      .audioFilters(filters)
      .format("mp3")
      .outputOptions(["-map_metadata", "-1", "-id3v2_version", "0"])
      .on("end", () => resolve())
      .on("error", reject)
      .save(outputPath);
  });
}
