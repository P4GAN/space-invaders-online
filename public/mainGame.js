//this side of the code handles the client side
//this includes drawing and input

console.log("hello world")

var socket = io.connect();

let gameCanvas = document.getElementById("gameCanvas");
let context = gameCanvas.getContext("2d");

context.fillStyle = "rgb(50, 50, 50)";
context.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

context.fillStyle = "white";
context.font = "30px Arial";
context.textAlign = "center"
context.fillText("Space Invaders", 400, 300) //title page
context.font = "15px Arial";

context.fillText("Space to shoot, WASD to move", 400, 320)
context.fillText("Red is players, blue is enemies", 400, 340)
context.fillText("Green is enemies that will shoot you, purple is powerups", 400, 360)
context.fillText("Type a name, press join and either click start game or wait for it to start", 400, 380)

let gameObjectList = [];
let projectileList = [];
let enemyList = [];
let particleList = [];
let enemyVelocities = [];
let playerList = {};

let keysPressed = {};

const frameInterval = 20;
const requestInterval = 40;

let players = {}

let lastTime = 0;
let currentTime = 0;
let ticksBetweenUpdates = 5; //how many client updates between server updates

let timeElapsed = 0;

let lobbyJoined = false;

let dead = false;

document.addEventListener('keydown', function(event){
    keysPressed[event.key] = true;

    }
);
document.addEventListener('keyup', function(event){
    keysPressed[event.key] = false;
    if (event.key == " ") {
        event.preventDefault(); //stop scrolling
    }
    }

);

function sendMessage() {
  var message = document.getElementById("message").value //get message from the form and emit to server
  console.log(message)
  socket.emit('message', message);
}

//run particles client side as they are resource intensive and sending particle objects every update would be laggy
function Particle(x, y, width, height, color, velocityX, velocityY, maxAge) { 
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.velocityX = velocityX;
    this.velocityY = velocityY;
    this.maxAge = timeElapsed + maxAge;
    this.age = 0;
    this.dead = false;
    this.color = color
    particleList.push(this)
    this.update = function() {
        this.age += frameInterval;
        if (timeElapsed >= this.maxAge) {
            this.dead = true;
        }
        this.x += this.velocityX;
        this.y += this.velocityY;

    }

}

socket.on("emitParticles", function(x, y, particleNum) { //wait for emit particles event and then emit particles
    for (let i=0; i < particleNum; i++) {
        new Particle(x, y, 1, 1, "yellow", Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2000)
    }
})

//when message recieved append the content to an unordered list
socket.on('sentMessage', function(message) {
      console.log("recieved")
      var messageElement = document.createElement("LI");
      messageElement.innerHTML = message;
      document.getElementById("messages").appendChild(messageElement);
})

//when dead just display text and stop the game loop
socket.on("dead", function() {
      dead = true;
      context.fillStyle = "white";
      context.font = "30px Arial";
      context.textAlign = "center"
      context.fillText("You Died. Wait for everyone else to die", 400, 300)
      context.fillText("Refresh the page, rejoin and start again.", 400, 400)
})

function joinGame() { //joining lobby not to be confused with starting game
    var name = document.getElementById("name").value //get name
    if (name != "") { //no blank name
        socket.emit('joiningGame', name); //tell server you are joining
        lobbyJoined = true;
    }
}

function startGame() { //when a player decides to start the game
    if (lobbyJoined) { //you cant start if youre not in the lobby
        socket.emit('gameStart')
    }
}

function updateScores(players) { //update html list of player scores
    document.getElementById('playerScores').innerHTML = ""
    for (let i=0; i<Object.values(players).length; i++) {
        var playerHTML = document.createElement("LI");
        playerHTML.innerHTML = Object.values(players)[i].name + ": " + Object.values(players)[i].score
        document.getElementById('playerScores').appendChild(playerHTML)
    }
}

socket.on('lobbyJoined', function(players){ //when someone joins, update scores
    updateScores(players)
})

socket.on('gameJoined', function(gameState) { 
    //when you have joined the game, initalise the lists and begin the client side game loop
    gameObjectList = gameState.gameObjectList;
    projectileList = gameState.projectileList;
    enemyList = gameState.enemyList;
    enemyVelocities = gameState.enemyVelocities;
    playerList = gameState.playerList;
    setInterval(gameUpdate, frameInterval)
    setInterval(function() {socket.emit('inputs', keysPressed)}, requestInterval) 
    //it isnt nessesary to send input every update, so only every few updates
})

