const { google } = require('googleapis');

// Google Sheets configuration
const SPREADSHEET_ID = '152dK2m3gluxCdBal9GGLs43aDKFBvy5BiHdnKL3gV4o';
const CREDENTIALS_SHEET = 'Credentials';

async function getAuthClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return await auth.getClient();
}

/**
 * Login API Endpoint
 * POST /api/login
 * Body: { username, password }
 * Returns: { success: true, user: { username, email, role } }
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Get auth client
    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Get all credentials from sheet
    let credentialsData;
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `${CREDENTIALS_SHEET}!A2:D`
      });
      credentialsData = response.data.values || [];
    } catch (error) {
      console.error('Sheet access error:', error);
      return res.status(500).json({ 
        error: 'Credentials sheet not found. Please contact administrator.' 
      });
    }

    // Find user in credentials
    // Sheet structure: Username (A) | Password (B) | Email (C) | Last Modified (D)
    let userFound = false;
    let userData = null;

    for (let i = 0; i < credentialsData.length; i++) {
      const row = credentialsData[i];
      if (row[0] === username) {
        userFound = true;
        
        // Check password
        if (row[1] === password) {
          userData = {
            username: row[0],
            email: row[2] || '',
            lastModified: row[3] || '',
            // You could add role logic here if you have a role column
            role: determineUserRole(row[0])
          };
          break;
        } else {
          // User exists but wrong password
          return res.status(401).json({ 
            error: 'Invalid username or password' 
          });
        }
      }
    }

    if (!userFound) {
      return res.status(401).json({ 
        error: 'Invalid username or password' 
      });
    }

    // Successful login
    return res.status(200).json({
      success: true,
      user: userData,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'Login failed',
      details: error.message
    });
  }
};

/**
 * Determine user role based on username or other criteria
 * You can customize this based on your needs
 */
function determineUserRole(username) {
  // Example role logic - customize as needed
  const adminUsers = ['admin', 'administrator'];
  const scorekeeperUsers = ['scorekeeper', 'keeper'];
  
  const userLower = username.toLowerCase();
  
  if (adminUsers.some(admin => userLower.includes(admin))) {
    return 'admin';
  }
  
  if (scorekeeperUsers.some(keeper => userLower.includes(keeper))) {
    return 'scorekeeper';
  }
  
  return 'user';
}
