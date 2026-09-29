# docker build services/ai
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the embedding model into the image so start-up needs no network
ENV MODEL_CACHE=/models
RUN python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/models')"

COPY main.py embeddings.py ./
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
