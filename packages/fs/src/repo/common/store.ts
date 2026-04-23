/**
 * A store for reading and writing files.
 */
export interface IStore {
  /**
   * Read a text file.
   * @param path
   * @returns
   */
  readText(path: string): string;
  /**
   * Read a JSON file.
   * @param path
   * @returns
   */
  readJson<T>(path: string): T;
  /**
   * List entries in a directory. Dotfiles and dot-directories are omitted.
   * @param path
   * @returns
   */
  listDir(path: string): string[];
  /**
   * Check if a file exists.
   * @param path
   * @returns
   */
  exists(path: string): boolean;
}
