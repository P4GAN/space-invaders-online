//for the multiplayer framework, the server handles all the game logic, and sends that to the client
//the client then draws the game state, and then sends input to the server

//note im only commenting multiplayer aspects, as gameplay has been commented in singleplayer

var express = require('express'); // express is a package that lets us handle http requests
var app = express(); //intialise express
var http = require('http').Server(app);
var io = require('socket.io')(http); //socket.io

app.use(express.static("public")); //so we can access files in /public

// Serve the index page 
app.get("/", function (request, response) {
  response.sendFile(__dirname + '/views/index.html'); //when user requests webpage, send it
});


// Listen on port 5000
app.set('port', (process.env.PORT || 5000)); //start listening on port 5000
http.listen(app.get('port'), function(){
  console.log('listening on port',app.get('port'));
});


//game logic begins here

let enemySpeed = 2;
let enemyHorizontalDirection = 1;

let playerList = {}
let gameObjectList = [];
let projectileList = [];
let enemyList = [];
let enemyVelocities = [enemySpeed, 0]

let gameState = {
  gameObjectList : gameObjectList,
  projectileList : projectileList,
  enemyList : enemyList,
  enemyVelocities : enemyVelocities,
  playerList : playerList,
}

let inputList = [];

const frameInterval = 100;

let timeElapsed = 0;

let attackCooldown = 300;

const projectileDecay = 5000;

let movingDown = false;

let enemiesPassed = 0;

const gameWidth = 800;
const gameHeight = 600;

let gameStarted = false

let freeze = false;

let nextMinPowerupTime = 10000;
let nextMaxPowerupTime = 15000;

let nextMinShootingEnemyTime = 10000;
let nextMaxShootingEnemyTime = 15000;

let enemyShootTime = 0;
let numEnemies = 0;

let powerups = {"explode": 8000, "spin": 500, "shield": 15000, "freeze": 4000}

let playerWallY = 500;

function spawnAliens() {
    enemySpeed += 1;
    for (let j=0; j<150; j+=50) {
        for (let i=50; i<gameWidth; i+=(gameWidth/numEnemies)) {
            new Enemy(i, j, 20, 20, "blue" )
        }
    }
}

function startGame() {

    this.interval = setInterval(gameUpdate, frameInterval);
    spawnAliens()
  
    setTimeout(spawnPowerup, 15000)
    setTimeout(function() {
    let shootingEnemy = new ShootingEnemy(Math.floor(Math.random() * 750), 20, 50, 10, "green", 2, 0);
    gameObjectList.push(shootingEnemy);
    }, 20000)
    gameStarted = true
}

function collisionCheck(object1, object2, solid) {
    if ((object1.x < object2.x + object2.width && object1.x + object1.width > object2.x && 
        object1.y < object2.y + object2.height && object1.y + object1.height > object2.y)) {
        return true;
    }
}

function spawnPowerup() {
    let powerupSelected = Object.keys(powerups)[Math.floor(Math.random() * 4)]
    let powerupTime = powerups[powerupSelected]
    new Powerup(Math.floor(Math.random() * gameWidth), 20, 10, 10, "purple", 0, 5, powerupSelected, powerupTime);
    if (nextMinPowerupTime >= 5000) {
        nextMinPowerupTime *= 0.9
    }
    if (nextMinPowerupTime >= 6000) {
        nextMinPowerupTime *= 0.9
    }  
    let randomTime = Math.random() * (nextMaxPowerupTime - nextMinPowerupTime) + nextMinPowerupTime
    setTimeout(spawnPowerup, randomTime)

}

function spawnShootingEnemy() {
    let shootingEnemy = new ShootingEnemy(Math.floor(Math.random() * 750), 20, 50, 10, "green", 2, 0);
    gameObjectList.push(shootingEnemy);
    if (nextMinShootingEnemyTime >= 5000) {
        nextMinShootingEnemyTime *= 0.9
    }
    if (nextMaxShootingEnemyTime >= 6000) {
        nextMaxShootingEnemyTime *= 0.9
    }    
    let randomTime = Math.random() * (nextMaxShootingEnemyTime - nextMinShootingEnemyTime) + nextMinShootingEnemyTime
    setTimeout(spawnShootingEnemy, randomTime)
}

