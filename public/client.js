const socket = io();

let playerName = '';
let cardData = [];
let currentGameMode = 'full';
let drawnNumbersHistory = [];
let isPausedGlobal = true;

const GAME_PATTERNS = {
    full: Array.from({ length: 25 }, (_, i) => i),
    line: null,
    cross: [2, 7, 10, 11, 12, 13, 14, 17, 22],
    heart: [1, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 18, 22],
    airplane: [1, 3, 6, 8, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24],
    champagne: [0, 1, 2, 3, 4, 6, 8, 12, 17, 22],
    turtle: [0, 2, 4, 6, 7, 8, 10, 11, 12, 13, 14, 16, 18],
    letter_l: [0, 5, 10, 15, 20, 21, 22, 23, 24],
    letter_t: [0, 1, 2, 3, 4, 7, 12, 17, 22],
    letter_z: [0, 1, 2, 3, 4, 8, 12, 16, 20, 21, 22, 23, 24],
    ladder: [0, 2, 4, 5, 7, 9, 10, 11, 12, 13, 14, 15, 17, 19, 20, 22, 24],
    sputnik: [0, 4, 6, 8, 12, 16, 18, 20, 24],
    triple_bingo: [0, 1, 2, 3, 4, 5, 9, 10, 14, 15, 19, 20, 21, 22, 23, 24]
};

let audioUnlocked = false;

function unlockAudio() {
    if (!audioUnlocked && 'speechSynthesis' in window) {
        const silentUtterance = new SpeechSynthesisUtterance('');
        window.speechSynthesis.speak(silentUtterance);
        audioUnlocked = true;
    }
}

function safeSpeak(text) {
    try {
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'es-CL';
            utterance.rate = 0.95;
            window.speechSynthesis.speak(utterance);
        }
    } catch (err) {
        console.warn('Audio no disponible:', err);
    }
}

function triggerVibration(duration = 40) {
    if ('vibrate' in navigator) {
        navigator.vibrate(duration);
    }
}

function updateStatusBadge(paused) {
    const statusBadge = document.getElementById('status-badge');
    const pauseBtn = document.getElementById('pause-bingo-btn');

    if (statusBadge) {
        statusBadge.innerText = paused ? 'Pausado' : 'En Juego';
        statusBadge.style.backgroundColor = paused ? '#ffb703' : '#2e7d32';
        if (paused) statusBadge.style.color = '#1d2d44';
        else statusBadge.style.color = '#ffffff';
    }

    if (pauseBtn) {
        pauseBtn.innerText = paused ? '▶️ REANUDAR BINGO' : '⏸️ PAUSAR BINGO';
    }
}

// Genera 5 números aleatorios sin repetir dentro de un rango determinado
function generateUniqueColumnNumbers(min, max, count) {
    const numbers = [];
    while (numbers.length < count) {
        const rand = Math.floor(Math.random() * (max - min + 1)) + min;
        if (!numbers.includes(rand)) numbers.push(rand);
    }
    return numbers;
}

// Login
document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    unlockAudio();
    const inputVal = document.getElementById('username-input').value.trim();
    if (inputVal) {
        playerName = inputVal;
        document.getElementById('player-display-name').innerText = playerName;
        document.getElementById('login-overlay').classList.add('hidden');
        generateBingoCard();
    }
});

// Generar Cartón con los rangos tradicionales B-I-N-G-O
function generateBingoCard() {
    const cardContainer = document.getElementById('bingo-card');
    if (!cardContainer) return;
    
    cardContainer.innerHTML = '';
    cardData = [];

    // Definición de rangos por columna B (1-15), I (16-30), N (31-45), G (46-60), O (61-75)
    const colB = generateUniqueColumnNumbers(1, 15, 5);
    const colI = generateUniqueColumnNumbers(16, 30, 5);
    const colN = generateUniqueColumnNumbers(31, 45, 4); // 4 números para dejar espacio a la estrella
    const colG = generateUniqueColumnNumbers(46, 60, 5);
    const colO = generateUniqueColumnNumbers(61, 75, 5);

    // Armar la grilla por filas (de 5x5)
    const gridValues = [
        [colB[0], colI[0], colN[0], colG[0], colO[0]],
        [colB[1], colI[1], colN[1], colG[1], colO[1]],
        [colB[2], colI[2], '⭐',     colG[2], colO[2]], // Estrella en el centro
        [colB[3], colI[3], colN[2], colG[3], colO[3]],
        [colB[4], colI[4], colN[3], colG[4], colO[4]]
    ];

    let index = 0;
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            const cellValue = gridValues[row][col];
            const isCenter = (cellValue === '⭐');

            const cellObj = { 
                number: cellValue, 
                marked: isCenter, 
                isCenter: isCenter,
                element: null 
            };
            cardData.push(cellObj);

            const cellEl = document.createElement('div');
            cellEl.classList.add('bingo-cell');
            if (isCenter) cellEl.classList.add('center-star', 'marked');
            cellEl.innerText = cellValue;
            cellObj.element = cellEl;

            cellEl.addEventListener('click', () => {
                unlockAudio();
                if (isCenter) return; // La estrella siempre queda marcada

                if (!drawnNumbersHistory.includes(cellValue)) {
                    triggerVibration([30, 50, 30]);
                    return;
                }

                triggerVibration(40);
                cellObj.marked = !cellObj.marked;
                cellEl.classList.toggle('marked', cellObj.marked);
            });

            cardContainer.appendChild(cellEl);
            index++;
        }
    }

    renderPatternOverlay();
}

