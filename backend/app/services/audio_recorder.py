import os
import time
import queue
import logging
import threading
import tempfile
import numpy as np
import scipy.io.wavfile as wavfile
import sounddevice as sd

logger = logging.getLogger(__name__)

class AudioRecorderError(Exception):
    """Base exception for audio recording errors."""
    pass

class MicrophoneAccessError(AudioRecorderError):
    """Raised when there is an issue accessing the microphone device or permissions."""
    pass

class AudioRecorder:
    """
    A modular class to handle audio recording from the computer's microphone.
    Supports fixed-duration recording and manual start/stop recording.
    """
    
    def __init__(self, sample_rate: int = 22050, channels: int = 1):
        """
        Initializes the AudioRecorder.
        
        Args:
            sample_rate: Target sample rate for recording (default 22050 Hz).
            channels: Number of audio channels (default 1 for mono).
        """
        self.sample_rate = sample_rate
        self.channels = channels
        self._recording = False
        self._q = queue.Queue()
        self._stream = None
        self._recording_thread = None
        self._recorded_data = []

    def _check_input_device(self):
        """
        Checks if there is a valid input device available.
        Raises MicrophoneAccessError if no device is found.
        """
        try:
            devices = sd.query_devices()
            input_devices = [d for d in devices if d['max_input_channels'] > 0]
            if not input_devices:
                raise MicrophoneAccessError("No audio input devices (microphones) detected on the system.")
            
            # Check default input device index
            default_device = sd.default.device[0]
            if default_device == -1 or default_device is None:
                # If default is not set or invalid, select the first device with input channels
                first_input_idx = devices.index(input_devices[0])
                sd.default.device = (first_input_idx, sd.default.device[1])
                logger.info(f"Default input device not set. Using device index {first_input_idx}: {input_devices[0]['name']}")
        except Exception as e:
            if not isinstance(e, MicrophoneAccessError):
                raise MicrophoneAccessError(f"Failed to query audio input devices: {e}")
            raise e

    def _callback(self, indata, frames, time_info, status):
        """This is called for each audio block by sounddevice."""
        if status:
            logger.warning(f"Sounddevice callback status: {status}")
        self._q.put(indata.copy())

    def start_recording(self):
        """
        Starts recording audio from the microphone asynchronously in a non-blocking thread.
        To stop the recording and get the file path, call stop_recording().
        """
        if self._recording:
            logger.warning("Recording is already in progress.")
            return

        self._check_input_device()
        self._recording = True
        self._q = queue.Queue()
        self._recorded_data = []

        try:
            self._stream = sd.InputStream(
                samplerate=self.sample_rate,
                channels=self.channels,
                callback=self._callback
            )
            self._stream.start()
            
            # Start background thread to consume the queue and collect audio data
            self._recording_thread = threading.Thread(target=self._consume_queue, daemon=True)
            self._recording_thread.start()
            logger.info("Microphone recording started asynchronously.")
            
        except sd.PortAudioError as e:
            self._recording = False
            if self._stream:
                try:
                    self._stream.stop()
                    self._stream.close()
                except Exception:
                    pass
                self._stream = None
            raise MicrophoneAccessError(
                f"Could not open microphone stream. This may be due to permission settings, "
                f"the device being in use by another app, or an invalid sample rate. Detail: {e}"
            ) from e
        except Exception as e:
            self._recording = False
            raise AudioRecorderError(f"Unexpected error starting recording: {e}") from e

    def _consume_queue(self):
        """Consumes audio blocks from the queue and appends them to a list."""
        while self._recording or not self._q.empty():
            try:
                # Use a timeout so we check self._recording flag periodically
                data = self._q.get(timeout=0.1)
                self._recorded_data.append(data)
            except queue.Empty:
                continue

    def stop_recording(self, output_path: str = None) -> str:
        """
        Stops the active recording and saves it to a WAV file.
        
        Args:
            output_path: Optional custom path to save the WAV file. If not provided,
                         a temporary file in the system temp directory is created.
                         
        Returns:
            The file path to the saved WAV file.
        """
        if not self._recording:
            if not self._recorded_data:
                raise AudioRecorderError("No active recording session, and no cached audio data exists to save.")
            logger.warning("Recording was not active, but writing previously recorded data.")
        
        self._recording = False
        
        # Stop stream
        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception as e:
                logger.error(f"Error closing microphone stream: {e}")
            finally:
                self._stream = None

        # Wait for thread to finish consuming
        if self._recording_thread:
            self._recording_thread.join(timeout=2.0)
            self._recording_thread = None

        if not self._recorded_data:
            raise AudioRecorderError("Recording completed, but no audio data was captured.")

        try:
            # Concatenate all blocks
            audio_data = np.concatenate(self._recorded_data, axis=0)
            
            # Construct output path if not provided
            if not output_path:
                temp_dir = tempfile.gettempdir()
                output_path = os.path.join(temp_dir, f"recorded_response_{int(time.time())}.wav")
            else:
                # Ensure parent directory exists
                parent_dir = os.path.dirname(output_path)
                if parent_dir:
                    os.makedirs(parent_dir, exist_ok=True)

            # Convert from sounddevice float32 output (-1.0 to 1.0) to 16-bit PCM WAV
            audio_int16 = np.int16(np.clip(audio_data, -1.0, 1.0) * 32767)
            wavfile.write(output_path, self.sample_rate, audio_int16)
            logger.info(f"Recording successfully saved to {output_path}")
            
            # Reset buffers
            self._recorded_data = []
            
            return output_path
        except Exception as e:
            raise AudioRecorderError(f"Failed to save recorded audio file: {e}") from e

    def record_fixed_duration(self, duration_seconds: float, output_path: str = None) -> str:
        """
        Records audio from the microphone for a fixed duration.
        Blocks until the recording is finished.
        
        Args:
            duration_seconds: Duration to record in seconds.
            output_path: Optional custom path to save the WAV file.
            
        Returns:
            The file path to the saved WAV file.
        """
        if duration_seconds <= 0:
            raise ValueError("Duration must be a positive number of seconds.")
            
        self._check_input_device()
        
        try:
            frames = int(duration_seconds * self.sample_rate)
            logger.info(f"Recording microphone for {duration_seconds} seconds...")
            
            # sounddevice.rec returns an array of shape (frames, channels)
            audio_data = sd.rec(
                frames, 
                samplerate=self.sample_rate, 
                channels=self.channels, 
                blocking=True
            )
            logger.info("Recording finished.")
            
            # Save to file
            if not output_path:
                temp_dir = tempfile.gettempdir()
                output_path = os.path.join(temp_dir, f"recorded_response_{int(time.time())}.wav")
            else:
                # Ensure parent directory exists
                parent_dir = os.path.dirname(output_path)
                if parent_dir:
                    os.makedirs(parent_dir, exist_ok=True)

            # Convert to 16-bit PCM WAV
            audio_int16 = np.int16(np.clip(audio_data, -1.0, 1.0) * 32767)
            wavfile.write(output_path, self.sample_rate, audio_int16)
            
            return output_path
            
        except sd.PortAudioError as e:
            raise MicrophoneAccessError(
                f"Could not record audio. This may be due to permission settings, "
                f"the device being in use, or an invalid sample rate. Detail: {e}"
            ) from e
        except Exception as e:
            if not isinstance(e, MicrophoneAccessError):
                raise AudioRecorderError(f"Unexpected error during fixed duration recording: {e}") from e
            raise e

def record_microphone(duration_seconds: float, output_path: str = None, sample_rate: int = 22050) -> str:
    """
    Convenience function to record microphone audio for a fixed duration.
    
    Args:
        duration_seconds: Duration to record in seconds.
        output_path: Optional custom path to save the WAV file.
        sample_rate: Target sample rate. Defaults to 22050.
        
    Returns:
        The file path to the saved WAV file.
    """
    recorder = AudioRecorder(sample_rate=sample_rate)
    return recorder.record_fixed_duration(duration_seconds, output_path=output_path)
