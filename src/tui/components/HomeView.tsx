import React from "react";
import { Box, Text } from "ink";
import { DUST_ASCII_LOGO } from "../logo";
import type { MenuAction } from "../types";

type HomeViewProps = {
  menuItems: Array<{ id: MenuAction; label: string; hint: string }>;
  selected: number;
};

export const HomeView = ({ menuItems, selected }: HomeViewProps): React.JSX.Element => {
  return (
    <Box flexDirection="column">
      <Text color="green">{DUST_ASCII_LOGO}</Text>
      <Text color="blue">https://github.com/akshaj-bisht/dust</Text>
      <Text color="green">Deep clean and optimize your Linux.</Text>
      <Text dimColor>Use arrow keys (or j/k) and press Enter to run an action.</Text>
      <Box marginTop={1} flexDirection="column">
        {menuItems.map((item, index) => {
          const isActive = index === selected;
          return (
            <Text key={item.id} color={isActive ? "cyan" : undefined}>
              {index + 1}. {item.label.padEnd(10, " ")} {item.hint}
            </Text>
          );
        })}
      </Box>
    </Box>
  );
};
