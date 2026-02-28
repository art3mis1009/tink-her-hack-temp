
const supabaseUrl = 'https://gfuggdbyjjtrripxadpx.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmdWdnZGJ5amp0cnJpcHhhZHB4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxOTA5MTUsImV4cCI6MjA4Nzc2NjkxNX0.4wMizgOvjfCrsSzvzWtcjv2pMaJDUOxBsPt1ySkzx_o';
const client = supabase.createClient(supabaseUrl, supabaseKey);

// pairing state for multi-device
let currentUser = null;
let partnerId = null;
let partnerName = null;
let pairingCode = null;

// --- AUTHENTICATION LOGIC ---

// frontend auth handlers used on index.html
function showAuth(tab) {
    document.getElementById('tab-login').classList.toggle('active', tab==='login');
    document.getElementById('tab-signup').classList.toggle('active', tab==='signup');
    document.getElementById('form-login').classList.toggle('active', tab==='login');
    document.getElementById('form-signup').classList.toggle('active', tab==='signup');
}

async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const err = document.getElementById('auth-error');
    if(!email||!password){ err.innerText='Fill both fields'; return; }
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if(error) { err.innerText = error.message; }
    else window.location.href='dashboard.html';
}

async function signup() {
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const username = document.getElementById('signup-username').value;
    const err = document.getElementById('auth-error');
    if(!email||!password||!username){ err.innerText='Complete all fields'; return; }
    const { data, error } = await client.auth.signUp({ email, password });
    if(error) { err.innerText = error.message; }
    else {
        const userId = data.user.id;
        await client.from('profiles').insert({ id: userId, username });
        alert('Account created, please login');
        showAuth('login');
    }
}

async function signUp() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const username = document.getElementById('username').value;
    const errorMsg = document.getElementById('error-msg');

    if (!email || !password || !username) {
        errorMsg.innerText = "Please fill all fields";
        return;
    }

    const { data, error } = await client.auth.signUp({ email, password });

    if (error) {
        errorMsg.innerText = error.message;
    } else {
        const userId = data.user.id;
        const { error: profileError } = await client
            .from('profiles')
            .insert({ id: userId, username });

        if (profileError) console.error("Profile error:", profileError);
        else alert("Account created! Please login.");
    }
}

async function signIn() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) alert(error.message);
    else window.location.href = 'dashboard.html';
}

async function logout() {
    await client.auth.signOut();
    window.location.href = 'index.html';
}

async function checkUser() {
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
        if (!window.location.href.includes('index.html')) window.location.href = 'index.html';
    } else if (window.location.href.includes('dashboard.html')) {
        currentUser = session.user;
        loadDashboard(session.user);
        checkPairingStatus();
        // auto-join via query param
        const params = new URLSearchParams(window.location.search);
        const code = params.get('pair');
        if(code) {
            document.getElementById('partner-code').value = code;
            pairWithPartner();
        }
    }
}

// --- PAIRING LOGIC (room codes) ---
function togglePairingModal() { const m = document.getElementById('pairing-modal'); if(!m) return; m.style.display = m.style.display === 'none' ? 'flex' : 'none'; }

