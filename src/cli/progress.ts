import type { SyncStatus, SyncStatusReporter } from "@/substream/types.js";

export interface CliProgressBar extends SyncStatusReporter {
  finish(): void;
}

export function createCliProgressBar(label: string): CliProgressBar {
  if (!process.stderr.isTTY) {
    return {
      update() {},
      finish() {},
    };
  }

  let started = false;
  let lastLength = 0;

  function render(status: SyncStatus): void {
    const progress = status.progress;
    if (!progress) return;

    const width = 28;
    const ratio = progress.total > 0 ? progress.current / progress.total : 1;
    const complete = Math.min(width, Math.floor(ratio * width));
    const bar = `${"#".repeat(complete)}${"-".repeat(width - complete)}`;
    const percent = Math.floor(ratio * 100)
      .toString()
      .padStart(3, " ");
    const text = `${label} [${bar}] ${percent}% ${progress.current}/${progress.total}`;
    const padding = " ".repeat(Math.max(0, lastLength - text.length));

    process.stderr.write(`\r${text}${padding}`);
    started = true;
    lastLength = text.length;
  }

  return {
    update: render,
    finish() {
      if (!started) return;
      process.stderr.write("\n");
      started = false;
      lastLength = 0;
    },
  };
}
