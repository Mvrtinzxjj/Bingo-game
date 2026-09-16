const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let numbersDrawn = [];
let gameFinished = false;
let isPaused = true;
let currentGameMode = 'full';
let ballInterval = null;

const ADMIN_USER = "admin";
const ADMIN_PASS = "1234";

// Patrones de bingo definidos por índices (0 a 24)
const GAME_PATTERNS = {
    full: Array.from({ length: 25 }, (_, i) => i),
    line: null, // Validado dinámicamente si es cualquier fila o columna
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

function checkWinnerPattern(cardNumbers) {
    if (!Array.isArray(cardNumbers) || cardNumbers.length !== 25) return false;

    const isMatch = (num) => num === '⭐' || numbersDrawn.includes(num);

    // Verificar si es Línea (cualquier fila horizontal o columna vertical completa)
    if (currentGameMode === 'line') {
        // Filas horizontales
        for (let r = 0; r < 5; r++) {
            let rowComplete = true;
            for (let c = 0; c < 5; c++) {
                const num = cardNumbers[r * 5 + c];
                if (!isMatch(num)) { rowComplete = false; break; }
            }
            if (rowComplete) return true;
        }

        // Columnas verticales
        for (let c = 0; c < 5; c++) {
            let colComplete = true;
            for (let r = 0; r < 5; r++) {
                const num = cardNumbers[r * 5 + c];
                if (!isMatch(num)) { colComplete = false; break; }
            }
            if (colComplete) return true;
        }
        return false;
    }

    // Verificar otros patrones predefinidos
    const requiredIndices = GAME_PATTERNS[currentGameMode];
    if (!requiredIndices) return false;

    return requiredIndices.every(idx => {
        const num = cardNumbers[idx];
        return isMatch(num);
    });
}

function startBallTimer() {
    if (ballInterval) clearInterval(ballInterval);
    ballInterval = setInterval(() => {
        if (!isPaused && !gameFinished) {
            drawNextBall();
        }
    }, 6000);
}

function drawNextBall() {
    if (gameFinished || isPaused) return;

    if (numbersDrawn.length >= 75) {
        clearInterval(ballInterval);
        return;
    }

    let nextNumber;
    do {
        nextNumber = Math.floor(Math.random() * 75) + 1;
    } while (numbersDrawn.includes(nextNumber));

    numbersDrawn.push(nextNumber);

    io.emit('newBallDrawn', {
        number: nextNumber,
        history: numbersDrawn
    });
}

io.on('connection', (socket) => {
    socket.emit('initGame', {
        drawnNumbers: numbersDrawn,
        gameFinished: gameFinished,
        isPaused: isPaused,
        gameMode: currentGameMode
    });

    socket.on('loginAdmin', (data) => {
        if (data.user === ADMIN_USER && data.pass === ADMIN_PASS) {
            socket.emit('adminAuthSuccess');
        } else {
            socket.emit('adminAuthFailed');
        }
    });

    socket.on('startBingoGame', () => {
        numbersDrawn = [];
        gameFinished = false;
        isPaused = false;

        io.emit('bingoStarted', { 
            gameMode: currentGameMode,
            isPaused: isPaused 
        });

        setTimeout(() => {
            if (!isPaused && !gameFinished) {
                drawNextBall();
                startBallTimer();
            }
        }, 3500);
    });

    socket.on('togglePauseBingo', () => {
        if (gameFinished) return;
        
        isPaused = !isPaused;

        if (isPaused) {
            if (ballInterval) clearInterval(ballInterval);
        } else {
            startBallTimer();
        }

        io.emit('pauseStateChanged', { isPaused: isPaused });
    });

    socket.on('changeGameMode', (newMode) => {
        currentGameMode = newMode;
        io.emit('gameModeUpdated', { gameMode: currentGameMode });
    });

    socket.on('claimLota', (data) => {
        if (gameFinished) return;

        const isWinner = checkWinnerPattern(data.cardNumbers);

        if (isWinner) {
            gameFinished = true;
            isPaused = true;
            if (ballInterval) clearInterval(ballInterval);
            io.emit('winnerDeclared', { winner: data.playerName });
        } else {
            socket.emit('invalidClaim', { message: '❌ ¡Canto falso! Tu cartón no cumple la forma requerida.' });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en http://localhost:${PORT}`);
});