function renderPatternOverlay() {
    const pattern = GAME_PATTERNS[currentGameMode];

    cardData.forEach((cell, index) => {
        if (!cell.element) return;
        cell.element.classList.remove('pattern-target');
        
        if (Array.isArray(pattern) && pattern.includes(index)) {
            cell.element.classList.add('pattern-target');
        }
    });
}

function getModeName(mode) {
    const names = {
        full: 'Cartón Lleno',
        line: 'Línea',
        cross: 'Cruz',
        heart: 'Corazón',
        airplane: '✈️ Avión',
        champagne: '🥂 Copa',
        turtle: '🐢 Tortuga',
        letter_l: '📐 Letra L',
        letter_t: '🔨 Letra T',
        letter_z: '⚡ Letra Z',
        ladder: '🪜 Escalera',
        sputnik: '🛰️ Sputnik',
        triple_bingo: '🖼️ Triple Bingo'
    };
    return names[mode] || mode;
}

// Controles de interfaz y modales
document.getElementById('admin-game-mode-btn')?.addEventListener('click', () => {
    unlockAudio();
    document.getElementById('mode-modal')?.classList.remove('hidden');
});

document.getElementById('close-mode-modal-btn')?.addEventListener('click', () => {
    document.getElementById('mode-modal')?.classList.add('hidden');
});

document.getElementById('admin-login-btn')?.addEventListener('click', () => {
    const user = document.getElementById('admin-user').value;
    const pass = document.getElementById('admin-pass').value;
    socket.emit('loginAdmin', { user, pass });
});

socket.on('adminAuthSuccess', () => {
    document.getElementById('admin-login-sec')?.classList.add('hidden');
    document.getElementById('admin-options-sec')?.classList.remove('hidden');
});

socket.on('adminAuthFailed', () => {
    alert('❌ Credenciales incorrectas');
});

document.getElementById('start-bingo-btn')?.addEventListener('click', () => {
    socket.emit('startBingoGame');
    document.getElementById('mode-modal')?.classList.add('hidden');
});

document.getElementById('pause-bingo-btn')?.addEventListener('click', () => {
    socket.emit('togglePauseBingo');
});

document.querySelectorAll('.mode-select-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const mode = e.target.getAttribute('data-mode');
        socket.emit('changeGameMode', mode);
        document.getElementById('mode-modal')?.classList.add('hidden');
    });
});

document.getElementById('lota-btn')?.addEventListener('click', () => {
    unlockAudio();
    triggerVibration(100);

    const cardNumbers = cardData.map(c => c.number);
    socket.emit('claimLota', {
        playerName: playerName,
        cardNumbers: cardNumbers
    });
});

// Eventos de Socket.io
socket.on('bingoStarted', (data) => {
    currentGameMode = data.gameMode;
    drawnNumbersHistory = [];
    isPausedGlobal = data.isPaused;

    document.getElementById('mode-title').innerText = getModeName(currentGameMode);
    updateStatusBadge(isPausedGlobal);

    document.getElementById('current-ball').innerText = '--';
    document.getElementById('ball-history').innerHTML = '';

    generateBingoCard();
    safeSpeak("Se da inicio al bingo, ¡empezamos!");
});

socket.on('pauseStateChanged', (data) => {
    isPausedGlobal = data.isPaused;
    updateStatusBadge(isPausedGlobal);

    if (isPausedGlobal) {
        safeSpeak("Juego pausado");
    } else {
        safeSpeak("Juego reanudado");
    }
});

socket.on('newBallDrawn', (data) => {
    drawnNumbersHistory = data.history;

    document.getElementById('current-ball').innerText = data.number;

    const historyContainer = document.getElementById('ball-history');
    if (historyContainer) {
        historyContainer.innerHTML = '';
        const lastBalls = data.history.slice(-5).reverse();
        
        lastBalls.forEach(num => {
            const ballEl = document.createElement('div');
            ballEl.classList.add('history-ball');
            ballEl.innerText = num;
            historyContainer.appendChild(ballEl);
        });
    }

    safeSpeak(`Número ${data.number}`);
});

socket.on('gameModeUpdated', (data) => {
    currentGameMode = data.gameMode;
    document.getElementById('mode-title').innerText = getModeName(currentGameMode);
    renderPatternOverlay();
});

socket.on('winnerDeclared', (data) => {
    safeSpeak(`¡Atención! ${data.winner} ha cantado Bingo`);
    document.getElementById('winner-message').innerText = `¡${data.winner} ha cantado BINGO / LOTA!`;
    document.getElementById('winner-modal')?.classList.remove('hidden');
});

socket.on('invalidClaim', (data) => {
    triggerVibration([100, 100, 100]);
    alert(data.message);
});

document.getElementById('close-modal-btn')?.addEventListener('click', () => {
    document.getElementById('winner-modal')?.classList.add('hidden');
});

socket.on('initGame', (data) => {
    currentGameMode = data.gameMode || 'full';
    drawnNumbersHistory = data.drawnNumbers || [];
    isPausedGlobal = data.isPaused ?? true;
    document.getElementById('mode-title').innerText = getModeName(currentGameMode);
    updateStatusBadge(isPausedGlobal);
})
