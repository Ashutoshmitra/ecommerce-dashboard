import requests
import json
import time
import pandas as pd
import os
from datetime import datetime, timedelta

#############################################
# CONFIGURATION SECTION
#############################################

# Facebook API Credentials - HARDCODED
FB_AD_ACCOUNT_ID = "599673092559823"
FB_ACCESS_TOKEN = "EAATWoaVO7YkBO00ZBDeV8NMjxNlt0mWkyQasFghoJujc9bzEWda2e8rbLVZA7umkhmyeR3MZA5Rgxls1wVadHHcf5lBpkfN4U7ZBrLNSDDmSq2BhXkfEaILr8bTxMraYxHcWKcter1k7HLzVUZCisvHjmTAcY3F5o8bEtePfDJVg3iDGm8OS0qjzwLqvxWmaOAVZBDvjRQ"

# Analysis Parameters
DAYS_BACK = 600      # Get data for the last 30 days
OUTPUT_DIR = "./output"  # Directory to save output files
USD_TO_EUR_RATE = 0.96  # Conversion rate from USD to EUR

# Format the Ad Account ID if needed
if not FB_AD_ACCOUNT_ID.startswith('act_'):
    FB_AD_ACCOUNT_ID = f'act_{FB_AD_ACCOUNT_ID}'

#############################################
# FACEBOOK ADS API FUNCTIONS
#############################################

