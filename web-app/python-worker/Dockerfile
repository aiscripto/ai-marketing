FROM python:3.12-slim

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && mkdir -p /app/scripts /tmp/aiscripto-reports && chown -R app:app /app /tmp/aiscripto-reports

# Copy app
COPY main.py .

# Scripts will be mounted as volume from ../scripts
USER app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
