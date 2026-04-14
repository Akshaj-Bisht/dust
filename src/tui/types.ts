export type MenuAction = "clean" | "uninstall" | "optimize" | "scan" | "status" | "help" | "exit";

export type CleanLine = {
  text: string;
  color?: "white" | "green" | "cyan" | "magenta" | "yellow" | "red" | "blue" | "gray";
};

export type TuiView = "home" | "result" | "cleaning" | "log";