class FacebookAdAnalyzer:
    def __init__(self, ad_account_id, access_token):
        """
        Initialize the Facebook Ad Analyzer
        
        Parameters:
        ad_account_id (str): Facebook Ad Account ID
        access_token (str): Facebook API access token
        """
        self.ad_account_id = ad_account_id
        self.access_token = access_token
        self.api_version = 'v18.0'  # Facebook Graph API version
        
    def _make_paginated_request(self, url, params, max_items=None):
        """
        Make paginated requests to Facebook Graph API
        
        Parameters:
        url (str): API endpoint URL
        params (dict): Request parameters
        max_items (int, optional): Maximum number of items to retrieve
        
        Returns:
        list: Combined results from all pages
        """
        all_data = []
        page_count = 0
        
        # Set a smaller limit for each page to avoid rate limits
        if 'limit' in params and params['limit'] > 50:
            params['limit'] = 50
        
        while url and (max_items is None or len(all_data) < max_items):
            # Add delay between requests to avoid rate limiting
            if page_count > 0:
                time.sleep(1)
                
            response = requests.get(url, params=params)
            page_count += 1
            
            if response.status_code != 200:
                print(f"Error in API request: {response.status_code}, {response.text}")
                break
                
            response_data = response.json()
            current_data = response_data.get('data', [])
            all_data.extend(current_data)
            
            # Print progress
            print(f"Retrieved page {page_count} with {len(current_data)} items")
            
            # Check if we have a next page
            if 'paging' in response_data and 'next' in response_data['paging']:
                url = response_data['paging']['next']
                # Remove parameters as they're included in the next URL
                params = {}
            else:
                url = None
                
            # Check if we've reached the maximum items
            if max_items is not None and len(all_data) >= max_items:
                all_data = all_data[:max_items]
                break
                
        return all_data
        
    def get_campaigns(self, limit=100):
        """
        Get campaigns in the ad account
        
        Parameters:
        limit (int): Maximum number of campaigns to retrieve
        
        Returns:
        list: List of campaign objects
        """
        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/campaigns"
        params = {
            'access_token': self.access_token,
            'fields': 'id,name,objective,status,start_time,stop_time,spend_cap,budget_remaining',
            'limit': 50  # Use a smaller limit for each page
        }
        
        print("Fetching campaigns...")
        campaigns = self._make_paginated_request(url, params, max_items=limit)
        print(f"Found {len(campaigns)} campaigns")
        
        return campaigns
    
    def get_adsets(self, campaign_ids=None, limit=100):
        """
        Get ad sets in the ad account, optionally filtered by campaign IDs
        
        Parameters:
        campaign_ids (list, optional): List of campaign IDs to filter by
        limit (int): Maximum number of ad sets to retrieve
        
        Returns:
        list: List of ad set objects
        """
        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/adsets"
        params = {
            'access_token': self.access_token,
            'fields': 'id,name,campaign_id,status,targeting,optimization_goal,bid_amount,daily_budget,lifetime_budget',
            'limit': 50  # Use a smaller limit for each page
        }
        
        # Add campaign filter if provided
        if campaign_ids:
            params['filtering'] = json.dumps([
                {'field': 'campaign.id', 'operator': 'IN', 'value': campaign_ids}
            ])
            
        print("Fetching ad sets...")
        adsets = self._make_paginated_request(url, params, max_items=limit)
        print(f"Found {len(adsets)} ad sets")
        
        return adsets
        
    def get_ads(self, adset_ids=None, limit=100):
        """
        Get ads in the ad account, optionally filtered by ad set IDs
        
        Parameters:
        adset_ids (list, optional): List of ad set IDs to filter by
        limit (int): Maximum number of ads to retrieve
        
        Returns:
        list: List of ad objects
        """
        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/ads"
        params = {
            'access_token': self.access_token,
            'fields': 'id,name,adset_id,creative,status',
            'limit': 50  # Use a smaller limit for each page
        }
        
        # Add ad set filter if provided
        if adset_ids:
            params['filtering'] = json.dumps([
                {'field': 'adset.id', 'operator': 'IN', 'value': adset_ids}
            ])
            
        print("Fetching ads...")
        ads = self._make_paginated_request(url, params, max_items=limit)
        print(f"Found {len(ads)} ads")
        
        return ads
    
    def get_financial_metrics(self, start_date, end_date, level="ad"):
        """
        Get financial metrics for the ad account
        
        Parameters:
        start_date (datetime): Start date for metrics
        end_date (datetime): End date for metrics
        level (str): Level of aggregation: 'account', 'campaign', 'adset', or 'ad'
        
        Returns:
        dict: Financial metrics data
        """
        # Format dates for API
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/insights"
        
        # Define fields to retrieve - use only supported fields
        fields = [
            'campaign_name',
            'campaign_id',
            'adset_name',
            'adset_id',
            'ad_name',
            'ad_id',
            'spend',
            'impressions',
            'clicks',
            'ctr',
            'cpc',
            'website_purchase_roas',
            'date_start',
            'date_stop'
        ]
        
        params = {
            'access_token': self.access_token,
            'time_range': json.dumps({'since': start_date_str, 'until': end_date_str}),
            'fields': ','.join(fields),
            'level': level,
            'limit': 50,
            # Removing time_increment to prevent large data volumes that may cause errors
        }
        
        try:
            print(f"Fetching financial metrics from {start_date_str} to {end_date_str}...")
            metrics_data = self._make_paginated_request(url, params)
            return metrics_data
        except Exception as e:
            print(f"Error fetching financial metrics: {e}")
            # Return empty list instead of None to prevent downstream errors
            return []
    
    def get_demographic_metrics(self, start_date, end_date):
        """
        Get demographic breakdown of ad performance
        
        Parameters:
        start_date (datetime): Start date for metrics
        end_date (datetime): End date for metrics
        
        Returns:
        list: Demographic metrics data
        """
        # Format dates for API
        start_date_str = start_date.strftime('%Y-%m-%d')
        end_date_str = end_date.strftime('%Y-%m-%d')
        
        url = f"https://graph.facebook.com/{self.api_version}/{self.ad_account_id}/insights"
        
        # Define fields to retrieve - use only supported fields
        fields = [
            'campaign_name',
            'campaign_id',
            'impressions',
            'clicks',
            'spend'
        ]
        
        params = {
            'access_token': self.access_token,
            'time_range': json.dumps({'since': start_date_str, 'until': end_date_str}),
            'fields': ','.join(fields),
            'level': 'campaign',
            'breakdowns': 'age,gender',
            'limit': 50
        }
        
        try:
            print(f"Fetching demographic metrics...")
            demographic_data = self._make_paginated_request(url, params)
            return demographic_data
        except Exception as e:
            print(f"Error fetching demographic metrics: {e}")
            return []
    
    def get_facebook_data(self, start_date, end_date):
        """Get all Facebook Ads data for the specified date range"""
        # Get campaigns
        campaigns = self.get_campaigns(limit=100)
        
        # Get ad sets
        campaign_ids = [campaign['id'] for campaign in campaigns]
        adsets = self.get_adsets(campaign_ids=campaign_ids, limit=200)
        
        # Get ads
        adset_ids = [adset['id'] for adset in adsets]
        ads = self.get_ads(adset_ids=adset_ids, limit=300)
        
        # Get financial metrics
        metrics_campaign = self.get_financial_metrics(start_date, end_date, level="campaign")
        metrics_adset = self.get_financial_metrics(start_date, end_date, level="adset")
        metrics_ad = self.get_financial_metrics(start_date, end_date, level="ad")
        
        # Get demographic metrics
        demographic_data = self.get_demographic_metrics(start_date, end_date)
        
        # Return all data
        return {
            'campaigns': campaigns,
            'adsets': adsets,
            'ads': ads,
            'metrics_campaign': metrics_campaign,
            'metrics_adset': metrics_adset,
            'metrics_ad': metrics_ad,
            'demographic_data': demographic_data
        }

