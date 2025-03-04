FROM python:3.9-slim

WORKDIR /app

# Copy requirements
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Create persistent data directory
RUN mkdir -p /app/data

# Copy backend files - adjust paths based on where your files actually are
COPY backend/ ./backend/
# If these files are in the backend directory, adjust the paths
COPY backend/script_runner.py .
COPY backend/enhanced_ecommerce_script.py .
COPY backend/server.py .

# Build the frontend
COPY frontend/ ./frontend/
WORKDIR /app/frontend
RUN apt-get update && apt-get install -y nodejs npm
RUN npm install
RUN npm run build

WORKDIR /app

# Set DATA_DIR environment variable
ENV DATA_DIR=/app/data

# The application uses port 5001
EXPOSE 5001

# Run the server
CMD ["python", "server.py"]