async function checkPairingStatus() {
    if(!currentUser) return;
    const { data } = await client.from('pairs').select('*').or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`).single();
    if(data) {
        partnerId = data.user1 === currentUser.id ? data.user2 : data.user1;
        const { data: profile } = await client.from('profiles').select('username').eq('id', partnerId).single();
        if(profile) partnerName = profile.username;
        updatePairingUI();
    }
}

async function generatePairingCode() {
    pairingCode = Math.random().toString(36).substr(2,8).toUpperCase();
    const el = document.getElementById('my-code');
    if(el) el.innerText = pairingCode;
    const linkArea = document.getElementById('pair-link-area');
    const linkEl = document.getElementById('pair-link');
    if(linkArea && linkEl) {
        const url = `${window.location.origin}${window.location.pathname}?pair=${pairingCode}`;
        linkEl.href = url;
        linkEl.innerText = url;
        linkArea.style.display = 'block';
    }
    try { await client.from('profiles').update({ pair_code: pairingCode }).eq('id', currentUser.id); } catch(e){ console.error(e); }
}

async function pairWithPartner() {
    const code = document.getElementById('partner-code')?.value?.trim().toUpperCase();
    if(!code) { alert('Enter partner code'); return; }
    const { data: users } = await client.from('profiles').select('id,username').eq('pair_code', code).single();
    if(!users || users.id === currentUser.id) { alert('Invalid code'); return; }
    partnerId = users.id;
    partnerName = users.username;
    // insert pair record
    await client.from('pairs').insert({ user1: currentUser.id, user2: partnerId });
    updatePairingUI();
}

async function unpair() {
    if(!currentUser) return;
    await client.from('pairs').delete().or(`user1.eq.${currentUser.id},user2.eq.${currentUser.id}`);
    partnerId = null;
    partnerName = null;
    updatePairingUI();
}

function updatePairingUI() {
    const ia = document.getElementById('pair-input-area');
    const aa = document.getElementById('pair-action-area');
    const btn = document.getElementById('pairing-btn');
    if(partnerId) {
        if(ia) ia.style.display='none';
        if(aa) { aa.style.display='block'; document.getElementById('paired-partner-name').innerText = partnerName || 'Friend'; }
        if(btn) btn.style.background='#4ade80';
    } else {
        if(ia) ia.style.display='block';
        if(aa) aa.style.display='none';
        if(btn) btn.style.background='';
    }
}

// --- NAVIGATION LOGIC ---
function showSection(sectionName, event) {
    // Hide all sections
    const sections = ['chat', 'games', 'draw', 'watch', 'listen', 'quiz', 'calendar'];
    sections.forEach(sec => {
        const el = document.getElementById(`section-${sec}`);
        if (el) el.style.display = 'none';
    });

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    if(event) event.target.classList.add('active');

    // Show selected section
    const activeSection = document.getElementById(`section-${sectionName}`);
    if (activeSection) activeSection.style.display = 'block';
    // If Draw section shown, initialize canvas after it becomes visible and wire controls
    if (sectionName === 'draw') {
        setTimeout(() => {
            initCanvas();
            const colorInput = document.getElementById('brushColor');
            if (colorInput) colorInput.addEventListener('input', e => setColor(e.target.value));
            const sizeInput = document.getElementById('brushSize');
            const sizeDisplay = document.getElementById('brushSizeDisplay');
            if (sizeInput) {
                sizeInput.addEventListener('input', e => {
                    const v = parseInt(e.target.value, 10) || 3;
                    setBrushSize(v);
                    if (sizeDisplay) sizeDisplay.innerText = v;
                });
                if (sizeDisplay) sizeDisplay.innerText = sizeInput.value;
            }
            // start a round automatically if none active
            if (!currentWord) startRound();
        }, 50);
    }
    if (sectionName === 'calendar') {
        setTimeout(() => loadCalendar(), 20);
    }
}

// --- CHAT LOGIC ---
async function loadDashboard(user) {
    document.getElementById('user-display').innerText = user.email;
    showSection('chat');          // ensure chat shows on dashboard entry
    await loadMessages();

    // Real-time subscription for new messages
    client.channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            displayMessage(payload.new);
        })
        .subscribe();
}

async function sendMessage() {
    const input = document.getElementById('message-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const { data: { session } } = await client.auth.getSession();
    if (!session) return;

    await client.from('messages').insert({
        content: text,
        user_email: session.user.email
    });

    input.value = "";
    // reload messages to ensure immediate display
    loadMessages();
}

async function deleteMessage(msgId) {
    if(!msgId) return;
    await client.from('messages').delete().eq('id', msgId);
    // remove from DOM
    const container = document.getElementById('messages');
    if(container) {
        const msgs = container.querySelectorAll('.message');
        msgs.forEach(m => {
            if(m.textContent.includes(msgId)) {
                // not reliable; simpler to reload messages
            }
        });
        // just reload full list
        loadMessages();
    }
}

async function loadMessages() {
    const { data, error } = await client
        .from('messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(50);

    if (error) return console.error(error);
    if (!data) return;

    const container = document.getElementById('messages');
    if (!container) return;
    container.innerHTML = "";
    data.forEach(msg => displayMessage(msg));
}

function displayMessage(msg) {
    const container = document.getElementById('messages');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'message';
    let deleteBtn = '';
    if(currentUser && currentUser.email === msg.user_email) {
        deleteBtn = `<span class="delete-msg" onclick="deleteMessage(${msg.id})">&times;</span>`;
    }
    div.innerHTML = `<strong>${msg.user_email}:</strong> ${msg.content} ${deleteBtn}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// --- THEME LOGIC ---
function changeTheme() {
    const theme = document.getElementById('theme-selector')?.value;
    const body = document.body;
    if (!theme) return;

    if (theme === 'neon') body.style.background = "linear-gradient(to right, #00f260, #0575e6)";
    else if (theme === 'retro') body.style.background = "linear-gradient(to right, #ff00cc, #333399)";
    else body.style.background = "linear-gradient(135deg, #ff9a9e 0%, #fecfef 99%, #a18cd1 100%)";
}

// --- TIC TAC TOE GAME ---
let currentPlayer = "X";
let boardState = Array(9).fill("");
let gameActive = true;

function makeMove(cellIndex) {
    if (boardState[cellIndex] !== "" || !gameActive) return;

    boardState[cellIndex] = currentPlayer;
    const cell = document.querySelectorAll('.cell')[cellIndex];
    if(cell) cell.innerText = currentPlayer;

    checkResult();
    currentPlayer = currentPlayer === "X" ? "O" : "X";
}

function checkResult() {
    const winningConditions = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
    ];

    let roundWon = false;
    for (let i = 0; i < winningConditions.length; i++) {
        const [a,b,c] = winningConditions[i];
        if (boardState[a] && boardState[a] === boardState[b] && boardState[a] === boardState[c]) {
            roundWon = true;
            break;
        }
    }

    const status = document.getElementById('game-status');
    if (roundWon) {
        if(status) status.innerText = `Player ${currentPlayer} Wins! 🎉`;
        gameActive = false;
        return;
    }

    if (!boardState.includes("")) {
        if(status) status.innerText = "It's a Draw! 🤝";
        gameActive = false;
    }
}

