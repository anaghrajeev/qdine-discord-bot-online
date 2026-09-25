export const logger = {
  info: (message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.log(`[${timestamp}] INFO: ${message}`, ...args);
  },
  warn: (message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.warn(`[${timestamp}] WARN: ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    console.error(`[${timestamp}] ERROR: ${message}`, ...args);
  }
};
