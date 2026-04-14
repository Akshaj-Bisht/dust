import React from "react";
import { Box, Text } from "ink";
import type { TuiView } from "../types";

type FooterProps = {
  view: TuiView;
  cleanReadyToApply: boolean;
};

export const Footer = ({ view, cleanReadyToApply }: FooterProps): React.JSX.Element => {
  return (
    <Box marginTop={1} flexDirection="column">
      <Text dimColor>
        ↑/↓ Move | Enter Select | q {view === "home" ? "Quit" : "Back to Home"}
        {view === "cleaning" && cleanReadyToApply ? " | a Apply cleanup" : ""}
      </Text>
      {view === "cleaning" ? <Text dimColor>g Top | G Bottom | j/k Scroll logs | l Open cleanup log</Text> : null}
      {view === "log" ? <Text dimColor>g Top | G Bottom | j/k Scroll log history</Text> : null}
    </Box>
  );
};