function resetGame() {
    currentPlayer = "X";
    boardState.fill("");
    gameActive = true;
    const status = document.getElementById('game-status');
    if(status) status.innerText = "";
    document.querySelectorAll('.cell').forEach(cell => cell.innerText = "");
}

// --- GAMES VIEW SWITCHER (TicTacToe / TruthOrDare) ---
function selectGameView(view) {
    document.querySelectorAll('.game-tab').forEach(btn => btn.classList.remove('active'));
    const btn = Array.from(document.querySelectorAll('.game-tab')).find(b => b.innerText.toLowerCase().includes(view === 'tic' ? 'tic' : 'truth'));
    if (btn) btn.classList.add('active');

    const tic = document.getElementById('games-tic');
    const tod = document.getElementById('games-tod');
    if (!tic || !tod) return;
    if (view === 'tic') {
        tic.style.display = 'block';
        tod.style.display = 'none';
    } else {
        tic.style.display = 'none';
        tod.style.display = 'block';
    }
}

// --- TRUTH OR DARE GAME LOGIC ---
const truths = [
    "What's the most embarrassing thing you've ever done?",
    "What's a secret you've never told anyone?",
    "Who was your first crush?"
];
const dares = [
    "Sing the chorus of your favorite song out loud.",
    "Do 10 jumping jacks right now.",
    "Send a silly selfie to your friend."
];

function pickTOD(type) {
    const promptEl = document.getElementById('tod-prompt');
    const answerArea = document.getElementById('tod-answer-area');
    const feedback = document.getElementById('tod-feedback');
    if (!promptEl || !answerArea) return;
    feedback.innerText = '';

    if (type === 'truth') {
        const q = truths[Math.floor(Math.random() * truths.length)];
        promptEl.innerText = `Truth: ${q}`;
        // show answer box for typed response
        answerArea.style.display = 'block';
    } else {
        const d = dares[Math.floor(Math.random() * dares.length)];
        promptEl.innerText = `Dare: ${d}`;
        // for dares still allow typed confirmation
        answerArea.style.display = 'block';
    }
}

function submitTodAnswer() {
    const input = document.getElementById('tod-answer-input');
    const feedback = document.getElementById('tod-feedback');
    if (!input || !feedback) return;
    const text = input.value.trim();
    if (!text) { feedback.style.color = 'red'; feedback.innerText = 'Please type an answer before submitting.'; return; }
    feedback.style.color = 'green';
    feedback.innerText = 'Answer submitted: ' + text;
    input.value = '';
}

// --- DRAWING GAME ---
let isDrawing = false, lastX = 0, lastY = 0, brushSize = 5, currentColor = "#000";

function initCanvas() {
    const canvas = document.getElementById('drawCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    ctx.fillStyle = "white";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    canvas.addEventListener('mousedown', e => {
        isDrawing = true;
        [lastX,lastY] = [e.offsetX,e.offsetY];
    });

    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', () => isDrawing = false);
    canvas.addEventListener('mouseout', () => isDrawing = false);
}

