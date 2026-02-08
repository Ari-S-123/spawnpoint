#!/usr/bin/env python3
from sentence_transformers import SentenceTransformer
import time

MODEL_NAME = "google/embeddinggemma-300m"
print(f"Attempting to load {MODEL_NAME}...")
start = time.time()
try:
    model = SentenceTransformer(MODEL_NAME)
    print(f"Model loaded in {time.time() - start:.2f}s")
    
    text = "Hello, this is a test of the Gemma embedding model."
    print("Generating embedding...")
    emb = model.encode(text)
    print(f"Embedding generated! Shape: {emb.shape}")
except Exception as e:
    print(f"Error: {e}")
