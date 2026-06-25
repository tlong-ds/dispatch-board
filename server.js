require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for GitHub Pages frontend
app.use(express.json());
app.use(express.static('public'));
app.use('/dino-party', express.static('public'));
app.use('/team', express.static('public'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
}).then(() => {
  console.log('Connected to MongoDB');
  seedDataIfNeeded();
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// Schemas
const itemSchema = new mongoose.Schema({
  text: { type: String, required: true }
});
const Item = mongoose.model('Item', itemSchema);

const teamSchema = new mongoose.Schema({
  teamId: { type: Number, required: true, unique: true },
  hashId: { type: String, required: true, unique: true, default: () => crypto.randomBytes(4).toString('hex') },
  name: { type: String, required: true },
  currentItem: { type: String, default: null },
  sentAt: { type: Date, default: null },
  score: { type: Number, default: 0 }
});
const Team = mongoose.model('Team', teamSchema);

const gameStateSchema = new mongoose.Schema({
  singleton: { type: String, default: 'STATE', unique: true },
  adminPassword: { type: String, default: '' },
  timerIsRunning: { type: Boolean, default: false },
  timerEndTime: { type: Date, default: null },
  timerRemaining: { type: Number, default: 300 }
});
const GameState = mongoose.model('GameState', gameStateSchema);

const spotlightStateSchema = new mongoose.Schema({
  singleton: { type: String, default: 'SPOTLIGHT', unique: true },
  prompts: [String],
  currentPrompt: { type: String, default: null },
  spotlightedTeamId: { type: String, default: null },
  timerIsRunning: { type: Boolean, default: false },
  timerEndTime: { type: Date, default: null },
  timerRemaining: { type: Number, default: 45 },
  feedbacks: {
    type: [{
      fromTeamId: String,
      fromTeamName: String,
      fluency: Boolean,
      structure: String,
      completion: Boolean,
      vocabulary: String,
      timestamp: { type: Date, default: Date.now }
    }],
    default: []
  }
});
const SpotlightState = mongoose.model('SpotlightState', spotlightStateSchema);

// Dino Party Schema
const dinoPartyPlayerSchema = new mongoose.Schema({
  teamId: { type: mongoose.Schema.Types.ObjectId },
  name: String,
  position: { type: Number, default: 0 },
  skipNextTurn: { type: Boolean, default: false }
}, { _id: false });

const DEFAULT_QUESTIONS = [
  { q: "What does CSS stand for?", a: "", o: [] },
  { q: "Which HTML tag is used to define an internal style sheet?", a: "", o: [] },
  { q: "Which programming language is known as the language of the web?", a: "", o: [] },
  { q: "What does HTML stand for?", a: "", o: [] },
  { q: "Which CSS property controls the text size?", a: "", o: [] },
  { q: "How do you write 'Hello World' in an alert box?", a: "", o: [] },
  { q: "Which sign is used for jQuery?", a: "", o: [] },
  { q: "What is the correct way to write a JavaScript array?", a: "", o: [] },
  { q: "Which tag is used to create a hyperlink in HTML?", a: "", o: [] },
  { q: "What is the default port for HTTP?", a: "", o: [] },
  { q: "What is the default port for HTTPS?", a: "", o: [] },
  { q: "Which SQL statement is used to extract data from a database?", a: "", o: [] },
  { q: "In Git, how do you download changes from a remote repository without merging?", a: "", o: [] },
  { q: "What does API stand for?", a: "", o: [] },
  { q: "Which of the following is NOT a JavaScript framework/library?", a: "", o: [] }
];

const dinoPartySchema = new mongoose.Schema({
  singleton: { type: String, default: 'DINO_PARTY', unique: true },
  tiles: [{
    index: { type: Number },
    effect: { type: String, enum: ['none','obstacle','boost','swap','trap','gift','question'], default: 'none' },
    _id: false
  }],
  players: [dinoPartyPlayerSchema],
  currentPlayerIndex: { type: Number, default: 0 },
  lastRoll: {
    playerName: { type: String, default: null },
    teamId:     { type: String, default: null },
    value:      { type: Number, default: null },
    effect:     { type: String, default: null },
    effectDescription: { type: String, default: null },
    newPosition: { type: Number, default: null },
    timestamp:  { type: Date,   default: null }
  },
  gameStarted: { type: Boolean, default: false },
  winnerId:    { type: String,  default: null },
  winnerName:  { type: String,  default: null },
  questions: {
    type: [{
      q: String,
      a: String,
      o: [String],
      _id: false
    }],
    default: DEFAULT_QUESTIONS
  }
});
const DinoParty = mongoose.model('DinoParty', dinoPartySchema);

// Initial Seed & Migration Logic
async function seedDataIfNeeded() {
  try {
    const [wordCount, teamCount, stateCount] = await Promise.all([
      Item.countDocuments(),
      Team.countDocuments(),
      GameState.countDocuments()
    ]);
    
    await GameState.updateOne({ singleton: 'STATE' }, { $setOnInsert: { timerRemaining: 300 } }, { upsert: true });
    
    // Migrate existing teams to have a hashId if they don't
    const teamsWithoutHash = await Team.find({ hashId: { $exists: false } });
    if (teamsWithoutHash.length > 0) {
      for (const t of teamsWithoutHash) {
        t.hashId = crypto.randomBytes(4).toString('hex');
        await t.save();
      }
    }
    
    // Migrate DinoParty questions to single-line format if they contain MCQ options
    const dp = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (dp && (!dp.questions || dp.questions.length === 0 || dp.questions.some(q => q.o && q.o.length > 0))) {
      console.log('Migrating/Seeding DinoParty questions to single-line format...');
      dp.questions = DEFAULT_QUESTIONS;
      await dp.save();
    }
    
    if (wordCount === 0 && teamCount === 0) {
      console.log('Database is empty. Seeding from words.json...');
      const dataPath = path.join(__dirname, 'words.json');
      if (fs.existsSync(dataPath)) {
        const raw = fs.readFileSync(dataPath, 'utf8');
        const data = JSON.parse(raw);
        
        const itemPromises = (data.words || []).map(w => new Item({ text: w }).save());
        const teamPromises = [];
        
        if (data.teams) {
          for (const [idStr, tData] of Object.entries(data.teams)) {
            teamPromises.push(new Team({
              teamId: parseInt(idStr, 10),
              hashId: crypto.randomBytes(4).toString('hex'),
              name: tData.name,
              currentItem: tData.word,
              sentAt: tData.sentAt
            }).save());
          }
        }
        
        await Promise.all([...itemPromises, ...teamPromises]);
        console.log('Seeding complete.');
      }
    }
  } catch (err) {
    console.error('Error during seeding:', err);
  }
}

// API Routes

// Keep-alive ping route
app.get('/api/ping', (req, res) => {
  res.send('pong');
});

// Admin authentication middleware
const requireAdmin = async (req, res, next) => {
  try {
    let state = await GameState.findOne({ singleton: 'STATE' });
    let adminPassword = state ? state.adminPassword : '';
    // Fallback to env var if database is empty, to prevent lockout if someone manually set env var
    if (!adminPassword && process.env.ADMIN_PASSWORD) {
        adminPassword = process.env.ADMIN_PASSWORD;
    }
    
    if (!adminPassword) {
      return next(); // If no password is set, allow access
    }
    const providedPassword = req.headers['x-admin-password'];
    if (providedPassword === adminPassword) {
      next();
    } else {
      res.status(401).json({ error: 'Unauthorized' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// GET all state
app.get('/api/state', requireAdmin, async (req, res) => {
  try {
    const [itemsDocs, teamsDocs, stateDoc] = await Promise.all([
      Item.find(),
      Team.find().sort({ teamId: 1 }),
      GameState.findOne({ singleton: 'STATE' })
    ]);
    
    const items = itemsDocs.map(w => w.text);

    const teams = {};
    for (const t of teamsDocs) {
      teams[t._id] = {
        _id: t._id,
        hashId: t.hashId,
        name: t.name,
        item: t.currentItem,
        sentAt: t.sentAt,
        score: t.score || 0
      };
    }
    
    const timer = stateDoc ? {
      isRunning: stateDoc.timerIsRunning,
      endTime: stateDoc.timerEndTime,
      remaining: stateDoc.timerRemaining
    } : null;

    res.json({ items, teams, timer });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST items bulk update
app.post('/api/items/bulk', requireAdmin, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ error: 'Array required' });
    
    const existingItems = await Item.find();
    const existingTexts = existingItems.map(w => w.text);
    const newTexts = [...new Set(items.map(w => w.trim()).filter(Boolean))]; // ensure unique
    
    const deletedTexts = existingTexts.filter(t => !newTexts.includes(t));
    
    const promises = [Item.deleteMany({})];
    
    if (deletedTexts.length > 0) {
      promises.push(Team.updateMany(
        { currentItem: { $in: deletedTexts } },
        { currentItem: null, sentAt: null }
      ));
    }
    
    await Promise.all(promises);
    
    const newDocs = newTexts.map(text => ({ text }));
    if (newDocs.length > 0) {
      await Item.insertMany(newDocs);
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new team
app.post('/api/teams', requireAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    
    const highestTeam = await Team.findOne().sort('-teamId');
    const newTeamId = highestTeam ? highestTeam.teamId + 1 : 1;
    
    const team = new Team({ 
      teamId: newTeamId, 
      hashId: crypto.randomBytes(4).toString('hex'),
      name 
    });
    await team.save();
    res.json({ success: true, team });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update team
app.put('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    await Team.findByIdAndUpdate(id, { name });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE team
app.delete('/api/teams/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await Team.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send item to team
app.post('/api/send', requireAdmin, async (req, res) => {
  try {
    const { teamId, item } = req.body;
    
    const isMongoId = mongoose.Types.ObjectId.isValid(teamId) && (String(new mongoose.Types.ObjectId(teamId)) === String(teamId));
    
    let teamPromise;
    if (isMongoId) {
      teamPromise = Team.findById(teamId);
    } else {
      teamPromise = Team.findOne({ hashId: String(teamId) }).then(t => t || (!isNaN(Number(teamId)) ? Team.findOne({ teamId: Number(teamId) }) : null));
    }
    
    const [team, itemExists] = await Promise.all([
      teamPromise,
      Item.findOne({ text: item })
    ]);
    
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (!itemExists) return res.status(400).json({ error: 'Invalid item' });

    team.currentItem = item;
    team.sentAt = new Date();
    await team.save();
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST update team score
app.post('/api/score', requireAdmin, async (req, res) => {
  try {
    const { teamId, delta } = req.body;
    
    const isMongoId = mongoose.Types.ObjectId.isValid(teamId) && (String(new mongoose.Types.ObjectId(teamId)) === String(teamId));
    
    let team;
    if (isMongoId) {
      team = await Team.findById(teamId);
    }
    if (!team) {
      team = await Team.findOne({ hashId: String(teamId) });
    }
    if (!team && !isNaN(Number(teamId))) {
      team = await Team.findOne({ teamId: Number(teamId) });
    }
    
    if (!team) return res.status(404).json({ error: 'Team not found' });

    team.score = (team.score || 0) + Number(delta);
    await team.save();
    
    res.json({ success: true, score: team.score });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET specific team
app.get('/api/team/:id', async (req, res) => {
  try {
    const searchId = req.params.id;
    // Search by MongoDB _id to guarantee cryptographic unguessability and zero leakage
    let team = await Team.findById(searchId);
    
    if (team) {
      res.json({ _id: team._id, item: team.currentItem, name: team.name });
    } else {
      res.status(404).json({ error: "Team not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST reset all teams (items and scores)
app.post('/api/reset', requireAdmin, async (req, res) => {
  try {
    await Team.updateMany({}, { currentItem: null, sentAt: null, score: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST reset only scores
app.post('/api/reset_scores', requireAdmin, async (req, res) => {
  try {
    await Team.updateMany({}, { score: 0 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST control timer
app.post('/api/timer', requireAdmin, async (req, res) => {
  try {
    const { action, value } = req.body;
    let state = await GameState.findOne({ singleton: 'STATE' });
    if (!state) {
      state = new GameState();
    }

    if (action === 'start') {
      if (!state.timerIsRunning) {
        state.timerIsRunning = true;
        // Calculate new end time based on remaining
        state.timerEndTime = new Date(Date.now() + (state.timerRemaining * 1000));
      }
    } else if (action === 'pause') {
      if (state.timerIsRunning) {
        state.timerIsRunning = false;
        // Calculate remaining time
        if (state.timerEndTime) {
          const rem = Math.max(0, Math.floor((state.timerEndTime.getTime() - Date.now()) / 1000));
          state.timerRemaining = rem;
        }
      }
    } else if (action === 'reset') {
      state.timerIsRunning = false;
      state.timerRemaining = 300;
      state.timerEndTime = null;
    } else if (action === 'set') {
      const newSecs = parseInt(value, 10);
      if (!isNaN(newSecs) && newSecs >= 0) {
        if (state.timerIsRunning) {
          state.timerEndTime = new Date(Date.now() + (newSecs * 1000));
        } else {
          state.timerRemaining = newSecs;
        }
      }
    }

    await state.save();
    res.json({ success: true, timer: { isRunning: state.timerIsRunning, endTime: state.timerEndTime, remaining: state.timerRemaining } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST set admin password
app.post('/api/admin-password', requireAdmin, async (req, res) => {
  try {
    const { password } = req.body;
    await GameState.findOneAndUpdate(
      { singleton: 'STATE' },
      { $set: { adminPassword: password || '' } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === SPOTLIGHT API ===

app.get('/api/spotlight/state', async (req, res) => {
  try {
    let state = await SpotlightState.findOne({ singleton: 'SPOTLIGHT' });
    if (!state) {
      state = new SpotlightState({
        prompts: [
          "How has technology changed the way people communicate?",
          "Do you think people will read fewer books in the future?",
          "What are the advantages and disadvantages of living in a large city?"
        ]
      });
      await state.save();
    }
    res.json(state);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/prompts', requireAdmin, async (req, res) => {
  try {
    const { prompts } = req.body;
    if (!Array.isArray(prompts)) return res.status(400).json({ error: 'Array required' });
    await SpotlightState.findOneAndUpdate(
      { singleton: 'SPOTLIGHT' },
      { $set: { prompts } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/current-prompt', requireAdmin, async (req, res) => {
  try {
    const { currentPrompt } = req.body;
    await SpotlightState.findOneAndUpdate(
      { singleton: 'SPOTLIGHT' },
      { $set: { currentPrompt } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/team', requireAdmin, async (req, res) => {
  try {
    const { spotlightedTeamId } = req.body;
    await SpotlightState.findOneAndUpdate(
      { singleton: 'SPOTLIGHT' },
      { $set: { spotlightedTeamId, feedbacks: [] } }, // clear feedback when switching spotlight
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/timer', requireAdmin, async (req, res) => {
  try {
    const { action, value } = req.body;
    let state = await SpotlightState.findOne({ singleton: 'SPOTLIGHT' });
    if (!state) state = new SpotlightState();

    if (action === 'start') {
      if (!state.timerIsRunning) {
        state.timerIsRunning = true;
        state.timerEndTime = new Date(Date.now() + (state.timerRemaining * 1000));
      }
    } else if (action === 'pause') {
      if (state.timerIsRunning) {
        state.timerIsRunning = false;
        if (state.timerEndTime) {
          const rem = Math.max(0, Math.floor((state.timerEndTime.getTime() - Date.now()) / 1000));
          state.timerRemaining = rem;
        }
      }
    } else if (action === 'reset') {
      state.timerIsRunning = false;
      state.timerRemaining = parseInt(value, 10) || 45;
      state.timerEndTime = null;
    }

    await state.save();
    res.json({ success: true, timer: { isRunning: state.timerIsRunning, endTime: state.timerEndTime, remaining: state.timerRemaining } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/feedback', async (req, res) => {
  try {
    const { teamId, fluency, structure, completion, vocabulary } = req.body;
    
    // verify team exists
    const isMongoId = mongoose.Types.ObjectId.isValid(teamId) && (String(new mongoose.Types.ObjectId(teamId)) === String(teamId));
    let team;
    if (isMongoId) {
      team = await Team.findById(teamId);
    } else {
      team = await Team.findOne({ hashId: String(teamId) }).then(t => t || (!isNaN(Number(teamId)) ? Team.findOne({ teamId: Number(teamId) }) : null));
    }

    if (!team) return res.status(404).json({ error: 'Team not found' });

    let state = await SpotlightState.findOne({ singleton: 'SPOTLIGHT' });
    if (!state) state = new SpotlightState();

    // Check if team already submitted feedback for current spotlight
    const existingIdx = state.feedbacks.findIndex(f => f.fromTeamId === String(team._id));
    if (existingIdx !== -1) {
      state.feedbacks[existingIdx] = { fromTeamId: String(team._id), fromTeamName: team.name, fluency, structure, completion, vocabulary, timestamp: new Date() };
    } else {
      state.feedbacks.push({ fromTeamId: String(team._id), fromTeamName: team.name, fluency, structure, completion, vocabulary, timestamp: new Date() });
    }

    await state.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/spotlight/clear-feedback', requireAdmin, async (req, res) => {
  try {
    await SpotlightState.findOneAndUpdate(
      { singleton: 'SPOTLIGHT' },
      { $set: { feedbacks: [] } },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// === DINO PARTY API ===

// GET full game state (public)
app.get('/api/dino-party/state', async (req, res) => {
  try {
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game) return res.json({ gameStarted: false, players: [], tiles: [], currentPlayerIndex: 0, lastRoll: null, winnerId: null, winnerName: null });
    res.json(game);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST setup new game (admin)
app.post('/api/dino-party/setup', requireAdmin, async (req, res) => {
  try {
    const teams = await Team.find().sort({ teamId: 1 });
    if (teams.length === 0) return res.status(400).json({ error: 'No teams found. Create teams from the main host page first.' });
    const effects = Array(28).fill('question');
    const specials = ['obstacle','obstacle','obstacle', 'boost','boost','boost', 'swap','swap','swap', 'trap','trap','trap', 'gift','gift','gift'];
    const indices = Array.from({ length: 28 }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    specials.forEach((effect, idx) => {
      effects[indices[idx]] = effect;
    });
    const tiles = Array.from({ length: 30 }, (_, i) => {
      if (i === 0 || i === 29) return { index: i, effect: 'none' };
      return { index: i, effect: effects[i - 1] };
    });
    const players = teams.map(t => ({ teamId: t._id, name: t.name, position: 0, skipNextTurn: false }));
    await DinoParty.findOneAndUpdate(
      { singleton: 'DINO_PARTY' },
      { $set: { tiles, players, currentPlayerIndex: 0,
        lastRoll: { playerName: null, teamId: null, value: null, effect: null, effectDescription: null, newPosition: null, timestamp: null },
        gameStarted: true, winnerId: null, winnerName: null } },
      { upsert: true, new: true }
    );
    res.json({ success: true, playerCount: players.length, tileCount: tiles.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST player rolls dice (public)
app.post('/api/dino-party/roll', async (req, res) => {
  try {
    const { teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game || !game.gameStarted) return res.status(400).json({ error: 'Game not started' });
    if (game.winnerId) return res.status(400).json({ error: 'Game already over' });
    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return res.status(400).json({ error: 'No current player' });
    if (currentPlayer.teamId.toString() !== teamId.toString())
      return res.status(403).json({ error: 'Not your turn', currentPlayerName: currentPlayer.name });

    // Handle skip-turn
    if (currentPlayer.skipNextTurn) {
      currentPlayer.skipNextTurn = false;
      game.lastRoll = { playerName: currentPlayer.name, teamId, value: 0, effect: 'trap',
        effectDescription: currentPlayer.name + "'s turn was skipped!", newPosition: currentPlayer.position, timestamp: new Date() };
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
      game.markModified('players'); game.markModified('lastRoll');
      await game.save();
      return res.json({ success: true, skipped: true, lastRoll: game.lastRoll });
    }

    const rollValue = Math.floor(Math.random() * 6) + 1;
    let newPosition = currentPlayer.position + rollValue;

    const handleWin = async () => {
      currentPlayer.position = 29;
      game.winnerId = teamId; game.winnerName = currentPlayer.name; game.gameStarted = false;
      game.lastRoll = { playerName: currentPlayer.name, teamId, value: rollValue, effect: 'win',
        effectDescription: currentPlayer.name + ' WINS THE RACE!', newPosition: 29, timestamp: new Date() };
      game.markModified('players'); game.markModified('lastRoll');
      await game.save();
      return res.json({ success: true, rollValue, newPosition: 29, effect: 'win',
        effectDescription: game.lastRoll.effectDescription, lastRoll: game.lastRoll });
    };

    if (newPosition >= 29) return handleWin();

    const tile = game.tiles.find(t => t.index === newPosition);
    let effect = tile ? tile.effect : 'none';
    let effectDescription = '';
    let rollAgain = false;

    switch (effect) {
      case 'obstacle':
        newPosition = Math.max(0, newPosition - 2);
        effectDescription = 'Obstacle! Fall back 2 tiles.';
        break;
      case 'boost':
        newPosition = Math.min(29, newPosition + 3);
        effectDescription = 'Boost! Leap forward 3 tiles!';
        if (newPosition >= 29) return handleWin();
        break;
      case 'swap': {
        const maxPos = Math.max(...game.players.map(p => p.position));
        const isLosing = newPosition < maxPos;
        if (isLosing) {
          effectDescription = currentPlayer.name + ' landed on a Swap Block! Swap Challenge available!';
        } else {
          effect = 'none';
          effectDescription = currentPlayer.name + ' is in the lead — no swap challenge!';
        }
        break;
      }
      case 'trap':
        currentPlayer.skipNextTurn = true;
        effectDescription = 'Trap! Skip your next turn.';
        break;
      case 'gift':
        rollAgain = true;
        effectDescription = 'Gift! Roll again!';
        break;
      case 'question':
        effectDescription = 'Question Block! Answer correctly to advance!';
        break;
      default: effectDescription = '';
    }

    currentPlayer.position = newPosition;
    game.lastRoll = { playerName: currentPlayer.name, teamId, value: rollValue, effect, effectDescription, newPosition, timestamp: new Date() };
    if (!rollAgain && effect !== 'question' && effect !== 'swap') game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    game.markModified('players'); game.markModified('lastRoll');
    await game.save();
    res.json({ success: true, rollValue, newPosition, effect, effectDescription, rollAgain, lastRoll: game.lastRoll });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST process question result (correct/incorrect) (admin)
app.post('/api/dino-party/question-result', requireAdmin, async (req, res) => {
  try {
    const { teamId, correct } = req.body;
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game || !game.gameStarted) return res.status(400).json({ error: 'Game not active' });
    
    const playerIdx = game.players.findIndex(p => p.teamId.toString() === teamId.toString());
    if (playerIdx === -1) return res.status(400).json({ error: 'Player not found' });
    const player = game.players[playerIdx];
    
    let newPosition = player.position;
    let description = '';
    
    if (correct) {
      newPosition = Math.min(29, player.position + 2);
      description = `${player.name} answered CORRECTLY! Advanced 2 tiles.`;
    } else {
      newPosition = Math.max(0, player.position - 1);
      description = `${player.name} answered INCORRECTLY! Slipped back 1 tile.`;
    }
    
    player.position = newPosition;
    
    if (newPosition >= 29) {
      game.winnerId = teamId;
      game.winnerName = player.name;
      game.gameStarted = false;
      game.lastRoll = { playerName: player.name, teamId, value: 0, effect: 'win', effectDescription: `${player.name} WINS THE RACE!`, newPosition: 29, timestamp: new Date() };
    } else {
      game.lastRoll = { playerName: player.name, teamId, value: 0, effect: correct ? 'boost' : 'obstacle', effectDescription: description, newPosition, timestamp: new Date() };
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    }
    
    game.markModified('players');
    game.markModified('lastRoll');
    await game.save();
    
    res.json({ success: true, newPosition, lastRoll: game.lastRoll });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST update custom questions list (admin)
app.post('/api/dino-party/questions', requireAdmin, async (req, res) => {
  try {
    const { questions } = req.body;
    if (!Array.isArray(questions)) return res.status(400).json({ error: 'questions must be an array' });
    for (const q of questions) {
      if (!q.q) {
        return res.status(400).json({ error: 'Each question must have question text (q)' });
      }
      if (q.a === undefined) q.a = '';
      if (!Array.isArray(q.o)) q.o = [];
    }
    const game = await DinoParty.findOneAndUpdate(
      { singleton: 'DINO_PARTY' },
      { $set: { questions } },
      { upsert: true, new: true }
    );
    res.json({ success: true, count: game.questions.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST process swap result (accept/reject) (admin)
app.post('/api/dino-party/swap-result', requireAdmin, async (req, res) => {
  try {
    const { teamId, targetTeamId, accepted } = req.body;
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game || !game.gameStarted) return res.status(400).json({ error: 'Game not active' });
    
    const playerIdx = game.players.findIndex(p => p.teamId.toString() === teamId.toString());
    if (playerIdx === -1) return res.status(400).json({ error: 'Player not found' });
    const player = game.players[playerIdx];
    
    let description = '';
    let finalPos = player.position;
    let oldPos = player.position;
    
    if (accepted && targetTeamId) {
      const targetIdx = game.players.findIndex(p => p.teamId.toString() === targetTeamId.toString());
      if (targetIdx !== -1) {
        const targetPlayer = game.players[targetIdx];
        const targetPos = targetPlayer.position;
        
        targetPlayer.position = oldPos;
        player.position = targetPos;
        finalPos = targetPos;
        
        description = `Swap Challenge Accepted! ${player.name} swapped positions with ${targetPlayer.name}!`;
        
        if (finalPos >= 29) {
          game.winnerId = teamId;
          game.winnerName = player.name;
          game.gameStarted = false;
          game.lastRoll = { playerName: player.name, teamId, value: 0, effect: 'win', effectDescription: `${player.name} WINS THE RACE!`, newPosition: 29, timestamp: new Date() };
        } else {
          game.lastRoll = { playerName: player.name, teamId, value: 0, effect: 'swap', effectDescription: description, newPosition: finalPos, timestamp: new Date() };
          game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        }
      } else {
        return res.status(400).json({ error: 'Target player not found' });
      }
    } else {
      description = `Swap Challenge Rejected! ${player.name} stayed at tile ${oldPos + 1}.`;
      game.lastRoll = { playerName: player.name, teamId, value: 0, effect: 'none', effectDescription: description, newPosition: oldPos, timestamp: new Date() };
      game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
    }
    
    game.markModified('players');
    game.markModified('lastRoll');
    await game.save();
    
    res.json({ success: true, newPosition: player.position, lastRoll: game.lastRoll });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST reset positions (admin)
app.post('/api/dino-party/reset', requireAdmin, async (req, res) => {
  try {
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game) return res.status(404).json({ error: 'No game found. Run Setup first.' });
    game.players.forEach(p => { p.position = 0; p.skipNextTurn = false; });
    game.currentPlayerIndex = 0;
    game.lastRoll = { playerName: null, teamId: null, value: null, effect: null, effectDescription: null, newPosition: null, timestamp: null };
    game.gameStarted = true; game.winnerId = null; game.winnerName = null;
    game.markModified('players'); game.markModified('lastRoll');
    await game.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET player-specific state (public)
app.get('/api/dino-party/player/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const game = await DinoParty.findOne({ singleton: 'DINO_PARTY' });
    if (!game) return res.json({ gameStarted: false, playerName: null });
    const playerIdx = game.players.findIndex(p => p.teamId.toString() === teamId);
    if (playerIdx === -1) return res.status(404).json({ error: 'Player not in this game. Ask the host to set up.' });
    const player = game.players[playerIdx];
    const currentPlayer = game.players[game.currentPlayerIndex];
    res.json({
      gameStarted: game.gameStarted, playerName: player.name,
      position: player.position, skipNextTurn: player.skipNextTurn,
      isMyTurn: !!(currentPlayer && currentPlayer.teamId.toString() === teamId),
      currentPlayerName: currentPlayer ? currentPlayer.name : null,
      lastRoll: game.lastRoll, winnerId: game.winnerId, winnerName: game.winnerName,
      totalTiles: game.tiles.length || 30
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Fallback routing for HTML pages
app.get('/scoreboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'scoreboard.html'));
});

app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/team/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.get('/dino-party', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dino-party.html'));
});

app.get('/dino-party', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dino-party.html'));
});

app.get('/dino-party/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dino-party-player.html'));
});

app.get('/spotlight-host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'spotlight-host.html'));
});

app.get('/spotlight', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'spotlight.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
