# backend/server.py
from flask import Flask, request, jsonify, send_from_directory, send_file
from flask_cors import CORS
import os
import json
from script_runner import run_ecommerce_analysis, schedule_daily_update
import threading
import requests
import time

app = Flask(__name__, static_folder='../frontend/build')
CORS(app, resources={r"/*": {"origins": "*", "allow_headers": "*", "expose_headers": "*"}})

# Also, add a general error handler to ensure CORS headers are added even when errors occur:
@app.errorhandler(Exception)
def handle_error(e):
    # Add CORS headers to error responses
    response = jsonify({"error": str(e)})
    response.status_code = 500
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', '*')
    return response

# Store your Anthropic API key here
ANTHROPIC_API_KEY = "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"

# Endpoint to run the analysis script
@app.route('/api/run-script', methods=['POST'])
def run_script():
    try:
        params = request.json
        result = run_ecommerce_analysis(
            days_back=params.get('daysBack', 30),
            attribution_window=params.get('attributionWindow', 7),
            extended_analysis=params.get('extendedAnalysis', 30),
            cogs_percentage=params.get('cogsPercentage', 0.4)
        )
        return jsonify(result)
    except Exception as e:
        print(f"Error running script: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Error running script: {str(e)}"
        }), 500

# Endpoint to get the Anthropic API key
@app.route('/api/anthropic-key', methods=['GET'])
def get_anthropic_key():
    # Add validation to prevent exposing a placeholder key
    if ANTHROPIC_API_KEY == "your_anthropic_api_key_here":
        return jsonify({
            "error": "API key not configured",
            "message": "Please set a valid Anthropic API key in server.py"
        }), 403
    
    return jsonify({"apiKey": ANTHROPIC_API_KEY})

@app.route('/api/chat', methods=['POST'])
def chat_proxy():
    try:
        data = request.json
        question = data.get('question')
        dashboard_data = data.get('dashboardData')
        
        if not question:
            return jsonify({"error": "Question is required"}), 400
        
        # Create a more specific system prompt
        system_prompt = """You are an expert e-commerce marketing analytics assistant. You have full access to the campaign data provided.

When answering questions about specific campaigns, products, or metrics:
1. First check if the specific campaign or product is mentioned in the allCampaigns data.
2. Provide precise answers based on the actual data values.
3. Include specific metrics like ROAS, profit, revenue, etc. in your response.
4. If a campaign is profitable, state that clearly with supporting metrics.
5. If a campaign is not profitable, explain why and suggest improvements.

If you can't find a specific campaign in the data, clearly state that it wasn't found rather than saying you don't have access to it.

Provide concise, data-driven insights and clear recommendations. Be specific and reference metrics from the provided data."""
        
        # Make the request to Anthropic API
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                'Content-Type': 'application/json',
                'X-API-Key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            json={
                'model': 'claude-3-7-sonnet-20250219',
                'max_tokens': 1000,
                'system': system_prompt,
                'messages': [
                    {
                        'role': 'user',
                        'content': f"Here is the e-commerce dashboard data with complete campaign information:\n\n{json.dumps(dashboard_data, indent=2)}\n\nMy question is: {question}\n\nPlease answer based on the actual campaign data in the allCampaigns section, not just the summary metrics."
                    }
                ]
            }
        )
        
        if response.status_code != 200:
            return jsonify({
                "error": f"Anthropic API error: {response.status_code}",
                "insight": f"Error generating AI response: {response.text}. Please try again later.",
                "model": "Error",
                "id": f"error-{int(time.time())}"
            }), 500
        
        result = response.json()
        
        return jsonify({
            "insight": result['content'][0]['text'],
            "model": result['model'],
            "id": result['id']
        })
    except Exception as e:
        print(f"Error in chat proxy: {str(e)}")
        return jsonify({
            "error": str(e),
            "insight": f"Error generating AI response: {str(e)}. Please try again later.",
            "model": "Error",
            "id": f"error-{int(time.time())}"
        }), 500