def extract_campaign_name_info(campaign_name):
    """
    Extract product name from campaign name using pattern matching.
    """
    info = {
        'original_name': campaign_name,
        'is_collection': 'COLLECTION' in campaign_name,
        'is_single_product': 'SINGLE PRODUCT' in campaign_name
    }
    
    # Try to extract collection code (like C37)
    collection_pattern = r'C(\d+)\s+ADS'
    import re
    collection_match = re.search(collection_pattern, campaign_name)
    if collection_match:
        info['collection_code'] = f"C{collection_match.group(1)}"
    else:
        info['collection_code'] = None
        
    # Try to extract date
    date_match = re.search(r'^(\d+)\s+([A-Za-z]+)', campaign_name)
    if date_match:
        info['campaign_date'] = f"{date_match.group(1)} {date_match.group(2)}"
    else:
        info['campaign_date'] = None
        
    return info

def process_facebook_data(fb_data):
    """Process and enhance Facebook data for analysis"""
    # Convert campaign data to DataFrame
    campaigns_df = pd.DataFrame(fb_data['campaigns'])
    if not campaigns_df.empty:
        # Extract additional information from campaign names
        campaign_info = [extract_campaign_name_info(name) for name in campaigns_df['name']]
        campaign_info_df = pd.DataFrame(campaign_info)
        
        # Merge with campaign data
        campaigns_df = pd.concat([campaigns_df, campaign_info_df], axis=1)
    
    # Process metrics data
    metrics_campaign_df = pd.DataFrame(fb_data['metrics_campaign'])
    metrics_adset_df = pd.DataFrame(fb_data['metrics_adset'])
    metrics_ad_df = pd.DataFrame(fb_data['metrics_ad'])
    
    # Process demographic data
    demographic_df = pd.DataFrame(fb_data['demographic_data'])
    
    # Convert spend from USD to EUR
    for df in [metrics_campaign_df, metrics_adset_df, metrics_ad_df, demographic_df]:
        if not df.empty and 'spend' in df.columns:
            df['spend_eur'] = df['spend'].astype(float) * USD_TO_EUR_RATE
    
    # Calculate additional KPIs for campaign metrics
    if not metrics_campaign_df.empty and 'spend' in metrics_campaign_df.columns:
        # Calculate CTR if impressions and clicks exist
        if 'impressions' in metrics_campaign_df.columns and 'clicks' in metrics_campaign_df.columns:
            metrics_campaign_df['ctr_pct'] = (metrics_campaign_df['clicks'].astype(float) / metrics_campaign_df['impressions'].astype(float)) * 100
            
        # Extract ROAS from website_purchase_roas if it exists
        if 'website_purchase_roas' in metrics_campaign_df.columns:
            try:
                # The ROAS field is typically a JSON array string like "[{"action_type":"omni_purchase","value":2.3}]"
                metrics_campaign_df['roas'] = metrics_campaign_df['website_purchase_roas'].apply(
                    lambda x: float(json.loads(x)[0]['value']) if isinstance(x, str) and x else 0
                )
            except (ValueError, KeyError, IndexError, json.JSONDecodeError):
                # If there's an error parsing, create an empty ROAS column
                metrics_campaign_df['roas'] = 0
    
    return {
        'campaigns': campaigns_df,
        'metrics_campaign': metrics_campaign_df,
        'metrics_adset': metrics_adset_df,
        'metrics_ad': metrics_ad_df,
        'demographic_data': demographic_df
    }

