import React from "react";
import { Box, Text } from "ink";

type LogViewProps = {
  logPath: string;
  logLines: string[];
  logScrollOffset: number;
};

export const LogView = ({ logPath, logLines, logScrollOffset }: LogViewProps): React.JSX.Element => {
  const maxVisibleLines = Math.max(8, (process.stdout.rows ?? 24) - 12);
  const maxScrollOffset = Math.max(0, logLines.length - maxVisibleLines);
  const offset = Math.min(maxScrollOffset, logScrollOffset);
  const visibleLines = logLines.slice(offset, offset + maxVisibleLines);
  const endLine = Math.min(logLines.length, offset + maxVisibleLines);

  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="magenta" bold>
        Cleanup Log
      </Text>
      <Text color="gray">Path: {logPath}</Text>
      <Text color="gray">------------------------------------------------------------</Text>
      <Box marginTop={1} flexDirection="column">
        {visibleLines.map((line, index) => (
          <Text key={`${offset + index}-${line}`}>{line}</Text>
        ))}
        <Text dimColor>
          Lines {logLines.length === 0 ? 0 : offset + 1}-{endLine} / {logLines.length}
          {" | "}Scroll: ↑/↓ (or j/k), g top, G bottom
        </Text>
      </Box>
    </Box>
  );
};
