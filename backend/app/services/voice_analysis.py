import os
import logging
import numpy as np
import librosa

logger = logging.getLogger(__name__)

class VoiceAnalyzer:
    """
    A modular class for analyzing audio files to extract voice features.
    Designed for extension into speech emotion recognition and distress prediction.
    """
    
    def __init__(self, sample_rate: int = 22050):
        """
        Initializes the VoiceAnalyzer.
        
        Args:
            sample_rate: Target sample rate for audio analysis. Defaults to 22050 Hz.
        """
        self.sample_rate = sample_rate

    def load_audio(self, file_path: str) -> tuple[np.ndarray, float]:
        """
        Loads an audio file and returns the time-series array and duration.
        
        Args:
            file_path: Path to the audio file.
            
        Returns:
            A tuple of (y, duration) where:
                - y: Audio time series as a numpy array.
                - duration: Duration of the audio file in seconds.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
        
        # Load audio (mono is default in librosa)
        y, sr = librosa.load(file_path, sr=self.sample_rate)
        duration = float(librosa.get_duration(y=y, sr=sr))
        return y, duration

    def extract_pitch(self, y: np.ndarray, fmin: float = 65.0, fmax: float = 500.0, method: str = 'pyin') -> float:
        """
        Extracts the average fundamental frequency (pitch, F0) of voiced frames.
        
        Args:
            y: Audio time series.
            fmin: Minimum frequency for pitch tracking (default 65 Hz for human speech).
            fmax: Maximum frequency for pitch tracking (default 500 Hz for human speech).
            method: 'pyin' (probabilistic YIN, more robust) or 'yin' (standard YIN, faster).
            
        Returns:
            Mean fundamental frequency (F0) in Hz, or 0.0 if no voiced pitch is detected.
        """
        if len(y) == 0 or np.all(y == 0):
            return 0.0
            
        try:
            if method == 'pyin':
                # pyin returns (f0, voiced_flag, voiced_prob)
                f0, voiced_flag, voiced_prob = librosa.pyin(
                    y, 
                    fmin=fmin, 
                    fmax=fmax, 
                    sr=self.sample_rate,
                    fill_na=np.nan
                )
            elif method == 'yin':
                # yin returns f0 values directly
                f0 = librosa.yin(
                    y, 
                    fmin=fmin, 
                    fmax=fmax, 
                    sr=self.sample_rate
                )
            else:
                raise ValueError(f"Unknown pitch extraction method: {method}")
            
            # Filter out NaNs and check if we have any valid voiced frames
            valid_pitches = f0[~np.isnan(f0)] if np.any(~np.isnan(f0)) else []
            
            if len(valid_pitches) > 0:
                return float(np.mean(valid_pitches))
            return 0.0
            
        except Exception as e:
            logger.error(f"Error extracting pitch using {method}: {e}")
            return 0.0

    def extract_rms_energy(self, y: np.ndarray) -> float:
        """
        Extracts the average Root Mean Square (RMS) energy.
        
        Args:
            y: Audio time series.
            
        Returns:
            Mean RMS energy over all frames.
        """
        if len(y) == 0:
            return 0.0
        try:
            rms = librosa.feature.rms(y=y)
            return float(np.mean(rms))
        except Exception as e:
            logger.error(f"Error extracting RMS energy: {e}")
            return 0.0

    def extract_mfccs(self, y: np.ndarray, n_mfcc: int = 13) -> list[float]:
        """
        Extracts Mel-Frequency Cepstral Coefficients (MFCCs) and computes their mean over time.
        
        Args:
            y: Audio time series.
            n_mfcc: Number of MFCCs to extract.
            
        Returns:
            A list of mean values for each MFCC (length n_mfcc).
        """
        if len(y) == 0:
            return [0.0] * n_mfcc
        try:
            mfccs = librosa.feature.mfcc(y=y, sr=self.sample_rate, n_mfcc=n_mfcc)
            mean_mfccs = np.mean(mfccs, axis=1)
            return [float(x) for x in mean_mfccs]
        except Exception as e:
            logger.error(f"Error extracting MFCCs: {e}")
            return [0.0] * n_mfcc

    def analyze(self, file_path: str, pitch_method: str = 'pyin') -> dict[str, any]:
        """
        Extracts voice features from an audio file and returns them in a structured dictionary.
        
        Args:
            file_path: Path to the audio file.
            pitch_method: Pitch extraction method to use ('pyin' or 'yin').
            
        Returns:
            A dictionary containing:
                - duration_seconds: duration of the audio in seconds.
                - pitch_mean_hz: mean voiced fundamental frequency (F0).
                - rms_energy_mean: mean RMS energy.
                - mfcc_1_mean through mfcc_13_mean: mean values for MFCCs.
        """
        y, duration = self.load_audio(file_path)
        
        pitch_mean = self.extract_pitch(y, method=pitch_method)
        rms_mean = self.extract_rms_energy(y)
        mfcc_list = self.extract_mfccs(y, n_mfcc=13)
        
        # Prepare a flat dictionary structure
        features = {
            "duration_seconds": duration,
            "pitch_mean_hz": pitch_mean,
            "rms_energy_mean": rms_mean,
        }
        
        # Add individual MFCCs (1-indexed for clarity)
        for i, val in enumerate(mfcc_list):
            features[f"mfcc_{i+1}_mean"] = val
            
        return features

def analyze_voice_file(file_path: str, sample_rate: int = 22050, pitch_method: str = 'pyin') -> dict[str, any]:
    """
    Convenience function to analyze voice features of an audio file.
    
    Args:
        file_path: Path to the audio file.
        sample_rate: Target sample rate for loading audio. Defaults to 22050.
        pitch_method: Method for pitch extraction ('pyin' or 'yin'). Defaults to 'pyin'.
        
    Returns:
        A dictionary containing extracted voice features:
        - duration_seconds
        - pitch_mean_hz
        - rms_energy_mean
        - mfcc_1_mean through mfcc_13_mean
    """
    analyzer = VoiceAnalyzer(sample_rate=sample_rate)
    return analyzer.analyze(file_path, pitch_method=pitch_method)
