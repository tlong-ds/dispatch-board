require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

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
  sentAt: { type: Date, default: null }
});
const Team = mongoose.model('Team', teamSchema);

// Initial Seed & Migration Logic
async function seedDataIfNeeded() {
  try {
    const [wordCount, teamCount] = await Promise.all([
      Item.countDocuments(),
      Team.countDocuments()
    ]);
    
    // Migrate existing teams to have a hashId if they don't
    const teamsWithoutHash = await Team.find({ hashId: { $exists: false } });
    if (teamsWithoutHash.length > 0) {
      for (const t of teamsWithoutHash) {
        t.hashId = crypto.randomBytes(4).toString('hex');
        await t.save();
      }
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

// GET all state
app.get('/api/state', async (req, res) => {
  try {
    const [itemsDocs, teamsDocs] = await Promise.all([
      Item.find(),
      Team.find().sort({ teamId: 1 })
    ]);
    
    const items = itemsDocs.map(w => w.text);

    const teams = {};
    for (const t of teamsDocs) {
      teams[t.teamId] = {
        _id: t._id,
        hashId: t.hashId,
        name: t.name,
        item: t.currentItem,
        sentAt: t.sentAt
      };
    }
    
    res.json({ items, teams });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST items bulk update
app.post('/api/items/bulk', async (req, res) => {
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
app.post('/api/teams', async (req, res) => {
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
app.put('/api/teams/:id', async (req, res) => {
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
app.delete('/api/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await Team.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST send item to team
app.post('/api/send', async (req, res) => {
  try {
    const { teamId, item } = req.body;
    
    const [team, itemExists] = await Promise.all([
      Team.findOne({ teamId: Number(teamId) }),
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

// GET specific team
app.get('/api/team/:id', async (req, res) => {
  try {
    const searchId = req.params.id;
    // Search by hashId, or fallback to teamId for backwards compatibility
    let team = await Team.findOne({ hashId: searchId });
    if (!team && !isNaN(searchId)) {
      team = await Team.findOne({ teamId: Number(searchId) });
    }
    
    if (team) {
      res.json({ item: team.currentItem, name: team.name });
    } else {
      res.status(404).json({ error: "Team not found" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST reset all teams
app.post('/api/reset', async (req, res) => {
  try {
    await Team.updateMany({}, { currentItem: null, sentAt: null });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback routing for HTML pages
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/team/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'team.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
