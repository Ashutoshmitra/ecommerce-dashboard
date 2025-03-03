# backend/server.py
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import os
import json
from script_runner import run_ecommerce_analysis, schedule_daily_update
import threading
import requests
import time
import logging
import anthropic  # Import the Anthropic SDK
from dotenv import load_dotenv
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Initialize Flask app
app = Flask(__name__, static_folder='frontend/build' if os.path.exists('frontend/build') else 'frontend/public')

# Configure CORS
CORS(app, resources={r"/*": {
    "origins": "*", 
    "allow_headers": ["Content-Type", "Authorization", "X-API-Key", "Accept", "anthropic-version"], 
    "expose_headers": ["Content-Type", "Authorization"],
    "methods": ["GET", "POST", "OPTIONS"]
}})

# Get Anthropic API key from environment variables
ANTHROPIC_API_KEY = os.environ.get('ANTHROPIC_API_KEY', "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")

# Initialize Anthropic client
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)
CLAUDE_MODEL = "claude-3-7-sonnet-20250219"  # Latest model as of March 2025

# Debug endpoint to test headers
@app.route('/api/test-headers', methods=['GET'])
def test_headers():
    return jsonify({"headers": dict(request.headers)})

# Log request info for debugging
@app.before_request
def log_request_info():
    app.logger.debug('Headers: %s', dict(request.headers))
    app.logger.debug('Path: %s', request.path)

# Global error handler
@app.errorhandler(Exception)
def handle_error(e):
    app.logger.error(f"Error: {str(e)}")
    response = jsonify({"error": str(e)})
    response.status_code = 500
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Accept, anthropic-version')
    response.headers.add('Content-Type', 'application/json')
    return response

@app.route('/api/list-files', methods=['GET'])
def list_files():
    try:
        files = os.listdir('.')
        return jsonify({"files": files})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to run the analysis script
@app.route('/api/run-script', methods=['POST'])
def run_script():
    try:
        params = request.json
        
        # Log parameters
        app.logger.info(f"Running analysis script with parameters: {params}")
        
        # Add a warning about Facebook rate limits 
        app.logger.info("Note: Facebook API rate limits may be encountered during script execution")
        
        # Run the script with parameters
        result = run_ecommerce_analysis(
            days_back=params.get('daysBack', 1100),
            attribution_window=params.get('attributionWindow', 7),
            extended_analysis=params.get('extendedAnalysis', 30),
            cogs_percentage=params.get('cogsPercentage', 0.4)
        )
        
        # Check for rate limit messages in the output
        if result.get('stdout') and 'rate limit' in result['stdout'].lower():
            app.logger.warning("Facebook API rate limit detected in script output")
            
        if result.get('stderr') and 'rate limit' in result['stderr'].lower():
            app.logger.warning("Facebook API rate limit error detected")
        
        # Add a note about expected rate limits to the response
        if result['status'] == 'success':
            result['message'] += ". Note: Facebook API rate limits are normal and expected."
        
        app.logger.info(f"Script execution completed with status: {result['status']}")
        return jsonify(result)
    except Exception as e:
        app.logger.error(f"Error running script: {str(e)}", exc_info=True)
        return jsonify({
            "status": "error",
            "message": f"Error running script: {str(e)}",
            "stdout": "",
            "stderr": str(e)
        }), 500

# Endpoint to get the Anthropic API key
@app.route('/api/anthropic-key', methods=['GET'])
def get_anthropic_key():
    # Add validation to prevent exposing a placeholder key
    if not ANTHROPIC_API_KEY or ANTHROPIC_API_KEY == "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":
        return jsonify({
            "error": "API key not configured",
            "message": "Please set a valid Anthropic API key as an environment variable"
        }), 403
    
    return jsonify({"apiKey": ANTHROPIC_API_KEY})

# Chat endpoint using the Anthropic SDK
@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    try:
        data = request.json
        question = data.get('question')
        dashboard_data = data.get('dashboardData')
        
        if not question:
            return jsonify({"error": "Question is required"}), 400
        
        # Create a specific system prompt for analytics
        system_prompt = """You are an expert e-commerce marketing analytics assistant. You have full access to the campaign data provided.

When answering questions about specific campaigns, products, or metrics:
1. First check if the specific campaign or product is mentioned in the allCampaigns data.
2. Provide precise answers based on the actual data values.
3. Include specific metrics like ROAS, profit, revenue, etc. in your response.
4. If a campaign is profitable, state that clearly with supporting metrics.
5. If a campaign is not profitable, explain why and suggest improvements.

If you can't find a specific campaign in the data, clearly state that it wasn't found rather than saying you don't have access to it.

Provide concise, data-driven insights and clear recommendations. Be specific and reference metrics from the provided data."""
        
        # Create the user message with dashboard data
        user_message = f"Here is the e-commerce dashboard data with complete campaign information:\n\n{json.dumps(dashboard_data, indent=2)}\n\nMy question is: {question}\n\nPlease answer based on the actual campaign data in the allCampaigns section, not just the summary metrics."
        
        # Use the Anthropic SDK to create the message
        response = anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1000,
            temperature=0,  # Lower temperature for more precise analytics
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_message
                        }
                    ]
                }
            ]
        )
        
        # Extract and return the response
        return jsonify({
            "insight": response.content[0].text,
            "model": response.model,
            "id": response.id
        })
    except Exception as e:
        app.logger.error(f"Error in chat proxy: {str(e)}")
        return jsonify({
            "error": str(e),
            "insight": f"Error generating AI response: {str(e)}. Please try again later.",
            "model": "Error",
            "id": f"error-{int(time.time())}"
        }), 500