function GameObject(x, y, width, height, color, velocityX=0, velocityY=0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.velocityX = velocityX;
    this.velocityY = velocityY;
    this.nextX = x;
    this.nextY = y;
    this.distanceX = 0;
    this.distanceY = 0;
    this.move = function() {
        this.x = this.nextX;
        this.y = this.nextY;
        this.nextX += this.velocityX;
        this.nextY += this.velocityY;
        this.distanceX = this.nextX - this.x;
        this.distanceY = this.nextY - this.y;
        
        //nextX, nextY and distance for interpolation, which ill explain in client code
      
    };
    this.update = function() {
        this.move()
    }
}


function Player(x, y, width, height, color, health, id, velocityX, velocityY) {
    GameObject.call(this, x, y, width, height, color, velocityX, velocityY);
    this.health = health;
    this.dead = false;
    this.keysPressed = {};
    this.attackCooldownTimer = 0;
    this.score = 0
    this.id = id
    this.effect = "" 
    this.takeDamage = function(damage) {
        if (this.effect != "shield") {
            this.health -= damage;
            if (this.health <= 0 && !this.dead) {
                this.dead = true;
                io.emit("sentMessage", this.name + " died") //send messages to chat when someone dies
                io.to(this.id).emit("dead") //emit death event so player can display death screen and stop running game 
            }
        }
    }
    this.inputs = function() { //inputs put in player class as each person now has different inputs
      
        this.velocityX = 0;
        this.velocityY = 0;
      
        if (this.keysPressed["w"]) { //acceleration has been removed as it makes interpolation buggy
            this.velocityY -= 5
        }

        if (this.keysPressed["a"]) {
            this.velocityX -= 5
        }

        if (this.keysPressed["s"]) {
            this.velocityY += 5
        }

        if (this.keysPressed["d"]) {
            this.velocityX += 5
        }
      
        if (this.keysPressed[" "] && timeElapsed >= this.attackCooldownTimer) {
            if (this.effect == "explode") {
                new ExplodingProjectile(this.x, this.y, 5, 5, "red", 0, -20, this.id);
            }
            else if (this.effect == "spin") {
                new SpinningProjectile(this.x, this.y, 5, 5, "red", 0, -20, this.id);
            } 
            else {
                new Projectile(this.x, this.y, 2, 15, "red", 0, -20, this.id);
            }
          
            this.attackCooldownTimer = timeElapsed + attackCooldown;
        }
      

    }
    this.update = function() {
        for (let i=0; i < projectileList.length; i++) {
            if (collisionCheck(this, projectileList[i], 1) && projectileList[i].owner == "enemy") {
                projectileList[i].dead = true;
                io.emit("emitParticles", projectileList[i].x, projectileList[i].y, 25) 
                //particles are resource heavy so send them to client to run instead of on server
                this.takeDamage(1)
            }
        }
        this.inputs()
        this.move()
        this.nextX = Math.min(this.nextX, gameWidth)
        this.nextX = Math.max(this.nextX, 0)
        this.nextY = Math.min(this.nextY, gameHeight)
        this.nextY = Math.max(this.nextY, playerWallY)
      
        if (timeElapsed >= this.effectOver) {
            this.effect = "";
        }
    
    }
    this.giveEffect = function(effect, effectLength) {
        this.effect = effect 
        this.effectOver = timeElapsed + effectLength;
        io.emit("sentMessage", this.name + " got a " + effect + " powerup") //send to chat they got a powerup
        if (this.effect == "freeze") {
            freeze = true;
            setTimeout(function() {freeze = false}, effectLength)
        }

    }
}

function Projectile(x, y, width, height, color, velocityX, velocityY, owner) {
    GameObject.call(this, x, y, width, height, color, velocityX, velocityY);
    this.expireDate = timeElapsed + projectileDecay;
    this.dead = false;
    this.owner = owner;
    projectileList.push(this);
    this.update = function() {
        if (timeElapsed >= this.expireDate) {
            this.dead = true;
        }
        this.move();
    };
}

function ExplodingProjectile(x, y, width, height, color, velocityX, velocityY, owner) {
    Projectile.call(this, x, y, width, height, color, velocityX, velocityY, owner)
    this.update = function() {
        if (timeElapsed >= this.expireDate) {
            this.dead = true;
        }
        if (this.dead) {
            for (let i = 0; i < Math.PI * 2; i += Math.PI/8) {
                let velocityX = Math.cos(i) * 5
                let velocityY = Math.sin(i) * 5
                new Projectile(this.x, this.y, 5, 5, "red", velocityX, velocityY, this.owner);
            }
        }
        this.move();
    }
}

