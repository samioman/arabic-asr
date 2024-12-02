from flask import Flask, render_template, request, jsonify
from transformers import pipeline
import os
import warnings


warnings.simplefilter(action='ignore', category=FutureWarning)


app = Flask(__name__)
UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# Load model from the local directory
# model_turbo = "../traind_models/whisper-large-v3-turbo-ar"
model_medium = "Samioman/whisper-medium-ar"


pipe = pipeline(
    "automatic-speech-recognition", 
    model= model_medium,
    device= 1  # Use 0 for GPU and 1 for CPU
)

def transcribe_speech(filepath):
    output = pipe(
        inputs = filepath,
        generate_kwargs={
            "task": "transcribe",
            "language": "arabic",
            "max_new_tokens": 256
        },
        chunk_length_s=15, # specifies how long (s) each audio chunk is for processing
        batch_size=8,
    )
    return output["text"]
    

@app.route('/transcribe', methods=['POST'])
def transcribe_audio():
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    # Save the uploaded audio file
    audio_file = request.files['audio']
    file_path = os.path.join(UPLOAD_FOLDER, audio_file.filename)
    audio_file.save(file_path)
    

    try:
        # Transcribe the audio using the Whisper model
        transcription = transcribe_speech(file_path)
        return jsonify({'text': transcription}), 200
    except Exception as e:
        # print(f'Error during transcription: {str(e)}')
        # return jsonify({'error': str(e)}), 500
        transcription, detected_language = transcribe_speech(file_path)
        return jsonify({'text': transcription, 'language': detected_language}), 200
    finally:
        # Cleanup: remove the uploaded file
        if os.path.exists(file_path):
            os.remove(file_path)


@app.route('/')
def home():
    return render_template('index.html')




if __name__ == '__main__':
    app.run()