const { google } = require('googleapis');

// Google Sheets configuration
const SPREADSHEET_ID = '152dK2m3gluxCdBal9GGLs43aDKFBvy5BiHdnKL3gV4o';
const LIVE_SCORES_SHEET = 'Live Scores';

async function getAuthClient() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
  
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  return await auth.getClient();
}

/**
 * Submit score entry to Google Sheets
 * Expected body format:
 * {
 *   roundDate: "2025-11-05",
 *   group: "A",
 *   playerName: "John Doe",
 *   hole: 1,
 *   score: 5,
 *   stablefordPoints: 1,
 *   scorekeeper: "Jane Smith",
 *   verified: "Pending" | "Yes" | "No"
 * }
 */
module.exports = async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    return handleSubmitScore(req, res);
  }

  if (req.method === 'GET') {
    return handleGetScores(req, res);
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

async function handleSubmitScore(req, res) {
  try {
    const {
      roundDate,
      group,
      playerName,
      hole,
      score,
      stablefordPoints,
      scorekeeper,
      verified = 'Pending'
    } = req.body;

    // Validation
    if (!roundDate || !group || !playerName || !hole || score === undefined) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['roundDate', 'group', 'playerName', 'hole', 'score']
      });
    }

    // Get auth client
    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Check if this exact entry already exists
    const existingData = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LIVE_SCORES_SHEET}!A2:I`
    });

    const rows = existingData.data.values || [];
    let rowToUpdate = -1;

    // Look for existing entry with same roundDate, group, playerName, hole, scorekeeper
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row[1] === roundDate && 
          row[2] === group && 
          row[3] === playerName && 
          row[4] == hole && 
          row[7] === scorekeeper) {
        rowToUpdate = i + 2; // +2 for header row and 0-index conversion
        break;
      }
    }

    const timestamp = new Date().toISOString();
    const newRow = [
      timestamp,          // A: Timestamp
      roundDate,          // B: Round Date
      group,              // C: Group
      playerName,         // D: Player Name
      hole,               // E: Hole
      score,              // F: Score
      stablefordPoints,   // G: Stableford Points
      scorekeeper,        // H: Scorekeeper
      verified            // I: Verified
    ];

    if (rowToUpdate > 0) {
      // Update existing row
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LIVE_SCORES_SHEET}!A${rowToUpdate}:I${rowToUpdate}`,
        valueInputOption: 'RAW',
        resource: {
          values: [newRow]
        }
      });
    } else {
      // Append new row
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${LIVE_SCORES_SHEET}!A:I`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        resource: {
          values: [newRow]
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: rowToUpdate > 0 ? 'Score updated' : 'Score submitted',
      data: {
        roundDate,
        group,
        playerName,
        hole,
        score,
        stablefordPoints,
        scorekeeper,
        verified,
        timestamp
      }
    });

  } catch (error) {
    console.error('Error submitting score:', error);
    return res.status(500).json({
      error: 'Failed to submit score',
      details: error.message
    });
  }
}

async function handleGetScores(req, res) {
  try {
    const { roundDate, group } = req.query;

    const authClient = await getAuthClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${LIVE_SCORES_SHEET}!A2:I`
    });

    let scores = response.data.values || [];

    // Filter by roundDate and/or group if provided
    if (roundDate) {
      scores = scores.filter(row => row[1] === roundDate);
    }
    if (group) {
      scores = scores.filter(row => row[2] === group);
    }

    // Transform to object format
    const formattedScores = scores.map(row => ({
      timestamp: row[0],
      roundDate: row[1],
      group: row[2],
      playerName: row[3],
      hole: parseInt(row[4]) || 0,
      score: parseInt(row[5]) || 0,
      stablefordPoints: parseInt(row[6]) || 0,
      scorekeeper: row[7],
      verified: row[8] || 'Pending'
    }));

    return res.status(200).json({
      success: true,
      count: formattedScores.length,
      scores: formattedScores
    });

  } catch (error) {
    console.error('Error getting scores:', error);
    return res.status(500).json({
      error: 'Failed to get scores',
      details: error.message
    });
  }
}
