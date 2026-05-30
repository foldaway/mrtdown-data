export type CliIO = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
};

export type GlobalOptions = {
  cwd: string;
  dataDir: string;
};

export type ParsedArgs = {
  globals: GlobalOptions;
  command: string[];
};
