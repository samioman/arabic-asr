// ---------------------------
// Global Variables
// ---------------------------
let obj = {};                  // Object for canvas and audio-related configurations
let timeOffset = 60;           // Timer offset for animation loop
let now = parseInt(performance.now()) / timeOffset;

// Recording State Variables
let isRecording = false;       // Recording status
let timerInterval;             // Timer interval for the recording session
let seconds = 0;               // Seconds counter for recording
let mediaStream = null;        // Media stream from the user's microphone
let audioChunks = [];          // Array to store recorded audio data chunks

// Silence Detection Variables
let silenceTimeout;            // Timeout for detecting silence
const silenceThreshold = 0.01; // Threshold for silence detection
const silenceDuration = 2000;  // Silence duration (2 seconds in milliseconds)
let audioRecorder;             // MediaRecorder instance

// Text Display Variables
const maxWords = 40;           // Maximum words to display in the translation box
const translationDiv = document.getElementById('translation'); // Element for displaying transcription

const spinner = document.getElementById("spinner");

// ---------------------------
// Initialization
// ---------------------------
function init() {
  // Set up the canvas for visualizing audio
  obj.canvas = document.getElementById('canvas');
  obj.ctx = obj.canvas.getContext('2d');

  obj.width = 500;
  obj.height = 60;
  obj.canvas.width = obj.width * window.devicePixelRatio;
  obj.canvas.height = obj.height * window.devicePixelRatio;
  obj.canvas.style.width = obj.width + 'px';
  obj.canvas.style.height = obj.height + 'px';
  obj.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

  // Append the canvas to the DOM
  document.getElementById('waveform').appendChild(obj.canvas);
  obj.bars = []; // Initialize an array to hold audio visualization bars
}

// ---------------------------
// Audio Recording and Silence Monitoring
// ---------------------------

function soundAllowed(stream) {
  // Initialize audio context and analyser
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  const streamSource = audioContext.createMediaStreamSource(stream);

  obj.analyser = audioContext.createAnalyser();
  streamSource.connect(obj.analyser);
  obj.analyser.fftSize = 512;
  obj.frequencyArray = new Float32Array(obj.analyser.fftSize);

  // Set up the MediaRecorder for recording audio
  audioRecorder = new MediaRecorder(stream);


  audioRecorder.ondataavailable = (event) => {
    console.log(`Chunk added: size = ${event.data.size}`);
    console.log(`audioChunks length = ${audioChunks.length}`)

    if (event.data.size > 0) {
      audioChunks.push(event.data); // Ensure data is collected
    }
  };

  audioRecorder.onstop = () => {
    console.log("Recording stopped, sending audio...");
    sendAudioToFlask(); // Trigger sending audio only after stopping
  };

  audioRecorder.start(); // Start recording
  monitorSilence();      // Start monitoring silence
  loop();                // Start the visualization loop
}


function monitorSilence() {
  const checkSilence = () => {
    obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

    // Detect silence based on maximum amplitude
    const maxAmplitude = Math.max(...obj.frequencyArray.map(Math.abs));
    if (maxAmplitude < silenceThreshold) {
      if (!silenceTimeout) {
        console.log('Silence detected');
        silenceTimeout = setTimeout(() => {
          sendAudioToFlask(); // Send audio data after detecting silence
        }, silenceDuration); // Wait for silence duration
      }
    } else {
      clearTimeout(silenceTimeout); // Reset silence timeout if sound is detected
      silenceTimeout = null;
    }

    if (isRecording) requestAnimationFrame(checkSilence);
  };

  checkSilence();
}


// ---------------------------
// Sending Audio Data
// ---------------------------
function sendAudioToFlask() {
  if (audioChunks.length === 0) {
    console.log("No audio chunks available to send.");
    return;
  }

  const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');

  console.log("Sending audio to Flask server...");
  spinner.style.visibility = "visible";
  fetch('http://127.0.0.1:5000/transcribe', {
    method: 'POST',
    body: formData,
  })
    .then((response) => response.json())
    .then((data) => {
      console.log('Transcription:', data.text);
      spinner.style.visibility = "hidden";
      displayTranscribe(data.text);
    })
    .catch((error) => console.error('Error:', error));

  audioChunks = []; // Clear chunks after sending
}


