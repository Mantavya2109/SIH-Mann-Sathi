# Aura - Empathetic Voice Mental Health Companion

Aura is a voice-first, empathetic AI conversation assistant designed to monitor and support users' mental health. It leverages a multimodal analysis pipeline to evaluate vocal and textual emotion, extract speech disfluencies, compute distress scores, and generate warm, natural, non-clinical AI responses using the `openai/gpt-oss-120b` model via the Groq API.

---

## 1. Core Architecture & Pipeline Flow

The backend processes incoming speech files (transcribed locally in the browser or uploaded via endpoints) through the following pipeline:

```
User Voice Input (WebM/WAV)
     ↓
FastAPI endpoint (POST /api/conversation/respond)
     ↓
speech_to_text.py (Transcribes audio using faster-whisper)
     ↓
speech_emotion.py (Predicts vocal emotion probabilities using superb/wav2vec2)
     ↓
text_emotion.py (Predicts text emotion probabilities using j-hartmann/emotion-english-distilroberta-base)
     ↓
conversation_features.py (Extracts acoustic features like pitch/energy and disfluencies)
     ↓
distress_scorer.py (Fuses emotional/acoustic indicators into a final distress score and risk tier)
     ↓
conversation_manager.py (Evaluates conversational state transitions and enforces safety warning tags)
     ↓
conversation_session.py (Maintains turn counters and context history in memory)
     ↓
response_generator.py (Generates JSON output with the Groq openai/gpt-oss-120b model or uses rule-based fallbacks)
     ↓
Client Response (Exactly 5 public fields)
```

---

## 2. Repository Structure

```
SIH/
├── backend/
│   └── app/
│       ├── api/               # API route definitions (empty for main routing)
│       ├── models/            # Database / Internal model declarations (empty)
│       ├── schemas/
│       │   └── analysis.py    # Request/Response validation schemas
│       ├── services/
│       │   ├── conversation_features.py # Disfluency & Acoustic parameters extractor
│       │   ├── conversation_manager.py  # Conversational state transitions & safety triggers
│       │   ├── conversation_session.py  # In-memory session Turn history tracker
│       │   ├── distress_scorer.py       # Multimodal emotion scoring fusion layers
│       │   ├── response_generator.py    # Groq API / fallback response generator
│       │   ├── speech_emotion.py        # Wav2Vec2 audio classification
│       │   ├── speech_to_text.py        # Faster Whisper STT module
│       │   └── text_emotion.py          # DistilRoBERTa text classifier
│       ├── utils/             # Core utility helpers (empty)
│       └── main.py            # Primary FastAPI application entrypoint
│
├── frontend/                  # User-facing Chat Interface
│   ├── index.html             # HTML5 structure with Outfit typography
│   ├── style.css              # Custom styling (dark theme, recording & typing animations)
│   └── script.js              # MediaRecorder voice upload & session handling logic
│
├── tests/                     # Automated Test Suites
│   ├── test_api_respond.py              # Endpoint integration tests
│   ├── test_conversation_manager.py     # State transitions unit tests
│   ├── test_groq_integration.py         # Mock Groq SDK and timeout fallbacks unit tests
│   ├── test_production_conversation.py  # End-to-end multi-turn integration tests
│   ├── test_production_services.py      # Core service standalone test cases
│   └── test_regression.py               # ML Pipeline feature regression tests
│
├── data/                      # Local data asset storage placeholder
├── ml/                        # Locally trained / cached ML checkpoint configurations
├── .gitignore                 # Safe system targets ignores
├── README.md                  # Project documentation
└── requirements.txt           # Production server dependencies list
```

---

## 3. Installation & Setup

### Prerequisites
* Python 3.10 or higher.
* PyAV system dependencies if converting custom media streams.

### Virtual Environment Setup
Create and activate a virtual environment in the project directory:

**Windows (PowerShell):**
```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
```

**Linux / macOS:**
```bash
python3 -m venv venv
source venv/bin/activate
```

### Dependency Installation
Install the required production libraries:
```bash
pip install -r requirements.txt
```

To install the developer/testing libraries:
```bash
pip install -r requirements-dev.txt
```

---

## 4. Key Configuration & Secrets Safety

To communicate with the Groq LLM, you must configure a `GROQ_API_KEY` environment variable.

1. Create a `.env` file in the root workspace folder (`SIH/`):
   ```env
   GROQ_API_KEY=your_real_groq_api_key_here
   ```
2. **SECURITY IMPORTANT:** The `.env` file contains production secrets and is ignored by Git in `.gitignore`. **NEVER** commit or push `.env` to public code repositories. Refer to `.env.example` for the expected format.

---

## 5. Running the Application

### A. Start the Backend Server (FastAPI)
Run the uvicorn development server from the workspace root:
```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```
* Swagger Docs will be available at: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
* Root API message confirms status: [http://127.0.0.1:8000/](http://127.0.0.1:8000/)

### B. Start the Frontend Application
Since browser media APIs require secure context access to use the microphone, serve the static frontend directory from a local web server:
```bash
python -m http.server 8001 --directory frontend
```
Navigate to: **[http://127.0.0.1:8001](http://127.0.0.1:8001)**

---

## 6. API Endpoint Contracts

### `POST /api/conversation/respond`
Uploads voice recordings and generates conversational text responses.

* **Request Content Type**: `multipart/form-data`
* **Request Fields**:
  * `file`: (Required) Audio file (supported types: `.wav`, `.webm`, `.ogg`, `.opus`, `.mp4`, `.m4a`).
  * `session_id`: (Optional) Existing conversation session ID to maintain history.
* **Public Client Response (Exactly 5 Fields)**:
  ```json
  {
    "session_id": "89b37c15-46fd-410a-8bf8-d306bdfd87b3",
    "turn_number": 1,
    "transcript": "I am doing well today.",
    "response_text": "I am so glad to hear that. It sounds like things are going pretty smoothly today.",
    "follow_up_question": "What is something you are looking forward to doing?"
  }
  ```

### `POST /api/conversation/start`
Initializes a new session.
* **Response**:
  ```json
  {
    "session_id": "89b37c15-46fd-410a-8bf8-d306bdfd87b3",
    "message": "Conversation started"
  }
  ```

### `POST /api/conversation/end`
Terminates an active session and releases resources.
* **Request Fields**:
  * `session_id`: (Required) Form parameter identifying session.

---

## 7. Testing Instructions

To run the complete automated test suite (including units, regression checks, and E2E integration turns):
```bash
python -m pytest
```

To run individual test files:
```bash
python -m pytest tests/test_groq_integration.py
python -m pytest tests/test_production_conversation.py
```