def save_facebook_data_to_csv(processed_data, output_dir):
    """Save processed Facebook data to CSV files"""
    # Create timestamp for filenames
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    # Save each DataFrame to a CSV file
    for name, df in processed_data.items():
        if not df.empty:
            filename = f"{output_dir}/facebook_{name}_{timestamp}.csv"
            df.to_csv(filename, index=False)
            print(f"Saved {name} data to {filename}")
    
    print(f"\nAll Facebook data saved to {output_dir} with timestamp {timestamp}")
    return timestamp

def main():
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=DAYS_BACK)
    
    print(f"\nExtracting Facebook Ads data from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    # Initialize Facebook Ads analyzer
    fb_analyzer = FacebookAdAnalyzer(FB_AD_ACCOUNT_ID, FB_ACCESS_TOKEN)
    
    # Get Facebook Ads data
    print("\n=== FETCHING FACEBOOK ADS DATA ===")
    facebook_data = fb_analyzer.get_facebook_data(start_date, end_date)
    
    # Process Facebook data
    print("\n=== PROCESSING FACEBOOK ADS DATA ===")
    processed_data = process_facebook_data(facebook_data)
    
    # Save data to CSV
    save_facebook_data_to_csv(processed_data, OUTPUT_DIR)
    
    # Print summary
    print("\n=== FACEBOOK ADS DATA EXTRACTION SUMMARY ===")
    for name, df in processed_data.items():
        if not df.empty:
            print(f"{name.capitalize()}: {len(df)} records")
            
            # Add more detailed metrics for campaign data
            if name == 'metrics_campaign':
                total_spend = df['spend'].astype(float).sum() if 'spend' in df.columns else 0
                total_spend_eur = df['spend_eur'].astype(float).sum() if 'spend_eur' in df.columns else 0
                total_impressions = df['impressions'].astype(float).sum() if 'impressions' in df.columns else 0
                total_clicks = df['clicks'].astype(float).sum() if 'clicks' in df.columns else 0
                
                print(f"  Total Spend: ${total_spend:.2f} (€{total_spend_eur:.2f})")
                print(f"  Total Impressions: {total_impressions:,.0f}")
                print(f"  Total Clicks: {total_clicks:,.0f}")
                
                if 'roas' in df.columns:
                    avg_roas = df['roas'].mean() if not df['roas'].empty else 0
                    print(f"  Average ROAS: {avg_roas:.2f}x")
                    
                # Show any available website_purchase_roas data
                if 'website_purchase_roas' in df.columns:
                    roas_count = df['website_purchase_roas'].count()
                    print(f"  Campaigns with ROAS data: {roas_count}")
    
    print("\nFacebook Ads data extraction completed successfully!")

if __name__ == "__main__":
    main()