// ---------------------------
// Animation and Drawing
// ---------------------------
function loop() {
  obj.ctx.clearRect(0, 0, obj.canvas.width, obj.canvas.height); // Clear the canvas

  if (parseInt(performance.now() / timeOffset) > now) {
    now = parseInt(performance.now() / timeOffset);
    obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

    const max = Math.max(...obj.frequencyArray); // Find max frequency
    const freq = Math.floor(max * 650);         // Scale frequency

    obj.bars.push({ x: obj.width, y: obj.height / 2 - freq / 2, height: freq, width: 2 });
  }

  draw();
  if (isRecording) requestAnimationFrame(loop);
}

function draw() {
  for (let i = 0; i < obj.bars.length; i++) {
    const bar = obj.bars[i];
    roundRect(obj.ctx, bar.x, bar.y, bar.width, bar.height);
    bar.x -= 2; // Move bar left

    if (bar.x < 1) obj.bars.splice(i, 1); // Remove off-screen bars
  }
}

function roundRect(ctx, x, y, width, height, radius = 2, fill = true, stroke = false) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = 'rgb(255,255,255)';

  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// ---------------------------
// Recording Controls
// ---------------------------
function toggleRecording() {
  const playPauseImg = document.getElementById("play-pause");
  isRecording ? stopRecording() : startRecording();
  playPauseImg.src = isRecording ? '../static/imgs/play.png' : '../static/imgs/pause.png';
  isRecording = !isRecording;
}

function startRecording() {
  seconds = 0; 
  updateTimer();
  timerInterval = setInterval(() => { seconds++; updateTimer(); }, 1000);

  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => { mediaStream = stream; soundAllowed(stream); })
    .catch(soundNotAllowed);

  console.log("Recording started...");
}

function stopRecording() {
  clearInterval(timerInterval);
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    console.log("Audio stream stopped...");
  }
}

