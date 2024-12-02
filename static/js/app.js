
// Global Variables -------------------------------
let obj = {};                  // Object for canvas and audio-related configurations

// Recording State Variables
let isRecording = false;       // Recording status
let audioRecorder;             // MediaRecorder instance
let mediaStream = null;        // Media stream from the user's microphone

// Send audio to flask
let audioChunks = [];          // Array to store recorded audio data chunks

// Timer
let timerInterval;             // Timer interval for the recording session
let seconds = 0;               // Seconds counter for recording

// Animation Loop
let timeOffset = 60;           // Timer offset for animation loop
let now = parseInt(performance.now()) / timeOffset;

// Silence Detection Variables
let silenceTimeout;            // Timeout for detecting silence
const silenceThreshold = 0.01; // Threshold for silence detection
const silenceDuration = 5000;  // Silence duration (5 seconds in milliseconds)

// Spinner Element
const spinner = document.getElementById("spinner");

// Text Display Variables
const maxWords = 40;           // Maximum words to display in the translation box
const translationDiv = document.getElementById('translation'); // Element for displaying transcription




// Initialization -------------------------------
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


  // Strt Recording
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    audioRecorder = new MediaRecorder(stream);
    mediaStream = stream;
  });

}



// Recording Controls
function toggleRecording() {
  const playPauseImg = document.getElementById("play-pause");
  playPauseImg.src = isRecording ? '../static/imgs/play.png' : '../static/imgs/pause.png';

  // toggle the isRecording variable
  isRecording = !isRecording;

  // Call function of allawing Audio
  soundAllowed(isRecording)
}


// On/Off audio recording 
function soundAllowed(isRecording) {
  if (!isRecording) { // Stop Recording
    console.log("Stop Recording ...");
    audioRecorder.stop();

    // Reset timer
    clearInterval(timerInterval);
    return;
  }


  // Start Recording 
  console.log("Start Recording ...");

  // Handle data availability
  audioRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
    
  };

  // Handle stop event to combine chunks into a single Blob
  audioRecorder.onstop = () => {

    console.log('YES CALL Flask [onstop], audioChunks Data -> ', audioChunks.length);
    sendAudioToFlask();
  };

  
  audioRecorder.start();              // Start recording
  updateFrequencyArray();             // To be used on animateAudio() and monitorSilence();
  animateAudio();                     // Call looping animation
  monitorSilence();                   // Start monitoring silence

  // Set Timer
  seconds = 0;
  // updateTimer();
  timerInterval = setInterval(() => { seconds++; updateTimer(); }, 1000);

}



// Monitor Silence  
function monitorSilence() {
  const checkSilence = () => {
    obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

    // Detect silence based on maximum amplitude
    const maxAmplitude = Math.max(...obj.frequencyArray.map(Math.abs));
    if (maxAmplitude < silenceThreshold) {
      if (!silenceTimeout) {
        silenceTimeout = setTimeout(() => {

          // Flush pending audio data
          audioRecorder.requestData(); // Explicitly request current audio chunk

          // Delay slightly to ensure chunks are pushed to `audioChunks`
          setTimeout(() => {
            console.log('Calling Flask from monitorSilence, audioChunks Data ->', audioChunks.length);
            sendAudioToFlask();
          }, 500); // Adjust delay as needed to allow chunk processing
        }, silenceDuration // Wait for silence duration
        );
      }
    } else {
      clearTimeout(silenceTimeout); // Reset silence timeout if sound is detected
      silenceTimeout = null;
    }

    if (isRecording) requestAnimationFrame(checkSilence);
  };

  checkSilence();
}


// Sending Audio Data
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
      console.log('Transcription:', data);
      spinner.style.visibility = "hidden";
      displayTranscribe(data.text);
    })
    .catch((error) => console.error('Error:', error));

  audioChunks = []; // Clear chunks after sending
}



// Utility Functions -------------------------------

// Update time on html
function updateTimer() {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const sec = String(seconds % 60).padStart(2, "0");
  document.getElementById("timer").textContent = `${minutes}:${sec}`;
}

function updateFrequencyArray() {
  // Initialize audio context and analyser
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  const audioContext = new AudioContext();
  const streamSource = audioContext.createMediaStreamSource(mediaStream);

  obj.analyser = audioContext.createAnalyser();
  streamSource.connect(obj.analyser);
  obj.analyser.fftSize = 512;
  obj.frequencyArray = new Float32Array(obj.analyser.fftSize);
}

function animateAudio() {
  obj.ctx.clearRect(0, 0, obj.canvas.width, obj.canvas.height); // Clear the canvas

  if (parseInt(performance.now() / timeOffset) > now) {
    now = parseInt(performance.now() / timeOffset);
    obj.analyser.getFloatTimeDomainData(obj.frequencyArray);

    const max = Math.max(...obj.frequencyArray); // Find max frequency
    const freq = Math.floor(max * 650);         // Scale frequency

    obj.bars.push({ x: obj.width, y: obj.height / 2 - freq / 2, height: freq, width: 2 });
  }

  draw();
  if (isRecording) requestAnimationFrame(animateAudio);
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

function soundNotAllowed() {
  console.error("Audio permission denied or unavailable.");
}



// Start -------------------------------
init();















// ------------------------------------------------------------------------------



















// // ---------------------------
// // Audio Recording and Silence Monitoring
// // ---------------------------

// function soundAllowed(stream) {
//   // Initialize audio context and analyser
//   const AudioContext = window.AudioContext || window.webkitAudioContext;
//   const audioContext = new AudioContext();
//   const streamSource = audioContext.createMediaStreamSource(stream);

//   obj.analyser = audioContext.createAnalyser();
//   streamSource.connect(obj.analyser);
//   obj.analyser.fftSize = 512;
//   obj.frequencyArray = new Float32Array(obj.analyser.fftSize);


//   monitorSilence();      // Start monitoring silence
//   loop();                // Start the visualization loop
// }




// // audioRecorder.onstop = () => {
// //   console.log("Recording stopped, sending audio...");
// //   sendAudioToFlask(); // Trigger sending audio only after stopping
// // };









// function soundNotAllowed() {
//   console.error("Audio permission denied or unavailable.");
// }



















