socket.on('gameSync', function(gameState) {
    //server side update or "gameSync", syncs game state and positions
    gameObjectList = gameState.gameObjectList;
    projectileList = gameState.projectileList;
    enemyList = gameState.enemyList;
    enemyVelocities = gameState.enemyVelocities;
    playerList = gameState.playerList;
  
    updateScores(playerList)
    
    
})

function draw(object) { //draw on client side
    if (object.effect == "shield" && object.id) {
        context.shadowBlur = 10;
        context.shadowColor = "blue";
        context.fillStyle = "blue";
        context.beginPath();
        context.arc(object.x + 5, object.y + 5, 20, 0, 2 * Math.PI)
        context.closePath();
        context.fill();
    }
    context.globalCompositeOperation = 'lighter'; 
    context.shadowBlur = 15;
    context.shadowColor = object.color;
    context.fillStyle = object.color;
    context.fillRect(object.x, object.y, object.width, object.height);
    context.globalCompositeOperation = 'source-over';

}


function gameUpdate() {
    if (!dead) { //while not dead
        context.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        context.fillStyle = "rgb(50, 50, 50)";
        context.fillRect(0, 0, gameCanvas.width, gameCanvas.height);

        timeElapsed += frameInterval

        for (let i=gameObjectList.length - 1; i >= 0; i--) {

            //interpolation explanation
            //the ideal scenario for a game is about 30-60 frames per second to look smooth
            //however if we were requesting the game position that many times per second
            //the server may not be able to handle that many requests, and even if it were
            //it would still have lag spikes, where multiple requests have been bottled up
            //and are processed all at once. The Glitch server especially began crashing when 
            //the request rate was below 50ms, therefore I have to keep it at one update per 100ms.
            //To ensure it still looks smooth while only having 10 updates a second, we take the 
            //position from one frame ago (recall x and nextX) and the position from now, and we
            //smoothly transition between them on the client side. This allows the game to look smooth
            //with less server updates, however with the downside of mild input lag
            
            //every frame, move the object by the distance travelled since the last server update
            //over the number of client updates in between server updates
            //for example if the object moved 6 units between the last server updates, and 6 client
            //updates will occur, move it 1 unit on each client update
            gameObjectList[i].x += gameObjectList[i].distanceX/ticksBetweenUpdates
            gameObjectList[i].y += gameObjectList[i].distanceY/ticksBetweenUpdates

            draw(gameObjectList[i])

        }

        for (let i=projectileList.length - 1; i >= 0; i--) {

            projectileList[i].x += projectileList[i].distanceX/ticksBetweenUpdates
            projectileList[i].y += projectileList[i].distanceY/ticksBetweenUpdates

            draw(projectileList[i])
        }
        for (let i=enemyList.length - 1; i >= 0; i--) {

            enemyList[i].x += enemyList[i].distanceX/ticksBetweenUpdates
            enemyList[i].y += enemyList[i].distanceY/ticksBetweenUpdates

            draw(enemyList[i])
        }

        for (let i=Object.values(playerList).length - 1; i >= 0; i--) {
            if (!Object.values(playerList).dead) {
                Object.values(playerList)[i].x += Object.values(playerList)[i].distanceX/ticksBetweenUpdates
                Object.values(playerList)[i].y += Object.values(playerList)[i].distanceY/ticksBetweenUpdates

                //draw health and name 
                draw(Object.values(playerList)[i])
                context.fillStyle = "white";
                context.font = "10px Arial";
                context.textAlign = "center"
                context.fillText(Object.values(playerList)[i].name, Object.values(playerList)[i].x, Object.values(playerList)[i].y - 20);

                let text = "HP: " + Object.values(playerList)[i].health;
                context.fillText(text, Object.values(playerList)[i].x, Object.values(playerList)[i].y - 5);
            }

        }

        for (let i=particleList.length - 1; i >= 0; i--) {
            particleList[i].update();
            draw(particleList[i])
            if (particleList[i].dead == true) { 
                particleList.splice(i, 1)
            }
        }

        context.shadowBlur = 0;

        context.fillStyle = "black"
        context.fillRect(0, 500, 800, 10); //draw the player wall
    }

    
}
