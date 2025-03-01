import subprocess
import os
import json
import time
from datetime import datetime, timedelta
import argparse
import sys
import threading

def run_ecommerce_analysis(days_back=30, attribution_window=7, extended_analysis=30, cogs_percentage=0.4):
    """
    Run the ecommerce analysis script with given parameters
    
    Parameters:
    days_back (int): Number of days to look back
    attribution_window (int): Attribution window in days
    extended_analysis (int): Extended analysis window in days
    cogs_percentage (float): Cost of goods sold as percentage of revenue
    
    Returns:
    dict: Status and output information
    """
    try:
        # Get the script directory
        script_dir = os.path.dirname(os.path.abspath(__file__))
        script_path = os.path.join(script_dir, "enhanced_ecommerce_script.py")
        
        # Run the script with provided parameters
        cmd = [
            sys.executable,
            script_path,
            "--days_back", str(days_back),
            "--attribution_window", str(attribution_window),
            "--extended_analysis", str(extended_analysis),
            "--cogs_percentage", str(cogs_percentage)
        ]
        
        # Create timestamp for this run
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        
        # Execute the command
        start_time = time.time()
        process = subprocess.Popen(
            cmd, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True
        )
        
        stdout, stderr = process.communicate()
        end_time = time.time()
        
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
        csv_file = f"complete_ecommerce_analysis_{timestamp}.csv"
        if not os.path.exists(csv_file):
            # If file not found with timestamp, look for any recently created CSV
            csv_files = [f for f in os.listdir('.') if f.startswith('complete_ecommerce_analysis_') and f.endswith('.csv')]
            if csv_files:
                # Sort by modification time to get the most recent
                csv_files.sort(key=lambda x: os.path.getmtime(x), reverse=True)
                csv_file = csv_files[0]
            else:
                return {
                    "status": "error",
                    "message": "Script executed but no output file was found",
                    "stdout": stdout,
                    "stderr": stderr,
                    "timestamp": timestamp
                }
        
        # Return success information
        return {
            "status": "success",
            "message": "Analysis completed successfully",
            "output_file": csv_file,
            "execution_time": end_time - start_time,
            "stdout": stdout,
            "stderr": stderr,
            "timestamp": timestamp
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Error executing analysis script: {str(e)}",
            "timestamp": datetime.now().strftime("%Y%m%d_%H%M%S")
        }

def schedule_daily_update(callback=None):
    """
    Schedule a daily update of the ecommerce data
    
    Parameters:
    callback (function): Optional callback function to run after the update completes
    """
    def run_update():
        while True:
            # Run the analysis with default parameters
            result = run_ecommerce_analysis()
            
            if callback and callable(callback):
                callback(result)
                
            # Sleep for 24 hours
            time.sleep(24 * 60 * 60)
    
    # Start the update thread
    update_thread = threading.Thread(target=run_update, daemon=True)
    update_thread.start()
    
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