/**
 * Head Soccer Neon 
 * Custom Arcade Physics Engine
 */

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Game Config (Ultra GDD Tuning)
const GRAVITY = 0.5;
const FRICTION = 0.98; // Low damping for rolling
const JUMP_FORCE = 13.5;
const MOVE_SPEED = 1.1;
const MAX_SPEED = 8.5;
const BALL_BOUNCE = 0.8; // Restitution 0.8
const BALL_MAX_SPEED = 22;
const BALL_GRAVITY = 0.55;
const IMPULSE_POWER = 1.2;
const KICK_POWER_X = 16;
const KICK_POWER_Y = -12;
const SPIN_STRENGTH = 0.05;

// Juice & Feedback
let timeScale = 1.0;
let shakeAmount = 0;
let particles = [];

const WIDTH = 1200;
const HEIGHT = 700;
const FLOOR_Y = 620;

// Set canvas resolution
canvas.width = WIDTH;
canvas.height = HEIGHT;

// Game State
let gameState = 'waiting'; // 'waiting', 'playing', 'goal-reset'
let timer = 60;
let p1Score = 0;
let p2Score = 0;
let lastTime = 0;
let timerInterval;

// Assets
const p1Img = new Image(); p1Img.src = 'assets/p1.png';
const p2Img = new Image(); p2Img.src = 'assets/p2.png';

// Inputs
const keys = {};
window.addEventListener('keydown', e => keys[e.code] = true);
window.addEventListener('keyup', e => keys[e.code] = false);

class Entity {
    constructor(x, y, radius, color) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.color = color;
        this.vx = 0;
        this.vy = 0;
        this.mass = 1;
        this.rotation = 0;
        this.torque = 0;
    }

    applyPhysics() {
        this.vy += (this instanceof Ball ? BALL_GRAVITY : GRAVITY) * timeScale;
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.rotation += this.torque * timeScale;

        // Floor collision
        if (this.y + this.radius > FLOOR_Y) {
            this.y = FLOOR_Y - this.radius;
            this.vy *= -BALL_BOUNCE;
            this.vx *= FRICTION;

            // Generate landing particles for players
            if (this instanceof Player && Math.abs(this.vy) > 2) {
                createParticles(this.x, FLOOR_Y, this.color, 5, 'smoke');
            }
        }

        // Wall & Ceiling collisions
        if (this.x - this.radius < 0) {
            this.x = this.radius;
            this.vx *= -BALL_BOUNCE;
        }
        if (this.x + this.radius > WIDTH) {
            this.x = WIDTH - this.radius;
            this.vx *= -BALL_BOUNCE;
        }
        if (this.y - this.radius < 0) {
            this.y = this.radius;
            this.vy *= -BALL_BOUNCE;
        }
    }
}

class Player extends Entity {
    constructor(x, y, color, controls, img, isAI = false) {
        super(x, y, 40, color);
        this.controls = controls;
        this.isAI = isAI;
        this.state = 'IDLE'; // IDLE, WALK, JUMP, FALL, KICK
        this.tilt = 0;
        this.isJumping = false;
        this.kickAngle = 0;
        this.isKicking = false;
        this.mass = 2;
        this.targetTilt = 0;
    }

