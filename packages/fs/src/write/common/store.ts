export interface IWriteStore {
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
   * @returns
   */
  ensureDir(path: string): void;
  /**
   * Delete a file or directory.
   * @param path
   * @returns
   */
  delete?(path: string): void;
}