# Campaign insights proxy endpoint
@app.route('/api/campaign-insights', methods=['POST'])
def campaign_insights_proxy():
    try:
        data = request.json
        campaign = data.get('campaign')
        
        if not campaign:
            return jsonify({"error": "Campaign data is required"}), 400
        
        # Craft the prompt for Claude
        system_prompt = """You are an e-commerce marketing analytics expert. Analyze the provided campaign data. 
        Provide actionable insights and clear recommendations. Focus on profitability, ROAS, and optimization opportunities."""
        
        # Make the request to Anthropic API
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                'Content-Type': 'application/json',
                'X-API-Key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            json={
                'model': 'claude-3-7-sonnet-20250219',
                'max_tokens': 1000,
                'system': system_prompt,
                'messages': [
                    {
                        'role': 'user',
                        'content': f"Here is the campaign data:\n\n{json.dumps(campaign, indent=2)}\n\nIs this campaign profitable? What actions should be taken to improve its performance?"
                    }
                ]
            }
        )
        
        if response.status_code != 200:
            return jsonify({
                "error": f"Anthropic API error: {response.status_code}",
                "insight": f"Error generating campaign insights: {response.text}. Please try again later.",
                "model": "Error",
                "id": f"error-{int(time.time())}"
            }), 500
        
        result = response.json()
        
        return jsonify({
            "insight": result['content'][0]['text'],
            "model": result['model'],
            "id": result['id']
        })
    except Exception as e:
        print(f"Error in campaign insights proxy: {str(e)}")
        return jsonify({
            "error": str(e),
            "insight": f"Error generating campaign insights: {str(e)}. Please try again later.",
            "model": "Error",
            "id": f"error-{int(time.time())}"
        }), 500

# Dashboard insights proxy endpoint
@app.route('/api/dashboard-insights', methods=['POST'])
def dashboard_insights_proxy():
    try:
        data = request.json
        dashboard = data.get('dashboard')
        
        if not dashboard:
            return jsonify({"error": "Dashboard data is required"}), 400
        
        # Craft the prompt for Claude
        system_prompt = """You are an e-commerce marketing analytics expert. Analyze the provided dashboard data and provide comprehensive insights about the overall campaign performance. 
        Answer the question: "Are these e-commerce campaigns collectively profitable?"
        Include specific actionable recommendations for optimization, scaling successful campaigns, and addressing underperforming ones.
        Your analysis should be data-driven, highlighting key metrics like ROAS, profit margins, and overall ROI."""
        
        # Make the request to Anthropic API
        response = requests.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                'Content-Type': 'application/json',
                'X-API-Key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            json={
                'model': 'claude-3-7-sonnet-20250219',
                'max_tokens': 1000,
                'system': system_prompt,
                'messages': [
                    {
                        'role': 'user',
                        'content': f"Here is the e-commerce dashboard data:\n\n{json.dumps(dashboard, indent=2)}\n\nProvide a comprehensive analysis of the overall campaign performance, profitability, and specific recommendations for optimization."
                    }
                ]
            }
        )
        
        if response.status_code != 200:
            return jsonify({
                "error": f"Anthropic API error: {response.status_code}",
                "insight": f"Error generating dashboard insights: {response.text}. Please try again later.",
                "model": "Error",
                "id": f"error-{int(time.time())}"
            }), 500
        
        result = response.json()
        
        return jsonify({
            "insight": result['content'][0]['text'],
            "model": result['model'],
            "id": result['id']
        })
    except Exception as e:
        print(f"Error in dashboard insights proxy: {str(e)}")
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
        print(f"Error getting latest data: {str(e)}")
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
        return response
    except Exception as e:
        print(f"Error serving file: {str(e)}")
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

if __name__ == '__main__':
    # Start scheduled updates in a separate thread
    update_thread = threading.Thread(
        target=lambda: schedule_daily_update(None),
        daemon=True
    )
    update_thread.start()
    
    # Run the Flask app
    app.run(debug=True, port=5001, host='0.0.0.0')