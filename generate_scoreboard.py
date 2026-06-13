import re

with open('public/scoreboard.html', 'r') as f:
    content = f.read()

# Replace header
header_pattern = re.compile(r'<header>.*?</header>', re.DOTALL)
new_header = """<header>
  <h1>Dispatch Scoreboard</h1>
  <div>
    <button class="btn btn-primary" onclick="window.close()">BACK</button>
  </div>
</header>"""
content = header_pattern.sub(new_header, content)

# Replace container
container_pattern = re.compile(r'<div class="container">.*?</div>\n\n<script>', re.DOTALL)
new_container = """<div class="container">
  
  <div style="background: white; border: 4px solid var(--text); padding: 1.5rem; margin-bottom: 2rem; display: flex; flex-direction: column; align-items: center; box-shadow: 6px 6px 0px var(--text); z-index: 10; position: relative;">
    <h2 style="margin: 0 0 1rem 0;">COUNTDOWN</h2>
    <div id="timerDisplay" style="font-size: 3rem; margin-bottom: 1rem;">05:00</div>
    <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
      <button class="btn" style="background: var(--primary); color: white;" onclick="startTimer()">START</button>
      <button class="btn" style="background: #FBBF24; color: black;" onclick="pauseTimer()">PAUSE</button>
      <button class="btn" style="background: var(--danger); color: white;" onclick="resetTimer()">RESET</button>
    </div>
    
    <div style="display: flex; align-items: center; gap: 1rem; border-top: 2px dashed #ccc; padding-top: 1rem; width: 100%; justify-content: center;">
      <label style="font-size: 1rem;">SCORE TO WIN:</label>
      <input type="number" id="winThreshold" value="10" style="width: 80px; text-align: center; font-size: 1.2rem; padding: 0.5rem; border: 2px solid var(--text); font-family: 'PressStart2P', system-ui, sans-serif;">
    </div>
  </div>

  <div id="teamsGrid" class="team-grid">
    <!-- Teams will be populated here -->
  </div>
</div>

<!-- Graffiti Modal -->
<div id="graffitiModal" style="display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.8); z-index: 9999; justify-content: center; align-items: center; flex-direction: column;">
  <div id="winnerName" style="font-size: 4rem; color: #FF0055; text-shadow: 4px 4px 0 #00FFCC, -2px -2px 0 #FFEB3B, 0 0 20px #FF0055; transform: rotate(-5deg); margin-bottom: 2rem; text-align: center; line-height: 1.2;">
    TEAM WINS!
  </div>
  <button class="btn btn-primary" onclick="closeModal()">CONTINUE</button>
</div>

<script>"""
content = container_pattern.sub(new_container, content)

# Replace javascript logic
script_pattern = re.compile(r'<script>.*?</script>', re.DOTALL)
new_script = """<script>
  let teamsData = {};
  
  // Timer State
  let timerInterval;
  let timeLeft = 300; // 5 minutes default
  let timerRunning = false;

  function updateTimerDisplay() {
    const m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const s = (timeLeft % 60).toString().padStart(2, '0');
    document.getElementById('timerDisplay').innerText = `${m}:${s}`;
  }

  function startTimer() {
    if (timerRunning) return;
    timerRunning = true;
    timerInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateTimerDisplay();
      } else {
        pauseTimer();
      }
    }, 1000);
  }

  function pauseTimer() {
    timerRunning = false;
    clearInterval(timerInterval);
  }

  function resetTimer() {
    pauseTimer();
    timeLeft = 300;
    updateTimerDisplay();
  }

  function closeModal() {
    document.getElementById('graffitiModal').style.display = 'none';
  }

  function checkWinner() {
    const threshold = parseInt(document.getElementById('winThreshold').value, 10);
    for (const id in teamsData) {
      if (teamsData[id].score >= threshold) {
        document.getElementById('winnerName').innerText = `${teamsData[id].name}\\nWINS!`;
        document.getElementById('graffitiModal').style.display = 'flex';
        break; // Only show one winner at a time
      }
    }
  }

  async function apiFetch(url, options = {}) {
    const password = localStorage.getItem('adminPassword') || '';
    const headers = { 'Content-Type': 'application/json' };
    if (password) headers['x-admin-password'] = password;
    return fetch(url, { ...options, headers });
  }

  async function fetchState() {
    try {
      const res = await apiFetch('/api/state');
      if (res.status === 401) {
        const pwd = prompt('Admin Password required:');
        if (pwd !== null) {
          localStorage.setItem('adminPassword', pwd);
          return fetchState();
        }
        return;
      }
      const data = await res.json();
      teamsData = data.teams;
      renderTeams();
    } catch (err) {
      console.error(err);
    }
  }

  async function addScore(teamId, delta) {
    try {
      const res = await apiFetch('/api/score', {
        method: 'POST',
        body: JSON.stringify({ teamId, delta })
      });
      if (res.ok) {
        const data = await res.json();
        if (teamsData[teamId]) {
          teamsData[teamId].score = data.score;
        }
        renderTeams();
        checkWinner();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update score');
    }
  }

  function renderTeams() {
    const grid = document.getElementById('teamsGrid');
    grid.innerHTML = '';

    Object.keys(teamsData).forEach(id => {
      const team = teamsData[id];
      const card = document.createElement('div');
      card.className = 'team-card';
      
      card.innerHTML = `
        <div class="team-card-header" style="align-items: center; justify-content: center; margin-bottom: 1.5rem;">
          <h3 style="margin: 0; font-size: 1.2rem; text-align: center;">${team.name.replace(/</g, "&lt;")}</h3>
        </div>
        
        <div style="font-size: 3rem; text-align: center; margin-bottom: 2rem; color: var(--primary);">
          ${team.score || 0}
        </div>
        
        <div style="display: flex; gap: 0.5rem; justify-content: center;">
          <button class="btn" style="background: #10B981; color: white; padding: 0.5rem;" onclick="addScore('${id}', 1)">+1</button>
          <button class="btn" style="background: #3B82F6; color: white; padding: 0.5rem;" onclick="addScore('${id}', 2)">+2</button>
          <button class="btn" style="background: #8B5CF6; color: white; padding: 0.5rem;" onclick="addScore('${id}', 3)">+3</button>
          <button class="btn" style="background: #EF4444; color: white; padding: 0.5rem;" onclick="addScore('${id}', -1)">-1</button>
        </div>
      `;
      grid.appendChild(card);
    });
  }

  // Poll state every 3 seconds to catch resets or score changes from other clients
  setInterval(fetchState, 3000);

  // Initial load
  updateTimerDisplay();
  fetchState();
</script>"""
content = script_pattern.sub(new_script, content)

with open('public/scoreboard.html', 'w') as f:
    f.write(content)
