/**
 * Instagram Login Status Checker
 * This script checks if an Instagram cookie string is still valid and the user is logged in.
 */

const axios = require('axios');

/**
 * Helper function to parse cookie string into object
 * @param {string} cookieStr - Cookie string to parse
 * @returns {object} - Object with cookie key-value pairs
 */
function parseCookieString(cookieStr) {
  const cookies = {};
  cookieStr.split('; ').forEach(part => {
    const [key, value] = part.split('=');
    if (key && value) {
      cookies[key.trim()] = value.trim();
    }
  });
  return cookies;
}

/**
 * Check if a user is still logged in using the provided cookie string
 * @param {string} cookieStr - Instagram cookie string
 * @returns {Promise<object>} - Object containing logged in status
 */
async function isLoggedIn(cookieStr) {
  try {
    const cookies = parseCookieString(cookieStr);
    const response = await axios.get("https://www.instagram.com/accounts/edit/", {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'X-CSRFToken': cookies['csrftoken'] || '',
        'Cookie': cookieStr
      },
      maxRedirects: 0,
      validateStatus: status => [200, 302].includes(status)
    });
    
    // If we get a 200 response, we're logged in
    // If we get a 302 redirect, we're not logged in
    const isAuthenticated = response.status === 200;
    
    return { 
      success: true, 
      isLoggedIn: isAuthenticated,
      message: isAuthenticated ? 'Cookie is valid and user is logged in' : 'Cookie is invalid or expired'
    };
  } catch (error) {
    return { 
      success: false, 
      isLoggedIn: false,
      message: `Error checking login status: ${error.message}`
    };
  }
}

/**
 * Command-line interface for checking Instagram login status
 */
async function main() {
  // Display colorful banner
  console.log("\x1b[35m");
  console.log(" ___ _   _ ____ _____  _    ____ ____      _    __  __ ");
  console.log("|_ _| \\ | / ___|_   _|/ \\  / ___|  _ \\    / \\  |  \\/  |");
  console.log(" | ||  \\| \\___ \\ | | / _ \\| |  _| |_) |  / _ \\ | |\\/| |");
  console.log(" | || |\\  |___) || |/ ___ \\ |_| |  _ <  / ___ \\| |  | |");
  console.log("|___|_| \\_|____/ |_/_/   \\_\\____|_| \\_\\/_/   \\_\\_|  |_|");
  console.log("\x1b[36m Login Checker \x1b[0m");
  console.log();

  const fs = require('fs');
  const args = process.argv.slice(2);
  
  let cookieStr;
  
  if (args[0]) {
    // Read from file if provided
    if (args[0].endsWith('.txt') && fs.existsSync(args[0])) {
      cookieStr = fs.readFileSync(args[0], 'utf8').trim();
    } else {
      // Use argument directly as cookie string
      cookieStr = args[0];
    }
  } else {
    // Prompt user for cookie string
    cookieStr = await promptInput("Enter Instagram cookie string: ");
  }
  
  console.log("\nChecking login status...");
  
  const result = await isLoggedIn(cookieStr);
  
  if (!result.success) {
    console.log(`\x1b[31m[ERROR]\x1b[0m ${result.message}`);
    process.exit(1);
  }
  
  if (result.isLoggedIn) {
    console.log(`\x1b[32m[SUCCESS]\x1b[0m ${result.message}`);
  } else {
    console.log(`\x1b[33m[WARNING]\x1b[0m ${result.message}`);
  }
}

/**
 * Helper function to prompt for input in CLI
 * @param {string} question - Question to display
 * @returns {Promise<string>} - User input
 */
function promptInput(question) {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

// Export functions for module usage
module.exports = {
  isLoggedIn,
  parseCookieString
};

// Run main function if script is executed directly
if (require.main === module) {
  main().catch(console.error);
}