// ---------------------------
// Utility Functions
// ---------------------------
function updateTimer() {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${minutes}:${sec}`;
}

function soundNotAllowed() {
  console.error("Audio permission denied or unavailable.");
}


function displayTranscribe(transcribedText) {
  // Ensure transcribedText is valid
  if (typeof transcribedText !== 'string' || !transcribedText.trim()) {
    console.error('Invalid transcribedText:', transcribedText);
    return; // Exit if the input is invalid
  }

  const existingWords = translationDiv.innerText.split(' ').filter(word => word.trim() !== ''); // Current displayed words
  const newWords = transcribedText.split(' ').filter(word => word.trim() !== ''); // Words from new transcription
  const wordsToType = newWords.filter(word => !existingWords.includes(word)); // Only the truly new words

  let index = 0; // Start typing from the first new word

  // Function to type out the new words one by one
  function typeWord() {
    if (index < wordsToType.length) {
      // Append the next word with a space
      translationDiv.innerHTML += wordsToType[index] + ' ';
      index++;

      // Continue typing with a delay
      setTimeout(typeWord, 150); // Adjust delay for typing speed
    } else {
      // Optionally, add "processing..." at the end
      const ellipsisEffect = document.createElement('span');
      ellipsisEffect.className = 'processing';
      ellipsisEffect.innerText = '...';
      translationDiv.appendChild(ellipsisEffect);

      // Remove the "..." after 1 second
      setTimeout(() => {
        ellipsisEffect.remove();
      }, 1000);
    }
  }

  // Start typing only if there are new words
  if (wordsToType.length > 0) {
    typeWord();
  } else {
    console.log('No new words to display.');
  }
}

// ---------------------------
// Start
// ---------------------------
init();



























































// // Object Initialization and Canvas Setup
// let obj = {};
// let timeOffset = 60;
// let now = parseInt(performance.now()) / timeOffset;

// // Recording Timer Logic
// let isRecording = false;
// let timerInterval;
// let seconds = 0;
// let mediaStream = null;


// let audioChunks = []; // Store audio data chunks
// let silenceTimeout;   // Timeout to track silence
// const silenceThreshold = 0.01; // Threshold for detecting silence
// const silenceDuration = 2000;  // 2 seconds in milliseconds
// let audioRecorder;    // MediaRecorder object


// const maxWords = 20;
// const translationDiv = document.getElementById('translation');


// function init() {
//   // Set up canvas and context
//   obj.canvas = document.getElementById('canvas');
//   obj.ctx = obj.canvas.getContext('2d');

//   // Set the dimensions for the canvas
//   obj.width = 500;
//   obj.height = 60;
//   obj.canvas.width = obj.width * window.devicePixelRatio;
//   obj.canvas.height = obj.height * window.devicePixelRatio;
//   obj.canvas.style.width = obj.width + 'px';
//   obj.canvas.style.height = obj.height + 'px';
//   obj.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

//   // Append canvas to the DOM
//   document.getElementById('waveform').appendChild(obj.canvas);

//   // Initialize bars array
//   obj.bars = [];
// }

// function soundAllowed(stream) {
//   // Set up audio context and stream source
//   const AudioContext = window.AudioContext || window.webkitAudioContext;
//   const audioContext = new AudioContext();
//   const streamSource = audioContext.createMediaStreamSource(stream);

//   // Create an analyser node and connect it to the audio source
//   obj.analyser = audioContext.createAnalyser();
//   streamSource.connect(obj.analyser);
//   obj.analyser.fftSize = 512;
//   obj.frequencyArray = new Float32Array(obj.analyser.fftSize);

//   // Initialize the MediaRecorder
//   audioRecorder = new MediaRecorder(stream);
//   audioRecorder.ondataavailable = (event) => {
//     if (event.data.size > 0) audioChunks.push(event.data);
//   };

//   audioRecorder.start(); // Start recording audio
//   monitorSilence();
//   loop(); // Start the visual animation
// }

// function monitorSilence() {
//   const checkSilence = () => {
//     obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

//     // Calculate the maximum amplitude in the frequency array
//     const maxAmplitude = Math.max(...obj.frequencyArray.map(Math.abs));

//     if (maxAmplitude < silenceThreshold) {
//       // Silence detected; start timeout to send audio after 2 seconds of silence
//       if (!silenceTimeout) {
//         silenceTimeout = setTimeout(sendAudioToFlask, silenceDuration);
//       }
//     } else {
//       // Sound detected; clear the silence timeout
//       clearTimeout(silenceTimeout);
//       silenceTimeout = null;
//     }

//     if (isRecording) {
//       requestAnimationFrame(checkSilence); // Continue monitoring
//     }
//   };

//   checkSilence();
// }

// function sendAudioToFlask() {
//   console.log('Send the audio file to the Flask server', 'audioChunks length = ' + audioChunks.length)
//   if (audioChunks.length === 0) return;

//   // Create a Blob from the recorded audio chunks
//   const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
//   const formData = new FormData();
//   formData.append('audio', audioBlob, 'recording.webm');

//   // Send the audio file to the Flask server
//   console.log('fetch app.py')
//   fetch('http://127.0.0.1:5000/transcribe', {
//     method: 'POST',
//     body: formData,
//   })
//     .then((response) => response.json())
//     .then((data) => {
//       console.log('Transcription:', data.text);
//       displayTranscribe(data.text)
//       // document.getElementById('responseMessage').innerText = data.text;
//     })
//     .catch((error) => {
//       console.error('Error:', error);
//       // document.getElementById('responseMessage').innerText = 'Error occurred while transcribing.';
//     });

//   // Reset audio chunks after sending
//   audioChunks = [];
// }

// //Animation and Drawing Logic
// function loop() {
//   // Clear the canvas
//   obj.ctx.clearRect(0, 0, obj.canvas.width, obj.canvas.height);

//   // Variable to store the maximum frequency value
//   let max = 0;

//   // If enough time has passed, get the audio data
//   if (parseInt(performance.now() / timeOffset) > now) {
//     now = parseInt(performance.now() / timeOffset);
//     obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

//     // Find the maximum frequency in the data
//     for (let i = 0; i < obj.frequencyArray.length; i++) {
//       if (obj.frequencyArray[i] > max) {
//         max = obj.frequencyArray[i];
//       }
//     }

//     // Scale the frequency and add a new bar
//     const freq = Math.floor(max * 650);
//     obj.bars.push({
//       x: obj.width,
//       y: (obj.height / 2) - (freq / 2),
//       height: freq,
//       width: 2,
//     });
//   }

//   // Draw the bars and continue the animation
//   draw();
//   if(isRecording) requestAnimationFrame(loop);
// }

// function draw() {
//   // Loop through each bar and draw it
//   for (let i = 0; i < obj.bars.length; i++) {
//     const bar = obj.bars[i];
//     roundRect(obj.ctx, bar.x, bar.y, bar.width, bar.height)

//     // Move the bar to the left
//     bar.x -= 2;

//     // Remove the bar if it moves off-screen
//     if (bar.x < 1) {
//       obj.bars.splice(i, 1);
//     }
//   }
// }

// function roundRect(ctx, x, y, width, height, radius = 2, fill = true, stroke = false) {
//   if (typeof radius === 'number') radius = { tl: radius, tr: radius, br: radius, bl: radius };
//   else radius = { ...{ tl: 0, tr: 0, br: 0, bl: 0 }, ...radius };
  
//   ctx.beginPath();
//   ctx.moveTo(x + radius.tl, y);
//   ctx.lineTo(x + width - radius.tr, y);
//   ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
//   ctx.lineTo(x + width, y + height - radius.br);
//   ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
//   ctx.lineTo(x + radius.bl, y + height);
//   ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
//   ctx.lineTo(x, y + radius.tl);
//   ctx.quadraticCurveTo(x, y, x + radius.tl, y);
//   ctx.closePath();
//   ctx.fillStyle = 'rgb(255,255,255)';

//   if (fill) ctx.fill();
//   if (stroke) ctx.stroke(); 
// }


// function toggleRecording() {
//   const button = document.getElementById("recordButton");
//   if (isRecording) {
//     stopRecording();
//     button.innerHTML = '<i class="fa fa-play"></i>';
//   } else {
//     startRecording();
//     button.innerHTML = '<i class="fa fa-stop"></i>';
//   }
//   isRecording = !isRecording;
// }

// function startRecording() {
//   // Reset the timer
//   seconds = 0;
//   updateTimer();

//   // Start the timer interval
//   timerInterval = setInterval(() => {
//     seconds++;
//     updateTimer();
//   }, 1000);

//   // Start the recording by getting the media stream (microphone)
//   navigator.mediaDevices.getUserMedia({ audio: true })
//   .then(stream => {
//     mediaStream = stream;  // Store the stream for later use
//     soundAllowed(stream);
//   }).catch(soundNotAllowed);

//   console.log("Recording started...");
// }


// function stopRecording() {
//   // Stop the timer interval
//   clearInterval(timerInterval);
//   console.log("Recording stopped...");

//   // Stop the media stream (this will stop the microphone)
//   if (mediaStream) {
//     const tracks = mediaStream.getTracks();
//     tracks.forEach(track => track.stop());  // Stop all tracks in the media stream
//     console.log("Audio stream stopped...");
//   }
// }

// function updateTimer() {
//   // Format the timer as MM:SS
//   const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
//   const sec = String(seconds % 60).padStart(2, "0");
//   document.getElementById("timer").textContent = `${minutes}:${sec}`;
// }

// function soundNotAllowed() {
//   // Log an error message if audio permissions are denied
//   console.error("Audio permission denied or unavailable.");
// }

//   // Initialize canvas and start the animation loop
//   init();

//   function displayTranscribe(transcribedText) {
//     // Split the transcribed text into words
//     const words = translationDiv.innerText.split(' ').filter(word => word.trim() !== ''); // Filter out empty words
//     const newWords = transcribedText.split(' ').filter(word => word.trim() !== '');

//     // Append new words and ensure the total doesn't exceed maxWords
//     const combinedWords = words.concat(newWords);
//     const displayedWords = combinedWords.slice(-maxWords);

//     // Update the innerText of the div with the updated word list
//     translationDiv.innerText = displayedWords.join(' ');

//     // Display the processing "..." effect
//     const ellipsisEffect = document.createElement('span');
//     ellipsisEffect.className = 'processing';
//     ellipsisEffect.innerText = '...';
//     translationDiv.appendChild(ellipsisEffect);

//     // Remove the "..." after 1 second
//     setTimeout(() => {
//         ellipsisEffect.remove();
//     }, 1000);
// }
