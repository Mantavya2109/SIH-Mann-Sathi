import logging
import torch
from transformers import AutoConfig, AutoModelForSequenceClassification, AutoTokenizer

logger = logging.getLogger(__name__)

class TextEmotionService:
    """
    Production-ready text emotion classifier encapsulating DistilRoBERTa.
    Loads models once lazily and caches them in memory.
    """
    def __init__(self, model_name: str = "j-hartmann/emotion-english-distilroberta-base"):
        self.model_name = model_name
        self.config = None
        self.tokenizer = None
        self.model = None

    def _load_model(self):
        """Loads tokenizer and sequence classifier into memory if not already loaded."""
        if self.model is None:
            logger.info(f"Loading DistilRoBERTa text emotion model: {self.model_name}")
            try:
                self.config = AutoConfig.from_pretrained(self.model_name)
                self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
                self.model = AutoModelForSequenceClassification.from_pretrained(self.model_name)
                self.model.eval()
            except Exception as e:
                logger.error(f"Failed to load text emotion model: {e}")
                raise e

    def predict_emotion(self, text: str) -> dict[str, float]:
        """
        Runs transformer inference on the supplied text transcript string.
        
        Args:
            text: Transcript string to classify.
            
        Returns:
            Dictionary containing mapped emotion probabilities (Fear, Sadness, Anger, Joy, etc.).
        """
        try:
            self._load_model()
            text_inputs = self.tokenizer(text, return_tensors="pt", truncation=True, padding=True)
            with torch.no_grad():
                text_outputs = self.model(**text_inputs)
                text_logits = text_outputs.logits
                text_probs = torch.softmax(text_logits, dim=-1).squeeze().numpy()
                
            text_results = {}
            for idx, score in enumerate(text_probs):
                label = self.config.id2label[idx].capitalize()
                text_results[label] = float(score)
                
            return text_results
        except Exception as e:
            logger.error(f"Text emotion sequence classification failed: {e}")
            # Safe default fallback with Neutral dominance
            return {
                "Joy": 0.0,
                "Sadness": 0.0,
                "Fear": 0.0,
                "Anger": 0.0,
                "Surprise": 0.0,
                "Disgust": 0.0,
                "Neutral": 1.0
            }

# Singleton instance for application reuse
text_emotion_service = TextEmotionService()
