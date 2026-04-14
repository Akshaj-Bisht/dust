import React from "react";
import { Box, Text } from "ink";
import type { MenuAction } from "../types";

type ResultViewProps = {
  lastAction: MenuAction | null;
  lastCommand: string;
  output: string;
};

export const ResultView = ({ lastAction, lastCommand, output }: ResultViewProps): React.JSX.Element => {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text color="cyan" bold>
        {lastAction ? `Result: ${lastAction}` : "Result"}
      </Text>
      <Text dimColor>Command: {lastCommand}</Text>
      <Text dimColor>------------------------------------------------------------</Text>
      <Box marginTop={1}>
        <Text>{output}</Text>
      </Box>
    </Box>
  );
};