# Campaign insights proxy endpoint with the Anthropic SDK
@app.route('/api/campaign-insights', methods=['POST'])
def campaign_insights_proxy():
    try:
        data = request.json
        campaign = data.get('campaign')
        
        if not campaign:
            return jsonify({"error": "Campaign data is required"}), 400
        
        # Craft the system prompt for campaign analysis
        system_prompt = """You are an e-commerce marketing analytics expert. Analyze the provided campaign data. 
        Provide actionable insights and clear recommendations. Focus on profitability, ROAS, and optimization opportunities."""
        
        # Create the user message with campaign data
        user_message = f"Here is the campaign data:\n\n{json.dumps(campaign, indent=2)}\n\nIs this campaign profitable? What actions should be taken to improve its performance?"
        
        # Use the Anthropic SDK to create the message
        response = anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1000,
            temperature=0,  # Lower temperature for more precise analytics
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_message
                        }
                    ]
                }
            ]
        )
        
        # Extract and return the response
        return jsonify({
            "insight": response.content[0].text,
            "model": response.model,
            "id": response.id
        })
    except Exception as e:
        app.logger.error(f"Error in campaign insights proxy: {str(e)}")
        return jsonify({
            "error": str(e),
            "insight": f"Error generating campaign insights: {str(e)}. Please try again later.",
            "model": "Error",
            "id": f"error-{int(time.time())}"
        }), 500

# Dashboard insights proxy endpoint with the Anthropic SDK
@app.route('/api/dashboard-insights', methods=['POST'])
def dashboard_insights_proxy():
    try:
        data = request.json
        dashboard = data.get('dashboard')
        
        if not dashboard:
            return jsonify({"error": "Dashboard data is required"}), 400
        
        # Craft the system prompt for dashboard analysis
        system_prompt = """You are an e-commerce marketing analytics expert. Analyze the provided dashboard data and provide comprehensive insights about the overall campaign performance. 
        Answer the question: "Are these e-commerce campaigns collectively profitable?"
        Include specific actionable recommendations for optimization, scaling successful campaigns, and addressing underperforming ones.
        Your analysis should be data-driven, highlighting key metrics like ROAS, profit margins, and overall ROI."""
        
        # Create the user message with dashboard data
        user_message = f"Here is the e-commerce dashboard data:\n\n{json.dumps(dashboard, indent=2)}\n\nProvide a comprehensive analysis of the overall campaign performance, profitability, and specific recommendations for optimization."
        
        # Use the Anthropic SDK to create the message
        response = anthropic_client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=1000,
            temperature=0,  # Lower temperature for more precise analytics
            system=system_prompt,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": user_message
                        }
                    ]
                }
            ]
        )
        
        # Extract and return the response
        return jsonify({
            "insight": response.content[0].text,
            "model": response.model,
            "id": response.id
        })
    except Exception as e:
        app.logger.error(f"Error in dashboard insights proxy: {str(e)}")
        return jsonify({
            "error": str(e),
            "insight": f"Error generating dashboard insights: {str(e)}. Please try again later.",
            "model": "Error",
            "id": f"error-{int(time.time())}"
        }), 500

# Endpoint to get the latest CSV file
@app.route('/api/latest-data', methods=['GET'])
def get_latest_data():
    try:
        # Find the most recent CSV file
        csv_files = [f for f in os.listdir('.') if f.startswith('complete_ecommerce_analysis_') and f.endswith('.csv')]
        if csv_files:
            # Sort by modification time
            csv_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
            latest_file = csv_files[0]
            return jsonify({"file": latest_file})
        else:
            return jsonify({"error": "No analysis files found"}), 404
    except Exception as e:
        app.logger.error(f"Error getting latest data: {str(e)}")
        return jsonify({"error": f"Error getting latest data: {str(e)}"}), 500

# Endpoint to serve CSV data files
@app.route('/data/<filename>', methods=['GET'])
def get_csv_file(filename):
    try:
        # Security check to prevent directory traversal
        if '..' in filename or filename.startswith('/'):
            return jsonify({"error": "Invalid filename"}), 400
            
        # Only allow accessing CSV files
        if not filename.endswith('.csv'):
            return jsonify({"error": "Only CSV files are allowed"}), 400
            
        # Check if file exists
        if not os.path.exists(filename):
            return jsonify({"error": f"File {filename} not found"}), 404
            
        # Set CORS headers for file response
        response = send_file(
            filename,
            mimetype='text/csv',
            as_attachment=True,
            download_name=filename
        )
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        return response
    except Exception as e:
        app.logger.error(f"Error serving file: {str(e)}")
        return jsonify({"error": f"Error serving file: {str(e)}"}), 500

# Add a health check endpoint
@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({"status": "ok"})

# Serve the React app
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

# Add a favicon route to prevent 404s
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.ico') if os.path.exists(app.static_folder + '/favicon.ico') else ('', 204)

# Handle OPTIONS requests for CORS preflight
@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    response = app.make_default_options_response()
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key, Accept, anthropic-version')
    response.headers.add('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    return response

if __name__ == '__main__':
    # Get port from environment variable or use default
    port = int(os.environ.get('PORT', 5001))
    host = os.environ.get('HOST', '0.0.0.0')
    
    # Start scheduled updates in a separate thread
    update_thread = threading.Thread(
        target=lambda: schedule_daily_update(None),
        daemon=True
    )
    update_thread.start()
    
    # Run the Flask app
    app.run(debug=False, port=port, host=host)