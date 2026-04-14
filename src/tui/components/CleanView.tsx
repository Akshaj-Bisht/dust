import React from "react";
import { Box, Text } from "ink";
import type { CleanLine } from "../types";

type CleanViewProps = {
  cleanBusy: boolean;
  spinnerFrame: number;
  cleanStageLabel: string;
  cleanStep: number;
  cleanStepTotal: number;
  cleanLines: CleanLine[];
  cleanAutoFollow: boolean;
  cleanScrollOffset: number;
};

export const CleanView = ({
  cleanBusy,
  spinnerFrame,
  cleanStageLabel,
  cleanStep,
  cleanStepTotal,
  cleanLines,
  cleanAutoFollow,
  cleanScrollOffset,
}: CleanViewProps): React.JSX.Element => {
  const maxVisibleLines = Math.max(8, (process.stdout.rows ?? 24) - 15);
  const maxScrollOffset = Math.max(0, cleanLines.length - maxVisibleLines);
  const effectiveOffset = cleanAutoFollow ? maxScrollOffset : cleanScrollOffset;
  const visibleLines = cleanLines.slice(effectiveOffset, effectiveOffset + maxVisibleLines);
  const endLine = Math.min(cleanLines.length, effectiveOffset + maxVisibleLines);
  const atBottom = effectiveOffset >= maxScrollOffset;

  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="magenta" bold>
        Clean View
      </Text>
      <Text color="gray">Press q to go back.</Text>
      <Text color="gray">------------------------------------------------------------</Text>
      <Text color="cyan">
        {["|", "/", "-", "\\"][spinnerFrame] ?? "|"} {cleanBusy ? `Scanning: ${cleanStageLabel}` : "Scan complete"}
      </Text>
      <Text color="gray">
        {(() => {
          const width = 24;
          const ratio = cleanStepTotal > 0 ? cleanStep / cleanStepTotal : 0;
          const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
          return `[${"=".repeat(filled)}${" ".repeat(width - filled)}] ${Math.round(ratio * 100)}%`;
        })()}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {visibleLines.map((line, index) => (
          <Text key={`${effectiveOffset + index}-${line.text}`} color={line.color}>
            {line.text}
          </Text>
        ))}
        <Text dimColor>
          Lines {cleanLines.length === 0 ? 0 : effectiveOffset + 1}-{endLine} / {cleanLines.length}
          {" | "}Scroll: ↑/↓ (or j/k), g top, G bottom{atBottom ? " | tailing" : ""}
        </Text>
        <Text dimColor>
          {(() => {
            const barWidth = 18;
            const ratio = maxScrollOffset <= 0 ? 1 : effectiveOffset / maxScrollOffset;
            const filled = Math.max(0, Math.min(barWidth, Math.round(ratio * barWidth)));
            return `Log bar [${"■".repeat(filled)}${"·".repeat(barWidth - filled)}]`;
          })()}
        </Text>
      </Box>
    </Box>
  );
};
