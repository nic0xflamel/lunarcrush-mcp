#!/usr/bin/env node
const path = require('node:path');
const process = require('node:process');
const fs = require('node:fs'); // Require fs for file stream

// --- Redirect stderr to a file --- 
const logFilePath = path.resolve(__dirname, '../server-stderr.log'); // Log file in project root
try {
  // Use append flag 'a' so logs aren't overwritten on each start
  const logStream = fs.createWriteStream(logFilePath, { flags: 'a' });
  
  // Overwrite process.stderr.write
  process.stderr.write = (message) => {
    logStream.write(message);
    // Optionally, also write to original stderr if running manually
    // process.stdout.write(`[stderr] ${message}`); 
    return true;
  };
  
  console.error(`--- Server started at ${new Date().toISOString()} ---`); // Write a separator to the log
} catch (err) {
    // If we can't create the log file, fallback to original stderr (which might be lost)
    console.error('[CRITICAL] Failed to create log file:', err);
}
// ---------------------------------

// --- Argument Parsing for API Key ---
const args = process.argv.slice(2); // Get args passed to the script
const apiKeyIndex = args.indexOf('--api-key');
let apiKey = null;

if (apiKeyIndex !== -1 && args.length > apiKeyIndex + 1) {
  apiKey = args[apiKeyIndex + 1];
  // Set environment variable if key is found
  process.env.LUNARCRUSH_API_KEY = apiKey;
  // console.log('[CLI Log] API key found in args and set in environment.'); // Removed log
} else {
  // console.log('[CLI Log] --api-key argument not found or no value provided.'); // Removed log
}
// -------------------------------------

// In CommonJS, __filename and __dirname are available globally

(async () => {
  // Dynamically import the ESM start script
  // Resolve the path relative to the current CJS script's directory (scripts/)
  // Go up one level(../) then into bin/scripts/
  const startServerPath = path.resolve(__dirname, '../bin/scripts/start-server.js');
  try {
    // We need to convert the file path to a file URL for dynamic import()
    const startServerUrl = new URL(`file://${startServerPath}`);
    const { startServer } = await import(startServerUrl.href);
    // Assuming startServer doesn't need to be explicitly called here
    // If it does need calling, uncomment the next line:
    // await startServer(); 
  } catch (error) {
    console.error('Failed to start server execution:', error);
    process.exit(1);
  }
})(); 