---
title: SIH Multimodal Mental Health ML Inference Service
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: gradio
sdk_version: 4.44.0
app_file: app.py
pinned: false
---

# SIH Multimodal Mental Health ML Inference Service

Standalone microservice providing:
- **Whisper STT** (Quantized Faster-Whisper `base.en`)
- **Speech Emotion Recognition** (`superb/wav2vec2-base-superb-er`)
- **Text Emotion Classification** (`j-hartmann/emotion-english-distilroberta-base`)
- **Acoustic Signal Extraction** (Pitch, RMS energy variability via Librosa)
- **Conversational Disfluencies & Pause Metrics**

## Deployment to Free Hugging Face Spaces (SDK: Gradio):

1. Create a new Space on [Hugging Face](https://huggingface.co/new-space).
2. Name: `sih-ml-service`
3. Select **Gradio** as the Space SDK (100% Free CPU).
4. Push the files in this directory (`packages.txt`, `requirements.txt`, `app.py`, `README.md`) to your Space repository.
5. Copy your Space URL (e.g., `https://<YOUR_HF_USERNAME>-sih-ml-service.hf.space`).
6. Configure `HF_INFERENCE_URL` in your Vercel FastAPI backend environment.