    update() {
        const input = this.isAI ? this.getAIInput() : {
            left: keys[this.controls.left],
            right: keys[this.controls.right],
            up: keys[this.controls.up],
            kick: keys[this.controls.kick]
        };

        // Lateral movement
        if (input.left) {
            this.vx -= MOVE_SPEED;
            this.state = 'WALK';
            this.targetTilt = -0.15;
        } else if (input.right) {
            this.vx += MOVE_SPEED;
            this.state = 'WALK';
            this.targetTilt = 0.15;
        } else {
            this.vx *= FRICTION;
            this.targetTilt = 0;
            if (!this.isJumping) this.state = 'IDLE';
        }

        this.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, this.vx));

        // Jump
        if (input.up && !this.isJumping) {
            this.vy = -JUMP_FORCE;
            this.isJumping = true;
            createParticles(this.x, FLOOR_Y, '#fff', 8, 'smoke');
        }

        // State & Tilt Logic
        if (this.isJumping) {
            this.state = (this.vy < 0) ? 'JUMP' : 'FALL';
            this.targetTilt = (this.vx * 0.05);
        }

        if (this.y + this.radius >= FLOOR_Y - 5) {
            this.isJumping = false;
        }

        // Smoothen tilt
        this.tilt += (this.targetTilt - this.tilt) * 0.1;

        // Kick logic
        if (input.kick && !this.isKicking) {
            this.isKicking = true;
            this.kickAngle = 0;
            this.state = 'KICK';
            // Slight lunge on kick
            this.vx += (this.controls.left === 'ArrowLeft' ? -3 : 3);
        }

        if (this.isKicking) {
            this.kickAngle += 0.4;
            if (this.kickAngle > Math.PI) {
                this.isKicking = false;
                this.kickAngle = 0;
            }
        }

        this.applyPhysics();
    }

    getAIInput() {
        const input = { left: false, right: false, up: false, kick: false };
        const distToBall = Math.abs(ball.x - this.x);

        // Defensive: If ball is far, return to defense position
        const defenseX = WIDTH - 150;
        if (distToBall > 400) {
            if (this.x < defenseX - 20) input.right = true;
            else if (this.x > defenseX + 20) input.left = true;
        }
        // Aggressive: Attack ball
        else {
            if (ball.x < this.x - 20) input.left = true;
            else if (ball.x > this.x + 20) input.right = true;

            // Jump if ball is high
            if (ball.y < this.y - 100 && distToBall < 100) input.up = true;

            // Kick if close
            if (distToBall < 80 && Math.abs(ball.y - this.y) < 100) input.kick = true;
        }
        return input;
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.tilt);

        const isRight = this.controls.left === 'ArrowLeft';

        // 1. Shadow (relative to world, not tilted)
        ctx.save();
        ctx.rotate(-this.tilt);
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(0, FLOOR_Y - this.y, this.radius * 0.9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // 2. Character Head
        ctx.shadowBlur = 20;
        ctx.shadowColor = this.color;

        const headGrad = ctx.createRadialGradient(-10, -10, 5, 0, 0, this.radius);
        headGrad.addColorStop(0, '#fff');
        headGrad.addColorStop(0.4, this.color);
        headGrad.addColorStop(1, '#000');

        ctx.fillStyle = headGrad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 3;
        ctx.stroke();

        // 3. Eyes (Looking at ball)
        const dx = ball.x - this.x;
        const dy = ball.y - this.y;
        const angle = Math.atan2(dy, dx) - this.tilt;
        const eyeX = isRight ? -15 : 15;
        const eyeY = -8;

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.ellipse(eyeX, eyeY, 12, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(eyeX + Math.cos(angle) * 5, eyeY + Math.sin(angle) * 5, 5, 0, Math.PI * 2);
        ctx.fill();

        // 4. Foot
        ctx.restore();
        ctx.save();
        const footX = this.x + (isRight ? -40 : 40);
        const footY = this.y + 45;

        ctx.translate(footX, footY);
        if (this.isKicking) {
            ctx.rotate(isRight ? -this.kickAngle : this.kickAngle);
        }

        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.roundRect(-22, -12, 44, 24, 10);
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }
}

class Ball extends Entity {
    constructor() {
        super(WIDTH / 2, 200, 18, '#f9f000');
        this.mass = 0.5; // 0.5x Player mass
    }

    update() {
        this.applyPhysics();

        // Low damping for rolling
        this.vx *= 0.995;
        this.vy *= 0.995;

        // SPIN EFFECT (Simplified Magnus)
        this.vx += this.torque * 5 * timeScale;
        this.torque *= 0.98;

        // Net Trigger Zone Detection
        // Goal Net slows down ball
        if (ball.y > GOAL_Y) {
            if (ball.x < GOAL_WIDTH - 20 || ball.x > WIDTH - GOAL_WIDTH + 20) {
                this.vx *= 0.7; // Reduced velocity in net
                this.vy *= 0.7;
            }
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);

        ctx.shadowBlur = 25;
        ctx.shadowColor = this.color;

        const grad = ctx.createRadialGradient(-5, -5, 0, 0, 0, this.radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.5, this.color);
        grad.addColorStop(1, '#d4bc00');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();

        // Soccer ball pattern
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            ctx.rotate(Math.PI * 2 / 5);
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(this.radius, 0);
            ctx.stroke();
        }

        ctx.restore();
    }
}

// Global Juice Functions
function createParticles(x, y, color, count, type = 'confetti') {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * (type === 'confetti' ? 10 : 4),
            vy: (Math.random() - 0.5) * (type === 'confetti' ? 10 : 4) - (type === 'smoke' ? 2 : 0),
            size: Math.random() * (type === 'confetti' ? 8 : 12),
            color: color,
            life: 1.0,
            type: type
        });
    }
}

