"""Online, confirmed speaker clusters and turn boundaries within a VAD segment.

VAD detects speech, not speaker changes. Never enroll a whole mixed-speaker
sentence as a voiceprint, or reset ASR merely because a speaker might change.
"""
from collections import OrderedDict
import numpy as np

SAMPLE_RATE = 16000
WINDOW = 2 * SAMPLE_RATE
STEP = SAMPLE_RATE


class SpeakerDiarizer:
    def __init__(self, embedding, threshold=0.48):
        self.embedding = embedding
        self.threshold = threshold
        self.centroids = []
        self.records = OrderedDict()
        self.candidate = None

    def _vector(self, samples):
        if len(samples) < SAMPLE_RATE or float(np.sqrt(np.mean(samples ** 2))) < 0.001:
            return None
        vector = self.embedding(samples)
        if vector is None or not np.all(np.isfinite(vector)):
            return None
        norm = float(np.linalg.norm(vector))
        return vector / norm if norm > 1e-8 else None

    def _match(self, vector):
        if vector is None or not self.centroids:
            return None, 0.0, 0.0
        scores = [float(np.dot(vector, center)) for center in self.centroids]
        index = int(np.argmax(scores))
        second = sorted(scores, reverse=True)[1] if len(scores) > 1 else -1.0
        return index, scores[index], scores[index] - second

    def observe(self, samples, start):
        key = (int(start), int(start + len(samples)))
        if key in self.records:
            return self.records[key]
        vector = self._vector(samples)
        record = {'start': key[0], 'end': key[1], 'vector': vector, 'index': None}
        self.records[key] = record
        # Only recent windows are needed for the current 12-second VAD segment.
        while len(self.records) > 96:
            self.records.popitem(last=False)
        index, score, margin = self._match(vector)
        if score >= self.threshold:
            record['index'] = index
            self.candidate = None
            # Mixed windows near a turn must not drag a person's prototype
            # towards the other speaker and eventually merge both identities.
            if score >= 0.60 and margin >= 0.10:
                center = self.centroids[index] * 0.95 + vector * 0.05
                self.centroids[index] = center / np.linalg.norm(center)
        elif vector is not None:
            candidate = self.candidate
            if (candidate is not None and start - candidate['last'] <= 3 * SAMPLE_RATE
                    and float(np.dot(vector, candidate['vector'])) >= 0.55):
                candidate['records'].append(record)
                candidate['last'] = start
                if start - candidate['first'] >= STEP and len(self.centroids) < 32:
                    center = sum(item['vector'] for item in candidate['records'])
                    self.centroids.append(center / np.linalg.norm(center))
                    for item in candidate['records']:
                        item['index'] = len(self.centroids) - 1
                    self.candidate = None
            else:
                self.candidate = {'vector': vector, 'first': start, 'last': start, 'records': [record]}
        return record

    def speaker(self, record):
        index, score, margin = self._match(record['vector'])
        if score < self.threshold:
            return None
        # Ambiguous windows keep a previously confirmed assignment; they do
        # not invent another person or force the default speaker number.
        if margin < 0.06:
            index = record['index']
        return 'speaker-' + str(index + 1) if index is not None else None

    def _refine_boundary(self, audio, boundary, before, after, low, high):
        if before is None or after is None:
            return boundary
        left_center = self.centroids[int(before.split('-')[1]) - 1]
        right_center = self.centroids[int(after.split('-')[1]) - 1]
        best, best_score = boundary, -float('inf')
        for point in range(max(low, boundary - 12000), min(high, boundary + 12000) + 1, 4000):
            left = self._vector(audio[max(0, point - SAMPLE_RATE):point])
            right = self._vector(audio[point:point + SAMPLE_RATE])
            if left is None or right is None:
                continue
            score = float(np.dot(left - right, left_center - right_center))
            if score > best_score:
                best, best_score = point, score
        return best

    def split(self, audio, start):
        if len(audio) < WINDOW:
            record = self.observe(audio, start)
            return [(0, len(audio), self.speaker(record) or 'unknown')]
        offsets = list(range(0, len(audio) - WINDOW + 1, STEP))
        if offsets[-1] != len(audio) - WINDOW:
            offsets.append(len(audio) - WINDOW)
        records = [self.observe(audio[offset:offset + WINDOW], start + offset) for offset in offsets]
        labels = [self.speaker(record) for record in records]
        # Reject isolated flips, including short timbre changes and mixed windows.
        original = labels[:]
        for i in range(1, len(labels) - 1):
            if original[i - 1] == original[i + 1] and original[i - 1] is not None:
                labels[i] = original[i - 1]
        turns, previous_boundary = [], 0
        current = labels[0]
        for i in range(1, len(labels)):
            if labels[i] == current:
                continue
            boundary = (offsets[i - 1] + offsets[i] + WINDOW) // 2
            low, high = previous_boundary + SAMPLE_RATE, len(audio) - SAMPLE_RATE
            if low > high:
                continue
            boundary = self._refine_boundary(audio, boundary, current, labels[i], low, high)
            boundary = max(low, min(high, boundary))
            turns.append((previous_boundary, boundary, current or 'unknown'))
            previous_boundary, current = boundary, labels[i]
        turns.append((previous_boundary, len(audio), current or 'unknown'))
        return turns