function draw(e) {
    if(!isDrawing) return;
    const canvas = document.getElementById('drawCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.beginPath();
    ctx.moveTo(lastX,lastY);
    ctx.lineTo(e.offsetX,e.offsetY);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = 'round';
    ctx.stroke();

    [lastX,lastY] = [e.offsetX,e.offsetY];
}

function setColor(color) { currentColor = color; }
function setBrushSize(size) { brushSize = size; }
function clearCanvas() {
    const canvas = document.getElementById('drawCanvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = "white";
    ctx.fillRect(0,0,canvas.width,canvas.height);
}

// --- DRAW & GUESS GAME LOGIC ---
let drawRole = 'drawer';
let currentWord = '';
let drawScore = 0;
const drawWords = ['cat','house','tree','sun','car','pizza','guitar','flower','dog','rocket'];

function setDrawRole(role) {
    drawRole = role;
    document.querySelectorAll('.game-btn').forEach(b=>b.classList.remove('active'));
    const btns = Array.from(document.querySelectorAll('.game-btn'));
    const btn = btns.find(x=>x.innerText.toLowerCase().includes(role));
    if(btn) btn.classList.add('active');
    document.getElementById('drawer-view').style.display = role === 'drawer' ? 'block' : 'none';
    document.getElementById('guesser-view').style.display = role === 'guesser' ? 'block' : 'none';
}

function startRound() {
    currentWord = drawWords[Math.floor(Math.random()*drawWords.length)];
    const wordEl = document.getElementById('draw-word');
    if(wordEl) wordEl.innerText = currentWord;
    // clear previous snapshot/feedback
    const snap = document.getElementById('snapshot-img'); if(snap) snap.src = '';
    const res = document.getElementById('guess-result'); if(res) res.innerText = '';
    // ensure drawer view active
    setDrawRole('drawer');
    // initialize canvas
    initCanvas();
}

function finishDrawing() {
    const canvas = document.getElementById('drawCanvas');
    const snap = document.getElementById('snapshot-img');
    if(!canvas || !snap) return;
    // capture image and switch to guesser view
    const data = canvas.toDataURL('image/png');
    snap.src = data;
    setDrawRole('guesser');
}

function submitGuess() {
    const input = document.getElementById('guess-input');
    const res = document.getElementById('guess-result');
    if(!input || !res) return;
    const guess = input.value.trim().toLowerCase();
    if(!guess) { res.style.color='red'; res.innerText = 'Please enter a guess.'; return; }
    if(!currentWord) { res.style.color='red'; res.innerText = 'No active word. Start a new round.'; return; }
    if(guess === currentWord.toLowerCase()) {
        drawScore++;
        document.getElementById('draw-score').innerText = drawScore;
        res.style.color='green';
        res.innerText = `Correct! It was "${currentWord}".`;
    } else {
        res.style.color='orange';
        res.innerText = `Not quite. Try again or start a new round.`;
    }
    input.value = '';
}


// --- WATCH TOGETHER ---
function syncVideo() {
    const videoUrl = document.getElementById('videoUrl')?.value;
    const videoContainer = document.getElementById('sharedVideo');
    if(!videoUrl || !videoContainer) return;

    if(videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be')) {
        const videoId = videoUrl.includes('v=') ? videoUrl.split('v=')[1].split('&')[0] : videoUrl.split('/').pop();
        videoContainer.innerHTML = `<iframe width="100%" height="400" src="https://www.youtube.com/embed/${videoId}?autoplay=1" frameborder="0" allowfullscreen></iframe>`;
    } else alert("Please enter a YouTube URL!");
}

// --- LISTEN TOGETHER ---
function loadSpotifyPlaylist() {
    const playlistUrl = document.getElementById('spotifyUrl')?.value;
    const playerContainer = document.getElementById('musicPlayer');
    if(!playerContainer) return;

    if(playlistUrl && playlistUrl.includes('spotify.com')) {
        playerContainer.innerHTML = `<div style="background:#1DB954;padding:20px;border-radius:10px;color:white;">
            <h3>🎵 Spotify Player Loaded</h3><p>Playlist: ${playlistUrl}</p>
            <p><em>Use Spotify Web SDK for full functionality</em></p>
        </div>`;
    } else {
        playerContainer.innerHTML = `<div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);padding:20px;border-radius:10px;color:white;">
            <h3>🎵 LDR Romantic Vibes 🎵</h3>
            <audio controls style="width:100%; margin-top:10px;">
                <source src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" type="audio/mpeg">
                Your browser does not support the audio element.
            </audio>
        </div>`;
    }
}

// --- QUIZ GAME ---
const quizQuestions = [
    { question: "What is the most common way long-distance couples stay connected?", options:["Video calls","Sending letters","Texting","All of the above"], answer:3 },
    { question: "How many time zones apart is the maximum for a 'long-distance' relationship?", options:["1-2 hours","3-6 hours","6+ hours","No limit"], answer:2 },
    { question: "What is a popular activity couples do together online?", options:["Watch movies simultaneously","Play games","Cook same recipe","All of the above"], answer:3 }
];
let currentQuestion = 0, quizScore = 0;

function loadQuizQuestion() {
    if(currentQuestion >= quizQuestions.length) {
        document.getElementById('quiz-content').innerHTML = `<h2>Quiz Complete! 🎉</h2><p>Your Score: ${quizScore}/${quizQuestions.length}</p><button onclick="resetQuiz()" style="width:200px;">Play Again</button>`;
        return;
    }

    const q = quizQuestions[currentQuestion];
    document.getElementById('quiz-content').innerHTML = `<h3>Question ${currentQuestion+1}: ${q.question}</h3>
        <div style="display:flex; flex-direction:column; gap:10px;">
            ${q.options.map((opt,i)=>`<button onclick="checkAnswer(${i})" style="width:100%;">${opt}</button>`).join('')}
        </div>`;
}

function checkAnswer(selectedIndex) {
    if(selectedIndex === quizQuestions[currentQuestion].answer) quizScore++;
    currentQuestion++;
    loadQuizQuestion();
}

function resetQuiz() {
    currentQuestion = 0;
    quizScore = 0;
    loadQuizQuestion();
}

// --- INITIALIZE ---
document.addEventListener('DOMContentLoaded', () => {
    checkUser();
    // ensure chat section is active by default (in case checkUser didn't redirect)
    if(document.getElementById('section-chat')) showSection('chat');
    if(document.getElementById('drawCanvas')) initCanvas();
    if(document.getElementById('quiz-content')) loadQuizQuestion();
    // load calendar early so events persist between pages
    loadCalendar();
});

// --- CALENDAR (localStorage-backed) ---
const CAL_KEY = 'ldr_calendar_events_v1';
function loadCalendar() {
    const list = document.getElementById('calendar-list');
    if(!list) return;
    const raw = localStorage.getItem(CAL_KEY);
    let events = [];
    try { events = raw ? JSON.parse(raw) : []; } catch(e){ events = []; }
    // sort by date ascending
    events.sort((a,b)=> new Date(a.date) - new Date(b.date));
    renderCalendar(events);
}

function saveCalendar(events){
    localStorage.setItem(CAL_KEY, JSON.stringify(events || []));
}

function addCalendarEvent(){
    const title = document.getElementById('event-title')?.value?.trim();
    const date = document.getElementById('event-date')?.value;
    const type = document.getElementById('event-type')?.value || 'other';
    if(!title || !date){ alert('Please provide both title and date.'); return; }
    const raw = localStorage.getItem(CAL_KEY);
    let events = raw ? JSON.parse(raw) : [];
    const ev = { id: Date.now(), title, date, type };
    events.push(ev);
    saveCalendar(events);
    // clear form
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    renderCalendar(events);
}

function deleteCalendarEvent(id){
    const raw = localStorage.getItem(CAL_KEY);
    let events = raw ? JSON.parse(raw) : [];
    events = events.filter(e => e.id !== id);
    saveCalendar(events);
    renderCalendar(events);
}

function renderCalendar(events){
    const list = document.getElementById('calendar-list');
    if(!list) return;
    if(!events || events.length === 0){ list.innerHTML = '<p>No saved events yet.</p>'; return; }
    const today = new Date();
    list.innerHTML = events.map(e => {
        const dt = new Date(e.date);
        const nice = dt.toLocaleDateString();
        const upcoming = dt >= today ? '<strong style="color:green;">(upcoming)</strong>' : '';
        return `<div style="padding:8px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
            <div><div style="font-weight:bold;">${e.title}</div><div style="font-size:12px;color:#555;">${e.type} • ${nice} ${upcoming}</div></div>
            <div><button onclick="deleteCalendarEvent(${e.id})" style="padding:6px 10px;background:#ff6b6b;color:#fff;border:none;border-radius:4px;cursor:pointer;">Delete</button></div>
        </div>`;
    }).join('');
}