function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * timeScale;
        p.y += p.vy * timeScale;
        p.life -= 0.02 * timeScale;
        if (p.type === 'smoke') p.size += 0.2;
        if (p.life <= 0) particles.splice(i, 1);
    }
}

function drawParticles() {
    particles.forEach(p => {
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        if (p.type === 'confetti') {
            ctx.fillRect(p.x, p.y, p.size, p.size);
        } else {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    });
    ctx.globalAlpha = 1.0;
}

// Instantiate
const p1 = new Player(200, FLOOR_Y - 50, '#00f3ff', { up: 'KeyW', left: 'KeyA', right: 'KeyD', kick: 'Space' });
const p2 = new Player(WIDTH - 200, FLOOR_Y - 50, '#ff00ff', { up: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', kick: 'KeyP' }, null, true); // AI Mode enabled
const ball = new Ball();

// Goal Zones
const GOAL_WIDTH = 100;
const GOAL_HEIGHT = 200;
const GOAL_Y = FLOOR_Y - GOAL_HEIGHT;

function checkCollisions() {
    // 1. Crossbar Logic (Solid Object)
    const crossbars = [
        { x: 0, y: GOAL_Y, w: GOAL_WIDTH, h: 10 },           // Left
        { x: WIDTH - GOAL_WIDTH, y: GOAL_Y, w: GOAL_WIDTH, h: 10 } // Right
    ];

    crossbars.forEach(bar => {
        if (ball.x + ball.radius > bar.x && ball.x - ball.radius < bar.x + bar.w) {
            if (Math.abs(ball.y - bar.y) < ball.radius) {
                ball.y = (ball.vx > 0 ? bar.y - ball.radius : bar.y - ball.radius);
                ball.vy *= -BALL_BOUNCE;
                shakeAmount = 5; // Shake on post hit
            }
        }
    });

    // 2. Post Corner Bounce (Circular Quina)
    const corners = [
        { x: GOAL_WIDTH, y: GOAL_Y },
        { x: WIDTH - GOAL_WIDTH, y: GOAL_Y }
    ];

    corners.forEach(corner => {
        const dx = ball.x - corner.x;
        const dy = ball.y - corner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ball.radius) {
            const nx = dx / dist;
            const ny = dy / dist;
            ball.x = corner.x + nx * ball.radius;
            ball.y = corner.y + ny * ball.radius;

            const dot = ball.vx * nx + ball.vy * ny;
            ball.vx -= 2 * dot * nx;
            ball.vy -= 2 * dot * ny;
            shakeAmount = 8;
        }
    });

    // 3. Player vs Ball (Physics)
    [p1, p2].forEach(p => {
        // Head Collider
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < p.radius + ball.radius) {
            const nx = dx / dist;
            const ny = dy / dist;

            ball.x = p.x + (p.radius + ball.radius) * nx;
            ball.y = p.y + (p.radius + ball.radius) * ny;

            const dvx = ball.vx - p.vx;
            const dvy = ball.vy - p.vy;
            const dot = dvx * nx + dvy * ny;

            if (dot < 0) {
                ball.vx -= (1 + BALL_BOUNCE) * dot * nx * IMPULSE_POWER;
                ball.vy -= (1 + BALL_BOUNCE) * dot * ny * IMPULSE_POWER;

                // Magnus/Spin on head quadrants
                if (nx > 0.5 && ny < -0.5) ball.torque = SPIN_STRENGTH;
                if (nx < -0.5 && ny < -0.5) ball.torque = -SPIN_STRENGTH;
            }

            // Kick Logic (Sensor Zone)
            if (p.isKicking) {
                const isRight = p.controls.left === 'ArrowLeft';
                ball.vx = isRight ? -KICK_POWER_X : KICK_POWER_X;
                ball.vy = KICK_POWER_Y;
                shakeAmount = 10;
                createParticles(ball.x, ball.y, '#fff', 5, 'smoke');
            }
        }
    });

    // 4. Score Detection
    if (ball.y > GOAL_Y) {
        if (ball.x < 15) goalScored('p2');
        if (ball.x > WIDTH - 15) goalScored('p1');
    }
}

function goalScored(winner) {
    if (gameState !== 'playing') return;

    gameState = 'goal-reset';
    if (winner === 'p1') p1Score++;
    else p2Score++;

    updateUI();
    timeScale = 0.5; // Slow mo!
    shakeAmount = 20; // Big shake!

    createParticles(winner === 'p1' ? WIDTH - 50 : 50, GOAL_Y + 100, (winner === 'p1' ? '#00f3ff' : '#ff00ff'), 50, 'confetti');

    const status = document.getElementById('match-status');
    const statusText = document.getElementById('status-text');
    statusText.innerText = 'GOL!';
    statusText.style.color = (winner === 'p1') ? '#00f3ff' : '#ff00ff';
    status.classList.remove('hidden');

    setTimeout(() => {
        timeScale = 1.0;
        resetPositions();
    }, 2000);
}

function resetPositions() {
    p1.x = 200; p1.y = FLOOR_Y - 50; p1.vx = 0; p1.vy = 0;
    p2.x = WIDTH - 200; p2.y = FLOOR_Y - 50; p2.vx = 0; p2.vy = 0;
    ball.x = WIDTH / 2; ball.y = 200; ball.vx = 0; ball.vy = 0;

    document.getElementById('match-status').classList.add('hidden');
    gameState = 'playing';
}

function updateUI() {
    document.getElementById('p1-goals').innerText = p1Score;
    document.getElementById('p2-goals').innerText = p2Score;
    document.getElementById('timer').innerText = timer;
}

function startTimer() {
    timerInterval = setInterval(() => {
        if (gameState === 'playing') {
            timer--;
            updateUI();
            if (timer <= 0) endGame();
        }
    }, 1000);
}

function endGame() {
    gameState = 'ended';
    clearInterval(timerInterval);

    const status = document.getElementById('match-status');
    const statusText = document.getElementById('status-text');

    if (p1Score > p2Score) {
        statusText.innerText = 'P1 VENCEU!';
        statusText.style.color = '#00f3ff';
    } else if (p2Score > p1Score) {
        statusText.innerText = 'P2 VENCEU!';
        statusText.style.color = '#ff00ff';
    } else {
        statusText.innerText = 'EMPATE!';
        statusText.style.color = '#f9f000';
    }

    status.classList.remove('hidden');

    setTimeout(() => {
        location.reload();
    }, 5000);
}

function drawArena() {
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';

    // Left Goal (Cyan)
    ctx.strokeStyle = '#00f3ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00f3ff';

    // Vertical Post
    ctx.beginPath();
    ctx.moveTo(GOAL_WIDTH, FLOOR_Y);
    ctx.lineTo(GOAL_WIDTH, GOAL_Y);
    // Top Bar (Crossbar)
    ctx.lineTo(0, GOAL_Y);
    ctx.stroke();

    // Netting
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#00f3ff';
    ctx.fillRect(0, GOAL_Y, GOAL_WIDTH, FLOOR_Y - GOAL_Y);
    ctx.globalAlpha = 1.0;

    // Right Goal (Magenta)
    ctx.strokeStyle = '#ff00ff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ff00ff';

    // Vertical Post
    ctx.beginPath();
    ctx.moveTo(WIDTH - GOAL_WIDTH, FLOOR_Y);
    ctx.lineTo(WIDTH - GOAL_WIDTH, GOAL_Y);
    // Top Bar (Crossbar)
    ctx.lineTo(WIDTH, GOAL_Y);
    ctx.stroke();

    ctx.globalAlpha = 0.15;
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(WIDTH - GOAL_WIDTH, GOAL_Y, GOAL_WIDTH, FLOOR_Y - GOAL_Y);
    ctx.globalAlpha = 1.0;

    ctx.shadowBlur = 0;
}

function gameLoop(timestamp) {
    // Clear
    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    // Camera Shake
    ctx.save();
    if (shakeAmount > 0) {
        ctx.translate((Math.random() - 0.5) * shakeAmount, (Math.random() - 0.5) * shakeAmount);
        shakeAmount *= 0.9;
    }

    if (gameState === 'playing' || gameState === 'goal-reset') {
        // Update
        if (gameState === 'playing' || gameState === 'goal-reset') {
            p1.update();
            p2.update();
            ball.update();
            checkCollisions();
            updateParticles();
        }

        // Draw
        drawArena();
        p1.draw();
        p2.draw();
        ball.draw();
        drawParticles();
    }

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

// Start Button
document.getElementById('start-btn').addEventListener('click', () => {
    document.getElementById('start-screen').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('start-screen').style.display = 'none';
        gameState = 'playing';
        startTimer();
    }, 500);
});

// Kick off
requestAnimationFrame(gameLoop);
