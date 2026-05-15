export interface IWriteStore {
  /**
   * Read a UTF-8 text file at a repository-relative path.
   * @returns The file contents as a UTF-8 string.
   * @throws When the path cannot be read as a file.
   */
  readText(path: string): string;

  /**
   * Write a text file.
   * @param path
   * @param text
   */
  writeText(path: string, text: string): void;

  /**
   * Write a JSON file.
   * @param path
   * @param json
   */
  writeJson(path: string, json: unknown): void;

  /**
   * Append text to a file.
   * @param path
   * @param text
   */
  appendText(path: string, text: string): void;

  /**
   * Ensure a directory exists.
   * @param path
   */
  ensureDir(path: string): void;

  /**
   * Delete a file or directory. Implementations should be idempotent.
   * @param path
   */
  delete(path: string): void;
}
