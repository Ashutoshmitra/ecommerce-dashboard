import subprocess
import os
import json
import time
from datetime import datetime, timedelta
import argparse
import sys
import threading
from dotenv import load_dotenv
load_dotenv()
# Get the backend directory path (current directory of this script)
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
ENV_FILE = os.path.join(BACKEND_DIR, '.env')

# Load .env file from backend directory
if os.path.exists(ENV_FILE):
    print(f"Loading .env file from: {ENV_FILE}")
    load_dotenv(ENV_FILE)
else:
    print(f"Warning: .env file not found at: {ENV_FILE}")
# Get the absolute path to the project root directory
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Define DATA_DIR consistently relative to project root
DATA_DIR = os.environ.get('DATA_DIR', os.path.join(PROJECT_ROOT, 'backend', 'data'))

# Ensure the directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def run_ecommerce_analysis(days_back=1100, attribution_window=7, extended_analysis=30, cogs_percentage=0.4):
    """
    Run the ecommerce analysis script with given parameters.
    Always looks back 1 year (365 days) regardless of what parameter is passed.
    
    Parameters:
    days_back (int): Ignored, always uses 1100 days
    attribution_window (int): Attribution window in days
    extended_analysis (int): Extended analysis window in days
    cogs_percentage (float): Cost of goods sold as percentage of revenue
    
    Returns:
    dict: Status and output information
    """
    try:
        # Override days_back to always be 365 days
        days_back = 1100
        
        # Get the script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, "enhanced_ecommerce_script.py")

        # Create timestamp for this run
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Set the output directory to DATA_DIR
        output_dir = DATA_DIR
        
        # Run the script with provided parameters
        cmd = [
            sys.executable,
            script_path,
            "--days_back", str(days_back),
            "--attribution_window", str(attribution_window),
            "--extended_analysis", str(extended_analysis),
            "--cogs_percentage", str(cogs_percentage),
            "--output_dir", output_dir
        ]
        
        print(f"Starting script execution with params: days_back={days_back}, attribution_window={attribution_window}")
        print(f"Command: {' '.join(cmd)}")
        
        # Execute the command
        start_time = time.time()
        env = os.environ.copy()
        env['DATA_DIR'] = DATA_DIR
        process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True,
            env=env
        )
        
        stdout, stderr = process.communicate()
        end_time = time.time()
        
        print(f"Script execution completed in {end_time - start_time:.2f} seconds")
        
        # Look for Facebook rate limit messages in the output
        if "rate limit" in stdout.lower() or "rate limit" in stderr.lower():
            print("Facebook API rate limit detected in script output")
            
            # Since we expect rate limits, we'll provide a friendly message
            rate_limit_message = "Facebook API rate limits were encountered during script execution. " + \
                                "This is normal and expected. Some data may not be fully updated."
            
            # Append the rate limit message to stdout for the UI to display
            stdout = stdout + "\n\n" + rate_limit_message
        
        # Check if the process completed successfully
        if process.returncode != 0:
            return {
                "status": "error",
                "message": f"Script execution failed with return code {process.returncode}",
                "stdout": stdout,
                "stderr": stderr,
                "timestamp": timestamp
            }
        
        # Look for the generated CSV file
        csv_file = os.path.join(output_dir, f"complete_ecommerce_analysis_{timestamp}.csv")
        if not os.path.exists(csv_file):
            # If file not found with timestamp, look for any recently created CSV
            csv_files = [f for f in os.listdir(output_dir) if f.startswith('complete_ecommerce_analysis_') and f.endswith('.csv')]
            if csv_files:
                # Sort by modification time to get the most recent
                csv_files.sort(key=lambda x: os.path.getmtime(os.path.join(output_dir, x)), reverse=True)
                csv_file = os.path.join(output_dir, csv_files[0])
            else:
                return {
                    "status": "error",
                    "message": "Script executed but no output file was found",
                    "stdout": stdout,
                    "stderr": stderr,
                    "timestamp": timestamp
                }
        
        # Return success information with relative path for the CSV file
        return {
            "status": "success",
            "message": "Analysis completed successfully",
            "output_file": os.path.basename(csv_file),
            "execution_time": end_time - start_time,
            "stdout": stdout,
            "stderr": stderr,
            "timestamp": timestamp
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error executing analysis script: {str(e)}",
            "stdout": "Script execution error",
            "stderr": str(e),
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S")
        }

def schedule_daily_update(callback=None, run_immediately=False):
    """
    Schedule a daily update of the ecommerce data
    
    Parameters:
    callback (function): Optional callback function to run after the update completes
    run_immediately (bool): Whether to run the update immediately
    """
    def run_update():
        # Don't run immediately unless requested
        if not run_immediately:
            print(f"[{datetime.now()}] Scheduled update - waiting for next scheduled time")
            time.sleep(12 * 60 * 60)  # Wait 24 hours before first run
            
        while True:
            try:
                print(f"[{datetime.now()}] Running scheduled daily update")
                
                # Run the analysis with default parameters
                result = run_ecommerce_analysis()
                
                if callback and callable(callback):
                    callback(result)
                
                print(f"[{datetime.now()}] Scheduled update completed with status: {result['status']}")
                if result['status'] == 'error':
                    print(f"Error message: {result['message']}")
                
                # Sleep for 24 hours
                print(f"[{datetime.now()}] Next update scheduled for {datetime.now() + timedelta(days=1)}")
                
            except Exception as e:
                print(f"[{datetime.now()}] Error in scheduled update: {str(e)}")
                
            # Always sleep for 24 hours between attempts, even if there was an error
            time.sleep(12 * 60 * 60)
    
    # Start the update thread
    update_thread = threading.Thread(target=run_update, daemon=True)
    update_thread.start()
    print(f"[{datetime.now()}] Daily update scheduler started")
    
    return update_thread

if __name__ == "__main__":
    # Setup command line arguments
    parser = argparse.ArgumentParser(description='Run E-commerce Analysis Script')
    parser.add_argument('--days_back', type=int, default=30, help='Number of days to look back')
    parser.add_argument('--attribution_window', type=int, default=7, help='Attribution window in days')
    parser.add_argument('--extended_analysis', type=int, default=30, help='Extended analysis window in days')
    parser.add_argument('--cogs_percentage', type=float, default=0.4, help='COGS as percentage of revenue')
    
    args = parser.parse_args()
    
    # Run the analysis
    result = run_ecommerce_analysis(
        days_back=args.days_back,
        attribution_window=args.attribution_window,
        extended_analysis=args.extended_analysis,
        cogs_percentage=args.cogs_percentage
    )
    
    # Print the result
    print(json.dumps(result, indent=2))