import pandas as pd
import numpy as np
import re
import json
import time
import os
from datetime import datetime, timedelta
import matplotlib.pyplot as plt
import seaborn as sns
from collections import defaultdict
import requests
import argparse
import time

#############################################
# CONFIGURATION SECTION
#############################################

# Shopify API Credentials
SHOPIFY_API_KEY = "bde60ad1c6d0cfa966dee4b38d98c9ef"
SHOPIFY_PASSWORD = "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"
SHOPIFY_SHOP_NAME = "dd3662-08"

# Facebook API Credentials
# Facebook API Credentials
FB_AD_ACCOUNT_ID = os.environ.get('FB_AD_ACCOUNT_ID', "599673092559823")
FB_ACCESS_TOKEN = os.environ.get('FB_ACCESS_TOKEN', "EAATWoaVO7YkBO00ZBDeV8NMjxNlt0mWkyQasFghoJujc9bzEWda2e8rbLVZA7umkhmyeR3MZA5Rgxls1wVadHHcf5lBpkfN4U7ZBrLNSDDmSq2BhXkfEaILr8bTxMraYxHcWKcter1k7HLzVUZCisvHjmTAcY3F5o8bEtePfDJVg3iDGm8OS0qjzwLqvxWmaOAVZBDvjRQ")

# Analysis Parameters
ATTRIBUTION_WINDOW_DAYS = 7  # Standard attribution window
COGS_PERCENTAGE = 0.4  # Default COGS as 40% of revenue if not provided
EXTENDED_ANALYSIS_DAYS = 30  # Days to look beyond attribution window

# Shopify Base URL
SHOPIFY_URL = f"https://{SHOPIFY_API_KEY}:{SHOPIFY_PASSWORD}@{SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2023-10"


#############################################
# SHOPIFY API FUNCTIONS
#############################################

