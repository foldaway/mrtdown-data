/**
 * A store for reading target-layout data files.
 */
export interface IStore {
  /**
   * Read a UTF-8 text file at a repository-relative path.
   * @throws When the path cannot be read as a file.
   */
  readText(path: string): string;

  /**
   * Read and parse a JSON file at a repository-relative path.
   * @throws When the path cannot be read as a file or contains invalid JSON.
   */
  readJson<T>(path: string): T;

  /**
   * List entries in a directory. Dotfiles and dot-directories are omitted.
   * @throws When the path cannot be read as a directory.
   */
  listDir(path: string): string[];

  /**
   * Check if a file or directory exists.
   */
  exists(path: string): boolean;
}