function SpinningProjectile(x, y, width, height, color, velocityX, velocityY, owner) {
    Projectile.call(this, x, y, width, height, color, velocityX, velocityY, owner)
    this.angle = 0;
    this.draw = function() {
        context.save()
        context.translate(this.x + this.width/2, this.y + this.height/2)
        context.rotate(this.angle)
        context.fillStyle = this.color;
        context.fillRect(-this.width/2, -this.height/2, this.width, this.height);
        context.restore()
    }
    this.update = function() {
        if (timeElapsed >= this.expireDate) {
            this.dead = true;
        }
        this.angle += Math.PI/20;
        let velocityX = Math.cos(this.angle) * 20 + this.velocityX
        let velocityY = Math.sin(this.angle) * 20 + this.velocityY
        new Projectile(this.x, this.y, 5, 5, "red", velocityX, velocityY, this.owner);
        this.angle = Math.PI + this.angle;
        velocityX = Math.cos(this.angle) * 20 + this.velocityX
        velocityY = Math.sin(this.angle) * 20 + this.velocityY
        new Projectile(this.x, this.y, 5, 5, "red", velocityX, velocityY, this.owner);

        this.move()

    }
}
function Enemy(x, y, width, height, color) {
    GameObject.call(this, x, y, width, height, color);
    this.dead = false;
    enemyList.push(this);
    this.moveDownTo = "false";
    this.enemyMove = function() {
        this.x = this.nextX;
        this.y = this.nextY;
        this.nextX += enemyVelocities[0];
        this.nextY += enemyVelocities[1];
        this.distanceX = this.nextX - this.x;
        this.distanceY = this.nextY - this.y;
        if (this.y >= playerWallY) {
            this.dead = true;
          
            if (Object.values(playerList).length > 0) {
                for (let i=0; i<Object.values(playerList).length; i++) {
                    Object.values(playerList)[i].takeDamage(1)
                }
            }
        }
        
    }
    this.update = function() {
        if (enemyVelocities[0] > 0 && this.x + this.width >= gameWidth || enemyVelocities[0] < 0 && this.x <= 0 ) {
            enemyVelocities = [0, enemySpeed];
            for (let i=0; i<enemyList.length; i++) {
                enemyList[i].moveDownTo = enemyList[i].y + 3 * enemyList[i].height;
            }
        }
        if (this.y >= this.moveDownTo && enemyVelocities[0] == 0) {
            for (let i=0; i<enemyList.length; i++) {
                enemyList[i].moveDownTo = "false"
            }
            enemyHorizontalDirection *= -1;
            enemyVelocities = [enemyHorizontalDirection * enemySpeed, 0];
        }  
        if (this.y >= this.moveDownTo && enemyVelocities[0] == 0) {
            for (let i=0; i<enemyList.length; i++) {
                enemyList[i].moveDownTo = "false"
            }
            enemyHorizontalDirection *= -1;
            enemyVelocities = [enemyHorizontalDirection, 0];
            spawnAliens();
        }        
        for (let i=0; i < projectileList.length; i++) {
            if (collisionCheck(this, projectileList[i], 1) && projectileList[i].owner != "enemy") {
                projectileList[i].dead = true;
                io.emit("emitParticles", projectileList[i].x, projectileList[i].y, 25)
                this.dead = true;
                playerList[projectileList[i].owner].score += 1;
            }
        }
    }
}

function Powerup(x, y, width, height, color, velocityX, velocityY, effect, effectLength) {
    GameObject.call(this, x, y, width, height, color, velocityX, velocityY);
    this.effect = effect;
    this.effectLength = effectLength
    this.dead = false;
    gameObjectList.push(this);
    this.update = function() {
        for (let i=0; i<Object.values(playerList).length; i++) {
            if (collisionCheck(Object.values(playerList)[i], this, 1)) {
                this.dead = true;
                Object.values(playerList)[i].giveEffect(effect, effectLength)
            }
            this.move();
        }
    };
}