def get_exchange_rate(from_currency="USD", to_currency="EUR"):
    """
    Get the current exchange rate from one currency to another.
    
    Parameters:
    from_currency (str): Source currency code (default: USD)
    to_currency (str): Target currency code (default: EUR)
    
    Returns:
    float: Exchange rate or fallback value of 0.96 if API calls fail
    """
    import requests
    
    try:
        # Use a free exchange rate API
        response = requests.get(f"https://api.exchangerate-api.com/v4/latest/{from_currency}", timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            rate = data["rates"].get(to_currency)
            if rate is not None:
                print(f"Current exchange rate: 1 {from_currency} = {rate} {to_currency}")
                return rate
        
        print(f"Could not get current exchange rate. Using fallback rate: 0.96")
        return 0.96
        
    except Exception as e:
        print(f"Error fetching exchange rate: {str(e)}. Using fallback rate: 0.96")
        return 0.96
USD_TO_EUR_RATE = get_exchange_rate("USD", "EUR")

def update_shopify_url(api_key=None, password=None, shop_name=None):
    """Update the Shopify URL based on potentially updated credentials"""
    global SHOPIFY_URL
    
    # Use provided values or fall back to global values
    api_key = api_key if api_key is not None else SHOPIFY_API_KEY
    password = password if password is not None else SHOPIFY_PASSWORD
    shop_name = shop_name if shop_name is not None else SHOPIFY_SHOP_NAME
    
    # Update the URL
    SHOPIFY_URL = f"https://{api_key}:{password}@{shop_name}.myshopify.com/admin/api/2023-10"
    return SHOPIFY_URL

def fetch_from_shopify_api(endpoint, params=None):
    """Generic function to fetch data from any Shopify API endpoint with rate limiting handling"""
    url = f"{SHOPIFY_URL}/{endpoint}"
    response = requests.get(url, params=params)
    
    if response.status_code == 200:
        return response  # Return the full response object to access headers
    elif response.status_code == 429:  # Rate limit exceeded
        print("Rate limit exceeded. Waiting before retry...")
        time.sleep(2)  # Wait 2 seconds and try again
        return fetch_from_shopify_api(endpoint, params)
    else:
        print(f"Error: {response.status_code} - {response.text}")
        return None

def fetch_paginated_shopify_data(endpoint, params=None, max_retries=3):
    """
    Enhanced function to fetch all pages for a paginated endpoint with improved error handling
    
    Parameters:
    endpoint (str): Shopify API endpoint
    params (dict, optional): Additional parameters for the request
    max_retries (int): Maximum number of retry attempts for failed requests
    
    Returns:
    list: Combined data from all pages
    """
    if params is None:
        params = {}
    
    # Set a consistent limit that works across different endpoints
    params['limit'] = 250  # Maximum allowed by Shopify
    
    all_data = []
    page_count = 0
    next_page_info = None
    retry_count = 0
    
    while True:
        try:
            # Reset retry count on successful iteration
            retry_count = 0
            
            # Prepare request parameters
            current_params = params.copy()
            if next_page_info:
                # Use page_info for subsequent pages
                current_params = {'page_info': next_page_info, 'limit': 250}
            
            # Make the API request
            response = fetch_from_shopify_api(endpoint, current_params)
            
            # Handle potential API errors
            if response is None:
                print(f"Failed to fetch data for {endpoint}. Stopping.")
                break
            
            # Get the JSON data from the response
            response_data = response.json()
            
            # Find the main data key dynamically
            data_key = next(iter(response_data)) if response_data else None
            
            if not data_key or data_key not in response_data:
                print(f"No data found in response for {endpoint}")
                break
            
            # Extract and extend data
            current_data = response_data[data_key]
            all_data.extend(current_data)
            page_count += 1
            
            print(f"Fetched page {page_count} with {len(current_data)} items, total so far: {len(all_data)}")
            
            # Check for pagination in the Link header
            link_header = response.headers.get('Link', '')
            print(f"Link header: {link_header}")
            
            # Determine if there's a next page
            if 'rel="next"' not in link_header:
                print("No next page found. Stopping.")
                break
            
            # Extract next page info with improved parsing
            next_links = [link for link in link_header.split(',') if 'rel="next"' in link]
            if not next_links:
                print("No next link parsed. Stopping.")
                break
            
            next_link = next_links[0].strip()
            start_idx = next_link.find('page_info=') + len('page_info=')
            end_idx = next_link.find('>;')
            
            if start_idx == -1 or end_idx == -1:
                print("Failed to parse page_info from Link header. Stopping.")
                break
                
            next_page_info = next_link[start_idx:end_idx]
            print(f"Next page_info: {next_page_info}")
        
        except Exception as e:
            # Implement exponential backoff for retries
            retry_count += 1
            if retry_count > max_retries:
                print(f"Max retries exceeded for {endpoint}. Error: {e}. Stopping.")
                break
            
            wait_time = 2 ** retry_count  # Exponential backoff
            print(f"Error: {e}. Retrying in {wait_time} seconds (Attempt {retry_count}/{max_retries})")
            time.sleep(wait_time)
    
    print(f"Total items fetched for {endpoint}: {len(all_data)}")
    return all_data

def get_all_collections():
    """Get all collections from the shop (both custom and smart collections)"""
    all_collections = []
    
    # Get custom collections
    custom_collections = fetch_paginated_shopify_data("custom_collections.json")
    for collection in custom_collections:
        all_collections.append({
            'id': collection['id'],
            'handle': collection['handle'],
            'title': collection['title'],
            'type': 'custom',
            'url': f"https://{SHOPIFY_SHOP_NAME}.myshopify.com/collections/{collection['handle']}",
            'published_at': collection.get('published_at', ''),
            'updated_at': collection.get('updated_at', ''),
            'created_at': collection.get('created_at', '')
        })
    
    # Get smart collections
    smart_collections = fetch_paginated_shopify_data("smart_collections.json")
    for collection in smart_collections:
        all_collections.append({
            'id': collection['id'],
            'handle': collection['handle'],
            'title': collection['title'],
            'type': 'smart',
            'url': f"https://{SHOPIFY_SHOP_NAME}.myshopify.com/collections/{collection['handle']}",
            'published_at': collection.get('published_at', ''),
            'updated_at': collection.get('updated_at', ''),
            'created_at': collection.get('created_at', '')
        })
    
    return all_collections

def get_all_products():
    """Get all products from the shop regardless of collection membership"""
    print("Fetching all products from Shopify with prices...")
    
    # Fetch all products with improved pagination
    all_products = fetch_paginated_shopify_data("products.json")
    
    # Format the product data
    formatted_products = []
    for product in all_products:
        # Get the minimum price from variants (if multiple variants exist)
        variants = product.get('variants', [])
        prices = [float(v['price']) for v in variants if v.get('price') is not None]
        price = min(prices) if prices else 0.0
        compare_at_prices = [float(v['compare_at_price']) for v in variants if v.get('compare_at_price') is not None]
        compare_at_price = min(compare_at_prices) if compare_at_prices else None
        
        # Check availability based on inventory_quantity
        # A product is considered available if any variant has inventory_quantity > 0
        available = any(v.get('inventory_quantity', 0) > 0 for v in variants) if variants else False
        
        formatted_products.append({
            'product_id': product['id'],
            'title': product['title'],
            'handle': product['handle'],
            'url': f"https://{SHOPIFY_SHOP_NAME}.myshopify.com/products/{product['handle']}",
            'price': price,
            'compare_at_price': compare_at_price,
            'variant_count': len(variants),
            'available': available,
            'created_at': product.get('created_at', ''),
            'updated_at': product.get('updated_at', ''),
            'published_at': product.get('published_at', '')
        })
    
    print(f"Found {len(formatted_products)} products with price information")
    return formatted_products

def get_products_in_collection(collection_id, collection_type):
    """Get all products in a specific collection"""
    products = []
    
    # For custom collections, we can directly query products
    if collection_type == 'custom':
        endpoint = f"collections/{collection_id}/products.json"
        params = None
    # For smart collections, we need to get the products via a different endpoint
    else:
        endpoint = f"products.json"
        params = {'collection_id': collection_id}
    
    response = fetch_from_shopify_api(endpoint, params)
    
    if response:
        products_data = response.json()
        if 'products' in products_data:
            for product in products_data['products']:
                products.append({
                    'product_id': product['id'],
                    'title': product['title'],
                    'handle': product['handle'],
                    'url': f"https://{SHOPIFY_SHOP_NAME}.myshopify.com/products/{product['handle']}"
                })
    
    return products

def get_collection_product_mapping():
    """Create a complete mapping between collections and products, including all products regardless of collection"""
    # Get all collections
    collections = get_all_collections()
    print("DEBUG: Available collection titles:", [c['title'] for c in collections])

    # Create a mapping dictionary for collections for quick lookup
    collection_map = {collection['id']: collection for collection in collections}
    
    # Get all products
    all_products = get_all_products()
    
    # Create a dictionary to store product data by ID
    product_map = {product['product_id']: product for product in all_products}
    
    # List to store comprehensive relationships
    comprehensive_relationships = []
    
    # First, process each collection
    for collection in collections:
        collection_id = collection['id']
        print(f"Processing collection: {collection['title']} ({collection_id})")
        
        # Get products in this collection
        collection_products = get_products_in_collection(collection_id, collection['type'])
        
        # Create comprehensive relationships
        for product in collection_products:
            comprehensive_relationships.append({
                'collection_id': collection_id,
                'collection_title': collection['title'],
                'collection_handle': collection['handle'],
                'collection_type': collection['type'],
                'collection_url': collection['url'],
                'product_id': product['product_id'],
                'product_title': product['title'],
                'product_handle': product['handle'],
                'product_url': product['url']
            })
    
    # Now add all products that haven't been associated with any collection
    products_in_collections = set(rel['product_id'] for rel in comprehensive_relationships)
    for product in all_products:
        if product['product_id'] not in products_in_collections:
            # This product isn't in any collection
            comprehensive_relationships.append({
                'collection_id': None,
                'collection_title': None,
                'collection_handle': None,
                'collection_type': None,
                'collection_url': None,
                'product_id': product['product_id'],
                'product_title': product['title'],
                'product_handle': product['handle'],
                'product_url': product['url']
            })
    
    print(f"Found {len(comprehensive_relationships)} collection-product relationships")
    print(f"Found {len(set(rel['product_id'] for rel in comprehensive_relationships))} unique products across all data")
    
    return comprehensive_relationships

def get_orders(start_date, end_date):
    """Get all orders from the shop within the specified date range"""
    # Format dates for the API
    start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S%z")
    end_date_str = end_date.strftime("%Y-%m-%dT%H:%M:%S%z")
    
    print(f"Fetching orders from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}...")
    
    # Prepare the endpoint with filter
    endpoint = "orders.json"
    params = {
        'status': 'any',
        'created_at_min': start_date_str,
        'created_at_max': end_date_str
    }
    
    # Fetch all orders with improved pagination
    all_orders = fetch_paginated_shopify_data(endpoint, params)
    
    print(f"Fetched {len(all_orders)} orders")
    return all_orders

def process_orders(orders):
    """Process orders into financial data formats"""
    # Lists to hold processed data
    order_summary = []
    order_items = []
    
    for order in orders:
        # Extract basic order data
        order_data = {
            'order_id': order['id'],
            'order_number': order['order_number'],
            'created_at': order['created_at'],
            'processed_at': order.get('processed_at', ''),
            'customer_id': order.get('customer', {}).get('id', ''),
            'customer_email': order.get('email', ''),
            'total_price': float(order['total_price']),
            'subtotal_price': float(order.get('subtotal_price', 0)),
            'total_tax': float(order.get('total_tax', 0)),
            'total_discounts': float(order.get('total_discounts', 0)),
            'total_shipping': float(order.get('shipping_lines', [{}])[0].get('price', 0) 
                                  if order.get('shipping_lines') else 0),
            'currency': order['currency'],
            'financial_status': order['financial_status'],
            'fulfillment_status': order.get('fulfillment_status', 'unfulfilled'),
            'payment_method': order.get('payment_gateway_names', [''])[0] if order.get('payment_gateway_names') else '',
            'tags': order.get('tags', ''),
            'note': order.get('note', ''),
            'cancelled_at': order.get('cancelled_at', ''),
            'cancel_reason': order.get('cancel_reason', '')
        }
        
        # Add order to summary
        order_summary.append(order_data)
        
        # Process line items
        for item in order.get('line_items', []):
            item_data = {
                'order_id': order['id'],
                'order_number': order['order_number'],
                'created_at': order['created_at'],
                'line_item_id': item['id'],
                'product_id': item.get('product_id', ''),
                'variant_id': item.get('variant_id', ''),
                'sku': item.get('sku', ''),
                'title': item['title'],
                'variant_title': item.get('variant_title', ''),
                'quantity': item['quantity'],
                'price': float(item['price']),
                'total_discount': float(item.get('total_discount', 0)),
                'grams': item.get('grams', 0),
                'fulfillment_status': item.get('fulfillment_status', 'unfulfilled')
            }
            
            # Add line item
            order_items.append(item_data)
    
    return {
        'order_summary': order_summary,
        'order_items': order_items
    }

def get_refunds(start_date, end_date):
    """Get all refunds from the shop within the specified date range"""
    # Format dates for the API
    start_date_str = start_date.strftime("%Y-%m-%dT%H:%M:%S%z")
    end_date_str = end_date.strftime("%Y-%m-%dT%H:%M:%S%z")
    
    print(f"Fetching refunds from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}...")
    
    refunds = []
    
    # First get all orders that could have refunds
    orders = get_orders(start_date, end_date)
    
    # Process each order to check for refunds
    for order in orders:
        if order.get('refunds'):
            order_id = order['id']
            order_number = order['order_number']
            customer_id = order.get('customer', {}).get('id', '')
            
            # Process each refund in the order
            for refund in order['refunds']:
                # Calculate total refund amount from transactions
                refund_amount = 0
                if refund.get('transactions'):
                    for transaction in refund['transactions']:
                        if transaction.get('kind') == 'refund':
                            refund_amount += float(transaction.get('amount', 0))
                
                # Get reason if available
                reason = refund.get('note', '') or ''

                
                # Check if it's a chargeback/dispute
                is_dispute = False
                processing_method = refund.get('processing_method', '').lower()
                if (processing_method == 'chargeback' or 
                    'dispute' in reason.lower() or 
                    'chargeback' in reason.lower() or
                    'fraud' in reason.lower() or
                    'unauthorized' in reason.lower()):
                    is_dispute = True

                # You could also check the order's financial_status
                if order.get('financial_status') == 'charged_back':
                    is_dispute = True
                
                # Get refund line items
                refund_line_items_count = len(refund.get('refund_line_items', []))
                
                # Create refund record
                refund_data = {
                    'refund_id': refund['id'],
                    'order_id': order_id,
                    'order_number': order_number,
                    'customer_id': customer_id,
                    'created_at': refund['created_at'],
                    'processed_at': refund.get('processed_at', refund['created_at']),
                    'amount': refund_amount,
                    'reason': reason,
                    'is_dispute': is_dispute,
                    'refund_line_items_count': refund_line_items_count,
                    'currency': order['currency']
                }
                
                refunds.append(refund_data)
    
    print(f"Fetched {len(refunds)} refunds")
    return refunds

def analyze_refund_data(refunds, orders):
    """Analyze refund data and calculate refund metrics"""
    # Initialize metrics
    total_orders = len(orders)
    total_order_value = sum(float(order['total_price']) for order in orders)
    total_refunds = len(refunds)
    total_refund_value = sum(refund['amount'] for refund in refunds)
    total_disputes = sum(1 for refund in refunds if refund['is_dispute'])
    dispute_value = sum(refund['amount'] for refund in refunds if refund['is_dispute'])
    
    # Calculate rates
    refund_rate = (total_refunds / total_orders * 100) if total_orders > 0 else 0
    dispute_rate = (total_disputes / total_orders * 100) if total_orders > 0 else 0
    refund_value_percentage = (total_refund_value / total_order_value * 100) if total_order_value > 0 else 0
    
    # Group refunds by reason
    reason_counts = {}
    for refund in refunds:
        reason = refund['reason'] if refund['reason'] else 'No reason provided'
        reason_counts[reason] = reason_counts.get(reason, 0) + 1
    
    # Sort reasons by frequency
    top_reasons = sorted(reason_counts.items(), key=lambda x: x[1], reverse=True)
    
    # Return refund analysis results
    refund_analysis = {
        'total_refunds': total_refunds,
        'total_refund_value': total_refund_value,
        'refund_rate': refund_rate,
        'total_disputes': total_disputes,
        'dispute_value': dispute_value,
        'dispute_rate': dispute_rate,
        'refund_value_percentage': refund_value_percentage,
        'top_refund_reasons': top_reasons[:5] if top_reasons else []
    }
    
    return refund_analysis

def get_shopify_data(start_date, end_date):
    """Get all Shopify data for the specified date range"""
    # Get collection-product mapping
    print("\n=== FETCHING COLLECTION-PRODUCT MAPPING ===")
    collection_product_mapping = get_collection_product_mapping()
    
    # Get orders and process them
    print(f"\n=== FETCHING ORDERS ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}) ===")
    orders = get_orders(start_date, end_date)
    financial_data = process_orders(orders)
    
    # Get refunds data
    print(f"\n=== FETCHING REFUNDS ({start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}) ===")
    refunds = get_refunds(start_date, end_date)
    
    # Analyze refund data
    refund_analysis = analyze_refund_data(refunds, orders)
    
    # Return all data
    return {
        'collection_product_mapping': collection_product_mapping,
        'order_summary': financial_data['order_summary'],
        'order_items': financial_data['order_items'],
        'refunds': refunds,
        'refund_analysis': refund_analysis
    }

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
        # Format the Ad Account ID if needed
        if not ad_account_id.startswith('act_'):
            self.ad_account_id = f'act_{ad_account_id}'
        else:
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
        
        # Define fields to retrieve
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
    
    def get_facebook_data(self, start_date, end_date):
        """Get all Facebook Ads data for the specified date range"""
        # Get campaigns
        campaigns = self.get_campaigns(limit=100)
        
        # Get financial metrics
        metrics_data = self.get_financial_metrics(start_date, end_date, level="campaign")
        
        # Return all data
        return {
            'campaigns': campaigns,
            'metrics': metrics_data
        }

#############################################
# DATA ANALYSIS FUNCTIONS
#############################################

def extract_product_name(campaign_name):
    """
    Extract product name from campaign name using precise pattern matching.
    
    For single product campaigns with pattern: "[DATE] - [PRODUCT NAME] - [SCORE] - SINGLE PRODUCT"
    """
    # Try to match the single product pattern
    single_product_pattern = r'^\d+\s+[A-Za-z]+\s+-\s+(.*?)\s+-\s+\d+\.\d+\s+-\s+SINGLE PRODUCT'
    match = re.search(single_product_pattern, campaign_name)
    
    if match:
        return match.group(1).strip()
    
    # For collection campaigns, extract collection code
    collection_pattern = r'^\d+\s+[A-Za-z]+\s+-\s+C(\d+)\s+ADS'
    match = re.search(collection_pattern, campaign_name)
    
    if match:
        return f"Collection C{match.group(1)}"
    
    # Fallback: If neither pattern matches, use a generic approach
    # Remove date prefix
    date_pattern = r'^\d+\s+[A-Za-z]+(\s*-\s*|\s+)'
    without_date = re.sub(date_pattern, '', campaign_name)
    
    # Remove scoring and type suffixes
    suffix_pattern = r'\s+-\s+\d+\.\d+.*$|\s*-\s*\d+\.\d+.*$'
    product_name = re.sub(suffix_pattern, '', without_date)
    
    # Clean up any remaining SINGLE PRODUCT or COLLECTION text
    product_name = re.sub(r'\s*-\s*SINGLE PRODUCT.*$|\s*-\s*COLLECTION.*$', '', product_name)
    
    return product_name.strip()

def extract_collection_code(campaign_name):
    """Extract collection code from campaign name with improved pattern matching"""
    # Try multiple patterns to match collection codes
    patterns = [
        r'C(\d+)\s+ADS',                           # Standard pattern: C35 ADS
        r'C(\d+)\s+ADS\s+Collection',              # Extended pattern: C35 ADS Collection
        r'C(\d+)\s+Collection',                    # Alternative pattern: C35 Collection
        r'-\s+C(\d+)\s+ADS',                       # With dash prefix: - C35 ADS
        r'-\s+C(\d+)',                             # Just with dash prefix: - C35
        r'Collection\s+\(.*\)\s+-\s+C(\d+)',       # Complex pattern with date
        r'Collection\s+C(\d+)',                    # Reversed order: Collection C35
        r'C(\d+)'                                  # Fallback: just C35 anywhere
    ]
    
    for pattern in patterns:
        match = re.search(pattern, campaign_name, re.IGNORECASE)
        if match:
            return f"C{match.group(1)}"
    
    # If we're here, check if word "collection" exists at all
    if "COLLECTION" in campaign_name.upper():
        # Extract any number following C
        match = re.search(r'C(\d+)', campaign_name, re.IGNORECASE)
        if match:
            return f"C{match.group(1)}"
            
    return None

def is_collection_campaign(campaign_name):
    """Determine if a campaign is for a collection with improved detection"""
    # Check for explicit collection indicators
    if "COLLECTION" in campaign_name.upper():
        return True
        
    # Check for collection code pattern
    if re.search(r'C\d+', campaign_name, re.IGNORECASE):
        return True
        
    return False

def extract_campaign_date(campaign_name):
    """Extract campaign date from campaign name"""
    # Extract the date at the beginning of the campaign name
    date_match = re.search(r'^(\d+)\s+([A-Za-z]+)', campaign_name)
    
    if date_match:
        day = date_match.group(1)
        month = date_match.group(2)
        try:
            # First try current year
            current_year = datetime.now().year
            campaign_date = datetime.strptime(f"{day} {month} {current_year}", "%d %B %Y")
            
            # If the date is in the future, try previous year
            if campaign_date > datetime.now():
                campaign_date = datetime.strptime(f"{day} {month} {current_year-1}", "%d %B %Y")
                
            return campaign_date
        except ValueError:
            print(f"Could not parse date from campaign: {campaign_name}")
            print(f"Extracted day: {day}, month: {month}")
    
    return None

#############################################
# EXPORT AND REPORTING FUNCTIONS
#############################################

def create_output_files(analysis_results, timestamp=None, output_dir="."):
    """Create a single consolidated output file with all analysis results"""
    if timestamp is None:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Use DATA_DIR as default if output_dir is not provided or not valid
    if not output_dir or not os.path.exists(output_dir):
        output_dir = os.environ.get('DATA_DIR', '.')
        os.makedirs(output_dir, exist_ok=True)
    
    campaign_analysis_df = analysis_results['campaign_analysis']
    
    if campaign_analysis_df.empty:
        print("No campaign data to export.")
        return None
    
    # Create a combined CSV with all relevant data
    combined_df = campaign_analysis_df.copy()
    
    # Add refund metrics to the first row of the DataFrame
    if not combined_df.empty and 'refund_analysis' in analysis_results:
        refund_analysis = analysis_results.get('refund_analysis', {})
        # Add refund metrics to the first row
        combined_df.loc[combined_df.index[0], 'Total Refunds'] = refund_analysis.get('total_refunds', 0)
        combined_df.loc[combined_df.index[0], 'Total Refund Value'] = refund_analysis.get('total_refund_value', 0)
        combined_df.loc[combined_df.index[0], 'Refund Rate'] = refund_analysis.get('refund_rate', 0)
        combined_df.loc[combined_df.index[0], 'Total Disputes'] = refund_analysis.get('total_disputes', 0)
        combined_df.loc[combined_df.index[0], 'Dispute Rate'] = refund_analysis.get('dispute_rate', 0)
        
        # Convert the top refund reasons to a JSON string and add to the CSV
        top_reasons = refund_analysis.get('top_refund_reasons', [])
        combined_df.loc[combined_df.index[0], 'Top Refund Reasons'] = json.dumps(top_reasons)
    
    # Add product revenue details to the first row
    if not combined_df.empty and 'Product Revenue Details' in analysis_results['summary']:
        product_revenue = analysis_results['summary']['Product Revenue Details']
        combined_df.loc[combined_df.index[0], 'Product Revenue Details'] = json.dumps(product_revenue)
    
    # Add Shopify revenue and orders to the first row
    if not combined_df.empty:
        combined_df.loc[combined_df.index[0], 'Total Shopify Revenue'] = analysis_results['summary'].get('Total Shopify Revenue', 0)
        combined_df.loc[combined_df.index[0], 'Total Shopify Orders'] = analysis_results['summary'].get('Total Shopify Orders', 0)

    # Drop complex columns that can't be easily represented in CSV
    if 'Daily Sales' in combined_df.columns:
        combined_df = combined_df.drop('Daily Sales', axis=1)
    if 'Matched Product IDs' in combined_df.columns:
        combined_df = combined_df.drop('Matched Product IDs', axis=1)
    if 'Sales per Product' in combined_df.columns:
        combined_df = combined_df.drop('Sales per Product', axis=1)
    
    # Convert list columns to strings for CSV export
    for col in combined_df.columns:
        if isinstance(combined_df[col].iloc[0], list) if not combined_df.empty else False:
            combined_df[col] = combined_df[col].apply(lambda x: str(x) if isinstance(x, list) else x)
    
    # Use the specified output directory for the output file
    output_filename = os.path.join(output_dir, f"complete_ecommerce_analysis_{timestamp}.csv")
    combined_df.to_csv(output_filename)
    
    # Print summary information
    print("\nE-commerce Campaign Analysis Summary")
    print("=" * 50)
    for key, value in analysis_results['summary'].items():
        if key != 'Top Performing Ads' and key != 'Product Revenue Details':  # Handle these separately
            print(f"{key}: {value}")

    # Print Top Performers
    print("\nTop Performing Campaigns:")
    print("=" * 50)
    top_ads = analysis_results['summary'].get('Top Performing Ads', {})
    
    if top_ads:
        metrics = [
            ('highest_roas', 'Highest ROAS'),
            ('highest_revenue', 'Highest Revenue'),
            ('highest_profit', 'Highest Net Profit'),
            ('highest_conversion_rate', 'Highest Conversion Rate'),
            ('highest_ctr', 'Highest CTR'),
            ('lowest_cpa', 'Lowest CPA'),
            ('highest_profit_margin', 'Highest Profit Margin')
        ]
        
        for key, label in metrics:
            campaign = top_ads.get(key)
            if campaign and campaign in campaign_analysis_df.index:
                campaign_info = campaign_analysis_df.loc[campaign]
                print(f"{label}: {campaign} - Product: {campaign_info['Product Name']}")

    # Add refund metrics to the console output
    print("\nRefund Analysis")
    print("=" * 50)
    refund_analysis = analysis_results.get('refund_analysis', {})
    if refund_analysis:
        print(f"Total Refunds: {refund_analysis.get('total_refunds', 0)}")
        print(f"Total Refund Value: €{refund_analysis.get('total_refund_value', 0):.2f}")
        print(f"Refund Rate: {refund_analysis.get('refund_rate', 0):.2f}%")
        print(f"Total Disputes: {refund_analysis.get('total_disputes', 0)}")
        print(f"Dispute Rate: {refund_analysis.get('dispute_rate', 0):.2f}%")
        print(f"Refund Value as % of Total Revenue: {refund_analysis.get('refund_value_percentage', 0):.2f}%")
        
        # Print top refund reasons
        print("\nTop Refund Reasons:")
        for reason, count in refund_analysis.get('top_refund_reasons', []):
            print(f"- {reason}: {count} refunds")

    print(f"\nResults saved to: {output_filename}")
    
    return combined_df

def identify_top_performing_ads(campaign_analysis_df):
    """Identify top performing ads based on different metrics"""
    if campaign_analysis_df.empty:
        return {}
        
    top_ads = {
        'highest_roas': campaign_analysis_df.sort_values('Total ROAS', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None,
        'highest_revenue': campaign_analysis_df.sort_values('Total Revenue', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None,
        'highest_profit': campaign_analysis_df.sort_values('Total Net Profit', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None,
        'highest_conversion_rate': campaign_analysis_df.sort_values('Conversion Rate (%)', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None,
        'highest_ctr': campaign_analysis_df.sort_values('CTR (%)', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None,
        'lowest_cpa': campaign_analysis_df.sort_values('CPA', ascending=True).index[0] if len(campaign_analysis_df) > 0 else None,
        'highest_profit_margin': campaign_analysis_df.sort_values('Profit Margin (%)', ascending=False).index[0] if len(campaign_analysis_df) > 0 else None
    }
    
    return top_ads

def split_product_lists(campaign_results):
    """
    Split product lists into individual product entries with distributed metrics
    
    Parameters:
    campaign_results (dict): Original campaign results with product lists
    
    Returns:
    dict: Expanded campaign results with individual products
    """
    expanded_results = {}
    
    for campaign, data in campaign_results.items():
        product_name = data['Product Name']
        
        # Check if product_name is a list (multiple products)
        if isinstance(product_name, list) and len(product_name) > 1:
            # Calculate metrics to distribute
            num_products = len(product_name)
            
            # Mark the original campaign entry as a collection for filtering in the UI
            data['isCollectionCampaign'] = True
            expanded_results[campaign] = data
            
            # For each product, create a new entry
            for i, product in enumerate(product_name):
                new_campaign_key = f"{campaign}__PRODUCT_{i+1}"
                
                # Copy original data
                new_data = data.copy()
                
                # Replace product name with individual product
                new_data['Product Name'] = product
                
                # Distribute metrics evenly
                for metric in ['Ad Spend', 'Impressions', 'Clicks', 
                              'Attribution Revenue', 'Attribution Orders',
                              'Attribution COGS', 'Attribution Gross Profit', 
                              'Extended Revenue', 'Extended Orders',
                              'Total Revenue', 'Total Orders', 'Total COGS', 
                              'Total Gross Profit', 'Total Net Profit']:
                    if metric in new_data and new_data[metric] is not None:
                        new_data[metric] = new_data[metric] / num_products
                
                # Recalculate derived metrics
                if 'Attribution Gross Profit' in new_data and 'Ad Spend' in new_data:
                    new_data['Attribution Net Profit'] = new_data['Attribution Gross Profit'] - new_data['Ad Spend']
                    if new_data['Ad Spend'] > 0:
                        new_data['Attribution ROI (%)'] = (new_data['Attribution Net Profit'] / new_data['Ad Spend']) * 100
                        new_data['Attribution ROAS'] = new_data['Attribution Revenue'] / new_data['Ad Spend']
                    else:
                        new_data['Attribution ROI (%)'] = np.nan
                        new_data['Attribution ROAS'] = np.nan
                
                if 'Total Net Profit' in new_data and 'Ad Spend' in new_data and new_data['Ad Spend'] > 0:
                    new_data['Total ROI (%)'] = (new_data['Total Net Profit'] / new_data['Ad Spend']) * 100
                else:
                    new_data['Total ROI (%)'] = np.nan
                    
                if 'Total Revenue' in new_data and 'Ad Spend' in new_data and new_data['Ad Spend'] > 0:
                    new_data['Total ROAS'] = new_data['Total Revenue'] / new_data['Ad Spend']
                else:
                    new_data['Total ROAS'] = np.nan
                    
                if 'Clicks' in new_data and 'Impressions' in new_data and new_data['Impressions'] > 0:
                    new_data['CTR (%)'] = (new_data['Clicks'] / new_data['Impressions']) * 100
                else:
                    new_data['CTR (%)'] = 0
                    
                if 'Attribution Orders' in new_data and 'Clicks' in new_data and new_data['Clicks'] > 0:
                    new_data['Conversion Rate (%)'] = (new_data['Attribution Orders'] / new_data['Clicks']) * 100
                else:
                    new_data['Conversion Rate (%)'] = 0
                    
                if 'Attribution Orders' in new_data and 'Ad Spend' in new_data and new_data['Attribution Orders'] > 0:
                    new_data['CPA'] = new_data['Ad Spend'] / new_data['Attribution Orders']
                else:
                    new_data['CPA'] = np.nan
                    
                if 'Attribution Net Profit' in new_data and 'Attribution Revenue' in new_data and new_data['Attribution Revenue'] > 0:
                    new_data['Profit Margin (%)'] = (new_data['Attribution Net Profit'] / new_data['Attribution Revenue']) * 100
                else:
                    new_data['Profit Margin (%)'] = np.nan
                    
                if 'Total Net Profit' in new_data and 'Total Revenue' in new_data and new_data['Total Revenue'] > 0:
                    new_data['Total Profit Margin (%)'] = (new_data['Total Net Profit'] / new_data['Total Revenue']) * 100
                else:
                    new_data['Total Profit Margin (%)'] = np.nan
                
                # Add original campaign reference and mark as a distributed product
                new_data['Original Campaign'] = campaign
                new_data['Product Count'] = num_products
                new_data['isDistributedProduct'] = True
                
                # Store the new entry
                expanded_results[new_campaign_key] = new_data
        else:
            # Single product, keep as is
            expanded_results[campaign] = data
    
    return expanded_results

def find_matching_collection(collection_code, collection_map_df):
    """
    Find a matching collection in Shopify data with improved matching logic
    that handles date format differences
    """
    # First try exact code match
    exact_matches = collection_map_df[collection_map_df['collection_title'].str.contains(collection_code, case=False, na=False)]
    
    if not exact_matches.empty:
        return exact_matches
    
    # Try more flexible pattern matching for just the collection code
    collection_number = collection_code.replace('C', '')
    pattern = r'C\s*' + collection_number + r'\b'
    flexible_matches = collection_map_df[collection_map_df['collection_title'].str.contains(pattern, case=False, regex=True, na=False)]
    
    if not flexible_matches.empty:
        return flexible_matches
    
    # If we still don't have matches, look for the numeric part only
    # This handles cases where C35 in a campaign needs to match with any collection containing "35"
    numeric_matches = collection_map_df[collection_map_df['collection_title'].str.contains(collection_number, regex=True, na=False)]
    
    if not numeric_matches.empty:
        # Filter to only those that have "ADS Collection" in the name as well
        ads_collection_matches = numeric_matches[numeric_matches['collection_title'].str.contains("ADS Collection", case=False, na=False)]
        
        if not ads_collection_matches.empty:
            return ads_collection_matches
        else:
            return numeric_matches
            
    return pd.DataFrame()  # Return empty DataFrame if no match found

def add_total_revenue_summary(shopify_data, analysis_results):
    """
    Add direct revenue totals from Shopify data to the analysis results
    to ensure all revenue is accounted for, even orders not attributed to campaigns.
    """
    order_items_df = pd.DataFrame(shopify_data['order_items'])
    
    # Calculate total sales directly from order data
    total_orders = len(order_items_df)
    total_revenue = order_items_df['price'].sum() if 'price' in order_items_df.columns else 0
    
    # Get unique products
    product_revenue = {}
    if 'product_id' in order_items_df.columns and 'title' in order_items_df.columns and 'price' in order_items_df.columns:
        for product_id in order_items_df['product_id'].unique():
            if pd.isna(product_id):
                continue
                
            product_orders = order_items_df[order_items_df['product_id'] == product_id]
            product_title = product_orders['title'].iloc[0] if not product_orders.empty else f"Product {product_id}"
            product_revenue[product_title] = product_orders['price'].sum()
    
    # Add to the first row of analysis
    if not analysis_results['campaign_analysis'].empty:
        first_idx = analysis_results['campaign_analysis'].index[0]
        analysis_results['campaign_analysis'].loc[first_idx, 'Total Shopify Revenue'] = total_revenue
        analysis_results['campaign_analysis'].loc[first_idx, 'Total Shopify Orders'] = total_orders
    
    # Add to summary
    analysis_results['summary']['Total Shopify Revenue'] = total_revenue
    analysis_results['summary']['Total Shopify Orders'] = total_orders
    analysis_results['summary']['Product Revenue Details'] = product_revenue
    
    # Print comparison
    attributed_revenue = analysis_results['summary'].get('Total Revenue', 0)
    print("\n=== REVENUE COMPARISON ===")
    print(f"Total Shopify Revenue: €{total_revenue:.2f}")
    print(f"Total Attributed Revenue: €{attributed_revenue:.2f}")
    print(f"Difference: €{total_revenue - attributed_revenue:.2f}")
    print(f"Attribution Coverage: {(attributed_revenue / total_revenue * 100) if total_revenue > 0 else 0:.2f}%")
    
    # Print top products by revenue
    print("\nTop Products by Revenue:")
    for product, revenue in sorted(product_revenue.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{product}: €{revenue:.2f}")
    
    return analysis_results

def analyze_campaign_data(facebook_data, shopify_data, start_date, end_date):
    """Analyze the campaign data with enriched information"""
    # Extract relevant data
    facebook_metrics = facebook_data['metrics']
    collection_map_df = pd.DataFrame(shopify_data['collection_product_mapping'])
    order_items_df = pd.DataFrame(shopify_data['order_items'])

    # Add refund data to the analysis
    refund_analysis = shopify_data.get('refund_analysis', {})

    # Convert dates to datetime format
    order_items_df['created_at'] = pd.to_datetime(order_items_df['created_at'], utc=True)
    
    # Initialize results dictionary with enhanced metrics
    campaign_results = {}
    
    # Create a set to track processed orders to prevent double counting
    processed_order_items = set()

    campaign_status_map = {}

    if facebook_data.get('metrics_campaign'):
        for campaign in facebook_data['metrics_campaign']:
            campaign_name = campaign.get('campaign_name')
            campaign_status = campaign.get('status', 'Unknown')
            campaign_status_map[campaign_name] = campaign_status


    # Process each campaign in Facebook metrics
    for campaign_data in facebook_metrics:
        # Skip if campaign_name is missing
        if 'campaign_name' not in campaign_data:
            continue
            
        campaign = campaign_data['campaign_name']
        
        # Skip if we've already processed this campaign
        if campaign in campaign_results:
            continue
            
        # Extract campaign launch date from campaign name
        campaign_start_date = extract_campaign_date(campaign)
        
        # If extraction failed, use date_start from Facebook data
        if campaign_start_date is None:
            campaign_start_date = pd.to_datetime(campaign_data['date_start'], utc=True)
            print(f"Warning: Using Facebook start date for campaign: {campaign}")
        else:
            # Add timezone info to match order_items_df
            campaign_start_date = campaign_start_date.replace(tzinfo=pd.to_datetime(order_items_df['created_at'].iloc[0]).tzinfo if not order_items_df.empty else None)
        
        # Calculate campaign end date (attribution window)
        attribution_end = campaign_start_date + timedelta(days=ATTRIBUTION_WINDOW_DAYS)
        
        # Calculate extended analysis end date
        extended_end = attribution_end + timedelta(days=EXTENDED_ANALYSIS_DAYS)
        
        # Ensure both datetimes have the same timezone awareness for comparison
        if campaign_start_date.tzinfo is not None and end_date.tzinfo is None:
            # If campaign_start_date has timezone but end_date doesn't, make end_date timezone-aware
            end_date = end_date.replace(tzinfo=campaign_start_date.tzinfo)
        elif campaign_start_date.tzinfo is None and end_date.tzinfo is not None:
            # If end_date has timezone but campaign_start_date doesn't, make campaign_start_date timezone-aware
            campaign_start_date = campaign_start_date.replace(tzinfo=end_date.tzinfo)
        
        # Skip campaigns that ended after our analysis end date
        if campaign_start_date > end_date:
            print(f"Skipping campaign {campaign} - starts after analysis end date")
            continue
        
        # Get advertising spend
        spend_usd = float(campaign_data['spend']) if 'spend' in campaign_data else 0
        spend = spend_usd * USD_TO_EUR_RATE  # Convert USD to EUR
        
        # Initialize metrics
        product_url = None
        attributed_revenue = 0
        attributed_orders_count = 0
        extended_revenue = 0
        extended_orders_count = 0
        product_urls = []
        product_names = []
        average_selling_price = 0
        
        # Track time-based sales data for trend analysis
        daily_sales = defaultdict(float)
        
        # Track matched products and their IDs
        matched_product_ids = []
        
        # Track processed order items for this campaign
        campaign_processed_orders = set()
        
        if is_collection_campaign(campaign):
            # Process collection campaign
            collection_code = extract_collection_code(campaign)
            
            if collection_code:
                # Use the improved matching function
                matching_collections = find_matching_collection(collection_code, collection_map_df)
                
                if matching_collections.empty:
                    print(f"Warning: Collection {collection_code} referenced in campaign {campaign} not found in Shopify data")
                    product_names = [f"Collection {collection_code} - Not Found in Shopify"]
                    product_url = None  # No URL since collection not found
                else:
                    # Get all products in this collection
                    collection_product_ids = matching_collections['product_id'].unique()
                    matched_product_ids = collection_product_ids.tolist()
                    
                    # Get collection URL instead of product URLs
                    collection_url = matching_collections['collection_url'].iloc[0]
                    product_url = collection_url  # Use collection URL for collection campaigns
                    
                    # Get matched collection title for better reporting
                    collection_title = matching_collections['collection_title'].iloc[0]
                    print(f"Matched campaign {campaign} with collection: {collection_title}")
                    
                    # Get product details (names only, not URLs)
                    for product_id in collection_product_ids:
                        product_row = matching_collections[matching_collections['product_id'] == product_id]
                        if not product_row.empty:
                            product_names.append(product_row['product_title'].iloc[0])
                    
                    # Process orders within attribution window
                    for product_id in collection_product_ids:
                        # Get orders for this product in the attribution window
                        attributed_orders = order_items_df[
                            (order_items_df['product_id'] == product_id) & 
                            (order_items_df['created_at'] >= campaign_start_date) & 
                            (order_items_df['created_at'] <= attribution_end)
                        ]
                        
                        if not attributed_orders.empty:
                            # Only count orders that haven't been processed for this product
                            for _, order in attributed_orders.iterrows():
                                order_id_key = (order['order_id'], order['line_item_id'])
                                
                                # Skip if we've already counted this order item
                                if order_id_key in processed_order_items:
                                    continue
                                    
                                # Add to campaign revenue and count
                                attributed_revenue += order['price']
                                attributed_orders_count += 1
                                
                                # Track daily sales
                                order_date = order['created_at'].date()
                                daily_sales[order_date] += order['price']
                                
                                # Mark this order as processed
                                processed_order_items.add(order_id_key)
                                campaign_processed_orders.add(order_id_key)
                    
                    # Process orders in extended window (post-attribution)
                    for product_id in collection_product_ids:
                        extended_orders = order_items_df[
                            (order_items_df['product_id'] == product_id) & 
                            (order_items_df['created_at'] > attribution_end) & 
                            (order_items_df['created_at'] <= extended_end)
                        ]
                        
                        if not extended_orders.empty:
                            # Only count orders that haven't been processed
                            for _, order in extended_orders.iterrows():
                                order_id_key = (order['order_id'], order['line_item_id'])
                                
                                # Skip if we've already counted this order item
                                if order_id_key in processed_order_items:
                                    continue
                                    
                                # Add to extended revenue and count
                                extended_revenue += order['price']
                                extended_orders_count += 1
                                
                                # Mark this order as processed
                                processed_order_items.add(order_id_key)
                                campaign_processed_orders.add(order_id_key)
            else:
                # Fall back to the campaign name for collections without explicit code
                print(f"Warning: No collection code found in campaign name: {campaign}")
                product_names = [f"Collection from {campaign} - No code extracted"]
                product_url = None
        else:
            # Process single product campaign
            extracted_name = extract_product_name(campaign)
            
            # For single product campaigns, we'll try direct matching by exact name
            exact_matches = order_items_df[order_items_df['title'].str.lower() == extracted_name.lower()]
            
            if not exact_matches.empty:
                # Found exact match by product title
                best_match = exact_matches.iloc[0]
                product_id = best_match['product_id']
                matched_product_ids.append(product_id)
                product_names.append(best_match['title'])
                
                # Find product URL
                product_url_row = collection_map_df[collection_map_df['product_id'] == product_id]
                if not product_url_row.empty:
                    product_urls.append(product_url_row['product_url'].iloc[0])
                
                # Process orders within attribution window
                attributed_orders = order_items_df[
                    (order_items_df['product_id'] == product_id) & 
                    (order_items_df['created_at'] >= campaign_start_date) & 
                    (order_items_df['created_at'] <= attribution_end)
                ]
                
                if not attributed_orders.empty:
                    # Only count orders that haven't been processed
                    for _, order in attributed_orders.iterrows():
                        order_id_key = (order['order_id'], order['line_item_id'])
                        
                        # Skip if we've already counted this order item
                        if order_id_key in processed_order_items:
                            continue
                            
                        # Add to campaign revenue and count
                        attributed_revenue += order['price']
                        attributed_orders_count += 1
                        
                        # Track daily sales
                        order_date = order['created_at'].date()
                        daily_sales[order_date] += order['price']
                        
                        # Mark this order as processed
                        processed_order_items.add(order_id_key)
                        campaign_processed_orders.add(order_id_key)
                
                # Process orders in extended window
                extended_orders = order_items_df[
                    (order_items_df['product_id'] == product_id) & 
                    (order_items_df['created_at'] > attribution_end) & 
                    (order_items_df['created_at'] <= extended_end)
                ]
                
                if not extended_orders.empty:
                    # Only count orders that haven't been processed
                    for _, order in extended_orders.iterrows():
                        order_id_key = (order['order_id'], order['line_item_id'])
                        
                        # Skip if we've already counted this order item
                        if order_id_key in processed_order_items:
                            continue
                            
                        # Add to extended revenue and count
                        extended_revenue += order['price']
                        extended_orders_count += 1
                        
                        # Mark this order as processed
                        processed_order_items.add(order_id_key)
                        campaign_processed_orders.add(order_id_key)
            else:
                # Try looking up product directly in the collection mapping
                product_match = collection_map_df[collection_map_df['product_title'].str.lower() == extracted_name.lower()]
                
                if not product_match.empty:
                    # Found a match in the complete product list
                    product_id = product_match['product_id'].iloc[0]
                    matched_product_ids.append(product_id)
                    product_names.append(product_match['product_title'].iloc[0])
                    product_urls.append(product_match['product_url'].iloc[0])
                    
                    # Process orders within attribution window
                    attributed_orders = order_items_df[
                        (order_items_df['product_id'] == product_id) & 
                        (order_items_df['created_at'] >= campaign_start_date) & 
                        (order_items_df['created_at'] <= attribution_end)
                    ]
                    
                    if not attributed_orders.empty:
                        # Only count orders that haven't been processed
                        for _, order in attributed_orders.iterrows():
                            order_id_key = (order['order_id'], order['line_item_id'])
                            
                            # Skip if we've already counted this order item
                            if order_id_key in processed_order_items:
                                continue
                                
                            # Add to campaign revenue and count
                            attributed_revenue += order['price']
                            attributed_orders_count += 1
                            
                            # Track daily sales
                            order_date = order['created_at'].date()
                            daily_sales[order_date] += order['price']
                            
                            # Mark this order as processed
                            processed_order_items.add(order_id_key)
                            campaign_processed_orders.add(order_id_key)
                    
                    # Process orders in extended window
                    extended_orders = order_items_df[
                        (order_items_df['product_id'] == product_id) & 
                        (order_items_df['created_at'] > attribution_end) & 
                        (order_items_df['created_at'] <= extended_end)
                    ]
                    
                    if not extended_orders.empty:
                        # Only count orders that haven't been processed
                        for _, order in extended_orders.iterrows():
                            order_id_key = (order['order_id'], order['line_item_id'])
                            
                            # Skip if we've already counted this order item
                            if order_id_key in processed_order_items:
                                continue
                                
                            # Add to extended revenue and count
                            extended_revenue += order['price']
                            extended_orders_count += 1
                            
                            # Mark this order as processed
                            processed_order_items.add(order_id_key)
                            campaign_processed_orders.add(order_id_key)
                else:
                    # If no exact match is found, try partial matching
                    potential_products = collection_map_df[collection_map_df['product_title'].str.contains(extracted_name, case=False, regex=False)]
                    
                    if not potential_products.empty:
                        product_id = potential_products['product_id'].iloc[0]
                        matched_product_ids.append(product_id)
                        product_names.append(potential_products['product_title'].iloc[0])
                        product_urls.append(potential_products['product_url'].iloc[0])
                        
                        # Process orders within attribution window
                        attributed_orders = order_items_df[
                            (order_items_df['product_id'] == product_id) & 
                            (order_items_df['created_at'] >= campaign_start_date) & 
                            (order_items_df['created_at'] <= attribution_end)
                        ]
                        
                        if not attributed_orders.empty:
                            # Only count orders that haven't been processed
                            for _, order in attributed_orders.iterrows():
                                order_id_key = (order['order_id'], order['line_item_id'])
                                
                                # Skip if we've already counted this order item
                                if order_id_key in processed_order_items:
                                    continue
                                    
                                # Add to campaign revenue and count
                                attributed_revenue += order['price']
                                attributed_orders_count += 1
                                
                                # Track daily sales
                                order_date = order['created_at'].date()
                                daily_sales[order_date] += order['price']
                                
                                # Mark this order as processed
                                processed_order_items.add(order_id_key)
                                campaign_processed_orders.add(order_id_key)
                        
                        # Process orders in extended window
                        extended_orders = order_items_df[
                            (order_items_df['product_id'] == product_id) & 
                            (order_items_df['created_at'] > attribution_end) & 
                            (order_items_df['created_at'] <= extended_end)
                        ]
                        
                        if not extended_orders.empty:
                            # Only count orders that haven't been processed
                            for _, order in extended_orders.iterrows():
                                order_id_key = (order['order_id'], order['line_item_id'])
                                
                                # Skip if we've already counted this order item
                                if order_id_key in processed_order_items:
                                    continue
                                    
                                # Add to extended revenue and count
                                extended_revenue += order['price']
                                extended_orders_count += 1
                                
                                # Mark this order as processed
                                processed_order_items.add(order_id_key)
                                campaign_processed_orders.add(order_id_key)
                    else:
                        # If no match is found, use the extracted name but mark it as having no sales data
                        product_names.append(f"{extracted_name} [No Sales Found]")
                        print(f"No sales data found for campaign: {campaign}, product: {extracted_name}")
        
        # Calculate financial metrics
        total_revenue = attributed_revenue
        total_orders = attributed_orders_count
        
        # Calculate COGS
        cogs = attributed_revenue * COGS_PERCENTAGE
        extended_cogs = extended_revenue * COGS_PERCENTAGE
        total_cogs = total_revenue * COGS_PERCENTAGE
        
        # Calculate gross profit
        attributed_gross_profit = attributed_revenue - cogs
        extended_gross_profit = extended_revenue - extended_cogs
        total_gross_profit = total_revenue - total_cogs
        
        # Calculate net profit (after ad spend)
        attributed_net_profit = attributed_gross_profit - spend
        total_net_profit = total_gross_profit - spend
        
        # Calculate ROI and ROAS
        attributed_roi = (attributed_net_profit / spend) * 100 if spend > 0 else np.nan
        total_roi = (total_net_profit / spend) * 100 if spend > 0 else np.nan
        
        attributed_roas = attributed_revenue / spend if spend > 0 else np.nan
        total_roas = total_revenue / spend if spend > 0 else np.nan
        
        # Calculate average selling price
        if attributed_orders_count > 0:
            attributed_avg_selling_price = attributed_revenue / attributed_orders_count
        else:
            attributed_avg_selling_price = 0
        
        if total_orders > 0:
            total_avg_selling_price = total_revenue / total_orders
        else:
            total_avg_selling_price = 0
        
        # Calculate conversion rate (if impression data available)
        impressions = int(campaign_data['impressions']) if 'impressions' in campaign_data else 0
        clicks = int(campaign_data['clicks']) if 'clicks' in campaign_data else 0
        
        click_through_rate = (clicks / impressions) * 100 if impressions > 0 else 0
        conversion_rate = (attributed_orders_count / clicks) * 100 if clicks > 0 else 0
        
        # Calculate percentage of revenue from extended window
        revenue_attribution_pct = (attributed_revenue / total_revenue) * 100 if total_revenue > 0 else 0
        extended_revenue_pct = (extended_revenue / total_revenue) * 100 if total_revenue > 0 else 0
        
        # Calculate CPA (Cost per Acquisition)
        cpa = spend / attributed_orders_count if attributed_orders_count > 0 else np.nan
        
        # Calculate Profit Margin (as a percentage)
        profit_margin_pct = (attributed_net_profit / attributed_revenue) * 100 if attributed_revenue > 0 else np.nan
        total_profit_margin_pct = (total_net_profit / total_revenue) * 100 if total_revenue > 0 else np.nan
        
        # Calculate Sales per Product (for campaigns with multiple products)
        sales_per_product = {}
        if isinstance(matched_product_ids, list) and len(matched_product_ids) > 0:
            for product_id in matched_product_ids:
                # Get all orders for this product in this campaign
                product_orders = []
                for order_id_key in campaign_processed_orders:
                    order_id, line_item_id = order_id_key
                    order_row = order_items_df[
                        (order_items_df['order_id'] == order_id) &
                        (order_items_df['line_item_id'] == line_item_id) &
                        (order_items_df['product_id'] == product_id)
                    ]
                    if not order_row.empty:
                        product_orders.append(order_row)
                
                if product_orders:
                    # Concatenate all product orders
                    product_orders_df = pd.concat(product_orders)
                    product_revenue = product_orders_df['price'].sum()
                    product_orders_count = len(product_orders_df)
                    
                    # Get the product title
                    product_row = collection_map_df[collection_map_df['product_id'] == product_id]
                    if not product_row.empty:
                        product_title = product_row['product_title'].iloc[0]
                        sales_per_product[product_title] = {
                            'revenue': product_revenue,
                            'orders': product_orders_count
                        }
        
        # Store results
        campaign_results[campaign] = {
            # Basic info
            'Product Name': product_names[0] if len(product_names) == 1 else product_names if product_names else None,
            'URL': product_url if "COLLECTION" in campaign else (product_urls[0] if product_urls and len(product_urls) > 0 else None),
            'Campaign Start': campaign_start_date,
            'Campaign End': attribution_end,
            'status': campaign_status_map.get(campaign, 'Unknown'),
            
            # Attribution window metrics
            'Attribution Revenue': attributed_revenue,
            'Attribution Orders': attributed_orders_count,
            'Attribution Avg Price': attributed_avg_selling_price,
            'Attribution COGS': cogs,
            'Attribution Gross Profit': attributed_gross_profit,
            'Attribution Net Profit': attributed_net_profit,
            'Attribution ROI (%)': attributed_roi,
            'Attribution ROAS': attributed_roas,
            
            # Extended window metrics
            'Extended Revenue': extended_revenue,
            'Extended Orders': extended_orders_count,
            
            # Total metrics
            'Total Revenue': total_revenue,
            'Total Orders': total_orders,
            'Total Avg Price': total_avg_selling_price,
            'Total COGS': total_cogs,
            'Total Gross Profit': total_gross_profit,
            'Total Net Profit': total_net_profit,
            'Total ROI (%)': total_roi,
            'Total ROAS': total_roas,
            
            # Ad metrics
            'Ad Spend': spend,
            'Impressions': impressions,
            'Clicks': clicks,
            'CTR (%)': click_through_rate,
            'Conversion Rate (%)': conversion_rate,
            
            # Analysis
            'Attribution Window Revenue (%)': revenue_attribution_pct,
            'Extended Window Revenue (%)': extended_revenue_pct,
            
            # New KPIs
            'CPA': cpa,
            'Profit Margin (%)': profit_margin_pct,
            'Total Profit Margin (%)': total_profit_margin_pct,
            'Sales per Product': sales_per_product,
            
            # Store daily sales data for trend analysis
            'Daily Sales': dict(daily_sales),
            'Matched Product IDs': matched_product_ids,
            
            # Store the processed order count for debugging
            'Processed Order Count': len(campaign_processed_orders)
        }
    
    # Split product lists into individual products
    campaign_results = split_product_lists(campaign_results)

    # Convert results to DataFrame
    campaign_analysis_df = pd.DataFrame.from_dict(campaign_results, orient='index')
    
    # Identify top performing ads
    top_ads = identify_top_performing_ads(campaign_analysis_df)
    
    # Create summary metrics
    summary = {
        'Total Ad Spend': campaign_analysis_df['Ad Spend'].sum() if not campaign_analysis_df.empty else 0,
        'Total Attribution Revenue': campaign_analysis_df['Attribution Revenue'].sum() if not campaign_analysis_df.empty else 0,
        'Total Extended Revenue': campaign_analysis_df['Extended Revenue'].sum() if not campaign_analysis_df.empty else 0,
        'Total Revenue': campaign_analysis_df['Total Revenue'].sum() if not campaign_analysis_df.empty else 0,
        'Total Attribution ROAS': campaign_analysis_df['Attribution Revenue'].sum() / campaign_analysis_df['Ad Spend'].sum() 
                                  if not campaign_analysis_df.empty and campaign_analysis_df['Ad Spend'].sum() > 0 else 0,
        'Total ROAS': campaign_analysis_df['Total Revenue'].sum() / campaign_analysis_df['Ad Spend'].sum() 
                      if not campaign_analysis_df.empty and campaign_analysis_df['Ad Spend'].sum() > 0 else 0,
        'Total Attribution Orders': campaign_analysis_df['Attribution Orders'].sum() if not campaign_analysis_df.empty else 0,
        'Total Extended Orders': campaign_analysis_df['Extended Orders'].sum() if not campaign_analysis_df.empty else 0,
        'Total Orders': campaign_analysis_df['Total Orders'].sum() if not campaign_analysis_df.empty else 0,
        'Average Attribution Window (%)': campaign_analysis_df['Attribution Window Revenue (%)'].mean() if not campaign_analysis_df.empty else 0,
        'Average Extended Window (%)': campaign_analysis_df['Extended Window Revenue (%)'].mean() if not campaign_analysis_df.empty else 0,
        'Average CPA': campaign_analysis_df['CPA'].mean() if not campaign_analysis_df.empty else 0,
        'Average Profit Margin (%)': campaign_analysis_df['Profit Margin (%)'].mean() if not campaign_analysis_df.empty else 0,
        'Top Performing Ads': top_ads,
        # Add refund metrics
        'Total Refunds': refund_analysis.get('total_refunds', 0),
        'Total Refund Value': refund_analysis.get('total_refund_value', 0),
        'Refund Rate': refund_analysis.get('refund_rate', 0),
        'Total Disputes': refund_analysis.get('total_disputes', 0),
        'Dispute Rate': refund_analysis.get('dispute_rate', 0),
        'Refund Value Percentage': refund_analysis.get('refund_value_percentage', 0),
        'Top Refund Reasons': refund_analysis.get('top_refund_reasons', [])
    }
    
    # Print debug information about order tracking
    print(f"\nORDER TRACKING SUMMARY:")
    print(f"Total unique order items processed: {len(processed_order_items)}")
    
    # Count total orders in the dataset for comparison
    total_orders_in_range = len(order_items_df[
        (order_items_df['created_at'] >= start_date) & 
        (order_items_df['created_at'] <= end_date)
    ])
    print(f"Total order items in date range: {total_orders_in_range}")
    
    # Print product-specific diagnostics
    product_order_counts = {}
    for product_id in order_items_df['product_id'].unique():
        if pd.isna(product_id):
            continue
            
        count = len(order_items_df[order_items_df['product_id'] == product_id])
        product_name = None
        product_row = collection_map_df[collection_map_df['product_id'] == product_id]
        if not product_row.empty:
            product_name = product_row['product_title'].iloc[0]
        
        if product_name:
            product_order_counts[product_name] = count
    
    print("\nTop products by order count in original data:")
    for product, count in sorted(product_order_counts.items(), key=lambda x: x[1], reverse=True)[:10]:
        print(f"{product}: {count} orders")
    
    return {
        'campaign_analysis': campaign_analysis_df,
        'summary': summary,
        'refund_analysis': refund_analysis
    }

#############################################
# MAIN FUNCTION
#############################################

def main():
    """Main function to run the consolidated e-commerce analysis"""
    parser = argparse.ArgumentParser(description='Consolidated E-commerce Analysis')
    parser.add_argument('--start_date', type=str, help='Start date in YYYY-MM-DD format', required=False)
    parser.add_argument('--end_date', type=str, help='End date in YYYY-MM-DD format', required=False)
    parser.add_argument('--days_back', type=int, default=30, help='Number of days to look back if no dates provided')
    parser.add_argument('--attribution_window', type=int, default=7, help='Attribution window in days')
    parser.add_argument('--extended_analysis', type=int, default=30, help='Extended analysis window in days')
    parser.add_argument('--cogs_percentage', type=float, default=0.4, help='COGS as percentage of revenue')
    parser.add_argument('--output_dir', type=str, default=".", help='Directory to save output files')
    parser.add_argument('--api_key', type=str, help='Shopify API Key')
    parser.add_argument('--password', type=str, help='Shopify API Password')
    parser.add_argument('--shop_name', type=str, help='Shopify Shop Name')
    
    args = parser.parse_args()
    
    # Set global parameters
    global ATTRIBUTION_WINDOW_DAYS, EXTENDED_ANALYSIS_DAYS, COGS_PERCENTAGE
    ATTRIBUTION_WINDOW_DAYS = args.attribution_window
    EXTENDED_ANALYSIS_DAYS = args.extended_analysis
    COGS_PERCENTAGE = args.cogs_percentage
    
    # Update Shopify credentials if provided
    if args.api_key or args.password or args.shop_name:
        update_shopify_url(
            api_key=args.api_key if args.api_key else None,
            password=args.password if args.password else None,
            shop_name=args.shop_name if args.shop_name else None
        )
    
    # Calculate date range
    if args.start_date and args.end_date:
        start_date = datetime.strptime(args.start_date, '%Y-%m-%d')
        end_date = datetime.strptime(args.end_date, '%Y-%m-%d')
    else:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=args.days_back)
    
    # Make start_date and end_date timezone aware
    try:
        # Try to add timezone info to dates if not present
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
    except Exception as e:
        print(f"Warning: Could not add timezone info to dates: {e}")
    
    print(f"\nRunning analysis from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    print(f"Attribution window: {ATTRIBUTION_WINDOW_DAYS} days")
    print(f"Extended analysis window: {EXTENDED_ANALYSIS_DAYS} days")
    print(f"COGS percentage: {COGS_PERCENTAGE * 100}%")
    
    # Create output directory if it doesn't exist
    if not os.path.exists(args.output_dir):
        os.makedirs(args.output_dir)
    
    # Get Shopify data
    print("\n=== FETCHING SHOPIFY DATA ===")
    shopify_data = get_shopify_data(start_date, end_date)
    
    # Get Facebook Ads data
    print("\n=== FETCHING FACEBOOK ADS DATA ===")
    fb_analyzer = FacebookAdAnalyzer(FB_AD_ACCOUNT_ID, FB_ACCESS_TOKEN)
    facebook_data = fb_analyzer.get_facebook_data(start_date, end_date)
    
    # Analyze data
    print("\n=== ANALYZING CAMPAIGN DATA ===")
    analysis_results = analyze_campaign_data(facebook_data, shopify_data, start_date, end_date)
    
    # Add total revenue summary from Shopify data
    analysis_results = add_total_revenue_summary(shopify_data, analysis_results)
    
    print("\nNote: Product lists have been split into individual products with distributed metrics.")
    
    # Create output files
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    create_output_files(analysis_results, timestamp, args.output_dir)
    
    print("\nAnalysis completed successfully!")

if __name__ == "__main__":
    main()