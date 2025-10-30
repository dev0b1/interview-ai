FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy code
COPY . .

# Optional: create non-root user
RUN useradd --create-home appuser
USER appuser

# Expose Render web port
EXPOSE 8000

# Start both FastAPI app and LiveKit agent
CMD ["bash", "-c", "python agent.py dev & uvicorn app:app --host 0.0.0.0 --port 8000 --proxy-headers"]
