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

function validatePassword(password) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, currentPassword, newPassword } = req.body;

    if (!username || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Validate new password
    const validationError = validatePassword(newPassword);
    if (validationError) {
      return res.status(400).json({ error: validationError });
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
      return res.status(500).json({ error: 'Credentials sheet not found. Please contact administrator.' });
    }

    // Find user in credentials
    let userRowIndex = -1;
    let storedPassword = null;

    for (let i = 0; i < credentialsData.length; i++) {
      if (credentialsData[i][0] === username) {
        userRowIndex = i;
        storedPassword = credentialsData[i][1];
        break;
      }
    }

    // Check if user exists
    if (userRowIndex === -1) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Verify current password
    if (currentPassword !== storedPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Update password for this user only
    const timestamp = new Date().toISOString();
    const rowNumber = userRowIndex + 2; // +2 because: +1 for header row, +1 for 0-index to 1-index
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${CREDENTIALS_SHEET}!A${rowNumber}:D${rowNumber}`,
      valueInputOption: 'RAW',
      resource: {
        values: [[username, newPassword, credentialsData[userRowIndex][2], timestamp]]
      }
    });

    return res.status(200).json({ 
      success: true, 
      message: 'Password changed successfully' 
    });

  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({ 
      error: 'Failed to change password',
      details: error.message 
    });
  }
};