function ShootingEnemy(x, y, width, height, color, velocityX, velocityY) {
    GameObject.call(this, x, y, width, height, color, velocityX, velocityY);
    this.attackCooldownTimer = 0;
    this.attackCooldown = 1000;
    this.health = 3;
    this.dead = false;
    this.takeDamage = function(damage, owner) {
        this.health -= damage;
        if (this.health <= 0) {
            this.dead = true;
            playerList[owner].score += 10;
        }
    }
  
    this.shoot = function() {
        let player = Object.values(playerList)[Math.floor(Math.random() * Object.values(playerList).length)]
        let distanceToPlayer = Math.sqrt(Math.pow(this.x - player.x, 2) + Math.pow(this.y - player.y, 2))
        let velocityX = -20 * (this.x - player.x)/distanceToPlayer;
        let velocityY = -20 * (this.y - player.y)/distanceToPlayer;
        new Projectile(this.x, this.y, 5, 5, "green", velocityX, velocityY, "enemy");
    }
    this.update = function() {
        if (timeElapsed >= this.attackCooldownTimer) {
            this.shoot();
            this.attackCooldownTimer = timeElapsed + this.attackCooldown;
        }
        if (Math.random() < 0.05 || this.x + this.width > gameWidth || this.x <= 0) {
            this.velocityX *= -1;
        }
        for (let i=0; i < projectileList.length; i++) {
            if (collisionCheck(this, projectileList[i], 1) && projectileList[i].owner != "enemy") {
                projectileList[i].dead = true;
                io.emit("emitParticles", projectileList[i].x, projectileList[i].y, 25)
                this.takeDamage(1, projectileList[i].owner)
            }
        }
        this.move()
    }
}

function gameUpdate() {
    timeElapsed += frameInterval;

    for (let i=gameObjectList.length - 1; i >= 0; i--) {
        gameObjectList[i].update();
        if (gameObjectList[i].dead == true) { 
            gameObjectList.splice(i, 1)
        }
    }

    for (let i=projectileList.length - 1; i >= 0; i--) {
        projectileList[i].update()
        if (projectileList[i].dead == true) { 
            projectileList.splice(i, 1)
        }
    }
    for (let i=enemyList.length - 1; i >= 0; i--) {
        enemyList[i].update();
        if (enemyList[i].dead == true) { 
            enemyList.splice(i, 1)
            if (enemyList.length == 0) {
              spawnAliens()
            }
        }
    }
    for (let i=enemyList.length - 1; i >= 0; i--) {
        enemyList[i].enemyMove();
    }
  
    if (timeElapsed >= enemyShootTime) {
        for (let i = 0; i < Math.floor(enemyList.length/15); i++) {
            let randomEnemy = enemyList[Math.round(Math.random() * (enemyList.length-1))]
            new Projectile(randomEnemy.x, randomEnemy.y, 2, 15, "blue", 0, 20, "enemy");
        }
        enemyShootTime += 500
    }
  
    for (let i=Object.values(playerList).length - 1; i >= 0; i--) {
        Object.values(playerList)[i].update(); //this time we also update players
    }
    gameState = { //save the gamestate
        gameObjectList : gameObjectList,
        projectileList : projectileList,
        enemyList : enemyList,
        enemyVelocities : enemyVelocities,
        playerList : playerList,
    }
    io.emit('gameSync', gameState) //send the gamestate to clients
    
}

io.on('connection', function(socket) { //when a user connects
    console.log("New client has connected with id:",socket.id);
  
    socket.on('disconnect', function() { //when user disconnects send a message saying they left and remove them from playerList
        io.emit("sentMessage", playerList[socket.id].name + " left")
        delete playerList[socket.id]
      

    })
  
    //listen for message event
    socket.on('message', function(message) { //when client sends a message, send to all clients
        console.log(message)
        io.emit('sentMessage', message)
    })

    //listen for joining game event
    socket.on('joiningGame', function(name) { //when client joins, check if game hasn't started and they havent joined before
        if (!playerList[socket.id] && !gameStarted) {
            let player = new Player(395, 550, 20, 20, "red", 10, socket.id); //create new playeer
            player.name = name
            playerList[socket.id] = player; 
            io.emit("sentMessage", name + " joined") 

            io.emit('lobbyJoined', playerList) //update the lobby for all clients
        }

    })
  
    //listen for game start event
    socket.on('gameStart', function() { //when someone starts the game
        if (!gameStarted) { //cant start game twice
            numEnemies = 7 + Object.values(playerList).length //kind of scales difficulty with number of players
            startGame() //run start game function
            gameState = {
                gameObjectList : gameObjectList,
                projectileList : projectileList,
                enemyList : enemyList,
                enemyVelocities : enemyVelocities,
                playerList : playerList,
            }; 
            io.emit('gameJoined', gameState); //save and send gameState
        }
    })
  
    //listen for inputs 
    socket.on('inputs', function(keysPressed) {
        if (playerList[socket.id]) { //if player exists, set their inputs
            playerList[socket.id].keysPressed = keysPressed; 
        }
    })
    

})