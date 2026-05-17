/**
 * A store for reading target-layout data files.
 */
export interface IStore {
  /**
   * Read a UTF-8 text file at a repository-relative path.
   * @returns The file contents as a UTF-8 string.
   * @throws When the path cannot be read as a file.
   */
  readText(path: string): string;

  /**
   * Read and parse a JSON file at a repository-relative path.
   * @returns The parsed JSON value. Callers are responsible for validating T.
   * @throws When the path cannot be read as a file or contains invalid JSON.
   */
  readJson<T>(path: string): T;

  /**
   * List entries in a directory. Dotfiles and dot-directories are omitted.
   * @returns Sorted visible entry names in the directory.
   * @throws When the path cannot be read as a directory.
   */
  listDir(path: string): string[];

  /**
   * Check if a file or directory exists.
   * @returns true when the repository-relative path exists, otherwise false.
   */
  exists(path: string): boolean;
}
