# space-invaders-online
My year 10 IST project, where I made online multiplayer space invaders, I made this repo mainly for storage purposes

I used node.js, express and socket.io, and hosted the game on Glitch

If you would like to see the project at glitch the url is https://glitch.com/~spaceinvadersonline, if you would like to play the game you can go to https://spaceinvadersonline.glitch.me/

Type a name, press join, then either get other people to join or just test with multiple tabs open. Then once everyone has joined the lobby click the start game button

Known Issues with multiplayer
Occasionally some packets may be lost, and socket io will attempt to send the lost packets all at once, disrupting the flow and making lag spikes
Lag is especially strong at the beginning during loading
Occasionally glitch servers may be offline or having difficulties. 
http://status.glitch.com/ should tell you if the hosting service is having any issues

Controls are WASD to move, spacebar to shoot

Red is you, blue is enemies, green is shooting enemies, purple is powerups, yellow is particle effects


