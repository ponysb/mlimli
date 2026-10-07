"""Final recognizer selection. All inference reads local weights only."""
import pathlib
import numpy as np


def create_final(root, options, sherpa):
    model_id = options.get('modelId', 'sensevoice')
    directory = options.get('directory', 'sherpa-onnx-sense-voice-zh-en-ja-ko-yue-int8-2025-09-09')
    model = root / directory
    threads = options.get('threads', 2)
    if model_id == 'qwen17':
        return QwenRecognizer(model, options.get('device', 'auto'))
    if model_id == 'qwen06':
        return sherpa.OfflineRecognizer.from_qwen3_asr(
            conv_frontend=str(model / 'conv_frontend.onnx'),
            encoder=str(model / 'encoder.int8.onnx'), decoder=str(model / 'decoder.int8.onnx'),
            tokenizer=str(model / 'tokenizer'), num_threads=threads, max_new_tokens=256,
        )
    if model_id == 'paraformer':
        return sherpa.OfflineRecognizer.from_paraformer(
            paraformer=str(model / 'model.int8.onnx'), tokens=str(model / 'tokens.txt'), num_threads=threads,
        )
    if model_id != 'sensevoice':
        raise ValueError('Unknown ASR model')
    return sherpa.OfflineRecognizer.from_sense_voice(
        model=str(model / 'model.int8.onnx'), tokens=str(model / 'tokens.txt'), num_threads=threads, use_itn=True,
    )


class QwenStream:
    def __init__(self):
        self.samples = None
        self.result = self
        self.text = ''

    def accept_waveform(self, sample_rate, samples):
        if sample_rate != 16000:
            raise ValueError('Expected mono 16 kHz audio')
        self.samples = np.asarray(samples, dtype=np.float32)


class QwenRecognizer:
    def __init__(self, directory, device):
        import os
        # Enforce offline even for direct worker invocations and --check.
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        import torch
        from qwen_asr import Qwen3ASRModel
        if device == 'auto':
            device = 'cuda:0' if torch.cuda.is_available() else 'mps' if torch.backends.mps.is_available() else 'cpu'
        dtype = torch.float16 if device != 'cpu' else torch.float32
        self.model = Qwen3ASRModel.from_pretrained(
            str(directory), dtype=dtype, device_map=device,
            local_files_only=True, max_inference_batch_size=1,
            max_new_tokens=256, attn_implementation='eager',
        )

    def create_stream(self):
        return QwenStream()

    def decode_stream(self, stream):
        result = self.model.transcribe(audio=(stream.samples, 16000), language=None)
        stream.text = result[0].text.strip() if result else ''
