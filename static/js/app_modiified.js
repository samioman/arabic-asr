// Global Variables -------------------------------
let obj = {}; // Object for canvas and audio-related configurations


// UI Element for Switching Modes
let sendMode = "onStop"; // Default mode: "onStop" or "interval"
const modeSelector = document.getElementById("send-mode"); // Add a selector in HTML


// Recording State Variables
let isRecording = false; // Recording status
let audioRecorder; // MediaRecorder instance
let mediaStream = null; // Media stream from the user's microphone

// Send audio to flask
let audioChunks = []; // Array to store recorded audio data chunks

// Timer
let timerInterval; // Timer interval for the recording session
let sendInterval; // Interval for sending audio data periodically
let seconds = 0; // Seconds counter for recording

// Silence Detection Variables
let silenceTimeout; // Timeout for detecting silence
const silenceThreshold = 0.01; // Threshold for silence detection
const silenceDuration = 2000; // Silence duration (2 seconds in milliseconds)

// Spinner Element
const spinner = document.getElementById("spinner");

// Text Display Variables
const maxWords = 40; // Maximum words to display in the translation box
const translationDiv = document.getElementById("translation"); // Element for displaying transcription

// Animation Loop
let timeOffset = 60;           // Timer offset for animation loop
let now = parseInt(performance.now()) / timeOffset;



// Initialization -------------------------------
function init() {
    // Set up the canvas for visualizing audio
    obj.canvas = document.getElementById("canvas");
    obj.ctx = obj.canvas.getContext("2d");

    obj.width = 150;
    obj.height = 60;
    obj.canvas.width = obj.width * window.devicePixelRatio;
    obj.canvas.height = obj.height * window.devicePixelRatio;
    obj.canvas.style.width = obj.width + "px";
    obj.canvas.style.height = obj.height + "px";
    obj.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Append the canvas to the DOM
    document.getElementById("waveform").appendChild(obj.canvas);
    obj.bars = []; // Initialize an array to hold audio visualization bars

    // Start Recording
    navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
        audioRecorder = new MediaRecorder(stream);
        mediaStream = stream;
    });


    // Event Listener for Switching Modes
    if (modeSelector) {
        modeSelector.addEventListener("change", (event) => {
            sendMode = event.target.value; // Update sendMode based on user selection
            console.log(`Send mode switched to: ${sendMode}`);
        });
    }

}

// Recording Controls
function toggleRecording() {
    const playPauseImg = document.getElementById("play-pause");
    playPauseImg.src = isRecording ? "../static/imgs/play.png" : "../static/imgs/pause.png";

    // toggle the isRecording variable
    isRecording = !isRecording;

    // Call function for audio recording
    soundAllowed(isRecording);
}

// On/Off audio recording
function soundAllowed(isRecording) {
    if (!isRecording) {
        // Stop Recording
        console.log("Stop Recording ...");
        audioRecorder.stop();

        // Clear any intervals
        if (sendMode === "interval") {
            clearInterval(sendInterval);
        }

        clearInterval(timerInterval); // Clear the timer
        return;
    }

    // Start Recording
    console.log("Start Recording ...");

    audioRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
        console.log("Audio chunk added.");
    };

    // Handle sending logic based on mode
    if (sendMode === "onStop") {
        audioRecorder.onstop = () => {
            console.log("Stop event triggered. Sending remaining audio.");
            sendAudioToFlask(); // Send all remaining audio on stop
        };
    } else if (sendMode === "interval") {
        // Clear any existing interval to avoid duplicates
        clearInterval(sendInterval);

        // Start periodic sending
        sendInterval = setInterval(() => {
            console.log("Sending audio at interval...");
            audioRecorder.requestData() // Request the current chunk

            sendAudioToFlask(); // Send the audio
        }, 5000); // Adjust interval as needed
    }

    audioRecorder.start(); // Start recording
    updateFrequencyArray(); // Start audio visualization
    animateAudio(); // Visualize audio
    // monitorSilence(); // Monitor silence

    // Timer
    seconds = 0;
    timerInterval = setInterval(() => {
        seconds++;
        updateTimer();
    }, 1000);
}

// Sending Audio Data
function sendAudioToFlask() {
    console.log('audioChunks', audioChunks.length);
    if (audioChunks.length === 0) {
        console.log("No audio chunks available to send.");
        return;
    }

    const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.webm");

    console.log("Sending audio to Flask server...");
    spinner.style.visibility = "visible";
    fetch("https://arabic-asr.onrender.com/transcribe", {
        method: "POST",
        body: formData,
    })
        .then((response) => response.json())
        .then((data) => {
            console.log("Transcription:", data);
            spinner.style.visibility = "hidden";
            displayTranscribe(data.text);
        })
        .catch((error) => console.error("Error:", error));

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
        // console.error('Invalid transcribedText:', transcribedText);
        return; // Exit if the input is invalid
    }

    const existingWords = translationDiv.value.split(' ').filter(word => word.trim() !== ''); // Current displayed words
    const newWords = transcribedText.split(' ').filter(word => word.trim() !== ''); // Words from new transcription
    const wordsToType = newWords.filter(word => !existingWords.includes(word)); // Only the truly new words

    let index = 0; // Start typing from the first new word

    // Function to type out the new words one by one
    function typeWord() {
        if (index < wordsToType.length) {
            // Append the next word with a space
            translationDiv.value += wordsToType[index] + ' ';
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
            }, 5000);
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
