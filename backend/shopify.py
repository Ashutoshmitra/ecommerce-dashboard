import pandas as pd
import requests
import time
import json
import os
from datetime import datetime, timedelta

#############################################
# CONFIGURATION SECTION
#############################################

# Shopify API Credentials - HARDCODED
SHOPIFY_API_KEY = "bde60ad1c6d0cfa966dee4b38d98c9ef"
SHOPIFY_PASSWORD = "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"
SHOPIFY_SHOP_NAME = "dd3662-08"

# Shopify Base URL
SHOPIFY_URL = f"https://{SHOPIFY_API_KEY}:{SHOPIFY_PASSWORD}@{SHOPIFY_SHOP_NAME}.myshopify.com/admin/api/2023-10"

# Analysis settings
DAYS_BACK = 600  # Get data for the last 30 days
OUTPUT_DIR = "./output"  # Directory to save output files

#############################################
# SHOPIFY API FUNCTIONS
#############################################

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
    print("Fetching custom collections...")
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
    print("Fetching smart collections...")
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
    
    print(f"Total collections fetched: {len(all_collections)}")
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
    print("Mapping collections to products...")

    # Get all products
    all_products = get_all_products()
    
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
    print("Processing order data...")
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
    print("Analyzing refund data...")
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

def save_output_to_csv(data, output_dir="./output"):
    """Save the fetched Shopify data to CSV files"""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Create output directory if it doesn't exist
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
    
    # Save collection-product mapping
    collection_product_df = pd.DataFrame(data['collection_product_mapping'])
    collection_product_df.to_csv(f"{output_dir}/collection_product_mapping_{timestamp}.csv", index=False)
    
    # Save order summary
    order_summary_df = pd.DataFrame(data['order_summary'])
    order_summary_df.to_csv(f"{output_dir}/order_summary_{timestamp}.csv", index=False)
    
    # Save order items
    order_items_df = pd.DataFrame(data['order_items'])
    order_items_df.to_csv(f"{output_dir}/order_items_{timestamp}.csv", index=False)
    
    # Save refunds
    refunds_df = pd.DataFrame(data['refunds'])
    refunds_df.to_csv(f"{output_dir}/refunds_{timestamp}.csv", index=False)
    
    # Save refund analysis as JSON
    with open(f"{output_dir}/refund_analysis_{timestamp}.json", 'w') as f:
        json.dump(data['refund_analysis'], f, indent=4)
    
    print(f"\nData saved to {output_dir} directory with timestamp {timestamp}")
    return timestamp

def main():
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=DAYS_BACK)
    
    # Make dates timezone aware
    try:
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=datetime.now().astimezone().tzinfo)
    except Exception as e:
        print(f"Warning: Could not add timezone info to dates: {e}")
    
    print(f"\nExtracting Shopify data from {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}")
    
    # Get Shopify data
    shopify_data = get_shopify_data(start_date, end_date)
    
    # Save data to CSV files
    timestamp = save_output_to_csv(shopify_data, OUTPUT_DIR)
    
    # Print summary
    print("\n=== SHOPIFY DATA EXTRACTION SUMMARY ===")
    print(f"Collections: {len(shopify_data['collection_product_mapping'])}")
    print(f"Unique Products: {len(set(item['product_id'] for item in shopify_data['collection_product_mapping']))}")
    print(f"Orders: {len(shopify_data['order_summary'])}")
    print(f"Order Items: {len(shopify_data['order_items'])}")
    print(f"Refunds: {len(shopify_data['refunds'])}")
    print(f"Refund Rate: {shopify_data['refund_analysis']['refund_rate']:.2f}%")
    print(f"Total Revenue: {sum(order['total_price'] for order in shopify_data['order_summary']):.2f}")
    print(f"Total Refund Value: {shopify_data['refund_analysis']['total_refund_value']:.2f}")
    
    print("\nData extraction completed successfully!")

if __name__ == "__main__":
    main()