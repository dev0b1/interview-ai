FROM python:3.11-slim

# Ensure stdout/stderr are not buffered
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install dependencies
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (after deps to leverage caching)
COPY . /app

# Create an unprivileged user for safety
RUN useradd --create-home --shell /bin/false appuser || true
RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# Healthcheck (optional) - keep simple
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD curl -f http://localhost:8000/ || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . /app
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
