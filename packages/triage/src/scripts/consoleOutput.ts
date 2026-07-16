export async function withConsoleLogRedirectedToStderr<T>(
  callback: () => Promise<T>,
): Promise<T> {
  const originalConsoleLog = console.log;
  console.log = (...args: unknown[]) => {
    console.error(...args);
  };

  try {
    return await callback();
  } finally {
    console.log = originalConsoleLog;
  }
}
